import asyncio
import copy
import json
import sqlite3
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.adapters.simulation_v1.projection import mission_identity
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.simulation.policy import NAMESPACE, TRANSITIONS
from app.simulation.service import SimulationService
from app.simulation.validation import canonical_external, content_digest

FIXTURES = Path(__file__).resolve().parents[2] / "contracts/simulation/fixtures"


@pytest.fixture
def batch():
    return json.loads((FIXTURES / "golden.request.json").read_text())


@pytest.fixture
def api(tmp_path):
    app = create_app(str(tmp_path / "simulation.sqlite"), True, demo_enabled=True)
    with TestClient(app) as client:
        yield app, client


def send(client, body):
    return client.post("/api/simulation/v1/commands", content=json.dumps(body))


def transition(body, action, identity=None):
    changed = copy.deepcopy(body)
    changed["command"]["action"] = action
    changed["command"]["command_id"] = identity or action
    if action in {"HOLD", "ABORT"}:
        changed["samples_by_timestamp"] = {}
    return changed


def test_golden_commits_complete_joined_world_audit_and_original_body(api, batch):
    app, client = api
    raw = (FIXTURES / "golden.request.json").read_bytes()
    result = client.post("/api/simulation/v1/commands", content=raw)
    assert result.status_code == 200
    assert result.json() == json.loads((FIXTURES / "golden.response.json").read_text())
    mid = mission_identity(batch["mission_id"])
    world = client.get(f"/api/missions/{mid}/world").json()
    assert world["mission"]["domain"] == "external-simulation-v1"
    assert world["assets"] == {}  # BLUE is affiliation, never command authority.
    assert len(world["entities"]) == len(world["tracks"]) == 2
    assert {row["extensions"][NAMESPACE]["health"] for row in world["entities"].values()} == {60}
    assert all(row["condition"] == "operational" for row in world["entities"].values())
    assert all(track["latest"]["position"]["altitude"] == {"metres": 100.0, "reference": "MSL"} for track in world["tracks"].values())
    events = world["recentEvents"]
    assert [e["type"] for e in events] == ["simulation.v1.command-received", "simulation.v1.interaction", "simulation.v1.command-completed"]
    assert events[1]["extensions"][NAMESPACE]["result"] == next(iter(result.json()["results_by_timestamp"].values()))["interactions"][0]
    command = app.state.simulation.journal.command("CMD-0001")
    assert command["original_request"] == raw
    assert command["state"] == "completed"
    assert app.state.service.repository.recording_for(mid).frame_count == 2
    assert client.get("/api/simulation/v1/commands/CMD-0001/result").content == result.content
    assert client.get("/api/simulation/v1/runs").json()[0]["phase"] == "ready"


def test_complete_validation_precedes_any_recording_or_resolution(api, batch, monkeypatch):
    app, client = api
    batch["samples_by_timestamp"]["2026-09-06T00:00:02.000Z"] = [{"invalid": True}]
    monkeypatch.setattr("app.simulation.service.resolve_steps", lambda *args: pytest.fail("No evaluation allowed"))
    response = send(client, batch)
    assert response.status_code == 422
    assert not app.state.simulation.journal.exists()
    assert not app.state.service.repository.has_mission(mission_identity(batch["mission_id"]))


@pytest.mark.parametrize("prior", [None, "RUNNING", "HELD", "ABORTED"])
@pytest.mark.parametrize("action", ["START", "HOLD", "RESUME", "ABORT"])
def test_lifecycle_confirmed_and_provisional_matrix(api, batch, prior, action):
    app, client = api
    if prior:
        assert send(client, batch).status_code == 200
    if prior == "HELD":
        assert send(client, transition(batch, "HOLD", "SETUP-HOLD")).status_code == 200
    if prior == "ABORTED":
        assert send(client, transition(batch, "ABORT", "SETUP-ABORT")).status_code == 200
    response = send(client, transition(batch, action, "UNDER-TEST"))
    expected = TRANSITIONS[prior][action]
    assert response.status_code == (200 if expected in {"RUNNING", "HELD", "ABORTED"} else 409)
    assert response.json()["command_ack"]["run_status" if response.status_code == 200 else "error_code"] == expected
    if response.status_code == 409 and prior:
        assert app.state.simulation.status(mission_identity(batch["mission_id"])).state == prior


