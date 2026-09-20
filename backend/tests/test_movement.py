import asyncio
import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from app.commands.contracts import MoveRequest, CommandRequest
from app.commands.kinematics import endpoints, metric, distance
from app.commands.service import CommandError, InteractiveService, plus
from app.domain.models import WorldFrame
from app.main import create_app
from app.world.serialization import canonical, read_frame
from app.recording.storage_codec import decode_text
from test_interactive import Harness, CREDENTIAL, OTHER


async def started(h):
    mid = (await h.create()).mission_id
    await h.act(mid, 'acquire')
    await h.act(mid, 'start')
    h.advance(.2)
    await h.service.tick()
    return mid


def draft(h, mid, count=1, offset=.0005):
    frame = json.loads(canonical(h.authority.read(mid)))
    run = frame['interactive']
    controls = run['controls'][:count]
    origins = [frame['tracks'][c['controlTrackId']]['latest']['position'] for c in controls]
    anchor = {'longitudeDeg': sum(p['longitudeDeg'] for p in origins) / count + offset,
              'latitudeDeg': sum(p['latitudeDeg'] for p in origins) / count}
    targets = endpoints(origins, anchor)
    members = [{**{k: c[k] for k in ('assetId', 'entityId', 'executorId', 'sourceId', 'controlTrackId', 'grantId', 'bindingRevision', 'busyRevision')},
                'origin': p, 'destination': target} for c, p, target in zip(controls, origins, targets)]
    return MoveRequest.model_validate_json(canonical({'commandId': str(uuid4()), 'holderId': 'operator-one', 'move': {
        'missionId': mid, 'runId': run['runId'], 'executorEpoch': run['executorEpoch'], 'sourceId': run['sourceId'],
        'grantId': run['grantId'], 'grantRevision': run['grantRevision'], 'reviewedFrameId': frame['frameId'],
        'deadline': plus(frame['recordedAt'], 30), 'anchor': anchor, 'members': members}}))


async def submit(h, mid, request=None):
    return await h.service.move(mid, request or draft(h, mid), CREDENTIAL)


async def ticks(h, count):
    for _ in range(count):
        h.advance(.2)
        await h.service.tick()


async def cancel(h, mid, eid):
    intent = await h.service.issue_intent(mid, 'cancel', eid)
    return await h.service.command(mid, CommandRequest(command_id=str(uuid4()), holder_id='operator-one', intent=intent), CREDENTIAL)


def execution(h, mid, eid):
    return next(e for e in h.authority.read(mid).interactive.executions if e.id == eid)


def test_group_geometry_preserves_offsets_and_supplied_heights():
    origins = [dict(longitudeDeg=103.85, latitudeDeg=1.29, altitude={'metres': 120., 'reference': 'ELLIPSOID', 'datumId': 'WGS84'}),
               dict(longitudeDeg=103.854, latitudeDeg=1.294, altitude={'metres': 220., 'reference': 'ELLIPSOID', 'datumId': 'WGS84'})]
    targets = endpoints(origins, {'longitudeDeg': 103.86, 'latitudeDeg': 1.30})
    assert targets[0]['longitudeDeg'] == 103.858 and targets[1]['longitudeDeg'] == 103.862
    assert targets[0]['latitudeDeg'] == 1.298 and targets[1]['latitudeDeg'] == 1.302
    assert [p['altitude']['metres'] for p in targets] == [120, 220]
    assert distance(origins[0], origins[1]) == pytest.approx(distance(targets[0], targets[1]), abs=.001)
    assert metric(origins[0]) == (0, 0)
    for anchor, source, code in [({'longitudeDeg': 105, 'latitudeDeg': 1.3}, origins, 'OUTSIDE_EXTENT'),
                                  ({'longitudeDeg': 103.852, 'latitudeDeg': 1.292}, origins, 'ENDPOINT_INVALID'),
                                  ({'longitudeDeg': 103.86, 'latitudeDeg': 1.3}, [origins[0]] * 2, 'ENDPOINT_INVALID')]:
        with pytest.raises(CommandError) as error:
            endpoints(source, anchor)
        assert error.value.code == code


