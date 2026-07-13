/**
 * Offline map configuration for Sentinel C2.
 * Swap Mapbox cloud tiles for self-hosted datasets when operating disconnected.
 */
import { DEFAULT_TERRAIN_CONFIG, type TerrainConfig } from './sgTerrainConfig'
import type { MapBasemap } from '../store/uiSlice'

export type DemEncoding = 'mapbox' | 'terrarium'

export interface OfflineMapConfig {
  /** Prefer local/self-hosted sources over Mapbox cloud. */
  offlinePreferred: boolean
  /** Mapbox token still needed for Mapbox-hosted styles; omit when fully offline. */
  mapboxToken: string | null
  /** Resolved Mapbox style URL or path to local style JSON. */
  styleUrl: string
  /** DEM source — mapbox:// URL or HTTP tile template(s). */
  demUrl: string
  demTiles: string[] | null
  demEncoding: DemEncoding
  /** Vector contour source — mapbox:// or local PMTiles/MBTiles URL. */
  contourUrl: string | null
  /** Raster satellite tile template (for custom offline styles). */
  satelliteTileUrl: string | null
  /** Minimal vector tile template (roads/buildings/water). */
  vectorTileUrl: string | null
  basemap: MapBasemap
}

const SG_BOUNDS = { west: 103.6, south: 1.15, east: 104.1, north: 1.48 }

/** Local paths served from `public/offline/` via Vite static hosting. */
export const OFFLINE_TILE_PATHS = {
  styleMinimal: '/offline/styles/sentinel-ops.json',
  styleSatellite: '/offline/styles/sentinel-satellite.json',
  demTiles: '/offline/tiles/dem/{z}/{x}/{y}.png',
  satelliteTiles: '/offline/tiles/satellite/{z}/{x}/{y}.png',
  vectorTiles: '/offline/tiles/vector/{z}/{x}/{y}.pbf',
  contoursPmtiles: '/offline/tiles/contours.pmtiles',
} as const

function envFlag(name: keyof ImportMetaEnv): boolean {
  const v = import.meta.env[name]
  return v === 'true' || v === '1'
}

