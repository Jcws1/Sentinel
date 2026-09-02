import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { LocateFixed } from 'lucide-react'

import { Icon } from '@/components/primitives/Icon'
import { Tooltip } from '@/components/primitives/Tooltip'
import { keyLabel } from '@/app/keybindings'
import { cn } from '@/lib/cn'
import {
  cursorModesInGroup,
  type CursorMode,
  type CursorModeId,
} from '@/map/cursorModes'
import { useCursorMode, setCursorMode } from '@/state/cursorMode'
import { recenterCamera } from '@/map/cameraControl'

function ModeButton({ mode, active }: { mode: CursorMode; active: boolean }) {
  const shortcut = keyLabel(`cursor.${mode.id}`)

  return (
    <Tooltip
      label={mode.label}
      {...(shortcut ? { shortcut } : {})}
      hint={mode.hint}
      side="top"
    >
      <ToggleGroup.Item
        value={mode.id}
        aria-label={mode.label}
        className={cn(
          'grid size-(--rail-item-size) cursor-pointer place-items-center rounded-sm',
          'transition-colors duration-(--duration-fast) ease-out',
          active
            ? 'bg-state-selected text-text'
            // Matches the rail: secondary rather than tertiary, because a
            // 40% white 1.5px stroke reads as blurred rather than quiet.
            : 'text-text-secondary hover:bg-state-hover hover:text-text',
        )}
      >
        <Icon icon={mode.icon} size="md" />
      </ToggleGroup.Item>
    </Tooltip>
  )
}

/**
 * Camera actions sit OUTSIDE the toggle group.
 *
 * Recentre is an action, not a mode: it does something once and nothing stays
 * selected afterwards. Putting it inside the radiogroup would make it a
 * seventh cursor mode to a screen reader, and give it a selected state it can
 * never truthfully hold.
 */
function RecenterButton() {
  const shortcut = keyLabel('camera.recenter')

  return (
    <Tooltip
      label="Recentre view"
      {...(shortcut ? { shortcut } : {})}
      hint="Return the camera to its default position, heading and pitch."
      side="top"
    >
      <button
        type="button"
        onClick={recenterCamera}
        aria-label="Recentre view"
        className={cn(
          'grid size-(--rail-item-size) cursor-pointer place-items-center rounded-sm',
          'transition-colors duration-(--duration-fast) ease-out',
          'text-text-secondary hover:bg-state-hover hover:text-text',
        )}
      >
        <Icon icon={LocateFixed} size="md" />
      </button>
    </Tooltip>
  )
}

/**
 * Cursor-mode palette, pinned bottom-left over the map.
 *
 * Sized to its contents rather than the viewport width — it is a tool
 * palette, not a status bar, and a full-width strip would claim screen the
 * map needs while implying it holds more than six buttons.
 *
 * Radix ToggleGroup gives this radio-group semantics and roving tabindex, so
 * arrow keys walk the palette and only one item is ever in the tab order.
 * `type="single"` alone would allow deselecting to an empty value; the guard
 * in onValueChange refuses that, because "no cursor mode" is not a state an
 * operator can be in.
 */
function CursorModePalette() {
  const activeMode = useCursorMode()

  const navigate = cursorModesInGroup('navigate')
  const annotate = cursorModesInGroup('annotate')

  return (
    <ToggleGroup.Root
      type="single"
      value={activeMode}
      onValueChange={(value) => {
        if (!value) return
        setCursorMode(value as CursorModeId)
      }}
      aria-label="Cursor mode"
      className="inline-flex items-center gap-0.5"
    >
      {navigate.map((mode) => (
        <ModeButton
          key={mode.id}
          mode={mode}
          active={activeMode === mode.id}
        />
      ))}

      {/* Reading the map vs writing to it. */}
      <div className="mx-1 h-5 w-px bg-border-faint" role="presentation" />

      {annotate.map((mode) => (
        <ModeButton
          key={mode.id}
          mode={mode}
          active={activeMode === mode.id}
        />
      ))}
    </ToggleGroup.Root>
  )
}

/**
 * The bottom-left palette: cursor modes, then camera actions.
 *
 * Two controls of different kinds, separated by a rule — what a drag means,
 * and what the camera does — so neither reads as an extra option of the other.
 */
export function ModeBar() {
  return (
    <div
      className="panel-surface pointer-events-auto inline-flex w-fit items-center gap-0.5 p-1"
      style={{ zIndex: 'var(--z-modebar)' }}
    >
      <CursorModePalette />
      <div className="mx-1 h-5 w-px bg-border-faint" role="presentation" />
      <RecenterButton />
    </div>
  )
}
