"""Tasking advice is deterministic, frame-bound and never a command."""
import asyncio
from uuid import uuid4

from fastapi.testclient import TestClient

from app.assistant.tasking import TaskingRequest, generate, _support
from app.api.interactive import DemoFaultRequest
from app.commands.contracts import CommandRequest, RecommendationRequest, RecommendationRef
from app.commands.errors import CommandError
from app.main import create_app
from app.world.serialization import canonical
from test_d4_refinement import setup
from test_interactive import Harness, CREDENTIAL
from test_boundaries import custom, boundary
from test_scenarios import content, write, run_request
from test_direct_movement import direct, issue
from app.scenarios.service import ScenarioService
import pytest


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
        assert "camera pose" in proposal.limitations[0]

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


def test_support_does_not_offer_a_zero_distance_relay_move():
    point = {"longitudeDeg": 103.85, "latitudeDeg": 1.29}
    frame = {"interactive": {"controls": [
        {"assetId": "failed", "entityId": "drone-a", "controlTrackId": "track-a"},
        {"assetId": "relay", "entityId": "drone-b", "controlTrackId": "track-b"}]},
        "tracks": {key: {"state": "tracking", "latest": {"position": point}}
                   for key in ("track-a", "track-b")},
        "sensors": {"link-down": {"id": "link-down", "entityId": "drone-a",
                                  "modality": "radio-link", "status": "unavailable"}},
        "assets": {"failed": {"availability": "available", "capabilityCodes": []},
                   "relay": {"availability": "available", "capabilityCodes": ["synthetic-relay"]}},
        "tasks": {}}
    relay = _support(frame, [frame["interactive"]["controls"][1]])[1]
    assert relay["status"] == "no_feasible_asset"


def test_exact_frame_admission_and_read_only_fixture(tmp_path):
    with TestClient(create_app(str(tmp_path / "tasking.sqlite"), True)) as client:
        frame = client.get("/api/missions/fixture-alpha/world").json()
        stale = client.post("/api/missions/fixture-alpha/tasking-advice", json={"frameId": "stale"})
        assert stale.status_code == 409
        latest = client.post("/api/missions/fixture-alpha/tasking-advice", json={})
        assert latest.status_code == 200
        assert latest.json()["frameId"] == frame["frameId"]
        current = client.post("/api/missions/fixture-alpha/tasking-advice", json={"frameId": frame["frameId"]})
        assert current.status_code == 200
        assert current.json()["executable"] is False
        assert current.json()["source"] == "deterministic-rules"


def test_synthetic_faults_create_evidence_for_each_support_path_without_claiming_restoration():
    h = Harness()

    async def exercise():
        plan = content()
        for index in (4, 5):
            unit = dict(plan["units"][0])
            unit.update(id=f"unit-{index}", label=f"Synthetic support {index}")
            unit["position"] = {**unit["position"], "longitudeDeg": 103.85 + index * .001}
            plan["units"].append(unit)
        revision = (await ScenarioService(h.authority, True).write(write(plan))).result
        created = await h.service.create(run_request(revision))
        assert created.accepted
        mid = created.mission_id
        assert (await h.act(mid, "acquire")).accepted
        assert (await h.act(mid, "start")).accepted
        h.advance(0.2)
        await h.service.tick()
        frame = h.authority.read(mid)
        assert len(frame.sensors) == 0 and len(frame.tasks) == 0
        controls = frame.interactive.controls
        first = controls[0].asset_id
        assert all(p.status == "needs_evidence" for p in generate(frame, TaskingRequest()).proposals[2:])

        def fault(kind, asset=first):
            current = h.authority.read(mid)
            return DemoFaultRequest(frame_id=current.frame_id, holder_id="operator-one", asset_id=asset, kind=kind)

        with pytest.raises(CommandError, match="hold current demo control"):
            await h.service.inject_demo_fault(mid, fault("camera"), None)
        result = await h.service.inject_demo_fault(mid, fault("camera"), CREDENTIAL)
        assert result["simulated"] and result["kind"] == "camera"
        assert "synthetic-relay" in h.authority.read(mid).assets[controls[-1].asset_id].capability_codes
        visibility = generate(h.authority.read(mid), TaskingRequest()).proposals[2]
        assert visibility.status == "candidate" and visibility.asset_ids[0] != first
        await h.service.inject_demo_fault(mid, fault("link"), CREDENTIAL)
        assert generate(h.authority.read(mid), TaskingRequest()).proposals[3].status == "candidate"
        await h.service.inject_demo_fault(mid, fault("asset"), CREDENTIAL)
        rotation = generate(h.authority.read(mid), TaskingRequest()).proposals[4]
        assert rotation.status == "candidate" and first not in rotation.asset_ids
        assert h.authority.read(mid).sensors[f"{first}:camera"].status == "unavailable"
        current = h.authority.read(mid)
        failed_track = current.tracks[controls[0].control_track_id]
        destination = failed_track.latest.position
        replacement_index = next(i for i, control in enumerate(controls)
            if control.asset_id == rotation.asset_ids[0])
        receipt = await issue(h, mid, direct(h, mid, indices=(replacement_index,),
            longitude=destination.longitude_deg, latitude=destination.latitude_deg))
        assert receipt.accepted and receipt.member_outcomes[0].outcome == "accepted"
        # Command acceptance is not evidence that a camera, link or task was restored.
        after = h.authority.read(mid)
        assert after.sensors[f"{first}:camera"].status == "unavailable"
        assert after.sensors[f"{first}:radio-link"].status == "unavailable"

    asyncio.run(exercise())
