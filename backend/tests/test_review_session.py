"""Review setup copies saved plans exactly and never opens the source as a writer."""
import importlib.util
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('review_session', ROOT / 'scripts/review_session.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def test_copied_saved_plans_keep_exact_revisions_without_operator_recordings(tmp_path, monkeypatch):
    monkeypatch.setenv('SENTINEL_LOG_CONSOLE', '0')
    source = tmp_path / 'source.sqlite3'
    app = create_app(str(source), fixtures_enabled=True, demo_enabled=True)
    with TestClient(app) as client:
        import json
        content = json.loads((ROOT / 'frontend/tests/fixtures/scenario-20v20.json').read_text(encoding='utf-8'))
        result = client.post('/api/scenarios', json={'requestId': 'copy-plan', 'expectedRevision': 0, 'content': content})
        assert result.status_code == 200 and result.json()['accepted'], result.text
        original = result.json()['result']
    before = source.read_bytes()
    target = tmp_path / 'copy' / 'review.sqlite3'
    report = review.copy_saved_plans(source, target)
    assert report['exact_readback'] and report['saved_plans'] == report['saved_revisions'] == 1
    assert source.read_bytes() == before
    assert not any(Path(str(source) + suffix).exists() for suffix in ('-wal', '-shm', '-journal'))
    with TestClient(create_app(str(target), fixtures_enabled=False, demo_enabled=True)) as client:
        assert client.get('/api/scenarios').json()['scenarios'] == [original]
        assert client.get('/api/missions').json()['missions'] == []
    copied = target.read_bytes()
    with pytest.raises(RuntimeError, match='already exists'):
        review.copy_saved_plans(source, target)
    assert source.read_bytes() == before and target.read_bytes() == copied


def test_copy_refuses_sidecar_source_and_does_not_create_destination(tmp_path):
    source = tmp_path / 'busy.sqlite3'
    with sqlite3.connect(source) as connection:
        connection.execute('CREATE TABLE placeholder (id INTEGER)')
    Path(str(source) + '-wal').write_bytes(b'owned-by-another-process')
    target = tmp_path / 'target.sqlite3'
    with pytest.raises(RuntimeError, match='sidecars'):
        review.copy_saved_plans(source, target)
    assert not target.exists()
    assert Path(str(source) + '-wal').read_bytes() == b'owned-by-another-process'
