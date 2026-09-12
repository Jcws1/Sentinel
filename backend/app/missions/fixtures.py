"""Opt-in deterministic synthetic source, independent of simulation semantics.

The manifest explicitly declares one managed resource. No readiness, confidence,
assignment, drone class, health, resolution or simulation lifecycle is fabricated.
Coordinates describe an arbitrary non-operational test area.
"""
import json
from datetime import datetime, timedelta, timezone

from app.domain.models import Mission
from app.missions.service import MissionService
from app.missions.tactical_fixture import TACTICAL_FIXTURE_ID, tactical_mission, tactical_source
from app.world.serialization import canonical

FIXTURE_IDS = ("fixture-alpha", "fixture-bravo", TACTICAL_FIXTURE_ID)
BASE_TIME = datetime(2026, 9, 10, 0, 0, 0, tzinfo=timezone.utc)


def instant(sequence: int) -> str:
    return (BASE_TIME + timedelta(seconds=sequence * 5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def fixture_mission(mission_id: str) -> Mission:
    if mission_id == TACTICAL_FIXTURE_ID:
        return tactical_mission()
    if mission_id not in FIXTURE_IDS:
        raise KeyError(mission_id)
    return Mission(id=mission_id, name="Synthetic " + mission_id.removeprefix("fixture-").title(),
                   domain="synthetic-foundation", lifecycle="active", created_at=instant(0), updated_at=instant(0),
                   extensions={"sentinel.fixture": {"version": 1}})


def fixture_source(mission_id: str, sequence: int, recorded_at: str) -> tuple[dict, list[dict]]:
    if mission_id == TACTICAL_FIXTURE_ID:
        return tactical_source(sequence, recorded_at)
    effective_at = instant(sequence)
    mission = json.loads(canonical(fixture_mission(mission_id)))
    mission["updatedAt"] = effective_at
    source = {"id": "synthetic-foundation-v1", "kind": "import", "mode": "simulated"}
    provenance = {"source": source, "effectiveAt": effective_at, "recordedAt": recorded_at}
    frame = {"mission": mission, "effectiveAt": effective_at, "entities": {}, "tracks": {},
             "assets": {}, "sensors": {}, "zones": {}, "tasks": {}}
    count = (3 if mission_id == "fixture-alpha" else 2) + sequence % 2
    for index in range(count):
        entity_id = f"{mission_id}-object-{index + 1:02d}"
        frame["entities"][entity_id] = {
            "id": entity_id, "missionId": mission_id, "label": f"Fixture object {index + 1:02d}",
            "kind": "test-object", "affiliation": "unknown", "condition": "unknown", "presence": "present",
            "provenance": provenance, "extensions": {}}
        track_id = entity_id + "-track"
        frame["tracks"][track_id] = {
            "id": track_id, "missionId": mission_id, "entityId": entity_id, "source": source, "state": "tracking",
            "latest": {"timestamp": effective_at, "position": {"longitudeDeg": 12.0 + index * .01 + (sequence % 100) * .0001,
                       "latitudeDeg": -24.0 + index * .01, "altitude": {"metres": 100.0 + index * 20.0, "reference": "MSL"}}, "discontinuity": False},
            "historySeriesId": track_id + "-history"}
    asset_id = mission_id + "-resource-01"
    frame["assets"][asset_id] = {"id": asset_id, "missionId": mission_id,
        "entityId": f"{mission_id}-object-01", "availability": "unknown", "capabilityCodes": [], "taskIds": [], "provenance": provenance}
    event = {"effectiveAt": effective_at, "type": "fixture.sample-committed", "severity": "info",
             "entityIds": [], "zoneIds": [], "taskIds": [], "source": source,
             "extensions": {"sentinel.fixture": {"sampleIndex": sequence}}}
    return frame, [event]


async def seed_fixtures(service: MissionService):
    for mission_id in FIXTURE_IDS:
        await service.establish(fixture_mission(mission_id))
        if service.repository.latest_text(mission_id) is None:
            await service.commit_source(mission_id, lambda previous, mid=mission_id: fixture_source(mid, 0, service.clock()))


async def advance_fixture(service: MissionService, mission_id: str, expected_sequence: int):
    if mission_id not in FIXTURE_IDS:
        raise KeyError(mission_id)
    return await service.commit_source(mission_id, lambda previous: fixture_source(mission_id, previous["sequence"] + 1, service.clock()), expected_sequence)
