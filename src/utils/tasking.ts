import type { Drone, Position, TaskingRecommendation, ThreatTrack } from '../types'

function distanceMeters(a: Position, b: Position): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

function midpoint(a: Position, b: Position): Position {
  return {
    lng: (a.lng + b.lng) / 2,
    lat: (a.lat + b.lat) / 2,
    alt: (a.alt + b.alt) / 2,
  }
}

export function buildRecommendation(
  track: ThreatTrack,
  drones: Drone[],
): TaskingRecommendation | null {
  const available = drones
    .filter((d) => d.type === 'Interceptor' && d.comms !== 'lost' && d.battery > 15)
    .filter((d) => !d.assignedTrackId || d.assignedTrackId === track.id)
    .sort(
      (a, b) =>
        distanceMeters(a.position, track.position) -
        distanceMeters(b.position, track.position),
    )

  if (available.length === 0) return null

  const assigned = available.slice(0, track.threatClass === 'I' ? 2 : 1)
  const primary = assigned[0]
  const dist = distanceMeters(primary.position, track.position)
  const etaSeconds = Math.max(8, Math.round(dist / 28))
  const confidence = Math.min(
    99,
    Math.round(
      (track.fusionConfidence +
        assigned.reduce((s, d) => s + d.positioningConfidence, 0) /
          assigned.length) /
        2,
    ),
  )

  const route = {
    waypoints: [
      primary.position,
      midpoint(primary.position, track.position),
      track.position,
    ],
  }

  const droneList = assigned.map((d) => d.id).join(', ')
  const summary = `Intercept ${track.id} with ${droneList} via direct intercept. ETA: ${etaSeconds}s. Confidence: ${confidence}%.`

  return {
    id: `rec-${track.id}`,
    trackId: track.id,
    droneIds: assigned.map((d) => d.id),
    route,
    etaSeconds,
    confidence,
    status: 'pending',
    summary,
    autoExecuteAt: null,
  }
}

export function prioritizeThreats(tracks: ThreatTrack[]): ThreatTrack[] {
  const classRank = { I: 0, II: 1, III: 2 }
  return [...tracks].sort((a, b) => {
    const classDiff = classRank[a.threatClass] - classRank[b.threatClass]
    if (classDiff !== 0) return classDiff
    return a.etaToAsset - b.etaToAsset
  })
}

/** Highest-priority track: alerts first, then class/ETA sort. */
export function getTopPriorityTrack(
  tracks: ThreatTrack[],
  alertTrackIds: string[] = [],
): ThreatTrack | null {
  if (tracks.length === 0) return null
  const alertSet = new Set(alertTrackIds)
  const alerted = tracks.filter((t) => alertSet.has(t.id))
  if (alerted.length > 0) return prioritizeThreats(alerted)[0] ?? null
  return prioritizeThreats(tracks)[0] ?? null
}

/** Pending recommendation for the highest-priority threat. */
export function getTopPriorityPendingRecommendation(
  tracks: ThreatTrack[],
  alertTrackIds: string[],
  recommendations: TaskingRecommendation[],
): TaskingRecommendation | null {
  const pending = recommendations.filter((r) => r.status === 'pending')
  if (pending.length === 0) return null
  if (pending.length === 1) return pending[0]

  const pendingTrackIds = new Set(pending.map((r) => r.trackId))
  const pendingTracks = tracks.filter((t) => pendingTrackIds.has(t.id))
  const topTrack =
    getTopPriorityTrack(pendingTracks, alertTrackIds) ??
    getTopPriorityTrack(tracks, alertTrackIds)

  if (!topTrack) return pending[0]
  return pending.find((r) => r.trackId === topTrack.id) ?? pending[0]
}
