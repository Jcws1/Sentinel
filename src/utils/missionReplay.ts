import type { MissionRecording, MissionStateKeyframe } from '../../contracts/missionRecording'
import type { Drone, Position, ThreatTrack } from '../types'

function interpolateNumber(left: number, right: number, progress: number): number {
  return left + (right - left) * progress
}

function interpolatePosition(left: Position, right: Position, progress: number): Position {
  return {
    lng: interpolateNumber(left.lng, right.lng, progress),
    lat: interpolateNumber(left.lat, right.lat, progress),
    alt: interpolateNumber(left.alt, right.alt, progress),
  }
}

function interpolateDrones(left: Drone[], right: Drone[], progress: number): Drone[] {
  const rightById = new Map(right.map((drone) => [drone.id, drone]))
  return left.flatMap((drone) => {
    const next = rightById.get(drone.id)
    if (!next) return progress < 1 ? [drone] : []
    return [{
      ...drone,
      ...next,
      battery: Math.round(interpolateNumber(drone.battery, next.battery, progress)),
      positioningConfidence: Math.round(
        interpolateNumber(drone.positioningConfidence, next.positioningConfidence, progress),
      ),
      position: interpolatePosition(drone.position, next.position, progress),
    }]
  })
}

function interpolateTracks(
  left: ThreatTrack[],
  right: ThreatTrack[],
  progress: number,
): ThreatTrack[] {
  const rightById = new Map(right.map((track) => [track.id, track]))
  return left.flatMap((track) => {
    const next = rightById.get(track.id)
    if (!next) return progress < 1 ? [track] : []
    return [{
      ...track,
      ...next,
      position: interpolatePosition(track.position, next.position, progress),
      altitude: interpolateNumber(track.altitude, next.altitude, progress),
      bearing: interpolateNumber(track.bearing, next.bearing, progress),
      speed: interpolateNumber(track.speed, next.speed, progress),
      etaToAsset: Math.round(interpolateNumber(track.etaToAsset, next.etaToAsset, progress)),
    }]
  })
}

export function frameAt(
  recording: MissionRecording,
  positionMs: number,
): MissionStateKeyframe {
  const ordered = recording.keyframes
  if (!ordered.length) throw new Error('mission recording has no keyframes')
  const clamped = Math.max(0, Math.min(recording.manifest.durationMs, positionMs))
  const rightIndex = ordered.findIndex((frame) => frame.atMs >= clamped)
  if (rightIndex <= 0) return ordered[0]
  if (rightIndex < 0) return ordered[ordered.length - 1]
  const left = ordered[rightIndex - 1]
  const right = ordered[rightIndex]
  const span = Math.max(1, right.atMs - left.atMs)
  const progress = (clamped - left.atMs) / span
  return {
    atMs: clamped,
    mission: progress < 1 ? left.mission : right.mission,
    recommendations: progress < 1 ? left.recommendations : right.recommendations,
    drones: interpolateDrones(left.drones, right.drones, progress),
    tracks: interpolateTracks(left.tracks, right.tracks, progress),
  }
}
