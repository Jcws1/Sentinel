"""Refinement acceptance against isolated in-memory databases and committed frames."""
import asyncio
import json
import sqlite3
from copy import deepcopy
import pytest
from app.commands.kinematics import geographic, distance
from app.commands.unit_profiles import profile
from app.world.serialization import canonical
from test_interactive import Harness, CREDENTIAL
from test_conductor import ready, selected
from test_d4 import arrangement, policy, arm, fleet
from test_direct_movement import direct, issue
from test_movement import ticks
from test_d4 import polygon
from test_d3a import mutation


async def setup(h, friendly=5, hostile=5, separation=400, typed=False):
    data = arrangement(friendly, hostile, separation)
    if typed:
        for u in data['units']:
            u['profileId'] = 'sting-v1' if u['category'] == 'friendly' else 'shahed-136-v1'
    mid, _, _ = await ready(h, data)
    await h.act(mid, 'acquire'); await h.act(mid, 'start'); await ticks(h, 1)
    return mid


def move(h, mid, order=2, x=1000, y=0, indices=None):
    p=geographic(x,y)
    return direct(h,mid,order,tuple(range(len(h.authority.read(mid).interactive.controls))) if indices is None else indices,p['longitudeDeg'],p['latitudeDeg'])


@pytest.mark.parametrize('friendly,hostile', [(5,5),(10,10),(5,1),(5,0)])
def test_group_moves_independently_of_assignment(friendly,hostile):
    h=Harness()
    async def run():
        mid=await setup(h,friendly,hostile)
        await arm(h,mid)
        receipt=await issue(h,mid,move(h,mid))
        assert receipt.accepted and len(receipt.execution_ids)==friendly
        before=h.authority.read(mid)
        await ticks(h,1)
        frame=h.authority.read(mid); f=frame.fleet_behavior
        active=[a for a in f.assignments if a.state=='active']
        assert len(active)==hostile==len({a.target_id for a in active})
        assert all(m.state!='reserve' for m in f.members)
        for c in frame.interactive.controls:
            assert distance(json.loads(canonical(frame.tracks[c.control_track_id].latest.position)),json.loads(canonical(before.tracks[c.control_track_id].latest.position)))>0
        assert sum(e.state=='Suspended' for e in frame.interactive.executions)==hostile
    asyncio.run(run())


def test_idle_acquisition_profiles_loss_resume_and_manual():
    h=Harness()
    async def run():
        mid=await setup(h,1,1,typed=True)
        receipt=await issue(h,mid,move(h,mid,order=1))
        await ticks(h,1)
        frame=h.authority.read(mid); c=frame.interactive.controls[0]
        assert frame.tracks[c.control_track_id].latest.velocity.speed_mps==170/3.6
        await arm(h,mid,order=2)
        await ticks(h,1)
        frame=h.authority.read(mid)
        assert frame.tracks[c.control_track_id].latest.velocity.speed_mps==280/3.6
        assert frame.interactive.executions[0].id==receipt.execution_ids[0]
        # A target leaves the same authoritative source's proximity footprint.
        async with h.authority._lock(mid):
            proposed=json.loads(canonical(frame)); checkpoint=h.repo.checkpoint(mid)
            a=next(a for a in checkpoint['fleetBehavior']['assignments'] if a['state']=='active')
            p=proposed['tracks'][a['targetTrackId']]['latest']['position']
            p.update(geographic(2000,0))
            h.service._commit(mid,proposed,[],checkpoint)
        await ticks(h,1)
        frame=h.authority.read(mid)
        assert frame.fleet_behavior.members[0].state=='armed'
        assert frame.interactive.executions[0].state=='Running'
        assert frame.tracks[c.control_track_id].latest.velocity.speed_mps==170/3.6
        req=await policy(h,mid,'hold',order=3)
        assert (await h.service.command(mid,req,CREDENTIAL)).accepted
        assert h.authority.read(mid).fleet_behavior.members[0].policy=='hold'
        assert h.authority.read(mid).interactive.executions[0].state=='Running'
    asyncio.run(run())


