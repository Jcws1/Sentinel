"""Tasking advice is deterministic, frame-bound and never a command."""
import asyncio
from uuid import uuid4

from fastapi.testclient import TestClient

from app.assistant.tasking import TaskingRequest, generate, _support
from app.commands.contracts import CommandRequest, RecommendationRequest, RecommendationRef
from app.main import create_app
from app.world.serialization import canonical
from test_d4_refinement import setup
from test_interactive import Harness, CREDENTIAL
from test_boundaries import custom, boundary


def test_three_by_three_respond_advice_never_mutates_authority():
    h = Harness()

    async def exercise():
        mid = await setup(h, 3, 3)
        frame = h.authority.read(mid)
        before = canonical(frame)
        changes = h.repo.db.total_changes
        request = TaskingRequest(frame_id=frame.frame_id)
        first = generate(frame, request)
        second = generate(frame, request)
        assert first == second
        assert [p.code for p in first.proposals] == [
            "MONITOR", "RESPOND", "RESTORE_VISIBILITY", "RESTORE_LINK", "ROTATE_ASSET"]
        respond = first.proposals[1]
        assert respond.status == "candidate"
        assert len(respond.asset_ids) == len(respond.target_ids) == 3
        assert len(respond.pairs) == 3
        assert not first.executable
        assert canonical(h.authority.read(mid)) == before
        assert h.repo.db.total_changes == changes
        h.advance(3)
        stale = generate(h.authority.read(mid), request, h.now)
        assert stale.proposals[1].status == "needs_evidence"

    asyncio.run(exercise())


def test_confirmed_respond_uses_existing_reviewed_simulator_command():
    h = Harness()

    async def exercise():
        mid = await setup(h, 3, 3)
        frame = h.authority.read(mid)
        advice = generate(frame, TaskingRequest(frame_id=frame.frame_id))
        assets = advice.proposals[1].asset_ids
        controls = [control for control in frame.interactive.controls if control.asset_id in assets]
        reviewed = await h.service.suggest(mid, RecommendationRequest(entity_ids=[c.entity_id for c in controls]), CREDENTIAL)
        option = next(item for item in reviewed.options if item.id == "intercept-all")
        assert sorted(member.asset_id for member in option.action.members) == sorted(assets)
        intent = await h.service.issue_intent(mid, option.action.operation, members=option.action.members, order=1,
            policy=option.action.policy, recommendation=RecommendationRef(recommendation_id=reviewed.id, option_id=option.id))
        receipt = await h.service.command(mid, CommandRequest(command_id=str(uuid4()), holder_id="operator-one", intent=intent), CREDENTIAL)
        assert receipt.accepted
        assert all(member.policy == "intercept" for member in h.authority.read(mid).fleet_behavior.members if member.entity_id in [c.entity_id for c in controls])

    asyncio.run(exercise())


def test_monitor_requires_a_marked_area_and_does_not_claim_a_camera_view():
    h = Harness()

    async def exercise():
        _, _, mid, _ = await custom(h, [boundary('annotation', [(-100,-100),(100,-100),(100,100),(-100,100)])])
        frame = h.authority.read(mid)
        zone_id = next(iter(frame.zones))
        proposal = generate(frame, TaskingRequest(frame_id=frame.frame_id, focus_zone_id=zone_id)).proposals[0]
        assert proposal.status == "candidate"
        assert proposal.zone_ids == [zone_id]
        assert "not a verified camera vantage" in proposal.summary
        assert "no move is offered" in proposal.limitations[0]

    asyncio.run(exercise())


def test_support_does_not_invent_a_relay_or_replacement():
    visibility, relay, rotation = _support({"sensors": {}, "tasks": {}, "assets": {}}, [])
    assert visibility["status"] == relay["status"] == rotation["status"] == "needs_evidence"
    assert "cannot be justified" in relay["summary"]


def test_support_requires_reported_faults_and_explicit_capabilities():
    frame = {"sensors": {
        "camera-down": {"id": "camera-down", "entityId": "drone-a", "modality": "camera", "status": "unavailable"},
        "camera-ready": {"id": "camera-ready", "entityId": "drone-b", "modality": "camera", "status": "available"},
        "link-down": {"id": "link-down", "entityId": "drone-a", "modality": "radio-link", "status": "unavailable"}},
        "assets": {
            "asset-a": {"availability": "unavailable", "capabilityCodes": ["camera"]},
            "asset-b": {"availability": "available", "capabilityCodes": ["camera", "relay"]}},
        "tasks": {"task-one": {"id": "task-one", "status": "active", "assetIds": ["asset-a"]}}}
    controls = [{"assetId": "asset-b", "entityId": "drone-b"}]
    visibility, relay, rotation = _support(frame, controls)
    assert visibility["status"] == relay["status"] == rotation["status"] == "candidate"
    assert visibility["assetIds"] == relay["assetIds"] == rotation["assetIds"] == ["asset-b"]
    frame["assets"]["asset-b"]["capabilityCodes"].remove("relay")
    assert _support(frame, controls)[1]["status"] == "no_feasible_asset"


def test_exact_frame_admission_and_read_only_fixture(tmp_path):
    with TestClient(create_app(str(tmp_path / "tasking.sqlite"), True)) as client:
        frame = client.get("/api/missions/fixture-alpha/world").json()
        stale = client.post("/api/missions/fixture-alpha/tasking-advice", json={"frameId": "stale"})
        assert stale.status_code == 409
        current = client.post("/api/missions/fixture-alpha/tasking-advice", json={"frameId": frame["frameId"]})
        assert current.status_code == 200
        assert current.json()["executable"] is False
        assert current.json()["source"] == "deterministic-rules"
