"""Pure deterministic software-test batch resolver; no persistence or authority.

Generators allow the service to yield between bounded units of work. The spatial
index uses sphere chord coordinates only as a conservative candidate filter; the
specified great-circle/altitude distance decides every actual interaction.
"""
import hashlib
import math
from collections import defaultdict
from itertools import product

from app.simulation.policy import EARTH_RADIUS_M
from app.simulation.validation import SimulationError, inside_polygon, pointer, validate_steps


def separation(a, b):
    lat_a, lat_b = math.radians(a["latitude_deg"]), math.radians(b["latitude_deg"])
    lat = (lat_b - lat_a) / 2
    lon = math.radians(b["longitude_deg"] - a["longitude_deg"]) / 2
    hav = math.sin(lat) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(lon) ** 2
    horizontal = 2 * EARTH_RADIUS_M * math.asin(math.sqrt(max(0.0, min(1.0, hav))))
    return math.hypot(horizontal, b["altitude_m"] - a["altitude_m"])


def _cell(drone, radius):
    lat, lon = math.radians(drone["latitude_deg"]), math.radians(drone["longitude_deg"])
    # Pad only the conservative index cell against coordinate roundoff. Actual
    # eligibility below still compares the unrounded specified distance exactly.
    width = radius + 16 * math.ulp(EARTH_RADIUS_M)
    return tuple(math.floor(value / width) for value in (
        EARTH_RADIUS_M * math.cos(lat) * math.cos(lon),
        EARTH_RADIUS_M * math.cos(lat) * math.sin(lon),
        EARTH_RADIUS_M * math.sin(lat)))


def candidate_steps(request, drones):
    area, radius = request["area"], request["resolution"]["interaction_radius_m"]
    buckets = defaultdict(list)
    reds = []
    for drone in drones:
        if (drone["status"] == "ACTIVE" and drone["health"] > 0 and drone["team"] in {"RED", "BLUE"}
                and area["min_altitude_m"] <= drone["altitude_m"] <= area["max_altitude_m"]
                and inside_polygon(drone, area["polygon"])):
            if drone["team"] == "BLUE":
                buckets[_cell(drone, radius)].append(drone)
            else:
                reds.append(drone)
        yield None
    offsets = tuple(product((-1, 0, 1), repeat=3))
    for red in sorted(reds, key=lambda d: d["drone_id"]):
        cell = _cell(red, radius)
        nearby = [blue for offset in offsets for blue in buckets.get(tuple(cell[i] + offset[i] for i in range(3)), ())]
        for blue in sorted(nearby, key=lambda d: d["drone_id"]):
            distance = separation(red, blue)
            yield (red, blue, distance) if distance <= radius else None


def validate_complete_steps(request):
    yield from validate_steps(request)
    if request["command"]["action"] in {"HOLD", "ABORT"}:
        return
    rules = {(r["actor_class"], r["subject_class"]) for r in request["calibration_profile"]["rules"]}
    for at in sorted(request["samples_by_timestamp"]):
        for pair in candidate_steps(request, request["samples_by_timestamp"][at]):
            if pair is not None:
                red, blue, _ = pair
                if (red["class"], blue["class"]) not in rules or (blue["class"], red["class"]) not in rules:
                    raise SimulationError("MISSING_RULE", pointer(("calibration_profile", "rules")), "Every eligible directional class pair requires one rule")
            yield None


def effect(request, at, actor, subject, rule):
    profile, command = request["calibration_profile"], request["command"]
    key = "|".join((request["schema_version"], request["mission_id"], command["command_id"], at,
                    actor["drone_id"], subject["drone_id"], profile["profile_id"], profile["version"]))
    draw = int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:8], "big") / 18446744073709551616
    applied = draw < rule["probability"]
    return dict(actor_drone_id=actor["drone_id"], subject_drone_id=subject["drone_id"],
                probability=rule["probability"], draw=draw, applied=applied,
                health_delta=int(rule["health_delta"]) if applied else 0)


def resolve_steps(request, previous_health=None):
    """Requires complete validation; previous health is private run audit state."""
    previous = dict(previous_health or {})
    profile = request["calibration_profile"]
    action = request["command"]["action"]
    response = dict(schema_version="1.0", mission_id=request["mission_id"],
                    command_ack=dict(command_id=request["command"]["command_id"], status="SUCCEEDED",
                                     run_status={"HOLD": "HELD", "ABORT": "ABORTED"}.get(action, "RUNNING"),
                                     error_code=None, error_path=None, error_message=None),
                    calibration={key: profile[key] for key in ("profile_id", "version", "evidence_status")},
                    results_by_timestamp={})
    if action in {"HOLD", "ABORT"}:
        return response, previous
    rules = {(r["actor_class"], r["subject_class"]): r for r in profile["rules"]}
    for at in sorted(request["samples_by_timestamp"]):
        drones = request["samples_by_timestamp"][at]
        interactions, pending = [], defaultdict(int)
        for pair in candidate_steps(request, drones):
            if pair is None:
                yield None
                continue
            red, blue, distance = pair
            effects = [effect(request, at, red, blue, rules[(red["class"], blue["class"])]),
                       effect(request, at, blue, red, rules[(blue["class"], red["class"])])]
            for result in effects:
                pending[result["subject_drone_id"]] += result["health_delta"]
            g = request["resolution"]["location_grid_deg"]
            mid_lon = (red["longitude_deg"] + blue["longitude_deg"]) / 2
            mid_lat = (red["latitude_deg"] + blue["latitude_deg"]) / 2
            mid_alt = (red["altitude_m"] + blue["altitude_m"]) / 2
            location = f"grid:{g}:" + ":".join(str(n) for n in (
                math.floor((mid_lat + 90) / g + 1e-9), math.floor((mid_lon + 180) / g + 1e-9), math.floor(mid_alt / 50)))
            flags = (effects[0]["applied"], effects[1]["applied"])
            outcome = {(False, False): "NO_EFFECT", (True, False): "RED_EFFECT", (False, True): "BLUE_EFFECT", (True, True): "MUTUAL_EFFECT"}[flags]
            interaction_id = hashlib.sha256("|".join((request["mission_id"], at, red["drone_id"], blue["drone_id"])).encode("utf-8")).hexdigest()
            interactions.append(dict(interaction_id=interaction_id, location_id=location, red_drone_id=red["drone_id"],
                                     blue_drone_id=blue["drone_id"], separation_m=round(distance, 3), outcome=outcome, effects=effects))
            yield None
        health = []
        for drone in sorted(drones, key=lambda d: d["drone_id"]):
            identity, before = drone["drone_id"], int(drone["health"])
            after = max(0, min(100, before + pending[identity]))
            status = ("ACTIVE" if after else "DISABLED") if drone["status"] == "ACTIVE" else drone["status"]
            health.append(dict(drone_id=identity, health_before=before, health_after=after, status_after=status,
                               state_discontinuity=identity in previous and previous[identity] != before))
            previous[identity] = after
            yield None
        response["results_by_timestamp"][at] = dict(interactions=interactions, drone_health=health)
    return response, previous


def exhaust(iterator):
    while True:
        try:
            next(iterator)
        except StopIteration as done:
            return done.value


def resolve_drone_attack_simulation(request):
    """Pure batch operation; lifecycle and idempotency belong to the service."""
    exhaust(validate_complete_steps(request))
    return exhaust(resolve_steps(request))[0]
