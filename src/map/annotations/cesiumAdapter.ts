import * as Cesium from 'cesium'

import { annotationStore } from '@/state/annotations'
import { cursorModeStore } from '@/state/cursorMode'
import { subscribeSelector } from '@/state/createStore'
import { measurementFor } from './geojson'
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
import type { Annotation, AnnotationDraft } from './types'
import type { LngLat } from '@/lib/geo'

/* ===========================================================================
   CESIUM ADAPTER

   Same store, same draw controller, different renderer. Only ever imported
   from photorealCesium.ts, which is itself dynamically imported — so this and
   Cesium stay out of the offline bundle.

   The two things that make annotations look right on a photogrammetry mesh:

   1. classificationType CESIUM_3D_TILE — zones are DRAPED onto the mesh
      rather than drawn as a flat sheet at some fixed altitude. Without it a
      geofence floats through buildings instead of painting the ground, which
      is the difference between this and the God's Eye reference.
   2. scene.pickPosition against the tileset — globe.pick is unavailable
      because the photoreal mode hides the globe, so a click has to be
      resolved against the mesh's depth buffer.
=========================================================================== */

const WHITE = Cesium.Color.WHITE

/** Screen position → ground position on the mesh, or null if nothing was hit. */
function pickLngLat(
  viewer: Cesium.Viewer,
  windowPosition: Cesium.Cartesian2,
): LngLat | null {
  if (!viewer.scene.pickPositionSupported) return null

  const cartesian = viewer.scene.pickPosition(windowPosition)
  if (!Cesium.defined(cartesian)) return null

  const carto = Cesium.Cartographic.fromCartesian(cartesian)
  if (!carto) return null

  return [
    Cesium.Math.toDegrees(carto.longitude),
    Cesium.Math.toDegrees(carto.latitude),
  ]
}

function toCartesians(positions: readonly LngLat[]): Cesium.Cartesian3[] {
  return positions.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat))
}

/**
 * Entity id for a draggable vertex handle.
 *
 * `#v` rather than a bare separator: annotation ids already contain hyphens
 * ("zone-mtjj3wtz-18q63"), and the zone outline already claims "-outline".
 */
function vertexEntityId(id: string, index: number): string {
  return `${id}#v${index}`
}

/** Parse a picked entity id back into an annotation and vertex index. */
function parseVertexEntityId(
  entityId: unknown,
): { id: string; index: number } | null {
  if (typeof entityId !== 'string') return null
  const marker = entityId.lastIndexOf('#v')
  if (marker === -1) return null

  const index = Number(entityId.slice(marker + 2))
  if (!Number.isInteger(index) || index < 0) return null

  return { id: entityId.slice(0, marker), index }
}

/**
 * Add an entity, or update the parts of an existing one that change.
 *
 * NEVER remove-and-re-add under the same id. Cesium's EntityCollection treats
 * a remove followed by an add of the same id as a no-op — with events
 * suspended it emits nothing at all, and even unsuspended it churns the
 * primitive — so the visualiser keeps rendering the *old* Entity object and
 * never learns about the new one. That is silent: the collection holds correct
 * data, `getById` returns the new entity, and the screen shows the old
 * geometry or nothing. It is what made drawing and dragging invisible here
 * while every data-level assertion passed.
 *
 * Mutating in place instead routes changes through `definitionChanged`, which
 * the visualiser does act on, and rebuilds only the one geometry that moved.
 */
function upsert(
  viewer: Cesium.Viewer,
  id: string,
  create: () => Cesium.Entity.ConstructorOptions,
  update: (entity: Cesium.Entity) => void,
) {
  const existing = viewer.entities.getById(id)
  if (existing) {
    update(existing)
    return
  }
  viewer.entities.add({ id, ...create() })
}

const HANDLE_POINT: Cesium.PointGraphics.ConstructorOptions = {
  pixelSize: 9,
  color: Cesium.Color.fromCssColorString('#0a0b0d'),
  outlineColor: WHITE,
  outlineWidth: 2,
  // Always on top of the mesh, so a handle on the far side of a building is
  // still visible and still pickable.
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
}

/**
 * Draggable vertex dots.
 *
 * Cesium drew none of these before editing existed — a zone was a fill, an
 * outline and a label. You cannot grab what is not rendered, so handles are a
 * prerequisite for editing here, and they bring the photoreal view to parity
 * with what MapLibre already showed.
 */
