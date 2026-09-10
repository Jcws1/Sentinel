import {
  Box,
  ChartNoAxesCombined,
  Clock3,
  Crosshair,
  Map,
  ScanSearch,
} from 'lucide-react';

// Shell descriptors identify empty workspace views, never fabricated domain objects.
export const viewRegistry = {
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
    unavailable: 'Entity selection and details are not implemented.',
    title: 'Entity Inspector',
    category: 'Detail on demand',
    icon: ScanSearch,
    description: 'Inspect the context behind a selected entity.',
    future:
      'Entity details will appear here when selection and mission data are connected.',
  },
} as const;
export type ViewId = keyof typeof viewRegistry;
export const viewIds = Object.keys(viewRegistry) as ViewId[];
export function isViewId(value: string): value is ViewId {
  return Object.hasOwn(viewRegistry, value);
}
