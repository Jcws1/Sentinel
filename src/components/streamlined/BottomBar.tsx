import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { store } from '../../store'
import {
  selectPendingCount,
  selectPendingRecommendations,
  selectConfirmReadiness,
  selectTopPriorityPending,
} from '../../store/selectors'
import {
  setRecallConfirmOpen,
  toggleFleetStrip,
  toggleOverlayPanel,
  disarmConfirm,
} from '../../store/uiSlice'
import { setMissionStateCommand } from '../../store/commandThunks'
import { executePrimaryConfirm, requestMissionHold } from '../../utils/operatorActions'
import { useLongPress } from './useLongPress'

export function BottomBar() {
  const dispatch = useAppDispatch()
  const fleetOpen = useAppSelector((s) => s.ui.fleetStripOpen)
  const overlaysOpen = useAppSelector((s) => s.ui.overlayPanelOpen)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const confirmArmed = useAppSelector((s) => s.ui.confirmArmed)
  const confirmExpires = useAppSelector((s) => s.ui.confirmArmExpiresAt)
  const missionState = useAppSelector((s) => s.mission.state)
  const connected = useAppSelector((s) => s.session.connected)
  const pending = useAppSelector(selectPendingRecommendations)
  const pendingCount = useAppSelector(selectPendingCount)
  const active = useAppSelector(selectTopPriorityPending)
  const readiness = useAppSelector(selectConfirmReadiness)
  const holdActive = holdArmed || missionState === 'HOLD'
  const multi = pendingCount > 1
  const armValid =
    confirmArmed && confirmExpires != null && Date.now() < confirmExpires

  useEffect(() => {
    if (!confirmArmed || !confirmExpires) return
    const ms = confirmExpires - Date.now()
    if (ms <= 0) {
      dispatch(disarmConfirm())
      return
    }
    const t = window.setTimeout(() => dispatch(disarmConfirm()), ms)
    return () => window.clearTimeout(t)
  }, [confirmArmed, confirmExpires, dispatch])

  const recallPress = useLongPress({
    onTap: () => dispatch(setRecallConfirmOpen(true)),
    onLongPress: () => {
      dispatch(setRecallConfirmOpen(false))
      void dispatch(setMissionStateCommand('RECALL'))
    },
    ms: 3000,
  })

  const holdPress = useLongPress({
    onTap: () => requestMissionHold(dispatch, holdActive, false),
    onLongPress: () => requestMissionHold(dispatch, holdActive, true),
    ms: 3000,
  })

  const taskingReady = Boolean(active) && readiness.ready
  const confirmLabel = !active
    ? 'AWAITING TASKING'
    : !readiness.ready
      ? readiness.blocked
        ? 'CONFIRM BLOCKED'
        : 'AWAITING TASKING'
      : multi && !armValid
        ? `ARM ALL (${pendingCount})`
        : multi && armValid
          ? `CONFIRM ALL (${pendingCount})`
          : `CONFIRM · ${active!.trackId}`

  return (
    <nav className="v4-bottom-bar" aria-label="Primary actions" data-operator-ui>
      <button
        type="button"
        className={['v4-btn', fleetOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-pressed={fleetOpen}
        onClick={() => dispatch(toggleFleetStrip())}
      >
        {fleetOpen ? 'FLEET ▲' : 'FLEET'}
      </button>
      <button
        type="button"
        className={['v4-btn', overlaysOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-pressed={overlaysOpen}
        onClick={() => dispatch(toggleOverlayPanel())}
      >
        {overlaysOpen ? 'OVERLAYS ▲' : 'OVERLAYS'}
      </button>
      <button
        type="button"
        className={['v4-btn v4-btn--hold', holdActive ? 'is-active' : '']
          .filter(Boolean)
          .join(' ')}
        aria-pressed={holdActive}
        {...holdPress}
      >
        {holdActive ? 'RESUME' : 'HOLD'}
      </button>
      <button
        type="button"
        className={['v4-btn v4-btn--recall', recallOpen || missionState === 'RECALL' ? 'is-active' : '']
          .filter(Boolean)
          .join(' ')}
        {...recallPress}
      >
        RECALL
      </button>
      <button
        type="button"
        className={[
          'v4-btn v4-btn--confirm',
          taskingReady ? 'is-ready' : 'is-disabled',
          multi && armValid ? 'is-armed' : '',
          multi && !armValid && active ? 'is-arm-pending' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={!active || readiness.blocked}
        aria-disabled={!active || readiness.blocked}
        aria-label={
          active
            ? multi && !armValid
              ? `Arm confirm all ${pendingCount} intercepts`
              : `Confirm intercept ${active.trackId}`
            : 'Awaiting tasking'
        }
        title={!connected ? 'Will queue if C2 offline' : undefined}
        onClick={() =>
          executePrimaryConfirm(dispatch, store.getState, pending, active)
        }
      >
        {confirmLabel}
      </button>
    </nav>
  )
}
