import type { LucideIcon } from 'lucide-react'

import { Icon } from '@/components/primitives/Icon'
import { Tooltip } from '@/components/primitives/Tooltip'
import { cn } from '@/lib/cn'

interface RailButtonProps {
  icon: LucideIcon
  label: string
  active: boolean
  onSelect: () => void
  shortcut?: string
}

export function RailButton({
  icon,
  label,
  active,
  onSelect,
  shortcut,
}: RailButtonProps) {
  return (
    <Tooltip label={label} {...(shortcut ? { shortcut } : {})}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // The wrapper spans the full rail width so the active indicator can
          // sit flush to the viewport edge, as in an activity bar, while the
          // hit target stays a 32px square.
          'relative grid w-full place-items-center py-0.5',
          'group cursor-pointer',
        )}
      >
        {/* Active indicator: a 2px bar on the rail's outer edge. Reads as
            position rather than decoration, which is why it is not a colour. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 left-0 h-4 w-(--rail-indicator-width) -translate-y-1/2 rounded-r-xs',
            'transition-opacity duration-(--duration-fast) ease-out',
            active ? 'bg-white opacity-90' : 'opacity-0',
          )}
        />

        <span
          className={cn(
            'grid size-(--rail-item-size) place-items-center rounded-sm',
            'transition-colors duration-(--duration-fast) ease-out',
            // Inactive sits on the secondary ramp, not tertiary: at 1.5px
            // stroke a 40% white icon reads as soft rather than quiet, and
            // low contrast is indistinguishable from being out of focus.
            active
              ? 'bg-state-selected text-text'
              : 'text-text-secondary group-hover:bg-state-hover group-hover:text-text',
          )}
        >
          <Icon icon={icon} size="md" />
        </span>
      </button>
    </Tooltip>
  )
}
