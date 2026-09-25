"""Historical compatibility: the exact predicate changes no verdict on tracked data.

Every polygon in tracked contract examples, world/recording fixtures, scenario
fixtures and external request fixtures is validated by the exact predicate and
by the verbatim baseline arithmetic (geometry_legacy.py). Tracked data must not
be newly rejected; here no verdict changes in either direction.
"""
import json
from pathlib import Path

import geometry_legacy as legacy
from app.domain import geometry
from app.simulation.validation import SimulationError, validate_ring

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ("contracts", "frontend/tests/fixtures", "backend/tests/fixtures")


def polygons():
    found = []
    for base in SOURCES:
        for path in sorted((ROOT / base).rglob("*.json")):
            if path.name == "polygon-vectors.v1.json":
                continue  # Deliberately adversarial vectors have their own tests.
            stack = [(json.loads(path.read_text(encoding="utf-8")), "")]
            while stack:
                value, where = stack.pop()
                if isinstance(value, dict):
                    if value.get("type") == "Polygon" and isinstance(value.get("coordinates"), list):
                        found.append(("core", path, where, value["coordinates"]))
                    if isinstance(value.get("polygon"), list) and "area_id" in value:
                        found.append(("external", path, where, value["polygon"]))
                    if isinstance(value.get("vertices"), list) and value["vertices"] and isinstance(value["vertices"][0], list):
                        found.append(("core", path, where, [value["vertices"] + value["vertices"][:1]]))
                    stack.extend((child, f"{where}/{key}") for key, child in value.items())
                elif isinstance(value, list):
                    stack.extend((child, f"{where}/{i}") for i, child in enumerate(value))
    # Code-generated product fixtures that commit zones.
    from app.missions.tactical_fixture import tactical_source
    for sequence in range(4):
        frame, _ = tactical_source(sequence, "2026-09-24T00:00:00.000Z")
        for zone_id, zone in frame["zones"].items():
            found.append(("core", ROOT / "backend/app/missions/tactical_fixture.py", f"/{sequence}/{zone_id}",
                          zone["geometry"]["coordinates"]))
    return found


def legacy_core_accepts(rings):
    try:
        legacy.legacy_polygon_problem([[tuple(p) for p in ring] for ring in rings])
        return True
    except (ValueError, ZeroDivisionError):
        return False


def legacy_external_accepts(ring):
    try:
        legacy.validate_ring(ring, ())
        return True
    except ValueError:
        return False


def external_accepts(ring):
    try:
        validate_ring(ring, ("area", "polygon"))
        return True
    except SimulationError:
        return False


def is_geometry(rings):
    return all(isinstance(ring, list) and all(isinstance(p, list) and len(p) == 2 and all(
        isinstance(v, (int, float)) and not isinstance(v, bool) for v in p) for p in ring) for ring in rings)


def test_tracked_polygons_keep_their_verdicts():
    checked = {"core": 0, "external": 0}
    changed = []
    for kind, path, where, value in polygons():
        rings = [value] if kind == "external" else value
        if not is_geometry(rings):
            continue
        if kind == "external":
            old, new = legacy_external_accepts(value), external_accepts(value)
        else:
            old, new = legacy_core_accepts(rings), geometry.polygon_violation(rings) is None
        checked[kind] += 1
        if old != new:
            changed.append((path.relative_to(ROOT).as_posix(), where, old, new))
    assert changed == []
    # Scenario/location boundaries, the tactical fixture area and every external
    # request fixture area were found (contract world examples carry no zones).
    assert checked["core"] >= 13 and checked["external"] >= 19, checked
