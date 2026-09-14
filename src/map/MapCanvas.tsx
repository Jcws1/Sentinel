import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { MapboxOverlay } from '@deck.gl/mapbox'

import { HOME_CAMERA, PHOTOREAL_MIN_ZOOM, getPack, keyFor } from './sources'
import { buildMapStyle } from './mapStyle'
import { getViewMode } from './viewModes'
import {
  mapViewStore,
  setMapReady,
  setMapError,
  setMapPack,
  setPhotorealAttribution,
  setPhotorealRoute,
  setPhotorealTiles,
} from '@/state/mapView'
import { getCursorMode } from './cursorModes'
import { cursorModeStore } from '@/state/cursorMode'
import { subscribeSelector } from '@/state/createStore'
import { registerRecenter } from './cameraControl'
import { attachAircraftOverlay } from './aircraftOverlay'
import { useStoreSelector } from '@/state/createStore'
import { operationsStore } from '@/state/operations'
import {
  installAnnotationLayers,
  attachAnnotationInput,
  redrawAnnotations,
} from './annotations/maplibreAdapter'

/**
 * Register the pmtiles:// protocol exactly once per document.
 *
 * MapLibre keeps protocol handlers in module-level global state, so
 * registering twice throws. React 18+ StrictMode double-invokes effects in
 * development, which makes that a certainty rather than a risk.
 */
let protocolRegistered = false
function registerPmtilesProtocol() {
  if (protocolRegistered) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocolRegistered = true
}

/**
 * The map layer.
 *
 * Mounted once for the life of the console and never unmounted by chrome —
 * a WebGL context plus a loaded style is expensive to rebuild, and losing it
 * on a panel toggle would drop the operator's camera. Everything that changes
 * about the map is applied to the live instance rather than by remounting.
 *
 * The instance is held in a ref and driven by direct store subscriptions, not
 * React state: when telemetry lands at 20Hz, overlay updates must not pass
 * through a render.
 */
