import { useMemo, useState, type ReactNode } from 'react'
import { useAppDispatch } from '../store'
import { pushToast } from '../store/taskingSlice'

type RoeSection =
  | 'overview'
  | 'actions'
  | 'boundaries'
  | 'oversight'
  | 'autonomy'
  | 'failsafe'
  | 'priorities'
  | 'audit'

type SettingStatus = 'Active' | 'Needs setup'

interface NavigationItem {
  id: RoeSection
  label: string
}

interface OverviewCard {
  id: Exclude<RoeSection, 'overview' | 'audit'>
  title: string
  description: string
  status: SettingStatus
  summary: string
}

interface PermissionSetting {
  id: string
  action: string
  description: string
  authority: 'Allowed' | 'Review required' | 'Blocked'
}

interface BoundarySetting {
  id: string
  label: string
  description: string
  value: string
  enabled: boolean
  locked?: boolean
}

interface PrioritySetting {
  id: string
  label: string
  description: string
  weight: number
}

type AutonomyMode = 'Recommend only' | 'Queue permitted actions' | 'Execute permitted actions'
type PresetProfile = 'Balanced' | 'Rapid response' | 'Persistent coverage' | 'Resource reserve'
type PriorityProfile = PresetProfile | 'Custom'

interface FailsafeSetting {
  trigger: string
  response: string
  recovery: string
}

interface AuditEvent {
  id: string
  type: 'published' | 'draft'
  environment: string
  title: string
  summary: string
  actor: string
  time: string
  version: string
  changes: string[]
}

interface EditSnapshot {
  permissions: PermissionSetting[]
  boundaries: BoundarySetting[]
  priorities: PrioritySetting[]
  oversight: {
    protectedLocations: boolean
    autonomousActions: boolean
    intercepts: boolean
    reviewer: string
    fallbackReviewer: string
    expiresAfter: string
    noResponse: string
  }
  autonomy: {
    mode: AutonomyMode
    supervised: boolean
    confirmMaterialChanges: boolean
    reduceOnDegrade: boolean
  }
  failsafe: {
    staleContext: FailsafeSetting
    linkLoss: FailsafeSetting
    degradedPositioning: FailsafeSetting
  }
  priorityProfile: PriorityProfile
}

const CONFIGURE_NAV: NavigationItem[] = [
  { id: 'actions', label: 'Action permissions' },
  { id: 'boundaries', label: 'Operational boundaries' },
  { id: 'oversight', label: 'Human oversight' },
  { id: 'autonomy', label: 'Autonomous behaviour' },
  { id: 'failsafe', label: 'Fail-safe behaviour' },
  { id: 'priorities', label: 'Recommendation priorities' },
]

const OVERVIEW_CARDS: OverviewCard[] = [
  {
    id: 'actions',
    title: 'Action permissions',
    description: 'Define which actions the system may recommend or perform.',
    status: 'Active',
    summary: '5 actions configured',
  },
  {
    id: 'boundaries',
    title: 'Operational boundaries',
    description: 'Set location, timing, proximity and context constraints.',
    status: 'Active',
    summary: '4 boundaries enabled',
  },
  {
    id: 'oversight',
    title: 'Human oversight',
    description: 'Control when an operator or commander must approve.',
    status: 'Active',
    summary: '3 review conditions',
  },
  {
    id: 'autonomy',
    title: 'Autonomous behaviour',
    description: 'Define what entities may do without confirmation.',
    status: 'Needs setup',
    summary: 'Supervised by default',
  },
  {
    id: 'failsafe',
    title: 'Fail-safe behaviour',
    description: 'Set responses to stale data, link loss and degraded positioning.',
    status: 'Active',
    summary: '3 responses configured',
  },
  {
    id: 'priorities',
    title: 'Recommendation priorities',
    description: 'Choose how valid recommendations are ranked.',
    status: 'Active',
    summary: 'Balanced profile',
  },
]

