import { selectView, setPanelVisible } from '@/state/ui'
import { setCursorMode, resetCursorMode } from '@/state/cursorMode'
import { recenterCamera } from '@/map/cameraControl'
import { cancelDraft, undoVertex } from '@/state/annotations'
import { cancelVertexDrag } from '@/map/annotations/editController'
import { toggleSwarmPanel, clearSwarmSelection } from '@/state/swarm'
import type { ViewId } from './views'
import type { CursorModeId } from '@/map/cursorModes'

/* ===========================================================================
   KEYBINDINGS — every global key in the console, in one table.

   This file is the single source of truth. The handler matches against it and
   the tooltips render their hint from it, so a binding and the label
   advertising it cannot drift apart. To change a key, edit one row.

   CONVENTIONS
   - `code` is the physical key (layout-independent). Use it for digits and
     punctuation: Alt+digit produces a dead key or an accented character on
     several European layouts, but `Digit1` is stable everywhere.
   - `key` is the logical key (what is printed on the cap). Use it for the
     cursor-mode letters, where the operator is reaching for the letter they
     see, and for named keys like Escape.
   - Modifiers default to false. A binding only fires on an exact modifier
     match, so `V` does not fire on Ctrl+V.
   - Bindings never fire while focus is in a text field; see isTypingTarget in
     useGlobalShortcuts.

   WHY THESE CHOICES
   Rail slots take Alt+digit. Bare digits would be unusable the moment any
   panel gains a numeric input, and a shortcut that silently dies when focus
   moves is worse than no shortcut.

   Cursor modes take bare letters, matching every map and design tool an
   operator has used (Figma, QGIS, ArcGIS). They are safe here for the same
   reason: the typing guard.
=========================================================================== */

export type CommandId =
  | `view.${ViewId}`
  | `cursor.${CursorModeId}`
  | 'swarm.toggle'
  | 'camera.recenter'
  | 'annotation.undoVertex'
  | 'ui.dismiss'

export interface Keybinding {
  command: CommandId
  /** Rendered in tooltips. Keep it as the operator would say it aloud. */
  label: string
  /** What the key does, for this file's readers. */
  description: string
  /** Physical key, e.g. 'Digit1'. Prefer for digits and punctuation. */
  code?: string
  /** Logical key, e.g. 'v' or 'Escape'. Prefer for letters and named keys. */
  key?: string
  alt?: boolean
  shift?: boolean
  /** Ctrl on Windows/Linux, Cmd on macOS — matched together. */
  ctrl?: boolean
  run: () => void
}