def test_retry_returns_exact_stored_response_after_abort_and_numeric_variants(api, batch):
    app, client = api
    original = send(client, batch)
    assert send(client, transition(batch, "ABORT")).status_code == 200
    variant = copy.deepcopy(batch)
    variant["resolution"]["interaction_radius_m"] = 100.0
    assert send(client, variant).content == original.content
    assert app.state.service.repository.recording_for(mission_identity(batch["mission_id"])).frame_count == 4
    variant["samples_by_timestamp"][next(iter(variant["samples_by_timestamp"]))].reverse()
    assert send(client, variant).json()["command_ack"]["error_code"] == "COMMAND_ID_CONFLICT"


def test_concurrent_duplicates_have_one_committed_outcome(api, batch):
    app, client = api
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: send(client, batch), range(6)))
    assert {r.status_code for r in responses} == {200}
    assert len({r.content for r in responses}) == 1
    assert app.state.service.repository.recording_for(mission_identity(batch["mission_id"])).frame_count == 2


def test_prepare_rollback_includes_schema_marker_and_publishes_nothing(api, batch, monkeypatch):
    app, client = api
    repo = app.state.service.repository
    version = repo.db.execute("PRAGMA user_version").fetchone()[0]
    published = []
    monkeypatch.setattr(app.state.service, "_publish", lambda *args: published.append(args))
    def fail(*args):
        raise sqlite3.OperationalError("injected storage failure")
    monkeypatch.setattr(repo, "commit", fail)
    result = send(client, batch)
    assert result.status_code == 503
    assert "may be pending" in result.json()["error"]["message"]
    assert not repo.has_mission(mission_identity(batch["mission_id"]))
    assert not app.state.simulation.journal.exists()
    assert repo.db.execute("PRAGMA user_version").fetchone()[0] == version
    assert published == []


def test_completion_rollback_keeps_prepared_recording_and_exact_retry(api, batch, monkeypatch):
    app, client = api
    repo, original = app.state.service.repository, app.state.service.repository.commit
    published, calls = [], 0
    monkeypatch.setattr(app.state.service, "_publish", lambda *args: published.append(args))
    def fail_completion(*args):
        nonlocal calls
        calls += 1
        result = original(*args)
        if calls == 2:
            raise sqlite3.OperationalError("failure after candidate frames")
        return result
    monkeypatch.setattr(repo, "commit", fail_completion)
    assert send(client, batch).status_code == 503
    mid = mission_identity(batch["mission_id"])
    assert repo.recording_for(mid).frame_count == repo.recording_for(mid).event_count == 1
    assert len(published) == 1
    assert app.state.simulation.status(mid).phase == "interrupted"
    assert send(client, transition(batch, "ABORT")).json()["command_ack"]["error_code"] == "RUN_COMMAND_PENDING"
    monkeypatch.setattr(repo, "commit", original)
    assert send(client, batch).json() == json.loads((FIXTURES / "golden.response.json").read_text())
    assert repo.recording_for(mid).frame_count == 2
    assert len(published) == 2


def test_restart_reconciles_interrupted_and_completed_commands(tmp_path, batch, monkeypatch):
    database = str(tmp_path / "restart.sqlite")
    app = create_app(database, False)
    with TestClient(app) as client:
        original = app.state.simulation._complete
        def fail(*args):
            raise sqlite3.OperationalError("simulated interrupted evaluation")
        monkeypatch.setattr(app.state.simulation, "_complete", fail)
        assert send(client, batch).status_code == 503
    restarted = create_app(database, False)
    with TestClient(restarted) as client:
        mid = mission_identity(batch["mission_id"])
        assert client.get(f"/api/simulation/v1/runs/{mid}").json()["phase"] == "interrupted"
        response = send(client, batch)
        assert response.status_code == 200
        assert restarted.state.service.repository.recording_for(mid).frame_count == 2
    with TestClient(create_app(database, False)) as client:
        assert send(client, batch).content == response.content


