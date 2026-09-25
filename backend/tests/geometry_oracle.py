"""Independent exact-rational oracle for polygon topology; tests only.

Deliberately direct and slow: every coordinate becomes
``Fraction(Decimal(repr(x)))`` -- the exact value of its shortest round-trip
decimal spelling -- and every predicate is evaluated with textbook formulas.
It shares no code with ``app.domain.geometry``.
"""
from decimal import Decimal
from fractions import Fraction


def value(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise TypeError("coordinate must be a number")
    return Fraction(x) if isinstance(x, int) else Fraction(Decimal(repr(x)))


def point(p):
    return value(p[0]), value(p[1])


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def between(a, b, p):
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def on_segment(a, b, p):
    return cross(a, b, p) == 0 and between(a, b, p)


def sign(x):
    return (x > 0) - (x < 0)


def touch(a, b, c, d):
    d1, d2, d3, d4 = sign(cross(a, b, c)), sign(cross(a, b, d)), sign(cross(c, d, a)), sign(cross(c, d, b))
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True
    return on_segment(a, b, c) or on_segment(a, b, d) or on_segment(c, d, a) or on_segment(c, d, b)


def ring_reason(ring):
    """First violation in canonical order, or None when the ring is valid."""
    pts = [point(p) for p in ring]
    if len(pts) < 4 or pts[0] != pts[-1]:
        return "unclosed"
    body = pts[:-1]
    if len(set(body)) != len(body):
        return "duplicate-vertex"
    area2 = sum(cross(pts[0], pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    if area2 == 0:
        return "zero-area"
    n = len(pts) - 1
    edges = [(pts[i], pts[i + 1]) for i in range(n)]
    for i in range(n):
        a, b = edges[i]
        c = edges[(i + 1) % n][1]
        if on_segment(a, b, c) or on_segment(b, c, a):
            return "adjacent-overlap"
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            if touch(a, b, edges[j][0], edges[j][1]):
                return "self-intersection"
    return None


def crosses(a, b, p):
    """Even-odd ray test: does edge a-b cross the ray from p towards +x?"""
    if (a[1] > p[1]) == (b[1] > p[1]):
        return False
    x_at = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
    return p[0] < x_at


def even_odd(p, ring):
    return sum(crosses(ring[i], ring[i + 1], p) for i in range(len(ring) - 1)) % 2 == 1


def polygon_reason(rings):
    for ring in rings:
        reason = ring_reason(ring)
        if reason:
            return reason
    exact = [[point(p) for p in ring] for ring in rings]
    for i, hole in enumerate(exact[1:], 1):
        if not even_odd(hole[0], exact[0]):
            return "hole-outside"
        for other in exact[:i]:
            for k in range(len(hole) - 1):
                for m in range(len(other) - 1):
                    if touch(hole[k], hole[k + 1], other[m], other[m + 1]):
                        return "rings-intersect"
        for other in exact[1:i]:
            if even_odd(hole[0], other) or even_odd(other[0], hole):
                return "holes-overlap"
    return None


def contains_inclusive(ring, p):
    pts = [point(q) for q in ring]
    q = point(p)
    if any(on_segment(pts[i], pts[i + 1], q) for i in range(len(pts) - 1)):
        return True
    return even_odd(q, pts)
