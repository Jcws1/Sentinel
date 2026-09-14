import { useState } from 'react'
import { Section } from '@/components/panel/Section'
import { useOperations } from '@/state/operations'

export function EventsView() {
  const { events } = useOperations()
  const [filter, setFilter] = useState<'all' | 'info' | 'caution' | 'critical'>('all')
  const visible = events.filter((event) => filter === 'all' || event.severity === filter)
  return <div className="flex flex-col gap-4 p-3">
    <Section title="Event ledger"><div className="grid grid-cols-4 gap-1">{(['all', 'info', 'caution', 'critical'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-xs px-1 py-1 text-2xs uppercase ${filter === item ? 'bg-state-selected text-text' : 'bg-panel-inset text-text-tertiary'}`}>{item}</button>)}</div></Section>
    <div className="flex flex-col gap-1.5">{visible.map((event) => <article key={event.id} className="rounded-sm border border-border-faint bg-panel-inset p-2">
      <div className="flex justify-between font-mono text-2xs"><span className={event.severity === 'critical' ? 'text-signal-critical' : event.severity === 'caution' ? 'text-signal-caution' : 'text-signal-nominal'}>{event.source.toUpperCase()}</span><time className="text-text-tertiary">{event.time}</time></div><strong className="mt-1 block text-xs">{event.action}</strong><div className="mt-1 flex justify-between text-2xs text-text-tertiary"><span>{event.entity}</span><span>{event.actor}</span></div>
    </article>)}</div>
    <button type="button" onClick={() => { const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sentinel-local-events.json'; link.click(); URL.revokeObjectURL(url) }} className="rounded-sm border border-border px-2 py-2 text-xs text-text-secondary hover:bg-state-hover">EXPORT LOG</button>
  </div>
}