const INITIAL_PERMISSIONS: PermissionSetting[] = [
  { id: 'observe', action: 'Observe', description: 'Collect imagery or sensor data.', authority: 'Allowed' },
  { id: 'track', action: 'Track', description: 'Maintain surveillance of a declared entity.', authority: 'Allowed' },
  { id: 'escort', action: 'Escort', description: 'Accompany a friendly or protected entity.', authority: 'Allowed' },
  { id: 'relay', action: 'Communications relay', description: 'Provide temporary communications coverage.', authority: 'Allowed' },
  { id: 'intercept', action: 'Intercept', description: 'Approach and contain a declared threat.', authority: 'Review required' },
]

const INITIAL_BOUNDARIES: BoundarySetting[] = [
  { id: 'restricted', label: 'Restricted zones', description: 'Prevent entry into declared restricted areas.', value: 'No entry', enabled: true, locked: true },
  { id: 'protected', label: 'Protected-location buffer', description: 'Require review near protected locations.', value: '500 m', enabled: true },
  { id: 'separation', label: 'Minimum separation', description: 'Maintain distance from friendly and protected entities.', value: '250 m', enabled: true, locked: true },
  { id: 'duration', label: 'Maximum task duration', description: 'Require a new authorization after this period.', value: '60 min', enabled: true },
]

const INITIAL_PRIORITIES: PrioritySetting[] = [
  { id: 'effect', label: 'Mission effect', description: 'Match the requested outcome.', weight: 72 },
  { id: 'response', label: 'Response time', description: 'Prefer options that can act sooner.', weight: 68 },
  { id: 'distance', label: 'Transit distance', description: 'Reduce unnecessary repositioning.', weight: 46 },
  { id: 'endurance', label: 'Time on station', description: 'Preserve useful coverage after arrival.', weight: 58 },
  { id: 'reserve', label: 'Fuel and battery reserve', description: 'Protect platform endurance.', weight: 52 },
]

const PRIORITY_PROFILES: Record<PresetProfile, number[]> = {
  Balanced: [72, 68, 46, 58, 52],
  'Rapid response': [78, 92, 74, 38, 34],
  'Persistent coverage': [68, 48, 36, 92, 76],
  'Resource reserve': [58, 42, 34, 66, 94],
}

const BOUNDARY_VALUES: Record<string, string[]> = {
  restricted: ['No entry'],
  protected: ['250 m', '500 m', '750 m', '1 km'],
  separation: ['250 m'],
  duration: ['30 min', '60 min', '90 min', 'Until changed'],
}

const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'audit-1430',
    type: 'published',
    environment: 'Operational',
    title: 'Operational configuration published',
    summary: 'Human oversight and action permissions updated.',
    actor: 'Mission Commander',
    time: 'Today, 14:30Z',
    version: 'v12',
    changes: ['Intercept authority: Allowed → Review required', 'Protected-location review: Off → On'],
  },
  {
    id: 'audit-1354',
    type: 'draft',
    environment: 'Operational',
    title: 'Recommendation priorities edited',
    summary: 'Balanced profile restored.',
    actor: 'Operations Supervisor',
    time: 'Today, 13:54Z',
    version: 'Draft 7',
    changes: ['Priority profile: Rapid response → Balanced'],
  },
  {
    id: 'audit-training',
    type: 'published',
    environment: 'Training',
    title: 'Training configuration published',
    summary: 'Autonomous behaviour changed to supervised.',
    actor: 'Duty Officer',
    time: 'Yesterday, 18:10Z',
    version: 'v8',
    changes: ['Automation mode: Queue permitted actions → Recommend only'],
  },
]

