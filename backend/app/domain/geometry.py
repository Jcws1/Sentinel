"""Exact planar ring topology on each coordinate's shortest round-trip decimal.

Numeric model (C17 supplement, user-approved 24 September 2026): a finite
coordinate means the exact rational value of its shortest round-trip decimal
spelling -- Python ``repr(float)``, ECMAScript ``Number#toString`` -- which is
what JSON storage and transport carry. For normal inputs with at most 15
significant digits this is the value as written. The frontend integrity check
(``frontend/src/contracts/exactGeometry.ts``) implements the same definition.

Orientation, collinearity, segment contact, adjacent-edge overlap, zero area and
containment are decided with exact integer arithmetic on those values at one
common power-of-ten scale. There is no tolerance, normalization or minimum
feature size, and source coordinates are never changed. Equality and ordering of
the decimal values equal those of the doubles, so closure, distinctness and
bounding-box comparisons use the original numbers.
"""

UNCLOSED = "unclosed"
DUPLICATE = "duplicate-vertex"
ZERO_AREA = "zero-area"
ADJACENT_OVERLAP = "adjacent-overlap"
SELF_INTERSECTION = "self-intersection"
HOLE_OUTSIDE = "hole-outside"
RINGS_TOUCH = "rings-intersect"
HOLES_OVERLAP = "holes-overlap"


def decimal_parts(value):
    """Return ``(mantissa, exponent)`` with value == mantissa * 10**exponent exactly."""
    kind = type(value)
    if kind is int:
        return value, 0
    if kind is not float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("Coordinate must be a finite number")
        return decimal_parts(int(value) if isinstance(value, int) else float(value))
    mantissa, _, exponent = repr(value).partition("e")
    whole, _, fraction = mantissa.partition(".")
    try:
        return int(whole + fraction), (int(exponent) if exponent else 0) - len(fraction)
    except ValueError:  # repr of inf/nan
        raise ValueError("Coordinate must be finite") from None


_POWERS = [10 ** k for k in range(700)]


class ScaledPoints:
    """Integer coordinates of several points at one common decimal exponent."""

    __slots__ = ("exponent", "parts", "_cache")

    def __init__(self, points):
        self.parts = [(decimal_parts(p[0]), decimal_parts(p[1])) for p in points]
        self.exponent = min((e for pair in self.parts for _, e in pair), default=0)
        self._cache = {}

    def at(self, exponent):
        """Coordinates scaled to ``exponent`` (<= every part exponent), cached."""
        scaled = self._cache.get(exponent)
        if scaled is None:
            powers = _POWERS
            scaled = [((mx * powers[ex - exponent]) if ex - exponent < 700 else mx * 10 ** (ex - exponent),
                       (my * powers[ey - exponent]) if ey - exponent < 700 else my * 10 ** (ey - exponent))
                      for (mx, ex), (my, ey) in self.parts]
            self._cache[exponent] = scaled
        return scaled


def orientation(a, b, c):
    """Exact twice-signed area of (a, b, c) on integer coordinates."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a, b, p):
    return (orientation(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def _within(a, b, p):
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def segments_touch(a, b, c, d):
    """Proper crossing or any contact, including collinear overlap and endpoints."""
    if (max(a[0], b[0]) < min(c[0], d[0]) or max(c[0], d[0]) < min(a[0], b[0])
            or max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1])):
        return False  # disjoint bounding boxes share no point; skips the orientation work
    x, y = orientation(a, b, c), orientation(a, b, d)
    if (x > 0 and y > 0) or (x < 0 and y < 0):
        return False  # c and d strictly on one side of line ab: no crossing or contact
    z, w = orientation(c, d, a), orientation(c, d, b)
    if (x < 0 < y or y < 0 < x) and (z < 0 < w or w < 0 < z):
        return True
    return ((x == 0 and _within(a, b, c)) or (y == 0 and _within(a, b, d))
            or (z == 0 and _within(c, d, a)) or (w == 0 and _within(c, d, b)))


def crosses_ray(a, b, p):
    """Half-open horizontal ray crossing used by even-odd containment."""
    if (a[1] > p[1]) == (b[1] > p[1]):
        return False
    turn = orientation(a, b, p)
    return turn > 0 if b[1] > a[1] else turn < 0


def ring_violation(ring, scaled=None):
    """First violation of one closed linear ring in document order, or None.

    Order: closure, distinct vertices, zero area, then for each edge its
    adjacent-edge overlap followed by contact with later non-adjacent edges.
    ``scaled`` may supply integer coordinates for ``ring`` at one exponent.
    """
    if len(ring) < 4 or tuple(ring[0]) != tuple(ring[-1]):
        return UNCLOSED
    if len({tuple(p) for p in ring[:-1]}) != len(ring) - 1:
        return DUPLICATE
    if scaled is None:
        prepared = ScaledPoints(ring)
        scaled = prepared.at(prepared.exponent)
    points = scaled
    ax, ay = points[0]
    area = 0
    for (bx, by), (cx, cy) in zip(points, points[1:]):
        area += (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if area == 0:
        return ZERO_AREA
    edges = list(zip(points, points[1:]))
    count = len(edges)
    for i, (a, b) in enumerate(edges):
        c = edges[(i + 1) % count][1]
        if on_segment(a, b, c) or on_segment(b, c, a):
            return ADJACENT_OVERLAP
        for j in range(i + 2, count):
            if i == 0 and j == count - 1:
                continue
            if segments_touch(a, b, *edges[j]):
                return SELF_INTERSECTION
    return None


def inside_even_odd(point, ring):
    """Even-odd containment of an integer point; boundary points are unspecified."""
    inside = False
    for a, b in zip(ring, ring[1:]):
        if crosses_ray(a, b, point):
            inside = not inside
    return inside


def polygon_violation(rings):
    """Validate an exterior ring plus holes on one common exact scale.

    Each ring is checked in order before hole relationships, as before.
    """
    if len(rings) == 1:
        return ring_violation(rings[0])  # one ring: its own points are the common scale
    points = ScaledPoints([p for ring in rings for p in ring])
    flat = points.at(points.exponent)
    scaled, start = [], 0
    for ring in rings:
        scaled.append(flat[start:start + len(ring)])
        start += len(ring)
    for ring, ring_points in zip(rings, scaled):
        problem = ring_violation(ring, ring_points)
        if problem:
            return problem
    outer = scaled[0]
    for i, hole in enumerate(scaled[1:], 1):
        if not inside_even_odd(hole[0], outer):
            return HOLE_OUTSIDE
        for previous in scaled[:i]:
            if any(segments_touch(a, b, c, d) for a, b in zip(hole, hole[1:]) for c, d in zip(previous, previous[1:])):
                return RINGS_TOUCH
        for previous in scaled[1:i]:
            if inside_even_odd(hole[0], previous) or inside_even_odd(previous[0], hole):
                return HOLES_OVERLAP
    return None


class PreparedRing:
    """One closed ring prepared for repeated inclusive point containment."""

    __slots__ = ("points",)

    def __init__(self, ring):
        self.points = ScaledPoints(ring)

    def contains(self, longitude, latitude):
        """Inclusive planar containment: boundary points are inside."""
        px, py = decimal_parts(longitude), decimal_parts(latitude)
        exponent = min(self.points.exponent, px[1], py[1])
        ring = self.points.at(exponent)
        point = (px[0] * 10 ** (px[1] - exponent), py[0] * 10 ** (py[1] - exponent))
        if any(on_segment(a, b, point) for a, b in zip(ring, ring[1:])):
            return True
        return inside_even_odd(point, ring)
