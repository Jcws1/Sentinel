import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.recording import observation_cache as module
from app.recording.observation_cache import HistoryFrameCache, observe_frame
from app.recording.storage_codec import StorageCorruptionError, encode_text
from app.world.serialization import canonical, read_frame
from app.recording.sqlite_repository import RecordingRepository
from test_observed_history import seed, MID, EID


def test_legacy_and_compressed_frames_preserve_full_validation():
    raw = (Path(__file__).resolve().parents[2] / 'contracts/sentinel/v1.3/demo.world.json').read_text(encoding='utf-8')
    frame = read_frame(raw)
    eid = next(iter(frame.entities))
    cache = HistoryFrameCache()
    expected = canonical(observe_frame(frame, eid))
    for stored in (raw, encode_text(raw)):
        assert canonical(cache.read(stored, eid)) == expected
        assert canonical(cache.read(stored, eid)) == expected
    assert cache.inspect()['hits'] == 2
    damaged = json.loads(raw)
    damaged['interactive']['templateId'] = 'singapore-local-v2'
    with pytest.raises(ValidationError):
        cache.read(json.dumps(damaged), eid)
    binary = encode_text(raw)
    assert isinstance(binary, bytes)
    with pytest.raises(StorageCorruptionError):
        cache.read(binary[:-1], eid)


def test_hit_returns_fresh_data_and_changes_under_same_identity_are_revalidated(world):
    raw = json.dumps(world)
    frame = read_frame(raw)
    eid = next(iter(frame.entities))
    cache = HistoryFrameCache()
    result = cache.read(raw, eid)
    expected = canonical(result)
    result.tracks.clear()
    assert canonical(cache.read(raw, eid)) == expected
    # Corrupt an unrelated field, retaining identical mission/frame/sequence IDs.
    changed = json.loads(raw)
    changed['mission']['name'] = 42
    with pytest.raises(ValidationError):
        cache.read(json.dumps(changed), eid)
    assert cache.inspect()['entries'] == 1


def test_selected_entity_and_exact_frame_bytes_separate_entries(world):
    raw = json.dumps(world)
    frame = read_frame(raw)
    cache = HistoryFrameCache()
    eid = next(iter(frame.entities))
    assert cache.read(raw, eid).tracks
    assert cache.read(raw, 'unknown').tracks == {}
    changed = json.loads(raw)
    changed['mission']['name'] += ' revised'
    cache.read(json.dumps(changed), eid)
    assert cache.inspect()['entries'] == 3


def test_entry_lru_and_byte_limits(monkeypatch, world):
    raw = json.dumps(world)
    cache = HistoryFrameCache()
    monkeypatch.setattr(module, 'MAX_CACHE_ENTRIES', 2)
    for eid in ('one', 'two', 'one', 'three'):
        cache.read(raw, eid)
    assert cache.inspect()['entries'] == 2
    assert cache.inspect()['hits'] == 1
    cache.read(raw, 'two')  # least recently used was evicted
    assert cache.inspect()['misses'] == 4
    size = len(cache.read(raw, 'two').model_dump_json(by_alias=True).encode('utf-8'))
    cache.clear()
    monkeypatch.setattr(module, 'MAX_CACHE_BYTES', size)
    cache.read(raw, 'one')
    cache.read(raw, 'two')
    assert cache.inspect()['entries'] == 1
    assert cache.inspect()['bytes'] <= size
    cache.clear()
    monkeypatch.setattr(module, 'MAX_CACHE_BYTES', 1)
    cache.read(raw, 'one')
    assert cache.inspect()['entries'] == cache.inspect()['bytes'] == 0


