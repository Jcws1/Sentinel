import { useMemo } from 'react'
import {
  estimateTerrainComplexity,
  type TerrainComplexity,
} from './sgTerrainConfig'

export interface TerrainDriftInput {
  lng: number
  lat: number
  /** Seconds since last GNSS / C2 fix */
  secondsSinceFix: number
  /** Positioning confidence 0–100 from fusion / SLAM */
  confidence: number
  gnssDenied: boolean
}

export interface TerrainDriftResult {
  complexity: TerrainComplexity
  /** Uncertainty radius in meters for map halo */
  uncertaintyRadiusM: number
  /** Suggested AGL display bias note */
  aglHint: string
  driftRateMps: number
}

const DRIFT_RATE: Record<TerrainComplexity, number> = {
  low: 0.35,
  medium: 0.9,
  high: 1.8,
}

/**
 * GNSS-denied dead-reckoning drift estimate scaled by terrain complexity.
 * Flat open → slow drift; jungle / complex → fast drift.
 */
export function computeTerrainDrift(input: TerrainDriftInput): TerrainDriftResult {
  const complexity = estimateTerrainComplexity(input.lng, input.lat)
  const baseRate = DRIFT_RATE[complexity]
  const confFactor = input.gnssDenied
    ? 1 + (100 - Math.min(100, Math.max(0, input.confidence))) / 50
    : 0.25
  const driftRateMps = baseRate * confFactor
  const uncertaintyRadiusM = input.gnssDenied
    ? Math.min(2500, Math.max(25, driftRateMps * Math.max(0, input.secondsSinceFix)))
    : Math.max(8, (100 - input.confidence) * 0.6)

  const aglHint =
    complexity === 'high'
      ? 'High terrain complexity — prefer visual landmarks / mesh'
      : complexity === 'medium'
        ? 'Moderate complexity — cross-check SLAM vs mesh'
        : 'Low complexity — drift grows slowly over open terrain'

  return { complexity, uncertaintyRadiusM, aglHint, driftRateMps }
}

export function useTerrainDrift(input: TerrainDriftInput): TerrainDriftResult {
  return useMemo(
    () => computeTerrainDrift(input),
    [
      input.lng,
      input.lat,
      input.secondsSinceFix,
      input.confidence,
      input.gnssDenied,
    ],
  )
}
