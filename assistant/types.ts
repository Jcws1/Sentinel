import type { Position } from '../src/types'

export const ASSISTANT_TASK_TYPES = [
  'AREA_OBSERVATION',
  'SEARCH',
  'RELAY',
  'ESCORT',
  'RESUPPLY',
  'MEDICAL_LOGISTICS',
] as const

export type AssistantTaskType = (typeof ASSISTANT_TASK_TYPES)[number]

export type MissionDraftStatus =
  | 'DRAFT'
  | 'READY_FOR_VALIDATION'
  | 'VALIDATED'
  | 'REJECTED'
  | 'SUBMITTED'

export interface MissionArea {
  name?: string
  center?: Position
  radiusM?: number
}

export interface MissionDraft {
  id: string
  revision: number
  conversationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  taskType: AssistantTaskType | null
  objective: string
  area: MissionArea | null
  earliestStart: string | null
  latestStart: string | null
  deadline: string | null
  durationMinutes: number | null
  priority: number | null
  requiredCapabilities: string[]
  minimumConfidence: number | null
  minimumReservePercent: number | null
  communicationsPolicy: 'CONNECTED_REQUIRED' | 'DEGRADED_ALLOWED' | null
  authorityReference: string | null
  approvalRequired: true
  assumptions: string[]
  unresolvedFields: string[]
  status: MissionDraftStatus
}

export type MissionDraftPatch = Partial<
  Pick<
    MissionDraft,
    | 'taskType'
    | 'objective'
    | 'area'
    | 'earliestStart'
    | 'latestStart'
    | 'deadline'
    | 'durationMinutes'
    | 'priority'
    | 'requiredCapabilities'
    | 'minimumConfidence'
    | 'minimumReservePercent'
    | 'communicationsPolicy'
    | 'authorityReference'
    | 'assumptions'
  >
>

export interface CompactAssetState {
  assetId: string
  displayName: string
  platformType: string
  batteryPercent: number
  position: Position
  positioningConfidence: number
  linkState: string
  payloadStatus: string
  assignedMissionId: string | null
  lifecycle: string
}

export interface CompactThreatTrack {
  trackId: string
  threatClass: string
  position: Position
  speed: number
  altitude: number
  etaToProtectedAssetSeconds: number
  fusionConfidence: number
  contributingSensors: string[]
  alert: boolean
}

export interface CompactC2Context {
  retrievedAt: string
  source: 'SENTINEL_C2_CANONICAL_SNAPSHOT'
  mission: {
    id: string
    state: string
    c2Link: string
    gnss: string
  }
  assets: CompactAssetState[]
  tracks: CompactThreatTrack[]
  policy: {
    summary: string[]
    machineEvaluable: false
    limitation: string
  }
  limitations: string[]
}

export interface AssistantModelOutput {
  reply: string
  draftPatch?: MissionDraftPatch
}

export type OodStage = 'OBSERVE' | 'ORIENT' | 'DECIDE'

export type AssistantIntent =
  | 'OBSERVE_AVAILABLE_ASSETS'
  | 'OBSERVE_INBOUND_THREATS'
  | 'OBSERVE_THREAT_LOCATIONS'
  | 'OBSERVE_CHANGES'
  | 'OBSERVE_STATUS'
  | 'EXPLAIN_BOUNDARY'
  | 'START_OR_UPDATE_DRAFT'
  | 'AMBIGUOUS_VALUE'
  | 'ACKNOWLEDGEMENT'
  | 'UNKNOWN'

export interface AssistantSuggestedAction {
  id: string
  label: string
  kind: 'MESSAGE' | 'UI_ACTION'
  message?: string
  action?: 'OPEN_INSPECTOR' | 'VALIDATE_DRAFT' | 'REQUEST_BEST_MATCH'
}

export interface AssistantTurnRequest {
  conversationId: string
  operatorId: string
  message: string
  draftId?: string
}

export interface AssistantTurnResponse {
  reply: string
  draft: MissionDraft | null
  contextRetrievedAt: string
  model: string
  stage: OodStage
  intent: AssistantIntent
  suggestedActions: AssistantSuggestedAction[]
}

export type AssistantTurnStreamEvent =
  | { type: 'turn.started'; at: string }
  | { type: 'context.requested'; at: string }
  | { type: 'context.received'; at: string; retrievedAt: string; assetCount: number; trackCount: number }
  | { type: 'intent.classified'; at: string; intent: AssistantIntent; stage: OodStage }
  | { type: 'model.started'; at: string; model: string }
  | { type: 'model.progress'; at: string; chunks: number }
  | { type: 'model.completed'; at: string }
  | { type: 'draft.updated'; at: string; draft: MissionDraft }
  | { type: 'message.delta'; at: string; delta: string }
  | { type: 'turn.completed'; at: string; response: AssistantTurnResponse }
  | { type: 'turn.failed'; at: string; error: string }

export interface AssistantAuditEntry {
  id: string
  conversationId: string
  operatorId: string
  createdAt: string
  model: string
  userMessage: string
  assistantReply: string
  tools: string[]
  draftId: string | null
  contextRetrievedAt: string
}
