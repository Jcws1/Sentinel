import type { PolicyZone, Position, ThreatTrack } from '../types'
import { distanceMeters } from './geo'

export type DecisionUrgency = 'critical' | 'high' | 'normal'

export interface DecisionContext {
  urgency: DecisionUrgency
  roeHint: string
  factors: string[]
}

export interface DecisionEvidence {
  sensorCount: number
  lastUpdateSec: number | null
  roePass: boolean
  civilianBufferM: number
}

function zoneRadiusM(zone: PolicyZone, center: Position): number {
  const [lng, lat] = zone.coordinates[0] ?? [center.lng, center.lat]
  return distanceMeters(center, { lng, lat, alt: 0 })
}

/** Operator-facing evidence for a pending intercept decision. */
export function assessDecisionEvidence(
  track: ThreatTrack,
  protectedAsset: Position,
  policyZones: PolicyZone[],
  lastSyncAt: number | null,
  now = Date.now(),
): DecisionEvidence {
  const distToAssetM = distanceMeters(track.position, protectedAsset)
  const weaponFreeM =
    policyZones.find((z) => z.kind === 'weapon-free') != null
      ? zoneRadiusM(
          policyZones.find((z) => z.kind === 'weapon-free')!,
          protectedAsset,
        )
      : 2000
  const holdFireM =
    policyZones.find((z) => z.kind === 'hold-fire') != null
      ? zoneRadiusM(
          policyZones.find((z) => z.kind === 'hold-fire')!,
          protectedAsset,
        )
      : 4000

  let roePass = false
  if (
    track.threatClass === 'I' &&
    track.fusionConfidence >= 85 &&
    distToAssetM <= weaponFreeM
  ) {
    roePass = true
  } else if (track.threatClass !== 'I' && track.fusionConfidence >= 90) {
    roePass = true
  }

  const civilianBufferM = Math.max(0, Math.round(holdFireM - distToAssetM))
  const lastUpdateSec =
    lastSyncAt != null ? Math.max(0, Math.round((now - lastSyncAt) / 1000)) : null

  return {
    sensorCount: track.sensors.length,
    lastUpdateSec,
    roePass,
    civilianBufferM,
  }
}

/** Operator-facing assessment for a pending intercept decision. */
export function assessDecisionContext(track: ThreatTrack): DecisionContext {
  const factors: string[] = []

  if (track.threatClass === 'I') {
    factors.push('Class I — weapon-free zone eligible')
  } else if (track.threatClass === 'II') {
    factors.push('Class II — hold-fire unless fusion ≥ 90%')
  } else {
    factors.push('Class III — confirm fusion before engage')
  }

  if (track.fusionConfidence >= 90) {
    factors.push(`Fusion ${track.fusionConfidence}% — high confidence`)
  } else if (track.fusionConfidence >= 80) {
    factors.push(`Fusion ${track.fusionConfidence}% — acceptable`)
  } else {
    factors.push(`Fusion ${track.fusionConfidence}% — degraded track quality`)
  }

  if (track.etaToAsset < 40) {
    factors.push(`ETA ${track.etaToAsset}s — asset at risk`)
  }

  let urgency: DecisionUrgency = 'normal'
  if (track.threatClass === 'I' && track.etaToAsset < 50) urgency = 'critical'
  else if (track.threatClass === 'I' || track.etaToAsset < 60) urgency = 'high'

  const roeHint =
    track.threatClass === 'I' && track.fusionConfidence >= 85
      ? 'Within ROE — operator confirm required'
      : track.threatClass !== 'I' && track.fusionConfidence < 90
        ? 'Policy caution — fusion below hold-fire threshold'
        : 'Manual confirm required — auto-engage disabled'

  return { urgency, roeHint, factors }
}

export function urgencyLabel(urgency: DecisionUrgency): string {
  if (urgency === 'critical') return 'Critical'
  if (urgency === 'high') return 'High'
  return 'Normal'
}
