import type { FeatureCollection, Feature, Geometry } from 'geojson'

import {
  pathLengthMetres,
  sphericalAreaM2,
  initialBearingDeg,
  formatDistance,
  formatArea,
  formatBearing,
} from '@/lib/geo'
import type { Annotation, AnnotationDraft } from './types'

/* ===========================================================================
   GeoJSON derivation

   Built from the stored coordinates on demand rather than kept in the store.
   Only MapLibre needs this shape; Cesium consumes the raw positions.
=========================================================================== */

/** The readout shown beside an annotation on the map and in the panel. */
export function measurementFor(annotation: Annotation): string {
  const { kind, positions } = annotation

  if (kind === 'waypoint') return ''

  if (kind === 'measure') {
    const length = formatDistance(pathLengthMetres(positions))
    // Bearing of the final leg: on a multi-leg path that is the one the
    // operator just drew, and a single number beats a list of per-leg values
    // at 10px on a map.
    if (positions.length >= 2) {
      const a = positions[positions.length - 2]!
      const b = positions[positions.length - 1]!
      return `${length} · ${formatBearing(initialBearingDeg(a, b))}`
    }
    return length
  }

  return formatArea(sphericalAreaM2(positions))
}

/**
 * Properties that make a vertex draggable.
 *
 * `fid` is promoted to the MapLibre feature id (see `promoteId` on the source)
 * so `setFeatureState` has a stable handle across redraws — the collection is
 * rebuilt wholesale on every change, and auto-generated ids would shift the
 * moment any annotation gained or lost a point.
 *
 * Draft geometry never gets these. That is what makes "you cannot drag a shape
 * you are still drawing" structural rather than a rule the hit test has to
 * remember to apply.
 */
function vertexHandle(id: string, index: number) {
  return { fid: `${id}:${index}`, index }
}

function annotationFeatures(annotation: Annotation): Feature[] {
  const { id, kind, positions, label } = annotation
  const base = { id, kind, label, measurement: measurementFor(annotation) }

  if (kind === 'waypoint') {
    return [
      {
        type: 'Feature',
        properties: { ...base, role: 'point', ...vertexHandle(id, 0) },
        geometry: { type: 'Point', coordinates: [...positions[0]!] },
      },
    ]
  }

  const features: Feature[] = []

  if (kind === 'zone') {
    // GeoJSON polygons must repeat the first position as the last; the store
    // holds an open ring because that is what the operator drew.
    const ring = [...positions.map((p) => [...p]), [...positions[0]!]]
    features.push({
      type: 'Feature',
      properties: { ...base, role: 'fill' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  } else {
    features.push({
      type: 'Feature',
      properties: { ...base, role: 'line' },
      geometry: {
        type: 'LineString',
        coordinates: positions.map((p) => [...p]),
      },
    })
  }

  // Vertices, so the operator can see exactly where each click landed — and,
  // carrying a handle, can grab one and move it.
  positions.forEach((p, index) => {
    features.push({
      type: 'Feature',
      properties: { ...base, role: 'vertex', ...vertexHandle(id, index) },
      geometry: { type: 'Point', coordinates: [...p] },
    })
  })

  // One label anchored on the last vertex — placing it at the centroid would
  // put a zone's name in the middle of the area it describes, over whatever
  // the operator drew the zone around.
  features.push({
    type: 'Feature',
    properties: { ...base, role: 'label' },
    geometry: {
      type: 'Point',
      coordinates: [...positions[positions.length - 1]!],
    },
  })

  return features
}

/** In-progress geometry, including the rubber-band to the live cursor. */
function draftFeatures(draft: AnnotationDraft): Feature[] {
  const { kind, positions, cursor } = draft
  if (positions.length === 0) return []

  const base = { id: 'draft', kind, label: '', measurement: '', draft: true }
  const features: Feature[] = []

  const path = cursor ? [...positions, cursor] : positions
  const coordinates = path.map((p) => [...p])

  if (coordinates.length >= 2) {
    const geometry: Geometry =
      kind === 'zone' && coordinates.length >= 3
        ? // Show the closing segment while drawing, so the operator can see
          // the shape they are about to commit rather than a dangling path.
          { type: 'LineString', coordinates: [...coordinates, coordinates[0]!] }
        : { type: 'LineString', coordinates }

    features.push({
      type: 'Feature',
      properties: { ...base, role: 'line' },
      geometry,
    })
  }

  for (const p of positions) {
    features.push({
      type: 'Feature',
      properties: { ...base, role: 'vertex' },
      geometry: { type: 'Point', coordinates: [...p] },
    })
  }

  // Live readout at the cursor: the number is only useful while it is being
  // created, which is exactly when the annotation has no label yet.
  if (cursor && positions.length >= 1) {
    const live =
      kind === 'zone' && positions.length >= 2
        ? formatArea(sphericalAreaM2([...positions, cursor]))
        : `${formatDistance(pathLengthMetres([...positions, cursor]))} · ${formatBearing(
            initialBearingDeg(positions[positions.length - 1]!, cursor),
          )}`

    features.push({
      type: 'Feature',
      properties: { ...base, role: 'label', measurement: live },
      geometry: { type: 'Point', coordinates: [...cursor] },
    })
  }

  return features
}

export function toFeatureCollection(
  items: readonly Annotation[],
  draft: AnnotationDraft | null,
): FeatureCollection {
  const features = items.flatMap(annotationFeatures)
  if (draft) features.push(...draftFeatures(draft))
  return { type: 'FeatureCollection', features }
}
