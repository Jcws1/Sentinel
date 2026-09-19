"""D6 admission, read-only generation and exact durable command correlation."""
import asyncio
import json
from copy import deepcopy
from uuid import uuid4
import pytest

from app.commands.contracts import CommandRequest, RecommendationRequest, RecommendationRef
from app.commands.service import InteractiveService, CommandError
from app.commands import recommendations
from app.world.serialization import canonical
from test_interactive import Harness, CREDENTIAL, OTHER
from test_d4_refinement import setup
from test_movement import ticks
from test_conductor import selected


async def suggest(h, mid, ids=None, credential=CREDENTIAL):
    ids = ids if ids is not None else [c.entity_id for c in h.authority.read(mid).interactive.controls]
    return await h.service.suggest(mid, RecommendationRequest(entity_ids=ids), credential)


async def request(h, mid, proposal, key="intercept-all", order=1):
    option = next(o for o in proposal.options if o.id == key)
    action = option.action
    intent = await h.service.issue_intent(mid, action.operation, members=action.members, order=order, policy=action.policy,
        recommendation=RecommendationRef(recommendation_id=proposal.id, option_id=option.id))
    return CommandRequest(command_id=str(uuid4()), holder_id="operator-one", intent=intent)


@pytest.mark.parametrize('friendly,hostile,actions', [(10,10,1), (10,5,2), (5,0,0), (1,1,1)])
def test_feasible_distinct_options_do_not_write_or_acquire(friendly, hostile, actions):
    h=Harness()
    async def run():
        mid=await setup(h,friendly,hostile)
        frame=canonical(h.authority.read(mid)); cp=deepcopy(h.repo.checkpoint(mid))
        changes=h.repo.db.total_changes; intents=len(h.service._intents)
        proposal=await suggest(h,mid)
        assert len([o for o in proposal.options if o.action])==actions
        assert len(proposal.eligible_target_ids)==hostile
        assert proposal.options[-1].id=='keep' and proposal.options[-1].action is None
        assert canonical(h.authority.read(mid))==frame and h.repo.checkpoint(mid)==cp
        assert h.repo.db.total_changes==changes and len(h.service._intents)==intents
        if friendly==10 and hostile==5:
            smaller=next(o for o in proposal.options if o.id=='intercept-subset')
            assert len(smaller.action.members)==5 and len(smaller.unchanged_entity_ids)==5
        unowned=await suggest(h,mid,credential=OTHER)
        assert unowned.unavailable_reason and all(o.action is None for o in unowned.options)
    asyncio.run(run())


def test_frame_advances_renewal_pause_and_audited_idempotent_apply():
    h=Harness()
    async def run():
        mid=await setup(h,2,2,typed=True)
        proposal=await suggest(h,mid)
        await ticks(h,3)
        assert (await suggest(h,mid)).fingerprint==proposal.fingerprint
        await h.act(mid,'renew')
        req=await request(h,mid,proposal)
        result=await h.service.command(mid,req,CREDENTIAL)
        assert result.accepted and len(result.behavior_outcomes)==2
        saved=json.loads(h.repo.receipt(req.command_id,mid)[0])
        assert saved['intent']['recommendation']['option']['title']==proposal.options[0].title
        assert saved['intent']['recommendation']['inputFrameId']==proposal.input_frame_id
        seq=h.authority.read(mid).sequence
        h.advance(20)
        assert await h.service.command(mid,req,CREDENTIAL)==result
        h.service=InteractiveService(h.authority,True)
        assert await h.service.command(mid,req,None)==result
        assert h.authority.read(mid).sequence==seq
    asyncio.run(run())


