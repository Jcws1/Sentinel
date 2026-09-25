"""Exact polygon topology: shared vectors, three-way parity and randomized differential tests.

The oracle (geometry_oracle.py) is independent rational arithmetic on each
coordinate's shortest round-trip decimal. The same vector file is consumed by
frontend/tests/unit/exactGeometry.test.ts. Seeds and iteration counts are fixed;
set SENTINEL_GEOMETRY_ITERATIONS for a longer optional differential run.
"""
import json
import math
import os
import random
from pathlib import Path

import pytest

import geometry_oracle as oracle
import geometry_vectors
from app.domain import geometry
from app.domain.models import Polygon
from app.domain.geometry import PreparedRing
from app.simulation.validation import SimulationError, inside_polygon, validate_ring

ROOT = Path(__file__).resolve().parents[2]
VECTORS = json.loads((ROOT / "frontend/tests/fixtures/geometry/polygon-vectors.v1.json").read_text(encoding="utf-8"))
SEEDS = (20260924, 5, 1789)
ITERATIONS = int(os.environ.get("SENTINEL_GEOMETRY_ITERATIONS", "400"))


def external_accepts(ring):
    try:
        validate_ring(ring, ("area", "polygon"))
        return True
    except SimulationError:
        return False


def core_accepts(rings):
    try:
        Polygon.model_validate_json(json.dumps(dict(type="Polygon", coordinates=rings)))
        return True
    except ValueError:
        return False


def test_vector_file_is_current_and_matches_oracle():
    assert VECTORS == json.loads(json.dumps(geometry_vectors.build()))


@pytest.mark.parametrize("case", VECTORS["rings"], ids=lambda case: case["id"])
def test_shared_ring_vector_three_way_backend(case):
    ring, valid = case["ring"], case["expected"] == "valid"
    assert oracle.ring_reason(ring) == case["reason"]
    assert geometry.ring_violation(ring) == case["reason"]
    assert external_accepts(ring) is valid
    assert core_accepts([ring]) is valid


@pytest.mark.parametrize("case", VECTORS["polygons"], ids=lambda case: case["id"])
def test_shared_polygon_vector_core(case):
    assert oracle.polygon_reason(case["rings"]) == case["reason"]
    assert geometry.polygon_violation(case["rings"]) == case["reason"]
    assert core_accepts(case["rings"]) is (case["expected"] == "valid")


@pytest.mark.parametrize("case", VECTORS["containment"], ids=lambda case: case["id"])
def test_shared_containment_vector_resolver(case):
    x, y = case["point"]
    assert oracle.contains_inclusive(case["ring"], case["point"]) is case["inside"]
    assert inside_polygon(dict(longitude_deg=x, latitude_deg=y), case["ring"]) is case["inside"]
    assert PreparedRing(case["ring"]).contains(x, y) is case["inside"]


def test_decimal_parts_are_exact_for_every_repr_form():
    for value in (0.0, -0.0, 5e-324, 1e-7, 1.5e300, 179.99999999999997, 0.30000000000000004, -123.456, 10, -3):
        mantissa, exponent = geometry.decimal_parts(value)
        assert oracle.value(value) == mantissa * oracle.value(10) ** exponent
    for bad in (math.inf, -math.inf, math.nan):
        with pytest.raises(ValueError):
            geometry.decimal_parts(bad)
    with pytest.raises(TypeError):
        geometry.decimal_parts(True)


# --- Randomized differential tests against the independent oracle -------------------------------

SCALES = [1.0, 1e-3, 1e-9, 1e-17, 1e-60, 1e-150, 1e-170, 1e-300, 1e-310, 1e-320, 5e-324]


def ulps(value, rng, count=3):
    for _ in range(rng.randrange(count + 1)):
        value = math.nextafter(value, rng.choice((-math.inf, math.inf)))
    return value


def clamp(x, y):
    return max(-180.0, min(180.0, x)), max(-90.0, min(90.0, y))


