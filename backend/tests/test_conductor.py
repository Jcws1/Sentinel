"""D3 transactions, source authority and recovery on isolated databases only."""
import asyncio
import json
import sqlite3
from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.commands.contracts import CommandRequest, DirectMoveMember
from app.commands.service import InteractiveService
from app.scenarios.service import ScenarioService
from app.scenarios.contracts import ScenarioRef, ScenarioRevision
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL
from test_scenarios import content, write, run_request
from test_direct_movement import direct, issue
from test_movement import ticks, draft
from test_boundaries import boundary


def scripted():
    data = content()
    data.update(scheduleRuleVersion="local-schedule-v1", actions=[
        dict(id=f"action-{i}", unitId=f"unit-{unit}", kind="move", offsetMs=time, ordinal=i,
             destination=dict(longitudeDeg=103.859, latitudeDeg=1.292 + i * .001))
        for i, (unit, time) in enumerate([(0, 0), (1, 0), (2, 200), (0, 1000), (0, 2000), (2, 6000)])])
    return data


async def ready(h, data=None):
    revision = (await ScenarioService(h.authority, True).write(write(data or scripted()))).result
    request = run_request(revision)
    receipt = await h.service.create(request)
    assert receipt.accepted, receipt.message
    return receipt.mission_id, revision, request


async def selected(h, mid, action, order, members=None):
    if members is None:
        keys = ("assetId", "entityId", "executorId", "sourceId", "controlTrackId", "grantId", "bindingRevision")
        controls = json.loads(canonical(h.authority.read(mid).interactive))["controls"]
        members = [DirectMoveMember.model_validate({k: c[k] for k in keys if k in c}) for c in controls]
    intent = await h.service.issue_intent(mid, action, members=members, order=order)
    return CommandRequest(command_id=str(uuid4()), holder_id="operator-one", intent=intent)


def schedule(h, mid):
    return h.authority.read(mid).scenario_schedule


def test_tick_zero_once_dispatch_order_height_and_source_roles():
    h = Harness()
    async def run():
        mid, revision, creation = await ready(h)
        assert revision.schema_version == "1.2"
        initial = h.authority.read(mid)
        assert len(initial.interactive.controls) == 1
        await h.act(mid, "acquire")
        start = await h.request(mid, "start")
        result = await h.service.command(mid, start, CREDENTIAL)
        assert result.accepted
        assert [e.state for e in schedule(h, mid).actions] == ["Accepted", "Accepted", "Pending", "Pending", "Pending", "Pending"]
        assert h.authority.read(mid).tracks == initial.tracks
        await ticks(h, 1)
        frame = h.authority.read(mid)
        assert [e.state for e in frame.scenario_schedule.actions][:3] == ["Running"] * 3
        for unit in revision.content.units:
            track = frame.tracks[f'{frame.scenario.entity_ids[unit.id]}:control']
            assert canonical(track.latest.position.altitude) == canonical(unit.position.altitude)
            assert (canonical(track.latest.position) == canonical(unit.position)) == (unit.category == "unknown")
        sequence = frame.sequence
        assert await h.service.command(mid, start, None) == result
        assert await h.service.create(creation) == h.service.lookup(creation.creation_id)
        assert h.authority.read(mid).sequence == sequence
        accepted = [e.extensions["sentinel.script"]["actionId"] for e in frame.recent_events if e.type == "script.accepted"]
        assert accepted == ["action-0", "action-1", "action-2"]
        assert schedule(h, mid).actions[0].motion.accepted_tick == 0
    asyncio.run(run())


