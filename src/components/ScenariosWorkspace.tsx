import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DemoScenarioDefinition,
  DemoScenarioRuntime,
  DemoScenariosResponse,
} from '../api/demoScenarioTypes'
import { apiRequest } from '../api/httpClient'
import { useAppDispatch } from '../store'
import { setMapOverlayTab, setWorkspace } from '../store/uiSlice'

function runtimePhase(runtime: DemoScenarioRuntime | null) {
  if (!runtime) return 'READY'
  if (runtime.active) return 'RUNNING'
  return 'COMPLETE'
}

export function ScenariosWorkspace() {
  const dispatch = useAppDispatch()
  const [definitions, setDefinitions] = useState<DemoScenarioDefinition[]>([])
  const [runtime, setRuntime] = useState<DemoScenarioRuntime | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scaleUpdateTimers = useRef(new Map<string, number>())

  const refresh = useCallback(async () => {
    try {
      const response = await apiRequest<DemoScenariosResponse>('/api/v1/demo-scenarios')
      setDefinitions(response.scenarios)
      setRuntime(response.active)
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Scenario service unavailable')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => () => {
    for (const timer of scaleUpdateTimers.current.values()) window.clearTimeout(timer)
  }, [])

  const activate = async (scenario: DemoScenarioDefinition) => {
    setPendingId(scenario.id)
    setError(null)
    try {
      const next = await apiRequest<DemoScenarioRuntime>(
        `/api/v1/demo-scenarios/${encodeURIComponent(scenario.id)}/activate`,
        { method: 'POST' },
      )
      setRuntime(next)
      dispatch(setMapOverlayTab('scenarios'))
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('sentinel:frame-demo-scenario'))
      }, 120)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Scenario activation failed')
    } finally {
      setPendingId(null)
    }
  }

  const setTimelineScale = (scenario: DemoScenarioDefinition, timelineScale: number) => {
    setDefinitions((current) => current.map((definition) =>
      definition.id === scenario.id ? { ...definition, timelineScale } : definition,
    ))
    setRuntime((current) => current?.id === scenario.id
      ? { ...current, timelineScale }
      : current)
    const existingTimer = scaleUpdateTimers.current.get(scenario.id)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)
    const timer = window.setTimeout(async () => {
      try {
        await apiRequest(`/api/v1/demo-scenarios/${encodeURIComponent(scenario.id)}/timeline-scale`, {
          method: 'PATCH',
          body: JSON.stringify({ timelineScale }),
        })
        setError(null)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Timeline update failed')
        await refresh()
      } finally {
        scaleUpdateTimers.current.delete(scenario.id)
      }
    }, 150)
    scaleUpdateTimers.current.set(scenario.id, timer)
  }

  return (
    <aside className="scenarios-workspace" data-operator-ui aria-label="Scenarios">
      <header className="scenarios-workspace__header">
        <div>
          <button type="button" onClick={() => dispatch(setWorkspace('tracks'))}>← Battlespace</button>
          <p className="panel__eyebrow">Operational rehearsal</p>
          <h1>Scenarios</h1>
        </div>
        <span data-state={runtimePhase(runtime).toLowerCase()}>{runtimePhase(runtime)}</span>
      </header>

      {error && <div className="scenarios-workspace__error" role="alert">{error}</div>}

      <div className="scenarios-workspace__list">
        {definitions.map((scenario, scenarioIndex) => {
          const isCurrent = runtime?.id === scenario.id
          const isGnssFade = scenario.kind === 'gnss-fade'
          const timelineScale = isCurrent && runtime ? runtime.timelineScale : scenario.timelineScale
          return (
            <article key={scenario.id} className={isCurrent ? 'is-current' : ''}>
              <header>
                <span>SCENARIO {String(scenarioIndex + 1).padStart(2, '0')}</span>
                {isCurrent && <strong>{runtimePhase(runtime)}</strong>}
              </header>
              <h2>{scenario.name}</h2>
              <p>{scenario.summary}</p>

              <dl className="scenarios-workspace__forces">
                {isGnssFade ? (
                  <>
                    <div><dt>Patrol fleet</dt><dd>{scenario.friendlyDrones}</dd></div>
                    <div><dt>GNSS phases</dt><dd>5</dd></div>
                    <div><dt>Duration</dt><dd>{Math.round((scenario.durationSeconds ?? 0) / 60)}m</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Unknown · south</dt><dd>{scenario.unknownInbound}</dd></div>
                    <div><dt>Hostile · east</dt><dd>{scenario.hostileInbound}</dd></div>
                    <div><dt>Friendly fleet</dt><dd>{scenario.friendlyDrones}</dd></div>
                  </>
                )}
              </dl>

              <div className="scenarios-workspace__targets">
                <span>{isGnssFade ? 'AFFECTED AREAS' : 'SCATTER TARGETS'}</span>
                <p>{scenario.targets.join(' · ')}</p>
              </div>

              {isCurrent && runtime && !isGnssFade && (
                <div className="scenarios-workspace__progress" aria-live="polite">
                  <div><span>Remaining</span><strong>{runtime.remainingInbound}</strong></div>
                  <div><span>Scattered</span><strong>{runtime.scattered}</strong></div>
                  <div><span>Impacts</span><strong>{runtime.impacts}</strong></div>
                </div>
              )}

              {isCurrent && runtime && isGnssFade && (
                <div className="scenarios-workspace__gnss" aria-live="polite">
                  <div className="scenarios-workspace__gnss-phase">
                    <span>GNSS integrity phase</span>
                    <strong data-phase={runtime.gnssPhase?.toLowerCase()}>{runtime.gnssPhase ?? 'BASELINE'}</strong>
                  </div>
                  <progress
                    max={scenario.durationSeconds ?? 360}
                    value={runtime.elapsedSeconds ?? 0}
                    aria-label="GNSS scenario progress"
                  />
                  <div className="scenarios-workspace__gnss-clock">
                    <span>{Math.floor((runtime.elapsedSeconds ?? 0) / 60)}:{String(Math.floor((runtime.elapsedSeconds ?? 0) % 60)).padStart(2, '0')} elapsed</span>
                    <span>{Math.round(((runtime.elapsedSeconds ?? 0) / (scenario.durationSeconds ?? 360)) * 100)}%</span>
                  </div>
                  <dl>
                    <div><dt>Affected</dt><dd>{runtime.affectedDrones ?? 0}</dd></div>
                    <div><dt>Denied</dt><dd>{runtime.deniedDrones ?? 0}</dd></div>
                    <div><dt>Validated</dt><dd>{runtime.recoveringDrones ?? 0}</dd></div>
                    <div><dt>Satellites</dt><dd>{runtime.satellitesTracked ?? '—'}</dd></div>
                    <div><dt>Fix age</dt><dd>{runtime.fixAgeSeconds ?? 0}s</dd></div>
                    <div><dt>GNSS/VIO delta</dt><dd>{runtime.positionDisagreementM ?? 0}m</dd></div>
                  </dl>
                </div>
              )}

              <div className="scenarios-workspace__timeline">
                <div>
                  <span>Timeline speed</span>
                  <output htmlFor={`timeline-${scenario.id}`}>{timelineScale}×</output>
                </div>
                <input
                  id={`timeline-${scenario.id}`}
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={timelineScale}
                  aria-label={`${scenario.name} timeline speed`}
                  onChange={(event) => setTimelineScale(scenario, Number(event.target.value))}
                />
                <div className="scenarios-workspace__timeline-labels" aria-hidden="true">
                  <span>1× real time</span><span>10×</span>
                </div>
              </div>

              <footer>
                <small>{timelineScale === 1 ? 'Real-time rehearsal timeline' : `${timelineScale}× compressed rehearsal timeline`}</small>
                <button
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => void activate(scenario)}
                >
                  {pendingId === scenario.id ? 'Deploying…' : isCurrent ? 'Restart scenario' : 'Launch scenario'}
                </button>
              </footer>
            </article>
          )
        })}
      </div>

      <div className="scenarios-workspace__note">
        Scenario 01 rehearses physical interception. Scenario 02 progressively removes trustworthy GNSS and requires validated fallback navigation and recovery.
      </div>
    </aside>
  )
}
