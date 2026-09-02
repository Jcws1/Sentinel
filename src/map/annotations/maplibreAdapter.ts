import type maplibregl from 'maplibre-gl'

import { annotationStore } from '@/state/annotations'
import { cursorModeStore } from '@/state/cursorMode'
import { selectByBounds } from '@/state/selection'
import { subscribeSelector } from '@/state/createStore'
import { getCursorMode } from '../cursorModes'
import { toFeatureCollection } from './geojson'
import {
  drawKindFor,
  handleClick,
  handleMove,
  handleDoubleClick,
} from './drawController'
import {
  canEditIn,
  beginVertexDrag,
  dragVertexTo,
  endVertexDrag,
  isDraggingVertex,
} from './editController'

/* ===========================================================================
   MAPLIBRE ADAPTER

   One GeoJSON source, four layers, and pointer handlers that only do anything
   while a draw tool is active.

   COLOUR: white ramp only, no signal palette. The console's rule is that
   colour means something is true about the mission — an operator sketching a
   zone has not made anything true yet. Drawing these monochrome also keeps
   the upgrade path clean: when the policy layer lands, a *violated* zone can
   turn --color-signal-critical and it will read instantly, precisely because
   nothing else on screen spent the colour.
=========================================================================== */

const SOURCE_ID = 'sentinel-annotations'

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/**
 * Add the source and layers to a freshly loaded style.
 *
 * Called after every setStyle: MapLibre discards all sources and layers on a
 * style swap, so annotations have to be re-added or they vanish when the
 * operator changes basemap pack.
 */
export function installAnnotationLayers(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return

  // promoteId lifts each vertex's `fid` to the feature id, which is what
  // setFeatureState needs to key on. Without it the hover highlight would have
  // to rely on auto-generated positional ids, and those shift whenever an
  // annotation gains or loses a vertex.
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: EMPTY,
    promoteId: 'fid',
  })

  map.addLayer({
    id: 'annotations-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'role'], 'fill'],
    paint: {
      'fill-color': '#ffffff',
      // Low enough that the map underneath stays readable through a zone —
      // a geofence is context for what it contains, not a mask over it.
      'fill-opacity': 0.07,
    },
  })

  map.addLayer({
    id: 'annotations-line',
    type: 'line',
    source: SOURCE_ID,
    filter: ['in', ['get', 'role'], ['literal', ['line', 'fill']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': 1.5,
      'line-opacity': 0.85,
      // Dashed while drawing, solid once committed: the operator can tell at
      // a glance whether what they see is provisional.
      'line-dasharray': [
        'case',
        ['==', ['get', 'draft'], true],
        ['literal', [2, 2]],
        ['literal', [1]],
      ],
    },
  })

  map.addLayer({
    id: 'annotations-vertex',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['in', ['get', 'role'], ['literal', ['vertex', 'point']]],
    paint: {
      // Resting size is unchanged; only the vertex under the pointer grows.
      // A dot that is always big enough to grab easily is a dot that clutters
      // the map the other 99% of the time — the grab tolerance lives in the
      // hit test instead (GRAB_PX), where it costs nothing visually.
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        6,
        ['==', ['get', 'role'], 'point'],
        5,
        3,
      ],
      'circle-color': '#0a0b0d',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2,
        1.5,
      ],
      'circle-opacity': 1,
    },
  })

  map.addLayer({
    id: 'annotations-label',
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'role'], 'label'],
    layout: {
      'text-field': [
        'case',
        ['==', ['get', 'measurement'], ''],
        ['get', 'label'],
        ['concat', ['get', 'label'], '  ', ['get', 'measurement']],
      ],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, -1.2],
      'text-anchor': 'bottom',
      // Always visible, never decluttered away. These are the operator's own
      // marks: hiding one because it collided would read as the annotation
      // having been lost. Wide enough that a readout stays on one line —
      // "12.4 km · 130°T" wrapping mid-value is worse than it being long.
      'text-allow-overlap': true,
      'text-max-width': 20,
      'text-letter-spacing': 0.02,
    },
    paint: {
      'text-color': '#ffffff',
      // Same halo treatment as the basemap labels, so annotations read over
      // any imagery without introducing a second visual language.
      'text-halo-color': '#06070a',
      'text-halo-width': 1.4,
    },
  })
}

