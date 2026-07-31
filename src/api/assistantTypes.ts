import type { AssignmentPlan } from '../types/missionPlanning'
import type { Position } from '../types'

export type AssistantTaskType =
  | 'AREA_OBSERVATION'
  | 'SEARCH'
  | 'RELAY'
  | 'ESCORT'
  | 'RESUPPLY'
  | 'MEDICAL_LOGISTICS'

export interface AssistantMissionDraft {
  id: string
  revision: number
  conversationId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  taskType: AssistantTaskType | null
  objective: string
  area: { name?: string; center?: Position; radiusM?: number } | null
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
  status: 'DRAFT' | 'READY_FOR_VALIDATION' | 'VALIDATED' | 'REJECTED' | 'SUBMITTED'
}

export interface AssistantHealth {
  service: string
  ready: boolean
  model: string
  detail: string
  boundaries: {
    c2ReadOnly: true
    gazeboAccess: false
    rawDeviceAccess: false
    commandAccess: false
  }
}

export interface AssistantTurnResponse {
  reply: string
  draft: AssistantMissionDraft | null
  contextRetrievedAt: string
  model: string
  stage: 'OBSERVE' | 'ORIENT' | 'DECIDE'
  intent:
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
  suggestedActions: AssistantSuggestedAction[]
}

export interface AssistantSuggestedAction {
  id: string
  label: string
  kind: 'MESSAGE' | 'UI_ACTION'
  message?: string
  action?: 'OPEN_INSPECTOR' | 'VALIDATE_DRAFT' | 'REQUEST_BEST_MATCH'
}

export type AssistantTurnStreamEvent =
  | { type: 'turn.started'; at: string }
  | { type: 'context.requested'; at: string }
  | { type: 'context.received'; at: string; retrievedAt: string; assetCount: number; trackCount: number }
  | { type: 'intent.classified'; at: string; intent: AssistantTurnResponse['intent']; stage: AssistantTurnResponse['stage'] }
  | { type: 'model.started'; at: string; model: string }
  | { type: 'model.progress'; at: string; chunks: number }
  | { type: 'model.completed'; at: string }
  | { type: 'draft.updated'; at: string; draft: AssistantMissionDraft }
  | { type: 'message.delta'; at: string; delta: string }
  | { type: 'turn.completed'; at: string; response: AssistantTurnResponse }
  | { type: 'turn.failed'; at: string; error: string }

export interface AssistantValidation {
  draftId: string
  revision: number
  deterministic: true
  executable: false
  valid: boolean
  errors: string[]
}

export interface AssistantRecommendationResponse {
  plan: AssignmentPlan
  deterministic: true
  executable: false
  sourceDraftId: string
  sourceDraftRevision: number
}