const SECTION_COPY: Record<RoeSection, { title: string; description: string }> = {
  overview: {
    title: 'Rules of engagement',
    description: 'Configure the permissions, boundaries and safeguards applied across the system.',
  },
  actions: {
    title: 'Action permissions',
    description: 'Define the default authority required for each type of action.',
  },
  boundaries: {
    title: 'Operational boundaries',
    description: 'Set the spatial, temporal and proximity limits enforced by the system.',
  },
  oversight: {
    title: 'Human oversight',
    description: 'Choose when recommendations must be reviewed before execution.',
  },
  autonomy: {
    title: 'Autonomous behaviour',
    description: 'Control how entities act and adapt without direct operator input.',
  },
  failsafe: {
    title: 'Fail-safe behaviour',
    description: 'Define safe responses when operational inputs become unreliable.',
  },
  priorities: {
    title: 'Recommendation priorities',
    description: 'Rank valid options without weakening permissions or safeguards.',
  },
  audit: {
    title: 'Audit trail',
    description: 'Review configuration changes and publication activity.',
  },
}

function StatusPill({ status }: { status: SettingStatus }) {
  return <span className={`roe4-status roe4-status--${status === 'Active' ? 'active' : 'setup'}`}>{status}</span>
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      className={`roe4-toggle ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
      onClick={onChange}
    >
      <i />
    </button>
  )
}

function SettingPage({
  children,
  note,
  summary,
  detail,
}: {
  children: ReactNode
  note?: string
  summary: string
  detail: string
}) {
  return (
    <div className="roe4-settings-page">
      <div className="roe4-page-summary">
        <span><i /> Active</span>
        <strong>{summary}</strong>
        <small>{detail}</small>
      </div>
      {note && <p className="roe4-note">{note}</p>}
      <div className="roe4-settings-list">{children}</div>
    </div>
  )
}

function ReadState({ enabled }: { enabled: boolean }) {
  return <span className={`roe4-state ${enabled ? 'is-active' : ''}`}>{enabled ? 'On' : 'Off'}</span>
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <h2 className="roe4-group-label">{children}</h2>
}

export function RoePolicyWorkspace() {
  const dispatch = useAppDispatch()
  const [section, setSection] = useState<RoeSection>('overview')
  const [environment, setEnvironment] = useState('Operational')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editSnapshot, setEditSnapshot] = useState<EditSnapshot | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [permissions, setPermissions] = useState(INITIAL_PERMISSIONS)
  const [boundaries, setBoundaries] = useState(INITIAL_BOUNDARIES)
  const [priorities, setPriorities] = useState(INITIAL_PRIORITIES)
  const [oversight, setOversight] = useState({
    protectedLocations: true,
    autonomousActions: true,
    intercepts: true,
    reviewer: 'Mission commander',
    fallbackReviewer: 'Operations supervisor',
    expiresAfter: '2 minutes',
    noResponse: 'Hold action',
  })
  const [autonomy, setAutonomy] = useState({
    mode: 'Recommend only' as AutonomyMode,
    supervised: true,
    confirmMaterialChanges: true,
    reduceOnDegrade: true,
  })
  const [failsafe, setFailsafe] = useState({
    staleContext: { trigger: '30 seconds', response: 'Hold action', recovery: 'Fresh context received' },
    linkLoss: { trigger: '10 seconds', response: 'Hold and return', recovery: 'Stable link restored' },
    degradedPositioning: { trigger: 'Below 60%', response: 'Require manual control', recovery: 'Confidence above 75%' },
  })
  const [priorityProfile, setPriorityProfile] = useState<PriorityProfile>('Balanced')
  const [auditFilter, setAuditFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [auditEvents, setAuditEvents] = useState(INITIAL_AUDIT_EVENTS)
  const [openAuditEvent, setOpenAuditEvent] = useState<string | null>(null)

  const copy = SECTION_COPY[section]
  const activeSummary = useMemo(
    () => `${OVERVIEW_CARDS.filter((card) => card.status === 'Active').length} of ${OVERVIEW_CARDS.length} areas active`,
    [],
  )

  const markDirty = () => setDirty(true)

  const startEditing = () => {
    setEditSnapshot({
      permissions: permissions.map((item) => ({ ...item })),
      boundaries: boundaries.map((item) => ({ ...item })),
      priorities: priorities.map((item) => ({ ...item })),
      oversight: { ...oversight },
      autonomy: { ...autonomy },
      failsafe: {
        staleContext: { ...failsafe.staleContext },
        linkLoss: { ...failsafe.linkLoss },
        degradedPositioning: { ...failsafe.degradedPositioning },
      },
      priorityProfile,
    })
    setEditing(true)
    setDirty(false)
  }

  const cancelEditing = () => {
    if (editSnapshot) {
      setPermissions(editSnapshot.permissions)
      setBoundaries(editSnapshot.boundaries)
      setPriorities(editSnapshot.priorities)
      setOversight(editSnapshot.oversight)
      setAutonomy(editSnapshot.autonomy)
      setFailsafe(editSnapshot.failsafe)
      setPriorityProfile(editSnapshot.priorityProfile)
    }
    setEditing(false)
    setDirty(false)
    setEditSnapshot(null)
  }

  const publish = () => {
    const nextMessage = `${environment} configuration published`
    setAuditEvents((current) => [
      {
        id: `audit-${Date.now()}`,
        type: 'published',
        environment,
        title: `${environment} configuration published`,
        summary: 'Draft changes reviewed and published.',
        actor: 'Mission Commander',
        time: 'Just now',
        version: environment === 'Operational' ? 'v13' : 'New version',
        changes: [`${section === 'overview' ? 'Configuration' : SECTION_COPY[section].title} updated`],
      },
      ...current,
    ])
    setMessage(nextMessage)
    dispatch(pushToast(nextMessage))
    setEditing(false)
    setDirty(false)
    setEditSnapshot(null)
  }

  const selectSection = (next: RoeSection) => {
    setSection(next)
    setMessage(null)
  }

  const selectPriorityProfile = (profile: PresetProfile) => {
    setPriorityProfile(profile)
    setPriorities((current) =>
      current.map((item, index) => ({
        ...item,
        weight: PRIORITY_PROFILES[profile][index] ?? item.weight,
      })),
    )
    markDirty()
  }

  const visibleAuditEvents = auditEvents.filter(
    (event) =>
      event.environment === environment &&
      (auditFilter === 'all' || event.type === auditFilter),
  )

  return (
    <main className="roe4">
      <aside className="roe4-nav">
        <div className="roe4-nav__brand">
          <span>ROE</span>
          <strong>Rules of engagement</strong>
        </div>

        <nav aria-label="Rules of engagement settings">
          <button type="button" className={section === 'overview' ? 'is-active' : ''} onClick={() => selectSection('overview')}>
            Overview
          </button>

          <p>Configure</p>
          {CONFIGURE_NAV.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} onClick={() => selectSection(item.id)}>
              {item.label}
            </button>
          ))}

          <p>Monitor</p>
          <button type="button" className={section === 'audit' ? 'is-active' : ''} onClick={() => selectSection('audit')}>
            Audit trail
          </button>
        </nav>

        <div className="roe4-nav__footer">
          <span>Current configuration</span>
          <strong><i /> Operational</strong>
          <small>Updated 14:30Z</small>
        </div>
      </aside>

      <section className="roe4-main">
        <header className="roe4-header">
          <div>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className="roe4-header__actions">
            <label>
              <span className="roe4-environment-dot" />
              <select aria-label="Configuration environment" value={environment} onChange={(event) => { cancelEditing(); setEnvironment(event.target.value) }}>
                <option>Operational</option>
                <option>Training</option>
                <option>Development</option>
              </select>
            </label>
            {section !== 'audit' && (
              editing ? (
                <>
                  <button type="button" className="roe4-btn roe4-btn--secondary" onClick={cancelEditing}>Cancel</button>
                  <button type="button" className="roe4-btn roe4-btn--primary" disabled={!dirty} onClick={publish}>Publish changes</button>
                </>
              ) : (
                <button type="button" className="roe4-btn roe4-btn--primary" onClick={startEditing}>Edit</button>
              )
            )}
          </div>
        </header>

        {message && (
          <div className="roe4-message" role="status">
            <span>✓</span>
            <strong>{message}</strong>
            <button type="button" onClick={() => setMessage(null)}>Dismiss</button>
          </div>
        )}

        {editing && (
          <div className="roe4-edit-banner">
            <span><i /> Editing draft</span>
            <p>Changes will not affect the active configuration until published.</p>
          </div>
        )}

        <div className="roe4-content">
          {section === 'overview' && (
            <>
              <div className="roe4-overview-status">
                <div>
                  <span className="roe4-overview-status__icon">✓</span>
                  <span><strong>Configuration is active</strong><small>{activeSummary}</small></span>
                </div>
                <dl>
                  <div><dt>Environment</dt><dd>{environment}</dd></div>
                  <div><dt>Last published</dt><dd>Today, 14:30Z</dd></div>
                  <div><dt>Published by</dt><dd>Mission Commander</dd></div>
                </dl>
              </div>

              <div className="roe4-card-grid">
                {OVERVIEW_CARDS.map((card) => (
                  <button key={card.id} type="button" onClick={() => selectSection(card.id)}>
                    <div>
                      <h2>{card.title}</h2>
                      <StatusPill status={card.status} />
                    </div>
                    <p>{card.description}</p>
                    <footer><span>{card.summary}</span><strong>Open →</strong></footer>
                  </button>
                ))}
              </div>
            </>
          )}

          {section === 'actions' && (
            <SettingPage
              summary={`${permissions.filter((item) => item.authority === 'Allowed').length} allowed · ${permissions.filter((item) => item.authority === 'Review required').length} require review`}
              detail="Last changed today at 14:30Z"
              note="These are system-wide defaults. More specific package and mission conditions can be added later."
            >
              {permissions.map((item) => (
                <article key={item.id} className="roe4-setting-row">
                  <div><h2>{item.action}</h2><p>{item.description}</p></div>
                  {editing ? (
                    <select
                      value={item.authority}
                      onChange={(event) => {
                        setPermissions((current) => current.map((permission) => permission.id === item.id ? { ...permission, authority: event.target.value as PermissionSetting['authority'] } : permission))
                        markDirty()
                      }}
                    >
                      <option>Allowed</option>
                      <option>Review required</option>
                      <option>Blocked</option>
                    </select>
                  ) : (
                    <span className={`roe4-value roe4-value--${item.authority === 'Allowed' ? 'active' : item.authority === 'Blocked' ? 'blocked' : 'review'}`}>{item.authority}</span>
                  )}
                  <span className="roe4-row-context">System-wide default</span>
                </article>
              ))}
            </SettingPage>
          )}

          {section === 'boundaries' && (
            <SettingPage
              summary={`${boundaries.filter((item) => item.enabled).length} boundaries active`}
              detail="2 safeguards are locked"
              note="Locked safeguards are controlled by the system and cannot be weakened here."
            >
              {boundaries.map((item) => (
                <article key={item.id} className={`roe4-setting-row ${!item.enabled ? 'is-disabled' : ''}`}>
                  <div><h2>{item.label}</h2><p>{item.description}</p></div>
                  <div className="roe4-setting-row__control">
                    {editing && !item.locked ? (
                      <select
                        aria-label={`${item.label} value`}
                        value={item.value}
                        onChange={(event) => {
                          setBoundaries((current) => current.map((boundary) => boundary.id === item.id ? { ...boundary, value: event.target.value } : boundary))
                          markDirty()
                        }}
                      >
                        {BOUNDARY_VALUES[item.id]?.map((value) => <option key={value}>{value}</option>)}
                      </select>
                    ) : <strong>{item.value}</strong>}
                    {editing ? (
                      <Toggle
                        checked={item.enabled}
                        disabled={item.locked}
                        label={`Toggle ${item.label}`}
                        onChange={() => {
                          setBoundaries((current) => current.map((boundary) => boundary.id === item.id ? { ...boundary, enabled: !boundary.enabled } : boundary))
                          markDirty()
                        }}
                      />
                    ) : <ReadState enabled={item.enabled} />}
                  </div>
                  {item.locked && <span className="roe4-lock">LOCKED</span>}
                </article>
              ))}
            </SettingPage>
          )}

          {section === 'oversight' && (
            <SettingPage
              summary={`${[oversight.protectedLocations, oversight.autonomousActions, oversight.intercepts].filter(Boolean).length} review conditions active`}
              detail={`Primary reviewer: ${oversight.reviewer}`}
            >
              <GroupLabel>Review conditions</GroupLabel>
              {([
                ['protectedLocations', 'Protected locations', 'Require review for actions near protected locations.'],
                ['autonomousActions', 'Autonomous actions', 'Require review before an entity changes a material task parameter.'],
                ['intercepts', 'Intercept actions', 'Require command approval before an intercept is issued.'],
              ] as const).map(([key, label, description]) => (
                <article key={key} className="roe4-setting-row">
                  <div><h2>{label}</h2><p>{description}</p></div>
                  {editing
                    ? <Toggle checked={oversight[key]} label={`Toggle ${label}`} onChange={() => { setOversight((current) => ({ ...current, [key]: !current[key] })); markDirty() }} />
                    : <ReadState enabled={oversight[key]} />}
                </article>
              ))}
              <GroupLabel>Approval routing</GroupLabel>
              <article className="roe4-setting-row">
                <div><h2>Primary reviewer</h2><p>Route new review requests to this authority.</p></div>
                {editing ? (
                  <select value={oversight.reviewer} onChange={(event) => { setOversight((current) => ({ ...current, reviewer: event.target.value })); markDirty() }}>
                    <option>Mission commander</option>
                    <option>Operations supervisor</option>
                    <option>Duty officer</option>
                  </select>
                ) : <span className="roe4-setting-row__value">{oversight.reviewer}</span>}
              </article>
              <article className="roe4-setting-row">
                <div><h2>Fallback reviewer</h2><p>Use this authority when the primary reviewer is unavailable.</p></div>
                {editing ? (
                  <select value={oversight.fallbackReviewer} onChange={(event) => { setOversight((current) => ({ ...current, fallbackReviewer: event.target.value })); markDirty() }}>
                    <option>Operations supervisor</option><option>Duty officer</option><option>No fallback</option>
                  </select>
                ) : <span className="roe4-setting-row__value">{oversight.fallbackReviewer}</span>}
              </article>
              <article className="roe4-setting-row">
                <div><h2>Review timeout</h2><p>Declare what happens when no authority responds.</p></div>
                <div className="roe4-inline-values">
                  {editing ? (
                    <>
                      <select value={oversight.expiresAfter} onChange={(event) => { setOversight((current) => ({ ...current, expiresAfter: event.target.value })); markDirty() }}><option>1 minute</option><option>2 minutes</option><option>5 minutes</option></select>
                      <select value={oversight.noResponse} onChange={(event) => { setOversight((current) => ({ ...current, noResponse: event.target.value })); markDirty() }}><option>Hold action</option><option>Escalate again</option><option>Cancel request</option></select>
                    </>
                  ) : <><strong>{oversight.expiresAfter}</strong><span>then {oversight.noResponse.toLowerCase()}</span></>}
                </div>
              </article>
            </SettingPage>
          )}

          {section === 'autonomy' && (
            <SettingPage
              summary={autonomy.mode}
              detail="All permissions and safeguards remain enforced"
              note="Automation controls who proposes or initiates an action. It never grants additional authority."
            >
              <GroupLabel>Automation level</GroupLabel>
              <div className="roe4-mode-grid">
                {(['Recommend only', 'Queue permitted actions', 'Execute permitted actions'] as AutonomyMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={autonomy.mode === mode ? 'is-selected' : ''}
                    disabled={!editing}
                    onClick={() => { setAutonomy((current) => ({ ...current, mode })); markDirty() }}
                  >
                    <i>{autonomy.mode === mode ? '✓' : ''}</i>
                    <strong>{mode}</strong>
                    <span>{mode === 'Recommend only' ? 'A person issues every action.' : mode === 'Queue permitted actions' ? 'A person confirms queued actions.' : 'Only explicitly permitted actions may execute.'}</span>
                  </button>
                ))}
              </div>
              <GroupLabel>Safeguards</GroupLabel>
              <article className="roe4-setting-row">
                <div><h2>Human supervision</h2><p>Keep an operator in the decision loop for consequential actions.</p></div>
                {editing ? <Toggle checked={autonomy.supervised} label="Toggle human supervision" onChange={() => { setAutonomy((current) => ({ ...current, supervised: !current.supervised })); markDirty() }} /> : <ReadState enabled={autonomy.supervised} />}
              </article>
              <article className="roe4-setting-row">
                <div><h2>Confirm material changes</h2><p>Ask before changing the assigned entity, action, area or intended effect.</p></div>
                {editing ? <Toggle checked={autonomy.confirmMaterialChanges} label="Toggle material change confirmation" onChange={() => { setAutonomy((current) => ({ ...current, confirmMaterialChanges: !current.confirmMaterialChanges })); markDirty() }} /> : <ReadState enabled={autonomy.confirmMaterialChanges} />}
              </article>
              <article className="roe4-setting-row">
                <div><h2>Reduce autonomy when degraded</h2><p>Return to recommend-only mode when link or positioning quality degrades.</p></div>
                {editing ? <Toggle checked={autonomy.reduceOnDegrade} label="Toggle degraded autonomy reduction" onChange={() => { setAutonomy((current) => ({ ...current, reduceOnDegrade: !current.reduceOnDegrade })); markDirty() }} /> : <ReadState enabled={autonomy.reduceOnDegrade} />}
              </article>
            </SettingPage>
          )}

          {section === 'failsafe' && (
            <SettingPage summary="3 degraded conditions configured" detail="Every condition has a declared response">
              {([
                ['staleContext', 'Stale operational context', 'Applied when decision inputs exceed their freshness limit.', ['15 seconds', '30 seconds', '60 seconds'], ['Hold action', 'Request review', 'Continue with warning']],
                ['linkLoss', 'Command link loss', 'Applied when an entity loses its command connection.', ['5 seconds', '10 seconds', '30 seconds'], ['Hold and return', 'Hold position', 'Continue current task']],
                ['degradedPositioning', 'Degraded positioning', 'Applied when positioning confidence falls below the threshold.', ['Below 40%', 'Below 60%', 'Below 75%'], ['Require manual control', 'Hold position', 'Return to base']],
              ] as const).map(([key, label, description, triggers, responses]) => (
                <article key={key} className="roe4-setting-row roe4-setting-row--failsafe">
                  <div><h2>{label}</h2><p>{description}</p></div>
                  {editing ? (
                    <div className="roe4-trigger-response">
                      <label><span>Trigger</span><select value={failsafe[key].trigger} onChange={(event) => { setFailsafe((current) => ({ ...current, [key]: { ...current[key], trigger: event.target.value } })); markDirty() }}>{triggers.map((option) => <option key={option}>{option}</option>)}</select></label>
                      <em>→</em>
                      <label><span>Response</span><select value={failsafe[key].response} onChange={(event) => { setFailsafe((current) => ({ ...current, [key]: { ...current[key], response: event.target.value } })); markDirty() }}>{responses.map((option) => <option key={option}>{option}</option>)}</select></label>
                    </div>
                  ) : (
                    <div className="roe4-trigger-response">
                      <span><small>Trigger</small><strong>{failsafe[key].trigger}</strong></span><em>→</em><span><small>Response</small><strong>{failsafe[key].response}</strong></span>
                    </div>
                  )}
                  <small className="roe4-recovery">Recover when: {failsafe[key].recovery}</small>
                </article>
              ))}
            </SettingPage>
          )}

          {section === 'priorities' && (
            <SettingPage
              summary={`${priorityProfile} profile`}
              detail="Priorities rank eligible options only"
              note="Priorities only rank options that have already passed every permission and safeguard."
            >
              <GroupLabel>Profile</GroupLabel>
              <div className="roe4-profile-row">
                {(Object.keys(PRIORITY_PROFILES) as PresetProfile[]).map((profile) => (
                  <button key={profile} type="button" className={priorityProfile === profile ? 'is-selected' : ''} disabled={!editing} onClick={() => selectPriorityProfile(profile)}>
                    <i>{priorityProfile === profile ? '✓' : ''}</i><span>{profile}</span>
                  </button>
                ))}
              </div>
              <GroupLabel>Importance</GroupLabel>
              {priorities.map((item) => (
                <article key={item.id} className="roe4-setting-row roe4-setting-row--priority">
                  <div><h2>{item.label}</h2><p>{item.description}</p></div>
                  {editing ? (
                    <div className="roe4-range">
                      <input
                        aria-label={`${item.label} priority`}
                        type="range"
                        min="0"
                        max="100"
                        value={item.weight}
                        onChange={(event) => {
                          setPriorities((current) => current.map((priority) => priority.id === item.id ? { ...priority, weight: Number(event.target.value) } : priority))
                          setPriorityProfile('Custom')
                          markDirty()
                        }}
                      />
                      <strong>{item.weight}</strong>
                      <small>{item.weight >= 70 ? 'High' : item.weight >= 45 ? 'Medium' : 'Low'}</small>
                    </div>
                  ) : (
                    <div className="roe4-priority-value"><i><span style={{ width: `${item.weight}%` }} /></i><strong>{item.weight}</strong><small>{item.weight >= 70 ? 'High' : item.weight >= 45 ? 'Medium' : 'Low'}</small></div>
                  )}
                </article>
              ))}
              <div className="roe4-priority-preview">
                <span>Expected effect</span>
                <strong>{priorityProfile === 'Rapid response' ? 'Faster-arriving assets rank higher' : priorityProfile === 'Persistent coverage' ? 'Long-endurance assets rank higher' : priorityProfile === 'Resource reserve' ? 'Lower-consumption options rank higher' : priorityProfile === 'Custom' ? 'Custom weighting applied' : 'Balances effect, response and endurance'}</strong>
                <small>A live recommendation comparison will appear here when the recommender is connected.</small>
              </div>
            </SettingPage>
          )}

          {section === 'audit' && (
            <div className="roe4-audit">
              <div className="roe4-audit__filters">
                <button type="button" className={auditFilter === 'all' ? 'is-active' : ''} onClick={() => setAuditFilter('all')}>All activity</button>
                <button type="button" className={auditFilter === 'published' ? 'is-active' : ''} onClick={() => setAuditFilter('published')}>Published</button>
                <button type="button" className={auditFilter === 'draft' ? 'is-active' : ''} onClick={() => setAuditFilter('draft')}>Drafts</button>
                <span>{visibleAuditEvents.length} events in {environment}</span>
              </div>
              <div className="roe4-audit__list">
                {visibleAuditEvents.length === 0 && <p className="roe4-audit__empty">No matching activity in this environment.</p>}
                {visibleAuditEvents.map((event) => (
                  <article key={event.id} className={openAuditEvent === event.id ? 'is-open' : ''}>
                    <button type="button" onClick={() => setOpenAuditEvent((current) => current === event.id ? null : event.id)}>
                      <span className={`roe4-audit__mark ${event.type === 'published' ? 'roe4-audit__mark--published' : ''}`}>{event.type === 'published' ? '✓' : '✎'}</span>
                      <span><h2>{event.title}</h2><p>{event.summary}</p><small>{event.actor} · {event.version}</small></span>
                      <time>{event.time}</time>
                      <em>{openAuditEvent === event.id ? '−' : '+'}</em>
                    </button>
                    {openAuditEvent === event.id && (
                      <div className="roe4-audit__detail">
                        <span>Changes</span>
                        <ul>{event.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                        <dl>
                          <div><dt>Environment</dt><dd>{event.environment}</dd></div>
                          <div><dt>Version</dt><dd>{event.version}</dd></div>
                          <div><dt>Actor</dt><dd>{event.actor}</dd></div>
                        </dl>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
