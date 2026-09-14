import asyncio
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from app.commands.contracts import CommandRequest, CreateRunRequest
from app.commands.policy import accepted_work_state
from app.commands.service import CommandError, InteractiveService, plus
from app.domain.models import LegacyWorldFrame
from app.main import create_app
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.world.serialization import canonical

CREDENTIAL = "a" * 64
OTHER = "b" * 64


class Harness:
    def __init__(self, path=":memory:"):
        self.now = "2026-09-14T00:00:00.000Z"
        self.repo = RecordingRepository(str(path))
        self.authority = MissionService(self.repo, clock=lambda: self.now)
        self.service = InteractiveService(self.authority, True)

    async def create(self, identity=None):
        return await self.service.create(CreateRunRequest(creation_id=identity or str(uuid4()), template_id="singapore-local-v1"))

    async def request(self, mid, action, holder="operator-one"):
        return CommandRequest(command_id=str(uuid4()), holder_id=holder, intent=await self.service.issue_intent(mid, action))

    async def act(self, mid, action, credential=CREDENTIAL, holder="operator-one"):
        return await self.service.command(mid, await self.request(mid, action, holder), credential)

    def advance(self, seconds):
        self.now = plus(self.now, seconds)


def test_repeatable_long_pause_receipts_source_clock_and_terminal_recording():
    h = Harness()
    async def exercise():
        first = await h.create("creation-one")
        mid = first.mission_id
        assert h.authority.read(mid).interactive.state == "ready"
        assert first == await h.create("creation-one")
        assert not (await h.create()).accepted
        assert (await h.act(mid, "acquire")).accepted
        start = await h.request(mid, "start")
        receipt = await h.service.command(mid, start, CREDENTIAL)
        assert receipt.accepted
        h.advance(1)
        await h.service.tick()
        initial = h.authority.read(mid)
        assert initial.interactive.tick == 1
        assert (await h.act(mid, "pause")).accepted
        paused = h.authority.read(mid)
        for _ in range(4):
            h.advance(10)
            assert (await h.act(mid, "renew")).accepted
            await h.service.tick()
        assert h.authority.read(mid).effective_at == paused.effective_at
        assert h.authority.read(mid).interactive.last_report_at == initial.interactive.last_report_at
        assert (await h.act(mid, "resume")).accepted
        # Old receipt is immutable despite changed lifecycle, lease, and deadline.
        assert await h.service.command(mid, start, None) == receipt
        assert h.service.lookup(start.command_id, mid) == receipt
        assert h.service.status(mid, CREDENTIAL).run.state == "running"
        assert (await h.act(mid, "end")).accepted
        final = h.repo.latest_text(mid)
        assert all(e.condition == "operational" for e in h.authority.read(mid).entities.values())
        second = await h.create()
        assert len({first.mission_id, second.mission_id, first.run_id, second.run_id, first.recording_id, second.recording_id}) == 6
        assert h.repo.latest_text(mid) == final
        assert h.authority.read(second.mission_id).sequence == 0
        assert h.repo.active_interactive() == second.mission_id
    asyncio.run(exercise())


def test_duplicate_conflict_and_atomic_concurrent_creation_and_commands():
    h = Harness()
    async def exercise():
        first, second = await asyncio.gather(h.create("same"), h.create("same"))
        assert first == second
        mid = first.mission_id
        # Conflicting canonical payload, including a different requester, is deterministic.
        request = await h.request(mid, "acquire")
        receipts = await asyncio.gather(h.service.command(mid, request, CREDENTIAL), h.service.command(mid, request, CREDENTIAL))
        assert receipts[0] == receipts[1]
        assert h.authority.read(mid).sequence == 1
        changed = request.model_copy(update={"holder_id": "different"})
        with pytest.raises(CommandError) as failure:
            await h.service.command(mid, changed, CREDENTIAL)
        assert failure.value.code == "IDENTITY_CONFLICT"
        with pytest.raises(CommandError) as failure:
            await h.service.create(CreateRunRequest(creation_id="same", template_id="different-template"))
        assert failure.value.code == "IDENTITY_CONFLICT"
        a, b = await h.request(mid, "start"), await h.request(mid, "start")
        results = await asyncio.gather(h.service.command(mid, a, CREDENTIAL), h.service.command(mid, b, CREDENTIAL))
        assert [r.code for r in results] == ["OK", "OBSOLETE_INTENT"]
    asyncio.run(exercise())