/** Push current store contents into the source. Safe before the source exists. */
export function redrawAnnotations(map: maplibregl.Map) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
  if (!source) return
  const { items, draft } = annotationStore.get()
  source.setData(toFeatureCollection(items, draft))
}

/**
 * Box-select marquee.
 *
 * A DOM rectangle, not a map feature: it is a screen-space gesture, and
 * drawing it as geometry would mean re-projecting a shape on every frame that
 * is only ever meant to be a box on the glass.
 */
function attachMarquee(map: maplibregl.Map): () => void {
  const canvas = map.getCanvasContainer()
  let start: { x: number; y: number } | null = null
  let box: HTMLDivElement | null = null

  const clear = () => {
    box?.remove()
    box = null
    start = null
  }

  const onPointerDown = (e: MouseEvent) => {
    if (cursorModeStore.get() !== 'boxSelect' || e.button !== 0) return
    const rect = canvas.getBoundingClientRect()
    start = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    box = document.createElement('div')
    // Same hairline-and-wash language as an annotation: this is the operator
    // acting on the map, not the system reporting something.
    box.style.cssText =
      'position:absolute;pointer-events:none;z-index:5;' +
      'border:1px solid rgba(255,255,255,0.85);' +
      'background:rgba(255,255,255,0.07);'
    canvas.appendChild(box)
  }

  const onPointerMove = (e: MouseEvent) => {
    if (!start || !box) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    box.style.left = `${Math.min(start.x, x)}px`
    box.style.top = `${Math.min(start.y, y)}px`
    box.style.width = `${Math.abs(x - start.x)}px`
    box.style.height = `${Math.abs(y - start.y)}px`
  }

  const onPointerUp = (e: MouseEvent) => {
    if (!start) return
    const rect = canvas.getBoundingClientRect()
    const end = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const dragged = Math.abs(end.x - start.x) > 3 && Math.abs(end.y - start.y) > 3
    const from = start
    clear()
    if (!dragged) return

    const a = map.unproject([from.x, from.y])
    const b = map.unproject([end.x, end.y])
    selectByBounds([
      Math.min(a.lng, b.lng),
      Math.min(a.lat, b.lat),
      Math.max(a.lng, b.lng),
      Math.max(a.lat, b.lat),
    ])
  }

  canvas.addEventListener('mousedown', onPointerDown)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)

  return () => {
    clear()
    canvas.removeEventListener('mousedown', onPointerDown)
    window.removeEventListener('mousemove', onPointerMove)
    window.removeEventListener('mouseup', onPointerUp)
  }
}

/**
 * Grab radius in pixels.
 *
 * A vertex draws at 3px. Requiring a click inside 3px is a target an operator
 * misses repeatedly, so the hit test queries a box this size around the
 * pointer while the dot stays small.
 */
const GRAB_PX = 8

interface VertexHit {
  fid: string
  id: string
  index: number
}

/**
 * Vertex editing: press a committed annotation's point and drag it.
 *
 * Draft vertices are excluded for free — they carry no `fid`, so the find
 * below never matches one.
 */
