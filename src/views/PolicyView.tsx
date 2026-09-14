import { useState } from 'react'
import { Section } from '@/components/panel/Section'
import { StatusRow } from '@/components/panel/StatusRow'

type PolicySection = 'permissions' | 'boundaries' | 'oversight' | 'autonomy' | 'failsafe' | 'priorities' | 'audit'
const tabs: Array<[PolicySection, string]> = [['permissions', 'Actions'], ['boundaries', 'Bounds'], ['oversight', 'Review'], ['autonomy', 'Auto'], ['failsafe', 'Fail-safe'], ['priorities', 'Rank'], ['audit', 'Audit']]
const initialPermissions = { Observe: 'Allowed', Track: 'Allowed', Escort: 'Allowed', Relay: 'Allowed', Intercept: 'Review required' }

export function PolicyView() {
  const [section, setSection] = useState<PolicySection>('permissions')
  const [environment, setEnvironment] = useState('Production')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [version, setVersion] = useState(12)
  const [permissions, setPermissions] = useState(initialPermissions)
  const [autonomy, setAutonomy] = useState('Recommend only')
  const [dryRun, setDryRun] = useState('T-04')
  const [audit, setAudit] = useState(['v12 · Intercept changed to review required · Supervisor', 'v11 · Protected buffer changed to 500 m · Supervisor'])
  const control = 'rounded-sm border border-border bg-panel-inset px-2 py-1 text-2xs text-text'
  const change = () => setDirty(true)
  const publish = () => { setVersion((value) => value + 1); setAudit((items) => [`v${version + 1} · ${section} configuration published · Local operator`, ...items]); setEditing(false); setDirty(false) }

  return <div className="flex flex-col gap-4 p-3">
    <div className="rounded-sm border border-signal-nominal/30 bg-panel-inset p-2"><div className="flex justify-between"><strong className="text-xs text-signal-nominal">CURRENT CONFIG</strong><span className="font-mono text-2xs">v{version}</span></div><div className="mt-2 flex gap-1"><select aria-label="Policy environment" className={`${control} flex-1`} value={environment} onChange={(e) => setEnvironment(e.target.value)}><option>Production</option><option>Test</option><option>Development</option></select>{editing ? <><button className={control} onClick={() => { setEditing(false); setDirty(false) }}>CANCEL</button><button className={`${control} ${dirty ? 'text-signal-nominal' : 'text-text-disabled'}`} disabled={!dirty} onClick={publish}>PUBLISH</button></> : <button className={control} onClick={() => setEditing(true)}>EDIT</button>}</div>{editing && <p className="mt-2 text-2xs text-signal-caution">Draft changes are not active until published.</p>}</div>
    <div className="grid grid-cols-4 gap-1">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} className={`rounded-xs px-1 py-1 text-2xs ${section === id ? 'bg-state-selected text-text' : 'bg-panel-inset text-text-tertiary'}`}>{label}</button>)}</div>

    {section === 'permissions' && <Section title="Action permissions"><div className="flex flex-col gap-1">{Object.entries(permissions).map(([action, authority]) => <label key={action} className="flex items-center justify-between rounded-sm border border-border-faint bg-panel-inset p-2 text-xs"><span>{action}</span>{editing ? <select aria-label={`${action} authority`} className={control} value={authority} onChange={(e) => { setPermissions((items) => ({ ...items, [action]: e.target.value })); change() }}><option>Allowed</option><option>Review required</option><option>Blocked</option></select> : <span className={authority === 'Allowed' ? 'text-signal-nominal' : 'text-signal-caution'}>{authority}</span>}</label>)}</div></Section>}

    {section === 'boundaries' && <Section title="Operational boundaries"><div className="flex flex-col gap-1 rounded-sm border border-border-faint bg-panel-inset p-2"><StatusRow label="Restricted zones" value="NO ENTRY · LOCKED"/><StatusRow label="Protected buffer" value="500 m · ON"/><StatusRow label="Minimum separation" value="250 m · LOCKED"/><StatusRow label="Task authority" value="60 min · ON"/></div><p className="mt-2 text-2xs text-text-tertiary">Locked safeguards cannot be weakened at this station.</p></Section>}

    {section === 'oversight' && <Section title="Review requirements"><div className="flex flex-col gap-1 rounded-sm border border-border-faint bg-panel-inset p-2"><StatusRow label="Protected locations" value="REVIEW"/><StatusRow label="Automated changes" value="REVIEW"/><StatusRow label="Intercept actions" value="REVIEW"/><StatusRow label="Primary reviewer" value="SUPERVISOR"/><StatusRow label="Fallback" value="SECOND REVIEWER"/><StatusRow label="Timeout" value="2 min → PAUSE"/></div></Section>}

    {section === 'autonomy' && <Section title="Autonomous behaviour"><div className="flex flex-col gap-1">{['Recommend only', 'Queue permitted actions', 'Execute permitted actions'].map((mode) => <button key={mode} disabled={!editing} onClick={() => { setAutonomy(mode); change() }} className={`rounded-sm border p-2 text-left text-xs ${autonomy === mode ? 'border-border-strong bg-state-selected' : 'border-border-faint bg-panel-inset'}`}><strong>{mode}</strong><span className="mt-1 block text-2xs text-text-tertiary">{mode === 'Recommend only' ? 'A person issues every action.' : mode === 'Queue permitted actions' ? 'A person confirms queued actions.' : 'Only explicitly permitted actions may execute.'}</span></button>)}</div><div className="mt-2 rounded-sm bg-panel-inset p-2 text-2xs text-text-secondary">Human supervision ON · Confirm material changes ON · Reduce autonomy when degraded ON</div></Section>}

    {section === 'failsafe' && <Section title="Trigger → response → recovery"><div className="flex flex-col gap-1.5">{[['Stale context', '30 s', 'Hold action', 'Fresh context'], ['Command link loss', '10 s', 'Hold and return', 'Stable link'], ['Positioning', '< 60%', 'Manual control', '> 75% confidence']].map(([name, trigger, response, recovery]) => <div key={name} className="rounded-sm border border-border-faint bg-panel-inset p-2"><strong className="text-xs">{name}</strong><div className="mt-1 font-mono text-2xs text-text-secondary">{trigger} → {response}</div><div className="mt-1 text-2xs text-text-tertiary">Recover: {recovery}</div></div>)}</div></Section>}

    {section === 'priorities' && <Section title="Recommendation priorities"><select className={`${control} w-full`} defaultValue="Balanced" disabled={!editing} onChange={change}><option>Balanced</option><option>Rapid response</option><option>Persistent coverage</option><option>Resource reserve</option></select><div className="mt-2 flex flex-col gap-1 rounded-sm bg-panel-inset p-2"><StatusRow label="Mission effect" value="72"/><StatusRow label="Response time" value="68"/><StatusRow label="Transit distance" value="46"/><StatusRow label="Time on station" value="58"/><StatusRow label="Battery reserve" value="52"/></div><p className="mt-2 text-2xs text-text-tertiary">Ranking never weakens a permission or safeguard.</p></Section>}

    {section === 'audit' && <Section title="Policy audit"><div className="flex flex-col gap-1.5">{audit.map((item) => <div key={item} className="rounded-sm border border-border-faint bg-panel-inset p-2 text-2xs text-text-secondary">{item}</div>)}</div></Section>}

    <Section title="Policy check"><div className="flex gap-1"><select aria-label="Policy-check track" className={`${control} flex-1`} value={dryRun} onChange={(e) => setDryRun(e.target.value)}><option>T-04</option><option>T-07</option><option>T-03</option></select><span className={`rounded-sm border px-2 py-1 text-2xs ${dryRun === 'T-03' ? 'border-signal-caution/40 text-signal-caution' : 'border-signal-nominal/40 text-signal-nominal'}`}>{dryRun === 'T-03' ? 'REVIEW' : 'PASS'}</span></div><p className="mt-1 text-2xs text-text-tertiary">Local result · config v{version}</p></Section>
  </div>
}