def test_lease_expiry_reclaim_no_silent_takeover_public_identity_and_revocation():
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        assert (await h.act(mid, "acquire")).accepted
        assert (await h.act(mid, "start", OTHER)).code == "CONTROL_REQUIRED"
        assert (await h.act(mid, "acquire", OTHER)).code == "CONTROL_HELD"
        assert (await h.act(mid, "reclaim", OTHER)).code == "CONTROL_HELD"
        h.advance(10)
        assert (await h.act(mid, "renew")).accepted
        h.advance(21)
        assert h.service.status(mid, CREDENTIAL).owns_control
        h.advance(10)
        assert h.service.status(mid, CREDENTIAL).lease_state == "expired"
        assert (await h.act(mid, "renew")).code == "LEASE_EXPIRED"
        assert (await h.act(mid, "acquire", OTHER)).code == "RECLAIM_REQUIRED"
        assert (await h.act(mid, "reclaim", OTHER, "operator-two")).accepted
        assert (await h.act(mid, "start")).code == "CONTROL_REQUIRED"
        assert (await h.act(mid, "revoke", OTHER, "operator-two")).accepted
        assert not h.service.status(mid, OTHER).owns_control
        assert (await h.act(mid, "acquire")).accepted
        assert (await h.act(mid, "start")).accepted
    asyncio.run(exercise())


@pytest.mark.parametrize("key,value", [("missionId", "wrong"), ("runId", "wrong"), ("sourceId", "demo-observer-v1"),
                                       ("grantId", "wrong"), ("executorEpoch", "wrong")])
def test_wrong_reference_and_changed_intent_are_rejected(key, value):
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        await h.act(mid, "acquire")
        request = json.loads(canonical(await h.request(mid, "start")))
        request["intent"][key] = value
        receipt = await h.service.command(mid, CommandRequest.model_validate_json(json.dumps(request)), CREDENTIAL)
        assert receipt.code == "REFERENCE_MISMATCH"
        assert h.authority.read(mid).interactive.state == "ready"
    asyncio.run(exercise())


def test_obsolete_expired_intents_and_full_transition_matrix():
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        await h.act(mid, "acquire")
        old = await h.request(mid, "start")
        h.advance(31)
        assert (await h.service.command(mid, old, CREDENTIAL)).code == "INTENT_EXPIRED"
        await h.act(mid, "reclaim")
        assert (await h.act(mid, "resume")).code == "INVALID_TRANSITION"
        assert (await h.act(mid, "pause")).code == "INVALID_TRANSITION"
        assert (await h.act(mid, "start")).accepted
        assert (await h.act(mid, "start")).code == "INVALID_TRANSITION"
        assert (await h.act(mid, "resume")).code == "INVALID_TRANSITION"
        await h.act(mid, "pause")
        assert (await h.act(mid, "start")).code == "INVALID_TRANSITION"
        assert (await h.act(mid, "pause")).code == "INVALID_TRANSITION"
        h.advance(100)
        await h.act(mid, "reclaim")
        assert (await h.act(mid, "end")).accepted
        for action in ("start", "pause", "resume", "end", "acquire", "reclaim", "renew", "revoke"):
            assert (await h.act(mid, action)).code == "RUN_TERMINAL"
    asyncio.run(exercise())


def test_bindings_are_explicit_display_track_and_affiliation_are_not_grants():
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        frame = h.authority.read(mid)
        assert len(frame.entities) == 6 and len(frame.assets) == 4
        f1 = next(e.id for e in frame.entities.values() if e.label == "F-01")
        binding = next(c for c in frame.interactive.controls if c.entity_id == f1)
        assert frame.tracks[binding.control_track_id].source.id == binding.source_id
        alternate = next(t for t in frame.tracks.values() if t.id.endswith("alternate"))
        assert alternate.source.id != binding.source_id
        f5 = next(e for e in frame.entities.values() if e.label == "F-05")
        assert f5.affiliation == "friendly" and not any(c.entity_id == f5.id for c in frame.interactive.controls)
        assert all(not c.eligible for c in frame.interactive.controls)
        assert "scenario-pair" in frame.interactive.capabilities
        assert not any(a in frame.interactive.supported_actions for a in ("move", "encounter"))
    asyncio.run(exercise())


