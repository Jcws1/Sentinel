import { Section } from '@/components/panel/Section'
import { StatusRow } from '@/components/panel/StatusRow'
import { SWARM } from '@/data/swarm'
import { TRACKS } from '@/data/operations'
import { useOperations } from '@/state/operations'

const signal = { nominal: 'text-signal-nominal', caution: 'text-signal-caution', critical: 'text-signal-critical' }

export function HomeView() {
  const ops = useOperations()
  const ready = SWARM.filter((drone) => drone.state === 'ready').length
  const active = SWARM.filter((drone) => ['engaged', 'transit', 'orbit'].includes(drone.state)).length
  const pending = ops.tasks.filter((task) => task.status === 'review').length
  const exceptions = ops.tasks.filter((task) => task.policy !== 'within').length

  return <div className="flex flex-col gap-4 p-3">
    <Section title="Mission posture"><div className="grid grid-cols-2 gap-1.5">
      {[['Threats', TRACKS.filter((t) => t.affiliation === 'hostile').length, 'critical'], ['Awaiting review', pending, 'caution'], ['Airborne', active, 'nominal'], ['Ready reserve', ready, 'nominal']].map(([label, value, tone]) =>
        <div key={label} className="rounded-sm border border-border-faint bg-panel-inset p-2"><div className="text-2xs text-text-tertiary">{label}</div><strong className={`font-mono text-lg tabular ${signal[tone as keyof typeof signal]}`}>{value}</strong></div>)}
    </div></Section>
    <Section title="Command state"><div className="flex flex-col gap-1.5 rounded-sm border border-border-faint bg-panel-inset p-2">
      <StatusRow label="Mission" value={ops.missionState} /><StatusRow label="Mode" value={ops.mode.toUpperCase()} /><StatusRow label="C2 link" value={ops.connected ? 'ONLINE' : 'OFFLINE'} /><StatusRow label="Positioning" value={`GNSS ${ops.gnss}`} /><StatusRow label="Autonomy" value={ops.autoMode} /><StatusRow label="Policy" value="OPERATIONAL v12" />
    </div></Section>
    <Section title="Attention"><div className="flex flex-col gap-1.5">
      <div className="rounded-sm border border-signal-caution/30 bg-panel-inset p-2 text-xs"><strong className="text-signal-caution">{exceptions} policy exception</strong><p className="mt-1 text-text-tertiary">TASK-124 requires link recovery or supervisor review.</p></div>
      <div className="rounded-sm border border-border-faint bg-panel-inset p-2 text-xs"><strong>Decision evidence current</strong><p className="mt-1 text-text-tertiary">Two task groups can be approved within delegated authority.</p></div>
    </div></Section>
  </div>
}
