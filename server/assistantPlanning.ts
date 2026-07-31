import type { MissionDraft } from '../assistant/types'
import { validateMissionDraft } from '../assistant/missionDraft'
import type { OperationalMissionType, OperationalObjective } from '../src/types/missionPlanning'

const TASK_TYPE_MAP: Record<NonNullable<MissionDraft['taskType']>, OperationalMissionType> = {
  AREA_OBSERVATION: 'recon_area',
  SEARCH: 'recon_area',
  RELAY: 'relay_position',
  ESCORT: 'escort_group',
  RESUPPLY: 'resupply',
  MEDICAL_LOGISTICS: 'medical_logistics',
}

const CAPABILITY_ALIASES: Record<string, string> = {
  'eo/ir': 'camera',
  eo: 'camera',
  ir: 'camera',
  imagery: 'camera',
  observation: 'camera',
  reconnaissance: 'recon',
  communications: 'comms',
  cargo: 'cargo',
  medical: 'medical',
}

function normalizedCapabilities(values: string[]): string[] {
  return [...new Set(values.map((value) => {
    const key = value.trim().toLowerCase()
    return CAPABILITY_ALIASES[key] ?? key
  }).filter(Boolean))]
}

export function objectiveFromAssistantDraft(draft: MissionDraft): OperationalObjective {
  const validation = validateMissionDraft(draft)
  if (!validation.valid || !draft.taskType) {
    const issues = [
      ...validation.errors,
      ...validation.unresolvedFields.map((field) => `${field} is required`),
    ]
    throw new Error(issues.join('; ') || 'Mission draft is incomplete')
  }
  const objective: OperationalObjective = {
    id: `assistant-${draft.id}-r${draft.revision}`,
    name: draft.objective,
    type: TASK_TYPE_MAP[draft.taskType],
    priority: draft.priority ?? 50,
    targetPosition: draft.area?.center,
    requiredCapabilities: normalizedCapabilities(draft.requiredCapabilities),
    minVehicles: 1,
    maxVehicles: 1,
    batteryReservePercent: draft.minimumReservePercent ?? 20,
  }
  return objective
}