def test_http_cancellation_does_not_cancel_accepted_command(tmp_path, batch, monkeypatch):
    async def exercise():
        repo = RecordingRepository(str(tmp_path / "cancel.sqlite"))
        service = SimulationService(MissionService(repo))
        accepted, release = asyncio.Event(), asyncio.Event()
        original = service._prepare
        def prepare(*args):
            run = original(*args)
            accepted.set()
            return run
        monkeypatch.setattr(service, "_prepare", prepare)
        from app.simulation import service as module
        original_cooperate = module.cooperative
        async def pause_evaluation(iterator):
            if accepted.is_set():
                await release.wait()
            return await original_cooperate(iterator)
        monkeypatch.setattr(module, "cooperative", pause_evaluation)
        request = asyncio.create_task(service.submit(json.dumps(batch)))
        await accepted.wait()
        request.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request
        assert service._tasks
        release.set()
        await asyncio.gather(*service._tasks)
        assert service.journal.command("CMD-0001")["state"] == "completed"
        assert json.loads(await service.submit(json.dumps(batch)))["command_ack"]["status"] == "SUCCEEDED"
        await service.close()
        repo.close()
    asyncio.run(exercise())


def test_interactive_and_generic_sources_cannot_mutate_external_mission(api, batch):
    app, client = api
    assert send(client, batch).status_code == 200
    mid = mission_identity(batch["mission_id"])
    original = app.state.service.repository.latest_text(mid)
    with pytest.raises(ValueError, match="does not own"):
        asyncio.run(app.state.service.commit_source(mid, lambda previous: (previous, [])))
    from app.commands.errors import CommandError
    with pytest.raises(CommandError) as error:
        app.state.interactive._run(mid)
    assert error.value.code == "NOT_INTERACTIVE"
    assert app.state.service.repository.latest_text(mid) == original
    assert client.get("/api/missions/fixture-alpha/world").json()["sequence"] == 0


def test_backwards_resume_missing_observations_and_command_scoped_events(api, batch):
    app, client = api
    at = next(iter(batch["samples_by_timestamp"]))
    batch["samples_by_timestamp"]["2026-09-06T00:00:02.000Z"] = [dict(batch["samples_by_timestamp"][at][0], drone_id="LATER")]
    assert send(client, batch).status_code == 200
    assert send(client, transition(batch, "HOLD")).status_code == 200
    resumed = transition(batch, "RESUME")
    del resumed["samples_by_timestamp"]["2026-09-06T00:00:02.000Z"]
    result = send(client, resumed)
    assert result.status_code == 200
    assert all(row["state_discontinuity"] for row in result.json()["results_by_timestamp"][at]["drone_health"])
    world = client.get(f"/api/missions/{mission_identity(batch['mission_id'])}/world").json()
    later = next(e for e in world["entities"].values() if e["label"] == "LATER")
    assert later["presence"] == "unobserved" and later["condition"] == "unknown"
    assert NAMESPACE not in later["extensions"]
    assert all(t["latest"]["timestamp"] <= world["effectiveAt"] for t in world["tracks"].values())
    events = [e for e in world["recentEvents"] if e["type"] == "simulation.v1.interaction"]
    assert len(events) == 2 and events[0]["id"] != events[1]["id"]
    assert events[0]["extensions"][NAMESPACE]["result"]["interaction_id"] == events[1]["extensions"][NAMESPACE]["result"]["interaction_id"]


def test_profile_immutable_and_nonnotional_claim_requires_external_artifact(api, batch):
    app, client = api
    assert send(client, batch).status_code == 200
    altered = transition(batch, "HOLD")
    altered["calibration_profile"]["rules"][0]["probability"] = 0
    assert send(client, altered).json()["command_ack"]["error_code"] == "CALIBRATION_ID_CONFLICT"
    for evidence in ("PUBLIC_PARTIAL", "VALIDATED"):
        altered["calibration_profile"]["version"] = evidence
        altered["calibration_profile"]["evidence_status"] = evidence
        assert send(client, altered).json()["command_ack"]["error_code"] == "CALIBRATION_REPORT_REQUIRED"
    assert app.state.simulation.status(mission_identity(batch["mission_id"])).state == "RUNNING"


@pytest.mark.parametrize("column,value", [("request_json", "{}"), ("response_json", "{}"), ("policy_id", "future-policy")])
def test_corrupt_journal_fails_explicitly_and_never_reexecutes(api, batch, column, value):
    app, client = api
    assert send(client, batch).status_code == 200
    app.state.service.repository.db.execute(f"UPDATE simulation_commands SET {column}=?", (value,))
    assert send(client, batch).status_code == 503
    assert app.state.service.repository.recording_for(mission_identity(batch["mission_id"])).frame_count == 2


def test_external_id_namespace_cannot_overwrite_interactive_or_fixture_identity(api, batch):
    app, client = api
    batch["mission_id"] = "fixture-alpha"
    original = client.get("/api/missions/fixture-alpha/world").content
    assert send(client, batch).status_code == 200
    assert client.get("/api/missions/fixture-alpha/world").content == original
    assert mission_identity("fixture-alpha") != "fixture-alpha"


