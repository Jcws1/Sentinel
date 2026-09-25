import { describe, expect, it } from 'vitest';
import { polygonIntegrity } from '../../src/contracts/integrity';
import { decimalParts, ExactPoints } from '../../src/contracts/exactGeometry';
import vectors from '../fixtures/geometry/polygon-vectors.v1.json';

type Point = number[];
type Ring = Point[];
/** Frontend messages mapped to the backend's reason codes (geometry.py). */
const REASONS: Record<string, string> = {
  'Polygon ring is not closed': 'unclosed',
  'Polygon ring contains repeated vertices': 'duplicate-vertex',
  'Polygon has zero area': 'zero-area',
  'Polygon adjacent edges overlap': 'adjacent-overlap',
  'Polygon ring intersects itself': 'self-intersection',
  'Polygon hole is outside exterior': 'hole-outside',
  'Polygon rings intersect': 'rings-intersect',
  'Polygon holes overlap': 'holes-overlap',
};
const reason = (rings: Ring[]) => {
  try {
    polygonIntegrity(rings);
    return null;
  } catch (error) {
    const message = (error as Error).message;
    return REASONS[message] ?? message;
  }
};
const accepts = (rings: Ring[]) => reason(rings) === null;

/**
 * Independent oracle: each coordinate is the rational value of its shortest
 * round-trip decimal spelling, kept as an unnormalized BigInt fraction. It
 * shares no code with exactGeometry.ts and uses textbook predicates only.
 */
type Q = [bigint, bigint];
const q = (value: number): Q => {
  const [digits, exponent] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = digits.split('.');
  const shift = Number(exponent ?? 0) - fraction.length;
  const numerator = BigInt(whole + fraction);
  return shift >= 0
    ? [numerator * 10n ** BigInt(shift), 1n]
    : [numerator, 10n ** BigInt(-shift)];
};
const sub = (a: Q, b: Q): Q => [a[0] * b[1] - b[0] * a[1], a[1] * b[1]];
const mul = (a: Q, b: Q): Q => [a[0] * b[0], a[1] * b[1]];
const sgn = (a: Q) => (a[0] === 0n ? 0 : a[0] > 0n === a[1] > 0n ? 1 : -1);
const cmp = (a: Q, b: Q) => sgn(sub(a, b));
const cross = (a: Q[], b: Q[], c: Q[]) =>
  sgn(
    sub(
      mul(sub(b[0], a[0]), sub(c[1], a[1])),
      mul(sub(b[1], a[1]), sub(c[0], a[0])),
    ),
  );
const between = (a: Q[], b: Q[], p: Q[]) =>
  [0, 1].every((k) => {
    const [lo, hi] = cmp(a[k], b[k]) <= 0 ? [a[k], b[k]] : [b[k], a[k]];
    return cmp(lo, p[k]) <= 0 && cmp(p[k], hi) <= 0;
  });
const onSegment = (a: Q[], b: Q[], p: Q[]) =>
  cross(a, b, p) === 0 && between(a, b, p);
const touch = (a: Q[], b: Q[], c: Q[], d: Q[]) =>
  (cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0) ||
  onSegment(a, b, c) ||
  onSegment(a, b, d) ||
  onSegment(c, d, a) ||
  onSegment(c, d, b);
/** First violation in the backend's order (closure, duplicates, area, edges). */
function oracleReason(ring: Ring) {
  const p = ring.map((point) => point.map(q));
  const same = (a: Q[], b: Q[]) =>
    cmp(a[0], b[0]) === 0 && cmp(a[1], b[1]) === 0;
  if (p.length < 4 || !same(p[0], p[p.length - 1])) return 'unclosed';
  const n = p.length - 1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (same(p[i], p[j])) return 'duplicate-vertex';
  let area: Q = [0n, 1n];
  for (let i = 0; i < n; i++) {
    const a = p[0],
      b = p[i],
      c = p[i + 1];
    const term = sub(
      mul(sub(b[0], a[0]), sub(c[1], a[1])),
      mul(sub(b[1], a[1]), sub(c[0], a[0])),
    );
    area = [area[0] * term[1] + term[0] * area[1], area[1] * term[1]];
  }
  if (sgn(area) === 0) return 'zero-area';
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [p[i], p[i + 1], p[(i + 2) % n]];
    if (onSegment(a, b, c) || onSegment(b, c, a)) return 'adjacent-overlap';
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (touch(a, b, p[j], p[j + 1])) return 'self-intersection';
    }
  }
  return null;
}
const oracleValid = (ring: Ring) => oracleReason(ring) === null;

