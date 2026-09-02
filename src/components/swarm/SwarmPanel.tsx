import { ChevronLeft } from 'lucide-react'

import { Panel } from '@/components/panel/Panel'
import { Icon } from '@/components/primitives/Icon'
import { getDrone } from '@/data/swarm'
import {
  useSwarmSelectedId,
  clearSwarmSelection,
  setSwarmPanelOpen,
} from '@/state/swarm'
import { DroneDetail } from './DroneDetail'
import { SwarmGrid } from './SwarmGrid'

function BackButton() {
  return (
    <button
      type="button"
      onClick={() => clearSwarmSelection()}
      aria-label="Back to swarm"
      className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-xs text-text-tertiary transition-colors duration-(--duration-fast) hover:bg-state-hover hover:text-text"
    >
      <Icon icon={ChevronLeft} size="sm" />
    </button>
  )
}

/**
 * The right dock.
 *
 * One panel with two bodies rather than two stacked surfaces: at 320px a
 * second floating panel on the same edge crowds the column, and the grid is
 * of no use while reading a detail readout anyway.
 *
 * A selected id naming an aircraft the fixture no longer has falls back to
 * the grid. Aircraft coming and going while their panel is open is routine,
 * not an error state worth rendering.
 */
export function SwarmPanel() {
  const selectedId = useSwarmSelectedId()
  const drone = selectedId ? getDrone(selectedId) : undefined

  if (!drone) {
    return (
      <Panel title="Swarm" onClose={() => setSwarmPanelOpen(false)}>
        <div className="p-3">
          <SwarmGrid />
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title={drone.callsign}
      leading={<BackButton />}
      onClose={() => setSwarmPanelOpen(false)}
      closeLabel="Close Swarm"
    >
      <DroneDetail drone={drone} />
    </Panel>
  )
}
