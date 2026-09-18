"""Pure bounded demo geometry. No navigation, sensor or physical effects model."""
from copy import deepcopy
from hashlib import sha256
from math import hypot, sqrt
import json
from app.commands.kinematics import metric, geographic, in_extent
from app.commands.zone_rules import blocked
from app.scenarios.geometry import point, contains, crosses, validate, TOLERANCE
from app.commands.errors import CommandError


def protected(frame, origin, destination=None):
    a, b = metric(origin), metric(destination) if destination is not None else None
    for zid, kind in frame.get("boundaryRules", {}).get("zones", {}).items():
        if kind != "friendly":
            continue
        zone = frame["zones"][zid]
        ring = [point(v) for v in zone["geometry"]["coordinates"][0][:-1]]
        if crosses(a, b, ring) if b is not None else contains(a, ring):
            return f'Friendly boundary “{zone["label"]}”: pursuit and engagement protected. Use ordinary Move or revise the policy.'
    return None


def pursuit_blocked(frame, origin, destination=None):
    return blocked(frame, origin, destination) or protected(frame, origin, destination)


def geometry_hash(frame, boundary_id):
    zone = frame.get("zones", {}).get(boundary_id)
    kind = frame.get("boundaryRules", {}).get("zones", {}).get(boundary_id)
    return sha256(json.dumps([kind, zone["geometry"] if zone else None], sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def patrol_route(frame, boundary_id, asset_id, origin):
    if frame.get("boundaryRules", {}).get("zones", {}).get(boundary_id) != "patrol":
        raise CommandError("ENDPOINT_INVALID", "Select a current named Patrol boundary.")
    zone = frame["zones"][boundary_id]
    vertices = zone["geometry"]["coordinates"][0][:-1]
    try:
        ring = validate(vertices, "patrol")
        area2 = sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(ring, ring[1:]+ring[:1]))
        if area2 > 0:
            ring.reverse()
        first = min(range(len(ring)), key=lambda i: ring[i])
        ring = ring[first:]+ring[:first]
        cx, cy = (sum(p[i] for p in ring)/len(ring) for i in range(2))
        loop = [{**geographic(x*.9+cx*.1, y*.9+cy*.1), "altitude": deepcopy(origin["altitude"])} for x, y in ring]
        inset = validate([[p["longitudeDeg"], p["latitudeDeg"]] for p in loop], "patrol")
        if any(not contains(p, ring) for p in inset) or any(not in_extent(p) for p in loop):
            raise ValueError("Inset does not remain inside the Patrol footprint.")
        for a, b in zip(loop, loop[1:]+loop[:1]):
            reason = blocked(frame, a, b)
            if reason:
                raise ValueError(reason)
        waypoint = int.from_bytes(sha256(asset_id.encode()).digest()[:8], "big") % len(loop)
        reason = blocked(frame, origin, loop[waypoint])
        if reason:
            raise ValueError("Straight ingress blocked. " + reason)
    except ValueError as error:
        raise CommandError("ENDPOINT_INVALID", f'Patrol “{zone["label"]}”: {error} Reapply with valid geometry; no detour is generated.')
    return dict(boundaryId=boundary_id, geometryHash=geometry_hash(frame, boundary_id), loop=loop,
                waypoint=waypoint, entered=False, completedLoops=0, visitedWaypoints=0)


def interpolate(a, b, fraction):
    ax, ay = metric(a)
    bx, by = metric(b)
    return {**geographic(ax+(bx-ax)*fraction, ay+(by-ay)*fraction), "altitude": deepcopy(a["altitude"])}


def swept_contact(a0, a1, b0, b1, radius=25.0, tolerance=TOLERANCE):
    """Earliest relative-segment entry into the inclusive 3D toy contact sphere."""
    def xyz(p):
        return (*metric(p), p["altitude"]["metres"])
    aa, ab, ba, bb = map(xyz, (a0, a1, b0, b1))
    r = [a-b for a, b in zip(aa, ba)]
    v = [(a1-a0)-(b1-b0) for a0, a1, b0, b1 in zip(aa, ab, ba, bb)]
    c = sum(x*x for x in r)-(radius+tolerance)**2
    if c <= 0:
        return 0.0
    av = sum(x*x for x in v)
    bv = 2*sum(x*y for x, y in zip(r, v))
    if av <= 1e-18:
        return None
    closest = -bv/(2*av)
    # Evaluate closest separation directly; the quadratic discriminant loses
    # equality to cancellation for long segments tangent to the contact sphere.
    separation2 = sum((x+closest*y)**2 for x, y in zip(r, v))
    slack = (radius+tolerance)**2-separation2
    if slack < -1e-9:
        return None
    t = closest-sqrt(max(0.0, slack)/av)
    return max(0.0, min(1.0, t)) if -1e-12 <= t <= 1+1e-12 else None


def spatial_distance(a, b):
    ax, ay = metric(a)
    bx, by = metric(b)
    return hypot(ax-bx, ay-by, a["altitude"]["metres"]-b["altitude"]["metres"])