def test_single_completion_has_committed_position_sample_and_observer_evidence():
    h = Harness()
    async def run():
        mid = await started(h)
        request = draft(h, mid)
        receipt = await submit(h, mid, request)
        assert receipt.accepted and len(receipt.execution_ids) == 1
        eid = receipt.execution_ids[0]
        assert execution(h, mid, eid).state == 'Accepted'
        before = h.authority.read(mid)
        await ticks(h, 1)
        progress = execution(h, mid, eid)
        assert progress.state == 'Running' and progress.travelled_metres == 4
        assert h.authority.read(mid).tracks[progress.control_track_id].latest.position != before.tracks[progress.control_track_id].latest.position
        await ticks(h, 20)
        result = execution(h, mid, eid)
        assert result.state == 'Completed' and result.remaining_metres == 0
        sample = result.completion_sample
        raw = h.repo.db.execute('SELECT frame_json FROM frames WHERE recording_id=? AND sequence=?', (receipt.recording_id, sample.sequence)).fetchone()[0]
        committed = read_frame(decode_text(raw))
        assert canonical(committed.tracks[sample.track_id].latest.position) == canonical(result.destination)
        assert committed.tracks[sample.track_id].latest.timestamp == sample.timestamp
        current = h.authority.read(mid)
        observer = next(t for t in current.tracks.values() if t.entity_id == result.entity_id and t.source.id == 'demo-observer-v1')
        assert canonical(observer.latest.position) == canonical(result.destination)
        assert await h.service.move(mid, request, None) == receipt
        assert h.service.lookup(request.command_id, mid) == receipt
        assert h.service.executions(mid, committed.frame_id).executions[0].state == 'Completed'
    asyncio.run(run())


def test_group_all_or_none_busy_and_independent_member_failure():
    h = Harness()
    async def run():
        mid = await started(h)
        request = draft(h, mid, 2)
        receipt = await submit(h, mid, request)
        assert len(receipt.execution_ids) == 2
        assert (await submit(h, mid, draft(h, mid, 2))).code == 'ASSET_BUSY'
        await ticks(h, 1)
        def unavailable(frame):
            frame['assets'][request.move.members[0].asset_id]['availability'] = 'unavailable'
            return frame, []
        await h.authority.commit_source(mid, unavailable)
        await ticks(h, 20)
        assert [execution(h, mid, e).state for e in receipt.execution_ids] == ['Failed', 'Completed']
        # A mixed group is rejected without reserving the available member.
        mixed = draft(h, mid, 2)
        result = await submit(h, mid, mixed)
        assert result.code == 'SELECTION_INVALID' and not result.accepted
        assert all(e.state != 'Accepted' for e in h.authority.read(mid).interactive.executions)
    asyncio.run(run())


def test_long_running_movement_ignores_admission_deadline_and_expired_lease():
    h = Harness()
    async def run():
        mid = await started(h)
        request = draft(h, mid, offset=.01)
        receipt = await submit(h, mid, request)
        await ticks(h, 200)
        e = execution(h, mid, receipt.execution_ids[0])
        assert e.state == 'Running' and e.travelled_metres == 800
        assert h.now > e.deadline and h.service.status(mid, CREDENTIAL).lease_state == 'expired'
        await ticks(h, 100)
        assert execution(h, mid, e.id).state == 'Completed'
        assert await h.service.move(mid, request, None) == receipt
    asyncio.run(run())


def test_pause_over_thirty_seconds_resume_cancel_and_replacement():
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await submit(h, mid, draft(h, mid, offset=.01))
        eid = receipt.execution_ids[0]
        await ticks(h, 1)
        await h.act(mid, 'pause')
        position = canonical(h.authority.read(mid).tracks[execution(h, mid, eid).control_track_id].latest.position)
        for _ in range(4):
            h.advance(10)
            await h.act(mid, 'renew')
            await h.service.tick()
        assert execution(h, mid, eid).state == 'Suspended'
        assert canonical(h.authority.read(mid).tracks[execution(h, mid, eid).control_track_id].latest.position) == position
        assert (await cancel(h, mid, eid)).accepted
        assert execution(h, mid, eid).state == 'Cancelled'
        await h.act(mid, 'resume')
        await ticks(h, 1)
        replacement = await submit(h, mid)
        assert replacement.accepted
        await ticks(h, 20)
        assert execution(h, mid, replacement.execution_ids[0]).state == 'Completed'
        assert execution(h, mid, eid).state == 'Cancelled'
    asyncio.run(run())