@pytest.mark.parametrize("mutation", [
    lambda d: d["actions"][0].update(offsetMs=201),
    lambda d: d["actions"][0].update(offsetMs=-200),
    lambda d: d["actions"][0].update(offsetMs=600200),
    lambda d: d["actions"][0].update(unitId="unit-3"),
    lambda d: d["actions"][0].update(unitId="deleted"),
    lambda d: d["actions"][1].update(unitId="unit-0"),
    lambda d: d["actions"][1].update(id="action-0"),
    lambda d: d["actions"][1].update(id="unit-0"),
    lambda d: d["actions"][0]["destination"].update(longitudeDeg=104),
    lambda d: d.pop("scheduleRuleVersion"),
])
def test_invalid_scripts_are_not_saveable(mutation):
    data = scripted(); mutation(data)
    with pytest.raises(ValidationError):
        write(data)


def test_long_pause_stop_return_and_manual_order_fence():
    h = Harness()
    async def run():
        mid, _, _ = await ready(h)
        await h.act(mid, "acquire"); await h.act(mid, "start")
        await ticks(h, 1)
        old_move = direct(h, mid, order=1)
        reviewed = draft(h, mid)
        stop = await selected(h, mid, "stop", 2)
        receipt = await h.service.command(mid, stop, CREDENTIAL)
        assert receipt.accepted and receipt.control_order == 2 and not receipt.execution_ids
        assert schedule(h, mid).actions[0].state == "Cancelled"
        assert not (await issue(h, mid, old_move)).accepted
        assert not (await h.service.move(mid, reviewed, CREDENTIAL)).accepted
        await h.act(mid, "pause")
        paused = h.authority.read(mid)
        for _ in range(4):
            h.advance(10); await h.act(mid, "renew"); await h.service.tick()
        assert h.authority.read(mid).interactive.tick == paused.interactive.tick
        assert h.authority.read(mid).tracks == paused.tracks
        # Fresh selected control requires no recent position/report after a long pause.
        assert (await h.service.command(mid, await selected(h, mid, "stop", 3), CREDENTIAL)).accepted
        await h.act(mid, "resume"); await ticks(h, 5)
        assert schedule(h, mid).actions[3].state == "Skipped"
        returned = await selected(h, mid, "return-to-script", 4)
        assert (await h.service.command(mid, returned, CREDENTIAL)).accepted
        assert not schedule(h, mid).manual_overrides
        assert schedule(h, mid).actions[3].state == "Skipped"
        await ticks(h, 4)
        assert schedule(h, mid).actions[4].state == "Running"
        assert await h.service.command(mid, stop, None) == receipt
        assert not (await h.service.command(mid, await selected(h, mid, "stop", 1), CREDENTIAL)).accepted
        assert schedule(h, mid).actions[4].state == "Running"
    asyncio.run(run())


def test_source_actor_cannot_forge_live_stop_return_or_movement():
    h = Harness()
    async def run():
        mid, _, _ = await ready(h)
        await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
        frame = h.authority.read(mid)
        for unit in ("unit-1", "unit-2", "unit-3"):
            member = (await selected(h, mid, "stop", 1)).intent.members[0].model_dump()
            member["entity_id"] = frame.scenario.entity_ids[unit]
            member["control_track_id"] = f'{member["entity_id"]}:control'
            for action in ("stop", "return-to-script"):
                request = await selected(h, mid, action, 1, [DirectMoveMember.model_validate(member)])
                assert not (await h.service.command(mid, request, CREDENTIAL)).accepted
        assert not schedule(h, mid).manual_overrides
    asyncio.run(run())


