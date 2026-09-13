"""Explicit synthetic recorded observations for browsing/trail verification.

Separate mission; existing Alpha/Bravo/Tactical fixtures remain unchanged. The
source supplies eight initial frames so a fresh local demo has recorded movement.
"""
import json
from datetime import datetime, timedelta, timezone
from app.domain.models import Mission
from app.missions.tactical_fixture import tactical_source

OBSERVATION_FIXTURE_ID = "fixture-observations"
BASE = datetime(2026, 9, 10, tzinfo=timezone.utc)
POSITIONS = [(103.836, 1.354, 120.0), (103.8365, 1.3542, 125.0), (103.837, 1.3544, 130.0),
             (103.840, 1.355, 140.0), (103.8405, 1.3552, 145.0), (103.841, 1.3554, 150.0),
             (103.8415, 1.3556, 150.0), (103.842, 1.3558, 150.0)]


def at(sequence):
    return (BASE + timedelta(seconds=sequence * 5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def observation_source(sequence: int, recorded_at: str):
    frame, events = tactical_source(0, recorded_at)
    frame, events = json.loads(json.dumps([frame, events]).replace("fixture-tactical", OBSERVATION_FIXTURE_ID)
                               .replace("synthetic-tactical-v1", "synthetic-observations-A"))
    frame["mission"].update(name="Synthetic Observations", domain="synthetic-entity-browsing", updatedAt=at(sequence))
    frame["mission"]["extensions"] = {"sentinel.fixture": {"version": 1, "description": "Authored observation, provenance and trail-break cases."}}
    frame["effectiveAt"] = at(sequence)
    for entity in frame["entities"].values():
        entity["provenance"]["effectiveAt"] = at(sequence)
    for track in frame["tracks"].values():
        if track["state"] == "tracking":
            track["latest"]["timestamp"] = at(sequence)
    entity_id = OBSERVATION_FIXTURE_ID + "-friendly-01"
    entity = frame["entities"][entity_id]
    entity["classification"] = {"scheme": "sentinel.fixture.kind", "code": "test-marker", "label": "Test marker"}
    track = frame["tracks"][entity_id + "-track"]
    lon, lat, height = POSITIONS[sequence % len(POSITIONS)]
    track["latest"].update(position={"longitudeDeg": lon, "latitudeDeg": lat, "altitude": {"metres": height, "reference": "MSL"}},
                           velocity={"speedMps": 12.0, "headingTrueDeg": 68.0}, discontinuity=sequence % 8 in (0, 3))
    if sequence % 8 >= 5:
        track["source"]["id"] = "synthetic-observations-B"
    # A second explicitly supplied observation stream is not another Entity.
    alternate = json.loads(json.dumps(track))
    alternate.update(id=entity_id+"-alternate", historySeriesId=entity_id+"-alternate-history", state="ended",
                     source={"id":"synthetic-observations-secondary","kind":"import","mode":"simulated"})
    alternate["latest"].update(timestamp=at(0), discontinuity=False)
    frame["tracks"][alternate["id"]] = alternate
    # Zero is a known measurement; other fixture rows have no velocity supplied.
    frame["tracks"][OBSERVATION_FIXTURE_ID+"-neutral-01-track"]["latest"]["velocity"] = {"speedMps":0.0,"headingTrueDeg":0.0}
    resource_id, task_id = OBSERVATION_FIXTURE_ID+"-resource", OBSERVATION_FIXTURE_ID+"-task"
    frame["assets"][resource_id] = {"id":resource_id,"missionId":OBSERVATION_FIXTURE_ID,"entityId":entity_id,
        "availability":"unknown","taskIds":[task_id],"capabilityCodes":[],"provenance":entity["provenance"]}
    frame["tasks"][task_id] = {"id":task_id,"missionId":OBSERVATION_FIXTURE_ID,"type":"fixture-record-inspection","status":"proposed",
        "assetIds":[resource_id],"subjectEntityIds":[entity_id],"zoneIds":[],"provenance":entity["provenance"]}
    # Subsequent explicit advances test missing and returning selected observations.
    if sequence == 8:
        frame["tracks"].pop(entity_id+"-track")
        frame["tracks"].pop(alternate["id"])
    if sequence == 9:
        frame["entities"].pop(OBSERVATION_FIXTURE_ID+"-unknown-01")
        frame["tracks"].pop(OBSERVATION_FIXTURE_ID+"-unknown-01-track")
    for event in events:
        event["effectiveAt"] = at(sequence)
        event["extensions"]["sentinel.fixture"] = {"sampleIndex":sequence}
    return frame, events


def observation_mission() -> Mission:
    return Mission.model_validate_json(json.dumps(observation_source(0, at(0))[0]["mission"]))
