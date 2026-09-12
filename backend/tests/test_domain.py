import json
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.domain.models import AltitudeBand, Polygon, WorldFrame


def validate(world):
    return WorldFrame.model_validate_json(json.dumps(world))


@pytest.mark.parametrize("value", ["2026-02-30T00:00:00.000Z", "2026-09-10T24:00:00.000Z", "2026-09-10T00:00:00Z",
                                 "2026-09-10T00:00:00.000+00:00", "2026-09-10T00:00:60.000Z", 42])
def test_calendar_utc_millisecond_validation(world, value):
    world["effectiveAt"] = value
    with pytest.raises(ValidationError):
        validate(world)


@pytest.mark.parametrize("value", [-1, True, 1.5, "4", 9007199254740992])
def test_sequence_is_strict_safe_integer(world, value):
    world["sequence"] = value
    with pytest.raises(ValidationError):
        validate(world)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 181, "12", True])
def test_coordinates_are_finite_bounded_numbers(world, value):
    next(iter(world["tracks"].values()))["latest"]["position"]["longitudeDeg"] = value
    with pytest.raises(ValidationError):
        validate(world)


@pytest.mark.parametrize("table", ["entities", "tracks", "assets", "sensors", "zones", "tasks"])
def test_dictionary_identity_and_mission_membership(world, table):
    populated_roles(world)
    item = next(iter(world[table].values()))
    item["missionId"] = "another-mission"
    with pytest.raises(ValidationError, match="mission mismatch"):
        validate(world)
    item["missionId"] = world["mission"]["id"]
    item["id"] = "other-id"
    with pytest.raises(ValidationError, match="key/ID"):
        validate(world)


def populated_roles(world):
    entity = next(iter(world["entities"]))
    asset = next(iter(world["assets"]))
    mission_id = world["mission"]["id"]
    provenance = world["entities"][entity]["provenance"]
    world["zones"]["zone"] = {"id": "zone", "missionId": mission_id, "label": "Test zone", "purpose": "test-area",
        "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}, "provenance": provenance}
    world["sensors"]["sensor"] = {"id": "sensor", "missionId": mission_id, "entityId": entity, "modality": "test",
        "coverageZoneIds": ["zone"], "status": "unknown", "provenance": provenance}
    world["tasks"]["task"] = {"id": "task", "missionId": mission_id, "type": "test", "status": "proposed",
        "assetIds": [asset], "subjectEntityIds": [entity], "zoneIds": ["zone"], "provenance": provenance}
    world["assets"][asset]["taskIds"] = ["task"]
    world["mission"]["zoneIds"] = ["zone"]


@pytest.mark.parametrize("table,field", [("tracks", "entityId"), ("assets", "entityId"), ("assets", "taskIds"),
    ("sensors", "entityId"), ("sensors", "coverageZoneIds"), ("tasks", "assetIds"), ("tasks", "subjectEntityIds"), ("tasks", "zoneIds")])
def test_role_reference_integrity(world, table, field):
    populated_roles(world)
    item = next(iter(world[table].values()))
    item[field] = ["absent"] if field.endswith("Ids") else "absent"
    with pytest.raises(ValidationError, match="unresolved"):
        validate(world)


def test_events_mission_refs_sequences_and_assignment_reciprocity(world):
    populated_roles(world)
    validate(world)
    event = world["recentEvents"][0]
    for field, value in [("missionId", "wrong"), ("entityIds", ["absent"]), ("zoneIds", ["absent"]), ("taskIds", ["absent"])]:
        broken = deepcopy(world)
        broken["recentEvents"][0][field] = value
        with pytest.raises(ValidationError):
            validate(broken)
    duplicate = deepcopy(event)
    duplicate["id"] += "-2"
    world["recentEvents"].append(duplicate)
    with pytest.raises(ValidationError, match="strictly increasing"):
        validate(world)
    world["recentEvents"].pop()
    next(iter(world["assets"].values()))["taskIds"] = []
    with pytest.raises(ValidationError, match="both directions"):
        validate(world)


@pytest.mark.parametrize("rings", [[], [[[0, 0], [1, 0], [1, 1], [0, 1]]], [[[0, 0], [1, 1], [2, 2], [0, 0]]],
    [[[0, 0], [3, 2], [0, 3], [2, 0], [0, 0]]], [[[0, 0], [2, 0], [1, 0], [1, 1], [0, 0]]],
    [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]],
    [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[0, 0], [1, 1], [1, 2], [0, 0]]],
    [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], [[1.5, 1.5], [2, 1.5], [2, 2], [1.5, 1.5]]]])
def test_invalid_polygon_geometry(rings):
    with pytest.raises(ValidationError):
        Polygon.model_validate_json(json.dumps({"coordinates": rings}))


def test_valid_polygon_with_hole_and_winding_independence():
    rings = [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
    Polygon.model_validate_json(json.dumps({"coordinates": rings}))
    Polygon.model_validate_json(json.dumps({"coordinates": [list(reversed(ring)) for ring in rings]}))


@pytest.mark.parametrize("upper", [{"metres": -1, "reference": "MSL"}, {"metres": 100, "reference": "AGL"},
                                 {"metres": 100, "reference": "MSL", "datumId": "EGM96"}])
def test_inconsistent_altitude_band(upper):
    with pytest.raises(ValidationError):
        AltitudeBand.model_validate_json(json.dumps({"lower": {"metres": 0, "reference": "MSL"}, "upper": upper}))


def test_mission_and_zone_time_ranges(world):
    populated_roles(world)
    world["zones"]["zone"].update(validFrom="2026-09-11T00:00:00.000Z", validUntil="2026-09-10T00:00:00.000Z")
    with pytest.raises(ValidationError, match="validFrom"):
        validate(world)
    world["zones"]["zone"].pop("validFrom")
    world["mission"]["updatedAt"] = "2025-01-01T00:00:00.000Z"
    with pytest.raises(ValidationError, match="updatedAt"):
        validate(world)


def test_simulation_fields_not_core_and_external_identity_preserved(world):
    entity = next(iter(world["entities"].values()))
    entity["provenance"]["source"]["externalId"] = "  external raw ID  "
    validate(world)
    entity["health"] = 100
    with pytest.raises(ValidationError):
        validate(world)


def test_nonfinite_extensions_rejected(world):
    world["mission"]["extensions"] = {"bad": {"nested": float("nan")}}
    with pytest.raises(ValidationError):
        validate(world)


@pytest.mark.parametrize("identifier", ["\x00", "\x00abc", "abc\x00", " abc", "abc ", "a\nb", ""])
def test_internal_ids_reject_controls_and_boundary_whitespace(world, identifier):
    world["frameId"] = identifier
    with pytest.raises(ValidationError):
        validate(world)


def test_version_is_explicit_at_the_wire_boundary(world):
    del world["schemaVersion"]
    with pytest.raises(ValidationError):
        validate(world)


def test_current_track_cannot_leak_future_observation(world):
    next(iter(world["tracks"].values()))["latest"]["timestamp"] = "2026-09-11T00:00:00.000Z"
    with pytest.raises(ValidationError, match="timestamp exceeds"):
        validate(world)


def test_source_effective_time_may_be_later_than_recording_wall_time(world):
    world["effectiveAt"] = "2028-01-01T00:00:00.000Z"
    validate(world)
