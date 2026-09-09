import { useState } from 'react'
import { Section } from '@/components/panel/Section'

export function SettingsView() {
  const [units, setUnits] = useState('Metric')
  const [coords, setCoords] = useState('Decimal degrees')
  const [density, setDensity] = useState('Compact')
  const [motion, setMotion] = useState(true)
  const selectClass = 'rounded-sm border border-border bg-panel-inset px-2 py-1.5 text-xs text-text'
  return <div className="flex flex-col gap-4 p-3">
    <p className="text-xs leading-relaxed text-text-secondary">Console-only preferences. Nothing here changes mission or vehicle state.</p>
    <Section title="Display"><label className="flex flex-col gap-1 text-2xs text-text-tertiary">Density<select className={selectClass} value={density} onChange={(e) => setDensity(e.target.value)}><option>Compact</option><option>Comfortable</option></select></label><label className="mt-2 flex items-center justify-between text-xs">Reduce motion<input type="checkbox" checked={motion} onChange={(e) => setMotion(e.target.checked)} /></label></Section>
    <Section title="Units and references"><label className="flex flex-col gap-1 text-2xs text-text-tertiary">Units<select className={selectClass} value={units} onChange={(e) => setUnits(e.target.value)}><option>Metric</option><option>Nautical</option></select></label><label className="mt-2 flex flex-col gap-1 text-2xs text-text-tertiary">Coordinates<select className={selectClass} value={coords} onChange={(e) => setCoords(e.target.value)}><option>Decimal degrees</option><option>DMS</option><option>MGRS</option></select></label></Section>
    <Section title="Node"><div className="rounded-sm border border-border-faint bg-panel-inset p-2 font-mono text-2xs text-text-secondary"><div>NODE EDGE-SGT-01</div><div className="mt-1">C2 LOCAL / CONNECTED</div><div className="mt-1">TIME SGT (UTC+08)</div></div></Section>
  </div>
}
