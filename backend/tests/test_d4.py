"""D4 candidate/transaction/authority acceptance against isolated databases."""
import asyncio
import json
import sqlite3
from copy import deepcopy
from uuid import uuid4
import pytest
from app.commands.contracts import CommandRequest, DirectMoveMember
from app.commands.behavior_contracts import BehaviorPolicy
from app.commands.behavior_geometry import swept_contact, patrol_route
from app.commands.kinematics import geographic, distance
from app.commands.service import InteractiveService, plus
from app.world.serialization import canonical
from test_interactive import Harness, CREDENTIAL
from test_conductor import ready, selected
from test_direct_movement import direct, issue
from test_movement import ticks
from test_d3a import mutation


def arrangement(friendly=1, hostile=1, separation=100, height=150.125):
    units = []
    for category, count, x in (("friendly", friendly, 0), ("hostile", hostile, separation)):
        for i in range(count):
            units.append(dict(id=f"{category}-{i}", label=f"{category.title()} {i+1}", category=category,
                commandRole="sentinel" if category == "friendly" else "observation", headingTrueDeg=73.5,
                position={**geographic(x, i*8), "altitude":dict(metres=height, reference="ELLIPSOID", datumId="WGS84")}))
    return dict(name="D4 isolated exercise", units=units)


async def started(h, data=None):
    mid, _, _ = await ready(h, data or arrangement())
    await h.act(mid, "acquire"); await h.act(mid, "start"); await ticks(h, 1)
    legacy_fleet(h, mid)
    return mid


def legacy_fleet(h, mid):
    """These tests retain the published v1 fleet rules. Refinement has its own suite."""
    frame=json.loads(canonical(h.authority.read(mid))); checkpoint=h.repo.checkpoint(mid)
    checkpoint['fleetBehavior']['ruleVersion']='local-fleet-v1'
    checkpoint['fleetBehavior']['model']['acquisitionRadiusM']=250.0
    h.service._commit(mid,frame,[],checkpoint)


async def policy(h, mid, kind="intercept", order=1, indices=None, boundary_id=None):
    frame = h.authority.read(mid)
    controls = frame.interactive.controls
    keys = ("assetId", "entityId", "executorId", "sourceId", "controlTrackId", "grantId", "bindingRevision")
    members = [DirectMoveMember.model_validate({k:v for k,v in c.model_dump(by_alias=True).items() if k in keys})
        for i,c in enumerate(controls) if indices is None or i in indices]
    value = dict(kind=kind)
    if kind == "patrol":
        value.update(boundaryId=boundary_id, reviewedFrameId=frame.frame_id, deadline=plus(frame.recorded_at,30))
    intent = await h.service.issue_intent(mid,"behavior",members=members,order=order,policy=BehaviorPolicy.model_validate(value))
    return CommandRequest(command_id=str(uuid4()),holder_id="operator-one",intent=intent)


async def arm(h, mid, order=1, indices=None):
    result = await h.service.command(mid, await policy(h,mid,order=order,indices=indices), CREDENTIAL)
    assert result.accepted, result.message
    return result


def approach(h, mid, order=2, indices=None, x=100, y=0):
    if indices is None: indices = tuple(range(len(h.authority.read(mid).interactive.controls)))
    p=geographic(x,y)
    r=direct(h,mid,order,indices,p["longitudeDeg"],p["latitudeDeg"])
    return r.model_copy(update={"direct":r.direct.model_copy(update={"intercept":True})})


def fleet(h, mid):
    return h.authority.read(mid).fleet_behavior


