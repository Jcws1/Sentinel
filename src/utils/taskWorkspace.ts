import type { Drone, TaskingRecommendation } from '../types'

export type TaskWorkspacePhase = 'proposed' | 'executing' | 'closed'

export interface TaskWorkspaceCustody {
  phase: TaskWorkspacePhase
  label: string
  detail: string
  activeStep: number
}

export function taskWorkspaceCustody(
  recommendation: Pick<TaskingRecommendation, 'status'>,
): TaskWorkspaceCustody {
  if (recommendation.status === 'pending') {
    return {
      phase: 'proposed',
      label: 'Proposed',
      detail: 'Not sent',
      activeStep: 0,
    }
  }

  if (
    recommendation.status === 'confirmed' ||
    recommendation.status === 'auto-executing'
  ) {
    return {
      phase: 'executing',
      label: recommendation.status === 'auto-executing' ? 'Auto-executing' : 'Confirmed',
      detail: 'Aircraft acknowledgement unavailable',
      activeStep: 2,
    }
  }

  return {
    phase: 'closed',
    label: 'Rejected',
    detail: 'No command sent',
    activeStep: -1,
  }
}

export function taskReference(recommendationId: string): string {
  const suffix = recommendationId.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase()
  return `TASK-${suffix || 'NEW'}`
}

export interface MissionPlanSummary {
  groupCount: number
  assignedAssetCount: number
  reserveCount: number
  reviewCount: number
  executingCount: number
}

export function missionPlanSummary(
  recommendations: TaskingRecommendation[],
  drones: Drone[],
): MissionPlanSummary {
  const assignedAssetIds = new Set(recommendations.flatMap((recommendation) => recommendation.droneIds))
  const availableAssetIds = new Set(
    drones
      .filter((drone) => drone.comms !== 'lost' && drone.battery >= 25)
      .map((drone) => drone.id),
  )

  return {
    groupCount: recommendations.length,
    assignedAssetCount: assignedAssetIds.size,
    reserveCount: [...availableAssetIds].filter((id) => !assignedAssetIds.has(id)).length,
    reviewCount: recommendations.filter((recommendation) => recommendation.status === 'pending').length,
    executingCount: recommendations.filter(
      (recommendation) => recommendation.status === 'confirmed' || recommendation.status === 'auto-executing',
    ).length,
  }
}
