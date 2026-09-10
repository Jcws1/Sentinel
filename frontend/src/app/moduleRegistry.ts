import {
  House,
  Map,
  ScanSearch,
  Radar,
  Crosshair,
  Clock3,
  Files,
  ListFilter,
  Settings2,
} from 'lucide-react';
import type { ViewId } from '../features/workspace/viewRegistry';

/** Navigation availability is shell capability, never mission/domain state. */
export const modules = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'map', label: 'Map', icon: Map, view: 'tactical' },
  { id: 'tracks', label: 'Tracks', icon: ScanSearch },
  { id: 'sensors', label: 'Sensors', icon: Radar },
  { id: 'command', label: 'Command Picture', icon: Crosshair, view: 'command' },
  { id: 'timeline', label: 'Timeline', icon: Clock3, view: 'timeline' },
  { id: 'reports', label: 'Reports', icon: Files },
  { id: 'events', label: 'Events', icon: ListFilter },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] satisfies { id: string; label: string; icon: typeof House; view?: ViewId }[];

export function moduleForView(view?: ViewId) {
  if (view === 'three-d') return 'map';
  if (view === 'vertical') return 'command';
  return modules.find((item) => item.view === view && view !== undefined)?.id;
}
