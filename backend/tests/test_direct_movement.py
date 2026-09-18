"""RTS admission tests exercise the actual authority, transaction and executor."""
import asyncio
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.commands.contracts import DirectMoveRequest
from app.commands.kinematics import distance
from app.commands.service import CommandError, InteractiveService, plus
from app.domain.models import LegacyMovementWorldFrame
from app.main import create_app
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL, OTHER
from test_movement import started, ticks, execution, cancel


def direct(h, mid, order=1, indices=(0,), longitude=103.858, latitude=1.292):
    frame = h.authority.read(mid)
    run = frame.interactive
    keys = ('assetId', 'entityId', 'executorId', 'sourceId', 'controlTrackId', 'grantId', 'bindingRevision')
    controls = [json.loads(canonical(run.controls[i])) for i in indices]
    return DirectMoveRequest.model_validate_json(canonical({
        'commandId': str(uuid4()), 'holderId': 'operator-one', 'direct': {
            'missionId': mid, 'runId': run.run_id, 'executorEpoch': run.executor_epoch,
            'sourceId': run.source_id, 'grantId': run.grant_id, 'grantRevision': run.grant_revision,
            'reviewedFrameId': frame.frame_id, 'deadline': plus(frame.recorded_at, 30), 'order': order,
            'anchor': {'longitudeDeg': longitude, 'latitudeDeg': latitude},
            'members': [{k: c[k] for k in keys if k in c} for c in controls]}}))


async def issue(h, mid, request):
    return await h.service.direct_move(mid, request, CREDENTIAL)


def test_direct_completion_duplicate_reconciliation_and_conflicting_payload():
    h = Harness()
    async def run():
        mid = await started(h)
        request = direct(h, mid, longitude=103.8503, latitude=1.29)
        receipt = await issue(h, mid, request)
        assert receipt.accepted and receipt.schema_version == '1.6'
        assert receipt.member_outcomes[0].outcome == 'accepted'
        eid = receipt.execution_ids[0]
        assert execution(h, mid, eid).state == 'Accepted'
        assert execution(h, mid, eid).direct_order == 1
        assert h.authority.read(mid).interactive.controls[0].eligible
        await ticks(h, 12)
        e = execution(h, mid, eid)
        assert e.state == 'Completed' and e.completion_sample
        sample = h.repo.db.execute('SELECT frame_json FROM frames WHERE sequence=? AND recording_id=?',
                                  (e.terminal_sequence, receipt.recording_id)).fetchone()[0]
        assert canonical(read_frame(sample).tracks[e.control_track_id].latest.position) == canonical(e.destination)
        assert h.service.lookup(request.command_id, mid) == receipt
        sequence = h.authority.read(mid).sequence
        assert await h.service.direct_move(mid, request, None) == receipt
        assert h.authority.read(mid).sequence == sequence
        changed = request.model_copy(update={'holder_id': 'different'})
        with pytest.raises(CommandError) as error:
            await issue(h, mid, changed)
        assert error.value.code == 'IDENTITY_CONFLICT'
    asyncio.run(run())


def test_available_only_centroid_partial_outcomes_and_no_recovery_replay():
    h = Harness()
    async def run():
        mid = await started(h)
        # The unavailable outlier is deliberately far from the available pair.
        def outlier(frame):
            track = frame['interactive']['controls'][3]['controlTrackId']
            frame['tracks'][track]['latest']['position']['longitudeDeg'] = 140
            return frame, []
        await h.authority.commit_source(mid, outlier)
        request = direct(h, mid, indices=(0, 1, 2, 3), longitude=103.856, latitude=1.296)
        receipt = await issue(h, mid, request)
        assert receipt.accepted and len(receipt.execution_ids) == 2
        assert [o.outcome for o in receipt.member_outcomes] == ['accepted', 'accepted', 'skipped', 'skipped']
        assert [o.code for o in receipt.member_outcomes[2:]] == ['POSITION_UNAVAILABLE', 'NO_RESPONSE']
        a, b = [execution(h, mid, eid) for eid in receipt.execution_ids]
        assert (a.destination.longitude_deg, a.destination.latitude_deg) == (103.854, 1.294)
        assert (b.destination.longitude_deg, b.destination.latitude_deg) == (103.858, 1.298)
        assert a.destination.altitude == a.origin.altitude
        def recovery(frame):
            c = frame['interactive']['controls'][3]
            c['capabilities'] = ['move-horizontal']
            frame['assets'][c['assetId']]['availability'] = 'available'
            t = frame['tracks'][c['controlTrackId']]
            t['state'] = 'tracking'
            t['latest']['position']['longitudeDeg'] = 103.86
            return frame, []
        await h.authority.commit_source(mid, recovery)
        await ticks(h, 1)
        assert len(h.authority.read(mid).interactive.executions) == 2
        assert await issue(h, mid, request) == receipt
        assert len(h.authority.read(mid).interactive.executions) == 2
    asyncio.run(run())


