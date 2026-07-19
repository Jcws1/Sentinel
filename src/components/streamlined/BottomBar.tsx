import { useAppDispatch, useAppSelector } from '../../store'
import {
  selectPendingCount,
  selectPendingRecommendations,
  selectTopPriorityPending,
} from '../../store/selectors'
import {
  setRecallConfirmOpen,
  toggleFleetStrip,
  toggleOverlayPanel,
} from '../../store/uiSlice'
import { setMissionStateCommand } from '../../store/commandThunks'
import { executePrimaryConfirm, toggleMissionHold } from '../../utils/operatorActions'
import { useLongPress } from './useLongPress'

export function BottomBar() {
  const dispatch = useAppDispatch()
  const fleetOpen = useAppSelector((s) => s.ui.fleetStripOpen)
  const overlaysOpen = useAppSelector((s) => s.ui.overlayPanelOpen)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const missionState = useAppSelector((s) => s.mission.state)
  const pending = useAppSelector(selectPendingRecommendations)
  const pendingCount = useAppSelector(selectPendingCount)
  const active = useAppSelector(selectTopPriorityPending)
  const taskingReady = Boolean(active)
  const holdActive = holdArmed || missionState === 'HOLD'

  const recallPress = useLongPress({
    onTap: () => dispatch(setRecallConfirmOpen(true)),
    onLongPress: () => {
      dispatch(setRecallConfirmOpen(false))
      void dispatch(setMissionStateCommand('RECALL'))
    },
    ms: 3000,
  })

  const confirmLabel = !taskingReady
    ? 'AWAITING TASKING'
    : pendingCount > 1
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
        onClick={() => toggleMissionHold(dispatch, holdActive)}
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
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={!taskingReady}
        aria-disabled={!taskingReady}
        aria-label={taskingReady ? `Confirm intercept ${active!.trackId}` : 'Awaiting tasking'}
        onClick={() => executePrimaryConfirm(dispatch, pending, active)}
      >
        {confirmLabel}
      </button>
    </nav>
  )
}
