import type { Map as MapboxMap } from 'mapbox-gl'
import { SG_OPERATIONAL_BOUNDS, TERRAIN_DEM_SOURCE } from './sgTerrainConfig'

/**
 * Warm Mapbox DEM + style tiles for the Singapore operational AO.
 * Full offline (Service Worker / IndexedDB tile cache) is a follow-on;
 * this primes the browser HTTP cache for the current session.
 */
export async function prefetchOperationalTerrain(map: MapboxMap): Promise<void> {
  if (!map.isStyleLoaded()) return
  const [[west, south], [east, north]] = SG_OPERATIONAL_BOUNDS
  const center: [number, number] = [(west + east) / 2, (south + north) / 2]

  if (!map.getSource(TERRAIN_DEM_SOURCE)) return

  const prev = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }

  // Quiet fly across AO at DEM maxzoom to pull tiles into cache.
  map.jumpTo({ center, zoom: 12, pitch: 0, bearing: 0 })
  await new Promise<void>((resolve) => {
    map.once('idle', () => resolve())
    window.setTimeout(() => resolve(), 4000)
  })
  map.jumpTo(prev)
}
