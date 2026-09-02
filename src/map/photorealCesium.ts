// Order matters: this sets CESIUM_BASE_URL before Cesium's module body runs.
import './cesiumBaseUrl'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import { PHOTOREAL_BOUNDS, PHOTOREAL_MIN_ZOOM } from './sources'
import { attachCesiumAnnotations } from './annotations/cesiumAdapter'
import type { PhotorealRoute } from './photoreal'

/* ===========================================================================
   GOD'S EYE — CesiumJS renderer

   QUARANTINED, same as the deck.gl path: only reached through a dynamic
   import, so Cesium's ~3 MB of JS is code-split into a chunk the offline
   build never fetches. Nothing on the offline path may import this statically.

   WHY A SECOND RENDERER EXISTS AT ALL

   Measured on this machine, orbiting at z16 over the CBD:
     empty map ......................... 122 fps
     local vector + terrain + buildings . 112 fps
     deck.gl Tile3DLayer photoreal ......   9 fps

   deck.gl's Tile3DLayer returns one deck.gl sub-layer per resident tile —
   ~690 of them — and walks that whole set on every camera change. Cesium
   ships a purpose-built 3D Tiles renderer that batches draw calls and runs
   its own culling and request scheduler. Tuning the deck.gl path was tried
   across three configurations and moved nothing (see photoreal.ts). This is
   architectural, so the fix is the right tool rather than a better constant.

   MapLibre is NOT torn down when this mounts. It keeps its WebGL context and
   camera, hidden behind this canvas, so switching back is instant and the
   operator's viewpoint survives.
=========================================================================== */

export interface CesiumHandle {
  viewer: Cesium.Viewer
  /** Return the camera to the view it was created with. */
  recenter: () => void
  destroy: () => void
}

export interface CesiumOptions {
  container: HTMLElement
  route: PhotorealRoute
  googleKey: string
  ionToken: string
  /** Camera to adopt from MapLibre, so the switch is seamless. */
  camera: {
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
  }
  onTileCount?: (loaded: number) => void
  onAttribution?: (html: string) => void
  onError?: (message: string) => void
}

/** MapLibre zoom → an eye height in metres that frames roughly the same ground. */
function zoomToHeight(zoom: number, latitude: number): number {
  // 156543 m/px at z0 on the equator; a ~1000px viewport is the reference.
  const metresPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
  return metresPerPixel * 1000
}