@pytest.mark.parametrize("hostiles", [5,10])
def test_unique_allocation_reserves_and_explicit_later_deployment(hostiles):
    h=Harness()
    async def run():
        mid=await started(h,arrangement(10,hostiles))
        await arm(h,mid)
        assert not fleet(h,mid).assignments
        receipt=await issue(h,mid,approach(h,mid))
        assert receipt.accepted and len(receipt.target_scope)==hostiles
        f=fleet(h,mid); active=[a for a in f.assignments if a.state=="active"]
        assert len(active)==hostiles==len({a.target_id for a in active})
        assert sum(m.state=="reserve" for m in f.members)==10-hostiles
        # New decisions preserve existing valid pairs and do not reshuffle.
        old_ids={a.id for a in active}
        assert (await issue(h,mid,approach(h,mid,3))).accepted
        assert {a.id for a in fleet(h,mid).assignments if a.state=="active"}==old_ids
        if hostiles==5:
            assignments=[a for a in fleet(h,mid).assignments if a.state=="active"]
            stopped=assignments[0]
            controls=h.authority.read(mid).interactive.controls
            i=next(i for i,c in enumerate(controls) if c.asset_id==stopped.asset_id)
            member=approach(h,mid,indices=(i,)).direct.members
            assert (await h.service.command(mid,await selected(h,mid,"stop",4,member),CREDENTIAL)).accepted
            await ticks(h,1)
            reserves=[m.asset_id for m in fleet(h,mid).members if m.state=="reserve"]
            assert len(reserves)==5 and len([a for a in fleet(h,mid).assignments if a.state=="active"])==4
            reserve_i=next(i for i,c in enumerate(controls) if c.asset_id==reserves[0])
            assert (await issue(h,mid,approach(h,mid,5,(reserve_i,)))).accepted
            assert len([a for a in fleet(h,mid).assignments if a.state=="active"])==5
            assert len([m for m in fleet(h,mid).members if m.state=="reserve"])==4
        await h.act(mid,"end")
    asyncio.run(run())


def test_atomic_mutual_loss_height_future_scripts_exact_once_restart(tmp_path):
    h=Harness(tmp_path/'loss.sqlite3')
    async def run():
        data=arrangement();data.update(scheduleRuleVersion="local-schedule-v2",actions=[
            dict(id="hostile-moving",unitId="hostile-0",kind="move",offsetMs=0,ordinal=0,destination=geographic(75,0)),
            dict(id="after",unitId="hostile-0",kind="move",afterActionId="hostile-moving",delayMs=2000,ordinal=1,destination=geographic(200,0)),
            dict(id="friendly-future",unitId="friendly-0",kind="move",offsetMs=5000,ordinal=2,destination=geographic(300,0))])
        mid=await started(h,data);await arm(h,mid)
        request=approach(h,mid)
        receipt=await issue(h,mid,request);assert receipt.accepted
        await ticks(h,20)
        frame=h.authority.read(mid); f=fleet(h,mid)
        assert len(f.outcomes)==1
        o=f.outcomes[0]
        assert o.input_sequence+1==o.committed_sequence and o.rule_version=="demo-mutual-loss-v1"
        assert all(e.condition=="non-operational" and e.presence=="present" for e in frame.entities.values())
        assert all(a.availability=="unavailable" for a in frame.assets.values())
        assert all(t.latest.position.altitude.metres==150.125 and t.latest.velocity.speed_mps==0 for t in frame.tracks.values())
        assert all(s.state in {"Completed","Cancelled","Skipped"} for s in frame.scenario_schedule.actions)
        assert not any(a.state=="active" for a in f.assignments)
        assert await h.service.direct_move(mid,request,None)==receipt
        positions={k:t.latest.position for k,t in frame.tracks.items()}
        h.service=InteractiveService(h.authority,True);await h.service.recover()
        assert h.authority.read(mid).interactive.state=="paused"
        assert fleet(h,mid).outcomes==f.outcomes
        await h.act(mid,"acquire");await h.act(mid,"resume");await ticks(h,5)
        assert {k:t.latest.position for k,t in h.authority.read(mid).tracks.items()}==positions
        assert len(fleet(h,mid).outcomes)==1
        await h.act(mid,"end")
    asyncio.run(run())