def test_idle_stance_acquires_and_persistence_failure_publishes_nothing():
    h=Harness()
    async def run():
        mid=await setup(h,1,1)
        await arm(h,mid)
        before=canonical(h.authority.read(mid)); saved=h.repo.save_checkpoint
        def fail(*args): raise sqlite3.OperationalError('test rollback')
        h.repo.save_checkpoint=fail
        with pytest.raises(sqlite3.OperationalError): await ticks(h,1)
        assert canonical(h.authority.read(mid))==before
        h.repo.save_checkpoint=saved
        await ticks(h,1)
        assert fleet(h,mid).members[0].state=='pursuing'
        assert len([a for a in fleet(h,mid).assignments if a.state=='active'])==1
        await h.service.command(mid,await selected(h,mid,'stop',order=2),CREDENTIAL)
        await ticks(h,3)
        assert fleet(h,mid).members[0].policy=='hold'
        assert not [a for a in fleet(h,mid).assignments if a.state=='active']
    asyncio.run(run())


def test_entering_targets_live_protection_and_independent_assignments():
    h=Harness()
    async def run():
        data=arrangement(2,2,800)
        for u in data['units']:
            if u['id'].endswith('-1'): u['position'].update(geographic(0 if u['category']=='friendly' else 800,400))
        mid,_,_=await ready(h,data);await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        await arm(h,mid); await ticks(h,1)
        assert not fleet(h,mid).assignments
        # Newly entering hostiles are considered without a new map command.
        frame=json.loads(canonical(h.authority.read(mid)));checkpoint=h.repo.checkpoint(mid)
        for t in frame['tracks'].values():
            if frame['entities'][t['entityId']]['affiliation']=='hostile':
                t['latest']['position'].update(geographic(600,400 if t['entityId'].endswith('-1') else 0))
        h.service._commit(mid,frame,[],checkpoint)
        await ticks(h,1)
        old={a.target_id:a.id for a in fleet(h,mid).assignments if a.state=='active'}
        assert len(old)==2
        assert (await issue(h,mid,move(h,mid))).accepted
        await ticks(h,1)
        old={a.target_id:a.id for a in fleet(h,mid).assignments if a.state=='active'}
        await h.act(mid,'pause');h.advance(60);await h.act(mid,'reclaim')
        protected=polygon('friendly',x=600,size=40)
        assert (await h.service.command(mid,await mutation(h,mid,protected),CREDENTIAL)).accepted
        after=[a for a in fleet(h,mid).assignments if a.state=='active']
        assert len(after)==1 and after[0].id==old[after[0].target_id]
        resumed=[e for e in h.authority.read(mid).interactive.executions if not e.suspended_by]
        assert len(resumed)==1 and resumed[0].state=='Suspended'
        await h.act(mid,'resume');await ticks(h,2)
        assert len([a for a in fleet(h,mid).assignments if a.state=='active'])==1
        await h.act(mid,'end')
    asyncio.run(run())


@pytest.mark.parametrize('profile_id',['sting-v1','hornet-10-v1'])
def test_mutual_loss_profile_height_restart_no_rearm(profile_id):
    from app.commands.service import InteractiveService
    h=Harness()
    async def run():
        data=arrangement(1,1,30)
        data['units'][0]['profileId']=profile_id
        data['units'][1]['profileId']='hornet-10-v1'
        mid,rev,_=await ready(h,data)
        assert rev.schema_version=='1.4'
        await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        await arm(h,mid);await ticks(h,3)
        frame=h.authority.read(mid)
        assert len(frame.fleet_behavior.outcomes)==1
        assert all(e.condition=='non-operational' for e in frame.entities.values())
        assert all(t.latest.position.altitude.metres==150.125 for t in frame.tracks.values())
        positions={k:t.latest.position for k,t in frame.tracks.items()}
        h.service=InteractiveService(h.authority,True);await h.service.recover()
        assert h.authority.read(mid).interactive.state=='paused'
        await h.act(mid,'acquire');await h.act(mid,'resume');await ticks(h,3)
        assert {k:t.latest.position for k,t in h.authority.read(mid).tracks.items()}==positions
        assert len(fleet(h,mid).outcomes)==1
        assert all(m.policy=='hold' for m in fleet(h,mid).members)
        await h.act(mid,'end')
    asyncio.run(run())


