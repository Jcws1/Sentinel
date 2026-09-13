import asyncio
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.domain.models import WorldFrame
from app.main import create_app
from app.missions.fixtures import seed_fixtures, advance_fixture, fixture_mission, fixture_source
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.recording.history import project_history

MID = "fixture-observations"
EID = MID + "-friendly-01"


def seed(repository):
    service = MissionService(repository)
    asyncio.run(seed_fixtures(service))
    return service


def test_authored_recording_breaks_source_identity_and_no_role_double_count():
    repo = RecordingRepository(":memory:")
    service = seed(repo)
    frame = service.read(MID)
    assert (len(frame.entities), len(frame.tracks), len(frame.assets)) == (6, 6, 1)
    history = repo.observed_history(MID, EID, frame.frame_id, 60)
    assert history.through_sequence == 7
    assert [len(s.points) for s in history.segments] == [3, 2, 3]
    assert [s.break_reason for s in history.segments] == ["discontinuity", "discontinuity", "source-change"]
    assert [s.source.id for s in history.segments] == ["synthetic-observations-A", "synthetic-observations-A", "synthetic-observations-B"]
    assert [p.sequence for s in history.segments for p in s.points] == list(range(8))
    assert all(s.track_id == EID + "-track" for s in history.segments)
    assert not history.truncated
    repo.close()


def test_immutable_anchor_excludes_later_frames_and_survives_restart(tmp_path):
    path = str(tmp_path / "recorded.sqlite")
    repo = RecordingRepository(path)
    service = seed(repo)
    anchor = service.read(MID)
    before = repo.observed_history(MID, EID, anchor.frame_id, 60).model_dump_json()
    asyncio.run(advance_fixture(service, MID, 7))
    mutated = repo.observed_history(MID, EID, anchor.frame_id, 60)
    mutated.segments[0].points.clear()
    assert repo.observed_history(MID, EID, anchor.frame_id, 60).model_dump_json() == before
    repo.close()
    repo = RecordingRepository(path)
    assert repo.observed_history(MID, EID, anchor.frame_id, 60).model_dump_json() == before
    repo.close()


def test_history_window_and_api_mission_isolation(tmp_path):
    with TestClient(create_app(str(tmp_path / "api.sqlite"), True)) as client:
        anchor = client.get(f"/api/missions/{MID}/world").json()
        url = f"/api/missions/{MID}/observed-history"
        query = {"entityId": EID, "frameId": anchor["frameId"], "windowSeconds": 5}
        result = client.get(url, params=query)
        assert result.status_code == 200
        assert result.headers["cache-control"] == "no-store"
        assert result.json()["fromAt"] == "2026-09-10T00:00:30.000Z"
        assert [p["sequence"] for s in result.json()["segments"] for p in s["points"]] == [6, 7]
        assert client.get("/api/missions/fixture-alpha/observed-history", params=query).status_code == 404
        assert client.get(url, params={**query, "entityId": "absent / ?"}).json()["segments"] == []
        for seconds in (0, 4, 301):
            assert client.get(url, params={**query, "windowSeconds": seconds}).status_code == 422
        assert client.get(url).status_code == 422


def history_frames(world):
    # Committed frame-shaped inputs; a single source and Entity simplify exact assertions.
    base = deepcopy(world)
    tid = next(iter(base["tracks"]))
    eid = base["tracks"][tid]["entityId"]
    base["tracks"] = {tid: base["tracks"][tid]}
    base["recentEvents"] = []
    base["assets"] = {}
    def make(sequence, second, *, state="tracking", sample_second=None, source="test-source", reference="MSL", missing=False, discontinuity=False, longitude=103.8):
        frame = deepcopy(base)
        def at(n):
            return f"2026-09-10T00:{n // 60:02}:{n % 60:02}.000Z"
        frame.update(sequence=sequence, frameId=f"test-frame-{sequence}", effectiveAt=at(second))
        track = frame["tracks"][tid]
        track.update(state=state, source={"id":source,"kind":"import","mode":"simulated"})
        track["latest"].update(timestamp=at(second if sample_second is None else sample_second), discontinuity=discontinuity)
        track["latest"]["position"] = {"longitudeDeg":longitude,"latitudeDeg":1.35,"altitude":{"metres":100.0,"reference":reference}}
        if missing:
            frame["tracks"] = {}
        return WorldFrame.model_validate_json(json.dumps(frame))
    return make, eid


def project(frames, eid, seconds=120):
    return project_history(frames[-1], eid, seconds, [f.model_dump_json(by_alias=True) for f in reversed(frames)], False)


def test_frame_correction_precedence_and_sample_correction_precedence(world):
    make, eid = history_frames(world)
    frames = [make(0, 0), make(1, 5, longitude=103.81), make(2, 5, longitude=103.82),
              make(3, 10, sample_second=5, longitude=103.83), make(4, 15)]
    before = project(frames[:2], eid)
    after = project(frames, eid)
    assert before.segments[0].points[-1].sample.position.longitude_deg == 103.81
    points = [p for s in after.segments for p in s.points]
    assert [p.sample.timestamp for p in points] == [frames[0].effective_at, frames[1].effective_at, frames[4].effective_at]
    assert (points[1].sequence, points[1].sample.position.longitude_deg) == (3, 103.83)


@pytest.mark.parametrize("change,reason", [
    ({"source":"different"}, "source-change"),
    ({"reference":"AGL"}, "altitude-reference"),
    ({"discontinuity":True}, "discontinuity"),
    ({"sample_second":1}, "time-regression"),
])
def test_explicit_segment_boundaries(world, change, reason):
    make, eid = history_frames(world)
    result = project([make(0, 0), make(1, 5), make(2, 10, **change)], eid)
    assert [len(s.points) for s in result.segments] == [2, 1]
    assert result.segments[-1].break_reason == reason


@pytest.mark.parametrize("missing", [True, False])
def test_missing_or_stale_observation_cannot_be_bridged(world, missing):
    make, eid = history_frames(world)
    result = project([make(0, 0), make(1, 5, missing=missing, state="stale"), make(2, 10)], eid)
    assert [len(s.points) for s in result.segments] == [1, 1]
    assert result.segments[-1].break_reason == "missing-observation"


def test_unchanged_samples_are_not_new_observations_and_large_gap_breaks(world):
    make, eid = history_frames(world)
    result = project([make(0, 0), make(1, 5, sample_second=0), make(2, 10, sample_second=0), make(3, 50)], eid)
    assert [len(s.points) for s in result.segments] == [1, 1]
    assert result.segments[-1].break_reason == "observation-gap"
    assert result.segments[0].points[0].sequence == 2


def test_bounded_query_retains_latest_effective_instants_after_late_commits(monkeypatch):
    import app.recording.history as module
    monkeypatch.setattr(module, "MAX_FRAMES", 3)
    repo = RecordingRepository(":memory:")
    service = seed(repo)
    frame = service.read(MID)
    result = repo.observed_history(MID, EID, frame.frame_id, 60)
    assert result.inspected_frames == 3 and result.truncated
    assert [p.sequence for s in result.segments for p in s.points] == [5, 6, 7]
    repo.close()