def test_unarmed_move_no_loss_stop_disarms_and_delayed_orders_lose():
    h=Harness()
    async def run():
        mid=await started(h,arrangement(separation=30))
        p=geographic(50,0)
        assert (await issue(h,mid,direct(h,mid,1,longitude=p["longitudeDeg"],latitude=p["latitudeDeg"]))).accepted
        await ticks(h,10);assert not fleet(h,mid).outcomes
        await arm(h,mid,2)
        delayed=approach(h,mid,3,x=30)
        stop=await selected(h,mid,"stop",4)
        assert (await h.service.command(mid,stop,CREDENTIAL)).accepted
        assert not (await issue(h,mid,delayed)).accepted
        assert not (await issue(h,mid,approach(h,mid,5,x=30))).accepted
        await ticks(h,3);assert not fleet(h,mid).outcomes
        assert fleet(h,mid).members[0].policy=="hold"
        await h.act(mid,"end")
    asyncio.run(run())


def test_empty_local_scope_no_global_attack_and_new_targets_not_added():
    h=Harness()
    async def run():
        mid=await started(h,arrangement(2,2,separation=800));await arm(h,mid)
        r=await issue(h,mid,approach(h,mid,x=100));assert r.accepted and not r.target_scope
        assert all("No eligible targets" in o.reason for o in r.behavior_outcomes)
        await ticks(h,5);assert not fleet(h,mid).assignments
        await h.act(mid,"end")
    asyncio.run(run())


@pytest.mark.parametrize("height_delta,contact", [(0,True),(25,True),(25.001,True),(25.002,False),(100,False)])
def test_swept_contact_equality_tolerance_height_and_stationary(height_delta,contact):
    def p(x,z=0):return {**geographic(x,0),"altitude":dict(metres=z,reference="ELLIPSOID",datumId="WGS84")}
    assert (swept_contact(p(-100),p(100),p(0,height_delta),p(0,height_delta)) is not None)==contact
    assert swept_contact(p(0),p(0),p(0),p(0))==0
    assert swept_contact(p(0),p(0),p(100),p(100)) is None


def test_persistence_failure_rolls_back_assignment_then_both_losses(monkeypatch):
    h=Harness()
    async def run():
        mid=await started(h,arrangement(separation=30));await arm(h,mid)
        request=approach(h,mid,x=30)
        before=h.repo.latest_text(mid); checkpoint=h.repo.checkpoint(mid)
        save=h.repo.save_checkpoint
        def fail(*args):raise sqlite3.OperationalError("D4 forced failure")
        monkeypatch.setattr(h.repo,"save_checkpoint",fail)
        with pytest.raises(sqlite3.OperationalError):await issue(h,mid,request)
        assert h.repo.latest_text(mid)==before and h.repo.checkpoint(mid)==checkpoint
        assert h.repo.receipt(request.command_id,mid) is None
        monkeypatch.setattr(h.repo,"save_checkpoint",save)
        assert (await issue(h,mid,request)).accepted
        before=h.repo.latest_text(mid); checkpoint=h.repo.checkpoint(mid)
        monkeypatch.setattr(h.repo,"save_checkpoint",fail)
        with pytest.raises(sqlite3.OperationalError):await ticks(h,1)
        assert h.repo.latest_text(mid)==before and h.repo.checkpoint(mid)==checkpoint
        monkeypatch.setattr(h.repo,"save_checkpoint",save)
        await ticks(h,1);assert len(fleet(h,mid).outcomes)==1
        await h.act(mid,"end")
    asyncio.run(run())


def polygon(kind="patrol",x=100,y=0,size=40):
    points=[geographic(x-size,y-size),geographic(x+size,y-size),geographic(x+size,y+size),geographic(x-size,y+size)]
    return dict(id="area",name=f"{kind.title()} area",type=kind,vertices=[[p["longitudeDeg"],p["latitudeDeg"]] for p in points])