def test_mixed_profile_manual_override_return_and_delayed_redirect():
    h=Harness()
    async def run():
        data=arrangement(2,0)
        for u,p in zip(data['units'],['sting-v1','hornet-10-v1']):u['profileId']=p
        data.update(scheduleRuleVersion='local-schedule-v2',actions=[
            dict(id='future',unitId='friendly-0',kind='move',offsetMs=4000,ordinal=0,destination=geographic(100,0))])
        mid,_,_=await ready(h,data);await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        await arm(h,mid,indices=[0])
        older=move(h,mid,order=2)
        current=await issue(h,mid,move(h,mid,order=3,y=100))
        assert len(current.execution_ids)==2
        assert not (await issue(h,mid,older)).accepted
        assert await h.service.direct_move(mid,older,None)==h.service.lookup(older.command_id,mid)
        await ticks(h,2)
        f=h.authority.read(mid)
        assert sorted(e.speed_mps for e in f.interactive.executions if e.state=='Running')==[80/3.6,170/3.6]
        assert f.scenario_schedule.manual_overrides
        assert (await h.service.command(mid,await selected(h,mid,'return-to-script',4),CREDENTIAL)).accepted
        await ticks(h,20)
        f=h.authority.read(mid)
        assert all(m.policy=='hold' for m in f.fleet_behavior.members)
        assert f.scenario_schedule.actions[0].state in {'Accepted','Running','Completed'}
        await h.act(mid,'end')
    asyncio.run(run())


@pytest.mark.parametrize('hostiles', [0, 1])
def test_cancel_retained_destination_preserves_stance_and_pause_reservation(hostiles):
    from test_movement import cancel
    h = Harness()
    async def run():
        mid = await setup(h, 1, hostiles)
        await arm(h, mid)
        receipt = await issue(h, mid, move(h, mid))
        await ticks(h, 1)
        await h.act(mid, 'pause')
        await h.act(mid, 'resume')
        e = h.authority.read(mid).interactive.executions[0]
        assert e.state == ('Suspended' if hostiles else 'Running')
        assert (await cancel(h, mid, receipt.execution_ids[0])).accepted
        await ticks(h, 1)
        frame = h.authority.read(mid)
        assert frame.fleet_behavior.members[0].policy == 'intercept'
        assert frame.fleet_behavior.members[0].movement_execution_id is None
        assert frame.fleet_behavior.members[0].state == ('pursuing' if hostiles else 'armed')
        await h.act(mid, 'end')
    asyncio.run(run())


def test_current_contract_rejects_corrupt_destination_and_profile_evidence():
    from app.domain.models import WorldFrame
    from pydantic import ValidationError
    h = Harness()
    async def run():
        mid = await setup(h, 1, 1, typed=True)
        await arm(h, mid)
        await issue(h, mid, move(h, mid))
        await ticks(h, 1)
        original = json.loads(canonical(h.authority.read(mid)))
        for change in ('owner', 'link', 'state', 'speed', 'scope', 'profile'):
            frame = deepcopy(original)
            e = frame['interactive']['executions'][0]
            m = frame['fleetBehavior']['members'][0]
            if change == 'owner': e['suspendedBy'] = 'wrong-owner'
            elif change == 'link': m['movementExecutionId'] = 'missing-execution'
            elif change == 'state': e['state'] = 'Running'
            elif change == 'speed': e['speedMps'] = 280/3.6
            elif change == 'scope': m['targetScope'] = ['unexpected-target']
            elif change == 'profile': frame['unitProfiles'][m['entityId']]['cruiseMps'] = 999
            with pytest.raises(ValidationError): WorldFrame.model_validate(frame)
        await h.act(mid, 'end')
    asyncio.run(run())


@pytest.mark.parametrize('version', ['1.0', '1.1', '1.2'])
def test_frozen_d3a_reader_validates_older_scenarios_without_rewriting(version):
    from app.scenarios.legacy_d3a import LegacyD3aScenarioRevision, LegacyD3aScenarioReceipt
    from app.scenarios.service import ScenarioService
    from test_scenarios import write
    from pydantic import ValidationError
    h = Harness()
    async def run():
        content = arrangement(1, 1)
        if version == '1.1': content.update(boundaries=[], boundaryRuleVersion='local-boundary-v1')
        if version == '1.2': content.update(actions=[], scheduleRuleVersion='local-schedule-v1')
        receipt = await ScenarioService(h.authority, True).write(write(content))
        assert receipt.schema_version == version
        raw = canonical(receipt)
        assert canonical(LegacyD3aScenarioReceipt.model_validate_json(raw)) == raw
        assert canonical(LegacyD3aScenarioRevision.model_validate_json(canonical(receipt.result))) == canonical(receipt.result)
        forged = json.loads(raw)
        forged['result']['content']['units'][0]['profileId'] = 'sting-v1'
        with pytest.raises(ValidationError): LegacyD3aScenarioReceipt.model_validate(forged)
        h.repo.close()
    asyncio.run(run())


