"""Builds the shared polygon vectors consumed by pytest and Vitest.

Run ``python backend/tests/geometry_vectors.py`` from the repository root to
rewrite ``frontend/tests/fixtures/geometry/polygon-vectors.v1.json``, then format
it with ``npm --prefix frontend exec prettier -- --write <file>``. Every
expected verdict comes from the independent exact oracle; each case also states
its intended verdict and generation fails if the oracle disagrees.
Coordinates stay within longitude/latitude ranges so all three validators apply.
"""
import itertools
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geometry_oracle as oracle

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "frontend/tests/fixtures/geometry/polygon-vectors.v1.json"
NUMERIC_MODEL = ("Each finite coordinate is the exact rational value of its shortest round-trip decimal spelling "
                 "(Python repr(float) / ECMAScript Number#toString); topology is exact on those values.")


def closed(*points):
    return [list(p) for p in points] + [list(points[0])]


def notch(scale, x0=0.0, y0=0.0, width=1.0):
    """Valid unit-scale square with one tiny local turn near its first corner (R3-1 shape)."""
    s = scale
    return closed((x0, y0), (x0 + 2 * s, y0 + 2 * s), (x0 + s, y0), (x0 + width, y0),
                  (x0 + width, y0 + width), (x0, y0 + width))


def square(size, x0=0.0, y0=0.0):
    return closed((x0, y0), (x0 + size, y0), (x0 + size, y0 + size), (x0, y0 + size))


