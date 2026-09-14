import { useState } from 'react'
import { SCENARIOS } from '@/data/operations'
import { Section } from '@/components/panel/Section'
import { addEvent, selectTask } from '@/state/operations'

export function ScenariosView() {
  const [active, setActive] = useState('SCN-03')
  const [speed, setSpeed] = useState(10)
  const activate = (scenario: typeof SCENARIOS[number]) => {
    setActive(scenario.id)
    if (scenario.id === 'SCN-COAST') {
      selectTask('TASK-WGT-SPLIT')
      addEvent('Coastal split training run staged at the track-separation window', scenario.id, 'info', 'Thales training feed')
    }
  }
  return <div className="flex flex-col gap-4 p-3"><Section title="Training scenarios"><p className="text-xs leading-relaxed text-text-secondary">Recorded inputs and local training outcomes.</p></Section><div className="flex flex-col gap-1.5">{SCENARIOS.map((scenario) => <article key={scenario.id} className={`rounded-sm border p-2 ${active === scenario.id ? 'border-signal-caution/40 bg-state-selected' : 'border-border-faint bg-panel-inset'}`}><div className="flex justify-between"><strong className="text-xs">{scenario.name}</strong>{active === scenario.id && <span className="text-2xs text-signal-caution">STAGED</span>}</div><p className="mt-1 text-2xs text-text-secondary">{scenario.context}</p><div className="mt-2 font-mono text-2xs text-text-tertiary">{scenario.forces} · {scenario.duration}</div><button onClick={() => activate(scenario)} className="mt-2 w-full rounded-xs border border-border px-2 py-1 text-2xs">{active === scenario.id ? 'RESTAGE' : 'STAGE'}</button></article>)}</div><Section title="Timeline"><div className="flex items-center gap-2"><input aria-label="Scenario speed" type="range" min="1" max="10" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1"/><output className="font-mono text-xs">{speed}×</output></div><p className="mt-1 text-2xs text-text-tertiary">The coastal cut begins near source time 1600 s so both branch separations are visible.</p></Section></div>
}
