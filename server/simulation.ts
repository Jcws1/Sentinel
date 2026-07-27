import { buildRecommendation } from '../src/utils/tasking'
import type { Position, TaskingRecommendation } from '../src/types'
import type { C2State } from './state'

const THREAT_VELOCITY: Record<string, { dLng: number; dLat: number }> = {
  'T-04': { dLng: -0.00004, dLat: -0.00003 },
  'T-03': { dLng: 0.00003, dLat: 0.00002 },
  'T-07': { dLng: -0.00005, dLat: 0.00001 },
}

function orbitOffset(t: number, radius: number, phase: number): Position {
  return {
    lng: Math.cos(t + phase) * radius,
    lat: Math.sin(t + phase) * radius * 0.7,
    alt: 0,
  }
}

export function advanceSimulation(
  state: C2State,
  options: { simulateDrones?: boolean } = {},
): void {
  state.tick += 1
  const asset = state.mission.protectedAsset
  const hold = state.mission.state === 'HOLD' || state.mission.state === 'RECALL'

  for (const drone of options.simulateDrones === false ? [] : state.drones) {
    if (hold) continue

    if (drone.assignedTrackId) {
      const track = state.tracks.find((t) => t.id === drone.assignedTrackId)
      if (track) {
        const blend = 0.08
        drone.position = {
          lng:
            drone.position.lng +
            (track.position.lng - drone.position.lng) * blend,
          lat:
            drone.position.lat +
            (track.position.lat - drone.position.lat) * blend,
          alt:
            drone.position.alt +
            (track.position.alt - drone.position.alt) * blend,
        }
        if (drone.battery > 5) drone.battery = Math.max(5, drone.battery - 0.01)
        continue
      }
    }

    const phase =
      drone.id.charCodeAt(drone.id.length - 1) * 0.4 +
      (drone.type === 'Scout' ? 1 : 0)
    const radius =
      drone.type === 'Scout' ? 0.004 : drone.type === 'Relay' ? 0.0015 : 0.0025
    const offset = orbitOffset(state.tick * 0.02, radius, phase)
    drone.position = {
      lng: drone.position.lng * 0.98 + (asset.lng + offset.lng) * 0.02,
      lat: drone.position.lat * 0.98 + (asset.lat + offset.lat) * 0.02,
      alt: drone.position.alt,
    }
  }

  if (!hold) {
    for (const track of state.tracks) {
      const vel = THREAT_VELOCITY[track.id] ?? { dLng: -0.00002, dLat: -0.00002 }
      track.position = {
        lng: track.position.lng + vel.dLng,
        lat: track.position.lat + vel.dLat,
        alt: track.altitude,
      }
      const dLat = (track.position.lat - asset.lat) * 111_320
      const dLng =
        (track.position.lng - asset.lng) *
        111_320 *
        Math.cos((track.position.lat * Math.PI) / 180)
      const dist = Math.hypot(dLat, dLng)
      track.etaToAsset = Math.max(5, Math.round(dist / Math.max(track.speed, 1)))
    }
  }

  // Auto-generate plans for interceptable tracks without active tasking.
  if (state.tick === 1 || state.tick % 20 === 0) {
    for (const track of state.tracks) {
      if (track.recommendedAction !== 'Intercept') continue
      const pending = state.recommendations.find(
        (r) => r.trackId === track.id && r.status === 'pending',
      )
      const confirmed = state.recommendations.find(
        (r) => r.trackId === track.id && r.status === 'confirmed',
      )
      if (pending || confirmed) continue

      const rec = buildRecommendation(track, state.drones)
      if (!rec) continue
      upsertRecommendation(state, rec)
      state.decisionLog.unshift({
        id: `log-${Date.now()}-${rec.id}`,
        timestamp: Date.now(),
        actor: 'system',
        action: 'RECOMMEND',
        detail: rec.summary,
      })
    }
  }

  // Refresh route waypoints for pending/confirmed plans.
  for (const rec of state.recommendations) {
    if (rec.status !== 'pending' && rec.status !== 'confirmed') continue
    const track = state.tracks.find((t) => t.id === rec.trackId)
    const primary = state.drones.find((d) => d.id === rec.droneIds[0])
    if (!track || !primary) continue
    rec.route = {
      waypoints: [
        primary.position,
        {
          lng: (primary.position.lng + track.position.lng) / 2,
          lat: (primary.position.lat + track.position.lat) / 2,
          alt: (primary.position.alt + track.position.alt) / 2,
        },
        track.position,
      ],
    }
  }
}

export function upsertRecommendation(
  state: C2State,
  rec: TaskingRecommendation,
): void {
  const idx = state.recommendations.findIndex(
    (r) => r.id === rec.id || r.trackId === rec.trackId,
  )
  if (idx >= 0) state.recommendations[idx] = rec
  else state.recommendations.push(rec)
}
