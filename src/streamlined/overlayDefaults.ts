import type { ModeId } from '../store/uiSlice'
import type { EnvLayerId } from '../terrain/sgTerrainConfig'

/** Map chrome layers toggled from OVERLAYS (beyond terrain env layers). */
export type MapChromeLayerId =
  | 'terrain'
  | 'threats'
  | 'friendly'
  | 'mesh'
  | 'contours'
  | 'masking'
  | 'buildings'
  | 'water'
  | 'roads'

export interface OverlayToggleDef {
  id: MapChromeLayerId
  label: string
}

export const OVERLAY_TOGGLE_DEFS: OverlayToggleDef[] = [
  { id: 'threats', label: 'Threats' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'contours', label: 'Contours' },
  { id: 'masking', label: 'Masking' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'water', label: 'Water' },
  { id: 'roads', label: 'Roads' },
]

/** Core overlays — shown by default in the panel. */
export const OVERLAY_PRIMARY_IDS: MapChromeLayerId[] = [
  'threats',
  'friendly',
  'mesh',
  'terrain',
]

/** Secondary overlays — collapsed until expanded. */
export const OVERLAY_ADVANCED_IDS: MapChromeLayerId[] = [
  'contours',
  'masking',
  'buildings',
  'water',
  'roads',
]

export type OverlayVisibility = Record<MapChromeLayerId, boolean>

const ALL_OFF: OverlayVisibility = {
  terrain: false,
  threats: false,
  friendly: false,
  mesh: false,
  contours: false,
  masking: false,
  buildings: false,
  water: false,
  roads: false,
}

function on(...ids: MapChromeLayerId[]): OverlayVisibility {
  const next = { ...ALL_OFF }
  for (const id of ids) next[id] = true
  return next
}

/** Mode-default overlays (PRD v4). Degraded handled separately. */
export const OVERLAY_DEFAULTS_BY_MODE: Record<ModeId, OverlayVisibility> = {
  defense: on('terrain', 'threats', 'friendly', 'mesh'),
  recon: on('terrain', 'friendly', 'buildings', 'water'),
  attack: on('terrain', 'threats', 'friendly', 'buildings'),
}

export const OVERLAY_DEFAULTS_DEGRADED: OverlayVisibility = on(
  'terrain',
  'friendly',
  'mesh',
  'contours',
)

export function envIdForOverlay(id: MapChromeLayerId): EnvLayerId | null {
  switch (id) {
    case 'contours':
      return 'contours'
    case 'buildings':
      return 'buildings'
    case 'water':
      return 'water'
    case 'roads':
      return 'roads'
    case 'terrain':
      return 'hillshade'
    default:
      return null
  }
}