@pytest.mark.parametrize("table", ["frames", "events", "interactive_checkpoints", "creation_receipts"])
def test_creation_failure_rolls_back_all_identities(table):
    h = Harness()
    h.repo.db.execute(f"CREATE TRIGGER fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    async def exercise():
        with pytest.raises(sqlite3.Error):
            await h.create("stable")
        assert h.repo.list_missions() == []
        assert h.repo.receipt("stable") is None
        h.repo.db.execute("DROP TRIGGER fail")
        assert (await h.create("stable")).accepted
    asyncio.run(exercise())


@pytest.mark.parametrize("table", ["frames", "events", "interactive_checkpoints", "command_receipts"])
def test_command_failure_adopts_and_publishes_nothing(table):
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        saved = h.repo.latest_text(mid)
        checkpoint = h.repo.checkpoint(mid)
        _, subscription = await h.authority.subscribe(mid)
        h.repo.db.execute(f"CREATE TRIGGER fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        request = await h.request(mid, "acquire")
        with pytest.raises(sqlite3.Error):
            await h.service.command(mid, request, CREDENTIAL)
        assert h.repo.latest_text(mid) == saved and h.repo.checkpoint(mid) == checkpoint
        assert subscription.queue.empty() and not h.service._owns(mid, CREDENTIAL)
        assert h.repo.receipt(request.command_id, mid) is None
        h.repo.db.execute("DROP TRIGGER fail")
        assert (await h.service.command(mid, request, CREDENTIAL)).accepted
    asyncio.run(exercise())


def test_restart_checkpoint_epoch_history_break_and_immutable_receipt(tmp_path):
    h = Harness(tmp_path / "restart.sqlite3")
    async def before():
        mid = (await h.create("restart-run")).mission_id
        await h.act(mid, "acquire")
        receipt = await h.act(mid, "start")
        h.advance(1)
        await h.service.tick()
        # Narrow execution double only, no later executor implementation.
        checkpoint = h.repo.checkpoint(mid)
        checkpoint["executions"] = [{"id": "accepted-double", "state": "Accepted"}, {"id": "completed-double", "state": "Completed"}]
        h.repo.save_checkpoint(mid, checkpoint)
        return mid, receipt, h.authority.read(mid), await h.request(mid, "pause")
    mid, receipt, before_frame, old = asyncio.run(before())
    original = h.repo.db.execute("SELECT frame_json FROM frames ORDER BY sequence").fetchall()
    h.repo.close()
    recovered = Harness(tmp_path / "restart.sqlite3")
    async def after():
        await recovered.service.recover()
        frame = recovered.authority.read(mid)
        assert frame.interactive.state == "paused" and frame.interactive.executor_epoch != before_frame.interactive.executor_epoch
        assert frame.stream_epoch == before_frame.stream_epoch and frame.recording_id == before_frame.recording_id
        assert frame.effective_at == before_frame.effective_at
        assert recovered.repo.checkpoint(mid)["executions"] == [{"id": "accepted-double", "state": "Interrupted", "reason": "backend-restart"}, {"id": "completed-double", "state": "Completed"}]
        assert all(t.latest.discontinuity for t in frame.tracks.values())
        assert not recovered.service.status(mid, CREDENTIAL).owns_control
        assert recovered.service.lookup(receipt.request_id, mid) == receipt
        assert (await recovered.service.command(mid, old, CREDENTIAL)).code == "INTENT_INVALID"
        assert (await recovered.act(mid, "acquire")).accepted
        assert (await recovered.act(mid, "resume")).accepted
        assert [r[0] for r in recovered.repo.db.execute("SELECT frame_json FROM frames ORDER BY sequence LIMIT ?", (len(original),))] == [r[0] for r in original]
    asyncio.run(after())


def test_accepted_work_policy_does_not_use_current_lease():
    base = dict(run_state="running", accepted_epoch="epoch", current_epoch="epoch", accepted_grant_revision=1,
                current_grant_revision=1, cancelled=False, deadline="02", now="01", started=False)
    assert accepted_work_state(**base) == "Eligible"
    # Expired/browser-disposed lease cannot be passed to this execution policy.
    assert accepted_work_state(**(base | {"run_state": "paused", "now": "03"})) == "Expired"
    assert accepted_work_state(**(base | {"run_state": "paused", "started": True, "now": "03"})) == "Suspended"
    assert accepted_work_state(**(base | {"started": True, "now": "03"})) == "Eligible"
    for change, expected in [({"current_epoch": "restart"}, "Interrupted"), ({"current_grant_revision": 2}, "Cancelled"), ({"cancelled": True}, "Cancelled"), ({"run_state": "ended"}, "Cancelled")]:
        assert accepted_work_state(**(base | change)) == expected


def test_expired_lease_continues_source_and_accepted_double_until_explicit_end():
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        await h.act(mid, "acquire")
        await h.act(mid, "start")
        checkpoint = h.repo.checkpoint(mid)
        checkpoint["executions"] = [{"id": "accepted-double", "state": "Accepted"}]
        h.repo.save_checkpoint(mid, checkpoint)
        h.advance(40)
        await h.service.tick()
        assert h.service.status(mid, CREDENTIAL).lease_state == "expired"
        assert h.authority.read(mid).interactive.tick == 1
        assert h.repo.checkpoint(mid)["executions"][0]["state"] == "Accepted"
        await h.act(mid, "reclaim")
        await h.act(mid, "end")
        assert h.repo.checkpoint(mid)["executions"][0] == {"id": "accepted-double", "state": "Cancelled", "reason": "run-end"}
    asyncio.run(exercise())


@pytest.mark.parametrize("field", ["assetId", "entityId", "executorId", "sourceId", "grantId", "controlTrackId"])
def test_control_bindings_are_validated_at_complete_frame_boundary(field):
    from app.domain.models import WorldFrame
    h = Harness()
    async def exercise():
        mid = (await h.create()).mission_id
        frame = json.loads(canonical(h.authority.read(mid)))
        frame["interactive"]["controls"][0][field] = "unrelated"
        with pytest.raises(ValueError):
            WorldFrame.model_validate_json(json.dumps(frame))
    asyncio.run(exercise())


def test_restart_failure_does_not_commit_new_epoch_or_checkpoint(tmp_path):
    h = Harness(tmp_path / "failed-restart.sqlite3")
    async def exercise():
        mid = (await h.create()).mission_id
        await h.act(mid, "acquire")
        await h.act(mid, "start")
        saved, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        h.repo.db.execute("CREATE TRIGGER fail BEFORE INSERT ON interactive_checkpoints BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        with pytest.raises(sqlite3.Error):
            await InteractiveService(h.authority, True).recover()
        assert h.repo.latest_text(mid) == saved and h.repo.checkpoint(mid) == checkpoint
    asyncio.run(exercise())


def test_monotonic_process_clock_does_not_follow_wall_clock_changes(monkeypatch):
    from app.world import serialization
    elapsed = [100.0]
    monkeypatch.setattr(serialization, "monotonic", lambda: elapsed[0])
    clock = serialization.elapsed_utc_clock()
    before = clock()
    elapsed[0] += 31
    assert clock() == plus(before, 31)


def test_legacy_migration_keeps_original_bytes_and_history_readable(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    h = Harness(path)
    raw = (Path(__file__).parents[2] / "contracts/sentinel/v1/fixture.world.json").read_text(encoding="utf-8")
    frame = LegacyWorldFrame.model_validate_json(raw)
    h.repo.establish(frame.mission, frame.recording_id, frame.stream_epoch, frame.recorded_at)
    h.repo.db.execute("INSERT INTO frames VALUES (?,?,?,?,?,?)", (frame.frame_id, frame.recording_id, frame.sequence, frame.effective_at, frame.recorded_at, raw))
    h.repo.db.executescript("DROP TABLE command_receipts; DROP TABLE creation_receipts; DROP TABLE interactive_checkpoints; PRAGMA user_version=1;")
    h.repo.close()
    migrated = Harness(path)
    assert migrated.repo.db.execute("PRAGMA user_version").fetchone()[0] == 2
    assert migrated.repo.latest_text(frame.mission.id) == raw
    projected = migrated.authority.read(frame.mission.id)
    assert projected.schema_version == "1.1" and projected.frame_id == frame.frame_id
    history = migrated.repo.observed_history(frame.mission.id, next(iter(frame.entities)), frame.frame_id, 60)
    assert history.segments and migrated.repo.latest_text(frame.mission.id) == raw
    legacy_schema = json.loads((Path(__file__).parents[2] / "contracts/sentinel/v1/world.schema.json").read_text())
    assert not Draft202012Validator(legacy_schema).is_valid(json.loads(canonical(projected)))


def test_http_boundary_disabled_fixture_isolation_and_credentials_never_recorded():
    with TestClient(create_app(":memory:", True, demo_enabled=True)) as client:
        receipt = client.post("/api/interactive/runs", json={"creationId": "http", "templateId": "singapore-local-v1"}).json()
        mid = receipt["missionId"]
        assert client.post("/api/interactive/fixture-alpha/intents", json={"action": "start"}).json()["code"] == "NOT_INTERACTIVE"
        assert client.post("/api/interactive/runs", json={"creationId": "bad", "templateId": "live"}).json()["code"] == "INVALID_REQUEST"
        intent = client.post(f"/api/interactive/{mid}/intents", json={"action": "acquire"}).json()
        body = {"commandId": "private", "holderId": "public", "intent": intent}
        result = client.post(f"/api/interactive/{mid}/commands", json=body, headers={"X-Sentinel-Control": CREDENTIAL})
        assert result.json()["accepted"]
        assert client.get(f"/api/interactive/{mid}/status", headers={"X-Sentinel-Control": CREDENTIAL}).json()["ownsControl"]
        assert not client.get(f"/api/interactive/{mid}/status").json()["ownsControl"]
        db_dump = "\n".join(client.app.state.service.repository.db.iterdump())
        import hashlib
        assert CREDENTIAL not in db_dump and hashlib.sha256(CREDENTIAL.encode()).hexdigest() not in db_dump
        assert CREDENTIAL not in result.text
        bad = client.get(f"/api/interactive/{mid}/status", headers={"X-Sentinel-Control": "secret-in-invalid-header"})
        assert "secret-in-invalid-header" not in bad.text
    with TestClient(create_app(":memory:", False, demo_enabled=False)) as client:
        assert not client.get("/api/interactive/entry").json()["enabled"]
        assert client.post("/api/interactive/runs", json={"creationId": "disabled", "templateId": "singapore-local-v1"}).status_code == 403


@pytest.mark.parametrize("identity", ["opaque/id", "opaque?id", "opaque#id", "opaque%id", "opaque/ ?#% /id", ".", "..", "a/../b", "unicode-é/+ &= %2E"])
def test_http_opaque_creation_and_command_receipt_identity_round_trip(identity):
    with TestClient(create_app(":memory:", False, demo_enabled=True)) as client:
        creation = client.post("/api/interactive/runs", json={"creationId": identity, "templateId": "singapore-local-v1"}).json()
        assert creation["accepted"]
        assert client.get("/api/interactive/creations", params={"identity": identity}).json() == creation
        mid = creation["missionId"]
        intent = client.post(f"/api/interactive/{mid}/intents", json={"action": "acquire"}).json()
        command = client.post(f"/api/interactive/{mid}/commands", json={"commandId": identity, "holderId": "operator", "intent": intent}, headers={"X-Sentinel-Control": CREDENTIAL}).json()
        assert command["accepted"]
        assert client.get(f"/api/interactive/{mid}/receipts", params={"identity": identity}).json() == command


@pytest.mark.parametrize("identity", ["opaque/id", "opaque?id", "opaque#id", "opaque%id", "opaque/ ?#% /id"])
def test_initial_receipt_path_aliases_remain_available(identity):
    from urllib.parse import quote
    with TestClient(create_app(":memory:", False, demo_enabled=True)) as client:
        creation = client.post("/api/interactive/runs", json={"creationId": identity, "templateId": "singapore-local-v1"}).json()
        assert client.get(f"/api/interactive/creations/{quote(identity, safe='')}").json() == creation
        mid = creation["missionId"]
        intent = client.post(f"/api/interactive/{mid}/intents", json={"action": "acquire"}).json()
        command = client.post(f"/api/interactive/{mid}/commands", json={"commandId": identity, "holderId": "operator", "intent": intent}, headers={"X-Sentinel-Control": CREDENTIAL}).json()
        assert command["accepted"]
        assert client.get(f"/api/interactive/{mid}/receipts/{quote(identity, safe='')}").json() == command