def test_all_unavailable_records_exact_skips_and_confirmed_down_is_distinct():
    h = Harness()
    async def run():
        mid = await started(h)
        def down(frame):
            eid = frame['interactive']['controls'][2]['entityId']
            frame['entities'][eid]['condition'] = 'non-operational'
            return frame, []
        await h.authority.commit_source(mid, down)
        request = direct(h, mid, indices=(2, 3))
        before = h.repo.latest_text(mid)
        receipt = await issue(h, mid, request)
        assert not receipt.accepted and receipt.code == 'NO_AVAILABLE_ASSETS'
        assert [(o.code, o.reason) for o in receipt.member_outcomes] == [
            ('UNAVAILABLE', 'Down: reported non-operational.'),
            ('NO_RESPONSE', 'No response: control observation is stale.')]
        assert h.repo.latest_text(mid) == before
        assert receipt.execution_ids == [] and h.repo.checkpoint(mid)['directOrders'] == {}
        assert h.service.lookup(request.command_id, mid) == receipt
    asyncio.run(run())


def test_availability_changes_after_capture_and_during_execution_are_per_member():
    h = Harness()
    async def run():
        mid = await started(h)
        request = direct(h, mid, indices=(0, 1), longitude=103.87)
        second = request.direct.members[1]
        def unavailable(frame):
            frame['assets'][second.asset_id]['availability'] = 'unavailable'
            return frame, []
        await h.authority.commit_source(mid, unavailable)
        receipt = await issue(h, mid, request)
        assert [o.outcome for o in receipt.member_outcomes] == ['accepted', 'skipped']
        def restored(frame):
            frame['assets'][second.asset_id]['availability'] = 'available'
            return frame, []
        await h.authority.commit_source(mid, restored)
        await ticks(h, 1)
        assert len(h.authority.read(mid).interactive.executions) == 1
        new = await issue(h, mid, direct(h, mid, order=2, indices=(0, 1), longitude=103.875))
        await ticks(h, 1)
        await h.authority.commit_source(mid, unavailable)
        await ticks(h, 1)
        assert [execution(h, mid, eid).state for eid in new.execution_ids] == ['Running', 'Failed']
        assert execution(h, mid, new.execution_ids[0]).travelled_metres == 8
    asyncio.run(run())


def test_replacement_uses_current_position_and_subset_leaves_others_moving():
    h = Harness()
    async def run():
        mid = await started(h)
        first = await issue(h, mid, direct(h, mid, indices=(0, 1)))
        await ticks(h, 4)
        old_a, old_b = [execution(h, mid, eid) for eid in first.execution_ids]
        current = h.authority.read(mid).tracks[old_a.control_track_id].latest.position
        replacement = await issue(h, mid, direct(h, mid, order=2, latitude=1.299))
        new = execution(h, mid, replacement.execution_ids[0])
        assert canonical(new.origin) == canonical(current)
        assert execution(h, mid, old_a.id).state == 'Cancelled'
        assert execution(h, mid, old_a.id).reason == 'Superseded by behavior order 2.'
        assert execution(h, mid, old_b.id) == old_b
        assert canonical(new.destination.altitude) == canonical(current.altitude)
        await ticks(h, 1)
        assert execution(h, mid, new.id).travelled_metres == 4
        assert execution(h, mid, old_b.id).travelled_metres == old_b.travelled_metres + 4
        orders = h.authority.read(mid).interactive.controls
        assert [orders[i].last_direct_order.order for i in (0, 1)] == [2, 1]
    asyncio.run(run())


def test_delayed_reordered_requests_cannot_restore_older_destinations_per_asset():
    h = Harness()
    async def run():
        mid = await started(h)
        older = direct(h, mid, order=1, indices=(0, 1))
        newer = direct(h, mid, order=2, indices=(0,), latitude=1.299)
        latest = await issue(h, mid, newer)
        result = await issue(h, mid, older)
        assert result.accepted
        assert [o.code for o in result.member_outcomes] == ['ORDER_SUPERSEDED', 'OK']
        assert execution(h, mid, latest.execution_ids[0]).state == 'Accepted'
        assert execution(h, mid, latest.execution_ids[0]).destination.latitude_deg == 1.299
        stale = direct(h, mid, order=1)
        rejected = await issue(h, mid, stale)
        assert rejected.code == 'ORDER_SUPERSEDED' and not rejected.accepted
        assert h.authority.read(mid).interactive.controls[0].last_direct_order.order == 2
    asyncio.run(run())


