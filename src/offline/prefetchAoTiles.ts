import type { Map as MapboxMap } from 'mapbox-gl'
import { SG_OPERATIONAL_BOUNDS } from '../terrain/sgTerrainConfig'
import { OFFLINE_TILE_PATHS } from '../terrain/offlineMapConfig'
import { putTile, hasTile } from './tileCache'
import {
  estimateTileCount,
  expandTileUrl,
  tilesForBounds,
  type TileBounds,
} from './tileMath'

export interface PrefetchProgress {
  phase: 'local' | 'mapbox-dem' | 'done' | 'error'
  done: number
  total: number
  message: string
}

export interface PrefetchResult {
  fetched: number
  skipped: number
  failed: number
  total: number
}

const SG_BOUNDS: TileBounds = {
  west: SG_OPERATIONAL_BOUNDS[0][0],
  south: SG_OPERATIONAL_BOUNDS[0][1],
  east: SG_OPERATIONAL_BOUNDS[1][0],
  north: SG_OPERATIONAL_BOUNDS[1][1],
}

const LOCAL_TEMPLATES = [
  OFFLINE_TILE_PATHS.demTiles,
  OFFLINE_TILE_PATHS.satelliteTiles,
  OFFLINE_TILE_PATHS.vectorTiles,
]

async function fetchAndCache(url: string): Promise<'fetched' | 'skipped' | 'failed'> {
  if (await hasTile(url)) return 'skipped'
  try {
    const res = await fetch(url)
    if (!res.ok) return 'failed'
    const data = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    await putTile(url, data, contentType)
    return 'fetched'
  } catch {
    return 'failed'
  }
}

/** Fetch XYZ tiles from local templates into IndexedDB. */
export async function prefetchLocalAoTiles(
  options: {
    bounds?: TileBounds
    minZoom?: number
    maxZoom?: number
    templates?: string[]
    onProgress?: (p: PrefetchProgress) => void
  } = {},
): Promise<PrefetchResult> {
  const bounds = options.bounds ?? SG_BOUNDS
  const minZoom = options.minZoom ?? 10
  const maxZoom = options.maxZoom ?? 14
  const templates = options.templates ?? LOCAL_TEMPLATES

  const jobs: string[] = []
  for (const template of templates) {
    for (let z = minZoom; z <= maxZoom; z++) {
      for (const tile of tilesForBounds(bounds, z)) {
        jobs.push(expandTileUrl(template, tile))
      }
    }
  }

  const total = jobs.length
  let fetched = 0
  let skipped = 0
  let failed = 0

  options.onProgress?.({
    phase: 'local',
    done: 0,
    total,
    message: `Caching local tiles (z${minZoom}–${maxZoom})…`,
  })

  for (let i = 0; i < jobs.length; i++) {
    const result = await fetchAndCache(jobs[i])
    if (result === 'fetched') fetched++
    else if (result === 'skipped') skipped++
    else failed++

    if (i % 8 === 0 || i === jobs.length - 1) {
      options.onProgress?.({
        phase: 'local',
        done: i + 1,
        total,
        message: `Local tiles ${i + 1}/${total}`,
      })
    }
  }

  return { fetched, skipped, failed, total }
}

/** Warm Mapbox DEM tiles via map fly-through; SW caches network responses. */
export async function prefetchMapboxDemTiles(
  map: MapboxMap,
  onProgress?: (p: PrefetchProgress) => void,
): Promise<void> {
  if (!map.isStyleLoaded()) return
  const [[west, south], [east, north]] = SG_OPERATIONAL_BOUNDS
  const center: [number, number] = [(west + east) / 2, (south + north) / 2]

  onProgress?.({
    phase: 'mapbox-dem',
    done: 0,
    total: 1,
    message: 'Prefetching Mapbox DEM for Singapore AO…',
  })

  const prev = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }

  const zoomLevels = [10, 11, 12, 13, 14]
  for (let i = 0; i < zoomLevels.length; i++) {
    map.jumpTo({ center, zoom: zoomLevels[i], pitch: 0, bearing: 0 })
    await new Promise<void>((resolve) => {
      map.once('idle', () => resolve())
      window.setTimeout(() => resolve(), 3000)
    })
    onProgress?.({
      phase: 'mapbox-dem',
      done: i + 1,
      total: zoomLevels.length,
      message: `DEM zoom ${zoomLevels[i]}…`,
    })
  }

  map.jumpTo(prev)
}

export function estimateAoTileCount(minZoom = 10, maxZoom = 14): number {
  return estimateTileCount(SG_BOUNDS, minZoom, maxZoom) * LOCAL_TEMPLATES.length
}
