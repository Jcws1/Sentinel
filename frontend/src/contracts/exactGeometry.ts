/**
 * Exact planar polygon predicates on each coordinate's shortest round-trip
 * decimal spelling (Number#toString, identical to Python repr for every finite
 * double). This mirrors backend/app/domain/geometry.py and its numeric model.
 *
 * A floating-point filter decides ordinary signs. Its bound combines Shewchuk's
 * orient2d error bound, the at most half-ulp gap between each double and its
 * decimal spelling, and absolute slack for gradual underflow. Any sign it cannot
 * certify (including zero, overflow and NaN intermediates) is recomputed exactly
 * with BigInt on the decimal values at one common power-of-ten scale. There is
 * no tolerance, normalization or minimum feature size; coordinates are unchanged.
 */
type Point = readonly number[];

const EPS = 2 ** -53;
const ERR = (3 + 16 * EPS) * EPS;
const SPELLING_FLOOR = 2 ** -1073;
const UNDERFLOW = 2 ** -1060;
const SAFETY = 1 + 2 ** -20;

export function decimalParts(value: number): [bigint, number] {
  if (!Number.isFinite(value))
    throw new Error('Polygon coordinate is not finite');
  const text = String(value);
  const e = text.indexOf('e');
  const mantissa = e < 0 ? text : text.slice(0, e);
  const dot = mantissa.indexOf('.');
  const digits =
    dot < 0 ? mantissa : mantissa.slice(0, dot) + mantissa.slice(dot + 1);
  const fraction = dot < 0 ? 0 : mantissa.length - dot - 1;
  return [BigInt(digits), (e < 0 ? 0 : Number(text.slice(e + 1))) - fraction];
}

/** Error bound for (b-a)x(c-a), including the decimal-spelling perturbation. */
function orientationBound(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  left: number,
  right: number,
) {
  const eu1 = (Math.abs(bx) + Math.abs(ax)) * EPS + SPELLING_FLOOR;
  const ev2 = (Math.abs(cy) + Math.abs(ay)) * EPS + SPELLING_FLOOR;
  const eu2 = (Math.abs(by) + Math.abs(ay)) * EPS + SPELLING_FLOOR;
  const ev1 = (Math.abs(cx) + Math.abs(ax)) * EPS + SPELLING_FLOOR;
  const spelling =
    Math.abs(bx - ax) * ev2 +
    Math.abs(cy - ay) * eu1 +
    eu1 * ev2 +
    Math.abs(by - ay) * ev1 +
    Math.abs(cx - ax) * eu2 +
    eu2 * ev1;
  return (ERR * (Math.abs(left) + Math.abs(right)) + spelling) * SAFETY;
}

/** Points of one polygon with lazily prepared exact integer coordinates. */
export class ExactPoints {
  private x?: bigint[];
  private y?: bigint[];
  constructor(readonly points: readonly Point[]) {}

  private exact() {
    if (!this.x) {
      const parts = this.points.map((p) => [
        decimalParts(p[0]),
        decimalParts(p[1]),
      ]);
      let exponent = Infinity;
      for (const [a, b] of parts) exponent = Math.min(exponent, a[1], b[1]);
      const scale = (part: [bigint, number]) =>
        part[0] * 10n ** BigInt(part[1] - exponent);
      this.x = parts.map(([a]) => scale(a));
      this.y = parts.map(([, b]) => scale(b));
    }
    return [this.x, this.y!] as const;
  }

  /** Exact sign of the orientation of points i, j, k. */
  sign(i: number, j: number, k: number): -1 | 0 | 1 {
    const a = this.points[i],
      b = this.points[j],
      c = this.points[k];
    const left = (b[0] - a[0]) * (c[1] - a[1]),
      right = (b[1] - a[1]) * (c[0] - a[0]),
      det = left - right;
    const bound =
      orientationBound(a[0], a[1], b[0], b[1], c[0], c[1], left, right) +
      UNDERFLOW;
    if (det > bound) return 1;
    if (det < -bound) return -1;
    const [x, y] = this.exact();
    const exact = (x[j] - x[i]) * (y[k] - y[i]) - (y[j] - y[i]) * (x[k] - x[i]);
    return exact > 0n ? 1 : exact < 0n ? -1 : 0;
  }

