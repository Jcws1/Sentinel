import { useEffect } from 'react'
import { BattlespaceMap } from './components/BattlespaceMap'
import { FleetManager } from './components/FleetManager'
import { FieldNavigator } from './components/FieldNavigator'
import { FleetPanel } from './components/FleetPanel'
import { OperationsPanel } from './components/OperationsPanel'
import { PolicyPanel } from './components/PolicyPanel'
import { RoePolicyWorkspace } from './components/RoePolicyWorkspace'
import { SensorHealth } from './components/SensorHealth'
import { TaskingPanel } from './components/TaskingPanel'
import { TopBar } from './components/TopBar'
import { WorkspaceRail } from './components/WorkspaceRail'
import { connectC2Backend } from './api/sync'
import { getModeProfile } from './modeProfiles'
import { useAppDispatch, useAppSelector } from './store'
import { pruneToasts } from './store/taskingSlice'
import { pruneCommands } from './store/workflowSlice'
import { PairingDialog } from './components/PairingDialog'
import { setWorkspace } from './store/uiSlice'

export default function App() {
  const dispatch = useAppDispatch()
  const connected = useAppSelector((s) => s.session.connected)
  const connecting = useAppSelector((s) => s.session.connecting)
  const error = useAppSelector((s) => s.session.error)
  const mode = useAppSelector((s) => s.ui.mode)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const mission = useAppSelector((s) => s.mission)
  const modeProfile = getModeProfile(mode)
  const hardDenied = mission.gnss === 'denied' || mission.c2Link === 'lost'

  useEffect(() => {
    const disconnect = connectC2Backend(dispatch)
    const toastTimer = window.setInterval(() => {
      dispatch(pruneToasts())
      dispatch(pruneCommands())
    }, 1000)
    return () => {
      disconnect()
      window.clearInterval(toastTimer)
    }
  }, [dispatch])

  useEffect(() => {
    dispatch(setWorkspace(modeProfile.defaultWorkspace))
  }, [dispatch, modeProfile.defaultWorkspace])

  const sensorWorkspace = workspace === 'sensors'
  const policyWorkspace = workspace === 'policy'
  const fleetWorkspace = workspace === 'fleet'
  const showLeft =
    !sensorWorkspace &&
    !policyWorkspace &&
    !fleetWorkspace &&
    (workspace === 'tracks' || workspace === 'operations')
  const showRight =
    !sensorWorkspace &&
    !policyWorkspace &&
    !fleetWorkspace &&
    modeProfile.showRightPanel
  const leftPanel =
    workspace === 'operations' ? <OperationsPanel /> : <FieldNavigator />
  const rightPanel =
    workspace === 'policy' ? <PolicyPanel /> : <FleetPanel />

  return (
    <div
      className="app-shell"
      data-theme="gotham"
      data-mode={mode}
      data-degraded={hardDenied ? 'true' : 'false'}
      data-left-panel={showLeft ? 'true' : 'false'}
      data-right-panel={showRight ? 'true' : 'false'}
      data-rail={modeProfile.showRail ? 'true' : 'false'}
    >
      <PairingDialog />
      <TopBar />
      {!connected && (
        <div
          className={`link-banner ${connecting ? 'link-banner--warn' : 'link-banner--crit'}`}
          role="status"
        >
          {connecting
            ? 'Connecting to C2…'
            : (error ?? 'C2 offline — run npm run dev')}
        </div>
      )}
      <div className="workspace">
        {sensorWorkspace ? (
          <SensorHealth />
        ) : policyWorkspace ? (
          <RoePolicyWorkspace />
        ) : (
          <>
            <main
              className={[
                'map-area',
                hardDenied ? 'map-area--denied' : '',
                `map-area--${mode}`,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <BattlespaceMap />
              {modeProfile.showTasking && <TaskingPanel />}
              {!connected && !connecting && (
                <div className="connection-overlay connection-overlay--compact" role="status">
                  <p className="panel__eyebrow">C2 link unavailable</p>
                  <p>The cached map remains available. Commands are read-only until reconnection.</p>
                </div>
              )}
            </main>
            {modeProfile.showRail && <WorkspaceRail />}
            {showLeft && leftPanel}
            {showRight && rightPanel}
            {fleetWorkspace && (
              <aside className="fleet-manager-panel" data-operator-ui>
                <button
                  type="button"
                  className="fleet-manager-panel__map"
                  onClick={() => dispatch(setWorkspace('tracks'))}
                >
                  ← MAP
                </button>
                <FleetManager />
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  )
}
