"""The public reference profile affects only new local horizontal demo runs."""
import asyncio
import json
import sqlite3
from pathlib import Path

import pytest
from pydantic import ValidationError
from app.commands.contracts import CreateRunRequest
from app.commands.kinematics import CRUISE_SPEED, distance
from app.commands.service import InteractiveService
from app.domain.models import WorldFrame, LegacyRtsWorldFrame
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL
from test_direct_movement import direct, issue
from test_movement import ticks, execution, cancel


async def start_profile(h, template='singapore-local-v2'):
    request = CreateRunRequest(creation_id='profile-creation', template_id=template)
    receipt = await h.service.create(request)
    assert await h.service.create(request) == receipt
    mid = receipt.mission_id
    await h.act(mid, 'acquire')
    await h.act(mid, 'start')
    await ticks(h, 1)
    return mid


def test_new_demo_cruise_commits_positions_and_completion_beyond_admission_deadline():
    h = Harness()
    async def run():
        assert h.service.entry().template_id == 'singapore-local-v2'
        mid = await start_profile(h)
        request = direct(h, mid, longitude=103.875, latitude=1.29)
        receipt = await issue(h, mid, request)
        eid = receipt.execution_ids[0]
        before = execution(h, mid, eid)
        assert before.speed_mps == CRUISE_SPEED and before.state == 'Accepted'
        await ticks(h, 1)
        e = execution(h, mid, eid)
        committed = h.authority.read(mid).tracks[e.control_track_id].latest
        assert e.travelled_metres == pytest.approx(155 / 3.6 * .2)
        assert committed.velocity.speed_mps == CRUISE_SPEED
        assert distance(json.loads(canonical(e.origin)), json.loads(canonical(committed.position))) == pytest.approx(e.travelled_metres, abs=.001)
        assert committed.position.altitude.metres == 150 and committed.position.altitude.reference == 'ELLIPSOID'
        await ticks(h, 200)
        assert execution(h, mid, eid).state == 'Running' and h.now > before.deadline
        await ticks(h, 130)
        completed = execution(h, mid, eid)
        assert completed.state == 'Completed' and completed.completion_sample
        stored = h.repo.db.execute('SELECT frame_json FROM frames WHERE sequence=? AND recording_id=?',
                                  (completed.terminal_sequence, receipt.recording_id)).fetchone()[0]
        assert canonical(read_frame(stored).tracks[e.control_track_id].latest.position) == canonical(completed.completion_sample.position)
        assert (await h.service.direct_move(mid, request, None)) == receipt
    asyncio.run(run())


def test_profile_replacement_partial_admission_pause_cancel_and_restart_keep_speed():
    h = Harness()
    async def run():
        mid = await start_profile(h)
        first = await issue(h, mid, direct(h, mid, indices=(0,1,3)))
        assert [m.outcome for m in first.member_outcomes] == ['accepted','accepted','skipped']
        await ticks(h, 3)
        previous = h.authority.read(mid)
        invalid = await issue(h, mid, direct(h, mid, order=2, longitude=105))
        assert not invalid.accepted
        assert all(execution(h, mid, eid).state == 'Running' for eid in first.execution_ids)
        replacement = await issue(h, mid, direct(h, mid, order=3, longitude=103.84))
        new = execution(h, mid, replacement.execution_ids[0])
        assert canonical(new.origin) == canonical(previous.tracks[new.control_track_id].latest.position)
        assert new.speed_mps == CRUISE_SPEED
        assert execution(h, mid, first.execution_ids[0]).state == 'Cancelled'
        assert execution(h, mid, first.execution_ids[1]).state == 'Running'
        await ticks(h, 1)
        await h.act(mid, 'pause')
        paused = h.authority.read(mid)
        for _ in range(4):
            h.advance(10)
            await h.act(mid, 'renew')
            await h.service.tick()
        assert h.authority.read(mid).tracks == paused.tracks
        assert (await cancel(h, mid, new.id)).accepted
        await h.act(mid, 'resume')
        await ticks(h, 1)
        h.service = InteractiveService(h.authority, True)
        await h.service.recover()
        assert h.authority.read(mid).interactive.state == 'paused'
        assert execution(h, mid, first.execution_ids[1]).state == 'Interrupted'
        assert all(e.speed_mps == CRUISE_SPEED for e in h.authority.read(mid).interactive.executions)
    asyncio.run(run())


def test_new_profile_transaction_failure_does_not_advance_position_or_checkpoint():
    h = Harness()
    async def run():
        mid = await start_profile(h)
        await issue(h, mid, direct(h, mid))
        before, checkpoint = h.repo.latest_text(mid), h.repo.checkpoint(mid)
        h.repo.db.execute("CREATE TRIGGER fail_profile BEFORE INSERT ON interactive_checkpoints BEGIN SELECT RAISE(ABORT,'rollback'); END")
        with pytest.raises(sqlite3.Error):
            await ticks(h, 1)
        assert h.repo.latest_text(mid) == before and h.repo.checkpoint(mid) == checkpoint
        assert canonical(h.authority.read(mid)) == canonical(read_frame(before))
    asyncio.run(run())


def test_archived_rts_recording_is_strictly_validated_and_never_rewritten(tmp_path):
    h = Harness(tmp_path / 'legacy.sqlite3')
    raw = (Path(__file__).parents[2] / 'contracts/sentinel/v1.3/demo.world.json').read_text(encoding='utf-8')
    legacy = LegacyRtsWorldFrame.model_validate_json(raw)
    h.repo.establish(legacy.mission, legacy.recording_id, legacy.stream_epoch, legacy.recorded_at)
    h.repo.db.execute('INSERT INTO frames VALUES (?,?,?,?,?,?)', (legacy.frame_id,legacy.recording_id,legacy.sequence,legacy.effective_at,legacy.recorded_at,raw))
    adapted = h.authority.read(legacy.mission.id)
    assert adapted.schema_version == '1.4' and adapted.interactive.schema_version == '1.3'
    assert adapted.interactive.template_id == 'singapore-local-v1'
    assert h.repo.latest_text(legacy.mission.id) == raw
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 3
    invalid = json.loads(raw)
    invalid['interactive']['templateId'] = 'singapore-local-v2'
    with pytest.raises(ValidationError):
        read_frame(json.dumps(invalid))


@pytest.mark.parametrize('template,speed', [('singapore-local-v1',20.0),('singapore-local-v2',CRUISE_SPEED)])
def test_template_speed_is_validated_and_retained_through_restart(template, speed):
    h = Harness()
    async def run():
        mid = await start_profile(h, template)
        receipt = await issue(h, mid, direct(h, mid))
        await ticks(h, 1)
        e = execution(h, mid, receipt.execution_ids[0])
        assert e.speed_mps == speed and e.travelled_metres == speed * .2
        original = h.repo.latest_text(mid)
        frame = json.loads(original)
        frame['interactive']['executions'][0]['speedMps'] = 20 if speed != 20 else CRUISE_SPEED
        with pytest.raises(ValidationError, match='speed differs'):
            WorldFrame.model_validate(frame)
        h.service = InteractiveService(h.authority, True)
        await h.service.recover()
        assert execution(h, mid, e.id).speed_mps == speed
        stored = h.repo.db.execute('SELECT frame_json FROM frames WHERE frame_id=?', (json.loads(original)['frameId'],)).fetchone()[0]
        assert stored == original
    asyncio.run(run())
