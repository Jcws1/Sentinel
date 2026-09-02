/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASEMAP_URL?: string
  readonly VITE_BASEMAP_STYLE?: 'dark' | 'void'
  /** Which source pack to boot with. Falls back to 'edge' if unusable. */
  readonly VITE_MAP_PACK?: string
  /** pmtiles:// path to a local Mapterhorn extract; flips terrain offline. */
  readonly VITE_TERRAIN_PMTILES?: string
  /** Google Maps Platform key for Photorealistic 3D Tiles. Client-exposed. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Cesium ion token — fallback route to the same Google tileset. */
  readonly VITE_CESIUM_ION_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