def test_concurrent_duplicate_and_cancel_race_cannot_cancel_replacement():
    from app.commands.contracts import CommandRequest
    h = Harness()
    async def run():
        mid = await started(h)
        request = direct(h, mid)
        a, b = await asyncio.gather(issue(h, mid, request), issue(h, mid, request))
        assert a == b and len(h.authority.read(mid).interactive.executions) == 1
        await ticks(h, 1)
        old_cancel = await h.service.issue_intent(mid, 'cancel', a.execution_ids[0])
        newer = await issue(h, mid, direct(h, mid, order=2, latitude=1.3))
        late = await h.service.command(mid, CommandRequest(command_id='late-cancel', holder_id='operator-one', intent=old_cancel), CREDENTIAL)
        assert late.code == 'EXECUTION_TERMINAL'
        assert execution(h, mid, newer.execution_ids[0]).state == 'Accepted'
        await h.act(mid, 'end')
        assert execution(h, mid, newer.execution_ids[0]).state == 'Cancelled'
    asyncio.run(run())


def test_persisted_order_outlives_bounded_execution_projection():
    h = Harness()
    async def run():
        mid = await started(h)
        old = direct(h, mid, order=1)
        for order in range(1, 68):
            assert (await issue(h, mid, direct(h, mid, order=order, latitude=1.292 + order * .00001))).accepted
        current = h.authority.read(mid)
        assert len(current.interactive.executions) == 64
        assert current.interactive.controls[0].last_direct_order.order == 67
        assert (await issue(h, mid, old)).code == 'ORDER_SUPERSEDED'
        assert h.repo.checkpoint(mid)['directOrders'][old.direct.members[0].asset_id]['order'] == 67
        checkpoint = h.repo.checkpoint(mid)
        checkpoint['directOrders']['obsolete-unbound-asset'] = dict(checkpoint['directOrders'][old.direct.members[0].asset_id])
        h.repo.save_checkpoint(mid, checkpoint)
        await ticks(h, 1)
        assert set(h.repo.checkpoint(mid)['directOrders']) == {old.direct.members[0].asset_id}
    asyncio.run(run())


@pytest.mark.parametrize('longitude,latitude,code', [(104.0, 1.29, 'OUTSIDE_EXTENT'), (103.85, 1.29, 'ENDPOINT_INVALID')])
def test_invalid_replacement_never_cancels_or_advances_order(longitude, latitude, code):
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await issue(h, mid, direct(h, mid))
        before = execution(h, mid, receipt.execution_ids[0])
        invalid = await issue(h, mid, direct(h, mid, order=10, longitude=longitude, latitude=latitude))
        assert invalid.code == code and invalid.direct_order == 10
        assert execution(h, mid, before.id) == before
        assert h.authority.read(mid).interactive.controls[0].last_direct_order.order == 1
        assert (await issue(h, mid, direct(h, mid, order=2))).accepted
    asyncio.run(run())


@pytest.mark.parametrize('key', ['entityId', 'executorId', 'sourceId', 'controlTrackId', 'grantId', 'bindingRevision'])
def test_binding_integrity_is_global_even_for_unavailable_members(key):
    h = Harness()
    async def run():
        mid = await started(h)
        previous = await issue(h, mid, direct(h, mid))
        request = json.loads(canonical(direct(h, mid, order=2, indices=(0, 3))))
        request['direct']['members'][1][key] = 99 if key == 'bindingRevision' else 'wrong'
        receipt = await issue(h, mid, DirectMoveRequest.model_validate_json(canonical(request)))
        assert receipt.code == 'BINDING_CHANGED' and not receipt.accepted
        assert execution(h, mid, previous.execution_ids[0]).state == 'Accepted'
    asyncio.run(run())


@pytest.mark.parametrize('key', ['missionId', 'runId', 'executorEpoch', 'sourceId', 'grantId', 'grantRevision'])
def test_direct_global_context_mismatch_does_not_change_work(key):
    h = Harness()
    async def run():
        mid = await started(h)
        request = json.loads(canonical(direct(h, mid)))
        request['direct'][key] = 99 if key == 'grantRevision' else 'wrong'
        receipt = await issue(h, mid, DirectMoveRequest.model_validate_json(canonical(request)))
        assert receipt.code == 'REFERENCE_MISMATCH'
        assert not h.authority.read(mid).interactive.executions
    asyncio.run(run())


