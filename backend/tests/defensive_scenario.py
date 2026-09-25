"""Synthetic spec §9 defensive-scenario acceptance dataset (fictional, NOTIONAL).

The "Operation Malindo Darsasa 3AB" narrative is used only as a fictional load
shape. Labels are synthetic; both defended training areas are small pentagons in
open ocean (about 130 W, 45 S), far from land, installations and routes. Two
defended areas are two external missions because the v1 request carries one
area. Each mission runs:

  START  T+00:00..T+02:00  warning tracks, swarm entry, interceptors, losses
  HOLD   T+03:00           supplied samples, no outcomes
  RESUME T+03:30..T+03:45  explicitly supplied health (one deliberate correction)
  ABORT  T+04:00           finalizes the recorded run

Every supplied health continues the actual resolver's previous output except the
single documented RESUME correction, so any other discontinuity is a defect.
``build(scale)`` returns the command sequences; scale 1 is the tracked UI
dataset, larger scales multiply the swarm for backend-only tests.
Run ``python backend/tests/defensive_scenario.py`` from the repository root to
rewrite ``frontend/tests/fixtures/simulation/defensive-s9.json``, then format it
with ``npm --prefix frontend exec prettier -- --write <file>`` (tests compare parsed JSON).
"""
import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.simulation.resolver import resolve_drone_attack_simulation  # noqa: E402

OUTPUT = ROOT / "frontend/tests/fixtures/simulation/defensive-s9.json"
T0 = datetime(2026, 10, 1, 6, 0, 0, tzinfo=timezone.utc)
RADIUS = 250
BAND = (0, 1500)
PROFILE = {
    "profile_id": "SYN-S9-NOTIONAL", "version": "1.0.0", "evidence_status": "NOTIONAL",
    "source_summary": "Synthetic notional values for the fictional section 9 software acceptance test only.",
    "rules": [
        {"actor_class": "I", "subject_class": "II", "probability": 0.55, "health_delta": -45},
        {"actor_class": "II", "subject_class": "I", "probability": 0.3, "health_delta": -25},
        {"actor_class": "I", "subject_class": "III", "probability": 0.45, "health_delta": -40},
        {"actor_class": "III", "subject_class": "I", "probability": 0.35, "health_delta": -30},
    ],
}
# Pentagon areas: the slanted roof edge carries an exact decimal boundary point.
AREAS = {
    "north": dict(mission="SYN-S9-NORTH", area="SYN-TA-NORTH", sign=1,
                  polygon=[[-130.03, -44.92], [-129.97, -44.92], [-129.97, -44.88], [-130.0, -44.86],
                           [-130.03, -44.88], [-130.03, -44.92]],
                  center=(-130.0, -44.9), roof_point=(-129.985, -44.87), vertex=(-129.97, -44.92),
                  apex=(-130.0, -44.86), warning_lat=-44.845, west=-130.03),
    "south": dict(mission="SYN-S9-SOUTH", area="SYN-TA-SOUTH", sign=-1,
                  polygon=[[-130.03, -45.12], [-129.97, -45.12], [-129.97, -45.08], [-130.0, -45.06],
                           [-130.03, -45.08], [-130.03, -45.12]],
                  center=(-130.0, -45.1), roof_point=(-129.985, -45.07), vertex=(-129.97, -45.12),
                  apex=(-130.0, -45.06), warning_lat=-45.135, west=-130.03),
}
START_TIMES = (0, 30, 60, 90, 120)
HOLD_TIME, RESUME_TIMES, ABORT_TIME = 180, (210, 225), 240