def test_not_started_work_expires_while_paused_without_moving():
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await submit(h, mid)
        await h.act(mid, 'pause')
        frozen = h.authority.read(mid)
        h.advance(31)
        await h.service.tick()
        e = execution(h, mid, receipt.execution_ids[0])
        assert e.state == 'Expired' and not e.started_at
        assert h.authority.read(mid).effective_at == frozen.effective_at
        assert h.authority.read(mid).tracks[e.control_track_id].latest.position == frozen.tracks[e.control_track_id].latest.position
    asyncio.run(run())


@pytest.mark.parametrize('action', ['revoke', 'end'])
def test_explicit_revocation_and_end_terminalize_accepted_execution(action):
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await submit(h, mid)
        await ticks(h, 1)
        assert (await h.act(mid, action)).accepted
        e = execution(h, mid, receipt.execution_ids[0])
        assert e.state == 'Cancelled' and e.reason == f'run-{action}'
    asyncio.run(run())


def test_completion_wins_cancel_race_and_old_cancel_cannot_target_replacement():
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await submit(h, mid, draft(h, mid, offset=.00002))
        eid = receipt.execution_ids[0]
        intent = await h.service.issue_intent(mid, 'cancel', eid)
        request = CommandRequest(command_id='late-cancel', holder_id='operator-one', intent=intent)
        await ticks(h, 1)
        assert execution(h, mid, eid).state == 'Completed'
        result = await h.service.command(mid, request, CREDENTIAL)
        assert result.code == 'EXECUTION_TERMINAL'
        replacement = await submit(h, mid)
        assert replacement.accepted
        assert await h.service.command(mid, request, None) == result
        assert execution(h, mid, replacement.execution_ids[0]).state == 'Accepted'
    asyncio.run(run())


@pytest.mark.parametrize('key,value,code', [
    ('missionId','other','REFERENCE_MISMATCH'), ('sourceId','other','REFERENCE_MISMATCH'),
    ('grantId','other','REFERENCE_MISMATCH'), ('executorEpoch','other','REFERENCE_MISMATCH'),
    ('reviewedFrameId','other','FRAME_INVALID'), ('deadline','2026-09-14T01:00:00.000Z','MOVE_EXPIRED')])
def test_wrong_move_authority_and_anchor(key, value, code):
    h = Harness()
    async def run():
        mid = await started(h)
        body = json.loads(canonical(draft(h, mid)))
        body['move'][key] = value
        request = MoveRequest.model_validate_json(canonical(body))
        assert (await submit(h, mid, request)).code == code
        assert not h.authority.read(mid).interactive.executions
    asyncio.run(run())


@pytest.mark.parametrize('field', ['bindingRevision', 'busyRevision', 'controlTrackId', 'entityId', 'executorId', 'sourceId'])
def test_member_binding_revisions_and_control_track_are_authoritative(field):
    h = Harness()
    async def run():
        mid = await started(h)
        body = json.loads(canonical(draft(h, mid, 2)))
        body['move']['members'][1][field] = 999 if field.endswith('Revision') else 'not-the-binding'
        result = await submit(h, mid, MoveRequest.model_validate_json(canonical(body)))
        assert not result.accepted and result.code == 'BINDING_CHANGED'
        assert not h.authority.read(mid).interactive.executions
    asyncio.run(run())


def test_stall_expired_first_delivery_conflicting_payload_and_parallel_duplicate():
    h = Harness()
    async def run():
        mid = await started(h)
        request = draft(h, mid)
        h.advance(3)
        assert (await submit(h, mid, request)).code == 'SOURCE_UNHEALTHY'
        await ticks(h, 1)
        request = draft(h, mid)
        results = await asyncio.gather(submit(h, mid, request), submit(h, mid, request))
        assert results[0] == results[1] and results[0].accepted
        changed = request.model_copy(update={'holder_id': 'different'})
        with pytest.raises(CommandError) as error:
            await submit(h, mid, changed)
        assert error.value.code == 'IDENTITY_CONFLICT'
        await cancel(h, mid, results[0].execution_ids[0])
        expired = draft(h, mid)
        h.advance(31)
        await h.act(mid, 'reclaim')
        await ticks(h, 1)
        assert (await submit(h, mid, expired)).code == 'MOVE_EXPIRED'
    asyncio.run(run())


