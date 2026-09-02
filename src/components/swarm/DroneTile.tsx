import { Tooltip } from '@/components/primitives/Tooltip'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/format'
import { STATE_CODE, type Drone } from '@/types/swarm'

/**
 * Battery as a hairline meter across the tile's foot.
 *
 * A meter rather than a number because twelve tiles are read at a glance and
 * a bar is comparable without being parsed. It is white at a stepped opacity,
 * not a colour ramp: the signal palette means something is true about the
 * mission, and a battery at 40% is not yet an event.
 *
 * The track underneath is always drawn, so an empty cell reads as "measured
 * and low" rather than "not reporting".
 */
function BatteryMeter({ level, dimmed }: { level: number; dimmed: boolean }) {
  const clamped = Math.max(0, Math.min(1, level))

  return (
    <div className="absolute inset-x-0 bottom-0 h-px bg-white/10">
      <div
        className={cn(
          'h-full transition-[width] duration-(--duration-normal) ease-out',
          dimmed ? 'bg-white/20' : clamped <= 0.25 ? 'bg-white/85' : 'bg-white/45',
        )}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  )
}

interface DroneTileProps {
  drone: Drone
  selected: boolean
  onSelect: () => void
}

/**
 * One square in the swarm grid: designation, state code, battery.
 *
 * State reads through weight and treatment rather than hue, the same way the
 * rail's active indicator does. A lost link is the one case that changes the
 * tile's outline — a dashed border says "this is not reporting" without
 * spending colour that is reserved for the mission.
 */
export function DroneTile({ drone, selected, onSelect }: DroneTileProps) {
  const offline = drone.state === 'offline'

  return (
    <Tooltip
      label={drone.callsign}
      side="left"
      hint={`${STATE_CODE[drone.state]} · ${formatPercent(drone.battery)} battery`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${drone.callsign}, ${STATE_CODE[drone.state]}`}
        className={cn(
          'relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-0.5',
          'overflow-hidden rounded-sm border',
          'transition-colors duration-(--duration-fast) ease-out',
          selected
            ? 'border-border-strong bg-state-selected text-text'
            : offline
              ? 'border-dashed border-border-faint text-text-disabled hover:bg-state-hover'
              : 'border-border-faint text-text-secondary hover:bg-state-hover hover:text-text',
        )}
      >
        <span className="font-mono text-xs tabular">{drone.designation}</span>
        <span
          className={cn(
            'font-mono text-2xs tabular',
            selected ? 'text-text-secondary' : 'text-text-tertiary',
            offline && 'text-text-disabled',
          )}
        >
          {STATE_CODE[drone.state]}
        </span>

        <BatteryMeter level={drone.battery} dimmed={offline} />
      </button>
    </Tooltip>
  )
}
