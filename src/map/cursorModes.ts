import {
  MousePointer2,
  Hand,
  SquareDashedMousePointer,
  Ruler,
  PenTool,
  MapPin,
  type LucideIcon,
} from 'lucide-react'

export type CursorModeId =
  | 'select'
  | 'pan'
  | 'boxSelect'
  | 'measure'
  | 'zone'
  | 'waypoint'

/**
 * `navigate` modes read the map; `annotate` modes write to it. The split is
 * not cosmetic — annotate modes will need a confirm/cancel affordance and an
 * undo entry, navigate modes never will.
 */
export type CursorModeGroup = 'navigate' | 'annotate'

export interface CursorMode {
  id: CursorModeId
  label: string
  icon: LucideIcon
  group: CursorModeGroup
  /** CSS cursor applied to the map layer while this mode is active. */
  cursor: string
  /** Shown in the tooltip under the label; states what a drag or click does. */
  hint: string
}

/**
 * Cursor modes are mutually exclusive: exactly one is active, always. There is
 * no "no mode" state — an operator dragging on a live map must never be
 * uncertain what the drag will do.
 *
 * Nothing is wired to the map yet (there is no map yet). What is real today is
 * the mode state and the cursor it puts on the map layer; MapCanvas reads
 * `cursor` and the same store to decide which drag handler to attach.
 */
export const CURSOR_MODES: readonly CursorMode[] = [
  {
    id: 'select',
    label: 'Select',
    icon: MousePointer2,
    group: 'navigate',
    cursor: 'default',
    hint: 'Click a track or interceptor. Shift-click to add.',
  },
  {
    id: 'pan',
    label: 'Pan',
    icon: Hand,
    group: 'navigate',
    cursor: 'grab',
    hint: 'Drag to move the map.',
  },
  {
    id: 'boxSelect',
    label: 'Box select',
    icon: SquareDashedMousePointer,
    group: 'navigate',
    cursor: 'crosshair',
    hint: 'Drag a rectangle to select every entity inside it.',
  },
  {
    id: 'measure',
    label: 'Measure',
    icon: Ruler,
    group: 'annotate',
    cursor: 'crosshair',
    hint: 'Click points for range and bearing. Double-click to end.',
  },
  {
    id: 'zone',
    label: 'Draw zone',
    icon: PenTool,
    group: 'annotate',
    cursor: 'crosshair',
    hint: 'Click to place vertices of a geofence. Double-click to close.',
  },
  {
    id: 'waypoint',
    label: 'Waypoint',
    icon: MapPin,
    group: 'annotate',
    cursor: 'crosshair',
    hint: 'Click to designate a point on the ground.',
  },
]

export const DEFAULT_CURSOR_MODE: CursorModeId = 'select'

const MODE_BY_ID = new Map(CURSOR_MODES.map((m) => [m.id, m]))

export function getCursorMode(id: CursorModeId): CursorMode {
  const mode = MODE_BY_ID.get(id)
  if (!mode) throw new Error(`Unknown cursor mode: ${id}`)
  return mode
}

export function cursorModesInGroup(group: CursorModeGroup): CursorMode[] {
  return CURSOR_MODES.filter((m) => m.group === group)
}
