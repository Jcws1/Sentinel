import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import {
  executePrimaryConfirm,
  isTypingTarget,
  resolvePrimaryConfirm,
  toggleMissionHold,
} from '../utils/operatorActions'

/** Desktop hotkeys: 1 / Enter = confirm, H = hold/resume. No on-map chrome. */
export function useOperatorKeyboard() {
  const dispatch = useAppDispatch()
  const missionState = useAppSelector((s) => s.mission.state)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const overflowMenuOpen = useAppSelector((s) => s.ui.overflowMenuOpen)
  const helpOpen = useAppSelector((s) => s.ui.helpOpen)
  const offlinePrepOpen = useAppSelector((s) => s.ui.offlinePrepOpen)
  const pendingModeSwitch = useAppSelector((s) => s.ui.pendingModeSwitch)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (
        recallOpen ||
        overflowMenuOpen ||
        offlinePrepOpen ||
        helpOpen ||
        pendingModeSwitch ||
        workspace !== 'tracks'
      ) {
        return
      }

      const holdActive = holdArmed || missionState === 'HOLD'
      const { pending, active, taskingReady } = resolvePrimaryConfirm(
        tracks,
        alertTrackIds,
        recommendations,
      )

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        toggleMissionHold(dispatch, holdActive)
        return
      }

      if (e.key === '1' || e.key === 'Enter') {
        if (!taskingReady || !active) return
        e.preventDefault()
        executePrimaryConfirm(dispatch, pending, active)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    dispatch,
    missionState,
    holdArmed,
    recallOpen,
    overflowMenuOpen,
    offlinePrepOpen,
    helpOpen,
    pendingModeSwitch,
    workspace,
    tracks,
    alertTrackIds,
    recommendations,
  ])
}