def test_patrol_loops_pause_live_edit_hold_and_return_future_script():
    h=Harness()
    async def run():
        data=arrangement(hostile=0);data.update(boundaryRuleVersion="local-boundary-v1",boundaries=[polygon(size=12)])
        mid=await started(h,data)
        zid=next(iter(h.authority.read(mid).boundary_rules.zones))
        r=await h.service.command(mid,await policy(h,mid,"patrol",boundary_id=zid),CREDENTIAL);assert r.accepted,r.message
        await ticks(h,50)
        assert fleet(h,mid).members[0].patrol.completed_loops>=2
        await h.act(mid,"pause"); before=h.authority.read(mid)
        for _ in range(4):h.advance(10);await h.act(mid,"renew");await h.service.tick()
        assert fleet(h,mid).members[0]==before.fleet_behavior.members[0]
        change=await mutation(h,mid,polygon(size=20))
        assert (await h.service.command(mid,change,CREDENTIAL)).accepted
        assert fleet(h,mid).members[0].state=="blocked"
        assert "reapply" in fleet(h,mid).members[0].reason
        pos=h.authority.read(mid).tracks
        await h.act(mid,"resume");await ticks(h,4)
        assert all(t.latest.position==pos[k].latest.position for k,t in h.authority.read(mid).tracks.items())
        await h.act(mid,"end")
    asyncio.run(run())


def test_friendly_change_paused_releases_only_affected_assignment():
    h=Harness()
    async def run():
        data=arrangement(2,2,separation=150)
        data["units"][1]["position"].update(geographic(0,300));data["units"][3]["position"].update(geographic(150,300))
        mid=await started(h,data);await arm(h,mid)
        assert (await issue(h,mid,approach(h,mid,x=150,y=150))).accepted
        assert len([a for a in fleet(h,mid).assignments if a.state=="active"])==2
        await h.act(mid,"pause")
        change=await mutation(h,mid,polygon("friendly",150,0,25))
        assert (await h.service.command(mid,change,CREDENTIAL)).accepted
        assert len([a for a in fleet(h,mid).assignments if a.state=="active"])==1
        assert sum(m.state=="blocked" for m in fleet(h,mid).members)==1
        await h.act(mid,"resume");await ticks(h,20)
        assert len(fleet(h,mid).outcomes)==1
        await h.act(mid,"end")
    asyncio.run(run())


@pytest.mark.parametrize("category", ["hostile", "unknown", "friendly"])
def test_observation_entities_cannot_gain_operator_authority(category):
    h=Harness()
    async def run():
        data=arrangement(hostile=0)
        unit=deepcopy(data["units"][0]);unit.update(id="observed",label="Observation only",category=category,commandRole="observation")
        unit["position"].update(geographic(200,0));data["units"].append(unit)
        mid=await started(h,data)
        good=await policy(h,mid)
        observed=h.authority.read(mid).scenario.entity_ids["observed"]
        forged=good.intent.members[0].model_copy(update={"entity_id":observed})
        intent=await h.service.issue_intent(mid,"behavior",members=[forged],order=1,policy=BehaviorPolicy(kind="intercept"))
        r=await h.service.command(mid,CommandRequest(command_id=str(uuid4()),holder_id="operator-one",intent=intent),CREDENTIAL)
        assert not r.accepted and r.code=="CONTROL_REQUIRED"
        assert not fleet(h,mid).members
        await h.act(mid,"end")
    asyncio.run(run())


def test_frozen_scope_unavailable_target_and_unaffected_assignment():
    h=Harness()
    async def run():
        data=arrangement(3,3,separation=200)
        data["units"][-1]["position"].update(geographic(1500,0))
        mid=await started(h,data);await arm(h,mid)
        r=await issue(h,mid,approach(h,mid,x=200));assert len(r.target_scope)==2
        f=fleet(h,mid);active=[a for a in f.assignments if a.state=="active"]
        frame=json.loads(canonical(h.authority.read(mid)))
        frame["tracks"][active[0].target_track_id]["state"]="stale"
        newcomer=frame["scenario"]["entityIds"]["hostile-2"]
        frame["tracks"][f"{newcomer}:control"]["latest"]["position"].update(geographic(100,0))
        await h.authority.commit_source(mid,lambda _: (frame, []))
        await ticks(h,1)
        f=fleet(h,mid)
        assert [a.id for a in f.assignments if a.state=="active"]==[active[1].id]
        assert all(newcomer not in m.target_scope for m in f.members)
        assert sum(m.state=="reserve" for m in f.members)==1
        assert any("unavailable" in m.reason for m in f.members)
        await ticks(h,28)
        assert len(fleet(h,mid).outcomes)==1
        assert h.authority.read(mid).entities[newcomer].condition=="operational"
        await h.act(mid,"end")
    asyncio.run(run())


