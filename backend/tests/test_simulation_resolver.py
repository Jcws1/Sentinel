import copy
import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from app.simulation.resolver import (candidate_steps, effect, exhaust, resolve_drone_attack_simulation,
                                     resolve_steps, separation, validate_complete_steps)
from app.simulation.validation import (SimulationError, canonical_external, parse_request,
                                       validate_request, validate_ring)

FIXTURES = Path(__file__).resolve().parents[2] / "contracts/simulation/fixtures"


@pytest.fixture
def request_data():
    return json.loads((FIXTURES / "golden.request.json").read_text())


def snapshot(request):
    return next(iter(request["samples_by_timestamp"].values()))


def result(request):
    return next(iter(resolve_drone_attack_simulation(request)["results_by_timestamp"].values()))


def test_frozen_golden_exact(request_data):
    assert resolve_drone_attack_simulation(request_data) == json.loads((FIXTURES / "golden.response.json").read_text())


@pytest.mark.parametrize("name", [case["file"] for case in json.loads((FIXTURES / "manifest.json").read_text())["cases"]
                                  if case["semantic"] in {"invalid", "invalid-deferred"}])
def test_frozen_invalid_fixtures(name):
    with pytest.raises(SimulationError) as fault:
        exhaust(validate_complete_steps(json.loads((FIXTURES / name).read_text())))
    assert fault.value.status == 422


@pytest.mark.parametrize("raw,code", [('x', "INVALID_JSON"), ('{"a":1,"a":2}', "DUPLICATE_KEY"),
                                     ('{"x":{"a":1,"a":2}}', "DUPLICATE_KEY"), ('{"a":NaN}', "INVALID_JSON"),
                                     (b'"\xff"', "INVALID_JSON")])
def test_strict_parser(raw, code):
    with pytest.raises(SimulationError) as fault:
        parse_request(raw)
    assert (fault.value.code, fault.value.status) == (code, 400)


def test_numeric_canonicalization_and_array_identity(request_data):
    variant = copy.deepcopy(request_data)
    snapshot(variant)[0]["health"] = 100.0
    variant["area"]["min_altitude_m"] = -0.0
    assert canonical_external(variant) == canonical_external(request_data)
    assert resolve_drone_attack_simulation(variant) == resolve_drone_attack_simulation(request_data)
    snapshot(variant).reverse()
    assert canonical_external(variant) != canonical_external(request_data)
    assert resolve_drone_attack_simulation(variant) == resolve_drone_attack_simulation(request_data)


def test_document_order_before_unknown_keys(request_data):
    request_data = {"unknown": 1, **request_data}
    request_data["command"]["source_mode"] = "LIVE"
    request_data["area"]["polygon"] = []
    with pytest.raises(SimulationError) as fault:
        validate_request(request_data)
    assert fault.value.path == "/command/source_mode"


@pytest.mark.parametrize("value", [True, None, "100", float("inf"), float("nan"), 0])
def test_health_is_finite_positive_integer_for_active(request_data, value):
    snapshot(request_data)[0]["health"] = value
    with pytest.raises(SimulationError):
        validate_request(request_data)


def test_invalid_status_does_not_crash_validation(request_data):
    snapshot(request_data)[0]["status"] = {}
    with pytest.raises(SimulationError):
        validate_request(request_data)


@pytest.mark.parametrize("at", ["2026-02-30T00:00:00.000Z", "2026-09-06T00:00:60.000Z", "2026-09-06T00:00:00Z"])
def test_calendar_and_approved_leap_second_policy(request_data, at):
    request_data["command"]["issued_at"] = at
    with pytest.raises(SimulationError) as fault:
        validate_request(request_data)
    assert fault.value.path == "/command/issued_at"


@pytest.mark.parametrize("ring", [
    [[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]],
    [[0, 0], [1, 0], [2, 0], [0, 0]],
    [[0, 0], [1, 0], [1, 1], [1, 0], [0, 0]],
])
def test_polygon_invalidity(ring):
    with pytest.raises(SimulationError):
        validate_ring(ring, ("area", "polygon"))


def test_small_nonzero_polygon_avoids_absolute_coordinate_cancellation():
    validate_ring([[103, 1], [103 + 1e-9, 1], [103 + 1e-9, 1 + 1e-9], [103, 1 + 1e-9], [103, 1]], ("area", "polygon"))


def test_exact_radius_and_just_outside_use_unrounded_distance(request_data):
    red, blue = snapshot(request_data)
    blue.update(longitude_deg=red["longitude_deg"], latitude_deg=red["latitude_deg"], altitude_m=200)
    assert len(result(request_data)["interactions"]) == 1
    blue["altitude_m"] = 200.00001
    assert result(request_data)["interactions"] == []


def test_polygon_and_altitude_boundaries_are_inclusive(request_data):
    red, blue = snapshot(request_data)
    for drone in (red, blue):
        drone.update(longitude_deg=103.8, latitude_deg=1.3)
    red["altitude_m"], blue["altitude_m"] = 0, 500
    request_data["resolution"]["interaction_radius_m"] = 500
    assert len(result(request_data)["interactions"]) == 1
    red["longitude_deg"] = 103.8 - 1e-10
    assert result(request_data)["interactions"] == []