@pytest.mark.parametrize("operation", ["start", "tick", "stop", "end"])
def test_storage_failure_rolls_back_dispatch_positions_receipts_and_retry(operation):
    h = Harness()
    async def run():
        mid, _, _ = await ready(h)
        await h.act(mid, "acquire")
        if operation != "start":
            await h.act(mid, "start"); await ticks(h, 1)
        request = await selected(h, mid, "stop", 1) if operation == "stop" else await h.request(mid, operation) if operation != "tick" else None
        before, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        h.repo.db.execute("CREATE TRIGGER fail_d3 BEFORE UPDATE ON interactive_checkpoints BEGIN SELECT RAISE(ABORT,'test rollback'); END")
        async def attempt():
            return await h.service.command(mid, request, CREDENTIAL) if request else await h.service.tick()
        with pytest.raises(sqlite3.Error): await attempt()
        assert h.repo.latest_text(mid) == before
        assert h.repo.checkpoint(mid) == checkpoint
        assert canonical(h.authority.read(mid)) == canonical(read_frame(before))
        if request: assert h.repo.receipt(request.command_id, mid) is None
        h.repo.db.execute("DROP TRIGGER fail_d3")
        result = await attempt()
        if request:
            seq = h.authority.read(mid).sequence
            assert await h.service.command(mid, request, None) == result
            assert h.authority.read(mid).sequence == seq
        assert h.authority.read(mid).sequence == read_frame(before).sequence + 1
    asyncio.run(run())


def test_recovery_interrupts_pending_and_active_without_rearming_and_rerun_is_fresh(tmp_path):
    h = Harness(tmp_path / "script.sqlite3")
    async def run():
        mid, rev, _ = await ready(h)
        await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 2)
        before = h.authority.read(mid)
        h.service = InteractiveService(h.authority, True)
        await h.service.recover()
        recovered = h.authority.read(mid)
        assert recovered.interactive.state == "paused" and recovered.interactive.executor_epoch != before.interactive.executor_epoch
        assert all(e.state == "Interrupted" for e in schedule(h, mid).actions)
        assert not recovered.interactive.lease.holder_id
        for key, track in before.tracks.items():
            assert canonical(recovered.tracks[key].latest.position) == canonical(track.latest.position)
        await h.act(mid, "acquire"); await h.act(mid, "resume")
        h.advance(400); await h.service.tick()
        assert h.authority.read(mid).interactive.tick == before.interactive.tick + 1
        assert all(e.state == "Interrupted" for e in schedule(h, mid).actions)
        await h.act(mid, "reclaim")
        assert (await h.service.command(mid, await selected(h, mid, "return-to-script", 1), CREDENTIAL)).accepted
        await ticks(h, 31)
        assert all(e.state == "Interrupted" for e in schedule(h, mid).actions)
        await h.act(mid, "end")
        ended = h.repo.latest_text(mid)
        fresh = await h.service.create(run_request(rev))
        assert fresh.accepted and fresh.mission_id != mid
        assert h.repo.latest_text(mid) == ended
        assert all(e.state == "Pending" for e in schedule(h, fresh.mission_id).actions)
    asyncio.run(run())


def test_nominal_boundary_admission_and_invalid_runtime_replacement_retains_motion():
    h = Harness()
    async def run():
        data = scripted()
        data.update(boundaries=[boundary()], boundaryRuleVersion="local-boundary-v1")
        data["actions"] = [dict(id="cross", unitId="unit-0", kind="move", offsetMs=0, ordinal=0,
                                destination=dict(longitudeDeg=103.859, latitudeDeg=1.29))]
        service = ScenarioService(h.authority, True)
        rev = (await service.write(write(data))).result
        reference = run_request(rev).scenario
        review = service.review(reference)
        assert not review.can_run and review.issues[0].code == "SCRIPT_PATH_BLOCKED"
        assert not (await h.service.create(run_request(rev))).accepted
        # Nominal paths are legal above the boundary; simulate an inconsistent restored
        # position before replacement. Both admission and step guards stay authoritative.
        data["units"][0]["position"]["latitudeDeg"] = 1.294
        data["actions"][0]["destination"]["latitudeDeg"] = 1.294
        data["actions"].append({**deepcopy(data["actions"][0]), "id": "later", "offsetMs": 400, "ordinal": 1,
                                "destination": dict(longitudeDeg=103.859, latitudeDeg=1.29)})
        mid, _, _ = await ready(h, data)
        await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
        # Move actual source to south-west; next replacement crosses restricted area,
        # while the previous north-east destination remains a legal segment.
        def reposition(frame):
            track = frame["tracks"][frame["scenarioSchedule"]["actions"][0]["trackId"]]
            track["latest"]["position"].update(longitudeDeg=103.85, latitudeDeg=1.289)
            return frame, []
        await h.authority.commit_source(mid, reposition)
        await ticks(h, 1)
        assert schedule(h, mid).actions[1].state == "Failed"
        assert "Previous valid movement is retained" in schedule(h, mid).actions[1].reason
        assert schedule(h, mid).actions[0].state == "Running"
    asyncio.run(run())


