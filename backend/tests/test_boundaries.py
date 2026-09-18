"""D2 geometry, exact admission and rollback on isolated authority stores."""
import asyncio
import json
import sqlite3
from pathlib import Path
import pytest
from pydantic import ValidationError
from app.commands.kinematics import geographic
from app.commands.zone_rules import blocked
from app.scenarios.geometry import validate, contains, crosses
from app.scenarios.boundaries import BoundaryDefinition
from app.scenarios.contracts import ScenarioRevision, ScenarioRef
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical, read_frame
from test_interactive import Harness
from test_scenarios import content, write, run_request
from test_direct_movement import direct, issue
from test_movement import ticks, execution


def vertex(x,y):
    p=geographic(x,y)
    return [p['longitudeDeg'],p['latitudeDeg']]


def boundary(kind='restricted', points=None):
    return dict(id='boundary-one',name='Protected crossing',type=kind,
                vertices=[vertex(*v) for v in (points or [(400,-100),(600,-100),(600,100),(400,100)])])


def composition(*boundaries):
    return {**content(), 'boundaries':list(boundaries),'boundaryRuleVersion':'local-boundary-v1'}


@pytest.mark.parametrize('points', [
    [(0,0),(100,100),(0,100),(100,0)],
    [(0,0),(100,0),(100,0),(0,100)],
    [(0,0),(100,0),(50,0),(0,100)],
    [(0,0),(100,0),(200,0)],
    [(0,0),(6000,0),(0,100)],
])
def test_invalid_geometry_is_rejected(points):
    with pytest.raises(ValidationError): BoundaryDefinition.model_validate(boundary(points=points))


def test_concavity_crossings_and_inclusive_tolerance():
    ring=validate([vertex(*v) for v in [(0,0),(300,0),(300,100),(100,100),(100,300),(0,300)]], 'restricted')
    assert contains((50,250),ring) and not contains((250,250),ring)
    assert crosses((-50,50),(350,50),ring)
    assert crosses((-50,-.0005),(350,-.0005),ring)
    assert not crosses((-50,-.01),(350,-.01),ring)
    with pytest.raises(ValueError,match='convex'):
        validate([vertex(*v) for v in [(0,0),(300,0),(300,100),(100,100),(100,300),(0,300)]], 'patrol')


def test_review_and_run_both_reject_untyped_and_every_source_owned_occupant():
    h=Harness()
    async def run():
        service=ScenarioService(h.authority,True)
        for category_index in range(4):
            unit=content()['units'][category_index]
            lon,lat=unit['position']['longitudeDeg'],unit['position']['latitudeDeg']
            b=boundary(); b['vertices']=[[lon-.0001,lat-.0001],[lon+.0001,lat-.0001],[lon+.0001,lat+.0001],[lon-.0001,lat+.0001]]
            revision=(await service.write(write(composition(b)))).result
            review=service.review(ScenarioRef.model_validate({k:getattr(revision,k) for k in ['definition_id','revision','content_hash']}))
            assert not review.can_run and review.issues[0].code=='RESTRICTED_OCCUPANT'
            request=run_request(revision); receipt=await h.service.create(request)
            assert not receipt.accepted and 'Reposition' in receipt.message
            assert await h.service.create(request)==receipt
        revision=(await service.write(write(composition(boundary('untyped'))))).result
        rejected=await h.service.create(run_request(revision))
        assert not rejected.accepted and 'annotation' in rejected.message
        assert h.repo.db.execute('SELECT count(*) FROM recordings').fetchone()[0]==0
    asyncio.run(run())


async def custom(h, boundaries=None):
    service=ScenarioService(h.authority,True)
    revision=(await service.write(write(composition(*(boundaries or [boundary()]))))).result
    request=run_request(revision); receipt=await h.service.create(request)
    assert receipt.accepted
    mid=receipt.mission_id
    assert (await h.act(mid,'acquire')).accepted
    assert (await h.act(mid,'start')).accepted
    await ticks(h,1)
    return service,revision,mid,request


