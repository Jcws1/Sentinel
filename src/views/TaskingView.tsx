import { useState } from 'react'
import { Section } from '@/components/panel/Section'
import { TRACKS } from '@/data/operations'
import { dispatchWedgetailIntercept, dispatchWedgetailLittoralIntercepts } from '@/adapters/wedgetail'
import { addEvent, approveEligibleTasks, selectTask, setTaskStatus, setWedgetailStatus, useOperations } from '@/state/operations'

export function TaskingView() {
  const ops = useOperations()
  const [armed, setArmed] = useState(false)
  const [adapterArmed, setAdapterArmed] = useState(false)
  const [adapterBusy, setAdapterBusy] = useState(false)
  const [intentOpen, setIntentOpen] = useState(false)
  const selected = ops.tasks.find((task) => task.id === ops.selectedTaskId) ?? ops.tasks[0]
  const ready = ops.tasks.filter((task) => task.status === 'review' && task.policy === 'within' && task.adapter === 'sentinel-native')
  const exceptions = ops.tasks.filter((task) => task.policy !== 'within')
  const approve = () => { if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 5000); return } approveEligibleTasks(); setArmed(false) }
  const runWedgetail = async () => {
    if (!adapterArmed) {
      setAdapterArmed(true)
      window.setTimeout(() => setAdapterArmed(false), 5000)
      return
    }
    const track = TRACKS.find((item) => item.id === selected.trackId)
    if (!track) return
    const coastal = selected.id === 'TASK-WGT-SPLIT'
    setAdapterArmed(false)
    setAdapterBusy(true)
    setWedgetailStatus({ mode: coastal ? 'coastal' : 'single', status: 'connecting', phase: 'track-ready', startedAt: null, message: `Reading launch boxes for ${track.id}` })
    addEvent(`Thales track ${track.id} queued for Wedgetail`, selected.id, 'info', 'Thales simulator')
    try {
      const results = coastal
        ? await dispatchWedgetailLittoralIntercepts()
        : [await dispatchWedgetailIntercept(selected, track)]
      setTaskStatus(selected.id, 'executing')
      const startedAt = Date.now()
      const first = results[0]
      setWedgetailStatus({
        status: 'engaging',
        phase: 'launch',
        startedAt,
        message: `${results.length} synthetic ${results.length === 1 ? 'track' : 'tracks'} accepted. Interceptor response is running in the Wedgetail live simulator.`,
        boxId: coastal ? 'box_1 / box_2 / box_3' : first.launchPoint.box_id,
        targetLabel: results.map((result) => result.received.label).join(' / '),
      })
      for (const result of results) addEvent(`${result.launchPoint.box_id} accepted ${result.received.label}`, selected.id, 'info', 'Wedgetail sandbox')
      window.setTimeout(() => setWedgetailStatus({
        phase: 'intercept',
        message: 'External engagement active. The public API confirms task acceptance but does not expose interceptor telemetry to Sentinel.',
      }), 1_500)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wedgetail sandbox request failed'
      setWedgetailStatus({ status: 'error', phase: 'error', message })
      addEvent(message, selected.id, 'critical', 'Wedgetail sandbox')
    } finally {
      setAdapterBusy(false)
    }
  }
  return <div className="flex flex-col gap-4 p-3">
    <Section title="Task summary"><div className="grid grid-cols-4 gap-1 text-center">{[['Total', ops.tasks.length], ['Running', ops.tasks.filter((t) => t.status === 'executing').length], ['Review', ops.tasks.filter((t) => t.status === 'review').length], ['Issues', exceptions.length]].map(([label, value]) => <div key={label} className="rounded-xs bg-panel-inset p-1"><strong className="block font-mono">{value}</strong><span className="text-2xs text-text-tertiary">{label}</span></div>)}</div></Section>
    <Section title="Task groups"><div className="flex flex-col gap-1">{ops.tasks.map((task) => <button key={task.id} onClick={() => { selectTask(task.id); setIntentOpen(false) }} className={`rounded-sm border p-2 text-left ${selected.id === task.id ? 'border-border-strong bg-state-selected' : 'border-border-faint bg-panel-inset'}`}><div className="flex justify-between"><strong className="font-mono text-xs">{task.id}</strong><span className={task.policy === 'within' ? 'text-2xs text-signal-nominal' : 'text-2xs text-signal-caution'}>{task.policy === 'within' ? 'POLICY PASS' : 'CHECK REQUIRED'}</span></div><div className="mt-1 flex justify-between text-2xs text-text-tertiary"><span>{task.objective} {task.trackId}</span><span>{task.assetIds.length} ADAPTERS · {task.status.toUpperCase()}</span></div></button>)}</div></Section>
    <Section title="Selected group"><div className="rounded-sm border border-border-faint bg-panel-inset p-2"><div className="flex justify-between"><strong>{selected.objective} {selected.trackId}</strong><span className="font-mono text-2xs">{selected.etaSeconds}s / {selected.confidence}%</span></div><p className="mt-2 text-2xs leading-relaxed text-text-secondary">{selected.rationale}</p><div className="mt-2 text-2xs text-text-tertiary">ADAPTER · {selected.adapter === 'wedgetail-sandbox' ? 'WEDGETAIL SANDBOX' : 'LOCAL'} · {selected.assetIds.join(' / ')}</div></div>
      {selected.adapter === 'wedgetail-sandbox' && selected.status !== 'executing' && <><button disabled={adapterBusy} onClick={runWedgetail} className="mt-1.5 w-full rounded-sm border border-signal-nominal/50 p-2 text-xs text-signal-nominal disabled:text-text-disabled">{adapterBusy ? 'CONNECTING…' : adapterArmed ? 'CONFIRM SANDBOX REQUEST' : 'RUN WEDGETAIL SIM'}</button>{adapterArmed && <p className="mt-1 text-center text-2xs text-signal-caution">Sends the selected synthetic track to Wedgetail's public sandbox.</p>}</>}
      {selected.adapter === 'wedgetail-sandbox' && <div className={`mt-1.5 rounded-sm border border-border-faint bg-panel-inset p-2 text-2xs ${ops.wedgetail.status === 'error' ? 'text-signal-critical' : 'text-text-secondary'}`}><div className="flex justify-between"><strong>WEDGETAIL</strong><span>{ops.wedgetail.phase.replace('-', ' ').toUpperCase()}</span></div><p className="mt-1 leading-relaxed text-text-tertiary">{ops.wedgetail.message}</p>{ops.wedgetail.boxId && <p className="mt-1 font-mono">{ops.wedgetail.boxId} · {ops.wedgetail.targetLabel}</p>}</div>}
      {selected.status === 'review' && selected.adapter !== 'wedgetail-sandbox' && !intentOpen && <button onClick={() => { setTaskStatus(selected.id, 'rejected'); setIntentOpen(true) }} className="mt-1.5 w-full rounded-sm border border-signal-caution/40 p-2 text-xs text-signal-caution">REJECT / CHANGE GROUP</button>}
      {intentOpen && <div className="mt-1.5 grid grid-cols-2 gap-1">{['SWAP', 'REASSIGN', 'DELAY', 'PRIORITY UP', 'HOLD', 'ESCALATE'].map((intent) => <button key={intent} onClick={() => { setTaskStatus(selected.id, 'review'); setIntentOpen(false) }} className="rounded-xs border border-border-faint bg-panel-inset p-1.5 text-2xs">{intent}</button>)}</div>}
      {selected.status === 'executing' && <div className="mt-1.5 grid grid-cols-2 gap-1"><button onClick={() => setTaskStatus(selected.id, 'held')} className="rounded-sm border border-signal-caution/40 p-2 text-xs text-signal-caution">HOLD GROUP</button><button onClick={() => setTaskStatus(selected.id, 'rejected')} className="rounded-sm border border-signal-critical/40 p-2 text-xs text-signal-critical">ABORT GROUP</button></div>}
    </Section>
    <button disabled={!ready.length} onClick={approve} className={`rounded-sm border p-2 text-xs ${ready.length ? 'border-signal-nominal/50 text-signal-nominal' : 'border-border-faint text-text-disabled'}`}>{armed ? `CONFIRM / ${ready.length}` : `APPROVE / ${ready.length}`}</button>{armed && <p className="-mt-3 text-center text-2xs text-signal-caution">Press again within five seconds</p>}
  </div>
}
