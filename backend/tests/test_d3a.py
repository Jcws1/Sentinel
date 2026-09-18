"""D3a acceptance transitions on isolated stores, including immutable legacy evidence."""
import asyncio
import json
import sqlite3
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.commands.boundary_contracts import BoundaryMutation
from app.commands.contracts import CommandRequest
from app.commands.kinematics import geographic
from app.commands.scheduler import nominal_plan
from app.commands.service import InteractiveService
from app.scenarios.contracts import ScenarioRef, ScenarioRevision
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL, OTHER
from test_scenarios import content, write, run_request
from test_conductor import ready, selected, schedule
from test_movement import ticks
from test_boundaries import boundary
from test_direct_movement import direct, issue


def chain(delay=0):
    data = content()
    data.update(scheduleRuleVersion="local-schedule-v2",actions=[
        dict(id="first",unitId="unit-0",kind="move",offsetMs=0,ordinal=0,destination=geographic(15,0)),
        dict(id="second",unitId="unit-0",kind="move",afterActionId="first",delayMs=delay,ordinal=1,destination=geographic(35,0)),
        dict(id="third",unitId="unit-0",kind="move",afterActionId="second",delayMs=0,ordinal=2,destination=geographic(55,0)),
    ])
    return data


async def mutation(h, mid, geometry=None, expected=0, delete=False):
    run = h.authority.read(mid).interactive
    geometry = geometry or boundary()
    change = BoundaryMutation.model_validate(dict(expectedRevision=expected,operation="delete" if delete else "upsert",
        boundaryId=f'{run.run_id}:boundary:{geometry["id"]}',**({} if delete else dict(definition=geometry))))
    intent = await h.service.issue_intent(mid,"boundary-edit",boundary=change)
    return CommandRequest(command_id=str(uuid4()),holder_id="operator-one",intent=intent)


