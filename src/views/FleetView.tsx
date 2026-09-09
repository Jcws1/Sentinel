import { Section } from '@/components/panel/Section'
import { SWARM } from '@/data/swarm'
import { STATE_CODE } from '@/types/swarm'
import { setMissionState, useOperations } from '@/state/operations'
import { selectDrone, setSwarmPanelOpen } from '@/state/swarm'

export function FleetView() {
  const ops = useOperations()
  return <div className="flex flex-col gap-4 p-3">
    <Section title="Fleet readiness"><div className="grid grid-cols-4 gap-1 text-center">{[
      ['RDY', SWARM.filter((d) => d.state === 'ready').length], ['ACT', SWARM.filter((d) => ['engaged', 'transit', 'orbit'].includes(d.state)).length], ['RTB', SWARM.filter((d) => d.state === 'rtb').length], ['OFF', SWARM.filter((d) => d.state === 'offline').length],
    ].map(([label, value]) => <div key={label} className="rounded-sm bg-panel-inset p-1.5"><strong className="block font-mono text-base">{value}</strong><span className="text-2xs text-text-tertiary">{label}</span></div>)}</div></Section>
    <Section title="Aircraft"><div className="flex flex-col gap-1">{SWARM.map((drone) => <button key={drone.id} type="button" onClick={() => { selectDrone(drone.id); setSwarmPanelOpen(true) }} className="grid grid-cols-[1fr_auto] gap-1 rounded-sm border border-border-faint bg-panel-inset p-2 text-left hover:bg-state-hover">
      <span><strong className="text-xs">{drone.callsign}</strong><small className="block font-mono text-2xs text-text-tertiary">{drone.taskId ?? 'UNASSIGNED'} · {STATE_CODE[drone.state]}</small></span><span className="text-right font-mono text-2xs"><strong className={drone.linkQuality === 0 ? 'text-signal-critical' : drone.battery < .25 ? 'text-signal-caution' : 'text-text-secondary'}>{Math.round(drone.battery * 100)}%</strong><small className="block text-text-tertiary">LINK {Math.round(drone.linkQuality * 100)}</small></span>
    </button>)}</div></Section>
    <Section title="Mission-wide control"><div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => setMissionState(ops.missionState === 'HOLD' ? 'ACTIVE' : 'HOLD')} className="rounded-sm border border-signal-caution/40 px-2 py-2 text-xs text-signal-caution">{ops.missionState === 'HOLD' ? 'RESUME' : 'HOLD ALL'}</button><button type="button" onClick={() => setMissionState('RECALL')} className="rounded-sm border border-signal-critical/40 px-2 py-2 text-xs text-signal-critical">RECALL ALL</button></div></Section>
  </div>
}
