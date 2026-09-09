import { useState } from 'react'
import { Section } from '@/components/panel/Section'
import { approveEligibleTasks, selectTask, setTaskStatus, useOperations } from '@/state/operations'

export function TaskingView() {
  const ops = useOperations()
  const [armed, setArmed] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)
  const selected = ops.tasks.find((task) => task.id === ops.selectedTaskId) ?? ops.tasks[0]
  const ready = ops.tasks.filter((task) => task.status === 'review' && task.policy === 'within')
  const exceptions = ops.tasks.filter((task) => task.policy !== 'within')
  const approve = () => { if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 5000); return } approveEligibleTasks(); setArmed(false) }
  return <div className="flex flex-col gap-4 p-3">
    <Section title="Mission plan"><div className="grid grid-cols-4 gap-1 text-center">{[['Groups', ops.tasks.length], ['Execute', ops.tasks.filter((t) => t.status === 'executing').length], ['Review', ops.tasks.filter((t) => t.status === 'review').length], ['Except', exceptions.length]].map(([label, value]) => <div key={label} className="rounded-xs bg-panel-inset p-1"><strong className="block font-mono">{value}</strong><span className="text-2xs text-text-tertiary">{label}</span></div>)}</div></Section>
    <Section title="Task groups"><div className="flex flex-col gap-1">{ops.tasks.map((task) => <button key={task.id} onClick={() => { selectTask(task.id); setIntentOpen(false) }} className={`rounded-sm border p-2 text-left ${selected.id === task.id ? 'border-border-strong bg-state-selected' : 'border-border-faint bg-panel-inset'}`}><div className="flex justify-between"><strong className="font-mono text-xs">{task.id}</strong><span className={task.policy === 'within' ? 'text-2xs text-signal-nominal' : 'text-2xs text-signal-caution'}>{task.policy === 'within' ? 'WITHIN AUTHORITY' : 'REVIEW REQUIRED'}</span></div><div className="mt-1 flex justify-between text-2xs text-text-tertiary"><span>{task.objective} {task.trackId}</span><span>{task.assetIds.length} ASSETS · {task.status.toUpperCase()}</span></div></button>)}</div></Section>
    <Section title="Selected group"><div className="rounded-sm border border-border-faint bg-panel-inset p-2"><div className="flex justify-between"><strong>{selected.objective} {selected.trackId}</strong><span className="font-mono text-2xs">{selected.etaSeconds}s / {selected.confidence}%</span></div><p className="mt-2 text-2xs leading-relaxed text-text-secondary">{selected.rationale}</p><div className="mt-2 text-2xs text-text-tertiary">ASSIGNED · {selected.assetIds.join(' / ')}</div></div>
      {selected.status === 'review' && !intentOpen && <button onClick={() => { setTaskStatus(selected.id, 'rejected'); setIntentOpen(true) }} className="mt-1.5 w-full rounded-sm border border-signal-caution/40 p-2 text-xs text-signal-caution">REJECT / CHANGE GROUP</button>}
      {intentOpen && <div className="mt-1.5 grid grid-cols-2 gap-1">{['SWAP', 'REASSIGN', 'DELAY', 'PRIORITY UP', 'HOLD', 'ESCALATE'].map((intent) => <button key={intent} onClick={() => { setTaskStatus(selected.id, 'review'); setIntentOpen(false) }} className="rounded-xs border border-border-faint bg-panel-inset p-1.5 text-2xs">{intent}</button>)}</div>}
      {selected.status === 'executing' && <div className="mt-1.5 grid grid-cols-2 gap-1"><button onClick={() => setTaskStatus(selected.id, 'held')} className="rounded-sm border border-signal-caution/40 p-2 text-xs text-signal-caution">HOLD GROUP</button><button onClick={() => setTaskStatus(selected.id, 'rejected')} className="rounded-sm border border-signal-critical/40 p-2 text-xs text-signal-critical">ABORT GROUP</button></div>}
    </Section>
    <button disabled={!ready.length} onClick={approve} className={`rounded-sm border p-2 text-xs ${ready.length ? 'border-signal-nominal/50 text-signal-nominal' : 'border-border-faint text-text-disabled'}`}>{armed ? `CONFIRM DISPATCH / ${ready.length}` : `APPROVE PLAN / ${ready.length}`}</button>{armed && <p className="-mt-3 text-center text-2xs text-signal-caution">Press again within five seconds</p>}
  </div>
}