def test_patrol_ingress_and_loop_refusal_preserve_previous_policy():
    h=Harness()
    async def run():
        patrol=polygon(size=12); wall=polygon("restricted",50,0,15);wall["id"]="wall"
        data=arrangement(hostile=0);data.update(boundaryRuleVersion="local-boundary-v1",boundaries=[patrol,wall])
        mid=await started(h,data);await arm(h,mid)
        before=fleet(h,mid); zid=next(k for k,v in h.authority.read(mid).boundary_rules.zones.items() if v=="patrol")
        refused=await h.service.command(mid,await policy(h,mid,"patrol",2,boundary_id=zid),CREDENTIAL)
        assert not refused.accepted and "Restricted" in refused.message
        assert fleet(h,mid)==before
        frame=json.loads(canonical(h.authority.read(mid)))
        # Straight ingress and every loop edge are independently checked.
        from app.commands.errors import CommandError
        from app.commands.kinematics import geographic
        asset=frame["interactive"]["controls"][0]["assetId"]
        origin=frame["tracks"][frame["interactive"]["controls"][0]["controlTrackId"]]["latest"]["position"]
        with pytest.raises(CommandError):patrol_route(frame,zid,asset,origin)
        restriction=next(k for k,v in frame["boundaryRules"]["zones"].items() if v=="restricted")
        points=polygon("restricted",100,0,2)["vertices"]
        # A strip intersects two loop segments, while a safe external origin tests all edges.
        points=[[geographic(99,-30)["longitudeDeg"],geographic(99,-30)["latitudeDeg"]],
                [geographic(101,-30)["longitudeDeg"],geographic(101,-30)["latitudeDeg"]],
                [geographic(101,30)["longitudeDeg"],geographic(101,30)["latitudeDeg"]],
                [geographic(99,30)["longitudeDeg"],geographic(99,30)["latitudeDeg"]]]
        frame["zones"][restriction]["geometry"]["coordinates"]=[points+[points[0]]]
        with pytest.raises(CommandError):patrol_route(frame,zid,asset,origin)
        await h.act(mid,"end")
    asyncio.run(run())


@pytest.mark.parametrize("terminal", ["revoke", "end", "restart"])
def test_behavior_lifecycle_interrupts_without_rearming_or_catchup(terminal):
    h=Harness()
    async def run():
        mid=await started(h,arrangement(2,1,separation=1500));await arm(h,mid)
        assert (await issue(h,mid,approach(h,mid,x=1500))).accepted
        await ticks(h,1)
        positions={k:t.latest.position for k,t in h.authority.read(mid).tracks.items()}
        if terminal=="restart":
            old=h.authority.read(mid).interactive.executor_epoch
            h.service=InteractiveService(h.authority,True);await h.service.recover()
            assert h.authority.read(mid).interactive.executor_epoch!=old
            assert not h.service.status(mid,CREDENTIAL).owns_control
            assert h.authority.read(mid).interactive.state=="paused"
        else:assert (await h.act(mid,terminal)).accepted
        assert all(m.policy=="hold" for m in fleet(h,mid).members)
        assert not any(a.state=="active" for a in fleet(h,mid).assignments)
        if terminal!="end":
            await h.act(mid,"acquire")
            if terminal=="restart":await h.act(mid,"resume")
        await ticks(h,5)
        assert {k:t.latest.position for k,t in h.authority.read(mid).tracks.items()}==positions
        assert not fleet(h,mid).outcomes
        if terminal!="end":await h.act(mid,"end")
    asyncio.run(run())