def test_expiry_source_stall_and_authority_are_global_without_silent_takeover():
    h = Harness()
    async def run():
        mid = await started(h)
        request = direct(h, mid)
        assert (await h.service.direct_move(mid, request, OTHER)).code == 'CONTROL_REQUIRED'
        old = direct(h, mid, order=2)
        h.advance(31)
        await h.act(mid, 'reclaim')
        await ticks(h, 1)
        assert (await issue(h, mid, old)).code == 'MOVE_EXPIRED'
        stalled = direct(h, mid, order=3)
        h.advance(3)
        assert (await issue(h, mid, stalled)).code == 'SOURCE_UNHEALTHY'
        assert not h.authority.read(mid).interactive.executions
    asyncio.run(run())


def test_started_work_outlives_deadline_and_lease_then_long_pause_fresh_cancel():
    h = Harness()
    async def run():
        mid = await started(h)
        receipt = await issue(h, mid, direct(h, mid, longitude=103.88))
        await ticks(h, 1)
        h.advance(40)
        await ticks(h, 1)
        eid = receipt.execution_ids[0]
        assert execution(h, mid, eid).state == 'Running'
        assert not h.service.status(mid, CREDENTIAL).owns_control
        await h.act(mid, 'reclaim')
        await h.act(mid, 'pause')
        before = h.authority.read(mid).tracks[execution(h, mid, eid).control_track_id].latest.position
        h.advance(40)
        await h.service.tick()
        assert execution(h, mid, eid).state == 'Suspended'
        assert h.authority.read(mid).tracks[execution(h, mid, eid).control_track_id].latest.position == before
        await h.act(mid, 'reclaim')
        assert (await cancel(h, mid, eid)).accepted
        assert execution(h, mid, eid).state == 'Cancelled'
        await h.act(mid, 'resume')
        await ticks(h, 1)
        replacement = await issue(h, mid, direct(h, mid, order=2))
        await h.act(mid, 'revoke')
        assert execution(h, mid, replacement.execution_ids[0]).state == 'Cancelled'
    asyncio.run(run())


@pytest.mark.parametrize('table', ['frames', 'events', 'interactive_checkpoints', 'command_receipts'])
def test_replacement_transaction_failure_preserves_old_work_and_order(table):
    h = Harness()
    async def run():
        mid = await started(h)
        await issue(h, mid, direct(h, mid))
        await ticks(h, 1)
        before, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        _, subscription = await h.authority.subscribe(mid)
        request = direct(h, mid, order=2, latitude=1.3)
        h.repo.db.execute(f"CREATE TRIGGER fail BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'rollback'); END")
        with pytest.raises(sqlite3.Error):
            await issue(h, mid, request)
        assert h.repo.latest_text(mid) == before and h.repo.checkpoint(mid) == checkpoint
        assert subscription.queue.empty() and h.repo.receipt(request.command_id, mid) is None
        h.repo.db.execute('DROP TRIGGER fail')
        assert (await issue(h, mid, request)).accepted
    asyncio.run(run())