function syncVertexHandles(
  viewer: Cesium.Viewer,
  annotation: Annotation,
  keep: Set<string>,
) {
  const carts = toCartesians(annotation.positions)

  carts.forEach((position, index) => {
    const id = vertexEntityId(annotation.id, index)
    keep.add(id)
    upsert(
      viewer,
      id,
      () => ({ position, point: HANDLE_POINT }),
      (entity) => {
        entity.position = new Cesium.ConstantPositionProperty(position)
      },
    )
  })
}

function labelGraphics(text: string): Cesium.LabelGraphics.ConstructorOptions {
  return {
    text,
    font: '500 13px "Inter", system-ui, sans-serif',
    fillColor: WHITE,
    // Matches the basemap label treatment so annotations read the same in
    // both renderers rather than looking like a different product.
    outlineColor: Cesium.Color.fromCssColorString('#06070a'),
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -12),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  }
}

/** Ground-draped line styling, shared by committed geometry and zone outlines. */
const LINE_GRAPHICS = {
  width: 2,
  material: WHITE.withAlpha(0.85),
  clampToGround: true,
  classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
} satisfies Cesium.PolylineGraphics.ConstructorOptions

function syncAnnotation(
  viewer: Cesium.Viewer,
  annotation: Annotation,
  keep: Set<string>,
) {
  const { id, kind, label } = annotation
  const text = [label, measurementFor(annotation)].filter(Boolean).join('  ')
  const carts = toCartesians(annotation.positions)
  const anchor = carts[carts.length - 1]!

  if (kind === 'waypoint') {
    // Carries the vertex id, not the bare annotation id: a waypoint's single
    // dot IS its handle, so one entity is both the mark and the grab target.
    const pointId = vertexEntityId(id, 0)
    keep.add(pointId)
    upsert(
      viewer,
      pointId,
      () => ({
        position: carts[0]!,
        point: { ...HANDLE_POINT, pixelSize: 10 },
        label: labelGraphics(text),
      }),
      (entity) => {
        entity.position = new Cesium.ConstantPositionProperty(carts[0]!)
        if (entity.label) entity.label.text = new Cesium.ConstantProperty(text)
      },
    )
    return
  }

  keep.add(id)

  if (kind === 'zone') {
    upsert(
      viewer,
      id,
      () => ({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(carts),
          // Heavier than the MapLibre fill (0.07): that sits on a near-black
          // basemap, this sits on bright aerial imagery where the same alpha
          // disappears entirely.
          material: WHITE.withAlpha(0.22),
          // Drape onto the photoreal mesh — see the note at the top.
          classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
        },
        label: labelGraphics(text),
        position: anchor,
      }),
      (entity) => {
        if (entity.polygon) {
          entity.polygon.hierarchy = new Cesium.ConstantProperty(
            new Cesium.PolygonHierarchy(carts),
          )
        }
        if (entity.label) entity.label.text = new Cesium.ConstantProperty(text)
        entity.position = new Cesium.ConstantPositionProperty(anchor)
      },
    )

    const outlineId = `${id}-outline`
    const ring = [...carts, carts[0]!]
    keep.add(outlineId)
    upsert(
      viewer,
      outlineId,
      () => ({ polyline: { ...LINE_GRAPHICS, positions: ring } }),
      (entity) => {
        if (entity.polyline) {
          entity.polyline.positions = new Cesium.ConstantProperty(ring)
        }
      },
    )

    syncVertexHandles(viewer, annotation, keep)
    return
  }

  upsert(
    viewer,
    id,
    () => ({
      polyline: { ...LINE_GRAPHICS, positions: carts },
      label: labelGraphics(text),
      position: anchor,
    }),
    (entity) => {
      if (entity.polyline) {
        entity.polyline.positions = new Cesium.ConstantProperty(carts)
      }
      if (entity.label) entity.label.text = new Cesium.ConstantProperty(text)
      entity.position = new Cesium.ConstantPositionProperty(anchor)
    },
  )

  syncVertexHandles(viewer, annotation, keep)
}

const DRAFT_ID = 'annotation-draft'

