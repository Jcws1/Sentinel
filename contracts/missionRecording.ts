import type {
  Drone,
  MissionSnapshot,
  TaskingRecommendation,
  ThreatTrack,
} from '../src/types'

export type MissionEventCategory = 'decision' | 'event'
export type MissionEventTone = 'normal' | 'important' | 'critical'

/**
 * Stable, append-only event envelope. `atMs` is mission-relative so recordings
 * can be replayed at any wall-clock time and on disconnected systems.
 */
export interface MissionRecordingEvent {
  schemaVersion: '1.0'
  missionId: string
  sequence: number
  eventId: string
  atMs: number
  observedAt: string
  category: MissionEventCategory
  type: string
  tone: MissionEventTone
  actor?: string
  entityIds: string[]
  summary: string
  payload?: Record<string, unknown>
}

/** Periodic materialized state for fast seeking; events remain the source of truth. */
export interface MissionStateKeyframe {
  atMs: number
  mission: MissionSnapshot
  drones: Drone[]
  tracks: ThreatTrack[]
  recommendations: TaskingRecommendation[]
}

export interface MissionRecordingManifest {
  schemaVersion: '1.0'
  missionId: string
  name: string
  operation: string
  startedAt: string
  endedAt: string
  durationMs: number
  outcome: 'completed' | 'aborted' | 'partial'
  eventCount: number
  keyframeIntervalMs: number
  coordinateFrame: 'WGS84'
  recordingFormat: 'sentinel-mission-ndjson'
}

export interface MissionRecording {
  manifest: MissionRecordingManifest
  events: MissionRecordingEvent[]
  keyframes: MissionStateKeyframe[]
}