def test_overlapping_readers_share_validation_without_mutable_aliases(world, monkeypatch):
    cache = HistoryFrameCache()
    raw = json.dumps(world)
    eid = next(iter(read_frame(raw).entities))
    original = module.read_frame
    calls = []
    def counted(text):
        calls.append(text)
        return original(text)
    monkeypatch.setattr(module, 'read_frame', counted)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: cache.read(raw, eid), range(8)))
    assert len(calls) == 1
    assert cache.inspect()['hits'] == 7
    results[0].tracks.clear()
    assert all(r.tracks for r in results[1:])


def test_successfully_committed_exact_bytes_reuse_full_validation_proof(monkeypatch):
    repo = RecordingRepository(':memory:')
    try:
        service = seed(repo)
        frame = service.read(MID)
        def unexpected(text):
            raise AssertionError('already fully validated committed bytes were revalidated')
        original = module.read_frame
        monkeypatch.setattr(module, 'read_frame', unexpected)
        proven = repo.observed_history(MID, EID, frame.frame_id, 60).model_dump_json()
        repo._history_frames.clear()  # simulates a new process or evicted validation proof
        monkeypatch.setattr(module, 'read_frame', original)
        strict = repo.observed_history(MID, EID, frame.frame_id, 60).model_dump_json()
        assert proven == strict
        assert repo._history_frames.inspect()['committed_proofs'] == 0
    finally:
        repo.close()


def test_outer_transaction_installs_proofs_only_after_success_and_discards_rollback():
    repo = RecordingRepository(':memory:')
    try:
        with pytest.raises(RuntimeError, match='rollback probe'):
            with repo.transaction():
                seed(repo)
                assert repo._history_frames.inspect()['committed_proofs'] == 0
                raise RuntimeError('rollback probe')
        assert repo._history_frames.inspect()['committed_proofs'] == 0
        assert repo.db.execute('SELECT COUNT(*) FROM frames').fetchone()[0] == 0
        with repo.transaction():
            seed(repo)
            assert repo._history_frames.inspect()['committed_proofs'] == 0
        assert repo._history_frames.inspect()['committed_proofs'] > 0
        assert repo._pending_history_proofs is None
    finally:
        repo.close()


def test_proven_frame_changed_in_unrelated_field_cannot_bypass_validation():
    repo = RecordingRepository(':memory:')
    try:
        service = seed(repo)
        anchor = service.read(MID)
        repo.observed_history(MID, EID, anchor.frame_id, 60)  # warm both paths
        raw = json.loads(repo.latest_text(MID))
        before = repo._history_frames.inspect()['committed_proofs']
        raw['mission']['name'] = 42
        with pytest.raises(ValidationError):
            repo.commit(json.dumps(raw), [])
        assert repo._history_frames.inspect()['committed_proofs'] == before
        # Keep a valid anchor but corrupt an earlier row under its existing ID.
        row = repo.db.execute('SELECT frame_id,frame_json FROM frames WHERE recording_id=? ORDER BY sequence LIMIT 1', (anchor.recording_id,)).fetchone()
        from app.recording.storage_codec import decode_text
        value = json.loads(decode_text(row[1]))
        value['mission']['name'] = 42
        repo.db.execute('UPDATE frames SET frame_json=? WHERE frame_id=?', (json.dumps(value), row[0]))
        with pytest.raises(ValidationError):
            repo.observed_history(MID, EID, anchor.frame_id, 60)
    finally:
        repo.close()


def test_proof_limit_and_writer_metadata_never_wait_for_history_projection_lock(monkeypatch):
    cache = HistoryFrameCache()
    monkeypatch.setattr(module, 'MAX_COMMITTED_PROOFS', 2)
    values = [bytes([i]) * 32 for i in range(3)]
    # Holding a history projection must not make the writer wait for its decoder.
    with ThreadPoolExecutor(max_workers=1) as pool:
        with cache._lock:
            pool.submit(cache.remember_committed, values).result(timeout=1)
    assert cache.inspect()['committed_proofs'] == 2
    assert not cache._was_committed(values[0])
    assert cache._was_committed(values[1]) and cache._was_committed(values[2])
