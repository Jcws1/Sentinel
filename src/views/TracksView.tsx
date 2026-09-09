import { useMemo, useState } from 'react'
import { TRACKS } from '@/data/operations'
import { Section } from '@/components/panel/Section'
import { StatusRow } from '@/components/panel/StatusRow'

export function TracksView() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(TRACKS[0].id)
  const tracks = useMemo(() => TRACKS.filter((track) => `${track.id} ${track.affiliation} ${track.action}`.toLowerCase().includes(query.toLowerCase())), [query])
  const active = TRACKS.find((track) => track.id === selected) ?? TRACKS[0]
  return <div className="flex flex-col gap-4 p-3">
    <input aria-label="Filter tracks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tracks…" className="rounded-sm border border-border bg-panel-inset px-2 py-1.5 text-xs text-text placeholder:text-text-disabled" />
    <Section title={`Air picture · ${tracks.length}`}><div className="flex flex-col gap-1">{tracks.map((track) => <button key={track.id} type="button" onClick={() => setSelected(track.id)} className={`rounded-sm border p-2 text-left ${selected === track.id ? 'border-border-strong bg-state-selected' : 'border-border-faint bg-panel-inset hover:bg-state-hover'}`}>
      <span className="flex items-center justify-between"><strong className="font-mono text-xs">{track.id}</strong><span className={track.affiliation === 'hostile' ? 'text-2xs text-signal-hostile' : 'text-2xs text-signal-caution'}>{track.affiliation.toUpperCase()} · C{track.threatClass}</span></span>
      <span className="mt-1 flex justify-between text-2xs text-text-tertiary"><span>{track.action}</span><span>{track.confidence}% · {track.ageSeconds}s old</span></span>
    </button>)}</div></Section>
    <Section title="Selected track"><div className="flex flex-col gap-1 rounded-sm border border-border-faint bg-panel-inset p-2">
      <StatusRow label="Classification" value={`${active.affiliation.toUpperCase()} / CLASS ${active.threatClass}`} /><StatusRow label="Kinematics" value={`${active.speedKmh} km/h · ${active.altitudeM} m`} /><StatusRow label="Bearing / ETA" value={`${active.bearingDeg}°T · ${active.etaSeconds}s`} /><StatusRow label="Fusion" value={`${active.confidence}%`} /><StatusRow label="Sources" value={active.sensors.join(' / ')} /><StatusRow label="Predicted action" value={active.action.toUpperCase()} />
    </div></Section>
  </div>
}