def random_ring(rng):
    """Adversarial families: tiny local features, near-collinear turns, spikes and crossings."""
    family = rng.randrange(6)
    if family == 0:  # R3-1 family: tiny turn inside an ordinary square, perturbed by ulps
        s = rng.choice(SCALES[2:])
        a, b = rng.uniform(0.5, 3), rng.uniform(-3, 3)
        pts = [(0.0, 0.0), (a * s, abs(b) * s), (rng.uniform(0, 2) * s, b * s), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    elif family == 1:  # near-collinear consecutive vertices at a random magnitude/offset
        x0 = rng.choice((0.0, 1.0, 103.8, 179.99999999999997, -180.0, 45.123456789))
        y0 = rng.choice((0.0, -33.9461, 1.3, 89.999999999))
        dx, dy = rng.uniform(-1, 1) * rng.choice(SCALES[:6]), rng.uniform(-1, 1) * rng.choice(SCALES[:6])
        t = rng.choice((0.5, 2.0, -1.0, 1.5, rng.uniform(-2, 3)))
        pts = [(x0, y0), (x0 + dx, y0 + dy), (x0 + t * dx, y0 + t * dy), (x0 + dx - dy, y0 + dy + dx)]
    elif family == 2:  # decimal spellings with 15-17 significant digits
        base = [(rng.randrange(-9999, 9999) / 1000, rng.randrange(-8999, 8999) / 1000) for _ in range(3)]
        mid = ((base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2)
        pts = [base[0], base[1], mid if rng.random() < .5 else base[2], base[2]]
    elif family == 3:  # random small polygon, integer grid, crossings and touches common
        n = rng.randrange(3, 8)
        pts = [(rng.randrange(-3, 4) * 1.0, rng.randrange(-3, 4) * 1.0) for _ in range(n)]
    elif family == 4:  # mixed exponents per coordinate
        pts = [(rng.choice((-1, 1)) * rng.random() * rng.choice(SCALES), rng.choice((-1, 1)) * rng.random() * rng.choice(SCALES))
               for _ in range(rng.randrange(3, 7))]
    else:  # large longitude one-ulp structures
        x = ulps(179.99999999999994, rng, 4)
        u = math.ulp(x)
        pts = [(x, 0.0), (x + u * rng.randrange(1, 4), rng.choice((0.0, u, 5e-324))), (x + u * rng.randrange(0, 3), 1.0),
               (x - u * rng.randrange(0, 3), rng.choice((0.5, u, 0.0)))]
    pts = [clamp(ulps(x, rng), ulps(y, rng)) for x, y in pts]
    return [list(p) for p in pts] + [list(pts[0])]


@pytest.mark.parametrize("seed", SEEDS)
def test_segment_contact_matches_the_oracle_including_touching_boxes(seed):
    """Small integer quadruples hit shared endpoints, collinear overlaps and boxes that only touch."""
    rng = random.Random(seed)
    contacts = 0
    for _ in range(4000):
        points = [(rng.randint(-3, 3), rng.randint(-3, 3)) for _ in range(4)]
        expected = oracle.touch(*(oracle.point(p) for p in points))
        assert geometry.segments_touch(*points) == expected, points
        contacts += expected
    assert 0 < contacts < 4000


@pytest.mark.parametrize("seed", SEEDS)
def test_randomized_ring_differential_against_oracle(seed):
    rng = random.Random(seed)
    checked = invalid = 0
    for _ in range(ITERATIONS):
        ring = random_ring(rng)
        expected = oracle.ring_reason(ring)
        assert geometry.ring_violation(ring) == expected, ring
        assert external_accepts(ring) is (expected is None), ring
        assert core_accepts([ring]) is (expected is None), ring
        checked += 1
        invalid += expected is not None
    # Both outcomes are exercised; the families are adversarial, not merely random.
    assert 0 < invalid < checked


@pytest.mark.parametrize("seed", SEEDS)
def test_randomized_containment_differential_against_oracle(seed):
    rng = random.Random(seed ^ 0x5F5E1)
    for _ in range(ITERATIONS):
        ring = random_ring(rng)
        if oracle.ring_reason(ring) is not None:
            continue
        prepared = PreparedRing(ring)
        a, b = ring[rng.randrange(len(ring) - 1)], ring[rng.randrange(len(ring) - 1)]
        t = rng.choice((0.0, 0.5, 1.0, rng.random()))
        x = ulps(a[0] + t * (b[0] - a[0]), rng, 2)
        y = ulps(a[1] + t * (b[1] - a[1]), rng, 2)
        x, y = clamp(x, y)
        assert prepared.contains(x, y) is oracle.contains_inclusive(ring, [x, y]), (ring, x, y)
