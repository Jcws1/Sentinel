import type {
  CommsState,
  Drone,
  GnssState,
  IntentAction,
  MissionState,
  PolicyZone,
  Position,
  TaskingRecommendation,
  ThreatTrack,
} from '../types'

/** Wire envelopes shared by REST + WebSocket payloads. */
export interface ApiEnvelope<T> {
  ts: number
  missionId: string
  data: T
}

export interface MissionStatusDto {
  state: MissionState
  gnss: GnssState
  fallbackPositioning: string | null
  c2Link: CommsState
  swarmAutonomy: boolean
  protectedAsset: Position
}

export interface FusionTracksDto {
  tracks: ThreatTrack[]
}

export interface FusionTrackDetailDto {
  track: ThreatTrack
  provenance: Array<{
    sensorId: string
    sensorType: 'radar' | 'rf' | 'eo_ir' | 'acoustic' | 'telemetry'
    reading: Position
    confidence: number
  }>
  algorithm: string
  anomalies: string[]
}

export interface TelemetryDto {
  drones: Drone[]
  meshLinks: Array<{ from: string; to: string; quality: number }>
}

export interface TaskingPlanRequest {
  trackId: string
  intent?: IntentAction
  preferredDroneIds?: string[]
}

export interface TaskingDecisionRequest {
  recommendationId: string
  decision: 'confirm' | 'veto'
  intent?: IntentAction
}

export interface PolicyDto {
  zones: PolicyZone[]
  rules: Array<{
    id: string
    expression: string
    action: string
  }>
  summary: string[]
  readOnly: boolean
}

export interface DecisionLogDto {
  entries: Array<{
    id: string
    timestamp: number
    actor: 'operator' | 'system' | 'authority'
    action: string
    detail: string
  }>
}

export interface MissionSnapshotDto {
  missionId: string
  mission: MissionStatusDto
  tracks: ThreatTrack[]
  drones: Drone[]
  recommendations: TaskingRecommendation[]
  decisionLog: DecisionLogDto['entries']
  policy: PolicyDto
  alertTrackIds: string[]
}

export type RealtimeEvent =
  | { type: 'state.snapshot'; payload: MissionSnapshotDto }
  | { type: 'mission.status'; payload: MissionStatusDto }
  | { type: 'fusion.tracks'; payload: FusionTracksDto }
  | { type: 'telemetry.fleet'; payload: TelemetryDto }
  | { type: 'tasking.recommendation'; payload: TaskingRecommendation }
  | { type: 'tasking.retask'; payload: TaskingRecommendation & { autoExecuteAt: number } }
  | { type: 'policy.updated'; payload: PolicyDto }
  | { type: 'alert.system'; payload: { severity: 'info' | 'warn' | 'crit'; message: string } }

/** Operator decision loop stages (UI + audit). */
export type OperatorFlowStage =
  | 'monitor'
  | 'detect'
  | 'recommend'
  | 'decide'
  | 'execute'
  | 'reallocate'
