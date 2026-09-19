"""Declared local metric approximation. Pure calculations; never a world writer."""
from math import cos, radians, degrees, hypot, atan2
from app.commands.errors import CommandError
from app.scenarios.location import origin_for, geometry_for, ROUNDTRIP_TOLERANCE

RADIUS = 6378137.0
ORIGIN = (103.85, 1.29)
EXTENT = 5000.0
STEP_SECONDS = .2
LEGACY_SPEED = 20.0
CRUISE_SPEED = 155 / 3.6


def cruise_speed(template_id):
    return CRUISE_SPEED if template_id == "singapore-local-v2" else LEGACY_SPEED


def metric(position, geometry=None):
    origin = origin_for(geometry)
    return (RADIUS * cos(radians(origin[1])) * radians(position["longitudeDeg"] - origin[0]),
            RADIUS * radians(position["latitudeDeg"] - origin[1]))


def geographic(x, y, geometry=None):
    origin = origin_for(geometry)
    return {"longitudeDeg": round(origin[0] + degrees(x / (RADIUS * cos(radians(origin[1])))), 9),
            "latitudeDeg": round(origin[1] + degrees(y / RADIUS), 9)}


def distance(a, b, geometry=None):
    ax, ay = metric(a, geometry)
    bx, by = metric(b, geometry)
    return hypot(bx - ax, by - ay)


def in_extent(position, geometry=None):
    tolerance = ROUNDTRIP_TOLERANCE if geometry_for(geometry) is not None else 0
    return all(abs(v) <= EXTENT + tolerance for v in metric(position, geometry))


def endpoints(origins, anchor, geometry=None):
    if not origins or not in_extent(anchor, geometry) or any(not in_extent(p, geometry) for p in origins):
        raise CommandError("OUTSIDE_EXTENT", "Origins and anchor must be within the local ±5,000 m extent.")
    points = [metric(p, geometry) for p in origins]
    cx, cy = (sum(p[i] for p in points) / len(points) for i in range(2))
    ax, ay = metric(anchor, geometry)
    targets = [{**geographic(ax + x - cx, ay + y - cy, geometry), "altitude": dict(origin["altitude"])}
               for (x, y), origin in zip(points, origins)]
    if any(not in_extent(p, geometry) for p in targets):
        raise CommandError("OUTSIDE_EXTENT", "A translated endpoint exceeds the local model extent.")
    if any(distance(origin, target, geometry) < 1 for origin, target in zip(origins, targets)):
        raise CommandError("ENDPOINT_INVALID", "Every member must move at least one metre; revise the anchor.")
    if any(distance(a, b, geometry) < .5 for i, a in enumerate(targets) for b in targets[i + 1:]):
        raise CommandError("ENDPOINT_INVALID", "Coincident endpoints require explicit revision.")
    return targets


def step(execution, geometry=None):
    origin, target = execution["origin"], execution["destination"]
    x, y = metric(origin, geometry)
    tx, ty = metric(target, geometry)
    total = hypot(tx - x, ty - y)
    speed = execution["speedMps"]
    travelled = min(total, execution["travelledMetres"] + speed * STEP_SECONDS)
    remaining = max(0.0, total - travelled)
    position = dict(target) if remaining == 0 else {
        **geographic(x + (tx - x) * travelled / total, y + (ty - y) * travelled / total, geometry),
        "altitude": dict(origin["altitude"])}
    execution.update(travelledMetres=travelled, remainingMetres=remaining)
    return position, {"speedMps": speed if remaining else 0.0, "headingTrueDeg": degrees(atan2(tx - x, ty - y)) % 360}