@pytest.mark.parametrize('change', ['expired','stop','target-moved','epoch','forged-action'])
def test_changed_proposals_never_silently_retarget(change):
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        proposal=await suggest(h,mid)
        if change=='expired': h.advance(15)
        elif change=='stop':
            assert (await h.service.command(mid,await selected(h,mid,'stop',order=1),CREDENTIAL)).accepted
        elif change=='target-moved':
            from app.commands.kinematics import geographic
            frame=json.loads(canonical(h.authority.read(mid))); cp=h.repo.checkpoint(mid)
            for track in frame['tracks'].values():
                if frame['entities'][track['entityId']]['affiliation']=='hostile':
                    track['latest']['position'].update(geographic(2500,2500))
            h.service._commit(mid,frame,[],cp)
        elif change=='epoch': h.service._recommendations.clear()
        with pytest.raises(CommandError):
            if change=='forged-action':
                action=proposal.options[0].action
                await h.service.issue_intent(mid,'stop',members=action.members,order=1,
                    recommendation=RecommendationRef(recommendation_id=proposal.id,option_id='intercept-all'))
            else: await request(h,mid,proposal,order=2)
        assert not h.authority.read(mid).fleet_behavior.assignments
    asyncio.run(run())


def test_race_after_intent_is_rejected_and_original_result_reconciles():
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        proposal=await suggest(h,mid); req=await request(h,mid,proposal,order=1)
        stop=await selected(h,mid,'stop',order=2)
        assert (await h.service.command(mid,stop,CREDENTIAL)).accepted
        result=await h.service.command(mid,req,CREDENTIAL)
        assert not result.accepted and 'Out of date' in result.message
        assert result==await h.service.command(mid,req,CREDENTIAL)
        assert all(m.policy=='hold' for m in h.authority.read(mid).fleet_behavior.members)
    asyncio.run(run())


def test_live_boundary_change_after_review_rejects_without_changing_scope():
    from test_d3a import mutation
    from test_boundaries import boundary
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        proposal=await suggest(h,mid)
        req=await request(h,mid,proposal)
        wall=boundary(points=[(180,-100),(220,-100),(220,100),(180,100)])
        edit=await h.service.command(mid,await mutation(h,mid,wall),CREDENTIAL)
        assert edit.accepted
        after_edit=canonical(h.authority.read(mid))
        result=await h.service.command(mid,req,CREDENTIAL)
        assert not result.accepted and 'Out of date' in result.message
        assert canonical(h.authority.read(mid))==after_edit
        assert result==await h.service.command(mid,req,CREDENTIAL)
        fresh=await suggest(h,mid)
        assert not fresh.eligible_target_ids
        assert all(o.action is None for o in fresh.options)
    asyncio.run(run())


def test_paused_nonpositional_choices_do_not_require_new_source_samples():
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        await h.act(mid,'pause')
        for _ in range(3):
            h.advance(10); await h.act(mid,'renew')
        proposal=await suggest(h,mid)
        req=await request(h,mid,proposal)
        assert (await h.service.command(mid,req,CREDENTIAL)).accepted
        assert h.authority.read(mid).interactive.state=='paused'
        assert not h.authority.read(mid).fleet_behavior.assignments
    asyncio.run(run())


def test_observer_hostile_missing_and_stale_contexts():
    h=Harness()
    async def run():
        mid=await setup(h,2,1)
        frame=h.authority.read(mid)
        hostile=next(e.id for e in frame.entities.values() if e.affiliation=='hostile')
        ids=[frame.interactive.controls[0].entity_id,hostile,'missing-entity']
        proposal=await suggest(h,mid,ids)
        assert sum(m.available for m in proposal.members)==1
        assert len(proposal.options[0].action.members)==1
        assert len(proposal.options[0].unchanged_entity_ids)==2
        h.advance(3)
        stale=await suggest(h,mid)
        assert 'source' in stale.unavailable_reason and all(o.action is None for o in stale.options)
        await h.act(mid,'end')
        with pytest.raises(CommandError): await suggest(h,mid)
    asyncio.run(run())


def test_cache_bounded_and_expired_generation_reclaimed():
    h=Harness()
    async def run():
        mid=await setup(h,1,0)
        for _ in range(recommendations.MAX_SETS): await suggest(h,mid)
        with pytest.raises(CommandError): await suggest(h,mid)
        h.advance(15)
        await suggest(h,mid)
        assert len(h.service._recommendations)==1
    asyncio.run(run())


