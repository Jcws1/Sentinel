import {
  House,
  Map as MapIcon,
  Radar,
  Waypoints,
  ShieldCheck,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { HomeView } from '@/views/HomeView'
import { MapView } from '@/views/MapView'
import { TracksView } from '@/views/TracksView'
import { FleetView } from '@/views/FleetView'
import { PolicyView } from '@/views/PolicyView'
import { EventsView } from '@/views/EventsView'
import { SettingsView } from '@/views/SettingsView'

export type ViewId =
  | 'home'
  | 'map'
  | 'tracks'
  | 'fleet'
  | 'policy'
  | 'events'
  | 'settings'

/**
 * Where a slot sits in the rail. `system` is pinned to the bottom, the way an
 * activity bar separates workspace tools from application settings.
 */
export type ViewGroup = 'primary' | 'mission' | 'system'

export interface ViewDefinition {
  id: ViewId
  label: string
  icon: LucideIcon
  group: ViewGroup
  /** Rendered into the panel layer. The map underneath never unmounts. */
  component: ComponentType
}

/**
 * Single source of truth for the rail and the routing.
 *
 * Deliberately one list rather than a separate `railItems` array plus a route
 * table: two lists keyed by the same ids drift, and the failure mode is a rail
 * button that navigates nowhere.
 */
export const VIEWS: readonly ViewDefinition[] = [
  {
    id: 'home',
    label: 'Overview',
    icon: House,
    group: 'primary',
    component: HomeView,
  },
  {
    id: 'map',
    label: 'Map',
    icon: MapIcon,
    group: 'primary',
    component: MapView,
  },
  {
    id: 'tracks',
    label: 'Tracks',
    icon: Radar,
    group: 'mission',
    component: TracksView,
  },
  {
    id: 'fleet',
    label: 'Fleet',
    icon: Waypoints,
    group: 'mission',
    component: FleetView,
  },
  {
    id: 'policy',
    label: 'Policy',
    icon: ShieldCheck,
    group: 'mission',
    component: PolicyView,
  },
  {
    id: 'events',
    label: 'Events',
    icon: ScrollText,
    group: 'mission',
    component: EventsView,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    group: 'system',
    component: SettingsView,
  },
]

const VIEW_BY_ID = new Map(VIEWS.map((v) => [v.id, v]))

export function getView(id: ViewId): ViewDefinition {
  const view = VIEW_BY_ID.get(id)
  if (!view) throw new Error(`Unknown view: ${id}`)
  return view
}

export function viewsInGroup(group: ViewGroup): ViewDefinition[] {
  return VIEWS.filter((v) => v.group === group)
}