/** Deterministic PRNG (mulberry32); seeds are reported in the test names. */
function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const SCALES = [
  1, 1e-3, 1e-9, 1e-17, 1e-60, 1e-150, 1e-170, 1e-300, 1e-310, 1e-320, 5e-324,
];
const next = (value: number, up: boolean) => {
  if (value === 0) return up ? 5e-324 : -5e-324;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, value > 0 === up ? bits + 1n : bits - 1n);
  return view.getFloat64(0);
};
function ringFor(rand: () => number): Ring {
  const pick = <T>(values: readonly T[]) =>
    values[Math.floor(rand() * values.length)];
  const nudge = (value: number) => {
    for (let i = Math.floor(rand() * 4); i > 0; i--)
      value = next(value, rand() < 0.5);
    return value;
  };
  const family = Math.floor(rand() * 6);
  let points: Point[];
  if (family === 0) {
    const s = pick(SCALES.slice(2)),
      a = 0.5 + rand() * 2.5,
      b = rand() * 6 - 3;
    points = [
      [0, 0],
      [a * s, Math.abs(b) * s],
      [rand() * 2 * s, b * s],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
  } else if (family === 1) {
    const x0 = pick([0, 1, 103.8, 179.99999999999997, -180, 45.123456789]),
      y0 = pick([0, -33.9461, 1.3, 89.999999999]);
    const dx = (rand() * 2 - 1) * pick(SCALES.slice(0, 6)),
      dy = (rand() * 2 - 1) * pick(SCALES.slice(0, 6)),
      t = pick([0.5, 2, -1, 1.5, rand() * 5 - 2]);
    points = [
      [x0, y0],
      [x0 + dx, y0 + dy],
      [x0 + t * dx, y0 + t * dy],
      [x0 + dx - dy, y0 + dy + dx],
    ];
  } else if (family === 2) {
    const base = Array.from({ length: 3 }, () => [
      Math.round(rand() * 19998 - 9999) / 1000,
      Math.round(rand() * 17998 - 8999) / 1000,
    ]);
    const mid = [(base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2];
    points = [base[0], base[1], rand() < 0.5 ? mid : base[2], base[2]];
  } else if (family === 3) {
    points = Array.from({ length: 3 + Math.floor(rand() * 5) }, () => [
      Math.floor(rand() * 7) - 3,
      Math.floor(rand() * 7) - 3,
    ]);
  } else if (family === 4) {
    points = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => [
      (rand() < 0.5 ? -1 : 1) * rand() * pick(SCALES),
      (rand() < 0.5 ? -1 : 1) * rand() * pick(SCALES),
    ]);
  } else {
    let x = 179.99999999999994;
    for (let i = Math.floor(rand() * 5); i > 0; i--) x = next(x, rand() < 0.5);
    const u = next(x, true) - x;
    points = [
      [x, 0],
      [x + u * (1 + Math.floor(rand() * 3)), pick([0, u, 5e-324])],
      [x + u * Math.floor(rand() * 3), 1],
      [x - u * Math.floor(rand() * 3), pick([0.5, u, 0])],
    ];
  }
  const clamped = points.map(([x, y]) => [
    Math.max(-180, Math.min(180, nudge(x))),
    Math.max(-90, Math.min(90, nudge(y))),
  ]);
  return [...clamped, clamped[0]];
}

describe('exact polygon topology on decimal spellings', () => {
  it.each(vectors.rings.map((c) => [c.id, c] as const))(
    'shared ring vector %s matches the exact oracle',
    (_, c) => {
      expect(accepts([c.ring as Ring])).toBe(c.expected === 'valid');
      expect(oracleValid(c.ring as Ring)).toBe(c.expected === 'valid');
      // Reason parity: the same first violation as the backend and the oracle.
      expect(reason([c.ring as Ring])).toBe(c.reason);
      expect(oracleReason(c.ring as Ring)).toBe(c.reason);
    },
  );

  it.each(vectors.polygons.map((c) => [c.id, c] as const))(
    'shared polygon vector %s matches the exact oracle',
    (_, c) => {
      expect(accepts(c.rings as Ring[])).toBe(c.expected === 'valid');
      expect(reason(c.rings as Ring[])).toBe(c.reason);
    },
  );

  it('parses every Number#toString form exactly', () => {
    expect(decimalParts(0)).toEqual([0n, 0]);
    expect(decimalParts(-0)).toEqual([0n, 0]);
    expect(decimalParts(5e-324)).toEqual([5n, -324]);
    expect(decimalParts(1e-7)).toEqual([1n, -7]);
    expect(decimalParts(1.5e300)).toEqual([15n, 299]);
    expect(decimalParts(1e21)).toEqual([1n, 21]);
    expect(decimalParts(0.30000000000000004)).toEqual([
      30000000000000004n,
      -17,
    ]);
    expect(decimalParts(-123.456)).toEqual([-123456n, -3]);
    expect(decimalParts(131073 / 131072)).toEqual([10000076293945312n, -16]);
    expect(() => decimalParts(Number.NaN)).toThrow('not finite');
    expect(() => decimalParts(Infinity)).toThrow('not finite');
  });

  it('rejects non-finite coordinates instead of accepting NaN comparisons', () => {
    expect(
      accepts([
        [
          [0, 0],
          [Number.NaN, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ]),
    ).toBe(false);
  });

  it('decides huge finite coordinates exactly after filter overflow', () => {
    const big = 1.7e308;
    expect(
      accepts([
        [
          [-big, -big],
          [big, -big],
          [big, big],
          [-big, big],
          [-big, -big],
        ],
      ]),
    ).toBe(true);
    expect(
      accepts([
        [
          [-big, 0],
          [big, 0],
          [0, 0],
          [0, big],
          [-big, 0],
        ],
      ]),
    ).toBe(false);
  });

  it.each([20260924, 5, 1789])(
    'randomized rings agree with the independent oracle (seed %i, 400 rings)',
    (seed) => {
      const rand = random(seed);
      let invalid = 0;
      for (let i = 0; i < 400; i++) {
        const ring = ringFor(rand);
        const expected = oracleReason(ring);
        expect(reason([ring]), JSON.stringify(ring)).toBe(expected);
        if (expected !== null) invalid++;
      }
      expect(invalid).toBeGreaterThan(0);
      expect(invalid).toBeLessThan(400);
    },
  );

  it.each([20260924, 5, 1789])(
    'segment contact matches the oracle, including boxes that only touch (seed %i, 4000 quadruples)',
    (seed) => {
      const rand = random(seed);
      let contacts = 0;
      for (let i = 0; i < 4000; i++) {
        const scale = [1, 1e-300, 1e150][i % 3];
        const points = Array.from({ length: 4 }, () => [
          (Math.floor(rand() * 7) - 3) * scale,
          (Math.floor(rand() * 7) - 3) * scale,
        ]);
        const [a, b, c, d] = points.map((p) => p.map(q));
        const expected = touch(a, b, c, d);
        expect(
          new ExactPoints(points).touch(0, 1, 2, 3),
          JSON.stringify(points),
        ).toBe(expected);
        if (expected) contacts++;
      }
      expect(contacts).toBeGreaterThan(0);
      expect(contacts).toBeLessThan(4000);
    },
  );

  it.each([20260924, 5, 1789])(
    'filtered orientation signs equal exact decimal signs near degeneracy (seed %i, 4000 triples)',
    (seed) => {
      const rand = random(seed);
      let disagreeWithBinary = 0;
      for (let i = 0; i < 4000; i++) {
        const digits = 12 + Math.floor(rand() * 6);
        const spell = (x: number) => Number(x.toPrecision(digits));
        const magnitude = [1, 103.8, 179.99, 1e-150, 1e-310][i % 5];
        const a = [
          spell((rand() * 2 - 1) * magnitude),
          spell((rand() * 2 - 1) * magnitude),
        ];
        const b = [
          spell((rand() * 2 - 1) * magnitude),
          spell((rand() * 2 - 1) * magnitude),
        ];
        const t = [0.5, 2, 3, -1, 0.25, rand() * 4 - 1][i % 6];
        // Binary interpolation: exactly collinear in decimal only by accident.
        const c = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])].map(
          (x) => (rand() < 0.3 ? next(x, rand() < 0.5) : x),
        );
        const points = [a, b, c];
        const exact = cross(
          ...(points.map((p) => p.map(q)) as [Q[], Q[], Q[]]),
        );
        expect(
          new ExactPoints(points).sign(0, 1, 2),
          JSON.stringify(points),
        ).toBe(exact);
        const binary = Math.sign(
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        );
        if (binary !== exact) disagreeWithBinary++;
      }
      // The sample must actually contain cases a naive float sign gets wrong.
      expect(disagreeWithBinary).toBeGreaterThan(0);
    },
  );
});
