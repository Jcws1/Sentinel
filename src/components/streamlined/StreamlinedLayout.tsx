import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { selectPendingCount } from '../../store/selectors'
import {
  applyDegradedOverlays,
  setRecallConfirmOpen,
  setTaskingSheetOpen,
  setWorkspace,
  setHoldConfirmOpen,
} from '../../store/uiSlice'
import { setMissionStateCommand } from '../../store/commandThunks'
import { confirmMissionHold } from '../../utils/operatorActions'
import { isDegraded } from '../../modeProfiles'
import { BattlespaceMap } from '../BattlespaceMap'
import { BottomBar } from './BottomBar'
import { FleetStrip } from './FleetStrip'
import { OverlayPanel } from './OverlayPanel'
import { TelemetryCard } from './TelemetryCard'
import { TaskingCard } from './TaskingCard'
import { DegradedBanner } from './DegradedBanner'
import { OfflineCacheBanner } from './OfflineCacheBanner'
import { StreamlinedTopBar } from './StreamlinedTopBar'
import { ThreatTicker } from './ThreatTicker'
import { HelpGuide } from './HelpGuide'
import { ToastStack } from './ToastStack'
import { useTopPriorityThreatFocus } from '../../hooks/useTopPriorityThreatFocus'
import { useAlertChirp } from '../../hooks/useAlertChirp'
import { useOperatorKeyboard } from '../../hooks/useOperatorKeyboard'
import { OperationsPanel } from '../OperationsPanel'
import { PolicyPanel } from '../PolicyPanel'
import { FleetPanel } from '../FleetPanel'
import { SensorHealth } from '../SensorHealth'

export function StreamlinedLayout() {
  const dispatch = useAppDispatch()
  const mission = useAppSelector((s) => s.mission)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const holdConfirmOpen = useAppSelector((s) => s.ui.holdConfirmOpen)
  const connected = useAppSelector((s) => s.session.connected)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const pendingCount = useAppSelector(selectPendingCount)
  const taskingSheetOpen = useAppSelector((s) => s.ui.taskingSheetOpen)
  const prevPendingCountRef = useRef(0)
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  const utilityOpen =
    workspace === 'operations' ||
    workspace === 'policy' ||
    workspace === 'fleet' ||
    workspace === 'sensors'

  useTopPriorityThreatFocus()
  useAlertChirp()
  useOperatorKeyboard()

  useEffect(() => {
    if (degraded) dispatch(applyDegradedOverlays())
  }, [degraded, dispatch])

  useEffect(() => {
    const prev = prevPendingCountRef.current
    prevPendingCountRef.current = pendingCount
    if (prev === 0 && pendingCount > 0 && taskingSheetOpen) {
      dispatch(setTaskingSheetOpen(false))
    }
  }, [pendingCount, taskingSheetOpen, dispatch])

  return (
    <div className={['v4-layout', !connected ? 'is-readonly' : ''].filter(Boolean).join(' ')}>
      <StreamlinedTopBar />
      <DegradedBanner />
      <OfflineCacheBanner />
      {holdArmed && mission.state === 'HOLD' && (
        <div className="v4-hold-banner" role="status">
          HOLD
        </div>
      )}
      {mission.state === 'RECALL' && (
        <div className="v4-recall-banner" role="status">
          RECALL
        </div>
      )}

      <div className="v4-map-stage">
        <BattlespaceMap />
        <TelemetryCard />
        <div className="v4-bottom-stack">
          <TaskingCard />
          <FleetStrip />
          <OverlayPanel />
          <ThreatTicker />
          <BottomBar />
        </div>
        <ToastStack />
      </div>

      {recallOpen && (
        <div className="v4-confirm-modal" role="alertdialog" aria-modal="true">
          <div className="v4-confirm-modal__card">
            <h2>Recall all drones?</h2>
            <p>Interceptors return to base. Active intercepts abort.</p>
            <div className="v4-confirm-modal__actions">
              <button
                type="button"
                className="v4-btn v4-btn--recall is-active"
                onClick={() => {
                  dispatch(setRecallConfirmOpen(false))
                  void dispatch(setMissionStateCommand('RECALL'))
                }}
              >
                CONFIRM
              </button>
              <button
                type="button"
                className="v4-btn"
                onClick={() => dispatch(setRecallConfirmOpen(false))}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {holdConfirmOpen && (
        <div className="v4-confirm-modal" role="alertdialog" aria-modal="true">
          <div className="v4-confirm-modal__card">
            <h2>Hold all intercepts?</h2>
            <p>Drones pause engagement. Long-press HOLD (3s) to skip this dialog.</p>
            <div className="v4-confirm-modal__actions">
              <button
                type="button"
                className="v4-btn v4-btn--hold is-active"
                onClick={() => confirmMissionHold(dispatch)}
              >
                HOLD
              </button>
              <button
                type="button"
                className="v4-btn"
                onClick={() => dispatch(setHoldConfirmOpen(false))}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpGuide />

      {utilityOpen && (
        <div className="v4-utility" data-operator-ui>
          <button
            type="button"
            className="v4-utility__close"
            onClick={() => dispatch(setWorkspace('tracks'))}
          >
            ← MAP
          </button>
          {workspace === 'operations' && <OperationsPanel />}
          {workspace === 'policy' && <PolicyPanel />}
          {workspace === 'fleet' && <FleetPanel />}
          {workspace === 'sensors' && <SensorHealth />}
        </div>
      )}
    </div>
  )
}
