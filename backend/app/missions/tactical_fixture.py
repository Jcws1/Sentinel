"""Small backend-authored spatial fixture; no simulation or operational claims.

Three canned samples exercise map updates, including an absent identity and an
identity whose position becomes unavailable. Repeat samples by index for browser
checks without generating positions or lifecycle decisions in the renderer.
"""
import json
from datetime import datetime, timedelta, timezone

from app.domain.models import Mission
from app.world.serialization import canonical

TACTICAL_FIXTURE_ID = "fixture-tactical"
ZONE_ID = TACTICAL_FIXTURE_ID + "-area"
BASE_TIME = datetime(2026, 9, 10, 0, 0, 0, tzinfo=timezone.utc)


def _instant(sequence: int) -> str:
    return (BASE_TIME + timedelta(seconds=sequence * 5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def tactical_mission() -> Mission:
    return Mission(
        id=TACTICAL_FIXTURE_ID, name="Synthetic Tactical", domain="synthetic-map-foundation",
        lifecycle="active", created_at=_instant(0), updated_at=_instant(0), zone_ids=[ZONE_ID],
        reference_point={"longitude_deg": 103.85, "latitude_deg": 1.35,
                         "altitude": {"metres": 0.0, "reference": "MSL"}},
        extensions={"sentinel.fixture": {"version": 1}},
    )


def tactical_source(sequence: int, recorded_at: str) -> tuple[dict, list[dict]]:
    stage = sequence % 3
    effective_at = _instant(sequence)
    mission = json.loads(canonical(tactical_mission()))
    mission["updatedAt"] = effective_at
    source = {"id": "synthetic-tactical-v1", "kind": "import", "mode": "simulated"}
    provenance = {"source": source, "effectiveAt": effective_at, "recordedAt": recorded_at}
    frame = {"mission": mission, "effectiveAt": effective_at, "entities": {}, "tracks": {},
             "assets": {}, "sensors": {}, "zones": {}, "tasks": {}}

    # Each coordinate is an arbitrary test point, not a real asset or route.
    definitions = [
        ("friendly-01", "F-01", "friendly", 103.836, 1.354, 120.0),
        ("hostile-01", "H-01", "hostile", 103.862, 1.365, 180.0),
        ("neutral-01", "N-01", "neutral", 103.866, 1.339, 80.0),
        ("unknown-01", "U-01", "unknown", 103.844, 1.336, 100.0),
        ("unlocated-01", "No position", "unknown", None, None, None),
        ("stale-01", "Last observed", "unknown", 103.827, 1.373, 60.0),
    ]
    if stage in (1, 2):
        definitions.append(("friendly-02", "F-02", "friendly", 103.854, 1.350, 140.0))
    for suffix, label, affiliation, longitude, latitude, altitude in definitions:
        if stage == 2 and suffix == "unknown-01":
            continue
        entity_id = TACTICAL_FIXTURE_ID + "-" + suffix
        stale = suffix == "stale-01"
        frame["entities"][entity_id] = {
            "id": entity_id, "missionId": TACTICAL_FIXTURE_ID, "label": label,
            "kind": "test-object", "affiliation": affiliation, "condition": "unknown",
            "presence": "unobserved" if stale else "present", "provenance": provenance, "extensions": {},
        }
        if longitude is None or (stage == 2 and suffix == "friendly-01"):
            continue
        if stage == 1 and suffix == "friendly-01":
            longitude, latitude = 103.839, 1.356
        track_id = entity_id + "-track"
        frame["tracks"][track_id] = {
            "id": track_id, "missionId": TACTICAL_FIXTURE_ID, "entityId": entity_id,
            "source": source, "state": "stale" if stale else "tracking",
            "latest": {"timestamp": _instant(-3) if stale else effective_at,
                       "position": {"longitudeDeg": longitude, "latitudeDeg": latitude,
                                    "altitude": {"metres": altitude, "reference": "MSL"}},
                       "discontinuity": False},
            "historySeriesId": track_id + "-history",
        }
    east = 103.885 if stage in (1, 2) else 103.878
    frame["zones"][ZONE_ID] = {
        "id": ZONE_ID, "missionId": TACTICAL_FIXTURE_ID, "label": "Synthetic test area",
        "purpose": "test-area", "geometry": {"type": "Polygon", "coordinates": [[
            [103.822, 1.328], [east, 1.328], [east, 1.378], [103.822, 1.378], [103.822, 1.328],
        ]]}, "provenance": provenance,
    }
    event = {"effectiveAt": effective_at, "type": "fixture.sample-committed", "severity": "info",
             "entityIds": [], "zoneIds": [], "taskIds": [], "source": source,
             "extensions": {"sentinel.fixture": {"sampleIndex": sequence, "stage": stage}}}
    return frame, [event]