export const KEYBINDINGS: readonly Keybinding[] = [
  // ── Rail slots ────────────────────────────────────── Alt + digit ──
  {
    command: 'view.home',
    label: 'Alt 1',
    description: 'Open the Overview panel',
    code: 'Digit1',
    alt: true,
    run: () => selectView('home'),
  },
  {
    command: 'view.map',
    label: 'Alt 2',
    description: 'Open the Map panel',
    code: 'Digit2',
    alt: true,
    run: () => selectView('map'),
  },
  {
    command: 'view.tracks',
    label: 'Alt 3',
    description: 'Open the Tracks panel',
    code: 'Digit3',
    alt: true,
    run: () => selectView('tracks'),
  },
  {
    command: 'view.fleet',
    label: 'Alt 4',
    description: 'Open the Fleet panel',
    code: 'Digit4',
    alt: true,
    run: () => selectView('fleet'),
  },
  {
    command: 'view.policy',
    label: 'Alt 5',
    description: 'Open the Policy panel',
    code: 'Digit5',
    alt: true,
    run: () => selectView('policy'),
  },
  {
    command: 'view.events',
    label: 'Alt 6',
    description: 'Open the Events panel',
    code: 'Digit6',
    alt: true,
    run: () => selectView('events'),
  },

  // ── Right dock ────────────────────────────────────── Alt + letter ──
  {
    command: 'swarm.toggle',
    label: 'Alt S',
    description:
      'Show or hide the swarm dock. Alt rather than a bare S because bare ' +
      'letters are the cursor-mode namespace, and Alt+digit is taken by the ' +
      'rail slots.',
    // Matched on the physical key, against this file's own preference for
    // `key` on letters: Option+S on macOS delivers event.key === "ß", which
    // the case-insensitive comparison below would never match. The physical
    // key is the same cap on every layout.
    code: 'KeyS',
    alt: true,
    run: () => toggleSwarmPanel(),
  },

  // ── Cursor modes ───────────────────────────────────── bare letter ──
  {
    command: 'cursor.select',
    label: 'V',
    description: 'Select mode — click a track or interceptor',
    key: 'v',
    run: () => setCursorMode('select'),
  },
  {
    command: 'cursor.pan',
    label: 'H',
    description: 'Pan mode — drag to move the map',
    key: 'h',
    run: () => setCursorMode('pan'),
  },
  {
    command: 'cursor.boxSelect',
    label: 'B',
    description: 'Box select — drag a rectangle to select many',
    key: 'b',
    run: () => setCursorMode('boxSelect'),
  },
  {
    command: 'cursor.measure',
    label: 'M',
    description: 'Measure range and bearing',
    key: 'm',
    run: () => setCursorMode('measure'),
  },
  {
    command: 'cursor.zone',
    label: 'G',
    description: 'Draw a geofence zone',
    key: 'g',
    run: () => setCursorMode('zone'),
  },
  {
    command: 'cursor.waypoint',
    label: 'P',
    description: 'Place a waypoint',
    key: 'p',
    run: () => setCursorMode('waypoint'),
  },

  // ── Camera ──────────────────────────────────────────────────────────
  {
    command: 'camera.recenter',
    label: 'R',
    description: 'Return the camera to its default position and heading',
    key: 'r',
    run: () => recenterCamera(),
  },

  // ── Annotation ──────────────────────────────────────────────────────
  {
    command: 'annotation.undoVertex',
    label: 'Backspace',
    description:
      'Remove the last placed vertex while drawing. A misplaced click mid-zone ' +
      'should not force starting the whole shape again.',
    key: 'Backspace',
    run: () => undoVertex(),
  },

  // ── Global ──────────────────────────────────────────────────────────
  {
    command: 'ui.dismiss',
    label: 'Esc',
    description:
      'Step back one level: put back a vertex being dragged, else abandon a ' +
      'half-drawn shape, else drop the active tool to Select, else close an ' +
      'open drone detail, and only close the panel once none of those ' +
      'applied. Escape mid-draw must not also discard the panel the ' +
      'operator was reading.',
    key: 'Escape',
    run: () => {
      // Most local first. Abandoning a half-drawn zone must not also reset the
      // tool and close the panel — one press, one step back.
      //
      // A vertex drag outranks a draft: it is the most recently started
      // gesture, and Escape here is a true revert — the point goes back where
      // it was picked up, not wherever the pointer happens to be.
      if (cancelVertexDrag()) return
      if (cancelDraft()) return
      if (resetCursorMode()) return
      // Detail -> grid is a step back, so it belongs in the chain. Escape
      // does not go on to close the swarm dock itself: the step below
      // already closes the left panel, and one key dismissing whichever of
      // two surfaces happens to be open is exactly the ambiguity this chain
      // exists to avoid. The dock closes by its header button, or Alt+S.
      if (clearSwarmSelection()) return
      setPanelVisible(false)
    },
  },
]

const BY_COMMAND = new Map(KEYBINDINGS.map((k) => [k.command, k]))

/** The label a tooltip should show for a command, if it has a binding. */
export function keyLabel(command: CommandId): string | undefined {
  return BY_COMMAND.get(command)?.label
}

/**
 * First binding matching this event, or undefined.
 *
 * Modifiers must match exactly in both directions — a binding with no `alt`
 * will not fire while Alt is held, so Alt+V stays free for a future command
 * rather than silently triggering Select.
 */
export function matchKeybinding(event: KeyboardEvent): Keybinding | undefined {
  return KEYBINDINGS.find((binding) => {
    if (Boolean(binding.alt) !== event.altKey) return false
    if (Boolean(binding.shift) !== event.shiftKey) return false
    if (Boolean(binding.ctrl) !== (event.ctrlKey || event.metaKey)) return false
    if (binding.code) return binding.code === event.code
    if (binding.key) return binding.key.toLowerCase() === event.key.toLowerCase()
    return false
  })
}
