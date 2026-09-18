"""D1a tests use independent in-memory/temp stores, never operator recordings."""
import asyncio
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.commands.contracts import CreateRunRequest, DirectMoveRequest
from app.commands.errors import CommandError
from app.commands.service import InteractiveService
from app.domain.models import LegacyCompactWorldFrame, WorldFrame
from app.main import create_app
from app.scenarios.contracts import ScenarioWrite, ScenarioRef
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical, read_frame
from test_interactive import Harness
from test_direct_movement import direct, issue
from test_movement import ticks


def content():
    return {"name": "Mixed arrangement", "units": [
        {"id": f"unit-{i}", "label": label, "category": category, "commandRole": role,
         "position": {"longitudeDeg": 103.85 + i * .001, "latitudeDeg": 1.29,
                      "altitude": {"metres": 150.125 + i, "reference": "ELLIPSOID", "datumId": "WGS84"}},
         "headingTrueDeg": 27.5 + i}
        for i, (label, category, role) in enumerate([
            ("Friendly controlled", "friendly", "sentinel"), ("Friendly observer", "friendly", "observation"),
            ("Hostile", "hostile", "observation"), ("Unknown", "unknown", "observation")])]}


def write(data=None, revision=0, identity=None):
    return ScenarioWrite.model_validate({"requestId": identity or str(uuid4()), "expectedRevision": revision, "content": data or content()})


def run_request(revision, identity=None):
    return CreateRunRequest(creation_id=identity or str(uuid4()), scenario=ScenarioRef(
        definition_id=revision.definition_id, revision=revision.revision, content_hash=revision.content_hash))


def test_revisions_cas_idempotency_and_reopen(tmp_path):
    h = Harness(tmp_path / "revisions.sqlite3")
    s = ScenarioService(h.authority, True)
    async def run():
        first = write()
        receipt = await s.write(first)
        rev = receipt.result
        assert receipt.accepted and rev.revision == 1
        assert await s.write(first) == s.lookup(first.request_id) == receipt
        second = write({**content(), "name": "Revised"}, 1)
        winner, conflict = await asyncio.gather(s.write(second, rev.definition_id), s.write(write(revision=1), rev.definition_id))
        assert winner.accepted and not conflict.accepted and conflict.code == "REVISION_CONFLICT"
        assert s.get(rev.definition_id, 1) == rev
        assert s.get(rev.definition_id).content.name == "Revised"
        assert s.lookup(second.request_id, rev.definition_id) == winner
        with pytest.raises(CommandError, match="different content"):
            await s.write(write({**content(), "name": "Other"}, identity=first.request_id))
        h.repo.close()
        reopened = Harness(tmp_path / "revisions.sqlite3")
        assert ScenarioService(reopened.authority, True).get(rev.definition_id, 1) == rev
        assert ScenarioService(reopened.authority, True).lookup(first.request_id) == receipt
        reopened.repo.close()
    asyncio.run(run())


