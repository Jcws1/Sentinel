import asyncio
import json
import sqlite3
from copy import deepcopy

import pytest

from app.domain.models import WorldFrame
from app.missions.fixtures import fixture_mission, fixture_source, instant, seed_fixtures, advance_fixture
from app.missions.service import MissionService, SequenceConflict
from app.recording.sqlite_repository import RecordingRepository
from app.world.serialization import canonical


def test_recording_precedes_source_and_survives_failed_first_frame(tmp_path):
    path = str(tmp_path / "world.sqlite")
    repository = RecordingRepository(path)
    service = MissionService(repository)
    called = []
    def build(previous):
        called.append(repository.recording_for("fixture-alpha"))
        raise ValueError("source validation failed")
    async def exercise():
        with pytest.raises(KeyError):
            await service.commit_source("fixture-alpha", build)
        assert not called
        await service.establish(fixture_mission("fixture-alpha"))
        with pytest.raises(ValueError):
            await service.commit_source("fixture-alpha", build)
        assert called[0].frame_count == 0
    asyncio.run(exercise())
    repository.close()
    recovered = RecordingRepository(path)
    assert recovered.recording_for("fixture-alpha").frame_count == 0
    recovered.close()


def test_commit_rollback_no_publish_and_snapshots_immutable(tmp_path):
    repository = RecordingRepository(str(tmp_path / "world.sqlite"))
    service = MissionService(repository)
    async def exercise():
        await seed_fixtures(service)
        old = service.read("fixture-alpha")
        initial_text = repository.latest_text("fixture-alpha")
        old.entities.clear()
        assert service.read("fixture-alpha").entities
        snapshot, subscription = await service.subscribe("fixture-alpha")
        frame = await advance_fixture(service, "fixture-alpha", 0)
        assert json.loads(snapshot)["sequence"] == 0
        queued = await subscription.queue.get()
        assert json.loads(queued)["sequence"] == frame.sequence == 1
        assert repository.latest_text("fixture-alpha") != initial_text
        frame.entities.clear()
        assert service.read("fixture-alpha").entities
        saved = repository.latest_text("fixture-alpha")
        repository.db.execute("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
        with pytest.raises(sqlite3.IntegrityError):
            await advance_fixture(service, "fixture-alpha", 1)
        assert subscription.queue.empty()
        assert repository.latest_text("fixture-alpha") == saved
        assert repository.recording_for("fixture-alpha").frame_count == 2
        assert repository.recording_for("fixture-alpha").event_count == 2
        service.unsubscribe("fixture-alpha", subscription)
    asyncio.run(exercise())
    repository.close()


def test_initial_snapshot_commit_race_no_missing_or_duplicate_frames():
    repository = RecordingRepository(":memory:")
    service = MissionService(repository)
    async def exercise():
        await seed_fixtures(service)
        for index in range(20):
            if index % 2:
                commit_task = asyncio.create_task(advance_fixture(service, "fixture-alpha", index))
                subscribe_task = asyncio.create_task(service.subscribe("fixture-alpha"))
            else:
                subscribe_task = asyncio.create_task(service.subscribe("fixture-alpha"))
                commit_task = asyncio.create_task(advance_fixture(service, "fixture-alpha", index))
            frame = await commit_task
            snapshot, subscription = await subscribe_task
            sequence = json.loads(snapshot)["sequence"]
            if sequence == index:
                message = json.loads(await subscription.queue.get())
                assert (message["previousSequence"], message["sequence"]) == (index, index + 1)
            else:
                assert sequence == frame.sequence
                assert subscription.queue.empty()
            service.unsubscribe("fixture-alpha", subscription)
    asyncio.run(exercise())
    repository.close()


def test_mission_isolation_conflict_and_slow_subscriber_resync():
    repository = RecordingRepository(":memory:")
    service = MissionService(repository, queue_size=1)
    async def exercise():
        await seed_fixtures(service)
        _, alpha = await service.subscribe("fixture-alpha")
        _, bravo = await service.subscribe("fixture-bravo")
        await advance_fixture(service, "fixture-alpha", 0)
        with pytest.raises(SequenceConflict):
            await advance_fixture(service, "fixture-alpha", 0)
        await advance_fixture(service, "fixture-alpha", 1)
        assert json.loads(await alpha.queue.get())["type"] == "resync-required"
        assert bravo.queue.empty()
        assert service.subscriber_count("fixture-alpha") == 0
        assert service.read("fixture-bravo").sequence == 0
        service.unsubscribe("fixture-bravo", bravo)
    asyncio.run(exercise())
    repository.close()


def test_independent_event_sequence_recent_bound_and_late_effective_time():
    repository = RecordingRepository(":memory:")
    service = MissionService(repository)
    async def exercise():
        await seed_fixtures(service)
        def source(previous):
            frame, events = fixture_source("fixture-alpha", 1, service.clock())
            frame["effectiveAt"] = "2025-01-01T00:00:00.000Z"
            for track in frame["tracks"].values():
                track["latest"]["timestamp"] = frame["effectiveAt"]
            events = [deepcopy(events[0]) for _ in range(105)]
            return frame, events
        result = await service.commit_source("fixture-alpha", source, 0)
        assert result.sequence == 1
        assert len(result.recent_events) == 100
        assert result.recent_events[0].sequence == 6
        assert result.recent_events[-1].sequence == 105
        assert repository.recording_for("fixture-alpha").event_count == 106
        assert len(repository.events_after("fixture-alpha", -1, 500)) == 106
    asyncio.run(exercise())
    repository.close()


def test_persisted_recovery_identity_and_idempotent_seed(tmp_path):
    path = str(tmp_path / "world.sqlite")
    repository = RecordingRepository(path)
    service = MissionService(repository)
    async def before_restart():
        await seed_fixtures(service)
        await advance_fixture(service, "fixture-alpha", 0)
    asyncio.run(before_restart())
    saved = repository.latest_text("fixture-alpha")
    metadata = repository.recording_for("fixture-alpha")
    repository.close()
    recovered = RecordingRepository(path)
    recovered_service = MissionService(recovered)
    async def after_restart():
        await seed_fixtures(recovered_service)
        assert recovered.latest_text("fixture-alpha") == saved
        assert recovered.recording_for("fixture-alpha") == metadata
        snapshot, sub = await recovered_service.subscribe("fixture-alpha")
        assert json.loads(snapshot)["sequence"] == 1
        updated = await advance_fixture(recovered_service, "fixture-alpha", 1)
        assert updated.stream_epoch == metadata.stream_epoch
        assert updated.sequence == 2
        recovered_service.unsubscribe("fixture-alpha", sub)
    asyncio.run(after_restart())
    recovered.close()


def test_recorded_nested_model_update_cannot_bypass_validation(world):
    repository = RecordingRepository(":memory:")
    frame = WorldFrame.model_validate_json(json.dumps(world))
    repository.establish(frame.mission, frame.recording_id, frame.stream_epoch, frame.recorded_at)
    invalid = frame.model_copy(update={"sequence": -1})
    with pytest.raises(ValueError):
        repository.commit(canonical(invalid), [world["recentEvents"][0]])
    assert repository.latest_text(frame.mission.id) is None
    repository.close()


def test_journal_event_outside_recent_window_still_checks_references():
    repository = RecordingRepository(":memory:")
    service = MissionService(repository)
    async def exercise():
        await seed_fixtures(service)
        def source(previous):
            frame, event = fixture_source("fixture-alpha", 1, service.clock())
            events = [deepcopy(event[0]) for _ in range(101)]
            events[0]["entityIds"] = ["dangling"]
            return frame, events
        with pytest.raises(ValueError, match="dangling"):
            await service.commit_source("fixture-alpha", source, 0)
        assert service.read("fixture-alpha").sequence == 0
    asyncio.run(exercise())
    repository.close()