  /** Whether the exact twice-signed area of the closed ring [start, end] is zero. */
  zeroArea(start: number, end: number) {
    const anchor = this.points[start];
    let sum = 0,
      magnitude = 0,
      bound = 0;
    for (let i = start; i < end; i++) {
      const a = this.points[i],
        b = this.points[i + 1];
      const left = (a[0] - anchor[0]) * (b[1] - anchor[1]),
        right = (a[1] - anchor[1]) * (b[0] - anchor[0]);
      sum += left - right;
      magnitude += Math.abs(left - right);
      bound +=
        orientationBound(
          anchor[0],
          anchor[1],
          a[0],
          a[1],
          b[0],
          b[1],
          left,
          right,
        ) + UNDERFLOW;
    }
    const total = (bound + (end - start + 1) * EPS * magnitude) * SAFETY;
    if (Math.abs(sum) > total) return false;
    const [x, y] = this.exact();
    let exact = 0n;
    for (let i = start; i < end; i++)
      exact +=
        (x[i] - x[start]) * (y[i + 1] - y[start]) -
        (y[i] - y[start]) * (x[i + 1] - x[start]);
    return exact === 0n;
  }

  /** Bounding-box test; exact because decimal spellings order like doubles. */
  private within(a: number, b: number, p: number) {
    const [pa, pb, pp] = [this.points[a], this.points[b], this.points[p]];
    return (
      Math.min(pa[0], pb[0]) <= pp[0] &&
      pp[0] <= Math.max(pa[0], pb[0]) &&
      Math.min(pa[1], pb[1]) <= pp[1] &&
      pp[1] <= Math.max(pa[1], pb[1])
    );
  }

  onSegment(a: number, b: number, p: number) {
    return this.within(a, b, p) && this.sign(a, b, p) === 0;
  }

  /** Proper crossing or any contact between segments a-b and c-d. */
  touch(a: number, b: number, c: number, d: number) {
    const [pa, pb, pc, pd] = [
      this.points[a],
      this.points[b],
      this.points[c],
      this.points[d],
    ];
    // Disjoint bounding boxes share no point; exact for the same reason as within().
    if (
      Math.max(pa[0], pb[0]) < Math.min(pc[0], pd[0]) ||
      Math.max(pc[0], pd[0]) < Math.min(pa[0], pb[0]) ||
      Math.max(pa[1], pb[1]) < Math.min(pc[1], pd[1]) ||
      Math.max(pc[1], pd[1]) < Math.min(pa[1], pb[1])
    )
      return false;
    const x = this.sign(a, b, c),
      y = this.sign(a, b, d);
    // Both endpoints strictly on one side: no crossing and no contact.
    if (x * y > 0) return false;
    const z = this.sign(c, d, a),
      w = this.sign(c, d, b);
    if (x * y < 0 && z * w < 0) return true;
    return (
      (x === 0 && this.within(a, b, c)) ||
      (y === 0 && this.within(a, b, d)) ||
      (z === 0 && this.within(c, d, a)) ||
      (w === 0 && this.within(c, d, b))
    );
  }

  /** Even-odd containment of point p in the closed ring [start, end]. */
  evenOdd(p: number, start: number, end: number) {
    const py = this.points[p][1];
    let inside = false;
    for (let i = start; i < end; i++) {
      const ay = this.points[i][1],
        by = this.points[i + 1][1];
      if (ay > py === by > py) continue;
      const turn = this.sign(i, i + 1, p);
      if (by > ay ? turn > 0 : turn < 0) inside = !inside;
    }
    return inside;
  }
}
