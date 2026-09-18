"""Bounded horizontal geometry in local-horizontal-v1 metres. No routing."""
from math import hypot
from app.commands.kinematics import metric, in_extent

TOLERANCE = .001  # Inclusive one-millimetre contact in the local metric frame.


def point(vertex):
    return metric({"longitudeDeg": vertex[0], "latitudeDeg": vertex[1]})


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])


def separation(p, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    length2 = dx*dx + dy*dy
    t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/length2)) if length2 else 0
    return hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)


def touches(a, b, c, d):
    if min(separation(a,c,d), separation(b,c,d), separation(c,a,b), separation(d,a,b)) <= TOLERANCE:
        return True
    return cross(a,b,c)*cross(a,b,d) < 0 and cross(c,d,a)*cross(c,d,b) < 0


def edges(ring):
    return zip(ring, ring[1:] + ring[:1])


def contains(p, ring):
    if any(separation(p,a,b) <= TOLERANCE for a,b in edges(ring)):
        return True
    inside = False
    for a,b in edges(ring):
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def crosses(a, b, ring):
    return contains(a,ring) or contains(b,ring) or any(touches(a,b,c,d) for c,d in edges(ring))


def validate(vertices, kind):
    if not 3 <= len(vertices) <= 32:
        raise ValueError("Use 3–32 boundary vertices.")
    if any(not in_extent({"longitudeDeg": v[0], "latitudeDeg": v[1]}) for v in vertices):
        raise ValueError("Boundary vertices must stay within the local ±5 km extent.")
    ring = [point(v) for v in vertices]
    if any(hypot(a[0]-b[0], a[1]-b[1]) <= TOLERANCE for i,a in enumerate(ring) for b in ring[i+1:]):
        raise ValueError("Boundary vertices must be distinct (more than 1 mm apart).")
    segments = list(edges(ring))
    for i,(a,b) in enumerate(segments):
        c = segments[(i+1)%len(ring)][1]
        if separation(c,a,b) <= TOLERANCE or separation(a,b,c) <= TOLERANCE:
            raise ValueError("Adjacent boundary edges overlap or are degenerate.")
        for j,(c,d) in enumerate(segments):
            if j <= i+1 or (i == 0 and j == len(ring)-1):
                continue
            if touches(a,b,c,d):
                raise ValueError("Boundary edges intersect or touch themselves.")
    area = abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in segments))/2
    if area <= TOLERANCE * sum(hypot(b[0]-a[0],b[1]-a[1]) for a,b in segments):
        raise ValueError("Boundary area is too small or zero.")
    turns = [cross(ring[i-1], ring[i], ring[(i+1)%len(ring)]) for i in range(len(ring))]
    if kind == "patrol" and any(t > 0 for t in turns) and any(t < 0 for t in turns):
        raise ValueError("Patrol boundaries must be convex; use a convex footprint for Patrol.")
    return ring
