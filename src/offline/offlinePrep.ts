import type { Map as MapboxMap } from 'mapbox-gl'
import { countTiles } from './tileCache'
import {
  estimateAoTileCount,
  prefetchLocalAoTiles,
  prefetchMapboxDemTiles,
  type PrefetchProgress,
  type PrefetchResult,
} from './prefetchAoTiles'
import { registerServiceWorker } from './initOffline'

export interface OfflinePrepStatus {
  tileCount: number
  estimatedTiles: number
  preparing: boolean
  progress: PrefetchProgress | null
  lastResult: PrefetchResult | null
}

let preparing = false
let progress: PrefetchProgress | null = null
let lastResult: PrefetchResult | null = null
const listeners = new Set<(s: OfflinePrepStatus) => void>()

function notify() {
  const status: OfflinePrepStatus = {
    tileCount: 0,
    estimatedTiles: estimateAoTileCount(),
    preparing,
    progress,
    lastResult,
  }
  void countTiles().then((tileCount) => {
    listeners.forEach((fn) =>
      fn({ ...status, tileCount }),
    )
  })
}

export function subscribeOfflinePrep(fn: (s: OfflinePrepStatus) => void): () => void {
  listeners.add(fn)
  notify()
  return () => listeners.delete(fn)
}

/**
 * Prepare offline map cache for Singapore AO:
 * 1. Register service worker
 * 2. Fetch local XYZ tiles into IndexedDB
 * 3. Warm Mapbox DEM via map (when online + map provided)
 */
export async function prepareOfflineMaps(
  map?: MapboxMap | null,
): Promise<PrefetchResult> {
  if (preparing) {
    return lastResult ?? { fetched: 0, skipped: 0, failed: 0, total: 0 }
  }

  preparing = true
  progress = { phase: 'local', done: 0, total: 0, message: 'Starting…' }
  notify()

  await registerServiceWorker()

  const onProgress = (p: PrefetchProgress) => {
    progress = p
    notify()
  }

  try {
    const localResult = await prefetchLocalAoTiles({ onProgress })

    if (map && navigator.onLine) {
      await prefetchMapboxDemTiles(map, onProgress)
    }

    progress = { phase: 'done', done: 1, total: 1, message: 'Offline prep complete' }
    lastResult = localResult
    notify()
    return localResult
  } catch (err) {
    progress = {
      phase: 'error',
      done: 0,
      total: 1,
      message: err instanceof Error ? err.message : 'Offline prep failed',
    }
    notify()
    throw err
  } finally {
    preparing = false
    notify()
  }
}

export async function getOfflinePrepStatus(): Promise<OfflinePrepStatus> {
  const tileCount = await countTiles()
  return {
    tileCount,
    estimatedTiles: estimateAoTileCount(),
    preparing,
    progress,
    lastResult,
  }
}
