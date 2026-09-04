/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASEMAP_URL?: string
  readonly VITE_BASEMAP_STYLE?: 'dark' | 'void'
  /** Which source pack to boot with. Falls back to 'seasia' if unusable. */
  readonly VITE_MAP_PACK?: string
  /** Google Maps Platform key for Photorealistic 3D Tiles. Client-exposed. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Cesium ion token — fallback route to the same Google tileset. */
  readonly VITE_CESIUM_ION_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