def test_source_work_survives_lease_expiry_navigation_and_wall_stall_without_catchup():
    h = Harness()
    async def run():
        mid, _, _ = await ready(h)
        await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
        before = h.authority.read(mid)
        h.advance(3600)
        await h.service.tick()
        after = h.authority.read(mid)
        assert after.interactive.tick == 2
        assert after.effective_at == "2026-09-14T00:00:00.400Z"
        assert h.service.status(mid, CREDENTIAL).lease_state == "expired"
        assert all(e.state == "Running" for e in schedule(h, mid).actions[:3])
        for item in schedule(h, mid).actions[:3]:
            assert item.motion.travelled_metres - before.scenario_schedule.actions[int(item.action.id[-1])].motion.travelled_metres == pytest.approx(155 / 3.6 * .2)
        assert not (await h.service.command(mid, await selected(h, mid, "stop", 1), CREDENTIAL)).accepted
        await h.act(mid, "reclaim")
        assert (await h.service.command(mid, await selected(h, mid, "stop", 2), CREDENTIAL)).accepted
    asyncio.run(run())


@pytest.mark.parametrize("ready_restart", [False, True])
def test_restart_preserves_completed_evidence_interrupts_every_other_action_and_never_rearms(ready_restart):
    h = Harness()
    async def run():
        data = scripted(); data["actions"][0]["destination"] = dict(longitudeDeg=103.85001, latitudeDeg=1.29)
        mid, _, _ = await ready(h, data)
        if not ready_restart:
            await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
            assert schedule(h, mid).actions[0].state == "Completed"
            completion = canonical(schedule(h, mid).actions[0])
        await h.service.recover()
        assert all(e.state == "Interrupted" for e in schedule(h, mid).actions[(0 if ready_restart else 1):])
        if not ready_restart:
            assert canonical(schedule(h, mid).actions[0]) == completion
        await h.act(mid, "acquire"); await h.act(mid, "start" if ready_restart else "resume"); await ticks(h, 40)
        assert all(e.state == "Interrupted" for e in schedule(h, mid).actions[(0 if ready_restart else 1):])
        assert not h.service.status(mid, None).owns_control
    asyncio.run(run())


def test_maximum_schedule_retains_all_terminal_accounting_beyond_operator_projection_limit():
    h = Harness()
    async def run():
        data = scripted(); data["actions"] = [dict(id=f"many-{i}", unitId="unit-2", kind="move", offsetMs=i*200, ordinal=i,
            destination=dict(longitudeDeg=103.852, latitudeDeg=1.29)) for i in range(128)]
        with pytest.raises(ValidationError): write({**data, "actions": data["actions"] + [{**data["actions"][0], "id":"overflow"}]})
        mid, _, _ = await ready(h, data); await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 128)
        actions = schedule(h, mid).actions
        assert len(actions) == 128 and len(h.repo.checkpoint(mid)["scenarioSchedule"]["actions"]) == 128
        # A tick-one replacement supersedes tick-zero before its first source step.
        assert actions[0].state == "Cancelled" and all(e.state == "Completed" for e in actions[1:])
        assert h.authority.read(mid).interactive.executions == []
        for item in actions[1:]:
            assert item.motion.completion_sample.position == item.motion.destination
            assert item.motion.started_tick == item.motion.accepted_tick
    asyncio.run(run())


