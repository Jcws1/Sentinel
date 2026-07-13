import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import {
  applyDegradedOverlays,
  setRecallConfirmOpen,
  setTaskingSheetOpen,
  setWorkspace,
} from '../../store/uiSlice'
import { setMissionStateCommand } from '../../store/commandThunks'
import { isDegraded } from '../../modeProfiles'
import { BattlespaceMap } from '../BattlespaceMap'
import { BottomBar } from './BottomBar'
import { FleetStrip } from './FleetStrip'
import { OverlayPanel } from './OverlayPanel'
import { TelemetryCard } from './TelemetryCard'
import { TaskingCard } from './TaskingCard'
import { DegradedBanner } from './DegradedBanner'
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

export function StreamlinedLayout() {
  const dispatch = useAppDispatch()
  const mission = useAppSelector((s) => s.mission)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const recallOpen = useAppSelector((s) => s.ui.recallConfirmOpen)
  const holdArmed = useAppSelector((s) => s.ui.holdArmed)
  const pending = useAppSelector((s) =>
    s.tasking.recommendations.filter((r) => r.status === 'pending'),
  )
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  const utilityOpen =
    workspace === 'operations' || workspace === 'policy' || workspace === 'fleet'

  useTopPriorityThreatFocus()
  useAlertChirp()
  useOperatorKeyboard()

  useEffect(() => {
    if (degraded) dispatch(applyDegradedOverlays())
  }, [degraded, dispatch])

  useEffect(() => {
    if (pending.length > 0) {
      // Keep sheet closed by default; CONFIRM button is the primary path.
      dispatch(setTaskingSheetOpen(false))
    }
  }, [pending.length, dispatch])

  return (
    <div className="v4-layout">
      <StreamlinedTopBar />
      <DegradedBanner />
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
        </div>
      )}
    </div>
  )
}