def ring_cases():
    cases = [
        ("r1-uniform-tiny-square", "historical", closed((0, 0), (1e-170, 0), (1e-170, 1e-170), (0, 1e-170)), "valid",
         "Phase 5 critic round 1: uniform 1e-170 square underflowed downstream"),
        ("r2-small-crossing", "historical", closed((0, 0), (3e-100, 3e-100), (0, 3e-100), (2e-100, 0)), "self-intersection",
         "Phase 5 critic round 2: product underflow hid a crossing"),
        ("r3-1-mixed-scale", "historical", closed((0, 0), (2e-170, 2e-170), (1e-170, 0), (1, 0), (1, 1), (0, 1)), "valid",
         "Phase 5 critic round 3 R3-1: HTTP 500 in the core after external acceptance"),
        ("r3-1-control-1e-100", "historical", closed((0, 0), (2e-100, 2e-100), (1e-100, 0), (1, 0), (1, 1), (0, 1)), "valid",
         "R3-1 control that passed before"),
        ("closure-decimal-spike-valid", "decimal-view",
         closed((0, 0), (0.6000000000000001, 2), (0.30000000000000004, 1), (-1, 1)), "valid",
         "Exactly collinear in binary but not in the decimal view: the core previously returned HTTP 500"),
        ("closure-decimal-collinear-spike", "decimal-view", closed((0, 0), (0.3, 3), (0.1, 1), (-1, 1)), "adjacent-overlap",
         "(0.1, 1) lies exactly on (0, 0)-(0.3, 3) in the decimal view"),
        ("tie-coordinate-square", "decimal-view", square(1.0000076293945312), "valid",
         "131073/131072 has two equally near 17-digit spellings; both runtimes choose ...312"),
        ("bowtie", "crossing", closed((0, 0), (1, 1), (1, 0), (0, 1)), "zero-area",
         "The symmetric bowtie's signed area cancels exactly, so area is checked first"),
        ("asymmetric-bowtie", "crossing", closed((0, 0), (2, 2), (2, 0), (0, 1)), "self-intersection", None),
        ("vertex-touches-edge", "touching", closed((0, 0), (4, 0), (4, 2), (2, 0), (0, 2)), "self-intersection", None),
        ("repeated-vertex-figure-eight", "touching", closed((0, 0), (2, 0), (1, 1), (2, 2), (0, 2), (1, 1)), "duplicate-vertex", None),
        ("collinear-triangle", "zero-area", closed((0, 0), (1, 0), (2, 0)), "zero-area", None),
        ("there-and-back", "zero-area", closed((0, 0), (1, 1), (2, 2), (1, 1)), "duplicate-vertex", None),
        ("straight-through-vertex", "near-collinear", closed((0, 0), (1, 1), (2, 2), (2, 0)), "valid",
         "A collinear continuation is not an overlap"),
        ("backtracking-spike", "near-collinear", closed((0, 0), (2, 2), (1, 1), (2, 0)), "adjacent-overlap", None),
        ("unclosed", "structure", [[0, 0], [1, 0], [1, 1], [0, 1]], "unclosed", None),
        ("duplicate-consecutive", "structure", closed((0, 0), (1, 0), (1, 0), (0, 1)), "duplicate-vertex", None),
        ("negative-zero-closure", "structure", [[-0.0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], "valid",
         "-0 and 0 are the same coordinate"),
        ("minimum-subnormal-square", "subnormal", square(5e-324), "valid", None),
        ("subnormal-square", "subnormal", square(1e-310), "valid", None),
    ]
    for exponent in (-10, -50, -100, -150, -200, -250, -300, -307, -308, -310, -315, -320, -322, -323):
        s = float(f"1e{exponent}")
        cases.append((f"mixed-scale-notch-1e{exponent}", "mixed-scale", notch(s), "valid", None))
        cases.append((f"uniform-tiny-square-1e{exponent}", "uniform-tiny", square(s), "valid", None))
    cases.append(("mixed-scale-notch-5e-324", "mixed-scale", notch(5e-324), "valid", None))
    # Tiny crossing inside an ordinary ring: the local turn crosses back over the first edge.
    for exponent in (-20, -170, -310):
        s = float(f"1e{exponent}")
        cases.append((f"mixed-scale-crossing-1e{exponent}", "mixed-scale",
                      closed((0, 0), (2 * s, 2 * s), (0, 2 * s), (2 * s, 0), (1, 0), (1, 1), (-1, 1)), "self-intersection", None))
        cases.append((f"mixed-scale-turn-below-axis-1e{exponent}", "mixed-scale",
                      closed((0, 0), (2 * s, s), (s, -s), (1, 0), (1, 1), (0, 1)), "valid", None))
        cases.append((f"mixed-scale-backtrack-1e{exponent}", "mixed-scale",
                      closed((0, 0), (2 * s, 0), (s, 0), (1, 1), (0, 1)), "adjacent-overlap", None))
    # Large longitudes: features near the double spacing of 180 degrees.
    u = math.ulp(179.99999999999997)
    cases += [
        ("large-longitude-ulp-square", "large-longitude",
         closed((179.99999999999994, 10), (179.99999999999997, 10), (179.99999999999997, 10.000000000000002),
                (179.99999999999994, 10.000000000000002)), "valid", None),
        ("large-longitude-mixed-notch", "large-longitude", notch(1e-13, x0=179.0, y0=-89.0, width=0.5), "valid", None),
        ("large-longitude-west-notch", "large-longitude", notch(1e-12, x0=-180.0, y0=45.0, width=0.25), "valid", None),
        ("large-longitude-collinear-backtrack", "large-longitude",
         closed((179.99999999999991, 0), (179.99999999999997, 0), (179.99999999999994, 0), (179.99999999999994, 1)),
         "adjacent-overlap", None),
        ("large-longitude-one-ulp-turn", "large-longitude",
         closed((179.99999999999991, 0), (179.99999999999997, 0), (179.99999999999994, u), (179.99999999999994, 1)),
         "valid", "A one-ulp turn is a real turn"),
        ("large-longitude-with-subnormal-latitude", "large-longitude",
         closed((179.5, 0), (180, 0), (180, 5e-324), (179.5, 1e-323)), "valid", None),
    ]
    return cases


def polygon_cases():
    outer = square(10)
    return [
        ("valid-hole", [outer, square(2, 4, 4)], "valid"),
        ("hole-touching-exterior", [outer, closed((1, 4), (0, 5), (1, 6))], "rings-intersect"),
        ("hole-outside", [outer, square(1, 20, 20)], "hole-outside"),
        ("crossing-holes", [outer, square(4, 2, 2), square(4, 4, 4)], "rings-intersect"),
        ("nested-holes", [outer, square(6, 2, 2), square(1, 4, 4)], "holes-overlap"),
        ("mixed-scale-hole", [closed((-5, -5), (5, -5), (5, 5), (-5, 5)), notch(1e-300)], "valid"),
        ("subnormal-hole-in-tiny-exterior", [square(1e-300), square(5e-324, 1e-310, 1e-310)], "valid"),
        ("five-disjoint-holes", [outer] + [square(2, x, y) for x, y in ((1, 1), (4, 1), (7, 1), (1, 4), (4, 4))], "valid"),
        # The third hole encloses the first and touches the second: every contact is checked before
        # any overlap, so the contact is the first violation (critic round 2, L1).
        ("third-hole-touch-reported-before-overlap",
         [outer, square(3, 1, 1), closed((4.5, 1), (6, 1), (6, 2), (4.5, 2)), square(4, 0.5, 0.5)], "rings-intersect"),
        ("third-hole-nested-without-contact", [outer, square(4, 1, 1), square(1, 6, 6), square(1, 2, 2)], "holes-overlap"),
        ("fourth-hole-outside", [outer, square(1, 1, 1), square(1, 3, 3), square(1, 5, 5), square(1, 20, 20)], "hole-outside"),
    ] + hole_order_cases()


def interleaved_reason(rings):
    """The superseded frontend order (per earlier ring: contact, then overlap); used only to prove
    that the hole-order family contains polygons whose first violation depends on the order."""
    exact = [[oracle.point(p) for p in ring] for ring in rings]
    for i, hole in enumerate(exact[1:], 1):
        if not oracle.even_odd(hole[0], exact[0]):
            return "hole-outside"
        for j, other in enumerate(exact[:i]):
            if any(oracle.touch(hole[k], hole[k + 1], other[m], other[m + 1])
                   for k in range(len(hole) - 1) for m in range(len(other) - 1)):
                return "rings-intersect"
            if j > 0 and (oracle.even_odd(hole[0], other) or oracle.even_odd(other[0], hole)):
                return "holes-overlap"
    return None


def hole_order_cases():
    """Every order of four holes with mixed relations (one encloses another and touches a third; one
    is disjoint), at unit and 1e-300 scale, so the first violation depends on the order of hole checks.
    Expected reasons come from the oracle; generation fails unless several cases depend on that order."""
    holes = [square(3, 1, 1), closed((4.5, 1), (6, 1), (6, 2), (4.5, 2)), square(4, 0.5, 0.5), square(1, 7, 7)]
    cases = []
    for scale, label in ((1, "unit"), (1e-300, "tiny")):
        scaled = [[[x * scale, y * scale] for x, y in ring] for ring in [square(10)] + holes]
        for order in itertools.permutations(range(1, 5)):
            name = f"hole-order-{label}-{''.join(str(i) for i in order)}"
            cases.append((name, [scaled[0]] + [scaled[i] for i in order], "oracle"))
    order_dependent = sum(interleaved_reason(rings) != oracle.polygon_reason(rings) for _, rings, _ in cases)
    if order_dependent < 4:
        raise SystemExit(f"hole-order family has only {order_dependent} order-dependent cases")
    return cases


def containment_cases():
    golden = [[103.8, 1.3], [103.9, 1.3], [103.9, 1.4], [103.8, 1.4], [103.8, 1.3]]
    long_edge = [[-170, -80], [170.3, 80.7], [-170, 80], [-170, -80]]
    slanted = [[0, 0], [0.3, 3], [-1, 3], [0, 0]]
    tiny = [[0, 0], [2e-170, 2e-170], [1e-170, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
    return [
        ("golden-center", golden, [103.85, 1.35], True),
        ("golden-vertex", golden, [103.8, 1.3], True),
        ("golden-west-edge", golden, [103.8, 1.35], True),
        ("golden-just-west", golden, [103.8 - 1e-10, 1.35], False),
        ("golden-one-ulp-west", golden, [math.nextafter(103.8, -math.inf), 1.35], False),
        ("golden-one-ulp-inside", golden, [math.nextafter(103.8, math.inf), 1.35], True),
        ("slanted-decimal-edge-point", slanted, [0.1, 1], True),
        ("slanted-just-right", slanted, [0.10000000000000002, 1], False),
        ("long-edge-near-miss", long_edge, [-3.991293408785402, -1.6056445806400745], False),
        ("long-edge-inside", long_edge, [-5, 0], True),
        ("tiny-notch-inside", tiny, [3e-170, 0.5e-170], True),
        ("tiny-notch-cut-out", tiny, [1.5e-170, 1.2e-170], False),
        ("tiny-notch-apex", tiny, [2e-170, 2e-170], True),
        ("tiny-notch-outside-gap", tiny, [1e-170, 0.5e-170], False),
        ("unit-square-center-of-r3-1", tiny, [0.5, 0.5], True),
        ("antimeridian-edge", [[179, -1], [180, -1], [180, 1], [179, 1], [179, -1]], [180, 0], True),
    ]


def build():
    rings = []
    for name, category, ring, intent, note in ring_cases():
        reason = oracle.ring_reason(ring)
        expected = "valid" if reason is None else "invalid"
        if (intent == "valid") != (reason is None) or (intent not in ("valid", "invalid") and reason != intent):
            raise SystemExit(f"{name}: oracle says {reason!r}, intended {intent!r}")
        row = dict(id=name, category=category, ring=ring, expected=expected, reason=reason)
        if note:
            row["note"] = note
        rings.append(row)
    polygons = []
    for name, rings_value, intent in polygon_cases():
        reason = oracle.polygon_reason(rings_value)
        if intent != "oracle" and ((intent == "valid") != (reason is None) or (intent != "valid" and reason != intent)):
            raise SystemExit(f"{name}: oracle says {reason!r}, intended {intent!r}")
        polygons.append(dict(id=name, rings=rings_value, expected="valid" if reason is None else "invalid", reason=reason))
    containment = []
    for name, ring, point, intent in containment_cases():
        inside = oracle.contains_inclusive(ring, point)
        if inside != intent:
            raise SystemExit(f"{name}: oracle says {inside}, intended {intent}")
        containment.append(dict(id=name, ring=ring, point=point, inside=inside))
    return dict(schema="sentinel-polygon-vectors-v1", numericModel=NUMERIC_MODEL,
                generator="backend/tests/geometry_vectors.py", oracle="backend/tests/geometry_oracle.py",
                rings=rings, polygons=polygons, containment=containment)


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes((json.dumps(build(), indent=1) + "\n").encode("utf-8"))  # LF on every platform
    print(f"wrote {OUTPUT.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
