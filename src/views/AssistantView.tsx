import { useState } from 'react'
import { Section } from '@/components/panel/Section'
import { SENSOR_SOURCES, TRACKS } from '@/data/operations'
import { SWARM } from '@/data/swarm'
import { useOperations } from '@/state/operations'

interface Recommendation {
  title: string
  allocationPct: number
  action: string
  rationale: string
  evidence: string[]
  constraint: string
}

interface AssistantReply {
  summary: string
  recommendations: Recommendation[]
}

interface Message {
  role: 'assistant' | 'user'
  text: string
  reply?: AssistantReply
}

export function AssistantView() {
  const ops = useOperations()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    text: 'I analyse the current training-state snapshot and return three defensive recommendations. Recommendations never execute actions.',
  }])

  const send = async () => {
    const question = input.trim()
    if (!question || busy) return
    setInput('')
    setError('')
    setBusy(true)
    setMessages((items) => [...items, { role: 'user', text: question }])

    const trainingState = {
      capturedAt: new Date().toISOString(),
      mission: { state: ops.missionState, connected: ops.connected, gnss: ops.gnss, automation: ops.autoMode },
      fleet: {
        total: SWARM.length,
        active: SWARM.filter((aircraft) => ['engaged', 'transit', 'orbit'].includes(aircraft.state)).length,
        ready: SWARM.filter((aircraft) => aircraft.state === 'ready').length,
        returning: SWARM.filter((aircraft) => aircraft.state === 'rtb').length,
        unavailable: SWARM.filter((aircraft) => aircraft.state === 'offline').map((aircraft) => aircraft.designation),
        aircraft: SWARM.map(({ designation, state, battery, linkQuality, taskId }) => ({ designation, state, batteryPct: Math.round(battery * 100), linkPct: Math.round(linkQuality * 100), taskId })),
      },
      tracks: TRACKS.map(({ id, affiliation, threatClass, etaSeconds, confidence, sensors, ageSeconds, action }) => ({ id, affiliation, class: threatClass, etaSeconds, confidencePct: confidence, sensors, ageSeconds, currentAction: action })),
      tasks: ops.tasks.map(({ id, trackId, objective, assetIds, status, policy, adapter }) => ({ id, trackId, objective, assetCount: assetIds.length, status, policy, adapter: adapter === 'wedgetail-sandbox' ? 'training-adapter' : 'local' })),
      sensors: SENSOR_SOURCES.map(({ id, state, freshness }) => ({ id, state, freshness })),
      trainingAdapter: { mode: ops.wedgetail.mode, status: ops.wedgetail.status, phase: ops.wedgetail.phase },
    }

    try {
      const response = await fetch('/api/assistant/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, state: trainingState }),
      })
      const body = await response.json() as AssistantReply & { error?: string }
      if (!response.ok) throw new Error(body.error || `Assistant returned HTTP ${response.status}`)
      setMessages((items) => [...items, { role: 'assistant', text: body.summary, reply: body }])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Assistant request failed')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex flex-col gap-4 p-3">
    <div className="rounded-sm border border-signal-caution/40 bg-panel-inset p-2 text-2xs text-signal-caution">TRAINING DATA · RECOMMEND ONLY · NO ACTIONS EXECUTED</div>
    <Section title="Assistant"><div className="flex flex-col gap-1.5">{messages.map((message, index) => <div key={index} className={`rounded-sm border p-2 text-xs leading-relaxed ${message.role === 'assistant' ? 'border-border-faint bg-panel-inset text-text-secondary' : 'border-border-strong bg-state-selected text-text'}`}>
      <span className="mb-1 block text-2xs uppercase text-text-tertiary">{message.role}</span>
      <p>{message.text}</p>
      {message.reply && <div className="mt-2 flex flex-col gap-2">{message.reply.recommendations.map((recommendation, recommendationIndex) => <div key={`${recommendation.title}-${recommendationIndex}`} className="rounded-sm border border-border-faint bg-panel p-2">
        <div className="flex items-start justify-between gap-2"><strong className="text-text">{recommendationIndex + 1}. {recommendation.title}</strong><span className="shrink-0 font-mono text-sm text-signal-nominal">{recommendation.allocationPct}%</span></div>
        <p className="mt-1 text-text">{recommendation.action}</p>
        <p className="mt-1 text-2xs text-text-tertiary">WHY · {recommendation.rationale}</p>
        <ul className="mt-1 list-disc pl-4 text-2xs text-text-secondary">{recommendation.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className="mt-1 text-2xs text-signal-caution">CONSTRAINT · {recommendation.constraint}</p>
      </div>)}</div>}
    </div>)}</div></Section>
    {error && <div role="alert" className="rounded-sm border border-signal-critical/40 bg-panel-inset p-2 text-2xs text-signal-critical">{error}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex gap-1"><input aria-label="Ask assistant" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Request three defensive recommendations…" className="min-w-0 flex-1 rounded-sm border border-border bg-panel-inset px-2 py-1.5 text-xs"/><button disabled={busy || !input.trim()} className="rounded-sm border border-border px-2 text-2xs disabled:text-text-disabled">{busy ? 'ANALYSING…' : 'SEND'}</button></form>
    <button onClick={() => setInput('Assess the current operational state and provide three defensive tasking recommendations with percentage allocations.')} className="rounded-sm border border-border-faint bg-panel-inset p-2 text-left text-2xs text-text-secondary">USE CURRENT STATE · THREE TASKING RECOMMENDATIONS</button>
  </div>
}
