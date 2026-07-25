import { useEffect } from 'react'
import { useAppDispatch, useAppSelector, store } from '../store'
import { cycleThreat } from '../store/threatsSlice'
import {
  executePrimaryConfirm,
  isTypingTarget,
  requestMissionHold,
  resolvePrimaryConfirm,
} from '../utils/operatorActions'
import { selectConfirmReadiness } from '../store/selectors'

/** Desktop hotkeys: 1/Enter confirm, H hold, [/] cycle threats. */
export function useOperatorKeyboard() {
  const dispatch = useAppDispatch()
  const missionState = useAppSelector((s) => s.mission.state)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const holdConfirmOpen = useAppSelector((s) => s.ui.holdConfirmOpen)
  const overflowMenuOpen = useAppSelector((s) => s.ui.overflowMenuOpen)
  const helpOpen = useAppSelector((s) => s.ui.helpOpen)
  const offlinePrepOpen = useAppSelector((s) => s.ui.offlinePrepOpen)
  const pendingModeSwitch = useAppSelector((s) => s.ui.pendingModeSwitch)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const readiness = useAppSelector(selectConfirmReadiness)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const modalOpen =
        recallOpen ||
        holdConfirmOpen ||
        overflowMenuOpen ||
        offlinePrepOpen ||
        helpOpen ||
        pendingModeSwitch

      if (modalOpen) return

      if (e.key === '[' || e.key === ']') {
        if (workspace !== 'tracks' || tracks.length === 0) return
        e.preventDefault()
        dispatch(cycleThreat(e.key === ']' ? 'next' : 'prev'))
        return
      }

      if (workspace !== 'tracks') return

      const holdActive = holdArmed || missionState === 'HOLD'
      const { pending, active, taskingReady } = resolvePrimaryConfirm(
        tracks,
        alertTrackIds,
        recommendations,
      )

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        requestMissionHold(dispatch, holdActive, e.shiftKey)
        return
      }

      if (e.key === '1' || e.key === 'Enter') {
        if (!taskingReady || !active || !readiness.ready) return
        e.preventDefault()
        executePrimaryConfirm(dispatch, store.getState, pending, active)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    dispatch,
    missionState,
    holdArmed,
    recallOpen,
    holdConfirmOpen,
    overflowMenuOpen,
    offlinePrepOpen,
    helpOpen,
    pendingModeSwitch,
    workspace,
    tracks,
    alertTrackIds,
    recommendations,
    readiness,
  ])
}
