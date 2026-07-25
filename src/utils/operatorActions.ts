import type { AppDispatch, RootState } from '../store'
import type { TaskingRecommendation } from '../types'
import {
  confirmAllPendingCommand,
  engageTrackCommand,
  setMissionStateCommand,
} from '../store/commandThunks'
import {
  armConfirm,
  disarmConfirm,
  setHoldArmed,
  setHoldConfirmOpen,
} from '../store/uiSlice'
import { getTopPriorityPendingRecommendation } from './tasking'

export function executePrimaryConfirm(
  dispatch: AppDispatch,
  getState: () => RootState,
  pending: TaskingRecommendation[],
  active: TaskingRecommendation | null,
) {
  if (!active) return
  const state = getState()
  const multi = pending.length > 1
  const armed = state.ui.confirmArmed
  const expires = state.ui.confirmArmExpiresAt
  const armValid = armed && expires != null && Date.now() < expires

  if (multi && !armValid) {
    dispatch(armConfirm())
    return
  }

  dispatch(disarmConfirm())
  if (multi) {
    void dispatch(confirmAllPendingCommand(pending.map((r) => r.id)))
    return
  }
  void dispatch(engageTrackCommand(active.trackId))
}

export function resolvePrimaryConfirm(
  tracks: RootState['threats']['tracks'],
  alertTrackIds: string[],
  recommendations: RootState['tasking']['recommendations'],
) {
  const pending = recommendations.filter((r) => r.status === 'pending')
  const active = getTopPriorityPendingRecommendation(
    tracks,
    alertTrackIds,
    recommendations,
  )
  return { pending, active, taskingReady: Boolean(active) }
}

export function requestMissionHold(
  dispatch: AppDispatch,
  holdActive: boolean,
  immediate = false,
) {
  if (holdActive) {
    dispatch(setHoldArmed(false))
    void dispatch(setMissionStateCommand('ACTIVE'))
    return
  }
  if (immediate) {
    dispatch(setHoldArmed(true))
    void dispatch(setMissionStateCommand('HOLD'))
    return
  }
  dispatch(setHoldConfirmOpen(true))
}

export function confirmMissionHold(dispatch: AppDispatch) {
  dispatch(setHoldConfirmOpen(false))
  dispatch(setHoldArmed(true))
  void dispatch(setMissionStateCommand('HOLD'))
}

export function toggleMissionHold(
  dispatch: AppDispatch,
  holdActive: boolean,
) {
  requestMissionHold(dispatch, holdActive, false)
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
