import type { Drone, ThreatTrack } from '../types'
import { distanceMeters } from './geo'

export const ASSET_MATCH_WEIGHTS = {
  roe: 35,
  readiness: 20,
  response: 20,
  confidence: 15,
  cost: 10,
} as const

export interface AssetMatch {
  drone: Drone
  rank: number
  score: number
  eligible: boolean
  blockReasons: string[]
  roePass: boolean
  distanceM: number
  etaSeconds: number
  costIndex: number
  readinessScore: number
  responseScore: number
  confidenceScore: number
  costScore: number
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

function lifecycleReady(drone: Drone): boolean {
  return !(
    drone.lifecycle === 'FAULT' ||
    drone.lifecycle === 'SPAWNING' ||
    drone.lifecycle === 'INITIALIZING'
  )
}

function blockReasons(drone: Drone, trackId: string): string[] {
  const reasons: string[] = []
  if (!lifecycleReady(drone)) reasons.push(`Lifecycle ${drone.lifecycle}`)
  if (drone.comms === 'lost') reasons.push('C2 link lost')
  if (drone.battery <= 15) reasons.push('Battery reserve')
  if (drone.assignedTrackId && drone.assignedTrackId !== trackId) {
    reasons.push(`Assigned to ${drone.assignedTrackId}`)
  }
  if (/fault|offline|unavailable/i.test(drone.payloadStatus)) {
    reasons.push('Payload unavailable')
  }
  return reasons
}

function readinessScore(drone: Drone): number {
  const linkScore = drone.comms === 'strong' ? 100 : drone.comms === 'weak' ? 58 : 0
  const lifecycleScore = lifecycleReady(drone) ? 100 : 0
  return Math.round(
    clamp(
      drone.battery * 0.35 +
        linkScore * 0.25 +
        drone.positioningConfidence * 0.2 +
        lifecycleScore * 0.2,
    ),
  )
}

/**
 * A relative sortie-resource index, not a currency estimate. Lower is better.
 * It combines transit, remaining battery, link quality, and navigation risk.
 */
function costIndex(drone: Drone, distanceM: number): number {
  const transit = (distanceM / 1000) * 7
  const reserveRisk = (100 - drone.battery) * 0.16
  const linkRisk = drone.comms === 'weak' ? 9 : drone.comms === 'lost' ? 30 : 0
  const navigationRisk = (100 - drone.positioningConfidence) * 0.08
  return Math.round(clamp(12 + transit + reserveRisk + linkRisk + navigationRisk))
}

/** Rank interceptor candidates for one track using operator-visible criteria. */
export function rankAssetMatches(
  track: ThreatTrack,
  drones: Drone[],
  roePass: boolean,
): AssetMatch[] {
  const ranked = drones
    .filter((drone) => drone.type === 'Interceptor')
    .map((drone) => {
      const distanceM = Math.round(distanceMeters(drone.position, track.position))
      const etaSeconds = Math.max(8, Math.round(distanceM / 28))
      const readiness = readinessScore(drone)
      const response = Math.round(clamp(100 - etaSeconds * 1.2))
      const confidence = Math.round(
        clamp((track.fusionConfidence + drone.positioningConfidence) / 2),
      )
      const relativeCost = costIndex(drone, distanceM)
      const cost = 100 - relativeCost
      const reasons = blockReasons(drone, track.id)
      const eligible = reasons.length === 0
      const weighted =
        (roePass ? 100 : 0) * (ASSET_MATCH_WEIGHTS.roe / 100) +
        readiness * (ASSET_MATCH_WEIGHTS.readiness / 100) +
        response * (ASSET_MATCH_WEIGHTS.response / 100) +
        confidence * (ASSET_MATCH_WEIGHTS.confidence / 100) +
        cost * (ASSET_MATCH_WEIGHTS.cost / 100)

      return {
        drone,
        rank: 0,
        score: Math.round(eligible ? weighted : Math.min(39, weighted)),
        eligible,
        blockReasons: reasons,
        roePass,
        distanceM,
        etaSeconds,
        costIndex: relativeCost,
        readinessScore: readiness,
        responseScore: response,
        confidenceScore: confidence,
        costScore: cost,
      }
    })
    .sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        right.score - left.score ||
        left.etaSeconds - right.etaSeconds ||
        left.drone.id.localeCompare(right.drone.id),
    )

  return ranked.map((match, index) => ({ ...match, rank: index + 1 }))
}