def test_simultaneous_order_is_due_tick_then_ordinal_then_identity_independent_of_storage_order():
    h = Harness()
    async def run():
        data=scripted()
        data["actions"]= [
            {**data["actions"][2],"offsetMs":0,"ordinal":0,"id":"b"},
            {**data["actions"][1],"ordinal":0,"id":"a"},
            {**data["actions"][0],"ordinal":1,"id":"z"},
        ]
        mid,_,_=await ready(h,data);await h.act(mid,"acquire");await h.act(mid,"start")
        events=[e.extensions["sentinel.script"]["actionId"] for e in h.authority.read(mid).recent_events if e.type=="script.accepted"]
        assert events==["a","b","z"]
    asyncio.run(run())


def test_step_guard_keeps_inconsistent_restricted_position_honest_and_blocks_source_actor():
    h=Harness()
    async def run():
        data=scripted();data.update(boundaries=[boundary()],boundaryRuleVersion="local-boundary-v1")
        data["actions"]=[{**data["actions"][1],"destination":dict(longitudeDeg=103.859,latitudeDeg=1.294)}]
        mid,_,_=await ready(h,data);await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,1)
        tid=schedule(h,mid).actions[0].track_id
        def inconsistent(frame):
            frame["tracks"][tid]["latest"]["position"].update(longitudeDeg=103.8545,latitudeDeg=1.29)
            return frame,[]
        await h.authority.commit_source(mid,inconsistent)
        before=canonical(h.authority.read(mid).tracks[tid].latest.position)
        await ticks(h,1)
        assert schedule(h,mid).actions[0].state=="Failed"
        assert "Restricted boundary" in schedule(h,mid).actions[0].reason
        assert canonical(h.authority.read(mid).tracks[tid].latest.position)==before
        assert len(h.authority.read(mid).interactive.controls)==1
    asyncio.run(run())


def test_explicit_revoke_records_pending_cancellation_and_return_cannot_replay():
    h=Harness()
    async def run():
        mid,_,_=await ready(h);await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,1)
        await h.act(mid,"revoke")
        assert all(e.state=="Cancelled" for e in schedule(h,mid).actions)
        await h.act(mid,"acquire")
        await h.service.command(mid,await selected(h,mid,"return-to-script",1),CREDENTIAL)
        await ticks(h,31)
        assert all(e.state=="Cancelled" for e in schedule(h,mid).actions)
    asyncio.run(run())


def test_archived_d2_reader_rejects_new_fields_and_keeps_receipt_bytes(tmp_path):
    from pathlib import Path
    h=Harness(tmp_path/"legacy-d2.sqlite3")
    raw=(Path(__file__).parents[2]/"contracts/sentinel/v1.7/demo.world.json").read_text(encoding="utf-8")
    projected=read_frame(raw)
    assert projected.schema_version=="1.10" and projected.interactive.schema_version=="1.7" and projected.scenario_schedule is None
    forged=json.loads(raw);forged["scenarioSchedule"]=None
    with pytest.raises(ValidationError):read_frame(json.dumps(forged))
    async def run():
        receipt=await h.create("old-d2");payload,current=h.repo.receipt("old-d2")
        value=json.loads(current);value["schemaVersion"]="1.2";value.pop("controlOutcomes");value.pop("behaviorOutcomes");value.pop("targetScope")
        original=json.dumps(value,indent=2)
        h.repo.db.execute("UPDATE creation_receipts SET receipt_json=? WHERE creation_id=?",(original,"old-d2"))
        assert h.service.lookup("old-d2").schema_version=="1.2"
        assert h.repo.receipt("old-d2")== (payload,original)
        assert canonical(h.service.lookup("old-d2"))==canonical(value)
        assert (await h.create("old-d2")).schema_version=="1.2"
    asyncio.run(run())