def test_custom_run_pins_revision_separates_roles_and_restarts_fresh():
    h = Harness()
    s = ScenarioService(h.authority, True)
    async def run():
        rev = (await s.write(write())).result
        request = run_request(rev)
        results = await asyncio.gather(h.service.create(request), h.service.create(request))
        assert results[0] == results[1] == h.service.lookup(request.creation_id)
        mid = results[0].mission_id
        frame = h.authority.read(mid)
        assert frame.schema_version == "1.10" and frame.interactive.state == "ready"
        assert len(frame.entities) == 4 and len(frame.assets) == len(frame.interactive.controls) == 1
        assert frame.scenario.content_hash == rev.content_hash
        assert frame.entities[frame.scenario.entity_ids["unit-3"]].classification.label == "Unknown entity"
        assert json.loads(h.repo.db.execute("SELECT revision_json FROM scenario_runs").fetchone()[0])["content"] == content()
        for u in rev.content.units:
            eid = frame.scenario.entity_ids[u.id]
            track = next(t for t in frame.tracks.values() if t.entity_id == eid)
            assert canonical(track.latest.position) == canonical(u.position)
            assert track.latest.velocity.heading_true_deg == u.heading_true_deg
        await s.write(write({**content(), "name": "A later definition"}, 1), rev.definition_id)
        assert h.authority.read(mid).scenario.name == "Mixed arrangement"
        assert (await h.act(mid, "acquire")).accepted
        assert (await h.act(mid, "start")).accepted
        await ticks(h, 1)
        good = await issue(h, mid, direct(h, mid))
        assert good.accepted and good.member_outcomes[0].outcome == "accepted"
        for index in (1, 2, 3):
            bad = json.loads(canonical(direct(h, mid, order=index + 1)))
            bad["direct"]["members"][0]["entityId"] = frame.scenario.entity_ids[f"unit-{index}"]
            rejected = await issue(h, mid, DirectMoveRequest.model_validate(bad))
            assert not rejected.execution_ids
            assert all(o.outcome == "skipped" for o in rejected.member_outcomes)
        await ticks(h, 2)
        assert (await h.act(mid, "end")).accepted
        recorded = h.repo.latest_text(mid)
        old = h.authority.read(mid)
        again = await h.service.create(run_request(rev))
        new = h.authority.read(again.mission_id)
        assert (new.mission.id, new.recording_id, new.interactive.run_id) != (old.mission.id, old.recording_id, old.interactive.run_id)
        assert set(new.entities).isdisjoint(old.entities)
        assert new.scenario.content_hash == old.scenario.content_hash
        assert h.repo.latest_text(mid) == recorded
        assert await h.service.create(request) == results[0]
        assert h.repo.db.execute("SELECT COUNT(*) FROM scenario_runs").fetchone()[0] == 2
    asyncio.run(run())


@pytest.mark.parametrize("table", ["scenario_runs", "creation_receipts", "interactive_checkpoints", "frames"])
def test_creation_failure_rolls_back_every_run_artifact(table):
    h = Harness()
    async def run():
        rev = (await ScenarioService(h.authority, True).write(write())).result
        request = run_request(rev)
        h.repo.db.execute(f"CREATE TRIGGER fail_run BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'isolated test failure'); END")
        with pytest.raises(sqlite3.Error):
            await h.service.create(request)
        for target in ("recordings", "frames", "events", "demo_aliases", "interactive_checkpoints", "creation_receipts", "scenario_runs"):
            assert h.repo.db.execute(f"SELECT COUNT(*) FROM {target}").fetchone()[0] == 0
        assert h.service.entry().active_mission_id is None
        h.repo.db.execute("DROP TRIGGER fail_run")
        assert (await h.service.create(request)).accepted
    asyncio.run(run())


def test_save_failure_has_no_partial_revision_or_receipt():
    h = Harness()
    async def run():
        s = ScenarioService(h.authority, True)
        req = write()
        h.repo.db.execute("CREATE TRIGGER fail_save BEFORE INSERT ON scenario_receipts BEGIN SELECT RAISE(ABORT,'isolated test failure'); END")
        with pytest.raises(sqlite3.Error):
            await s.write(req)
        assert s.list().scenarios == []
        h.repo.db.execute("DROP TRIGGER fail_save")
        assert (await s.write(req)).result.revision == 1
    asyncio.run(run())