def at(seconds):
    return (T0 + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%S.") + "000Z"


def r(value):
    """Six-decimal synthetic coordinates, written as clean decimals."""
    return round(value, 6)


def roster(key, scale):
    """Drone definitions: (id, team, class, first_seen_seconds, position(seconds), initial_health)."""
    a = AREAS[key]
    tag = key[0].upper()
    cx, cy = a["center"]
    drones = []
    for i in range(3):  # warning tracks outside the area, approaching
        drones.append((f"W-{tag}-{i + 1:02}", "RED", "III", 0,
                       lambda s, i=i: (r(cx - 0.01 + 0.01 * i), r(a["warning_lat"] - a["sign"] * 0.00002 * s)), 100))
    drones.append((f"CIV-{tag}-01", "NEUTRAL", "UNKNOWN", 0, lambda s: (r(cx + 0.0005), r(cy + 0.0004)), 100))
    drones.append((f"UNK-{tag}-01", "UNKNOWN", "UNKNOWN", 0, lambda s: (r(cx - 0.0006), r(cy - 0.0003)), 100))
    # Six interior clusters (checked against the slanted roof); scale multiplies reds per cluster.
    clusters = [(r(cx - 0.016 + 0.016 * (j % 3)), r(cy - 0.006 + 0.012 * (j // 3))) for j in range(6)]

    def drift(seconds):
        return 0.000001 * max(0, seconds - 30)
    for j, (x, y) in enumerate(clusters):  # red swarm arrives at T+00:30, interceptors at T+01:00
        for m in range(4 * scale):
            offset = (0.0001 * ((m % 6) - 2.5), 0.00008 * ((m // 6) % 6 - 2.5))
            drones.append((f"R-{tag}-{j + 1:02}-{m + 1:03}", "RED", "II" if m % 2 == 0 else "III", 30,
                           lambda s, x=x, y=y, o=offset: (r(x + o[0] - drift(s)), r(y + o[1] - drift(s))),
                           100 if (j + m) % 3 else 70))
        drones.append((f"B-{tag}-{j + 1:02}", "BLUE", "I", 60, lambda s, x=x, y=y: (r(x - drift(s)), r(y - drift(s))), 100))
    ex, ey = a["roof_point"]
    vx, vy = a["vertex"]
    px, py = a["apex"]
    fx, fy = r(cx - 0.02), r(cy - 0.01)
    kx, ky = r(cx - 0.02), r(cy + 0.01)
    drones += [
        # Inclusive polygon edge and inclusive radius: exactly on the slanted edge, 250 m apart vertically.
        (f"R-{tag}-EDGE", "RED", "II", 60, lambda s: (ex, ey), 100),
        (f"B-{tag}-EDGE", "BLUE", "I", 60, lambda s: (ex, ey), 100),
        # Vertex point with a just-outside-radius partner (250.001 m).
        (f"R-{tag}-VERTEX", "RED", "III", 60, lambda s: (vx, vy), 100),
        (f"B-{tag}-VERTEX", "BLUE", "I", 60, lambda s: (vx, vy), 100),
        # Polygon vertex (the roof apex) with an in-radius partner (200 m): vertex inclusion.
        (f"R-{tag}-APEX", "RED", "II", 60, lambda s: (px, py), 100),
        (f"B-{tag}-APEX", "BLUE", "I", 60, lambda s: (px, py), 100),
        # Altitude band endpoints (inclusive) and one above the band.
        (f"R-{tag}-FLOOR", "RED", "II", 60, lambda s: (fx, fy), 100),
        (f"B-{tag}-FLOOR", "BLUE", "I", 60, lambda s: (fx, fy), 100),
        (f"R-{tag}-CEIL", "RED", "III", 60, lambda s: (kx, ky), 100),
        (f"B-{tag}-CEIL", "BLUE", "I", 60, lambda s: (kx, ky), 100),
        (f"R-{tag}-OVER", "RED", "II", 60, lambda s: (kx, ky), 100),
        # Out-of-area straggler beside an inside interceptor.
        (f"R-{tag}-OUT", "RED", "II", 60, lambda s: (r(a["west"] - 0.0001), cy), 100),
        (f"B-{tag}-WEST", "BLUE", "I", 60, lambda s: (r(a["west"] + 0.0001), cy), 100),
    ]
    return drones


ALTITUDE = {"EDGE": {"R": 600, "B": 850}, "VERTEX": {"R": 400, "B": 650.001}, "APEX": {"R": 500, "B": 700},
            "FLOOR": {"R": 0, "B": 0},
            "CEIL": {"R": 1500, "B": 1500}, "OVER": {"R": 1500.5}}


def altitude(drone_id):
    suffix = drone_id.rsplit("-", 1)[-1]
    if suffix in ALTITUDE:
        return ALTITUDE[suffix][drone_id[0]]
    return 900 if drone_id.startswith("W-") else 300 + (hash_digits(drone_id) % 7) * 20


def hash_digits(text):
    return sum(ord(ch) for ch in text)


def snapshot(drones, seconds, health):
    rows = []
    for drone_id, team, cls, first, position, _ in drones:
        if seconds < first:
            continue
        lon, lat = position(seconds)
        value = health[drone_id]
        rows.append({"drone_id": drone_id, "longitude_deg": lon, "latitude_deg": lat, "altitude_m": altitude(drone_id),
                     "class": cls, "team": team, "health": value, "status": "ACTIVE" if value > 0 else "DISABLED"})
    return rows


def request(key, action, command_id, issued, execute, samples):
    a = AREAS[key]
    return {"schema_version": "1.0", "mission_id": a["mission"],
            "command": {"command_id": command_id, "action": action, "issued_at": issued, "execute_at": execute,
                        "source_mode": "SIMULATED"},
            "area": {"area_id": a["area"], "polygon": copy.deepcopy(a["polygon"]),
                     "min_altitude_m": BAND[0], "max_altitude_m": BAND[1]},
            "resolution": {"interaction_radius_m": RADIUS, "location_grid_deg": 0.001},
            "calibration_profile": copy.deepcopy(PROFILE), "samples_by_timestamp": samples}


def evolve(key, command_id, drones, times, health, corrections=None):
    """Build samples one timestamp at a time, feeding each output health into the next input."""
    samples = {}
    for seconds in times:
        if corrections and seconds in corrections:
            health.update(corrections[seconds])
        rows = snapshot(drones, seconds, health)
        samples[at(seconds)] = rows
        single = request(key, "START", command_id, at(times[0]), at(times[0]), {at(seconds): copy.deepcopy(rows)})
        outcome = resolve_drone_attack_simulation(single)["results_by_timestamp"][at(seconds)]
        for row in outcome["drone_health"]:
            health[row["drone_id"]] = row["health_after"]
    return samples


def mission(key, scale):
    drones = roster(key, scale)
    tag = key[0].upper()
    health = {d[0]: d[5] for d in drones}
    start = evolve(key, f"S9-{tag}-START", drones, START_TIMES, health)
    hold_samples = {at(HOLD_TIME): snapshot(drones, HOLD_TIME, health)}
    # RESUME continues from supplied health; one interceptor is explicitly reported repaired.
    repaired = next(d[0] for d in drones if d[1] == "BLUE" and 0 < health[d[0]] < 100)
    resume = evolve(key, f"S9-{tag}-RESUME", drones, RESUME_TIMES, health, {RESUME_TIMES[0]: {repaired: 100}})
    return {"key": key, "missionId": AREAS[key]["mission"], "repairedOnResume": repaired, "commands": [
        request(key, "START", f"S9-{tag}-START", at(-2), at(START_TIMES[0]), start),
        request(key, "HOLD", f"S9-{tag}-HOLD", at(HOLD_TIME), at(HOLD_TIME), hold_samples),
        request(key, "RESUME", f"S9-{tag}-RESUME", at(RESUME_TIMES[0]), at(RESUME_TIMES[0]), resume),
        request(key, "ABORT", f"S9-{tag}-ABORT", at(ABORT_TIME), at(ABORT_TIME), {}),
    ]}


def build(scale=1):
    return {"schema": "sentinel-s9-defensive-v1", "scale": scale,
            "note": "Fictional, synthetic open-ocean training areas; NOTIONAL profile; not operational data.",
            "generator": "backend/tests/defensive_scenario.py",
            "missions": [mission("north", scale), mission("south", scale)]}


def phase_report(dataset):
    """Evidence that each §9 phase is present in the resolved data."""
    report = {}
    for m in dataset["missions"]:
        start = resolve_drone_attack_simulation(m["commands"][0])["results_by_timestamp"]
        pairs = {t: len(v["interactions"]) for t, v in start.items()}
        zeroed = {t: sorted({row["drone_id"][0] for row in v["drone_health"]
                             if row["health_before"] > 0 and row["health_after"] == 0}) for t, v in start.items()}
        report[m["key"]] = dict(pairs=pairs, zeroed=zeroed)
    return report


def check(dataset):
    for m in dataset["missions"]:
        info = phase_report(dataset)[m["key"]]
        times = sorted(info["pairs"])
        assert info["pairs"][times[0]] == 0 and info["pairs"][times[1]] == 0, "no pairs before interceptors arrive"
        assert info["pairs"][times[2]] > 0, "interceptors produce interactions at T+01:00"
        assert set(info["zeroed"][times[4]]) == {"B", "R"}, f"red and blue losses at T+02:00: {info}"
    return dataset


def responses(database):
    """Submit every tracked command in order to a fresh app; response text by command ID.

    ``--responses <database> <out.json>`` writes this as JSON, so a test can
    compare a clean run in a separate process (with its own string-hash seed).
    """
    from fastapi.testclient import TestClient

    from app.main import create_app
    dataset = json.loads(OUTPUT.read_text(encoding="utf-8"))
    result = {}
    with TestClient(create_app(str(database), False)) as client:
        for m in dataset["missions"]:
            for body in m["commands"]:
                response = client.post("/api/simulation/v1/commands", content=json.dumps(body))
                assert response.status_code == 200, response.text
                result[body["command"]["command_id"]] = response.content.decode("utf-8")
    return result


def main():
    if sys.argv[1:2] == ["--responses"]:
        Path(sys.argv[3]).write_bytes(json.dumps(responses(sys.argv[2])).encode("utf-8"))
        return
    dataset = check(build(1))
    OUTPUT.write_bytes((json.dumps(dataset, indent=1) + "\n").encode("utf-8"))  # LF, as Prettier expects
    print(f"wrote {OUTPUT.relative_to(ROOT).as_posix()}", json.dumps(phase_report(dataset)))


if __name__ == "__main__":
    main()
