/** Semantic guards complement generated schema checks at the replica boundary. */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}
export function calendarInstant(value: string) {
  const parsed = new Date(value);
  invariant(
    !value.startsWith('0000-') &&
      Number.isFinite(parsed.valueOf()) &&
      parsed.toISOString() === value,
    'Invalid calendar timestamp',
  );
}
type Point = readonly number[];
type Ring = readonly Point[];
const orientation = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Point, b: Point, p: Point) =>
  orientation(a, b, p) === 0 &&
  Math.min(a[0], b[0]) <= p[0] &&
  p[0] <= Math.max(a[0], b[0]) &&
  Math.min(a[1], b[1]) <= p[1] &&
  p[1] <= Math.max(a[1], b[1]);
const opposite = (a: number, b: number) => (a < 0 && b > 0) || (b < 0 && a > 0);
const intersects = (a: Point, b: Point, c: Point, d: Point) =>
  (opposite(orientation(a, b, c), orientation(a, b, d)) &&
    opposite(orientation(c, d, a), orientation(c, d, b))) ||
  onSegment(a, b, c) ||
  onSegment(a, b, d) ||
  onSegment(c, d, a) ||
  onSegment(c, d, b);
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
function inside(point: Point, ring: Ring) {
  let result = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i],
      b = ring[i + 1];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
export function polygonIntegrity(input: readonly Ring[]) {
  invariant(input.length > 0, 'Polygon requires an exterior ring');
  const points = input.flat();
  invariant(points.length > 0, 'Polygon requires positions');
  const anchor = points[0];
  const sx =
    points.reduce((n, p) => Math.max(n, Math.abs(p[0] - anchor[0])), 0) || 1;
  const sy =
    points.reduce((n, p) => Math.max(n, Math.abs(p[1] - anchor[1])), 0) || 1;
  // Positive affine normalization changes no source coordinates or topology.
  // It prevents finite tiny polygons from underflowing during validation.
  const rings =
    Math.min(sx, sy) < 1e-120
      ? input.map((ring) =>
          ring.map((p) => [(p[0] - anchor[0]) / sx, (p[1] - anchor[1]) / sy]),
        )
      : input;
  for (const ring of rings) {
    invariant(
      ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1]),
      'Polygon ring is not closed',
    );
    invariant(
      new Set(ring.slice(0, -1).map((p) => JSON.stringify(p))).size ===
        ring.length - 1,
      'Polygon ring contains repeated vertices',
    );
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i],
        b = ring[i + 1],
        c = ring[(i + 2) % (ring.length - 1)];
      // Translate before multiplying so tiny valid rings away from zero survive.
      area += orientation(ring[0], a, b);
      invariant(
        !onSegment(a, b, c) && !onSegment(b, c, a),
        'Polygon adjacent edges overlap',
      );
      for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        invariant(
          !intersects(a, b, ring[j], ring[j + 1]),
          'Polygon ring intersects itself',
        );
      }
    }
    invariant(area !== 0, 'Polygon has zero area');
  }
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i];
    invariant(inside(hole[0], rings[0]), 'Polygon hole is outside exterior');
    for (let j = 0; j < i; j++) {
      const previous = rings[j];
      for (let a = 0; a < hole.length - 1; a++) {
        for (let b = 0; b < previous.length - 1; b++) {
          invariant(
            !intersects(hole[a], hole[a + 1], previous[b], previous[b + 1]),
            'Polygon rings intersect',
          );
        }
      }
      if (j > 0)
        invariant(
          !inside(hole[0], previous) && !inside(previous[0], hole),
          'Polygon holes overlap',
        );
    }
  }
}
