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
  Box,
} from 'lucide-react';
import { viewKind, type ViewId } from '../features/workspace/viewRegistry';

/** Navigation availability is shell capability, never mission/domain state. */
export const modules = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'map', label: 'Map', icon: Map, view: 'tactical' },
  { id: 'units', label: 'Units', icon: Box, view: 'units' },
  { id: 'tracks', label: 'Tracks', icon: ScanSearch, view: 'tracks' },
  { id: 'sensors', label: 'Sensors', icon: Radar },
  { id: 'command', label: 'Command Picture', icon: Crosshair, view: 'command' },
  { id: 'timeline', label: 'Timeline', icon: Clock3, view: 'timeline' },
  { id: 'reports', label: 'Reports', icon: Files },
  { id: 'events', label: 'Events', icon: ListFilter },
  { id: 'settings', label: 'Settings', icon: Settings2, view: 'credits' },
] satisfies { id: string; label: string; icon: typeof House; view?: ViewId }[];

export function moduleForView(view?: ViewId) {
  if (!view) return;
  const kind = viewKind(view);
  if (kind === 'three-d') return 'map';
  if (kind === 'vertical') return 'command';
  if (kind === 'inspector' || kind === 'movement' || kind === 'details')
    return 'tracks';
  return modules.find((item) => item.view === kind)?.id;
}
