/**
 * Singapore terrain & environmental layer configuration.
 * DEM via Mapbox Terrain-DEM (swap demUrl for self-hosted SRTM/ALOS offline tiles).
 */

export type TerrainSourceKind = 'mapbox-terrain' | 'self-hosted-dem'
export type EnvLayerId =
  | 'vegetation'
  | 'water'
  | 'buildings'
  | 'roads'
  | 'restricted'
  | 'hillshade'
  | 'contours'

export interface TerrainConfig {
  source: TerrainSourceKind
  demUrl: string
  /** Self-hosted XYZ tile template(s) — overrides demUrl when set. */
  demTiles?: string[]
  demEncoding?: 'mapbox' | 'terrarium'
  /** Contour vector source — mapbox:// or local tiles URL. */
  contourUrl?: string
  exaggeration: number
  hillshade: boolean
  contours: {
    enabled: boolean
    interval: number
    color: string
  }
}

export interface EnvLayerState {
  id: EnvLayerId
  label: string
  visible: boolean
  opacity: number
}

/** Topographic defaults — DEM relief + contours over satellite basemap. */
export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  source: 'mapbox-terrain',
  demUrl: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  exaggeration: 1.85,
  hillshade: true,
  contours: {
    enabled: true,
    interval: 10,
    color: 'rgba(232, 210, 140, 0.7)',
  },
}

export const DEFAULT_ENV_LAYERS: EnvLayerState[] = [
  { id: 'hillshade', label: 'Hillshade', visible: true, opacity: 0.55 },
  { id: 'contours', label: 'Contours', visible: true, opacity: 0.85 },
  { id: 'vegetation', label: 'Vegetation', visible: true, opacity: 0.35 },
  { id: 'water', label: 'Water', visible: true, opacity: 0.9 },
  { id: 'buildings', label: 'Buildings', visible: true, opacity: 1 },
  { id: 'roads', label: 'Roads', visible: true, opacity: 0.75 },
  { id: 'restricted', label: 'Restricted / training', visible: true, opacity: 0.25 },
]

/** Mapbox style layer id substrings used to toggle environmental features. */
export const ENV_STYLE_LAYER_MATCH: Record<
  Exclude<EnvLayerId, 'hillshade' | 'contours' | 'buildings' | 'restricted'>,
  string[]
> = {
  vegetation: ['landuse', 'landcover', 'park', 'national-park', 'pitch'],
  water: ['water', 'waterway'],
  roads: ['road', 'bridge', 'tunnel', 'path', 'track'],
}

export const TERRAIN_DEM_SOURCE = 'sentinel-dem'
export const TERRAIN_HILLSHADE_LAYER = 'sentinel-hillshade'
export const TERRAIN_CONTOUR_SOURCE = 'sentinel-contours'
export const TERRAIN_CONTOUR_LAYER = 'sentinel-contour-lines'
export const TERRAIN_CONTOUR_LABEL_LAYER = 'sentinel-contour-labels'
export const BUILDINGS_3D_LAYER = '3d-buildings'
export const BUILDINGS_EDGE_LAYER = '3d-building-edges'
export const RESTRICTED_SOURCE = 'sentinel-restricted'
export const RESTRICTED_FILL_LAYER = 'sentinel-restricted-fill'
export const RESTRICTED_OUTLINE_LAYER = 'sentinel-restricted-outline'
export const LANDMARK_SOURCE = 'sentinel-landmarks'
export const LANDMARK_LAYER = 'sentinel-landmarks'
export const LOS_SOURCE = 'sentinel-los'
export const LOS_LAYER = 'sentinel-los-line'
export const MASK_SOURCE = 'sentinel-terrain-mask'
export const MASK_LAYER = 'sentinel-terrain-mask-fill'

/** Singapore operational AO (~50×50 km) for offline cache planning. */
export const SG_OPERATIONAL_BOUNDS: [[number, number], [number, number]] = [
  [103.6, 1.15],
  [104.1, 1.48],
]

export const SG_RESTRICTED_AREAS = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: 'safti-lfa', name: 'SAFTI Live Firing', kind: 'danger' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [103.67, 1.33],
            [103.71, 1.33],
            [103.71, 1.36],
            [103.67, 1.36],
            [103.67, 1.33],
          ],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'mandai-train', name: 'Mandai Training', kind: 'restricted' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [103.76, 1.39],
            [103.80, 1.39],
            [103.80, 1.42],
            [103.76, 1.42],
            [103.76, 1.39],
          ],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'changi-ctr', name: 'Changi CTR buffer', kind: 'nofly' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [103.97, 1.32],
            [104.05, 1.32],
            [104.05, 1.39],
            [103.97, 1.39],
            [103.97, 1.32],
          ],
        ],
      },
    },
  ],
}

/** Distinctive landmarks for ORB-SLAM3 / visual nav in GNSS-denied ops. */
export const SG_VISUAL_LANDMARKS = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: 'lm-bukit-timah', name: 'Bukit Timah summit', kind: 'ridge' },
      geometry: { type: 'Point' as const, coordinates: [103.776, 1.354] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'lm-macritchie', name: 'MacRitchie Reservoir', kind: 'water' },
      geometry: { type: 'Point' as const, coordinates: [103.822, 1.342] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'lm-pier', name: 'Changi coastal pier', kind: 'coast' },
      geometry: { type: 'Point' as const, coordinates: [104.02, 1.318] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'lm-tengah-ridge', name: 'Tengah western ridge', kind: 'ridge' },
      geometry: { type: 'Point' as const, coordinates: [103.705, 1.385] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'lm-jurong-flare', name: 'Jurong industrial stack', kind: 'tower' },
      geometry: { type: 'Point' as const, coordinates: [103.71, 1.275] as [number, number] },
    },
  ],
}

export type TerrainComplexity = 'low' | 'medium' | 'high'

/** Coarse Singapore terrain-complexity zones for drift estimation. */
export function estimateTerrainComplexity(lng: number, lat: number): TerrainComplexity {
  // Western catchment / Mandai / Bukit Timah — higher complexity
  if (lng > 103.74 && lng < 103.80 && lat > 1.34 && lat < 1.43) return 'high'
  if (lng > 103.68 && lng < 103.74 && lat > 1.35 && lat < 1.40) return 'high'
  // Dense urban central/east
  if (lng > 103.82 && lng < 103.95 && lat > 1.28 && lat < 1.38) return 'medium'
  // Open coastal / industrial flats
  if (lat < 1.28 || lng > 104.0) return 'low'
  return 'medium'
}
