import type { LngLat } from '@/lib/geo'

/* ===========================================================================
   ANNOTATION MODEL

   Operator-drawn geometry: a measured path, a geofence zone, a designated
   point. Deliberately renderer-agnostic — positions are stored as raw
   coordinates, not GeoJSON, so the Cesium adapter does not have to unpick a
   structure only MapLibre uses. GeoJSON is derived where it is needed.
=========================================================================== */

export type AnnotationKind = 'measure' | 'zone' | 'waypoint'

export interface Annotation {
  id: string
  kind: AnnotationKind
  /**
   * Vertices in placement order.
   * waypoint = exactly 1, measure >= 2, zone >= 3 (implicitly closed).
   */
  positions: LngLat[]
  /** Auto-assigned on commit; renameable from the Map panel. */
  label: string
  createdAt: number
}

/**
 * An annotation being drawn.
 *
 * `cursor` is the live pointer position, used to rubber-band the segment
 * between the last placed vertex and where the operator is about to click.
 * It changes on every mousemove, which is why the store holding it must stay
 * outside React.
 */
export interface AnnotationDraft {
  kind: AnnotationKind
  positions: LngLat[]
  cursor: LngLat | null
}

/** Minimum vertices before a draft can be committed. */
export const MIN_VERTICES: Record<AnnotationKind, number> = {
  waypoint: 1,
  measure: 2,
  zone: 3,
}

/** Label prefixes. Short enough to read at 10px on a busy map. */
export const LABEL_PREFIX: Record<AnnotationKind, string> = {
  waypoint: 'WP',
  measure: 'MEAS',
  zone: 'ZONE',
}

export function isComplete(draft: AnnotationDraft): boolean {
  return draft.positions.length >= MIN_VERTICES[draft.kind]
}
