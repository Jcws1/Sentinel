import { useMemo, useState, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { pushToast } from '../store/taskingSlice'
import {
  evaluateRoe,
  type RoeAreaType,
  type RoeCivilianContext,
  type RoeControlMode,
  type RoeEvaluationInput,
  type RoeOutcome,
  type RoeTaskType,
} from '../policy/roeEngine'

type RoeView = 'check' | 'package' | 'activity'
type PriorityPreset = 'balanced' | 'rapid' | 'persistent' | 'reserve'

interface PriorityMetric {
  id: string
  label: string
  weight: number
}

interface Guardrail {
  id: string
  label: string
  value: string
  locked: boolean
  enabled: boolean
}

const TASK_OPTIONS: Array<{ value: RoeTaskType; label: string }> = [
  { value: 'observe', label: 'Observe' },
  { value: 'track', label: 'Track' },
  { value: 'escort', label: 'Escort' },
  { value: 'relay', label: 'Communications relay' },
  { value: 'intercept', label: 'Intercept' },
]

const AREA_OPTIONS: Array<{ value: RoeAreaType; label: string }> = [
  { value: 'controlled', label: 'Controlled area' },
  { value: 'dense-urban', label: 'Dense urban' },
  { value: 'protected-buffer', label: 'Protected buffer' },
  { value: 'no-go', label: 'No-go area' },
]

const CONTROL_OPTIONS: Array<{ value: RoeControlMode; label: string }> = [
  { value: 'supervised', label: 'Human supervised' },
  { value: 'manual', label: 'Direct manual' },
  { value: 'autonomous', label: 'Autonomous' },
]

const CIVILIAN_OPTIONS: Array<{ value: RoeCivilianContext; label: string }> = [
  { value: 'clear', label: 'No indicators' },
  { value: 'unclear', label: 'Unresolved' },
  { value: 'present', label: 'Indicators present' },
]

const PRESETS: Record<
  PriorityPreset,
  { label: string; short: string; detail: string; weights: number[] }
> = {
  balanced: {
    label: 'Keep it balanced',
    short: 'Balanced',
    detail: 'Good default for mixed missions',
    weights: [72, 68, 46, 58, 52, 48],
  },
  rapid: {
    label: 'Respond faster',
    short: 'Fast response',
    detail: 'Favor speed and mission effect',
    weights: [78, 92, 74, 38, 34, 36],
  },
  persistent: {
    label: 'Stay on station',
    short: 'Long coverage',
    detail: 'Favor endurance and coverage',
    weights: [68, 48, 36, 92, 76, 52],
  },
  reserve: {
    label: 'Save resources',
    short: 'Resource reserve',
    detail: 'Protect fuel and specialist assets',
    weights: [58, 42, 34, 66, 94, 88],
  },
}

const INITIAL_PRIORITIES: PriorityMetric[] = [
  { id: 'effect', label: 'Mission effect', weight: 72 },
  { id: 'response', label: 'Response time', weight: 68 },
  { id: 'distance', label: 'Transit distance', weight: 46 },
  { id: 'station', label: 'Time on station', weight: 58 },
  { id: 'fuel', label: 'Fuel / battery', weight: 52 },
  { id: 'resource', label: 'Resource use', weight: 48 },
]

const INITIAL_GUARDRAILS: Guardrail[] = [
  { id: 'zone', label: 'Restricted zones', value: 'No entry', locked: true, enabled: true },
  { id: 'freshness', label: 'Fresh context', value: '30 sec max', locked: false, enabled: true },
  { id: 'reserve', label: 'Return reserve', value: '30% minimum', locked: false, enabled: true },
  { id: 'separation', label: 'Safe separation', value: '250 m minimum', locked: true, enabled: true },
  { id: 'link', label: 'Link loss', value: 'Hold and return', locked: false, enabled: true },
]

const OUTCOMES: Record<
  RoeOutcome,
  { label: string; short: string; tone: 'ok' | 'warn' | 'crit'; action: string }
> = {
  eligible: { label: 'Proceed', short: 'This task is allowed.', tone: 'ok', action: 'Authorize task' },
  restricted: {
    label: 'Proceed with limits',
    short: 'This task is allowed with the limits below.',
    tone: 'warn',
    action: 'Authorize with limits',
  },
  approval: {
    label: 'Send for review',
    short: 'A mission commander must approve this task.',
    tone: 'warn',
    action: 'Send to commander',
  },
  indeterminate: {
    label: 'Hold',
    short: 'Refresh the operational context first.',
    tone: 'crit',
    action: 'Refresh context',
  },
  ineligible: {
    label: 'Do not proceed',
    short: 'This task is outside the active package.',
    tone: 'crit',
    action: 'Return to monitoring',
  },
}

function Dot({ tone }: { tone: 'ok' | 'warn' | 'crit' | 'mute' }) {
  return <i className={`roe3-dot roe3-dot--${tone}`} aria-hidden="true" />
}

export function RoePolicyWorkspace() {
  const dispatch = useAppDispatch()
  const mission = useAppSelector((state) => state.mission)
  const session = useAppSelector((state) => state.session)
  const zones = useAppSelector((state) => state.policy.zones)

  const [view, setView] = useState<RoeView>('check')
  const [editingTask, setEditingTask] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [showLimits, setShowLimits] = useState(false)
  const [step, setStep] = useState(0)
  const [preset, setPreset] = useState<PriorityPreset>('balanced')
  const [priorities, setPriorities] = useState(INITIAL_PRIORITIES)
  const [guardrails, setGuardrails] = useState(INITIAL_GUARDRAILS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [input, setInput] = useState<RoeEvaluationInput>({
    taskType: 'observe',
    purpose: 'Protect critical infrastructure',
    areaType: 'dense-urban',
    durationMinutes: 20,
    assetClass: 'sUAS',
    controlMode: 'supervised',
    civilianContext: 'unclear',
    protectedLocation: true,
    requesterAuthority: 'operator',
    comms: mission.c2Link,
    dataAgeSeconds: session.lastSyncAt
      ? Math.max(0, Math.round((Date.now() - session.lastSyncAt) / 1000))
      : 0,
  })

  const evaluation = useMemo(() => evaluateRoe(input), [input])
  const outcome = OUTCOMES[evaluation.outcome]
  const primaryReason = evaluation.matchedRules[0]
  const activeGuardrails = guardrails.filter((item) => item.enabled).length

  const updateInput = <K extends keyof RoeEvaluationInput>(
    key: K,
    value: RoeEvaluationInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }))

  const choosePreset = (next: PriorityPreset) => {
    setPreset(next)
    setPriorities((current) =>
      current.map((item, index) => ({
        ...item,
        weight: PRESETS[next].weights[index] ?? item.weight,
      })),
    )
  }

  const toggleGuardrail = (id: string) => {
    setGuardrails((current) =>
      current.map((item) =>
        item.id === id && !item.locked ? { ...item, enabled: !item.enabled } : item,
      ),
    )
  }

  const notify = (nextMessage: string) => {
    setMessage(nextMessage)
    dispatch(pushToast(nextMessage))
  }

  return (
    <main className="roe3">
      <header className="roe3-top">
        <button className="roe3-package" type="button" onClick={() => { setView('package'); setStep(0) }}>
          <Dot tone="ok" />
          <span><small>ACTIVE PACKAGE</small><strong>Urban Protection <em>v12</em></strong></span>
          <span className="roe3-package__sync"><small>DISTRIBUTION</small><strong>18 / 20</strong></span>
        </button>
        <nav aria-label="Rules of engagement">
          <button type="button" className={view === 'check' ? 'is-active' : ''} onClick={() => setView('check')}>
            Check action
          </button>
          <button type="button" className={view === 'package' ? 'is-active' : ''} onClick={() => setView('package')}>
            Change package
          </button>
          <button type="button" className={view === 'activity' ? 'is-active' : ''} onClick={() => setView('activity')}>
            Activity
          </button>
        </nav>
      </header>

      {message && (
        <div className="roe3-message" role="status">
          <Dot tone="ok" />
          <span>{message}</span>
          <button type="button" aria-label="Dismiss status" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {view === 'check' && (
        <section className="roe3-check">
          <header className="roe3-question">
            <div>
              <span>ROE CHECK</span>
              <h1>Can I do this?</h1>
            </div>
            <button type="button" onClick={() => setEditingTask((value) => !value)}>
              {editingTask ? 'Done' : 'Change task'}
            </button>
          </header>

          {editingTask ? (
            <div className="roe3-task-form">
              <label><span>Action</span><select value={input.taskType} onChange={(event) => updateInput('taskType', event.target.value as RoeTaskType)}>{TASK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span>Area</span><select value={input.areaType} onChange={(event) => updateInput('areaType', event.target.value as RoeAreaType)}>{AREA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span>Control</span><select value={input.controlMode} onChange={(event) => updateInput('controlMode', event.target.value as RoeControlMode)}>{CONTROL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span>Civilian context</span><select value={input.civilianContext} onChange={(event) => updateInput('civilianContext', event.target.value as RoeCivilianContext)}>{CIVILIAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
          ) : (
            <div className="roe3-task-line">
              <strong>{TASK_OPTIONS.find((item) => item.value === input.taskType)?.label}</strong>
              <span>Small UAS</span>
              <span>{AREA_OPTIONS.find((item) => item.value === input.areaType)?.label}</span>
              <span>{input.durationMinutes} min</span>
            </div>
          )}

          <article className={`roe3-answer roe3-answer--${outcome.tone}`}>
            <div className="roe3-answer__icon" aria-hidden="true">
              {outcome.tone === 'ok' ? '✓' : outcome.tone === 'warn' ? '!' : '×'}
            </div>
            <div className="roe3-answer__copy">
              <small>ANSWER</small>
              <h2>{outcome.label}</h2>
              <p>{outcome.short}</p>
            </div>
            <div className="roe3-answer__reason">
              <small>BECAUSE</small>
              <strong>{primaryReason?.name ?? 'Standing task authority'}</strong>
              <p>{primaryReason?.reason ?? evaluation.summary}</p>
            </div>
            <div className="roe3-answer__actions">
              <button type="button" className="roe3-primary" onClick={() => notify(
                evaluation.outcome === 'approval'
                  ? 'Review request sent to mission commander'
                  : `${outcome.action} recorded`,
              )}>
                {outcome.action}
              </button>
              <button type="button" className="roe3-secondary" onClick={() => setShowWhy((value) => !value)}>
                {showWhy ? 'Hide why' : 'Why?'}
              </button>
            </div>
          </article>

          <div className="roe3-quick-status">
            <div><Dot tone={input.dataAgeSeconds > 30 ? 'crit' : 'ok'} /><span>Context</span><strong>{input.dataAgeSeconds}s old</strong></div>
            <div><span>Link</span><strong>{input.comms === 'strong' ? 'Online' : input.comms}</strong></div>
            <div><span>GNSS</span><strong>{mission.gnss}</strong></div>
            <div><span>Zones</span><strong>{Math.max(zones.length, 2)} loaded</strong></div>
          </div>

          {evaluation.constraints.length > 0 && (
            <section className="roe3-disclosure">
              <button type="button" onClick={() => setShowLimits((value) => !value)}>
                <span><strong>{evaluation.constraints.length} limits apply</strong><small>Only read these before authorizing.</small></span>
                <em>{showLimits ? '−' : '+'}</em>
              </button>
              {showLimits && <ul>{evaluation.constraints.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          )}

          {showWhy && (
            <section className="roe3-why">
              <header><strong>Why this answer?</strong><span>{evaluation.matchedRules.length} rules checked</span></header>
              {evaluation.matchedRules.map((rule) => (
                <div key={rule.id}>
                  <Dot tone={OUTCOMES[rule.effect].tone} />
                  <span><strong>{rule.name}</strong><small>{rule.reason}</small></span>
                </div>
              ))}
            </section>
          )}
        </section>
      )}

      {view === 'package' && (
        <section className="roe3-builder">
          <header>
            <div>
              <span>CHANGE PACKAGE</span>
              <h1>{['What matters most?', 'Where does it apply?', 'Check the safeguards', 'Ready to activate?'][step]}</h1>
            </div>
            <strong>Step {step + 1} of 4</strong>
          </header>

          <div className="roe3-progress" aria-label={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((item) => <i key={item} className={item <= step ? 'is-on' : ''} />)}
          </div>

          <div className="roe3-builder__body">
            {step === 0 && (
              <>
                <p className="roe3-prompt">Choose one. You can fine-tune it if needed.</p>
                <div className="roe3-choice-grid">
                  {(Object.entries(PRESETS) as Array<[PriorityPreset, (typeof PRESETS)[PriorityPreset]]>).map(([id, item]) => (
                    <button key={id} type="button" className={preset === id ? 'is-selected' : ''} onClick={() => choosePreset(id)}>
                      <i>{preset === id ? '✓' : ''}</i>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="roe3-advanced-link" onClick={() => setShowAdvanced((value) => !value)}>
                  {showAdvanced ? 'Hide fine tuning' : 'Fine-tune priorities'}
                </button>
                {showAdvanced && (
                  <div className="roe3-tuning">
                    {priorities.map((metric) => (
                      <label key={metric.id}>
                        <span>{metric.label}<strong>{metric.weight}</strong></span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={metric.weight}
                          style={{ '--roe3-fill': `${metric.weight}%` } as CSSProperties}
                          onChange={(event) => setPriorities((current) => current.map((item) => item.id === metric.id ? { ...item, weight: Number(event.target.value) } : item))}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <p className="roe3-prompt">Keep the scope narrow. Fewer choices mean fewer mistakes.</p>
                <div className="roe3-scope">
                  <label><span>Area</span><select defaultValue="alpha"><option value="alpha">Sector Alpha</option><option value="bravo">Sector Bravo</option><option value="all">All sectors</option></select></label>
                  <label><span>Duration</span><select defaultValue="4h"><option value="2h">Next 2 hours</option><option value="4h">Next 4 hours</option><option value="phase">Until phase ends</option></select></label>
                  <label><span>Assets</span><select defaultValue="all"><option value="all">All 20 assets</option><option value="atlas">Team Atlas · 8</option><option value="beacon">Team Beacon · 6</option></select></label>
                </div>
                <div className="roe3-scope-summary"><Dot tone="ok" /><span><strong>20 assets in Sector Alpha</strong><small>Valid for the next 4 hours</small></span></div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="roe3-prompt">These limits always beat optimization priorities.</p>
                <div className="roe3-guards">
                  {guardrails.map((item) => (
                    <article key={item.id} className={!item.enabled ? 'is-off' : ''}>
                      <button type="button" disabled={item.locked} className={item.enabled ? 'is-on' : ''} onClick={() => toggleGuardrail(item.id)} aria-label={`Toggle ${item.label}`}><i /></button>
                      <span><strong>{item.label}</strong><small>{item.value}</small></span>
                      <em>{item.locked ? 'LOCKED' : item.enabled ? 'ON' : 'OFF'}</em>
                    </article>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="roe3-review">
                  <div className="roe3-review__hero"><Dot tone="warn" /><span><small>DRAFT PACKAGE</small><strong>{PRESETS[preset].short}</strong></span></div>
                  <ul>
                    <li><span>Priority</span><strong>{PRESETS[preset].label}</strong></li>
                    <li><span>Scope</span><strong>Sector Alpha · 4 hours</strong></li>
                    <li><span>Safeguards</span><strong>{activeGuardrails} active · 2 locked</strong></li>
                    <li><span>Distribution</span><strong>20 assets · about 45 sec</strong></li>
                  </ul>
                  <p><Dot tone="warn" />2 offline assets will update when they reconnect.</p>
                </div>
              </>
            )}
          </div>

          <footer>
            <button type="button" className="roe3-secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>
            {step < 3 ? (
              <button type="button" className="roe3-primary" onClick={() => setStep((current) => Math.min(3, current + 1))}>Continue</button>
            ) : (
              <button type="button" className="roe3-primary" onClick={() => notify('Package activation started for 20 assets')}>Activate package</button>
            )}
          </footer>
        </section>
      )}

      {view === 'activity' && (
        <section className="roe3-activity">
          <header><span>ACTIVITY</span><h1>What changed?</h1></header>
          <div>
            <article><Dot tone="warn" /><span><strong>Command review requested</strong><small>Protected-location review · OBS-0644</small></span><time>14:32Z</time></article>
            <article><Dot tone="ok" /><span><strong>Urban Protection v12 activated</strong><small>18 assets active · 2 waiting to sync</small></span><time>14:30Z</time></article>
            <article><Dot tone="ok" /><span><strong>Task authorized with limits</strong><small>Observation task · 2 limits applied</small></span><time>14:18Z</time></article>
          </div>
        </section>
      )}
    </main>
  )
}