def test_crossing_replacement_is_atomic_durable_and_original_keeps_moving():
    h=Harness()
    async def run():
        _,revision,mid,creation=await custom(h)
        frame=h.authority.read(mid)
        assert frame.boundary_rules.rule_version=='local-boundary-v1' and len(frame.zones)==1
        assert revision.schema_version=='1.1'
        valid=await issue(h,mid,direct(h,mid,longitude=103.85,latitude=1.293))
        assert valid.accepted
        before_frame=h.repo.latest_text(mid);before_checkpoint=canonical(h.repo.checkpoint(mid))
        req=direct(h,mid,order=2,longitude=103.858,latitude=1.29)
        rejected=await issue(h,mid,req)
        assert not rejected.accepted and rejected.code=='ENDPOINT_INVALID' and 'Protected crossing' in rejected.message
        assert h.repo.latest_text(mid)==before_frame and canonical(h.repo.checkpoint(mid))==before_checkpoint
        assert await issue(h,mid,req)==rejected
        await ticks(h,2)
        assert execution(h,mid,valid.execution_ids[0]).travelled_metres>0
        assert await h.service.create(creation)==h.service.lookup(creation.creation_id)
        assert h.repo.db.execute('SELECT count(*) FROM recordings').fetchone()[0]==1
    asyncio.run(run())


def test_step_guard_and_recovery_do_not_teleport_or_consume_blocked_motion():
    h=Harness()
    async def run():
        _,_,mid,_=await custom(h)
        receipt=await issue(h,mid,direct(h,mid,longitude=103.85,latitude=1.293))
        checkpoint=h.repo.checkpoint(mid)
        # Simulate inconsistent restored execution whose next segment crosses a frozen boundary.
        e=checkpoint['executions'][0]
        origin={**geographic(399,0),'altitude':e['origin']['altitude']}
        e.update(origin=origin,destination={**geographic(800,0),'altitude':e['origin']['altitude']},travelledMetres=0,remainingMetres=401)
        h.repo.save_checkpoint(mid,checkpoint)
        def relocate(f): f['tracks'][e['controlTrackId']]['latest']['position']=origin; return f,[]
        await h.authority.commit_source(mid,relocate)
        await ticks(h,1)
        failed=execution(h,mid,receipt.execution_ids[0])
        assert failed.state=='Failed' and failed.travelled_metres==0
        assert canonical(h.authority.read(mid).tracks[e['controlTrackId']].latest.position)==canonical(origin)
        inside={**geographic(500,0),'altitude':e['origin']['altitude']}
        def inconsistent(f): f['tracks'][e['controlTrackId']]['latest']['position']=inside; return f,[]
        await h.authority.commit_source(mid,inconsistent)
        await h.service.recover()
        restored=h.authority.read(mid)
        assert canonical(restored.tracks[e['controlTrackId']].latest.position)==canonical(inside)
        assert not restored.interactive.controls[0].eligible
        assert 'Restricted' in restored.interactive.controls[0].reason
    asyncio.run(run())


def test_failed_creation_publishes_nothing_and_exact_retry_freezes_definition(monkeypatch):
    h=Harness()
    async def run():
        service=ScenarioService(h.authority,True)
        revision=(await service.write(write(composition(boundary())))).result
        request=run_request(revision); original=h.repo.save_checkpoint
        monkeypatch.setattr(h.repo,'save_checkpoint',lambda *_: (_ for _ in ()).throw(sqlite3.OperationalError('injected')))
        with pytest.raises(sqlite3.OperationalError): await h.service.create(request)
        for table in ['recordings','creation_receipts','scenario_runs']:
            assert h.repo.db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]==0
        monkeypatch.setattr(h.repo,'save_checkpoint',original)
        receipt=await h.service.create(request); first=h.repo.latest_text(receipt.mission_id)
        assert receipt.accepted
        revised=composition(boundary('annotation'))
        await service.write(write(revised,1),revision.definition_id)
        assert h.repo.latest_text(receipt.mission_id)==first
        frozen=json.loads(h.repo.db.execute('SELECT revision_json FROM scenario_runs').fetchone()[0])
        assert frozen['content']==json.loads(canonical(revision.content))
    asyncio.run(run())


def test_legacy_bytes_and_strict_versions_remain_readable():
    h=Harness()
    async def run():
        service=ScenarioService(h.authority,True)
        req=write(); saved=await service.write(req); raw=canonical(saved.result)
        assert saved.schema_version=='1.0' and saved.result.schema_version=='1.0'
        assert canonical(service.get(saved.result.definition_id))==raw
        forged=json.loads(raw);forged['content']['boundaries']=None
        with pytest.raises(ValidationError):ScenarioRevision.model_validate(forged)
        current=(await service.write(write(composition(boundary()),1),saved.result.definition_id)).result
        assert current.schema_version=='1.1' and canonical(service.get(saved.result.definition_id,1))==raw
        assert await service.write(req)==saved
        archived=(Path(__file__).parents[2]/'contracts/sentinel/v1.5/demo.world.json').read_text(encoding='utf-8')
        adapted=read_frame(archived)
        assert adapted.schema_version=='1.10' and adapted.boundary_rules is None
        assert blocked(json.loads(canonical(adapted)),geographic(0,0),geographic(800,0)) is None
    asyncio.run(run())


