import { Box, Map as MapIcon, Minus, type LucideIcon } from 'lucide-react'

/* ===========================================================================
   VIEW MODES — how the map is drawn and where the camera sits.

   Orthogonal to cursor modes: a cursor mode says what a drag does, a view
   mode says what the operator is looking at. Both can change independently.
=========================================================================== */

export type ViewModeId = 'tactical' | 'flat' | 'minimal'

export interface ViewMode {
  id: ViewModeId
  label: string
  icon: LucideIcon
  description: string
  /** Camera pitch in degrees. 0 is straight down. */
  pitch: number
  /** Drape the basemap over the DEM. */
  terrain: boolean
  /** Vertical exaggeration. See the note below on why this is not 1. */
  terrainExaggeration: number
  /** Shade slopes from the DEM. Cheap, and reads even where relief is low. */
  hillshade: boolean
  /** Extrude building footprints to their OSM height. */
  buildings3d: boolean
  /** Draw POI markers and their labels. */
  pois: boolean
}

/**
 * TERRAIN EXAGGERATION
 *
 * The operating area is close to flat: Bukit Timah, the highest point in
 * Singapore, is about 164m, and most of the island is under 15m. At 1:1 the
 * DEM is invisible at operational zoom — the map looks identical to flat, and
 * the terrain cost buys nothing.
 *
 * 1.5x in tactical mode makes relief legible without misrepresenting it badly
 * enough to matter for situational awareness. It is a display choice, not a
 * measurement: anything computing line-of-sight or intercept geometry must
 * read the DEM directly, never infer height from what is on screen.
 */
export const VIEW_MODES: readonly ViewMode[] = [
  {
    id: 'tactical',
    label: 'Tactical 3D',
    icon: Box,
    description:
      'Pitched view with terrain and extruded buildings. The urban structure ' +
      'that governs line of sight and interceptor routing.',
    pitch: 55,
    terrain: true,
    terrainExaggeration: 1.5,
    hillshade: true,
    buildings3d: true,
    pois: true,
  },
  {
    id: 'flat',
    label: 'Flat 2D',
    icon: MapIcon,
    description:
      'Straight down, no terrain. Truest for bearings and distances, and the ' +
      'cheapest to render.',
    pitch: 0,
    terrain: false,
    terrainExaggeration: 1,
    hillshade: false,
    buildings3d: false,
    pois: true,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    icon: Minus,
    description:
      'Flat, with POIs and clutter suppressed. For when the overlay is the ' +
      'subject and the basemap is only context.',
    pitch: 0,
    terrain: false,
    terrainExaggeration: 1,
    hillshade: false,
    buildings3d: false,
    pois: false,
  },
]

export const DEFAULT_VIEW_MODE: ViewModeId = 'tactical'

const BY_ID = new Map(VIEW_MODES.map((m) => [m.id, m]))

export function getViewMode(id: ViewModeId): ViewMode {
  const mode = BY_ID.get(id)
  if (!mode) throw new Error(`Unknown view mode: ${id}`)
  return mode
}