def test_restart_interrupts_direct_work_and_order_context_resets_without_rewriting(tmp_path):
    h = Harness(tmp_path / 'restart.sqlite3')
    async def run():
        mid = await started(h)
        request = direct(h, mid, order=20)
        receipt = await issue(h, mid, request)
        await ticks(h, 1)
        originals = [row[0] for row in h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence')]
        recovered = InteractiveService(h.authority, True)
        await recovered.recover()
        assert execution(h, mid, receipt.execution_ids[0]).state == 'Interrupted'
        assert recovered.lookup(request.command_id, mid) == receipt
        assert [row[0] for row in h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence LIMIT ?', (len(originals),))] == originals
        h.service = recovered
        await h.act(mid, 'acquire')
        await h.act(mid, 'resume')
        await ticks(h, 1)
        assert (await issue(h, mid, direct(h, mid, order=1))).accepted
        assert h.authority.read(mid).interactive.controls[0].last_direct_order.order == 1
    asyncio.run(run())


def test_numbering_duplicate_concurrent_creation_restart_and_rollback(tmp_path):
    path = tmp_path / 'names.sqlite3'
    h = Harness(path)
    async def run():
        a, b = await asyncio.gather(h.create('same'), h.create('same'))
        assert a == b
        assert h.authority.read(a.mission_id).mission.name == 'Demo 001'
        await h.act(a.mission_id, 'acquire')
        await h.act(a.mission_id, 'end')
        h.repo.db.execute("CREATE TRIGGER fail BEFORE INSERT ON creation_receipts BEGIN SELECT RAISE(ABORT,'rollback'); END")
        with pytest.raises(sqlite3.Error):
            await h.create('next')
        assert h.repo.db.execute('SELECT COUNT(*) FROM demo_aliases').fetchone()[0] == 1
        h.repo.db.execute('DROP TRIGGER fail')
        c, d = await asyncio.gather(h.create('next'), h.create('competing'))
        assert c.accepted and d.code == 'ACTIVE_RUN_EXISTS'
        assert h.authority.read(c.mission_id).mission.name == 'Demo 002'
        return {m.id: m.name for m in h.repo.list_missions()}
    names = asyncio.run(run())
    h.repo.close()
    restored = Harness(path)
    assert {m.id: m.name for m in restored.repo.list_missions()} == names
    assert all(restored.authority.read(mid).mission.name == name for mid, name in names.items())
    restored.repo.close()


def test_schema_two_migration_aliases_and_v12_bytes_remain_unchanged(tmp_path):
    path = tmp_path / 'legacy.sqlite3'
    h = Harness(path)
    raw = (Path(__file__).parents[2] / 'contracts/sentinel/v1.2/demo.world.json').read_text(encoding='utf-8')
    frame = LegacyMovementWorldFrame.model_validate_json(raw)
    h.repo.establish(frame.mission, frame.recording_id, frame.stream_epoch, frame.recorded_at)
    h.repo.db.execute('INSERT INTO frames VALUES (?,?,?,?,?,?)', (frame.frame_id, frame.recording_id, frame.sequence, frame.effective_at, frame.recorded_at, raw))
    h.repo.db.executescript('DROP TABLE demo_aliases; PRAGMA user_version=2;')
    h.repo.close()
    migrated = Harness(path)
    assert migrated.repo.db.execute('PRAGMA user_version').fetchone()[0] == 4
    projected = migrated.authority.read(frame.mission.id)
    assert projected.schema_version == '1.10' and projected.interactive.schema_version == '1.7'
    assert projected.mission.name == 'Demo 001'
    assert migrated.repo.list_missions()[0].name == 'Demo 001'
    assert migrated.repo.latest_text(frame.mission.id) == raw
    assert read_frame(raw).mission.name == frame.mission.name
    migrated.repo.close()


def test_legacy_v11_receipt_unchanged_and_direct_http_opaque_lookup():
    h = Harness()
    async def legacy():
        receipt = await h.create('old')
        payload, current = h.repo.receipt('old')
        value = json.loads(current)
        value['schemaVersion'] = '1.1'
        value.pop('memberOutcomes')
        value.pop('controlOutcomes');value.pop('behaviorOutcomes');value.pop('targetScope')
        raw = json.dumps(value, indent=2)
        h.repo.db.execute('UPDATE creation_receipts SET receipt_json=? WHERE creation_id=?', (raw, 'old'))
        assert json.loads(canonical(h.service.lookup('old'))) == value
        assert h.repo.receipt('old') == (payload, raw)
    asyncio.run(legacy())
    with TestClient(create_app(':memory:', False, demo_enabled=True)) as client:
        mid = client.post('/api/interactive/runs', json={'creationId': 'http', 'templateId': 'singapore-local-v1'}).json()['missionId']
        for action in ('acquire', 'start'):
            intent = client.post(f'/api/interactive/{mid}/intents', json={'action': action}).json()
            assert client.post(f'/api/interactive/{mid}/commands', json={'commandId': action, 'holderId': 'operator-one', 'intent': intent}, headers={'X-Sentinel-Control': CREDENTIAL}).json()['accepted']
        service = client.app.state.interactive
        # Source loop is independent; one real authority tick supplies initial evidence.
        asyncio.run(service.tick())
        frame = client.app.state.service.read(mid)
        helper = type('Reader', (), {'authority': client.app.state.service})()
        request = json.loads(canonical(direct(helper, mid)))
        request['commandId'] = '../opaque/ ?#%'
        result = client.post(f'/api/interactive/{mid}/direct-moves', json=request, headers={'X-Sentinel-Control': CREDENTIAL})
        assert result.status_code == 200 and result.json()['accepted']
        assert client.get(f'/api/interactive/{mid}/receipts', params={'identity': request['commandId']}).json() == result.json()
        assert CREDENTIAL not in '\n'.join(service.repository.db.iterdump())