@pytest.mark.parametrize('blocked', [False, True])
def test_patrol_feasibility_uses_existing_ingress_and_boundary_checks(blocked):
    from test_d4 import arrangement, polygon
    from test_conductor import ready
    h=Harness()
    async def run():
        data=arrangement(2,0)
        zones=[polygon(size=20)]
        if blocked:
            zones.append(dict(polygon('restricted',50,0,20), id='wall'))
        data.update(boundaryRuleVersion='local-boundary-v1', boundaries=zones)
        mid,_,_=await ready(h,data)
        await h.act(mid,'acquire'); await h.act(mid,'start'); await ticks(h,1)
        proposal=await suggest(h,mid)
        assert any(o.id=='patrol' for o in proposal.options) is not blocked
        if not blocked:
            assert (await h.service.command(mid,await request(h,mid,proposal,'patrol'),CREDENTIAL)).accepted
            await ticks(h,2)
            assert all(m.state=='patrolling' for m in h.authority.read(mid).fleet_behavior.members)
    asyncio.run(run())


def test_blocked_targets_ready_observation_and_unsupported_pose():
    from test_d4 import arrangement, polygon
    from test_conductor import ready
    h=Harness()
    async def run():
        data=arrangement(3,2,400)
        data['units'][2]['commandRole']='observation'
        data.update(boundaryRuleVersion='local-boundary-v1', boundaries=[polygon('restricted',200,0,80)])
        mid,_,_=await ready(h,data)
        ids=list(h.authority.read(mid).entities)
        initial=await suggest(h,mid,ids)
        assert 'Start' in initial.unavailable_reason and len(initial.options)==1
        assert sum(m.available for m in initial.members)==2
        await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        proposal=await suggest(h,mid,ids)
        assert not proposal.eligible_target_ids and len(proposal.options)==1
        assert any('Observation only' in (m.exclusion or '') for m in proposal.members)
        frame=json.loads(canonical(h.authority.read(mid)))
        for c in frame['interactive']['controls']:
            frame['tracks'][c['controlTrackId']]['latest']['position']['altitude']['reference']='MSL'
        result=recommendations.generate(frame,h.repo.checkpoint(mid),ids,owns_control=True,
            now=proposal.created_at,expires_at=proposal.expires_at,identity='unsupported')
        assert not result.eligible_target_ids and len(result.options)==1
    asyncio.run(run())


def test_return_to_script_and_assignment_counts_preserve_current_semantics():
    from test_conductor import ready
    from test_d4 import arm
    h=Harness()
    async def run():
        mid,_,_=await ready(h)
        await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        proposal=await suggest(h,mid)
        assert next(o for o in proposal.options if o.id=='stop').action
        assert (await h.service.command(mid,await request(h,mid,proposal,'stop'),CREDENTIAL)).accepted
        returned=await suggest(h,mid)
        assert (await h.service.command(mid,await request(h,mid,returned,'return',2),CREDENTIAL)).accepted
        assert not h.authority.read(mid).scenario_schedule.manual_overrides
        await h.act(mid,'end')
        mid=await setup(h,10,5)
        await arm(h,mid);await ticks(h,1)
        proposal=await suggest(h,mid)
        assert proposal.assignment_count==5 and not proposal.eligible_target_ids
        assert {o.id for o in proposal.options}=={'manual','stop','keep'}
        before=proposal.fingerprint
        await ticks(h,1)
        assert (await suggest(h,mid)).fingerprint==before
    asyncio.run(run())


def test_ordinary_per_member_order_fence_remains_explicit():
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        members=(await selected(h,mid,'stop',2)).intent.members
        assert (await h.service.command(mid,await selected(h,mid,'stop',2,members[:1]),CREDENTIAL)).accepted
        proposal=await suggest(h,mid)
        result=await h.service.command(mid,await request(h,mid,proposal,order=1),CREDENTIAL)
        assert result.accepted
        assert sorted(o.outcome for o in result.behavior_outcomes)==['accepted','skipped']
        assert next(o for o in result.behavior_outcomes if o.outcome=='skipped').code=='ORDER_SUPERSEDED'
    asyncio.run(run())


