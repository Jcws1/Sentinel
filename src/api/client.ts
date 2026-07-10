import type {
  DecisionLogDto,
  FusionTrackDetailDto,
  FusionTracksDto,
  MissionStatusDto,
  PolicyDto,
  RealtimeEvent,
  TaskingDecisionRequest,
  TaskingPlanRequest,
  TelemetryDto,
} from './types'
import type { TaskingRecommendation } from '../types'

/**
 * Sentinel C2 backend surface (PRD §6.2).
 * Phase 2: MockC2Client. Phase 3+: WebSocketC2Client against local services.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export interface SentinelC2Client {
  connect(
    onEvent: (event: RealtimeEvent) => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): () => void


  getMissionStatus(): Promise<MissionStatusDto>
  getTracks(): Promise<FusionTracksDto>
  getTrackDetail(trackId: string): Promise<FusionTrackDetailDto>
  getTelemetry(): Promise<TelemetryDto>
  getPolicy(): Promise<PolicyDto>
  getDecisionLog(): Promise<DecisionLogDto>

  requestPlan(body: TaskingPlanRequest): Promise<TaskingRecommendation>
  engageTrack(
    trackId: string,
  ): Promise<{ accepted: boolean; trackId: string; droneIds: string[] }>
  submitDecision(body: TaskingDecisionRequest): Promise<{ accepted: boolean }>
  abortEngagement(trackId: string): Promise<{ accepted: boolean }>
  holdTrack(trackId: string): Promise<{ accepted: boolean }>
  setMissionState(state: MissionStatusDto['state']): Promise<MissionStatusDto>
}

export const API_ROUTES = {
  mission: '/api/v1/mission',
  tracks: '/api/v1/fusion/tracks',
  trackDetail: (id: string) => `/api/v1/fusion/tracks/${id}`,
  telemetry: '/api/v1/telemetry',
  policy: '/api/v1/policy',
  decisions: '/api/v1/decisions',
  taskingPlan: '/api/v1/tasking/plan',
  taskingEngage: '/api/v1/tasking/engage',
  taskingDecision: '/api/v1/tasking/decision',
  taskingAbort: '/api/v1/tasking/abort',
  trackHold: (id: string) => `/api/v1/tracks/${id}/hold`,
  realtime: '/api/v1/ws',
} as const

/** External services the UI may call (non-C2). */
export const EXTERNAL_SERVICES = {
  mapbox: {
    style: 'mapbox://styles/mapbox/dark-v11',
    tiles: 'https://api.mapbox.com/v4',
    geocoding: 'https://api.mapbox.com/geocoding/v5',
    note: 'Basemap only. No mission logic off-box.',
  },
} as const
