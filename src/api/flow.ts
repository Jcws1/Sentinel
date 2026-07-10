import type { OperatorFlowStage } from './types'
import type { TaskingRecommendation, ThreatTrack } from '../types'

export interface FlowSnapshot {
  stage: OperatorFlowStage
  label: string
  detail: string
  trackId: string | null
  recommendationId: string | null
}

/**
 * Maps store state → operator decision-loop stage.
 * Monitor → Detect → Recommend → Decide → Execute (→ Reallocate).
 */
export function resolveOperatorFlow(input: {
  tracks: ThreatTrack[]
  recommendations: TaskingRecommendation[]
  activeRecommendationId: string | null
  selectedTrackId: string | null
}): FlowSnapshot {
  const pending = input.recommendations.filter((r) => r.status === 'pending')
  const active =
    pending.find((r) => r.id === input.activeRecommendationId) ??
    pending[0] ??
    null

  const engaged = input.recommendations.filter((r) => r.status === 'confirmed')
  const selectedPending = pending.find((r) => r.trackId === input.selectedTrackId)

  if (active || selectedPending) {
    const rec = selectedPending ?? active!
    return {
      stage: 'decide',
      label: 'Decide',
      detail: 'Confirm or veto the proposed intercept',
      trackId: rec.trackId,
      recommendationId: rec.id,
    }
  }

  if (engaged.length > 0) {
    const rec = engaged.find((r) => r.trackId === input.selectedTrackId) ?? engaged[0]
    return {
      stage: 'execute',
      label: 'Execute',
      detail: 'Interceptor(s) prosecuting assigned track',
      trackId: rec.trackId,
      recommendationId: rec.id,
    }
  }

  const interceptable = input.tracks.filter(
    (t) => t.recommendedAction === 'Intercept',
  )

  const awaitingPlan = interceptable.filter(
    (t) =>
      !pending.some((r) => r.trackId === t.id) &&
      !engaged.some((r) => r.trackId === t.id),
  )

  if (pending.length > 0 && !active && !selectedPending) {
    return {
      stage: 'recommend',
      label: 'Recommend',
      detail: `${pending.length} intercept plan(s) ready for review`,
      trackId: pending[0].trackId,
      recommendationId: pending[0].id,
    }
  }

  if (awaitingPlan.length > 0 && pending.length === 0) {
    return {
      stage: 'detect',
      label: 'Detect',
      detail: `${awaitingPlan.length} interceptable track(s) — plan pending`,
      trackId: input.selectedTrackId ?? awaitingPlan[0].id,
      recommendationId: null,
    }
  }

  if (interceptable.length > 0) {
    return {
      stage: 'detect',
      label: 'Detect',
      detail: 'Fused tracks present — awaiting plan',
      trackId: input.selectedTrackId ?? interceptable[0].id,
      recommendationId: null,
    }
  }

  return {
    stage: 'monitor',
    label: 'Monitor',
    detail: 'No active intercept decisions',
    trackId: input.selectedTrackId,
    recommendationId: null,
  }
}

export const FLOW_STEPS: OperatorFlowStage[] = [
  'monitor',
  'detect',
  'recommend',
  'decide',
  'execute',
]