function envStr(name: keyof ImportMetaEnv): string | undefined {
  const v = import.meta.env[name]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Mapbox-compatible XYZ proxy for local PMTiles archives. */
export const OFFLINE_PMTILES_CONTOUR_TEMPLATE =
  '/api/offline/pmtiles/contours/{z}/{x}/{y}.pbf'

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Resolve map/terrain sources from env + browser connectivity.
 *
 * Env vars (see `.env.example`):
 * - VITE_OFFLINE_MODE — force self-hosted tile paths
 * - VITE_MAP_STYLE_URL — override basemap style JSON
 * - VITE_DEM_TILES_URL — Terrain-RGB / Mapbox-DEM tile template
 * - VITE_DEM_ENCODING — `mapbox` | `terrarium`
 * - VITE_CONTOUR_TILES_URL — optional local contour vector tiles
 * - VITE_SATELLITE_TILES_URL — raster basemap tiles
 */
export function resolveOfflineMapConfig(basemap: MapBasemap = 'satellite'): OfflineMapConfig {
  const offlinePreferred =
    envFlag('VITE_OFFLINE_MODE') || isBrowserOffline()
  const mapboxToken = envStr('VITE_MAPBOX_TOKEN') ?? null

  const demTiles =
    envStr('VITE_DEM_TILES_URL') ??
    (offlinePreferred ? OFFLINE_TILE_PATHS.demTiles : null)
  const demEncoding = (envStr('VITE_DEM_ENCODING') as DemEncoding | undefined) ?? 'mapbox'

  const satelliteTileUrl =
    envStr('VITE_SATELLITE_TILES_URL') ??
    (offlinePreferred ? OFFLINE_TILE_PATHS.satelliteTiles : null)

  const vectorTileUrl =
    envStr('VITE_VECTOR_TILES_URL') ??
    (offlinePreferred ? OFFLINE_TILE_PATHS.vectorTiles : null)

  const contourUrl =
    envStr('VITE_CONTOUR_TILES_URL') ??
    envStr('VITE_PMTILES_CONTOURS_URL') ??
    (offlinePreferred
      ? OFFLINE_PMTILES_CONTOUR_TEMPLATE
      : 'mapbox://mapbox.mapbox-terrain-v2')

  let styleUrl = envStr('VITE_MAP_STYLE_URL')
  if (!styleUrl) {
    if (offlinePreferred) {
      styleUrl =
        basemap === 'satellite'
          ? OFFLINE_TILE_PATHS.styleSatellite
          : OFFLINE_TILE_PATHS.styleMinimal
    } else {
      styleUrl =
        basemap === 'satellite'
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/dark-v11'
    }
  }

  const demUrl = demTiles ? demTiles[0] : DEFAULT_TERRAIN_CONFIG.demUrl

  return {
    offlinePreferred,
    mapboxToken,
    styleUrl,
    demUrl,
    demTiles: demTiles ? [demTiles] : null,
    demEncoding,
    contourUrl,
    satelliteTileUrl,
    vectorTileUrl,
    basemap,
  }
}

export function resolveTerrainConfig(offline: OfflineMapConfig): TerrainConfig {
  return {
    ...DEFAULT_TERRAIN_CONFIG,
    source: offline.demTiles ? 'self-hosted-dem' : 'mapbox-terrain',
    demUrl: offline.demUrl,
    demTiles: offline.demTiles ?? undefined,
    demEncoding: offline.demEncoding,
    contourUrl: offline.contourUrl ?? undefined,
  }
}

/** Singapore open-data / self-host options for offline AO prep. */
export const SG_OFFLINE_DATASET_OPTIONS = [
  {
    id: 'sla-dem',
    name: 'SLA / OneMap DEM (2 m)',
    format: 'GeoTIFF → Terrain-RGB PNG tiles',
    coverage: 'Full island',
    use: 'Hillshade, 3D terrain, LOS, elevation profile',
    notes: 'Convert with gdal2tiles or rio-mbtiles; host via tileserver-gl or static /offline/tiles/dem/',
  },
  {
    id: 'mapbox-dem-export',
    name: 'Mapbox Terrain-DEM v1 (prefetch)',
    format: 'Mapbox Terrain-RGB tiles',
    coverage: 'SG_OPERATIONAL_BOUNDS',
    use: 'Session cache while online; export with tile fetch scripts',
    notes: 'Use prefetchOperationalTerrain(); respect Mapbox ToS for redistribution',
  },
  {
    id: 'srtm-30m',
    name: 'SRTM / Copernicus 30 m',
    format: 'GeoTIFF → terrarium RGB',
    coverage: 'Global incl. Singapore',
    use: 'Coarse offline DEM when SLA tiles unavailable',
    notes: 'Set VITE_DEM_ENCODING=terrarium',
  },
  {
    id: 'osm-vector',
    name: 'OpenStreetMap Singapore extract',
    format: 'MBTiles / PMTiles vector',
    coverage: 'Roads, buildings, water, landuse',
    use: 'Minimal basemap without satellite',
    notes: 'tippecanoe + tileserver-gl; paths in public/offline/tiles/vector/',
  },
  {
    id: 'sentinel2-raster',
    name: 'Sentinel-2 / aerial mosaic',
    format: 'GeoTIFF → raster PNG/JPEG tiles',
    coverage: 'Custom AO crop',
    use: 'Satellite-style offline basemap',
    notes: 'Place under public/offline/tiles/satellite/{z}/{x}/{y}.png',
  },
  {
    id: 'installations-geojson',
    name: 'Sentinel installations (bundled)',
    format: 'GeoJSON in repo',
    coverage: 'Bases + PRD scenarios',
    use: 'Always available offline — no tile server needed',
    notes: 'src/data/singaporeInstallations.ts',
  },
  {
    id: 'restricted-geojson',
    name: 'Restricted / training areas',
    format: 'GeoJSON in repo',
    coverage: 'Approximate SG envelopes',
    use: 'Overlay without network',
    notes: 'src/terrain/sgTerrainConfig.ts — replace with CAAS/MINDEF when classified data available',
  },
] as const

export { SG_BOUNDS }
