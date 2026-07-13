import type { Map as MapboxMap } from 'mapbox-gl'
import type { TerrainComplexity } from './sgTerrainConfig'
import { estimateTerrainComplexity } from './sgTerrainConfig'

export interface GeoPoint {
  lng: number
  lat: number
  /** Meters AMSL (optional). If omitted, uses terrain elevation + aglOffset. */
  alt?: number
}

export interface LosResult {
  from: GeoPoint
  to: GeoPoint
  clear: boolean
  blockingElevation: number
  blockingFeature?: 'ridge' | 'building' | 'forest' | 'unknown'
  samples: Array<{ lng: number; lat: number; groundM: number; losM: number }>
  maxClearanceM: number
  minClearanceM: number
}

export interface TopologyAnalysis {
  los: LosResult
  terrainComplexity: TerrainComplexity
  suggestedRelayPositions: GeoPoint[]
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function sampleElevation(map: MapboxMap, lng: number, lat: number): number {
  try {
    const elev = map.queryTerrainElevation({ lng, lat }, { exaggerated: false })
    return elev ?? 0
  } catch {
    return 0
  }
}

/**
 * 2-point line-of-sight using Mapbox terrain elevation samples.
 * Target: <100ms for typical tactical ranges.
 */
export function analyzeLineOfSight(
  map: MapboxMap,
  from: GeoPoint,
  to: GeoPoint,
  opts?: { samples?: number; aglFromM?: number; aglToM?: number; clearanceM?: number },
): LosResult {
  const n = Math.max(8, opts?.samples ?? 24)
  const clearance = opts?.clearanceM ?? 5
  const groundFrom = sampleElevation(map, from.lng, from.lat)
  const groundTo = sampleElevation(map, to.lng, to.lat)
  const altFrom = from.alt ?? groundFrom + (opts?.aglFromM ?? 80)
  const altTo = to.alt ?? groundTo + (opts?.aglToM ?? 5)

  const samples: LosResult['samples'] = []
  let clear = true
  let blockingElevation = 0
  let minClearanceM = Number.POSITIVE_INFINITY
  let maxClearanceM = Number.NEGATIVE_INFINITY

  for (let i = 0; i <= n; i++) {
    const t = i / n
    const lng = lerp(from.lng, to.lng, t)
    const lat = lerp(from.lat, to.lat, t)
    const groundM = sampleElevation(map, lng, lat)
    const losM = lerp(altFrom, altTo, t)
    const gap = losM - groundM
    samples.push({ lng, lat, groundM, losM })
    maxClearanceM = Math.max(maxClearanceM, gap)
    minClearanceM = Math.min(minClearanceM, gap)
    if (i > 0 && i < n && gap < clearance) {
      clear = false
      blockingElevation = Math.max(blockingElevation, groundM)
    }
  }

  return {
    from: { ...from, alt: altFrom },
    to: { ...to, alt: altTo },
    clear,
    blockingElevation,
    blockingFeature: clear ? undefined : 'ridge',
    samples,
    maxClearanceM,
    minClearanceM: Number.isFinite(minClearanceM) ? minClearanceM : 0,
  }
}

/** Suggest high points near `origin` with clear LOS toward `focus` (mesh relay aid). */
export function suggestRelayPositions(
  map: MapboxMap,
  origin: GeoPoint,
  focus: GeoPoint,
  count = 3,
): GeoPoint[] {
  const candidates: Array<GeoPoint & { score: number }> = []
  const ring = [
    [0.008, 0],
    [-0.008, 0],
    [0, 0.008],
    [0, -0.008],
    [0.006, 0.006],
    [-0.006, 0.006],
    [0.006, -0.006],
    [-0.006, -0.006],
  ] as const

  for (const [dLng, dLat] of ring) {
    const lng = origin.lng + dLng
    const lat = origin.lat + dLat
    const ground = sampleElevation(map, lng, lat)
    const point = { lng, lat, alt: ground + 40 }
    const los = analyzeLineOfSight(map, point, focus, { samples: 16, aglFromM: 40, aglToM: 5 })
    const score = ground + (los.clear ? 80 : 0) + los.minClearanceM
    candidates.push({ ...point, score })
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ lng, lat, alt }) => ({ lng, lat, alt }))
}

export function buildTopologyAnalysis(
  map: MapboxMap,
  from: GeoPoint,
  to: GeoPoint,
): TopologyAnalysis {
  const los = analyzeLineOfSight(map, from, to)
  const midLng = (from.lng + to.lng) / 2
  const midLat = (from.lat + to.lat) / 2
  return {
    los,
    terrainComplexity: estimateTerrainComplexity(midLng, midLat),
    suggestedRelayPositions: suggestRelayPositions(map, from, to),
  }
}

/** Elevation profile between two points for route planning. */
export function elevationProfile(
  map: MapboxMap,
  from: GeoPoint,
  to: GeoPoint,
  samples = 40,
): Array<{ t: number; groundM: number; lng: number; lat: number }> {
  const out: Array<{ t: number; groundM: number; lng: number; lat: number }> = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const lng = lerp(from.lng, to.lng, t)
    const lat = lerp(from.lat, to.lat, t)
    out.push({ t, lng, lat, groundM: sampleElevation(map, lng, lat) })
  }
  return out
}
