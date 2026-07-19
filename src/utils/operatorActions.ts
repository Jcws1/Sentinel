import type { AppDispatch } from '../store'
import type { TaskingRecommendation, ThreatTrack } from '../types'
import {
  confirmAllPendingCommand,
  engageTrackCommand,
  setMissionStateCommand,
} from '../store/commandThunks'
import { setHoldArmed } from '../store/uiSlice'
import { getTopPriorityPendingRecommendation } from './tasking'

export function executePrimaryConfirm(
  dispatch: AppDispatch,
  pending: TaskingRecommendation[],
  active: TaskingRecommendation | null,
) {
  if (!active) return
  if (pending.length > 1) {
    void dispatch(confirmAllPendingCommand(pending.map((r) => r.id)))
    return
  }
  void dispatch(engageTrackCommand(active.trackId))
}

export function resolvePrimaryConfirm(
  tracks: ThreatTrack[],
  alertTrackIds: string[],
  recommendations: TaskingRecommendation[],
) {
  const pending = recommendations.filter((r) => r.status === 'pending')
  const active = getTopPriorityPendingRecommendation(
    tracks,
    alertTrackIds,
    recommendations,
  )
  return { pending, active, taskingReady: Boolean(active) }
}

export function toggleMissionHold(
  dispatch: AppDispatch,
  holdActive: boolean,
) {
  if (holdActive) {
    dispatch(setHoldArmed(false))
    void dispatch(setMissionStateCommand('ACTIVE'))
    return
  }
  dispatch(setHoldArmed(true))
  void dispatch(setMissionStateCommand('HOLD'))
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
