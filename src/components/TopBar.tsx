import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { setMissionStateCommand } from '../store/commandThunks'
import { MODE_PROFILES } from '../modeProfiles'
import { pushToast } from '../store/taskingSlice'
import {
  cycleAutoEngage,
  requestModeSwitch,
  setMode,
  setWorkspace,
  toggleDeploymentMode,
  toggleOverflowMenu,
  type ModeId,
} from '../store/uiSlice'
import { ModeSwitchDialog } from './ModeSwitchDialog'
import { OverflowMenu } from './OverflowMenu'
import { exitReplay } from '../store/replaySlice'

export function TopBar() {
  const mission = useAppSelector((s) => s.mission)
  const pendingCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'pending').length,
  )
  const engagedCount = useAppSelector(
    (s) => s.tasking.recommendations.filter((r) => r.status === 'confirmed').length,
  )
  const readyInterceptors = useAppSelector(
    (s) =>
      s.fleet.drones.filter((d) => d.type === 'Interceptor' && d.battery > 20 && !d.assignedTrackId)
        .length,
  )
  const activeThreats = useAppSelector((s) => s.threats.tracks.length)
  const scout = useAppSelector((s) => s.fleet.drones.find((d) => d.type === 'Scout'))
  const session = useAppSelector((s) => s.session)
  const mode = useAppSelector((s) => s.ui.mode)
  const workspace = useAppSelector((s) => s.ui.workspace)
  const deploymentMode = useAppSelector((s) => s.ui.deploymentMode)
  const autoEngage = useAppSelector((s) => s.ui.autoEngage)
  const dispatch = useAppDispatch()
  const [confirmAction, setConfirmAction] = useState<'HOLD' | 'RECALL' | null>(null)

  const hardDenied = mission.gnss === 'denied' || mission.c2Link === 'lost'
  const autoEngageTone =
    autoEngage === 'on' ? 'ok' : autoEngage === 'locked' ? 'crit' : 'warn'

  const requestMode = (next: ModeId) => {
    if (next === mode) return
    if (pendingCount > 0 || engagedCount > 0) {
      dispatch(requestModeSwitch(next))
      return
    }
    dispatch(setMode(next))
  }

  const applyMissionState = (state: 'HOLD' | 'RECALL' | 'ACTIVE') => {
    setConfirmAction(null)
    void dispatch(setMissionStateCommand(state))
  }

  return (
    <header className={`top-bar top-bar--${mode}`} data-operator-ui data-mode={mode}>
      <div className="top-bar__row">
        <div className="top-bar__left">
          <span className="top-bar__glyph" aria-hidden="true" />
          <span className="top-bar__product">SENTINEL</span>
          <nav className="mode-bar" aria-label="Mission mode">
            {MODE_PROFILES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={['mode-bar__btn', mode === m.id ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-mode={m.id}
                aria-pressed={mode === m.id}
                onClick={() => requestMode(m.id)}
              >
                {m.shortLabel}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className={['sensor-tab', workspace === 'sensors' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={workspace === 'sensors'}
            onClick={() => dispatch(setWorkspace(workspace === 'sensors' ? 'tracks' : 'sensors'))}
          >
            <span className="sensor-tab__pulse" aria-hidden="true" />
            Sensors
          </button>
          <button
            type="button"
            className={['sensor-tab', workspace === 'policy' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={workspace === 'policy'}
            onClick={() => dispatch(setWorkspace(workspace === 'policy' ? 'tracks' : 'policy'))}
          >
            <span className="sensor-tab__pulse" aria-hidden="true" />
            ROE
          </button>
          <button
            type="button"
            className={['sensor-tab', workspace === 'assistant' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={workspace === 'assistant'}
            onClick={() => dispatch(setWorkspace(workspace === 'assistant' ? 'tracks' : 'assistant'))}
          >
            <span className="assistant-tab__glyph" aria-hidden="true">✦</span>
            AI
          </button>
          <button
            type="button"
            className={['sensor-tab', 'logs-tab', workspace === 'replay' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={workspace === 'replay'}
            onClick={() => {
              if (workspace === 'replay') {
                dispatch(exitReplay())
                dispatch(setWorkspace('tracks'))
              } else {
                dispatch(setWorkspace('replay'))
              }
            }}
          >
            <span className="logs-tab__glyph" aria-hidden="true"><i /><i /><i /></span>
            Logs
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm top-bar__more"
            aria-label="Utilities"
            onClick={() => dispatch(toggleOverflowMenu())}
          >
            ⋮
          </button>
        </div>

        <div className="top-bar__status-line">
          <span className="status-chip">
            <span className="status-chip__k">Link</span>
            <span className={`status-chip__v ${session.connected ? 'tone-ok' : 'tone-crit'}`}>
              {session.connected ? 'ONLINE' : session.connecting ? '…' : 'OFF'}
            </span>
          </span>

          {mode === 'defense' && (
            <>
              <button
                type="button"
                className="status-chip status-chip--btn"
                onClick={() => dispatch(cycleAutoEngage())}
                title="Cycle auto-engage"
              >
                <span className="status-chip__k">Auto</span>
                <span className={`status-chip__v tone-${autoEngageTone}`}>
                  {autoEngage.toUpperCase()}
                </span>
              </button>
              <span className="status-chip">
                <span className="status-chip__k">GNSS</span>
                <span
                  className={`status-chip__v tone-${
                    mission.gnss === 'active' ? 'ok' : mission.gnss === 'degraded' ? 'warn' : 'crit'
                  }`}
                >
                  {mission.gnss.toUpperCase()}
                </span>
              </span>
              <span className="status-chip">
                <span className="status-chip__k">T / R</span>
                <span className="status-chip__v mono">
                  {activeThreats}/{readyInterceptors}
                </span>
              </span>
              {pendingCount > 0 && (
                <span className="status-chip">
                  <span className="status-chip__k">Queue</span>
                  <span className="status-chip__v mono tone-warn">{pendingCount}</span>
                </span>
              )}
            </>
          )}

          {mode === 'recon' && (
            <>
              <span className="status-chip">
                <span className="status-chip__k">Scout</span>
                <span className="status-chip__v">{scout?.id ?? '—'}</span>
              </span>
              <span className="status-chip">
                <span className="status-chip__k">Batt</span>
                <span className="status-chip__v mono">
                  {scout ? `${Math.round(scout.battery)}%` : '—'}
                </span>
              </span>
            </>
          )}

          {mode === 'attack' && (
            <>
              <span className="status-chip">
                <span className="status-chip__k">ROE</span>
                <span className="status-chip__v tone-ok">WF 2KM</span>
              </span>
              <span className="status-chip">
                <span className="status-chip__k">Auth</span>
                <span className="status-chip__v mono tone-warn">{pendingCount}</span>
              </span>
            </>
          )}
        </div>

        <div className="top-bar__actions">
          <button
            type="button"
            className="deployment-toggle"
            aria-label={`Switch to ${deploymentMode === 'cloud' ? 'edge' : 'cloud'} deployment mode`}
            aria-pressed={deploymentMode === 'edge'}
            onClick={() => dispatch(toggleDeploymentMode())}
            title="Deployment environment"
          >
            <span className="deployment-toggle__track" aria-hidden="true">
              <span className="deployment-toggle__thumb" />
            </span>
            <span>{deploymentMode === 'edge' ? 'EDGE' : 'CLOUD'}</span>
          </button>
          {mode === 'defense' && (
            <>
              <button
                type="button"
                className="btn btn--ghost-warn btn--sm"
                onClick={() => setConfirmAction('HOLD')}
              >
                Hold
              </button>
              <button
                type="button"
                className="btn btn--ghost-crit btn--sm"
                onClick={() => setConfirmAction('RECALL')}
              >
                Recall
              </button>
            </>
          )}
          {mode === 'recon' && (
            <button
              type="button"
              className="btn btn--ghost-warn btn--sm"
              onClick={() => setConfirmAction('RECALL')}
            >
              Return
            </button>
          )}
          {mode === 'attack' && (
            <button
              type="button"
              className="btn btn--ghost-warn btn--sm"
              onClick={() => dispatch(pushToast('Commander escalation requested'))}
            >
              Escalate
            </button>
          )}
          {mission.state !== 'ACTIVE' && (
            <button
              type="button"
              className="btn btn--primary-sm"
              onClick={() => applyMissionState('ACTIVE')}
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {hardDenied && (
        <div className="system-banner tone-crit" role="status">
          DENIED — GNSS {mission.gnss.toUpperCase()} · C2 {mission.c2Link.toUpperCase()}. Fallback:{' '}
          {mission.fallbackPositioning ?? 'ORB-SLAM3 + Mesh'}
        </div>
      )}
      {mission.swarmAutonomy && (
        <div className="system-banner tone-crit">
          Swarm continuing last-validated tasking autonomously.
        </div>
      )}

      {confirmAction && (
        <div className="mission-confirm" role="dialog" aria-modal="true">
          <div className="mission-confirm__card">
            <p className="panel__eyebrow">Mission control</p>
            <h3>{confirmAction === 'HOLD' ? 'Hold all tasking?' : 'Recall entire swarm?'}</h3>
            <p className="mission-confirm__detail">
              {confirmAction === 'HOLD'
                ? 'Pending recommendations remain; no new auto-engage.'
                : 'All interceptors return. Active engagements abort.'}
            </p>
            <div className="mission-confirm__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmAction === 'HOLD' ? 'btn btn--ghost-warn' : 'btn btn--ghost-crit'}
                onClick={() => applyMissionState(confirmAction)}
              >
                Confirm {confirmAction}
              </button>
            </div>
          </div>
        </div>
      )}

      <OverflowMenu />
      <ModeSwitchDialog />
    </header>
  )
}