function syncDraft(
  viewer: Cesium.Viewer,
  draft: AnnotationDraft,
  keep: Set<string>,
) {
  const path = draft.cursor
    ? [...draft.positions, draft.cursor]
    : draft.positions
  if (path.length < 2) return

  const closed = draft.kind === 'zone' && path.length >= 3
  const positions = toCartesians(closed ? [...path, path[0]!] : path)

  keep.add(DRAFT_ID)
  upsert(
    viewer,
    DRAFT_ID,
    () => ({
      polyline: {
        positions,
        width: 2,
        // Dashed while provisional, matching the MapLibre adapter.
        material: new Cesium.PolylineDashMaterialProperty({
          color: WHITE.withAlpha(0.9),
          dashLength: 12,
        }),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.CESIUM_3D_TILE,
      },
    }),
    (entity) => {
      if (entity.polyline) {
        entity.polyline.positions = new Cesium.ConstantProperty(positions)
      }
    },
  )
}

/**
 * Mirror the annotation store into Cesium entities and wire pointer input.
 *
 * Reconciled by id, not rebuilt wholesale. An earlier version cleared the
 * collection and re-added everything on each change, which is fine when
 * annotations only appear and disappear — but drawing and dragging move the
 * SAME id sixty times a second, and Cesium collapses a remove-then-add of one
 * id into no change at all. The visualiser was never told, so the rubber band
 * and every dragged vertex stayed invisible or frozen while the underlying
 * entities held perfectly correct data.
 */
export function attachCesiumAnnotations(viewer: Cesium.Viewer): () => void {
  const controller = viewer.scene.screenSpaceCameraController

  function render() {
    if (viewer.isDestroyed()) return

    const { items, draft } = annotationStore.get()
    const keep = new Set<string>()

    for (const item of items) syncAnnotation(viewer, item, keep)
    if (draft) syncDraft(viewer, draft, keep)

    // Drop only what genuinely went away — a deleted annotation, a finished
    // draft, or a vertex count that shrank. Everything else is updated in
    // place above and must never be removed, or it would be re-added under the
    // same id and stop rendering.
    for (const entity of viewer.entities.values.slice()) {
      if (!keep.has(entity.id)) viewer.entities.remove(entity)
    }
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

  /* ---- vertex editing -------------------------------------------------- */

  // Cesium has no per-gesture preventDefault, so camera input is switched off
  // for the duration of the drag. Without this every vertex drag also orbits
  // the camera: photorealCesium remaps rotateEventTypes to LEFT_DRAG.
  const releaseCamera = () => {
    controller.enableInputs = true
  }

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    if (!canEditIn(cursorModeStore.get())) return

    const picked = viewer.scene.pick(event.position)
    if (!Cesium.defined(picked)) return

    // scene.pick puts the owning Entity on `.id`, but a primitive can carry a
    // bare string there instead — accept both rather than assume.
    const owner: unknown = picked?.id
    const vertex = parseVertexEntityId(
      typeof owner === 'string' ? owner : (owner as Cesium.Entity | undefined)?.id,
    )
    if (!vertex) return

    const origin = annotationStore
      .get()
      .items.find((a) => a.id === vertex.id)?.positions[vertex.index]
    if (!origin) return

    beginVertexDrag(vertex.id, vertex.index, origin)
    controller.enableInputs = false
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

  handler.setInputAction(() => {
    // Runs even when Escape already ended the drag while the button was held,
    // so camera input is always handed back.
    endVertexDrag()
    releaseCamera()
  }, Cesium.ScreenSpaceEventType.LEFT_UP)

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    const position = pickLngLat(viewer, event.position)
    if (position) handleClick(mode, position)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
    if (isDraggingVertex()) {
      const position = pickLngLat(viewer, event.endPosition)
      if (position) dragVertexTo(position)
      return
    }

    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    const position = pickLngLat(viewer, event.endPosition)
    if (position) handleMove(mode, position)
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  handler.setInputAction(() => {
    const mode = cursorModeStore.get()
    if (!drawKindFor(mode)) return
    handleDoubleClick(mode)
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

  render()

  // One integer, bumped by every mutation — see the note in annotations.ts.
  // The signature this replaced carried no geometry, so a moved vertex looked
  // identical to it and never repainted.
  const unsubscribe = subscribeSelector(annotationStore, (s) => s.revision, render)

  return () => {
    unsubscribe()
    if (isDraggingVertex()) endVertexDrag()
    if (!viewer.isDestroyed()) releaseCamera()
    if (!handler.isDestroyed()) handler.destroy()
    if (!viewer.isDestroyed()) viewer.entities.removeAll()
  }
}
