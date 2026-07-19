/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
  /** Force self-hosted offline tile paths */
  readonly VITE_OFFLINE_MODE?: string
  /** Local Mapbox GL style JSON URL (e.g. /offline/styles/sentinel-ops.json) */
  readonly VITE_MAP_STYLE_URL?: string
  /** DEM XYZ template, e.g. /offline/tiles/dem/{z}/{x}/{y}.png */
  readonly VITE_DEM_TILES_URL?: string
  /** mapbox | terrarium */
  readonly VITE_DEM_ENCODING?: string
  readonly VITE_SATELLITE_TILES_URL?: string
  readonly VITE_VECTOR_TILES_URL?: string
  readonly VITE_CONTOUR_TILES_URL?: string
  readonly VITE_PMTILES_CONTOURS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