@pytest.mark.parametrize('stage', ['frames', 'events', 'interactive_checkpoints', 'command_receipts'])
def test_move_admission_rollback_does_not_reserve_or_publish(stage):
    h = Harness()
    async def run():
        mid = await started(h)
        before, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        _, sub = await h.authority.subscribe(mid)
        request = draft(h, mid)
        h.repo.db.execute(f"CREATE TRIGGER fail BEFORE INSERT ON {stage} BEGIN SELECT RAISE(ABORT,'test rollback'); END")
        with pytest.raises(sqlite3.Error):
            await submit(h, mid, request)
        assert h.repo.latest_text(mid) == before and h.repo.checkpoint(mid) == checkpoint
        assert sub.queue.empty() and h.repo.receipt(request.command_id, mid) is None
        h.repo.db.execute('DROP TRIGGER fail')
        assert (await submit(h, mid, request)).accepted
    asyncio.run(run())


def test_tick_rollback_and_restart_interrupt_preserve_original_frames(tmp_path):
    h = Harness(tmp_path / 'movement.sqlite3')
    async def run():
        mid = await started(h)
        receipt = await submit(h, mid)
        await ticks(h, 1)
        before, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        _, sub = await h.authority.subscribe(mid)
        h.repo.db.execute("CREATE TRIGGER fail BEFORE INSERT ON interactive_checkpoints BEGIN SELECT RAISE(ABORT,'test rollback'); END")
        with pytest.raises(sqlite3.Error):
            await ticks(h, 1)
        assert h.repo.latest_text(mid) == before and h.repo.checkpoint(mid) == checkpoint and sub.queue.empty()
        h.repo.db.execute('DROP TRIGGER fail')
        stored = [r[0] for r in h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence')]
        recovered = InteractiveService(h.authority, True)
        await recovered.recover()
        frame = h.authority.read(mid)
        assert frame.interactive.state == 'paused' and frame.interactive.executor_epoch != json.loads(before)['interactive']['executorEpoch']
        assert frame.interactive.executions[0].state == 'Interrupted'
        assert frame.tracks[frame.interactive.executions[0].control_track_id].latest.discontinuity
        assert [r[0] for r in h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence LIMIT ?', (len(stored),))] == stored
        assert recovered.lookup(receipt.request_id, mid) == receipt
    asyncio.run(run())


def test_v11_record_and_v10_receipt_are_read_without_rewriting():
    h = Harness()
    async def run():
        mid = (await h.create('old-creation')).mission_id
        value = json.loads(h.repo.latest_text(mid))
        value['schemaVersion'] = '1.1'
        value['interactive']['schemaVersion'] = '1.0'
        value['interactive'].pop('movementModel')
        value['interactive'].pop('executions')
        value['interactive']['supportedActions'].remove('cancel')
        value['interactive']['supportedActions'].remove('stop')
        value['interactive']['supportedActions'].remove('boundary-edit')
        value['interactive']['capabilities'].remove('boundary-edit')
        value.pop('fleetBehavior')
        value.pop('unitProfiles', None)
        value['interactive']['supportedActions'].remove('behavior')
        value['interactive']['capabilities'].remove('fleet-policy')
        value['interactive']['capabilities'].remove('demo-outcome')
        for c in value['interactive']['controls']:
            c.pop('busyRevision')
            if 'demo-intercept' in c['capabilities']:
                c['capabilities'].remove('demo-intercept')
        original = json.dumps(value, indent=2)
        h.repo.db.execute('UPDATE frames SET frame_json=? WHERE frame_id=?', (original, value['frameId']))
        projected = h.authority.read(mid)
        assert projected.schema_version == '1.10' and projected.interactive.schema_version == '1.7'
        assert h.repo.latest_text(mid) == original
        payload, receipt = h.repo.receipt('old-creation')
        legacy = json.loads(receipt)
        legacy['schemaVersion'] = '1.0'
        legacy.pop('executionIds')
        legacy.pop('memberOutcomes')
        legacy.pop('controlOutcomes')
        legacy.pop('behaviorOutcomes')
        legacy.pop('targetScope')
        old_receipt = json.dumps(legacy, indent=2)
        h.repo.db.execute('UPDATE creation_receipts SET receipt_json=? WHERE creation_id=?', (old_receipt, 'old-creation'))
        assert json.loads(canonical(h.service.lookup('old-creation'))) == legacy
        assert h.repo.receipt('old-creation')[1] == old_receipt
        # This store also contains a newly encoded checkpoint; legacy frame and
        # receipt TEXT remain exact inside the explicitly versioned mixed store.
        assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 5
    asyncio.run(run())


def test_started_work_resumes_after_long_pause_and_clock_evidence_stays_simulation_time():
    h = Harness()
    async def run():
        mid = await started(h)
        await h.act(mid, 'pause')
        for _ in range(4):
            h.advance(10)
            await h.act(mid, 'renew')
        await h.act(mid, 'resume')
        await ticks(h, 1)
        receipt = await submit(h, mid)
        await ticks(h, 1)
        e = execution(h, mid, receipt.execution_ids[0])
        assert e.started_at == h.authority.read(mid).effective_at
        assert e.started_at != h.now
        await h.act(mid, 'pause')
        saved = e.travelled_metres
        for _ in range(4):
            h.advance(10)
            await h.act(mid, 'renew')
            await h.service.tick()
        assert execution(h, mid, e.id).travelled_metres == saved
        await h.act(mid, 'resume')
        await ticks(h, 20)
        assert execution(h, mid, e.id).state == 'Completed'
    asyncio.run(run())


def test_prior_grant_anchor_cannot_be_upgraded_and_unsupported_height_rejects():
    h = Harness()
    async def run():
        mid = await started(h)
        request = draft(h, mid)
        await h.act(mid, 'revoke')
        await h.act(mid, 'acquire')
        forged = request.model_copy(update={'move': request.move.model_copy(update={'grant_revision':h.authority.read(mid).interactive.grant_revision})})
        assert (await submit(h, mid, forged)).code == 'FRAME_INVALID'
        current = draft(h, mid)
        def change_reference(frame):
            for track in frame['tracks'].values():
                if track['entityId'] == current.move.members[0].entity_id:
                    track['latest']['position']['altitude'] = {'metres':150, 'reference':'MSL', 'datumId':'EGM96'}
            return frame, []
        await h.authority.commit_source(mid, change_reference)
        assert (await submit(h, mid, current)).code == 'UNSUPPORTED_REFERENCE'
        assert not h.authority.read(mid).interactive.executions
    asyncio.run(run())


def test_bounded_projection_keeps_latest_64_and_archived_executions_are_queryable():
    h = Harness()
    async def run():
        mid = await started(h)
        first_frame = None
        first_id = None
        for _ in range(66):
            receipt = await submit(h, mid, draft(h, mid, offset=.00002))
            assert receipt.accepted
            await ticks(h, 1)
            if first_frame is None:
                first_frame = h.authority.read(mid).frame_id
                first_id = receipt.execution_ids[0]
        current = h.authority.read(mid)
        assert len(current.interactive.executions) == 64
        assert len(h.repo.checkpoint(mid)['executions']) == 64
        assert all(e.id != first_id for e in current.interactive.executions)
        assert h.service.executions(mid, first_frame).executions[0].id == first_id
    asyncio.run(run())


def test_http_move_and_query_receipts_do_not_expose_private_control(tmp_path):
    app = create_app(db_path=str(tmp_path/'http.sqlite3'), demo_enabled=True)
    with TestClient(app) as client:
        created = client.post('/api/interactive/runs', json={'creationId':'create', 'templateId':'singapore-local-v1'}).json()
        mid = created['missionId']
        for action in ['acquire','start']:
            intent=client.post(f'/api/interactive/{mid}/intents',json={'action':action}).json()
            result=client.post(f'/api/interactive/{mid}/commands',headers={'X-Sentinel-Control':CREDENTIAL},json={'commandId':action,'holderId':'operator-one','intent':intent})
            assert result.json()['accepted']
        # Service-clock test harness covers all fixed steps; here use the actual HTTP shape.
        service = app.state.interactive
        client.portal.call(service.tick)
        harness=type('Read',(),{'authority':app.state.service})()
        request=draft(harness,mid).model_copy(update={'command_id':'opaque /?#% identity'})
        response=client.post(f'/api/interactive/{mid}/moves',headers={'X-Sentinel-Control':CREDENTIAL},json=json.loads(canonical(request)))
        assert response.status_code==200 and response.json()['accepted']
        assert client.get(f'/api/interactive/{mid}/receipts',params={'identity':request.command_id}).json()==response.json()
        assert CREDENTIAL not in response.text
        assert CREDENTIAL not in client.get(f'/api/missions/{mid}/world').text
        assert CREDENTIAL not in client.get(f'/api/interactive/{mid}/executions').text
