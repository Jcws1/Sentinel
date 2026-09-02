import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export const TooltipProvider = RadixTooltip.Provider

interface TooltipProps {
  /** The element that opens the tooltip. Must forward ref and props. */
  children: ReactNode
  label: ReactNode
  /** Optional right-aligned key hint, e.g. a keyboard shortcut. */
  shortcut?: string
  /**
   * Optional second line explaining what the control does. Reserved for
   * controls whose behaviour is not obvious from the label — a cursor mode
   * changes what a drag means, which a one-word label cannot convey.
   */
  hint?: string
  side?: RadixTooltip.TooltipContentProps['side']
  sideOffset?: number
}

/**
 * The app's only tooltip. Styled once here so every call site inherits the
 * same surface, delay and offset — a console where tooltips differ slightly
 * between panels reads as unfinished.
 *
 * No arrow: at 11px on a hairline surface an arrow adds more visual noise
 * than orientation.
 */
export function Tooltip({
  children,
  label,
  shortcut,
  hint,
  side = 'right',
  sideOffset = 8,
}: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={sideOffset}
          className={cn(
            'z-(--z-popover) flex flex-col gap-0.5',
            'rounded-xs border border-border bg-surface-3 px-2 py-1',
            'text-xs text-text shadow-popover',
            'select-none',
            // Capped so a hint wraps to two or three short lines rather than
            // stretching into a strip wider than the panel it covers.
            hint ? 'max-w-52' : '',
            // Fade keyed off Radix's data-state; see .tooltip-content in
            // global.css. Short enough to feel instant, but it softens a
            // rapid pointer sweep down the rail.
            'tooltip-content',
          )}
        >
          <div className="flex items-center gap-2">
            <span>{label}</span>
            {shortcut ? (
              <span className="ml-auto font-mono text-2xs tabular text-text-tertiary">
                {shortcut}
              </span>
            ) : null}
          </div>

          {hint ? (
            <p className="text-2xs leading-snug text-text-tertiary">{hint}</p>
          ) : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
