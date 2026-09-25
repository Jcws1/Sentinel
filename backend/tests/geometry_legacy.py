"""Verbatim baseline (HEAD f98de4f) polygon predicates; tests and probes only.

Used to prove that the exact predicate newly rejects no tracked or stored ring
and to measure decode/validation cost against the original arithmetic. The
bodies are copied unchanged from backend/app/domain/models.py and
backend/app/simulation/validation.py at HEAD; only the model method became a
plain function. Never import this module from application code.
"""
from decimal import Decimal


def legacy_invalid(path, message):
    raise ValueError(message)


# --- backend/app/domain/models.py (HEAD) ------------------------------------------------------
def orientation(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a, b, point):
    return orientation(a, b, point) == 0 and min(a[0], b[0]) <= point[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= point[1] <= max(a[1], b[1])


def intersects(a, b, c, d):
    x, y, z, w = orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)
    opposite = lambda left, right: (left < 0 < right) or (right < 0 < left)
    return (opposite(x, y) and opposite(z, w)) or any((on_segment(a, b, c), on_segment(a, b, d), on_segment(c, d, a), on_segment(c, d, b)))


def inside(point, ring):
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result



def legacy_polygon_problem(coordinates):
    """Baseline core Polygon.valid_rings; raises ValueError like the original."""
    # Explicit planar longitude/latitude geometry. Global wrapping semantics
    # remain an adapter/provider decision; no implicit shortest-edge wrapping.
    # Validate in translated, independently scaled axes. Coordinates remain
    # untouched; the positive affine transform preserves polygon topology
    # while avoiding underflow for finite subnormal/small source geometry.
    points = [point for ring in coordinates for point in ring]
    if not points:
        raise ValueError("polygon rings require positions")
    anchor = points[0]
    sx = max(abs(p[0] - anchor[0]) for p in points) or 1
    sy = max(abs(p[1] - anchor[1]) for p in points) or 1
    rings = ([[((p[0] - anchor[0]) / sx, (p[1] - anchor[1]) / sy) for p in ring] for ring in coordinates]
             if min(sx, sy) < 1e-120 else coordinates)
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1]:
            raise ValueError("polygon rings require at least four positions and closure")
        if len(set(ring[:-1])) != len(ring) - 1:
            raise ValueError("polygon rings must have distinct vertices")
        # Translate first: absolute longitude products cancel for valid tiny
        # polygons far from zero. The geometry/schema semantics are unchanged.
        from math import fsum
        area = fsum(orientation(ring[0], a, b) for a, b in zip(ring, ring[1:]))
        if area == 0:
            raise ValueError("polygon ring has zero area")
        edges = list(zip(ring, ring[1:]))
        for i, (a, b) in enumerate(edges):
            c = edges[(i + 1) % len(edges)][1]
            if on_segment(a, b, c) or on_segment(b, c, a):
                raise ValueError("polygon adjacent edges overlap")
            for j in range(i + 1, len(edges)):
                if j == i + 1 or (i == 0 and j == len(edges) - 1):
                    continue
                if intersects(a, b, *edges[j]):
                    raise ValueError("polygon ring intersects itself")
    outer = rings[0]
    for i, hole in enumerate(rings[1:], 1):
        if not inside(hole[0], outer):
            raise ValueError("polygon hole lies outside exterior")
        for previous in rings[:i]:
            if any(intersects(a, b, c, d) for a, b in zip(hole, hole[1:]) for c, d in zip(previous, previous[1:])):
                raise ValueError("polygon rings intersect or touch")
        for previous in rings[1:i]:
            if inside(hole[0], previous) or inside(previous[0], hole):
                raise ValueError("polygon holes overlap")
    return None


# --- backend/app/simulation/validation.py (HEAD) ----------------------------------------------
def _orientation(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on(a, b, p):
    return _orientation(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def _intersects(a, b, c, d):
    x, y, z, w = _orientation(a, b, c), _orientation(a, b, d), _orientation(c, d, a), _orientation(c, d, b)
    return (x * y < 0 and z * w < 0) or any((_on(a, b, c), _on(a, b, d), _on(c, d, a), _on(c, d, b)))


def validate_ring(ring, path):
    # Decimal conversion of accepted numeric values avoids absolute-coordinate
    # cancellation when a valid small ring is far from the numeric origin.
    points = [tuple(Decimal(str(v)) for v in point) for point in ring]
    if points[0] != points[-1]:
        legacy_invalid(path, "Polygon must be closed")
    if len(set(points[:-1])) != len(points) - 1:
        legacy_invalid(path, "Polygon vertices must be distinct except for closure")
    anchor = points[0]
    if sum(_orientation(anchor, a, b) for a, b in zip(points, points[1:])) == 0:
        legacy_invalid(path, "Zero-area polygon is unsupported by " + "sentinel-simulation-v1-local-1")
    edges = list(zip(points, points[1:]))
    for i, (a, b) in enumerate(edges):
        c = edges[(i + 1) % len(edges)][1]
        if _on(a, b, c) or _on(b, c, a):
            legacy_invalid(path, "Polygon adjacent edges overlap")
        for j in range(i + 1, len(edges)):
            if j == i + 1 or (i == 0 and j == len(edges) - 1):
                continue
            if _intersects(a, b, *edges[j]):
                legacy_invalid(path, "Polygon must not self-intersect")


def inside_polygon(drone, ring):
    point = (drone["longitude_deg"], drone["latitude_deg"])
    # Decimal edge classification is reserved for exact/near-edge candidates;
    # ordinary crossing uses translated arithmetic. No geographic tolerance widens
    # eligibility, and dateline wrapping is not inferred by the planar policy.
    inside = False
    for a, b in zip(ring, ring[1:]):
        cross = _orientation(a, b, point)
        if abs(cross) <= 1e-12:
            da, db, dp = (tuple(Decimal(str(v)) for v in item) for item in (a, b, point))
            if _on(da, db, dp):
                return True
        if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (point[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0]) + a[0]:
            inside = not inside
    return inside