@pytest.mark.parametrize("raw,status", [(b'{"mission_id":1,"mission_id":2}', 400), (b'{', 400), (b'{}', 422), (b'null', 422)])
def test_unrecoverable_identity_has_documented_minimal_failure(api, raw, status):
    _, client = api
    result = client.post("/api/simulation/v1/commands", content=raw)
    assert result.status_code == status
    assert set(result.json()) == {"error"}


def test_recorded_command_pages_join_prior_results_after_abort(api, batch):
    app, client = api
    first = send(client, batch)
    assert send(client, transition(batch, "HOLD")).status_code == 200
    assert send(client, transition(batch, "ABORT")).status_code == 200
    mid = mission_identity(batch["mission_id"])
    page = client.get(f"/api/simulation/v1/runs/{mid}/commands?limit=2").json()
    assert [row["action"] for row in page] == ["START", "HOLD"]
    rest = client.get(f"/api/simulation/v1/runs/{mid}/commands?after={page[-1]['sequence']}&limit=2").json()
    assert [row["action"] for row in rest] == ["ABORT"]
    assert client.get("/api/simulation/v1/commands/CMD-0001/result").content == first.content
    assert json.loads(client.get(f"/api/simulation/v1/runs/{mid}/input").content)["command"]["action"] == "ABORT"


@pytest.mark.parametrize("boundary", ["prepared", "after_commit"])
def test_actual_process_death_before_or_after_completion_commit(tmp_path, batch, boundary):
    path = tmp_path / "killed.sqlite"
    raw = tmp_path / "request.json"
    raw.write_text(json.dumps(batch))
    program = '''
import asyncio, os, sys
from pathlib import Path
from app.recording.sqlite_repository import RecordingRepository
from app.missions.service import MissionService
from app.simulation.service import SimulationService
repo=RecordingRepository(sys.argv[1])
service=SimulationService(MissionService(repo))
if sys.argv[3]=='prepared':
    service._complete=lambda *args: os._exit(73)
else:
    original=service._publish
    count=0
    def publish(*args):
        global count
        count+=1
        if count==2: os._exit(73)
        original(*args)
    service._publish=publish
asyncio.run(service.submit(Path(sys.argv[2]).read_bytes()))
'''
    child = subprocess.run([sys.executable, "-c", program, str(path), str(raw), boundary],
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}, capture_output=True, timeout=20)
    assert child.returncode == 73, child.stderr.decode()
    app = create_app(str(path), False)
    with TestClient(app) as client:
        status = app.state.simulation.status(mission_identity(batch["mission_id"]))
        assert status.phase == ("interrupted" if boundary == "prepared" else "ready")
        result = send(client, batch)
        assert result.status_code == 200
        assert result.json() == json.loads((FIXTURES / "golden.response.json").read_text())
        metadata = app.state.service.repository.recording_for(status.mission_id)
        assert metadata.frame_count == 2 and metadata.event_count == 3


def test_disposable_v5_upgrade_preserves_existing_recorded_bytes_and_rollback(tmp_path, batch):
    from app.missions.fixtures import seed_fixtures
    path = tmp_path / "v5.sqlite"
    repo = RecordingRepository(str(path))
    asyncio.run(seed_fixtures(MissionService(repo)))
    repo.db.execute("PRAGMA user_version=5")
    original = [tuple(row) for row in repo.db.execute("SELECT * FROM frames ORDER BY frame_id")]
    repo.close()
    with TestClient(create_app(str(path), False)) as client:
        assert send(client, batch).status_code == 200
    reopened = RecordingRepository(str(path))
    assert reopened.db.execute("PRAGMA user_version").fetchone()[0] == 6
    assert [tuple(row) for row in reopened.db.execute("SELECT * FROM frames WHERE frame_id IN (%s) ORDER BY frame_id" % ','.join('?' for _ in original), [row[0] for row in original])] == original
    for row in original:
        from app.world.serialization import read_frame
        from app.recording.storage_codec import decode_text
        assert read_frame(decode_text(row[-1])).frame_id == row[0]
    reopened.close()


