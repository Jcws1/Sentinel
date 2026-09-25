import { ExactPoints } from './exactGeometry';

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
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
/**
 * Exact planar topology on each coordinate's shortest round-trip decimal; see
 * exactGeometry.ts. Source coordinates are validated as supplied, unchanged.
 * Checks run in backend/app/domain/geometry.py's order, so both report the same
 * first violation: each ring (closure, distinct vertices, zero area, then each
 * edge), then each hole (inside the exterior, contact with every earlier ring,
 * then overlap with earlier holes).
 */
export function polygonIntegrity(input: readonly Ring[]) {
  invariant(input.length > 0, 'Polygon requires an exterior ring');
  const points = input.flat();
  invariant(points.length > 0, 'Polygon requires positions');
  const exact = new ExactPoints(points);
  const starts: number[] = [];
  let offset = 0;
  for (const ring of input) {
    starts.push(offset);
    offset += ring.length;
  }
  input.forEach((ring, r) => {
    invariant(
      ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1]),
      'Polygon ring is not closed',
    );
    invariant(
      new Set(ring.slice(0, -1).map((p) => JSON.stringify(p))).size ===
        ring.length - 1,
      'Polygon ring contains repeated vertices',
    );
    const s = starts[r],
      n = ring.length - 1;
    invariant(!exact.zeroArea(s, s + n), 'Polygon has zero area');
    for (let i = 0; i < n; i++) {
      const a = s + i,
        b = a + 1,
        c = s + ((i + 2) % n);
      invariant(
        !exact.onSegment(a, b, c) && !exact.onSegment(b, c, a),
        'Polygon adjacent edges overlap',
      );
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        invariant(
          !exact.touch(a, b, s + j, s + j + 1),
          'Polygon ring intersects itself',
        );
      }
    }
  });
  const outer = starts[0],
    outerEnd = outer + input[0].length - 1;
  for (let i = 1; i < input.length; i++) {
    const hole = starts[i],
      holeEnd = hole + input[i].length - 1;
    invariant(
      exact.evenOdd(hole, outer, outerEnd),
      'Polygon hole is outside exterior',
    );
    for (let j = 0; j < i; j++) {
      const previous = starts[j],
        previousEnd = previous + input[j].length - 1;
      for (let a = hole; a < holeEnd; a++) {
        for (let b = previous; b < previousEnd; b++) {
          invariant(
            !exact.touch(a, a + 1, b, b + 1),
            'Polygon rings intersect',
          );
        }
      }
    }
    for (let j = 1; j < i; j++) {
      const previous = starts[j],
        previousEnd = previous + input[j].length - 1;
      invariant(
        !exact.evenOdd(hole, previous, previousEnd) &&
          !exact.evenOdd(previous, hole, holeEnd),
        'Polygon holes overlap',
      );
    }
  }
}
