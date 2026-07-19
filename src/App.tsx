import { useEffect } from 'react'
import { BattlespaceMap } from './components/BattlespaceMap'
import { FleetPanel } from './components/FleetPanel'
import { OperationsPanel } from './components/OperationsPanel'
import { PolicyPanel } from './components/PolicyPanel'
import { TaskingPanel } from './components/TaskingPanel'
import { ThreatQueue } from './components/ThreatQueue'
import { TopBar } from './components/TopBar'
import { WorkspaceRail } from './components/WorkspaceRail'
import { SensorHealth } from './components/SensorHealth'
import { connectC2Backend } from './api/sync'
import { getModeProfile } from './modeProfiles'
import { useAppDispatch, useAppSelector } from './store'
import { pruneToasts } from './store/taskingSlice'
import { pruneCommands } from './store/workflowSlice'
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
  const showLeft = !sensorWorkspace && (modeProfile.showLeftPanel || workspace === 'operations')
  const showRight =
    !sensorWorkspace &&
    (modeProfile.showRightPanel ||
      workspace === 'fleet' ||
      (workspace === 'policy' && !modeProfile.showRightPanel))

  const leftPanel =
    workspace === 'operations' ? <OperationsPanel /> : <ThreatQueue />
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
      <TopBar />
      {!connected && (
        <div
          className={`link-banner ${connecting ? 'link-banner--warn' : 'link-banner--crit'}`}
          role="status"
        >
          {connecting
            ? 'Connecting to C2 backend…'
            : (error ?? 'C2 backend offline')}
        </div>
      )}
      <div className="workspace">
        {sensorWorkspace ? (
          <SensorHealth />
        ) : (
          <>
        <main
          className={['map-area', hardDenied ? 'map-area--denied' : '', `map-area--${mode}`]
            .filter(Boolean)
            .join(' ')}
        >
          <BattlespaceMap />
          {modeProfile.showTasking && <TaskingPanel />}
          {!connected && !connecting && (
            <div className="connection-overlay" role="alert">
              <p className="panel__eyebrow">C2 Link</p>
              <h2>Backend offline</h2>
              <p>
                {error ??
                  'Run npm run dev to start the API and UI together.'}
              </p>
            </div>
          )}
        </main>

        {modeProfile.showRail && <WorkspaceRail />}
        {showLeft && leftPanel}
        {showRight && rightPanel}
          </>
        )}
      </div>
    </div>
  )
}
