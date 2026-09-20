import asyncio
import hashlib
import json
import os
import sqlite3
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.recording.storage_codec import (
    MAGIC, HEADER_BYTES, MAX_DECODED_BYTES, StorageCorruptionError, encode_text, decode_text,
)
from app.recording.sqlite_repository import RecordingRepository
from app.world.serialization import canonical, read_frame
from test_interactive import Harness


def envelope(raw, *, size=None, checksum=None, compressed=None):
    return MAGIC + struct.pack('>I', len(raw) if size is None else size) + (
        hashlib.sha256(raw).digest() if checksum is None else checksum
    ) + (zlib.compress(raw) if compressed is None else compressed)


def test_exact_utf8_whitespace_and_numeric_spelling_round_trip():
    text = '{ "a": -0.0, "b": 1e-09, "text": "' + 'é北\U0001f681' * 500 + '" }\n'
    encoded = encode_text(text)
    assert isinstance(encoded, bytes) and encoded.startswith(MAGIC)
    assert len(encoded) < len(text.encode()) / 10
    assert decode_text(encoded) == text
    assert hashlib.sha256(decode_text(encoded).encode()).digest() == hashlib.sha256(text.encode()).digest()
    assert decode_text(text) is text
    assert encode_text('{}') == '{}'


@pytest.mark.parametrize('broken', [
    b'', b'SNTLZ\x02' + b'x' * 100, MAGIC, MAGIC + b'\x00' * 100,
    envelope(b'{}', size=MAX_DECODED_BYTES + 1),
    envelope(b'{}', checksum=b'\x00' * 32),
    envelope(b'{}', compressed=b'invalid'),
    envelope(b'{}')[:-1], envelope(b'{}') + b'trailing',
    envelope(b'{}') + zlib.compress(b'{}'),
    envelope(b'x' * 100000, size=3),
    envelope(b'{}', size=100), envelope(b'\xff'),
])
def test_malformed_unsupported_truncated_trailing_or_oversized_payload_fails_closed(broken):
    with pytest.raises(StorageCorruptionError):
        decode_text(broken)


def test_binary_bound_does_not_remove_legacy_text_capacity(monkeypatch):
    from app.recording import storage_codec
    monkeypatch.setattr(storage_codec, 'MAX_DECODED_BYTES', 2048)
    text = 'x' * 2049
    assert encode_text(text) == text
    with pytest.raises(StorageCorruptionError):
        decode_text(MAGIC + b'x' * (2048 + HEADER_BYTES))


def test_old_representation_is_strictly_validated_before_adaptation():
    path = Path(__file__).resolve().parents[2] / 'contracts/sentinel/v1.3/demo.world.json'
    raw = path.read_text(encoding='utf-8')
    assert canonical(read_frame(decode_text(encode_text(raw)))) == canonical(read_frame(raw))
    damaged = json.loads(raw)
    damaged['interactive']['templateId'] = 'singapore-local-v2'
    with pytest.raises(ValidationError):
        read_frame(decode_text(encode_text(json.dumps(damaged))))


def test_marker_changes_only_with_committed_encoded_write_and_rollback_keeps_publication(tmp_path, monkeypatch):
    h = Harness(tmp_path / 'owned.sqlite3')
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 4
    publish = []
    monkeypatch.setattr(h.authority, '_publish', lambda *args: publish.append(args))
    def fail(*args):
        raise sqlite3.OperationalError('injected checkpoint failure')
    original = h.repo.save_checkpoint
    monkeypatch.setattr(h.repo, 'save_checkpoint', fail)
    with pytest.raises(sqlite3.OperationalError):
        asyncio.run(h.create('owned-create'))
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 4
    assert h.repo.db.execute('SELECT count(*) FROM frames').fetchone()[0] == 0
    assert h.repo.db.execute('SELECT count(*) FROM creation_receipts').fetchone()[0] == 0
    assert publish == []
    monkeypatch.setattr(h.repo, 'save_checkpoint', original)
    created = asyncio.run(h.create('owned-create'))
    assert created.accepted
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 5
    assert h.repo.db.execute('PRAGMA synchronous').fetchone()[0] == 2
    assert h.repo.db.execute('SELECT typeof(frame_json) FROM frames').fetchone()[0] == 'blob'
    h.repo.close()