export function MapCanvas() {
  const wedgetailPhase = useStoreSelector(operationsStore, (state) => state.wedgetail.phase)
  const wedgetailMode = useStoreSelector(operationsStore, (state) => state.wedgetail.mode)
  const containerRef = useRef<HTMLDivElement>(null)
  const cesiumContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const cesiumRef = useRef<{ destroy: () => void; recenter: () => void } | null>(
    null,
  )

  // ---- Create the map once -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    registerPmtilesProtocol()

    const map = new maplibregl.Map({
      container: containerRef.current,
      // An empty style first: the real one is built asynchronously below, and
      // starting from a valid empty style avoids MapLibre's default fetch of
      // a demo style we do not want on an edge node.
      style: { version: 8, sources: {}, layers: [] },
      center: HOME_CAMERA.center,
      zoom: HOME_CAMERA.zoom,
      bearing: HOME_CAMERA.bearing,
      pitch: HOME_CAMERA.pitch,
      maxPitch: 75,
      attributionControl: false,
      // The console owns its own keyboard bindings; MapLibre's would swallow
      // the cursor-mode letters and pan the map instead.
      keyboard: false,
      // Chrome overlays the map rather than resizing it, so let MapLibre skip
      // its ResizeObserver work on every panel toggle.
      trackResize: true,
    })

    mapRef.current = map

    // Dev-only handle. A map is close to impossible to debug without one —
    // camera, style and terrain state are all locked inside the instance.
    // Stripped from production builds by the DEV guard.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __map?: maplibregl.Map }).__map = map
    }

    const overlay = new MapboxOverlay({
      // NOT interleaved.
      //
      // Interleaved mode shares MapLibre's WebGL program cache so deck.gl
      // layers can be depth-sorted against the basemap's own 3D geometry.
      // That is what we want — an interceptor track behind a tower should be
      // occluded by it — but it is incompatible with MapLibre's terrain depth
      // pass: `terrainDepth` throws on every frame reading shaderPreludeCode
      // from a program deck.gl has swapped out.
      //
      // Terrain is the feature that was asked for, so overlaid mode wins.
      // Cost: deck.gl layers paint on top of buildings rather than being
      // occluded by them. Revisit when real overlay layers land — the choice
      // is one flag, and by then deck.gl may have closed the gap.
      interleaved: false,
      layers: [],
    })
    map.addControl(overlay as unknown as maplibregl.IControl)
    overlayRef.current = overlay

    map.on('error', (event) => {
      // MapLibre reports missing tiles as errors too; only surface things that
      // actually broke the style.
      const message = event.error?.message ?? 'Unknown map error'
      if (message.includes('Failed to fetch')) setMapError(message)
    })

    // Annotation input lives for the life of the map, not the style. The
    // handlers gate on the active cursor mode internally, so there is no
    // listener churn as the operator switches tools.
    const detachAnnotations = attachAnnotationInput(map)
    const detachAircraft = attachAircraftOverlay(map)

    return () => {
      detachAnnotations()
      detachAircraft()
      overlayRef.current?.finalize()
      overlayRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---- Apply pack + view mode ---------------------------------------------
  useEffect(() => {
    let cancelled = false

    /** Destroy the Cesium viewer if one is up. Safe to call unconditionally. */
    async function teardownCesium() {
      if (!cesiumRef.current) return
      cesiumRef.current.destroy()
      cesiumRef.current = null
    }

    /**
     * Swap which renderer is on screen.
     *
     * Visibility rather than mount/unmount: tearing down MapLibre would drop
     * a WebGL context and the camera with it, and rebuilding both on every
     * toggle is exactly the cost the frame architecture exists to avoid.
     */
    function setCesiumVisible(visible: boolean) {
      if (containerRef.current) {
        containerRef.current.style.visibility = visible ? 'hidden' : 'visible'
      }
      if (cesiumContainerRef.current) {
        cesiumContainerRef.current.style.display = visible ? 'block' : 'none'
      }
    }
    // The last pack that actually rendered. A pack that fails to load must
    // not stay selected in the UI while a different one is on screen — a
    // control that reports a source the operator is not looking at is the
    // exact failure this console exists to avoid.
    let lastGoodPack = mapViewStore.get().pack
    // Set while reverting, so the recovery load does not erase the message
    // explaining why the selection moved. Without this the selection appears
    // to bounce back for no reason at all.
    let keepErrorThroughRevert = false

    async function applyStyle() {
      const map = mapRef.current
      if (!map) return

      const { pack, mode } = mapViewStore.get()
      setMapReady(false)

      try {
        const definition = getPack(pack)

        // Photoreal now renders in CesiumJS, not deck.gl.
        //
        // Both engines stay behind dynamic imports, so neither enters the
        // offline bundle. MapLibre is hidden rather than destroyed: keeping
        // its WebGL context and camera makes switching back instant and
        // preserves the operator's viewpoint.
        await teardownCesium()

        if (definition.renderer === 'photoreal') {
          const googleKey = keyFor('google')
          const ionToken = keyFor('ion')

          // Route resolution still lives in photoreal.ts — it is renderer
          // agnostic and preflights the credential, so a bad key surfaces as
          // a sentence rather than an empty black globe.
          const { resolvePhotorealRoute } = await import('./photoreal')
          const { route, problem } = await resolvePhotorealRoute(
            googleKey,
            ionToken,
          )
          if (!route) throw new Error(problem ?? 'No photoreal route available.')
          if (cancelled || !mapRef.current || !cesiumContainerRef.current) return

          const { createCesiumPhotoreal } = await import('./photorealCesium')
          const centre = map.getCenter()

          cesiumRef.current = await createCesiumPhotoreal({
            container: cesiumContainerRef.current,
            route,
            googleKey,
            ionToken,
            camera: {
              longitude: centre.lng,
              latitude: centre.lat,
              zoom: Math.max(map.getZoom(), PHOTOREAL_MIN_ZOOM + 2),
              pitch: map.getPitch(),
              bearing: map.getBearing(),
            },
            onAttribution: setPhotorealAttribution,
            onTileCount: setPhotorealTiles,
            onError: setMapError,
          })
          if (cancelled) {
            await teardownCesium()
            return
          }

          registerRecenter(() => cesiumRef.current?.recenter())
          setPhotorealRoute(route)
          setCesiumVisible(true)
          // Nothing for deck.gl to draw while Cesium owns the screen.
          overlayRef.current?.setProps({ layers: [] })
        } else {
          registerRecenter(() => {
            mapRef.current?.easeTo({
              center: HOME_CAMERA.center,
              zoom: HOME_CAMERA.zoom,
              bearing: HOME_CAMERA.bearing,
              pitch: getViewMode(mapViewStore.get().mode).pitch,
              duration: 600,
            })
          })
          setCesiumVisible(false)
          setPhotorealAttribution(null)
          setPhotorealRoute(null)
        }

        // MapLibre's own camera fence is only needed while MapLibre is the
        // visible renderer. Cesium enforces the same bounds itself, per frame,
        // because it has no setMaxBounds equivalent.
        map.setMaxBounds(null)
        map.setMinZoom(0)

        const { style, terrain } = await buildMapStyle(pack, getViewMode(mode))
        if (cancelled || !mapRef.current) return

        // Swap the overlay contents before the style, so the mesh is never
        // drawn against a basemap it is meant to replace.
        // Drop terrain before swapping styles. If the old style's terrain
        // source disappears in the new one while terrain is still attached,
        // the depth pass renders against a source that no longer exists.
        map.setTerrain(null)

        // diff: false — the styles differ by source as well as layers when the
        // pack changes, and MapLibre's differ silently mis-handles a terrain
        // source appearing or disappearing.
        map.setStyle(style, { diff: false })

        // Terrain is applied only once the style — and therefore the
        // raster-dem source and its GPU programs — actually exists.
        map.once('style.load', () => {
          if (cancelled || !mapRef.current) return
          if (terrain) map.setTerrain(terrain)
          // setStyle discards every source and layer, annotations included, so
          // they are re-added on each swap. Without this an operator loses
          // their drawings simply by changing basemap pack.
          installAnnotationLayers(map)
          redrawAnnotations(map)
        })

        map.once('idle', () => {
          if (!cancelled) setMapReady(true)
        })
        if (keepErrorThroughRevert) keepErrorThroughRevert = false
        else setMapError(null)
        lastGoodPack = pack
      } catch (error) {
        if (cancelled) return
        setMapError(
          error instanceof Error ? error.message : 'Failed to build map style',
        )
        // Snap the selection back to what is actually on screen. Terminates:
        // lastGoodPack rendered successfully at least once, and the guard
        // above stops a revert to the same pack re-entering.
        if (pack !== lastGoodPack) {
          keepErrorThroughRevert = true
          setMapPack(lastGoodPack)
        }
      }
    }

    void applyStyle()
    // Keyed on pack+mode only. This effect writes to mapViewStore via
    // setMapReady / setMapError, so subscribing to the raw store would have
    // it re-trigger itself on its own writes.
    const unsubscribe = subscribeSelector(
      mapViewStore,
      (s) => `${s.pack}:${s.mode}`,
      () => void applyStyle(),
    )

    return () => {
      cancelled = true
      unsubscribe()
      registerRecenter(null)
      void teardownCesium()
    }
  }, [])

  // ---- Camera follows the view mode's pitch -------------------------------
  useEffect(() => {
    function applyPitch() {
      const map = mapRef.current
      if (!map) return
      const mode = getViewMode(mapViewStore.get().mode)
      if (Math.round(map.getPitch()) === mode.pitch) return
      map.easeTo({ pitch: mode.pitch, duration: 400 })
    }

    applyPitch()
    return subscribeSelector(mapViewStore, (s) => s.mode, applyPitch)
  }, [])

  // ---- Cursor mode drives the pointer and MapLibre's own drag handlers ----
  useEffect(() => {
    function applyCursorMode() {
      const map = mapRef.current
      if (!map) return

      const mode = getCursorMode(cursorModeStore.get())
      map.getCanvas().style.cursor = mode.cursor

      // The draw and marquee tools need left-drag for themselves — a box
      // select that also pans the map is unusable. Select and Pan both keep
      // drag-pan: Select places nothing on drag, so taking the map's primary
      // navigation away from the default tool only makes the console feel
      // broken.
      const ownsDrag =
        mode.id === 'boxSelect' ||
        mode.id === 'measure' ||
        mode.id === 'zone' ||
        mode.id === 'waypoint'

      if (ownsDrag) map.dragPan.disable()
      else map.dragPan.enable()

      // MapLibre's double-click zoom collides with the double-click that ends
      // a measurement or closes a zone.
      if (mode.id === 'measure' || mode.id === 'zone') map.doubleClickZoom.disable()
      else map.doubleClickZoom.enable()
    }

    applyCursorMode()
    return cursorModeStore.subscribe(applyCursorMode)
  }, [])

  return (
    <>
      <div ref={containerRef} className="size-full" />
      {wedgetailPhase !== 'idle' && wedgetailPhase !== 'error' ? (
        <div
          data-testid="wedgetail-phase"
          className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 rounded-sm border border-border bg-panel px-3 py-2 text-center shadow-panel"
        >
          <div className="font-mono text-2xs text-signal-nominal">{wedgetailMode === 'coastal' ? 'THALES LITTORAL REPLAY · SOURCE TRACKS ONLY' : 'THALES SOURCE TRACK · NO INTERCEPTOR TELEMETRY'}</div>
          <div className="mt-0.5 text-xs font-medium text-text">{wedgetailPhase.replace('-', ' ').toUpperCase()}</div>
        </div>
      ) : null}
      {/* Cesium's own canvas. Hidden until the photoreal pack is selected,
          and never created until then — the viewer is constructed inside the
          dynamic import. */}
      <div
        ref={cesiumContainerRef}
        className="absolute inset-0"
        style={{ display: 'none' }}
      />
    </>
  )
}