function attachVertexEditing(map: maplibregl.Map): () => void {
  let hovered: string | null = null
  // Tracked separately from isDraggingVertex(): Escape ends the drag in the
  // controller while the button is still physically down, and the cursor still
  // has to be put back when it is finally released.
  let pressed = false

  const setHover = (fid: string | null) => {
    if (hovered === fid) return
    if (hovered) map.setFeatureState({ source: SOURCE_ID, id: hovered }, { hover: false })
    if (fid) map.setFeatureState({ source: SOURCE_ID, id: fid }, { hover: true })
    hovered = fid
  }

  // Restore whatever the active tool asks for, rather than a hardcoded
  // 'default' — the mode can change mid-drag, and writing a literal here would
  // strand the wrong cursor on the map.
  const restoreCursor = () => {
    map.getCanvas().style.cursor = getCursorMode(cursorModeStore.get()).cursor
  }

  const vertexAt = (point: maplibregl.Point): VertexHit | null => {
    if (!map.getLayer('annotations-vertex')) return null

    const features = map.queryRenderedFeatures(
      [
        [point.x - GRAB_PX, point.y - GRAB_PX],
        [point.x + GRAB_PX, point.y + GRAB_PX],
      ],
      { layers: ['annotations-vertex'] },
    )

    const hit = features.find(
      (f) => typeof f.properties?.fid === 'string' && f.properties?.draft !== true,
    )
    if (!hit) return null

    return {
      fid: hit.properties!.fid as string,
      id: hit.properties!.id as string,
      index: Number(hit.properties!.index),
    }
  }

  const onMouseDown = (e: maplibregl.MapMouseEvent) => {
    if (!canEditIn(cursorModeStore.get())) return

    const hit = vertexAt(e.point)
    if (!hit) return

    const origin = annotationStore
      .get()
      .items.find((a) => a.id === hit.id)?.positions[hit.index]
    if (!origin) return

    // Suppresses MapLibre's drag-pan for THIS gesture only. Toggling
    // map.dragPan instead would race the cursor-mode effect in MapCanvas,
    // which writes the same flag whenever the tool changes.
    e.preventDefault()

    beginVertexDrag(hit.id, hit.index, origin)
    setHover(hit.fid)
    pressed = true
    map.getCanvas().style.cursor = 'grabbing'
  }

  // Hover feedback only — the drag itself listens on the window, below.
  const onMapMouseMove = (e: maplibregl.MapMouseEvent) => {
    if (isDraggingVertex()) return
    if (!canEditIn(cursorModeStore.get())) {
      setHover(null)
      return
    }

    const hit = vertexAt(e.point)
    setHover(hit?.fid ?? null)
    map.getCanvas().style.cursor = hit ? 'grab' : getCursorMode(cursorModeStore.get()).cursor
  }

  // On the window, not the map: a drag that strays off the canvas and comes
  // back must keep tracking, and one released outside the window must still
  // end rather than leaving the vertex glued to the pointer.
  const onWindowMouseMove = (e: MouseEvent) => {
    if (!isDraggingVertex()) return
    const rect = map.getCanvas().getBoundingClientRect()
    const point = map.unproject([e.clientX - rect.left, e.clientY - rect.top])
    dragVertexTo([point.lng, point.lat])
  }

  const onWindowMouseUp = () => {
    if (!pressed) return
    pressed = false
    // May already be false if Escape cancelled the drag while the button was
    // held; endVertexDrag is a no-op then, and the cursor still gets restored.
    endVertexDrag()
    restoreCursor()
  }

  map.on('mousedown', onMouseDown)
  map.on('mousemove', onMapMouseMove)
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)

  return () => {
    if (isDraggingVertex()) endVertexDrag()
    setHover(null)
    map.off('mousedown', onMouseDown)
    map.off('mousemove', onMapMouseMove)
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
  }
}

/**
 * Wire pointer input and store-driven redraws.
 *
 * Returns a teardown. Handlers are attached once and gate on the active
 * cursor mode internally rather than being added and removed as the mode
 * changes — fewer listener lifecycles to get wrong, and the gate is a single
 * map lookup.
 */
export function attachAnnotationInput(map: maplibregl.Map): () => void {
  const onClick = (e: maplibregl.MapMouseEvent) => {
    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    handleClick(mode, [e.lngLat.lng, e.lngLat.lat])
  }

  const onMove = (e: maplibregl.MapMouseEvent) => {
    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    handleMove(mode, [e.lngLat.lng, e.lngLat.lat])
  }

  const onDoubleClick = (e: maplibregl.MapMouseEvent) => {
    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    // Stop MapLibre's own double-click zoom, which would otherwise fire on
    // the same gesture that ends the drawing.
    e.preventDefault()
    handleDoubleClick(mode)
  }

  map.on('click', onClick)
  map.on('mousemove', onMove)
  map.on('dblclick', onDoubleClick)

  const detachMarquee = attachMarquee(map)
  const detachEditing = attachVertexEditing(map)

  redrawAnnotations(map)

  // One integer, bumped by every mutation. The previous key was built from
  // item count, ids and labels and so contained no geometry — moving a vertex
  // left it identical and the redraw never ran.
  const unsubscribe = subscribeSelector(
    annotationStore,
    (s) => s.revision,
    () => redrawAnnotations(map),
  )

  return () => {
    unsubscribe()
    detachMarquee()
    detachEditing()
    map.off('click', onClick)
    map.off('mousemove', onMove)
    map.off('dblclick', onDoubleClick)
  }
}