def test_mixed_text_and_binary_readers_restart_and_leave_old_bytes_untouched(tmp_path):
    path = tmp_path / 'mixed.sqlite3'
    h = Harness(path)
    async def prepare():
        created = await h.create('mixed-create')
        mid = created.mission_id
        raw = h.repo.latest_text(mid)
        checkpoint = canonical(h.repo.checkpoint(mid))
        # A disposable schema-4 copy with the historical text representation.
        h.repo.db.execute('UPDATE frames SET frame_json=?', (raw,))
        h.repo.db.execute('UPDATE interactive_checkpoints SET checkpoint_json=?', (checkpoint,))
        h.repo.db.execute('PRAGMA user_version=4')
        return mid, raw, checkpoint
    mid, raw, checkpoint = asyncio.run(prepare())
    h.repo.close()
    h = Harness(path)
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 4
    assert h.repo.latest_text(mid) == raw
    assert canonical(h.repo.checkpoint(mid)) == checkpoint
    asyncio.run(h.service.recover())
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 5
    first = h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence LIMIT 1').fetchone()[0]
    assert first == raw
    assert h.repo.text_at(mid, json.loads(raw)['frameId']) == raw
    assert h.service.frame_at(mid, json.loads(raw)['frameId']).frame_id == json.loads(raw)['frameId']
    assert h.authority.read(mid).interactive.state == 'ready'
    latest = h.repo.latest_text(mid)
    h.repo.close()
    h = Harness(path)
    assert h.repo.latest_text(mid) == latest
    asyncio.run(h.service.recover())
    assert h.repo.db.execute('SELECT frame_json FROM frames ORDER BY sequence LIMIT 1').fetchone()[0] == raw
    h.repo.close()


def test_process_exit_mid_first_transaction_preserves_empty_database_and_marker(tmp_path):
    path = tmp_path / 'interrupted.sqlite3'
    repo = RecordingRepository(str(path))
    repo.close()
    script = """
import os, sys
from app.recording.sqlite_repository import RecordingRepository
repo = RecordingRepository(sys.argv[1])
repo.db.execute('BEGIN IMMEDIATE')
repo._stored('x' * 4096)
repo.db.execute("INSERT INTO recordings VALUES ('r','m','e','2026-09-20T00:00:00.000Z','{}')")
os._exit(23)
"""
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, '-c', script, str(path)], cwd=root / 'backend',
                            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, timeout=15)
    assert result.returncode == 23
    repo = RecordingRepository(str(path))
    assert repo.db.execute('PRAGMA user_version').fetchone()[0] == 4
    assert repo.db.execute('SELECT count(*) FROM recordings').fetchone()[0] == 0
    assert repo.db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    repo.close()


def test_process_exit_mid_update_preserves_committed_frame_and_checkpoint(tmp_path):
    path = tmp_path / 'interrupted-update.sqlite3'
    h = Harness(path)
    mid = asyncio.run(h.create('before-interruption')).mission_id
    expected_frame = h.repo.latest_text(mid)
    expected_checkpoint = canonical(h.repo.checkpoint(mid))
    stored_frame = h.repo.db.execute('SELECT frame_json FROM frames').fetchone()[0]
    h.repo.close()
    script = """
import os, sys
from app.recording.sqlite_repository import RecordingRepository
repo = RecordingRepository(sys.argv[1])
repo.db.execute('BEGIN IMMEDIATE')
repo.db.execute('UPDATE frames SET frame_json=?', (repo._stored('interrupted' * 1000),))
repo.db.execute('UPDATE interactive_checkpoints SET checkpoint_json=?', (repo._stored('interrupted' * 1000),))
os._exit(24)
"""
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, '-c', script, str(path)], cwd=root / 'backend',
                            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, timeout=15)
    assert result.returncode == 24
    h = Harness(path)
    assert h.repo.latest_text(mid) == expected_frame
    assert canonical(h.repo.checkpoint(mid)) == expected_checkpoint
    assert h.repo.db.execute('SELECT frame_json FROM frames').fetchone()[0] == stored_frame
    assert h.repo.db.execute('PRAGMA user_version').fetchone()[0] == 5
    assert h.repo.db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    asyncio.run(h.service.recover())
    assert h.authority.read(mid).interactive.state == 'ready'
    h.repo.close()
