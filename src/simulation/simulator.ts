import type { AppDispatch, RootState } from '../store'
import { updateDronePositions } from '../store/fleetSlice'
import {
  updateThreatEtas,
  updateThreatPositions,
} from '../store/threatsSlice'
import { upsertRecommendation } from '../store/taskingSlice'
import { buildRecommendation } from '../utils/tasking'
import type { Position } from '../types'

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

export function startSimulator(
  getState: () => RootState,
  dispatch: AppDispatch,
): () => void {
  let tick = 0
  let seeded = false

  const interval = window.setInterval(() => {
    tick += 1
    const state = getState()
    const asset = state.mission.protectedAsset

    const dronePositions: Record<string, Position> = {}
    for (const drone of state.fleet.drones) {
      if (drone.assignedTrackId) {
        const track = state.threats.tracks.find(
          (t) => t.id === drone.assignedTrackId,
        )
        if (track) {
          const blend = 0.08
          dronePositions[drone.id] = {
            lng: drone.position.lng + (track.position.lng - drone.position.lng) * blend,
            lat: drone.position.lat + (track.position.lat - drone.position.lat) * blend,
            alt: drone.position.alt + (track.position.alt - drone.position.alt) * blend,
          }
          continue
        }
      }

      const phase =
        drone.id.charCodeAt(drone.id.length - 1) * 0.4 +
        (drone.type === 'Scout' ? 1 : 0)
      const radius = drone.type === 'Scout' ? 0.004 : drone.type === 'Relay' ? 0.0015 : 0.0025
      const offset = orbitOffset(tick * 0.02, radius, phase)
      dronePositions[drone.id] = {
        lng: drone.position.lng * 0.98 + (asset.lng + offset.lng) * 0.02,
        lat: drone.position.lat * 0.98 + (asset.lat + offset.lat) * 0.02,
        alt: drone.position.alt,
      }
    }
    dispatch(updateDronePositions(dronePositions))

    const threatPositions: Record<string, Position> = {}
    const etas: Record<string, number> = {}
    for (const track of state.threats.tracks) {
      const vel = THREAT_VELOCITY[track.id] ?? { dLng: -0.00002, dLat: -0.00002 }
      const next = {
        lng: track.position.lng + vel.dLng,
        lat: track.position.lat + vel.dLat,
        alt: track.altitude,
      }
      threatPositions[track.id] = next
      const dLat = (next.lat - asset.lat) * 111_320
      const dLng =
        (next.lng - asset.lng) * 111_320 * Math.cos((next.lat * Math.PI) / 180)
      const dist = Math.hypot(dLat, dLng)
      etas[track.id] = Math.max(5, Math.round(dist / Math.max(track.speed, 1)))
    }
    dispatch(updateThreatPositions(threatPositions))
    dispatch(updateThreatEtas(etas))

    if (!seeded || tick % 20 === 0) {
      seeded = true
      const latest = getState()
      for (const track of latest.threats.tracks) {
        const existing = latest.tasking.recommendations.find(
          (r) => r.trackId === track.id && r.status === 'pending',
        )
        const confirmed = latest.tasking.recommendations.find(
          (r) => r.trackId === track.id && r.status === 'confirmed',
        )
        if (existing || confirmed) continue
        if (track.recommendedAction !== 'Intercept') continue
        const rec = buildRecommendation(track, latest.fleet.drones)
        if (rec) dispatch(upsertRecommendation(rec))
      }
    }
  }, 400)

  return () => window.clearInterval(interval)
}