@pytest.mark.parametrize("delay", [0,200,600])
def test_real_completion_delay_not_an_estimate_and_pause(delay):
    h=Harness()
    async def run():
        mid, rev, _ = await ready(h,chain(delay))
        assert rev.schema_version=="1.3"
        await h.act(mid,"acquire"); await h.act(mid,"start")
        assert [e.state for e in schedule(h,mid).actions]==["Accepted","Pending","Pending"]
        await ticks(h,2)
        first=schedule(h,mid).actions[0]
        assert first.state=="Completed" and first.terminal_tick==2
        await h.act(mid,"pause")
        for _ in range(4):
            h.advance(10); await h.act(mid,"renew"); await h.service.tick()
        assert schedule(h,mid).actions[1].state=="Pending"
        await h.act(mid,"resume")
        for _ in range(max(1,delay//200)-1):
            await ticks(h,1); assert schedule(h,mid).actions[1].state=="Pending"
        await ticks(h,1)
        second=schedule(h,mid).actions[1]
        assert second.motion.accepted_tick==2+max(1,delay//200)
        assert second.motion.origin==first.motion.destination
        await ticks(h,10)
        assert all(e.state=="Completed" for e in schedule(h,mid).actions)
        assert [e.consumed_tick for e in schedule(h,mid).actions]==[e["consumedTick"] for e in nominal_plan(rev.content)]
    asyncio.run(run())


@pytest.mark.parametrize("change", [
    lambda d:d["actions"][1].update(afterActionId="missing"),
    lambda d:d["actions"][1].update(afterActionId="third"),
    lambda d:d["actions"][1].update(unitId="unit-1"),
    lambda d:d["actions"][2].update(afterActionId="first"),
    lambda d:d["actions"][1].update(delayMs=1),
    lambda d:d["actions"][1].update(offsetMs=200),
    lambda d:d.update(scheduleRuleVersion="local-schedule-v1"),
])
def test_dependency_shape_rejects_ambiguous_graphs(change):
    data=chain();change(data)
    with pytest.raises(ValidationError):write(data)


def test_stop_breaks_chain_return_cannot_replay_and_restart_interrupts():
    h=Harness()
    async def run():
        mid,_,_=await ready(h,chain())
        await h.act(mid,"acquire");await h.act(mid,"start")
        assert (await h.service.command(mid,await selected(h,mid,"stop",1),CREDENTIAL)).accepted
        assert [e.state for e in schedule(h,mid).actions]==["Cancelled","Skipped","Skipped"]
        await h.service.command(mid,await selected(h,mid,"return-to-script",2),CREDENTIAL)
        before=h.authority.read(mid).tracks
        await ticks(h,10)
        assert all(t.latest.position==before[k].latest.position for k,t in h.authority.read(mid).tracks.items())
        await h.act(mid,"end")
        mid,_,_=await ready(h,chain(600))
        await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,2)
        old=schedule(h,mid).actions[0]
        h.service=InteractiveService(h.authority,True);await h.service.recover()
        assert schedule(h,mid).actions[0]==old
        assert [e.state for e in schedule(h,mid).actions][1:]==["Interrupted","Interrupted"]
        await h.act(mid,"acquire");await h.act(mid,"resume");await ticks(h,10)
        assert schedule(h,mid).actions[1].motion is None
    asyncio.run(run())


def test_nominal_conflict_refuses_run_and_source_horizon_is_finite():
    h=Harness()
    async def run():
        data=chain();data["actions"].append(dict(id="fixed",unitId="unit-0",kind="move",offsetMs=600,ordinal=3,destination=geographic(100,0)))
        s=ScenarioService(h.authority,True);rev=(await s.write(write(data))).result
        review=s.review(run_request(rev).scenario)
        assert any(i.code=="SCRIPT_TIMING_INVALID" and "precedence" in i.message for i in review.issues)
        assert not (await h.service.create(run_request(rev))).accepted
        data=chain(600000)
        rev=(await s.write(write(data))).result
        assert any("600 second" in i.message for i in s.review(run_request(rev).scenario).issues)
    asyncio.run(run())


def test_live_boundary_atomically_stops_remaining_manual_and_source_paths():
    h=Harness()
    async def run():
        data=content();data.update(scheduleRuleVersion="local-schedule-v1",actions=[
            dict(id=f"action-{i}",unitId=f"unit-{i}",kind="move",offsetMs=0,ordinal=i,destination=geographic(900,i*10)) for i in range(3)])
        mid,rev,_=await ready(h,data)
        frozen=canonical(rev);initial=h.repo.latest_text(mid)
        await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,1)
        move=direct(h,mid);raw=json.loads(canonical(move));raw["direct"]["anchor"]=geographic(900,0)
        from app.commands.contracts import DirectMoveRequest
        assert (await issue(h,mid,DirectMoveRequest.model_validate(raw))).accepted
        before=h.authority.read(mid)
        cmd=await mutation(h,mid)
        receipt=await h.service.command(mid,cmd,CREDENTIAL)
        assert receipt.accepted and receipt.boundary_revision==1
        after=h.authority.read(mid)
        assert after.live_boundaries.revision==1
        assert after.interactive.executions[-1].state=="Failed"
        assert [e.state for e in after.scenario_schedule.actions]==["Cancelled","Failed","Failed"]
        assert all(t.latest.position==before.tracks[k].latest.position for k,t in after.tracks.items())
        assert canonical(ScenarioService(h.authority,True).get(rev.definition_id))==frozen
        assert h.repo.db.execute('SELECT frame_json FROM frames WHERE frame_id=?',(read_frame(initial).frame_id,)).fetchone()[0]==initial
        assert await h.service.command(mid,cmd,None)==receipt
        assert (await h.service.command(mid,await mutation(h,mid,expected=1,delete=True),CREDENTIAL)).accepted
        await ticks(h,3)
        assert h.authority.read(mid).interactive.executions[-1].state=="Failed"
        assert not h.authority.read(mid).boundary_rules.zones
    asyncio.run(run())


def test_live_occupants_forgery_conflict_paused_lease_and_recovery():
    h=Harness()
    async def run():
        mid,_,_=await ready(h,content())
        await h.act(mid,"acquire");await h.act(mid,"start");await h.act(mid,"pause")
        for _ in range(4):h.advance(10);await h.act(mid,"renew")
        occupied=boundary(points=[(-10,-10),(50,-10),(50,10),(-10,10)])
        before=h.repo.latest_text(mid)
        rejected=await h.service.command(mid,await mutation(h,mid,occupied),CREDENTIAL)
        assert not rejected.accepted and "inside/on" in rejected.message and h.repo.latest_text(mid)==before
        forged=await mutation(h,mid)
        assert not (await h.service.command(mid,forged,OTHER)).accepted
        first=await mutation(h,mid);stale=await mutation(h,mid)
        assert (await h.service.command(mid,first,CREDENTIAL)).accepted
        assert (await h.service.command(mid,stale,CREDENTIAL)).code=="BOUNDARY_CONFLICT"
        frame=h.authority.read(mid)
        h.service=InteractiveService(h.authority,True);await h.service.recover()
        restored=h.authority.read(mid)
        assert restored.zones==frame.zones and restored.live_boundaries==frame.live_boundaries
        await h.act(mid,"acquire");await h.act(mid,"end")
        assert (await h.service.command(mid,await mutation(h,mid,expected=1,delete=True),CREDENTIAL)).code=="RUN_TERMINAL"
    asyncio.run(run())


def test_boundary_storage_failure_rolls_back_geometry_motion_and_receipt(monkeypatch):
    h=Harness()
    async def run():
        mid,_,_=await ready(h,content());await h.act(mid,"acquire")
        cmd=await mutation(h,mid);before=h.repo.latest_text(mid)
        save=h.repo.save_checkpoint
        def fail(*_):raise sqlite3.OperationalError("isolated injected failure")
        monkeypatch.setattr(h.repo,"save_checkpoint",fail)
        with pytest.raises(sqlite3.OperationalError):await h.service.command(mid,cmd,CREDENTIAL)
        assert h.repo.latest_text(mid)==before and h.repo.receipt(cmd.command_id,mid) is None
        monkeypatch.setattr(h.repo,"save_checkpoint",save)
        assert (await h.service.command(mid,cmd,CREDENTIAL)).boundary_revision==1
    asyncio.run(run())


def test_frozen_d3_readers_reject_new_semantics_and_preserve_bytes():
    raw=(Path(__file__).parents[2]/"contracts/sentinel/v1.8/demo.world.json").read_text(encoding="utf-8")
    assert read_frame(raw).schema_version=="1.10"
    value=json.loads(raw);value["interactive"]["capabilities"].append("boundary-edit")
    with pytest.raises(ValidationError):read_frame(json.dumps(value))
    h=Harness()
    async def run():
        data=chain();data["actions"]=data["actions"][:1];data["scheduleRuleVersion"]="local-schedule-v1"
        s=ScenarioService(h.authority,True);saved=(await s.write(write(data))).result
        assert saved.schema_version=="1.2"
        frozen=canonical(saved);assert canonical(s.get(saved.definition_id))==frozen
        value=json.loads(frozen);value["content"]["actions"][0]["afterActionId"]=None
        with pytest.raises(ValidationError):ScenarioRevision.model_validate(value)
    asyncio.run(run())


def test_legacy_custom_mission_catalog_projects_origin_without_rewriting_recordings():
    h=Harness()
    async def run():
        mid,rev,_=await ready(h,content())
        raw=h.repo.db.execute('SELECT mission_json FROM recordings WHERE mission_id=?',(mid,)).fetchone()[0]
        old=json.loads(raw);old['extensions'].pop('sentinel.scenario',None)
        legacy=canonical(old)
        h.repo.db.execute('UPDATE recordings SET mission_json=? WHERE mission_id=?',(legacy,mid))
        frame_before=h.repo.latest_text(mid)
        mission=next(m for m in h.repo.list_missions() if m.id==mid)
        assert mission.extensions['sentinel.scenario']==dict(name=rev.content.name,revision=rev.revision,definitionId=rev.definition_id)
        assert mission.name==h.repo.demo_alias(mid)
        assert h.repo.db.execute('SELECT mission_json FROM recordings WHERE mission_id=?',(mid,)).fetchone()[0]==legacy
        assert h.repo.latest_text(mid)==frame_before
    asyncio.run(run())