export async function createCesiumPhotoreal(
  options: CesiumOptions,
): Promise<CesiumHandle> {
  const {
    container,
    route,
    googleKey,
    ionToken,
    camera,
    onTileCount,
    onAttribution,
    onError,
  } = options

  // Configure exactly ONE route's credential.
  //
  // Setting the ion token on the direct route makes Cesium fetch its credit
  // artwork from assets.ion.cesium.com and display an ion logo for data ion
  // never served — an extra external host and misleading attribution.
  // Verified: on the direct route this yields 141 requests to
  // tile.googleapis.com and none to api.cesium.com.
  if (route === 'cesium-ion') {
    Cesium.Ion.defaultAccessToken = ionToken
    // Undefined makes createGooglePhotorealistic3DTileset resolve through ion.
    Cesium.GoogleMaps.defaultApiKey = undefined
  } else {
    Cesium.GoogleMaps.defaultApiKey = googleKey
  }

  // Google's credit line is a LICENCE CONDITION, not decoration. Cesium
  // renders it bottom-left by default, which is exactly where the cursor-mode
  // palette sits — it was being occluded. Give it its own container pinned
  // bottom-right, clear of the console's chrome.
  const creditContainer = document.createElement('div')
  // The class also carries a CSS override: Cesium's own stylesheet positions
  // .cesium-widget-credits absolutely, which collapses this wrapper to 0x0 and
  // lets the credit overflow off the right edge of the screen. See the
  // `.sentinel-cesium-credit` rule in global.css.
  creditContainer.className = 'sentinel-cesium-credit'
  container.appendChild(creditContainer)

  const viewer = new Cesium.Viewer(container, {
    creditContainer,
    // Every widget off: this console supplies its own chrome, and Cesium's
    // default UI would fight the design system on colour, type and layout.
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    // No imagery layer — Google's mesh carries its own ground and textures.
    // Requesting one would fetch tiles we then draw nothing with.
    baseLayer: false,
    // Flat ellipsoid: Google 3D Tiles include terrain. Cesium World Terrain
    // underneath them fights at high zoom — God's Eye View disables it for the
    // same reason.
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  })

  // Dev-only handle, mirroring window.__map. A 3D viewer is close to
  // impossible to debug or benchmark without one.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __cesium?: Cesium.Viewer }).__cesium = viewer
  }

  const scene = viewer.scene

  // ---- Camera bindings: match MapLibre and Google Earth -------------------
  //
  // Cesium's defaults are zoomEventTypes = [RIGHT_DRAG, WHEEL, PINCH] and
  // tiltEventTypes = [MIDDLE_DRAG, ...], so right-drag ZOOMS. Everywhere else
  // in this console — and in Google Earth, which is what this view looks like
  // — right-drag orbits and pitches. Leaving the default means the one mode
  // that looks most like a familiar tool behaves least like one.
  const controller = scene.screenSpaceCameraController
  controller.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG]
  controller.tiltEventTypes = [
    Cesium.CameraEventType.RIGHT_DRAG,
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.PINCH,
    { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
  ]
  // Wheel only: right-drag now belongs to tilt.
  controller.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
  ]
  // Stop the camera being driven inside a building, where the mesh fills the
  // frame and there is no way to tell which way is out.
  controller.minimumZoomDistance = 40
  controller.enableCollisionDetection = true
  // The globe surface is redundant once the mesh loads, and drawing it wastes
  // fill rate and shows through gaps in the tiles as a smooth blue shell.
  scene.globe.show = false
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
  scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0b0d')
  // Match the console ground so the seam at the horizon is invisible.
  scene.fog.enabled = false

  let tilesLoaded = 0

  try {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({
      // Google's terms tie the tiles to their geocoder unless you hold a
      // separate agreement; God's Eye View sets the same flag.
      onlyUsingWithGoogleGeocoder: true,
    })

    // Realism and cost, both deliberate:
    // - maximumScreenSpaceError 8 (Cesium default 16) buys sharper façades.
    // - cacheBytes well above Cesium's default keeps detail resident while
    //   orbiting, which is exactly what the deck.gl path could not do.
    tileset.maximumScreenSpaceError = 8
    tileset.cacheBytes = 768 * 1024 * 1024
    tileset.maximumCacheOverflowBytes = 256 * 1024 * 1024

    tileset.tileLoad.addEventListener(() => {
      tilesLoaded += 1
      onTileCount?.(tilesLoaded)
    })

    scene.primitives.add(tileset)

    // Google requires its per-tile credits to be displayed. Cesium collects
    // them in creditDisplay; surface them into the panel as well so the
    // requirement is met even when the map is behind a panel.
    onAttribution?.('Google · Photorealistic 3D Tiles')
  } catch (error) {
    onError?.(
      error instanceof Error
        ? `Google 3D Tiles failed: ${error.message}`
        : 'Google 3D Tiles failed to load.',
    )
  }

  // ---- Camera: adopt MapLibre's viewpoint --------------------------------
  const homeView = {
    destination: Cesium.Cartesian3.fromDegrees(
      camera.longitude,
      camera.latitude,
      zoomToHeight(camera.zoom, camera.latitude),
    ),
    orientation: {
      heading: Cesium.Math.toRadians(camera.bearing),
      pitch: Cesium.Math.toRadians(camera.pitch - 90),
      roll: 0,
    },
  }

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      camera.longitude,
      camera.latitude,
      zoomToHeight(camera.zoom, camera.latitude),
    ),
    orientation: {
      heading: Cesium.Math.toRadians(camera.bearing),
      // Cesium pitch is measured from the horizon downward and is negative
      // looking down, where MapLibre's is measured from straight down.
      pitch: Cesium.Math.toRadians(camera.pitch - 90),
      roll: 0,
    },
  })

  // ---- Cost fence --------------------------------------------------------
  //
  // Cesium has no setMaxBounds, so the clamp is enforced per-frame: if the
  // camera leaves the operating area or climbs too high, it is pushed back.
  // Same purpose as the MapLibre clamp — the cheapest tile request is the one
  // never made, and photoreal tiles bill per request.
  const [west, south, east, north] = PHOTOREAL_BOUNDS
  const maxHeight = zoomToHeight(PHOTOREAL_MIN_ZOOM, (south + north) / 2)

  const clamp = () => {
    const carto = viewer.camera.positionCartographic
    const lon = Cesium.Math.toDegrees(carto.longitude)
    const lat = Cesium.Math.toDegrees(carto.latitude)
    const height = carto.height

    const clampedLon = Math.min(Math.max(lon, west), east)
    const clampedLat = Math.min(Math.max(lat, south), north)
    const clampedHeight = Math.min(height, maxHeight)

    if (
      clampedLon !== lon ||
      clampedLat !== lat ||
      clampedHeight !== height
    ) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          clampedLon,
          clampedLat,
          clampedHeight,
        ),
        orientation: {
          heading: viewer.camera.heading,
          pitch: viewer.camera.pitch,
          roll: viewer.camera.roll,
        },
      })
    }
  }

  scene.postRender.addEventListener(clamp)

  // Annotations follow the operator between renderers: the same store drives
  // both, so a zone drawn on the vector basemap is already here.
  const detachAnnotations = attachCesiumAnnotations(viewer)

  return {
    viewer,
    recenter: () => {
      if (viewer.isDestroyed()) return
      // Flown, not jumped: an instant cut loses the operator's sense of where
      // the view moved from, which is the whole reason they pressed it.
      viewer.camera.flyTo({ ...homeView, duration: 0.6 })
    },
    destroy: () => {
      detachAnnotations()
      scene.postRender.removeEventListener(clamp)
      if (!viewer.isDestroyed()) viewer.destroy()
      creditContainer.remove()
    },
  }
}