@pytest.mark.parametrize('table',['frames','events','interactive_checkpoints','command_receipts'])
def test_audit_and_effect_commit_atomically(table):
    import sqlite3
    h=Harness()
    async def run():
        mid=await setup(h,2,2)
        proposal=await suggest(h,mid);req=await request(h,mid,proposal)
        before=canonical(h.authority.read(mid));cp=deepcopy(h.repo.checkpoint(mid))
        _,subscription=await h.authority.subscribe(mid)
        h.repo.db.execute(f"CREATE TRIGGER fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'D6 fault'); END")
        with pytest.raises(sqlite3.Error): await h.service.command(mid,req,CREDENTIAL)
        assert canonical(h.authority.read(mid))==before and h.repo.checkpoint(mid)==cp
        assert not h.repo.receipt(req.command_id,mid) and subscription.queue.empty()
        h.repo.db.execute('DROP TRIGGER fail')
        assert (await h.service.command(mid,req,CREDENTIAL)).accepted
        assert json.loads(h.repo.receipt(req.command_id,mid)[0])['intent']['recommendation']['recommendationId']==proposal.id
    asyncio.run(run())


def test_option_reasons_distinguish_deliberate_scope_from_infeasible_pose_and_capability():
    h=Harness()
    async def run():
        mid=await setup(h,4,1)
        frame=json.loads(canonical(h.authority.read(mid)));cp=h.repo.checkpoint(mid)
        controls=frame['interactive']['controls']
        unsupported,incapable=controls[0],controls[1]
        frame['tracks'][unsupported['controlTrackId']]['latest']['position']['altitude']['reference']='MSL'
        incapable['capabilities'].remove('demo-intercept')
        result=recommendations.generate(frame,cp,[c['entityId'] for c in controls],owns_control=True,
            now=h.now,expires_at='2026-09-14T00:00:15.200Z',identity='reason-review')
        all_option=next(o for o in result.options if o.id=='intercept-all')
        by_id={r.entity_id:r for r in all_option.unchanged_reasons}
        assert len(all_option.action.members)==2 and len(by_id)==2
        assert by_id[unsupported['entityId']].disposition=='excluded'
        assert 'Unsupported altitude reference' in by_id[unsupported['entityId']].reason
        assert 'no Intercept capability' in by_id[incapable['entityId']].reason
        subset=next(o for o in result.options if o.id=='intercept-subset')
        deliberate=[r for r in subset.unchanged_reasons if r.disposition=='unchanged']
        assert len(deliberate)==1 and 'smaller group' in deliberate[0].reason
        assert len(subset.unchanged_reasons)==3
    asyncio.run(run())


def test_partial_patrol_feasibility_preserves_specific_boundary_exclusion():
    from test_d4 import arrangement,polygon
    from test_conductor import ready
    from app.commands.kinematics import geographic
    h=Harness()
    async def run():
        data=arrangement(2,0)
        # Every ID-selected entry corner must clear the wall; (0,150) crosses it
        # for the south-west corner, making a UUID-dependent test fixture.
        data['units'][1]['position'].update(geographic(0,500))
        data.update(boundaryRuleVersion='local-boundary-v1',boundaries=[polygon(size=20),dict(polygon('restricted',50,0,20),id='wall')])
        mid,_,_=await ready(h,data)
        await h.act(mid,'acquire');await h.act(mid,'start');await ticks(h,1)
        proposal=await suggest(h,mid)
        option=next(o for o in proposal.options if o.id=='patrol')
        assert len(option.action.members)==1 and len(option.unchanged_reasons)==1
        assert option.unchanged_reasons[0].disposition=='excluded'
        assert 'ingress' in option.unchanged_reasons[0].reason.lower()
        req=await request(h,mid,proposal,'patrol')
        assert (await h.service.command(mid,req,CREDENTIAL)).accepted
        saved=json.loads(h.repo.receipt(req.command_id,mid)[0])
        assert saved['intent']['recommendation']['option']['unchangedReasons'][0]['reason']==option.unchanged_reasons[0].reason
    asyncio.run(run())
