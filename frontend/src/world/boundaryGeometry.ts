import type { BoundaryDefinition } from '../contracts/generated';
import {
  originFor,
  extentTolerance,
  type GeometryOwner,
} from './localGeometry';
export type Vertex = readonly [number, number];
const scale = (6378137 * Math.PI) / 180;
const tolerance = 0.001;
export const boundaryLabels = {
  untyped: 'UNTYPED',
  annotation: 'ANNOTATION ONLY',
  friendly: 'FRIENDLY · NO ENGAGEMENT',
  patrol: 'PATROL AREA',
  restricted: 'RESTRICTED · NO ENTRY',
  keep_in: 'KEEP IN · OPERATING AREA',
} as const;
export const boundaryColors = {
  untyped: '#a4adb6',
  annotation: '#a4adb6',
  friendly: '#9ac6bb',
  patrol: '#77c5dc',
  restricted: '#dfb665',
  keep_in: '#85bbeb',
} as const;
export function metricVertex(v: Vertex, geometry?: GeometryOwner): Vertex {
  const origin = originFor(geometry);
  return [
    (v[0] - origin.longitudeDeg) *
      scale *
      Math.cos((origin.latitudeDeg * Math.PI) / 180),
    (v[1] - origin.latitudeDeg) * scale,
  ];
}
function cross(a: Vertex, b: Vertex, c: Vertex) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function separation(p: Vertex, a: Vertex, b: Vertex) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
      )
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function touches(a: Vertex, b: Vertex, c: Vertex, d: Vertex) {
  return (
    Math.min(
      separation(a, c, d),
      separation(b, c, d),
      separation(c, a, b),
      separation(d, a, b),
    ) <= tolerance ||
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
  );
}
export function boundaryContains(
  v: Vertex,
  vertices: readonly Vertex[],
  geometry?: GeometryOwner,
) {
  const p = metricVertex(v, geometry),
    ring = vertices.map((v) => metricVertex(v, geometry));
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    if (separation(p, a, b) <= tolerance) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function boundaryCrosses(
  a: Vertex,
  b: Vertex,
  vertices: readonly Vertex[],
  geometry?: GeometryOwner,
) {
  if (
    boundaryContains(a, vertices, geometry) ||
    boundaryContains(b, vertices, geometry)
  )
    return true;
  const left = metricVertex(a, geometry),
    right = metricVertex(b, geometry),
    ring = vertices.map((v) => metricVertex(v, geometry));
  return ring.some((v, i) =>
    touches(left, right, v, ring[(i + 1) % ring.length]),
  );
}
export function boundaryInsidePath(
  a: Vertex,
  b: Vertex | undefined,
  vertices: readonly Vertex[],
  geometry?: GeometryOwner,
) {
  if (!boundaryContains(a, vertices, geometry) || (b && !boundaryContains(b, vertices, geometry)))
    return false;
  const first = metricVertex(a, geometry);
  const last = b ? metricVertex(b, geometry) : first;
  const ring = vertices.map((v) => metricVertex(v, geometry));
  return !ring.some((v, i) => touches(first, last, v, ring[(i + 1) % ring.length]));
}
export function validateBoundary(
  b: BoundaryDefinition,
  geometry?: GeometryOwner,
) {
  if (!b.name.trim() || b.name.length > 64)
    throw new Error('Name the boundary (1–64 characters).');
  if (b.vertices.length < 3 || b.vertices.length > 32)
    throw new Error('Use 3–32 distinct vertices before Finish or Apply.');
  const ring = b.vertices.map((v) => metricVertex(v, geometry));
  if (
    ring.some((p) =>
      p.some(
        (x) =>
          !Number.isFinite(x) || Math.abs(x) > 5000 + extentTolerance(geometry),
      ),
    )
  )
    throw new Error('Enter finite coordinates within the local ±5 km extent.');
  let area = 0,
    perimeter = 0;
  const turns: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      c = ring[(i + 2) % ring.length];
    for (let j = i + 1; j < ring.length; j++)
      if (Math.hypot(a[0] - ring[j][0], a[1] - ring[j][1]) <= tolerance)
        throw new Error('Vertices must be distinct and more than 1 mm apart.');
    if (separation(c, a, b) <= tolerance || separation(a, b, c) <= tolerance)
      throw new Error('Adjacent edges overlap or are degenerate.');
    for (let j = i + 2; j < ring.length; j++)
      if (
        !(i === 0 && j === ring.length - 1) &&
        touches(a, b, ring[j], ring[(j + 1) % ring.length])
      )
        throw new Error('Boundary edges intersect or touch themselves.');
    area += a[0] * b[1] - b[0] * a[1];
    perimeter += Math.hypot(a[0] - b[0], a[1] - b[1]);
    turns.push(cross(a, b, c));
  }
  if (Math.abs(area) / 2 <= tolerance * perimeter)
    throw new Error('Boundary area is too small or zero.');
  if (
    b.type === 'patrol' &&
    turns.some((t) => t > 0) &&
    turns.some((t) => t < 0)
  )
    throw new Error(
      'Patrol boundaries must be convex. Automatic patrol is not available yet.',
    );
}
