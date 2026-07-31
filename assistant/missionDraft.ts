import { randomUUID } from 'node:crypto'
import {
  ASSISTANT_TASK_TYPES,
  type MissionArea,
  type MissionDraft,
  type MissionDraftPatch,
} from './types'

const MAX_TEXT = 500
const MAX_LIST_ITEMS = 24

function cleanText(value: unknown, maximum = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim().slice(0, maximum)
  return result || null
}

function cleanNullableText(value: unknown): string | null {
  if (value === null) return null
  return cleanText(value)
}

function cleanNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(maximum, Math.max(minimum, value))
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => cleanText(item, 120))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_LIST_ITEMS)
}

function cleanArea(value: unknown): MissionArea | null {
  if (value === null) return null
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const area: MissionArea = {}
  const name = cleanText(candidate.name, 160)
  if (name) area.name = name
  if (candidate.center && typeof candidate.center === 'object') {
    const center = candidate.center as Record<string, unknown>
    if (
      typeof center.lat === 'number' &&
      Number.isFinite(center.lat) &&
      typeof center.lng === 'number' &&
      Number.isFinite(center.lng)
    ) {
      area.center = {
        lat: Math.min(90, Math.max(-90, center.lat)),
        lng: Math.min(180, Math.max(-180, center.lng)),
        alt:
          typeof center.alt === 'number' && Number.isFinite(center.alt)
            ? center.alt
            : 0,
      }
    }
  }
  const radiusM = cleanNumber(candidate.radiusM, 1, 1_000_000)
  if (radiusM !== null) area.radiusM = radiusM
  return Object.keys(area).length > 0 ? area : null
}

export function unresolvedMissionFields(draft: MissionDraft): string[] {
  const unresolved: string[] = []
  if (!draft.taskType) unresolved.push('taskType')
  if (!draft.objective) unresolved.push('objective')
  if (!draft.area) unresolved.push('area')
  if (draft.durationMinutes === null && draft.deadline === null) {
    unresolved.push('durationMinutesOrDeadline')
  }
  if (draft.priority === null) unresolved.push('priority')
  if (!draft.communicationsPolicy) unresolved.push('communicationsPolicy')
  if (!draft.authorityReference) unresolved.push('authorityReference')
  return unresolved
}

export function createMissionDraft(input: {
  conversationId: string
  operatorId: string
  now?: string
}): MissionDraft {
  const now = input.now ?? new Date().toISOString()
  const draft: MissionDraft = {
    id: randomUUID(),
    revision: 1,
    conversationId: input.conversationId,
    createdBy: input.operatorId,
    createdAt: now,
    updatedAt: now,
    taskType: null,
    objective: '',
    area: null,
    earliestStart: null,
    latestStart: null,
    deadline: null,
    durationMinutes: null,
    priority: null,
    requiredCapabilities: [],
    minimumConfidence: null,
    minimumReservePercent: null,
    communicationsPolicy: null,
    authorityReference: null,
    approvalRequired: true,
    assumptions: [],
    unresolvedFields: [],
    status: 'DRAFT',
  }
  draft.unresolvedFields = unresolvedMissionFields(draft)
  return draft
}

export function sanitizeMissionDraftPatch(value: unknown): MissionDraftPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const candidate = value as Record<string, unknown>
  const patch: MissionDraftPatch = {}

  if ('taskType' in candidate) {
    patch.taskType = ASSISTANT_TASK_TYPES.includes(
      candidate.taskType as (typeof ASSISTANT_TASK_TYPES)[number],
    )
      ? (candidate.taskType as (typeof ASSISTANT_TASK_TYPES)[number])
      : null
  }
  if ('objective' in candidate) patch.objective = cleanText(candidate.objective) ?? ''
  if ('area' in candidate) patch.area = cleanArea(candidate.area)
  if ('earliestStart' in candidate) {
    patch.earliestStart = cleanNullableText(candidate.earliestStart)
  }
  if ('latestStart' in candidate) {
    patch.latestStart = cleanNullableText(candidate.latestStart)
  }
  if ('deadline' in candidate) patch.deadline = cleanNullableText(candidate.deadline)
  if ('durationMinutes' in candidate) {
    patch.durationMinutes = cleanNumber(candidate.durationMinutes, 1, 10_080)
  }
  if ('priority' in candidate) patch.priority = cleanNumber(candidate.priority, 0, 100)
  if ('requiredCapabilities' in candidate) {
    patch.requiredCapabilities = cleanList(candidate.requiredCapabilities)
  }
  if ('minimumConfidence' in candidate) {
    patch.minimumConfidence = cleanNumber(candidate.minimumConfidence, 0, 1)
  }
  if ('minimumReservePercent' in candidate) {
    patch.minimumReservePercent = cleanNumber(
      candidate.minimumReservePercent,
      0,
      100,
    )
  }
  if ('communicationsPolicy' in candidate) {
    patch.communicationsPolicy =
      candidate.communicationsPolicy === 'CONNECTED_REQUIRED' ||
      candidate.communicationsPolicy === 'DEGRADED_ALLOWED'
        ? candidate.communicationsPolicy
        : null
  }
  if ('authorityReference' in candidate) {
    patch.authorityReference = cleanNullableText(candidate.authorityReference)
  }
  if ('assumptions' in candidate) patch.assumptions = cleanList(candidate.assumptions)
  return patch
}

export function applyMissionDraftPatch(
  draft: MissionDraft,
  value: unknown,
  now = new Date().toISOString(),
): MissionDraft {
  const patch = sanitizeMissionDraftPatch(value)
  const updated: MissionDraft = {
    ...draft,
    ...patch,
    id: draft.id,
    revision: draft.revision + 1,
    conversationId: draft.conversationId,
    createdBy: draft.createdBy,
    createdAt: draft.createdAt,
    updatedAt: now,
    approvalRequired: true,
    status: 'DRAFT',
    unresolvedFields: [],
  }
  updated.unresolvedFields = unresolvedMissionFields(updated)
  updated.status =
    updated.unresolvedFields.length === 0 ? 'READY_FOR_VALIDATION' : 'DRAFT'
  return updated
}

export function validateMissionDraft(draft: MissionDraft): {
  valid: boolean
  unresolvedFields: string[]
  errors: string[]
} {
  const unresolvedFields = unresolvedMissionFields(draft)
  const errors: string[] = []
  if (draft.earliestStart && draft.latestStart) {
    const earliest = Date.parse(draft.earliestStart)
    const latest = Date.parse(draft.latestStart)
    if (Number.isFinite(earliest) && Number.isFinite(latest) && earliest > latest) {
      errors.push('earliestStart must not be after latestStart')
    }
  }
  if (draft.minimumConfidence !== null && draft.minimumConfidence > 1) {
    errors.push('minimumConfidence must be between 0 and 1')
  }
  return {
    valid: unresolvedFields.length === 0 && errors.length === 0,
    unresolvedFields,
    errors,
  }
}

