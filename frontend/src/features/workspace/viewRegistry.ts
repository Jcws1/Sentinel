import {
  Box,
  ChartNoAxesCombined,
  Clock3,
  Crosshair,
  Map,
  ScanSearch,
  Info,
  Settings2,
  Camera,
  ListChecks,
} from 'lucide-react';

// View kinds describe capabilities, never domain objects or individual pane instances.
export const viewRegistry = {
  suggestions: {
    unavailable: '',
    title: 'Suggestions',
    category: 'Rules-based simulation choices',
    icon: ListChecks,
    description: 'Review existing Fleet actions before explicit Apply.',
    future: '',
  },
  cockpit: {
    unavailable: '',
    title: 'Video Feed',
    category: 'Simulated viewpoint',
    icon: Camera,
    description: 'One pinned simulated drone viewpoint. No video feed.',
    future: '',
  },
  settings: {
    unavailable: '',
    title: 'Settings',
    category: 'Workspace preferences',
    icon: Settings2,
    description: 'Entity symbols, destinations and movement overlays.',
    future: '',
  },
  conductor: {
    unavailable: '',
    title: 'Conductor',
    category: 'Scenario authoring',
    icon: Clock3,
    description: 'Author and inspect timed source motion.',
    future: '',
  },
  units: {
    unavailable: '',
    title: 'Units',
    category: 'Scenario authoring',
    icon: Box,
    description: 'Compose and save a local simulation arrangement.',
    future: '',
  },
  details: {
    unavailable: '',
    title: 'Details',
    category: 'Primary selection',
    icon: Info,
    description: 'Follow the primary selected entity.',
    future: '',
  },
  movement: {
    unavailable: '',
    title: 'Activity',
    category: 'Demo commands',
    icon: Crosshair,
    description: 'Inspect command outcomes and committed movement.',
    future: '',
  },
  tracks: {
    unavailable: 'Entity browsing is not implemented.',
    title: 'Tracks',
    category: 'Entity browser',
    icon: ScanSearch,
    description: 'Browse entities and their displayed observations.',
    future: '',
  },
  credits: {
    unavailable: '',
    title: 'Credits',
    category: 'Settings',
    icon: Info,
    description: 'Map sources and licences.',
    future: '',
  },
  tactical: {
    unavailable: 'Tactical rendering is not implemented.',
    title: 'Tactical Map',
    category: 'Situational awareness',
    icon: Map,
    description: 'The shared operational picture in a geographic view.',
    future:
      'Tracks, zones and mission overlays will appear here when a mission is connected.',
  },
  'three-d': {
    unavailable: '3D rendering is not implemented.',
    title: '3D View',
    category: 'Spatial context',
    icon: Box,
    description: 'Explore the operational picture in three dimensions.',
    future:
      'Terrain, altitude and spatial relationships will be available in a later phase.',
  },
  command: {
    unavailable: 'Mission analytics are not implemented.',
    title: 'Command Picture',
    category: 'Mission overview',
    icon: Crosshair,
    description: 'A concise view of mission priorities and overall situation.',
    future:
      'Mission summaries and key developments will appear here when operational data is available.',
  },
  vertical: {
    unavailable: 'The engagement profile is not implemented.',
    title: 'Vertical Profile',
    category: 'Vertical engagement profile',
    icon: ChartNoAxesCombined,
    description:
      'Understand altitude and separation across the operational picture.',
    future:
      'The vertical engagement profile will be connected in a later phase.',
  },
  timeline: {
    unavailable: 'Event history and replay are not implemented.',
    title: 'Timeline',
    category: 'Temporal context',
    icon: Clock3,
    description: 'Review how the operational picture changes over time.',
    future: 'Event history and replay will be available in a later phase.',
  },
  inspector: {
    unavailable: 'Detailed entity inspection is not implemented.',
    title: 'Entity Inspector',
    category: 'Detail on demand',
    icon: ScanSearch,
    description: 'Inspect the context behind a selected entity.',
    future:
      'Entity details will appear here when selection and mission data are connected.',
  },
} as const;
export type ViewKind = keyof typeof viewRegistry;
export type ViewId = ViewKind | `tactical:${number}` | `inspector:${string}`;
export function inspectorId(missionId: string, entityId: string): ViewId {
  return `inspector:${encodeURIComponent(JSON.stringify([missionId, entityId]))}`;
}
export function inspectorIdentity(
  id: string,
): { missionId: string; entityId: string } | undefined {
  if (!id.startsWith('inspector:')) return;
  try {
    const values: unknown = JSON.parse(decodeURIComponent(id.slice(10)));
    if (
      Array.isArray(values) &&
      values.length === 2 &&
      values.every(
        (v) => typeof v === 'string' && v.length > 0 && v.length <= 256,
      )
    )
      return { missionId: values[0], entityId: values[1] };
  } catch {
    /* Invalid workspace identity is not a domain lookup. */
  }
}
// Navigation opens the primary instance of each view kind.
export const viewIds = Object.keys(viewRegistry) as ViewKind[];
export function viewKind(id: ViewId): ViewKind {
  if (id.startsWith('inspector:')) return 'inspector';
  return id.startsWith('tactical:') ? 'tactical' : (id as ViewKind);
}
export function viewTitle(id: ViewId): string {
  if (id.startsWith('inspector:'))
    return `Pinned · ${inspectorIdentity(id)?.entityId ?? 'Unavailable'}`;
  return id.startsWith('tactical:')
    ? `Tactical Map ${id.slice('tactical:'.length)}`
    : viewRegistry[viewKind(id)].title;
}
export function isViewId(value: string): value is ViewId {
  if (inspectorIdentity(value)) return true;
  if (Object.hasOwn(viewRegistry, value)) return true;
  if (!/^tactical:[1-9]\d*$/.test(value)) return false;
  const instance = Number(value.slice('tactical:'.length));
  return Number.isSafeInteger(instance) && instance >= 2;
}