def test_current_migration_preserves_legacy_compact_bytes_receipts_and_profile(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    h = Harness(path)
    raw = (Path(__file__).parents[2] / "contracts/sentinel/v1.4/demo.world.json").read_text(encoding="utf-8")
    old = LegacyCompactWorldFrame.model_validate_json(raw)
    h.repo.establish(old.mission, old.recording_id, old.stream_epoch, old.recorded_at)
    h.repo.db.execute("INSERT INTO frames VALUES (?,?,?,?,?,?)", (old.frame_id, old.recording_id, old.sequence, old.effective_at, old.recorded_at, raw))
    h.repo.db.executescript("DROP TABLE scenario_runs; DROP TABLE scenario_receipts; DROP TABLE scenario_revisions; PRAGMA user_version=3;")
    h.repo.close()
    migrated = Harness(path)
    assert migrated.repo.db.execute("PRAGMA user_version").fetchone()[0] == 4
    assert migrated.repo.latest_text(old.mission.id) == raw
    adapted = migrated.authority.read(old.mission.id)
    assert adapted.schema_version == "1.10" and adapted.scenario is None
    assert canonical(adapted.interactive) == canonical({**json.loads(canonical(old.interactive)), "schemaVersion": "1.7"})
    invalid = json.loads(raw)
    invalid["scenario"] = {}
    with pytest.raises(ValidationError):
        read_frame(json.dumps(invalid))
    migrated.repo.close()


def test_http_exact_revision_validation_disabled_authoring_and_hash_binding(tmp_path):
    app = create_app(str(tmp_path / "api.sqlite3"), fixtures_enabled=False, demo_enabled=True)
    with TestClient(app) as client:
        body = json.loads(canonical(write()))
        first = client.post("/api/scenarios", json=body)
        assert first.status_code == 200
        receipt = first.json(); rev = receipt["result"]; did = rev["definitionId"]
        assert client.get("/api/scenarios/creations", params={"identity": body["requestId"]}).json() == receipt
        assert client.get(f"/api/scenarios/{did}?revision=1").json() == rev
        assert client.get("/api/scenarios").json()["scenarios"] == [rev]
        bad = json.loads(canonical(write()))
        bad["content"]["units"][2]["commandRole"] = "sentinel"
        assert client.post("/api/scenarios", json=bad).status_code == 422
        create = {"creationId": "create-exact", "scenario": {k: rev[k] for k in ("definitionId", "revision", "contentHash")}}
        create["scenario"]["contentHash"] = "0" * 64
        assert client.post("/api/interactive/runs", json=create).json()["code"] == "REFERENCE_MISMATCH"
        assert client.get("/api/missions").json()["missions"] == []
        create["creationId"] = "create-good"; create["scenario"]["contentHash"] = rev["contentHash"]
        result = client.post("/api/interactive/runs", json=create).json()
        assert result["accepted"]
        assert client.post("/api/interactive/runs", json=create).json() == result
        frame = client.get(f'/api/missions/{result["missionId"]}/world').json()
        WorldFrame.model_validate(frame)
        assert frame["interactive"]["state"] == "ready"
        assert client.post("/api/interactive/runs", json={**create, "templateId": "singapore-local-v2"}).status_code == 422
    with TestClient(create_app(str(tmp_path / "disabled.sqlite3"), fixtures_enabled=False, demo_enabled=False)) as client:
        assert client.post("/api/scenarios", json=body).status_code == 403


@pytest.mark.parametrize("change", ["hostile-role", "duplicate", "outside", "heading", "altitude", "empty-name", "limit", "invalid-id"])
def test_bounded_definition_validation(change):
    data = content()
    if change == "hostile-role": data["units"][2]["commandRole"] = "sentinel"
    if change == "duplicate": data["units"][1]["id"] = data["units"][0]["id"]
    if change == "outside": data["units"][0]["position"]["longitudeDeg"] = 105
    if change == "heading": data["units"][0]["headingTrueDeg"] = 360
    if change == "altitude": data["units"][0]["position"]["altitude"]["reference"] = "AGL"
    if change == "empty-name": data["name"] = " "
    if change == "limit": data["units"] *= 9
    if change == "invalid-id": data["units"][0]["id"] = " whitespace "
    with pytest.raises(ValidationError): write(data)


def test_custom_recovery_preserves_definition_and_observation_roles(tmp_path):
    h = Harness(tmp_path / "recovery.sqlite3")
    async def run():
        saved = (await ScenarioService(h.authority, True).write(write())).result
        request = run_request(saved)
        creation = await h.service.create(request)
        mid = creation.mission_id
        await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
        assert (await issue(h, mid, direct(h, mid))).accepted
        await ticks(h, 1)
        previous = h.authority.read(mid)
        h.repo.close()
        restarted = Harness(tmp_path / "recovery.sqlite3")
        await restarted.service.recover()
        frame = restarted.authority.read(mid)
        assert frame.interactive.state == "paused"
        assert frame.interactive.executor_epoch != previous.interactive.executor_epoch
        assert frame.interactive.executions[0].state == "Interrupted"
        assert frame.scenario == previous.scenario
        assert len(frame.assets) == len(frame.interactive.controls) == 1
        assert ScenarioService(restarted.authority, True).get(saved.definition_id) == saved
        assert await restarted.service.create(request) == creation
        restarted.repo.close()
    asyncio.run(run())