def test_group_crossing_rejects_all_before_supersession_and_unavailable_skips_stay_available_only():
    h=Harness()
    async def run():
        data=composition(boundary())
        data['units'][1].update(category='friendly',commandRole='sentinel',position={**geographic(0,300),'altitude':data['units'][1]['position']['altitude']})
        revision=(await ScenarioService(h.authority,True).write(write(data))).result
        mid=(await h.service.create(run_request(revision))).mission_id
        await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        previous=await issue(h,mid,direct(h,mid,indices=(0,1),longitude=103.85,latitude=1.30))
        before=h.repo.latest_text(mid); checkpoint=canonical(h.repo.checkpoint(mid))
        anchor=geographic(800,150)
        rejected=await issue(h,mid,direct(h,mid,order=2,indices=(0,1),longitude=anchor['longitudeDeg'],latitude=anchor['latitudeDeg']))
        assert not rejected.accepted and rejected.code=='ENDPOINT_INVALID'
        assert h.repo.latest_text(mid)==before and canonical(h.repo.checkpoint(mid))==checkpoint
        assert all(execution(h,mid,key).state=='Accepted' for key in previous.execution_ids)
        def unavailable(f):
            f['assets'][f['interactive']['controls'][0]['assetId']]['availability']='unavailable'
            return f,[]
        await h.authority.commit_source(mid,unavailable)
        anchor=geographic(800,300)
        allowed=await issue(h,mid,direct(h,mid,order=2,indices=(0,1),longitude=anchor['longitudeDeg'],latitude=anchor['latitudeDeg']))
        assert allowed.accepted and [o.outcome for o in allowed.member_outcomes]==['skipped','accepted']
        assert execution(h,mid,allowed.execution_ids[0]).destination.latitude_deg==pytest.approx(anchor['latitudeDeg'])
    asyncio.run(run())


def test_reviewed_move_also_checks_whole_boundary_segment():
    from test_movement import draft, submit
    h=Harness()
    async def run():
        _,_,mid,_=await custom(h)
        request=draft(h,mid,offset=.008)
        before=h.repo.latest_text(mid)
        receipt=await submit(h,mid,request)
        assert not receipt.accepted and receipt.code=='ENDPOINT_INVALID'
        assert h.repo.latest_text(mid)==before
    asyncio.run(run())


def test_boundary_revisions_conflicts_failed_writes_and_fresh_rerun():
    h=Harness()
    async def run():
        service,revision,mid,creation=await custom(h)
        h.repo.db.execute("CREATE TRIGGER reject_scenario_receipt BEFORE INSERT ON scenario_receipts BEGIN SELECT RAISE(ABORT, 'injected'); END")
        request=write(composition(boundary('friendly')),1)
        with pytest.raises(sqlite3.IntegrityError): await service.write(request,revision.definition_id)
        assert service.get(revision.definition_id)==revision
        from app.commands.errors import CommandError
        with pytest.raises(CommandError): service.lookup(request.request_id,revision.definition_id)
        h.repo.db.execute('DROP TRIGGER reject_scenario_receipt')
        assert (await service.write(request,revision.definition_id)).accepted
        conflict=await service.write(write(composition(boundary('annotation')),1),revision.definition_id)
        assert not conflict.accepted and conflict.code=='REVISION_CONFLICT'
        assert service.get(revision.definition_id,1)==revision
        await h.act(mid,'end')
        recorded=h.repo.latest_text(mid)
        rerun=await h.service.create(run_request(revision))
        assert rerun.accepted and rerun.mission_id!=mid
        assert rerun.run_id!=h.authority.read(mid).interactive.run_id
        assert h.repo.latest_text(mid)==recorded
        assert h.repo.db.execute('SELECT count(*) FROM recordings').fetchone()[0]==2
        assert await h.service.create(creation)==h.service.lookup(creation.creation_id)
    asyncio.run(run())