def test_long_pause_nonpositional_policy_stop_return_future_only_and_expiry():
    h=Harness()
    async def run():
        data=arrangement(hostile=0);data.update(scheduleRuleVersion="local-schedule-v2",actions=[
            dict(id="prior",unitId="friendly-0",kind="move",offsetMs=0,ordinal=0,destination=geographic(400,0)),
            dict(id="broken",unitId="friendly-0",kind="move",afterActionId="prior",delayMs=0,ordinal=1,destination=geographic(500,0)),
            dict(id="future",unitId="friendly-0",kind="move",offsetMs=20000,ordinal=2,destination=geographic(600,0))])
        mid=await started(h,data);await h.act(mid,"pause")
        for _ in range(6):h.advance(10);await h.act(mid,"renew");await h.service.tick()
        await arm(h,mid)
        assert (await h.service.command(mid,await selected(h,mid,"stop",2),CREDENTIAL)).accepted
        assert (await h.service.command(mid,await selected(h,mid,"return-to-script",3),CREDENTIAL)).accepted
        states={s.action.id:s.state for s in h.authority.read(mid).scenario_schedule.actions}
        assert states=={"prior":"Cancelled","broken":"Skipped","future":"Pending"}
        await h.act(mid,"resume");await ticks(h,101)
        assert h.authority.read(mid).scenario_schedule.actions[-1].state=="Running"
        await arm(h,mid,4)
        # An accepted positional policy that never started expires while paused.
        assert (await issue(h,mid,approach(h,mid,5,x=100))).accepted # no scope holds reserves
        assert (await h.service.command(mid,await selected(h,mid,"stop",6),CREDENTIAL)).accepted
        await h.act(mid,"end")
    asyncio.run(run())


def test_started_work_survives_lease_expiry_and_unstarted_patrol_expires():
    h=Harness()
    async def run():
        data=arrangement(hostile=0);data.update(boundaryRuleVersion="local-boundary-v1",boundaries=[polygon(x=1000,size=20)])
        mid=await started(h,data);zid=next(iter(h.authority.read(mid).boundary_rules.zones))
        assert (await h.service.command(mid,await policy(h,mid,"patrol",boundary_id=zid),CREDENTIAL)).accepted
        await ticks(h,1);first=h.authority.read(mid)
        h.advance(31);await h.service.tick()
        assert fleet(h,mid).members[0].state=="patrolling"
        assert h.authority.read(mid).tracks!=first.tracks
        await h.act(mid,"reclaim")
        assert (await h.service.command(mid,await policy(h,mid,"patrol",2,boundary_id=zid),CREDENTIAL)).accepted
        await h.act(mid,"pause")
        for _ in range(4):h.advance(10);await h.act(mid,"renew");await h.service.tick()
        assert fleet(h,mid).members[0].state=="blocked" and fleet(h,mid).members[0].policy=="hold"
        assert "expired" in fleet(h,mid).members[0].reason
        await h.act(mid,"resume");positions=h.authority.read(mid).tracks
        await ticks(h,3)
        assert all(t.latest.position==positions[k].latest.position for k,t in h.authority.read(mid).tracks.items())
        await h.act(mid,"end")
    asyncio.run(run())


@pytest.mark.parametrize("legacy", [False, True])
def test_reviewed_move_fences_delayed_direct_and_behavior_orders(legacy):
    from test_movement import draft
    h=Harness()
    async def run():
        mid=await started(h,arrangement(hostile=0));await arm(h,mid)
        delayed=approach(h,mid,2)
        old_policy=await policy(h,mid,"intercept",2)
        move=draft(h,mid)
        if not legacy:move=move.model_copy(update={"order":3})
        r=await h.service.move(mid,move,CREDENTIAL)
        assert r.accepted and r.movement_order==(None if legacy else 3)
        assert not (await issue(h,mid,delayed)).accepted
        if not legacy:assert not (await h.service.command(mid,old_policy,CREDENTIAL)).accepted
        assert fleet(h,mid).members[0].policy=="hold"
        assert await h.service.move(mid,move,None)==r
        await h.act(mid,"end")
    asyncio.run(run())


