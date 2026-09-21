"""Synthetic compatibility loads, independent of physical vehicles/providers."""
import copy
import json
from pathlib import Path

GOLDEN = Path(__file__).resolve().parents[2] / "contracts/simulation/fixtures/golden.request.json"


def simulation_batch(kind="local40", suffix="baseline"):
    request = json.loads(GOLDEN.read_text())
    if kind == "golden":
        return request
    request["mission_id"] = f"SOFTWARE-{kind}-{suffix}"
    request["command"]["command_id"] = f"COMMAND-{kind}-{suffix}"
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