def test_simultaneous_effects_and_no_effect_records(request_data):
    drones = snapshot(request_data)
    clone = copy.deepcopy(drones[0])
    clone["drone_id"] = "RED-002"
    drones.append(clone)
    rows = result(request_data)
    assert len(rows["interactions"]) == 2
    assert {row["drone_id"]: row["health_after"] for row in rows["drone_health"]} == {"BLUE-001": 20, "RED-001": 60, "RED-002": 60}
    request_data["calibration_profile"]["rules"][0]["probability"] = 0
    assert [row["outcome"] for row in result(request_data)["interactions"]] == ["NO_EFFECT", "NO_EFFECT"]


def test_neutral_unknown_outside_and_terminal_rows_preserved(request_data):
    template = snapshot(request_data)[0]
    cases = [("neutral", dict(team="NEUTRAL")), ("unknown", dict(team="UNKNOWN")),
             ("outside", dict(longitude_deg=100)), ("removed", dict(status="REMOVED", health=0)),
             ("disabled", dict(status="DISABLED", health=0))]
    for identity, changes in cases:
        snapshot(request_data).append({**template, **changes, "drone_id": identity})
    rows = {row["drone_id"]: row for row in result(request_data)["drone_health"]}
    for identity, changes in cases:
        assert rows[identity]["health_after"] == changes.get("health", 100)
        assert rows[identity]["status_after"] == changes.get("status", "ACTIVE")


def test_discontinuity_compares_last_seen_output_after_absence(request_data):
    drones = snapshot(request_data)
    request_data["samples_by_timestamp"]["2026-09-06T00:00:02.000Z"] = []
    request_data["samples_by_timestamp"]["2026-09-06T00:00:03.000Z"] = copy.deepcopy(drones)
    results = resolve_drone_attack_simulation(request_data)["results_by_timestamp"]
    assert results["2026-09-06T00:00:02.000Z"] == dict(interactions=[], drone_health=[])
    assert all(row["state_discontinuity"] for row in results["2026-09-06T00:00:03.000Z"]["drone_health"])


@pytest.mark.parametrize("action,state", [("HOLD", "HELD"), ("ABORT", "ABORTED")])
def test_control_validates_but_does_not_resolve_or_require_rule_coverage(request_data, action, state):
    request_data["command"]["action"] = action
    request_data["calibration_profile"]["rules"] = []
    resolved = resolve_drone_attack_simulation(request_data)
    assert resolved["results_by_timestamp"] == {}
    assert resolved["command_ack"]["run_status"] == state
    snapshot(request_data)[0]["health"] = -1
    with pytest.raises(SimulationError):
        resolve_drone_attack_simulation(request_data)


def test_hold_has_no_undocumented_timestamp_cap(request_data):
    request_data["command"]["action"] = "HOLD"
    base = datetime(2026, 9, 6, 0, 0, 1)
    request_data["samples_by_timestamp"] = {(base + timedelta(seconds=i)).isoformat(timespec="milliseconds") + "Z": [] for i in range(10001)}
    assert resolve_drone_attack_simulation(request_data)["results_by_timestamp"] == {}


def test_draw_double_can_round_to_one(request_data):
    class MaximumDigest:
        def digest(self):
            return b"\xff" * 32
    red, blue = snapshot(request_data)
    with patch("app.simulation.resolver.hashlib.sha256", return_value=MaximumDigest()):
        draw = effect(request_data, next(iter(request_data["samples_by_timestamp"])), red, blue, request_data["calibration_profile"]["rules"][0])
    assert draw["draw"] == 1.0
    assert draw["applied"] is False


def test_pipe_delimited_hash_collisions_do_not_drop_interactions(request_data):
    red, blue = snapshot(request_data)
    request_data["samples_by_timestamp"][next(iter(request_data["samples_by_timestamp"]))] = [
        {**red, "drone_id": "a"}, {**red, "drone_id": "a|b"},
        {**blue, "drone_id": "b|c"}, {**blue, "drone_id": "c"},
    ]
    pairs = result(request_data)["interactions"]
    assert len(pairs) == 4
    assert len({p["interaction_id"] for p in pairs}) == 3


def test_conservative_sphere_index_matches_brute_force_global_points(request_data):
    request_data["area"]["polygon"] = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
    randomizer = random.Random(991)
    template = snapshot(request_data)[0]
    drones = []
    for i in range(60):
        lon, lat = randomizer.uniform(-180, 180), randomizer.uniform(-89.99, 89.99)
        for team, delta in (("RED", 0), ("BLUE", .0001)):
            drones.append({**template, "team": team, "drone_id": f"{team}-{i}", "longitude_deg": min(180, lon + delta), "latitude_deg": lat})
    drones += [{**template, "drone_id": "edge-red", "team": "RED", "longitude_deg": -180, "latitude_deg": 0},
               {**template, "drone_id": "edge-blue", "team": "BLUE", "longitude_deg": 180, "latitude_deg": 0}]
    for radius in (.1, 100, 10000):
        request_data["resolution"]["interaction_radius_m"] = radius
        expected = [(a["drone_id"], b["drone_id"]) for a in sorted(drones, key=lambda d: d["drone_id"]) if a["team"] == "RED"
                    for b in sorted(drones, key=lambda d: d["drone_id"]) if b["team"] == "BLUE" and separation(a, b) <= radius]
        actual = [(a["drone_id"], b["drone_id"]) for item in candidate_steps(request_data, drones) if item is not None for a, b, _ in [item]]
        assert actual == expected


def test_last_seen_context_is_not_mutated(request_data):
    previous = {"RED-001": 90}
    response, after = exhaust(resolve_steps(request_data, previous))
    assert previous == {"RED-001": 90}
    assert after == {"RED-001": 60, "BLUE-001": 60}
    assert response["command_ack"]["status"] == "SUCCEEDED"