def test_contact_truncates_candidate_completion_and_never_rewrites_old_completions():
    h=Harness()
    async def run():
        data=arrangement(separation=25.5)
        data.update(scheduleRuleVersion="local-schedule-v2",actions=[
            dict(id="contact-leg",unitId="hostile-0",kind="move",offsetMs=0,ordinal=0,destination=geographic(9.5,0)),
            dict(id="dependent",unitId="hostile-0",kind="move",afterActionId="contact-leg",delayMs=0,ordinal=1,destination=geographic(60,0))])
        mid=await started(h,data);await arm(h,mid)
        assert (await issue(h,mid,approach(h,mid,x=20))).accepted
        await ticks(h,1)
        f=h.authority.read(mid);assert len(f.fleet_behavior.outcomes)==1
        assert f.fleet_behavior.outcomes[0].fraction==0
        assert f.scenario_schedule.actions[0].state=="Cancelled"
        assert f.scenario_schedule.actions[0].motion.completion_sample is None
        assert f.scenario_schedule.actions[1].state in {"Cancelled","Skipped"}
        assert not any(e.type=="script.completed" for e in f.recent_events)
        position=f.tracks[f.scenario_schedule.actions[0].track_id].latest.position
        assert distance(position.model_dump(by_alias=True),f.fleet_behavior.outcomes[0].participants[1].before.model_dump(by_alias=True))<0.001
        await h.act(mid,"end")
    asyncio.run(run())


def test_strict_d3a_world_does_not_gain_behavior_capabilities():
    from pathlib import Path
    from pydantic import ValidationError
    from app.world.serialization import read_frame
    raw=(Path(__file__).parents[2]/"contracts/sentinel/v1.9/demo.world.json").read_text(encoding="utf-8")
    migrated=read_frame(raw)
    assert migrated.schema_version=="1.10" and migrated.fleet_behavior is None
    assert "fleet-policy" not in migrated.interactive.capabilities
    forged=json.loads(raw);forged["fleetBehavior"]=None
    with pytest.raises(ValidationError):read_frame(json.dumps(forged))
    forged=json.loads(raw);forged["interactive"]["capabilities"].append("demo-outcome")
    with pytest.raises(ValidationError):read_frame(json.dumps(forged))


def test_mixed_quick_demo_policy_approach_and_stop_skip_unavailable_bindings():
    h=Harness()
    async def run():
        mid=(await h.create()).mission_id
        await h.act(mid,"acquire");await h.act(mid,"start");await ticks(h,1)
        legacy_fleet(h, mid)
        command=await policy(h,mid)
        armed=await h.service.command(mid,command,CREDENTIAL)
        assert armed.accepted
        assert [o.outcome for o in armed.behavior_outcomes]==["accepted","accepted","skipped","skipped"]
        assert await h.service.command(mid,command,None)==armed
        f=h.authority.read(mid)
        hostile=next(e.id for e in f.entities.values() if e.affiliation=="hostile")
        from app.commands.kinematics import metric
        target=next(t.latest.position for t in f.tracks.values() if t.entity_id==hostile)
        x,y=metric(target.model_dump(by_alias=True))
        r=await issue(h,mid,approach(h,mid,x=x,y=y))
        assert r.accepted and r.target_scope==[hostile]
        assert sum(o.outcome=="skipped" for o in r.behavior_outcomes)==2
        assert len([a for a in fleet(h,mid).assignments if a.state=="active"])==1
        stopped=await h.service.command(mid,await selected(h,mid,"stop",3),CREDENTIAL)
        assert stopped.accepted
        assert [o.outcome for o in stopped.control_outcomes]==["accepted","accepted","skipped","skipped"]
        assert not any(a.state=="active" for a in fleet(h,mid).assignments)
        before=h.authority.read(mid)
        refused=await h.service.command(mid,await policy(h,mid,order=4,indices=(2,3)),CREDENTIAL)
        assert not refused.accepted and refused.code=="NO_AVAILABLE_ASSETS"
        assert len(refused.behavior_outcomes)==2
        assert h.authority.read(mid)==before
        await h.act(mid,"end")
    asyncio.run(run())
