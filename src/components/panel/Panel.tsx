import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Icon } from '@/components/primitives/Icon'

interface PanelProps {
  title: string
  /**
   * Rendered before the title, inside the header. The slot a back control
   * occupies when a panel's body has drilled into something.
   */
  leading?: ReactNode
  onClose: () => void
  /** Accessible name for the close button; defaults to `Close {title}`. */
  closeLabel?: string
  children: ReactNode
}

/**
 * The floating panel shell, shared by every dock.
 *
 * Deliberately small: a surface, a header with one optional leading slot, and
 * a scrolling body. No resize, no collapse, no header actions array — there is
 * no caller for any of them yet, and an API invented ahead of its second use
 * is guesswork that later callers have to work around.
 *
 * Scrolling belongs to the body, not the page: html/body/#root are
 * overflow:hidden, so a panel that forgets `min-h-0` on its scroll container
 * silently grows past the viewport instead of scrolling.
 */
export function Panel({
  title,
  leading,
  onClose,
  closeLabel,
  children,
}: PanelProps) {
  return (
    <section className="panel-surface pointer-events-auto flex max-h-full w-(--panel-default-width) flex-col overflow-hidden">
      <header className="flex h-(--panel-header-height) shrink-0 items-center gap-1.5 border-b border-border-faint pr-1 pl-3">
        {leading}

        <h2 className="min-w-0 flex-1 truncate text-xs font-medium tracking-wide text-text">
          {title}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel ?? `Close ${title}`}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-xs text-text-tertiary transition-colors duration-(--duration-fast) hover:bg-state-hover hover:text-text"
        >
          <Icon icon={X} size="sm" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}
