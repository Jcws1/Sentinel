"""Synthetic compatibility loads, independent of physical vehicles/providers."""
import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

GOLDEN = Path(__file__).resolve().parents[2] / "contracts/simulation/fixtures/golden.request.json"


def simulation_batch(kind="local40", suffix="baseline"):
    request = json.loads(GOLDEN.read_text())
    if kind == "golden":
        return request
    request["mission_id"] = f"SOFTWARE-{kind}-{suffix}"
    request["command"]["command_id"] = f"COMMAND-{kind}-{suffix}"
    if kind.startswith(("steps", "churn")):
        return timestamp_batch(request, kind)
    lon, lat = (151.15, -33.85) if kind == "remote40" else (103.85, 1.35)
    radius = 100
    if kind == "sparse10000":
        ring, count, radius = [[-170, -80], [170, -80], [170, 80], [-170, 80], [-170, -80]], 10000, .1
    else:
        ring = [[lon-.04, lat-.04], [lon+.04, lat-.04], [lon+.04, lat+.04], [lon-.04, lat+.04], [lon-.04, lat-.04]]
        count = int(kind[5:]) if kind.startswith("dense") else 40
    request["area"]["polygon"] = ring
    request["resolution"]["interaction_radius_m"] = radius
    sample = []
    for i in range(count):
        if kind == "sparse10000":
            x, y = -150 + (i % 100) * 3, -70 + (i // 100) * 1.4
        elif kind.startswith("dense"):
            x, y = lon, lat
        else:
            x, y = lon + (i // 2) * .0008, lat + (i % 2) * .0001
        sample.append(dict(drone_id=f"{'RED' if i % 2 == 0 else 'BLUE'}-{i:05}", longitude_deg=x, latitude_deg=y,
            altitude_m=100, **{"class": "I"}, team="RED" if i % 2 == 0 else "BLUE", health=100, status="ACTIVE"))
    request["samples_by_timestamp"] = {"2026-09-06T00:00:01.000Z": sample}
    if kind in {"local40", "remote40"}:
        moved = copy.deepcopy(sample)
        for row in moved:
            row["latitude_deg"] += .0001
        request["samples_by_timestamp"]["2026-09-06T00:00:02.000Z"] = moved
    return request


def timestamp_batch(request, kind):
    """Batches whose completion writes one world frame per timestamp.

    ``steps<T>x<N>``: T one-second timestamps of the same N drones (local40 layout, drifting north).
    ``churn<T>``: T one-second timestamps of one new drone each; every frame carries all earlier drones.
    """
    lon, lat = 103.85, 1.35
    request["area"]["polygon"] = [[lon-.04, lat-.04], [lon+.04, lat-.04], [lon+.04, lat+.04], [lon-.04, lat+.04], [lon-.04, lat-.04]]
    churn = kind.startswith("churn")
    timestamps, count = (int(kind[5:]), 1) if churn else map(int, kind[5:].split("x"))
    first = datetime(2026, 9, 6, 0, 0, 1, tzinfo=timezone.utc)
    samples = {}
    for t in range(timestamps):
        rows = []
        for i in range(count):
            ident = t if churn else i
            if churn:
                x, y = lon - .038 + (t % 20) * .004, lat - .038 + (t // 20) * .004
            else:
                x, y = lon + (i // 2) * .0008, lat + (i % 2) * .0001 + t * .00001
            rows.append(dict(drone_id=f"{'RED' if ident % 2 == 0 else 'BLUE'}-{ident:05}", longitude_deg=x, latitude_deg=y,
                             altitude_m=100, **{"class": "I"}, team="RED" if ident % 2 == 0 else "BLUE", health=100,
                             status="ACTIVE"))
        samples[(first + timedelta(seconds=t)).strftime("%Y-%m-%dT%H:%M:%S.000Z")] = rows
    request["samples_by_timestamp"] = samples
    return request