def test_typed_patrol_multiple_loops_live_geometry_change_and_explicit_stop():
    h = Harness()
    async def run():
        data = arrangement(1, 0)
        data['units'][0]['profileId'] = 'hornet-10-v1'
        data.update(boundaryRuleVersion='local-boundary-v1', boundaries=[polygon(size=12)])
        mid, _, _ = await ready(h, data)
        await h.act(mid, 'acquire'); await h.act(mid, 'start'); await ticks(h, 1)
        zid = next(iter(h.authority.read(mid).boundary_rules.zones))
        assert (await h.service.command(mid, await policy(h, mid, 'patrol', boundary_id=zid), CREDENTIAL)).accepted
        await ticks(h, 70)
        assert fleet(h, mid).members[0].patrol.completed_loops >= 2
        assert next(iter(h.authority.read(mid).tracks.values())).latest.velocity.speed_mps <= 80/3.6
        await h.act(mid, 'pause')
        assert (await h.service.command(mid, await mutation(h, mid, polygon(size=20)), CREDENTIAL)).accepted
        assert fleet(h, mid).members[0].state == 'blocked'
        position = next(iter(h.authority.read(mid).tracks.values())).latest.position
        await h.act(mid, 'resume'); await ticks(h, 4)
        assert next(iter(h.authority.read(mid).tracks.values())).latest.position == position
        assert (await h.service.command(mid, await selected(h, mid, 'stop', 2), CREDENTIAL)).accepted
        await h.act(mid, 'end')
    asyncio.run(run())


@pytest.mark.parametrize('terminal', ['revoke', 'end', 'restart'])
def test_rts_lifecycle_terminates_pursuit_and_retained_destination(terminal):
    from app.commands.service import InteractiveService
    h = Harness()
    async def run():
        mid = await setup(h, 2, 1, typed=True)
        await arm(h, mid); await issue(h, mid, move(h, mid)); await ticks(h, 2)
        before = h.authority.read(mid)
        if terminal == 'restart':
            h.service = InteractiveService(h.authority, True)
            await h.service.recover()
            assert h.authority.read(mid).interactive.executor_epoch != before.interactive.executor_epoch
            assert not h.service.status(mid, CREDENTIAL).owns_control
        else: assert (await h.act(mid, terminal)).accepted
        assert all(m.policy == 'hold' for m in fleet(h, mid).members)
        assert all(e.state in {'Cancelled', 'Interrupted'} for e in h.authority.read(mid).interactive.executions)
        if terminal != 'end':
            await h.act(mid, 'acquire')
            if terminal == 'restart': await h.act(mid, 'resume')
        await ticks(h, 4)
        assert {k:t.latest.position for k,t in h.authority.read(mid).tracks.items()} == {k:t.latest.position for k,t in before.tracks.items()}
        assert not [a for a in fleet(h, mid).assignments if a.state == 'active']
        if terminal != 'end': await h.act(mid, 'end')
    asyncio.run(run())


@pytest.mark.parametrize('armed', [False, True])
def test_legacy_approach_flag_in_v2_preserves_destination_and_current_route_rules(armed):
    h = Harness()
    async def run():
        data = arrangement(1, 1, 400)
        data.update(boundaryRuleVersion='local-boundary-v1', boundaries=[polygon('restricted', x=500)])
        mid, _, _ = await ready(h, data)
        await h.act(mid, 'acquire'); await h.act(mid, 'start'); await ticks(h, 1)
        if armed: await arm(h, mid)
        request = move(h, mid, x=100)
        request = request.model_copy(update={'direct':request.direct.model_copy(update={'intercept':True})})
        receipt = await issue(h, mid, request)
        assert receipt.accepted and receipt.operation == 'direct-move'
        before = h.authority.read(mid).interactive.executions[0]
        assert distance(json.loads(canonical(before.destination)), geographic(100, 0)) < .001
        await ticks(h, 1)
        assert len([a for a in fleet(h, mid).assignments if a.state == 'active']) == int(armed)
        blocked = move(h, mid, order=3, x=1000)
        blocked = blocked.model_copy(update={'direct':blocked.direct.model_copy(update={'intercept':True})})
        assert (await issue(h, mid, blocked)).code == 'ENDPOINT_INVALID'
        assert h.authority.read(mid).interactive.executions[0].id == before.id
        assert h.authority.read(mid).interactive.executions[0].state in {'Running','Suspended'}
        await h.act(mid, 'end')
    asyncio.run(run())
