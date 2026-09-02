import { viewsInGroup, type ViewDefinition } from '@/app/views'
import { keyLabel } from '@/app/keybindings'
import { useActiveView, selectView } from '@/state/ui'
import { RailButton } from './RailButton'

function RailSeparator() {
  return <div className="my-1.5 h-px w-5 bg-border-faint" role="presentation" />
}

function RailSlot({ view, active }: { view: ViewDefinition; active: boolean }) {
  // The advertised key comes from the keybinding table, never from the view
  // registry — a tooltip promising a shortcut that does not exist is worse
  // than no tooltip at all.
  const shortcut = keyLabel(`view.${view.id}`)

  return (
    <RailButton
      icon={view.icon}
      label={view.label}
      active={active}
      onSelect={() => selectView(view.id)}
      {...(shortcut ? { shortcut } : {})}
    />
  )
}

/**
 * Fixed icon rail, pinned left below the top bar.
 *
 * Groups are separated by a hairline rather than a gap alone: with only six
 * slots, whitespace is too weak a signal to read as grouping at this density.
 */
export function IconRail() {
  const activeView = useActiveView()

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-(--rail-width) shrink-0 flex-col items-center gap-0.5 border-r border-border bg-rail py-2 backdrop-blur-(--panel-blur)"
      style={{ zIndex: 'var(--z-rail)' }}
    >
      {viewsInGroup('primary').map((view) => (
        <RailSlot key={view.id} view={view} active={activeView === view.id} />
      ))}

      <RailSeparator />

      {viewsInGroup('mission').map((view) => (
        <RailSlot key={view.id} view={view} active={activeView === view.id} />
      ))}

      {/* System group pinned to the bottom of the rail. */}
      <div className="mt-auto flex w-full flex-col items-center gap-0.5">
        {viewsInGroup('system').map((view) => (
          <RailSlot key={view.id} view={view} active={activeView === view.id} />
        ))}
      </div>
    </nav>
  )
}
