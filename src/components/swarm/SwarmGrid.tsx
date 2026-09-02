import { SWARM } from '@/data/swarm'
import { useSwarmSelectedId, selectDrone } from '@/state/swarm'
import { DroneTile } from './DroneTile'

/**
 * Counts across the top of the grid.
 *
 * Airborne rather than total, because "twelve aircraft" is not the number an
 * operator is working with — three of these are cold on the pad. The lost
 * link is called out only when there is one; a permanent `0 NO LINK` teaches
 * the eye to skip the line that matters.
 */
function SwarmSummary() {
  const airborne = SWARM.filter(
    (d) => d.state !== 'ready' && d.state !== 'offline',
  ).length
  const ready = SWARM.filter((d) => d.state === 'ready').length
  const noLink = SWARM.filter((d) => d.state === 'offline').length

  return (
    <div className="flex items-center gap-2 font-mono text-2xs tabular text-text-tertiary">
      <span>{airborne} AIRBORNE</span>
      <span className="text-text-disabled">·</span>
      <span>{ready} READY</span>
      {noLink > 0 ? (
        <>
          <span className="text-text-disabled">·</span>
          <span className="text-text-secondary">{noLink} NO LINK</span>
        </>
      ) : null}
    </div>
  )
}

/**
 * The swarm as a grid of squares.
 *
 * Four columns at the 320px panel width gives ~66px tiles: large enough for a
 * designation and a state code at 11px, small enough that thirty of them are
 * one glance rather than a scroll. The grid is the default body of the dock,
 * and clicking a tile drills into it.
 */
export function SwarmGrid() {
  const selectedId = useSwarmSelectedId()

  if (SWARM.length === 0) {
    return (
      <p className="text-2xs leading-snug text-text-tertiary">
        No aircraft under control. Assign a flight to bring it onto this panel.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <SwarmSummary />

      <div className="grid grid-cols-4 gap-(--swarm-tile-gap)">
        {SWARM.map((drone) => (
          <DroneTile
            key={drone.id}
            drone={drone}
            selected={drone.id === selectedId}
            onSelect={() => selectDrone(drone.id)}
          />
        ))}
      </div>
    </div>
  )
}