def test_reviewed_calibration_requires_exact_frozen_artifact(api, batch, tmp_path):
    from app.simulation.calibration import CalibrationRegistry
    app, client = api
    profile = batch["calibration_profile"]
    profile["evidence_status"] = "PUBLIC_PARTIAL"
    registry = CalibrationRegistry(tmp_path)
    app.state.simulation.calibrations = registry
    report = dict(schemaVersion="1.0", profileId=profile["profile_id"], version=profile["version"], evidenceStatus="PUBLIC_PARTIAL",
        profileSha256=content_digest(profile), dataset="Synthetic registry integration fixture, not empirical validation",
        collectionDates="Fixture only", inclusionExclusionRules="Fixture only", classMapping="Fixture only", missingDataPolicy="Fixture only",
        sampleCounts={"fixture": 1}, estimator="Fixture only", confidenceIntervals="Fixture only", geographicOperationalLimits="No physical applicability",
        reviewer="Automated fixture", datasetSha256="a"*64, approvalDate="2026-09-06T00:00:00.000Z")
    path = tmp_path / (content_digest(profile) + ".json")
    path.write_text(json.dumps(report))
    assert send(client, batch).status_code == 200
    frame = client.get(f"/api/missions/{mission_identity(batch['mission_id'])}/world").json()
    artifact = frame["recentEvents"][0]["extensions"][NAMESPACE]["calibrationArtifact"]
    assert artifact["report"] == report
    import hashlib
    assert artifact["artifactSha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    path.unlink()
    # A completed exact retry does not depend on mutable external registry state.
    assert send(client, batch).status_code == 200


def test_current_polygon_and_adapter_accept_small_nonzero_area(api, batch):
    _, client = api
    x, y, d = 103.85, 1.35, 1e-9
    batch["area"]["polygon"] = [[x,y], [x+d,y], [x+d,y+d], [x,y+d], [x,y]]
    batch["samples_by_timestamp"] = {next(iter(batch["samples_by_timestamp"])): []}
    assert send(client, batch).status_code == 200


def test_large_hash_collision_keeps_distinct_pairs_in_recorded_events(api, batch):
    _, client = api
    at = next(iter(batch["samples_by_timestamp"]))
    red, blue = batch["samples_by_timestamp"][at]
    batch["samples_by_timestamp"][at] = [dict(red, drone_id="a"), dict(red, drone_id="a|b"), dict(blue, drone_id="b|c"), dict(blue, drone_id="c")]
    response = send(client, batch)
    assert response.status_code == 200
    events = client.get(f"/api/missions/{mission_identity(batch['mission_id'])}/world").json()["recentEvents"]
    interactions = [event for event in events if event["type"] == "simulation.v1.interaction"]
    assert len({event["id"] for event in interactions}) == 4
    assert len({event["extensions"][NAMESPACE]["result"]["interaction_id"] for event in interactions}) == 3


@pytest.mark.parametrize("command_id", [".", "..", "a/../b", "a?b#c", "%2E"])
def test_opaque_command_result_query_survives_url_normalization(api, batch, command_id):
    _, client = api
    batch["command"]["command_id"] = command_id
    committed = send(client, batch)
    assert committed.status_code == 200
    recorded = client.get("/api/simulation/v1/command-result", params={"command_id": command_id})
    assert recorded.status_code == 200
    assert recorded.content == committed.content


def test_underflow_scale_polygon_survives_complete_adapter_path(api, batch):
    _, client = api
    d = 1e-170
    ring = [[0, 0], [d, 0], [d, d], [0, d], [0, 0]]
    batch["area"]["polygon"] = ring
    for row in next(iter(batch["samples_by_timestamp"].values())):
        row["longitude_deg"], row["latitude_deg"] = d / 2, d / 2
    response = send(client, batch)
    assert response.status_code == 200
    outcome = next(iter(response.json()["results_by_timestamp"].values()))
    assert outcome["interactions"][0]["outcome"] == "MUTUAL_EFFECT"
    frame = client.get(f"/api/missions/{mission_identity(batch['mission_id'])}/world").json()
    assert next(iter(frame["zones"].values()))["geometry"]["coordinates"] == [ring]


def test_small_crossing_ring_rejected_by_core_without_product_underflow():
    from app.domain.models import Polygon
    ring = [[0, 0], [3e-100, 3e-100], [0, 3e-100], [2e-100, 0], [0, 0]]
    with pytest.raises(ValueError, match="intersects"):
        Polygon.model_validate_json(json.dumps({"type": "Polygon", "coordinates": [ring]}))
