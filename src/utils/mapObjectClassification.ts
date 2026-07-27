import type { MapObjectCategory } from '../types/mapObjects'

const MAP_KIND_CATEGORIES: ReadonlyArray<{
  category: Exclude<MapObjectCategory, 'other'>
  kinds: readonly string[]
}> = [
  {
    category: 'restricted',
    kinds: ['restricted', 'no_fly', 'nofly', 'exclusion_zone'],
  },
  {
    category: 'military',
    kinds: [
      'military',
      'military_land',
      'military_airbase',
      'military_naval',
      'naval_base',
      'airbase',
      'barracks',
      'training_area',
    ],
  },
  {
    category: 'medical',
    kinds: ['hospital', 'clinic', 'doctors', 'pharmacy', 'healthcare'],
  },
  {
    category: 'education',
    kinds: [
      'school',
      'university',
      'college',
      'kindergarten',
      'childcare',
      'library',
    ],
  },
  {
    category: 'transport',
    kinds: [
      'airport',
      'aerodrome',
      'airfield',
      'heliport',
      'railway',
      'rail',
      'station',
      'rail_station',
      'train_station',
      'transit',
      'bus_stop',
      'bus_station',
      'ferry_terminal',
      'port',
      'harbour',
      'parking',
    ],
  },
  {
    category: 'infrastructure',
    kinds: [
      'power',
      'power_plant',
      'substation',
      'generator',
      'utility',
      'water_works',
      'water_treatment',
      'wastewater_plant',
      'reservoir',
      'communications_tower',
      'tower',
      'data_center',
    ],
  },
  {
    category: 'industrial',
    kinds: [
      'industrial',
      'factory',
      'manufacturing',
      'warehouse',
      'depot',
      'quarry',
    ],
  },
  {
    category: 'housing',
    kinds: [
      'residential',
      'housing',
      'apartments',
      'apartment',
      'neighbourhood',
      'neighborhood',
      'suburb',
      'dormitory',
    ],
  },
  {
    category: 'commercial',
    kinds: [
      'commercial',
      'retail',
      'office',
      'mall',
      'supermarket',
      'marketplace',
      'hotel',
    ],
  },
  {
    category: 'recreation',
    kinds: [
      'park',
      'playground',
      'sports_centre',
      'sports_center',
      'stadium',
      'pitch',
      'golf_course',
      'nature_reserve',
    ],
  },
]

export function normalizeMapKind(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, '_')
}

export function categoryForMapKinds(
  values: readonly unknown[],
): MapObjectCategory {
  const kinds = values.map(normalizeMapKind).filter(Boolean)
  for (const { category, kinds: recognizedKinds } of MAP_KIND_CATEGORIES) {
    if (kinds.some((kind) => recognizedKinds.includes(kind))) return category
  }
  return 'other'
}
