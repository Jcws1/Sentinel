import { Waypoints } from 'lucide-react'

import { keyLabel } from '@/app/keybindings'
import { Icon } from '@/components/primitives/Icon'
import { Tooltip } from '@/components/primitives/Tooltip'
import { SWARM } from '@/data/swarm'
import { setSwarmPanelOpen } from '@/state/swarm'

/**
 * What the dock collapses to.
 *
 * The left rail routes the left panel and this surface is not one of its
 * slots, so closing the dock has to leave something behind to click. A tab on
 * the edge it vanished from is the cheapest possible reminder of where it
 * went, and carrying the count means dismissing the panel does not also
 * dismiss the one number worth keeping on screen.
 *
 * The advertised key is read from the keybinding table rather than written
 * here — a tooltip promising a shortcut that does not exist is worse than no
 * tooltip at all.
 */
export function SwarmHandle() {
  const shortcut = keyLabel('swarm.toggle')

  return (
    <Tooltip
      label="Swarm"
      side="left"
      {...(shortcut ? { shortcut } : {})}
      hint={`${SWARM.length} aircraft under control`}
    >
      <button
        type="button"
        onClick={() => setSwarmPanelOpen(true)}
        aria-label="Open Swarm"
        className="panel-surface pointer-events-auto flex w-(--swarm-handle-width) shrink-0 cursor-pointer flex-col items-center gap-1 py-2 text-text-secondary transition-colors duration-(--duration-fast) ease-out hover:text-text"
      >
        <Icon icon={Waypoints} size="sm" />
        <span className="font-mono text-2xs tabular text-text-tertiary">
          {SWARM.length}
        </span>
      </button>
    </Tooltip>
  )
}
