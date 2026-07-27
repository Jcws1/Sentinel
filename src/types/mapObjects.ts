import type { Position } from './index'

export type MapObjectCategory =
  | 'restricted'
  | 'military'
  | 'medical'
  | 'education'
  | 'transport'
  | 'infrastructure'
  | 'industrial'
  | 'housing'
  | 'commercial'
  | 'recreation'
  | 'other'

export interface ClassifiedMapObject {
  id: string
  name: string
  category: MapObjectCategory
  kind: string
  source: 'vector-map' | 'sentinel'
  position: Position
}
