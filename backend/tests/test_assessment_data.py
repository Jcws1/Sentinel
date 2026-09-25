"""Reproducible neutral input variations through the real ingestion boundary."""
from datetime import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from app.adapters.simulation_v1.projection import mission_identity
from app.simulation.validation import validate_request, SimulationError

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('assessment_data', ROOT / 'scripts/assessment_data.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def test_generator_is_repeatable_with_real_changes_and_a_verifiable_manifest():
    baseline, variant, invalid, manifest = generator.create_datasets()
    assert generator.create_datasets() == (baseline, variant, invalid, manifest)
    assert generator.create_datasets(seed=1)[1] != variant
    assert manifest['baseline_rows'] == 240
    assert manifest['variant_rows'] == 216
    assert len(manifest['removed_observations']) == 24
    assert len(manifest['expected_final_unobserved']) == 5
    for name, value in [('baseline.json', baseline), ('variant.json', variant), ('invalid.json', invalid)]:
        assert manifest['files'][name]['sha256'] == hashlib.sha256(generator.encoded(value)).hexdigest()
    baseline_times = list(baseline['samples_by_timestamp'])
    variant_times = list(variant['samples_by_timestamp'])
    removed = {(row['variant_timestamp'], row['drone_id']) for row in manifest['removed_observations']}
    assert len(removed) == 24
    for before_at, after_at in zip(baseline_times, variant_times):
        assert (datetime.fromisoformat(after_at.replace('Z', '+00:00')) - datetime.fromisoformat(before_at.replace('Z', '+00:00'))).total_seconds() == 60
        before = {row['drone_id']: row for row in baseline['samples_by_timestamp'][before_at]}
        after = {row['drone_id']: row for row in variant['samples_by_timestamp'][after_at]}
        assert set(before) - set(after) == {identity for at, identity in removed if at == after_at}
        for identity, changed in after.items():
            original = before[identity]
            north = math.radians(changed['latitude_deg'] - original['latitude_deg']) * 6371008.8
            east = math.radians(changed['longitude_deg'] - original['longitude_deg']) * 6371008.8 * math.cos(math.radians(1.35))
            assert 1995 - 1e-6 <= north <= 2005 + 1e-6
            assert abs(east) <= 5 + 1e-6
            assert all(changed[key] == original[key] for key in ('altitude_m', 'class', 'team', 'health', 'status'))
    assert len(next(iter(variant['samples_by_timestamp'].values()))) == 40
    validate_request(baseline)
    validate_request(variant)
    with pytest.raises(SimulationError):
        validate_request(invalid)


@pytest.mark.parametrize('options', [
    {'units': 0}, {'units': 41}, {'timestamps': 1}, {'timestamps': 21},
    {'seed': -1}, {'seed': 2**32}, {'drop_rate': -.1}, {'drop_rate': .9},
    {'drop_rate': .8, 'timestamps': 2}, {'north_m': float('nan')},
    {'jitter_m': 26}, {'east_m': 100001}, {'time_shift_s': 86401}, {'run_id': '../unsafe'},
])
def test_generator_rejects_invalid_variation_controls(options):
    with pytest.raises(ValueError):
        generator.create_datasets(**options)


@pytest.mark.parametrize('options', [
    {'units': 1, 'timestamps': 2, 'drop_rate': .5},
    {'units': 40, 'timestamps': 20, 'drop_rate': .8, 'jitter_m': 25, 'east_m': -100000, 'north_m': 100000},
    {'seed': 0, 'drop_rate': 0, 'jitter_m': 0, 'time_shift_s': -86400},
])
def test_supported_generator_edges_remain_valid_inputs(options):
    baseline, variant, _, _ = generator.create_datasets(**options)
    validate_request(baseline)
    validate_request(variant)


def test_variation_ingestion_preserves_gaps_and_exact_retry_without_false_changes(tmp_path, monkeypatch):
    monkeypatch.setenv('SENTINEL_LOG_CONSOLE', '0')
    baseline, variant, invalid, manifest = generator.create_datasets()
    app = create_app(str(tmp_path / 'assessment.sqlite3'), fixtures_enabled=False, demo_enabled=False)
    with TestClient(app) as client:
        worlds = {}
        for body in (baseline, variant):
            result = client.post('/api/simulation/v1/commands', json=body)
            assert result.status_code == 200
            assert result.json()['command_ack']['status'] == 'SUCCEEDED'
            assert all(not row['interactions'] for row in result.json()['results_by_timestamp'].values())
            url = '/api/missions/' + mission_identity(body['mission_id']) + '/world'
            worlds[body['mission_id']] = client.get(url).json()
            # Duplicate input has byte-identical output and no extra recording frame.
            frame_count = app.state.service.repository.recording_for(mission_identity(body['mission_id'])).frame_count
            again = client.post('/api/simulation/v1/commands', json=body)
            assert again.content == result.content
            assert app.state.service.repository.recording_for(mission_identity(body['mission_id'])).frame_count == frame_count
            assert client.get(url).json() == worlds[body['mission_id']]
        world = worlds[variant['mission_id']]
        assert len(world['entities']) == len(world['tracks']) == 40
        unobserved = {entity['label'] for entity in world['entities'].values() if entity['presence'] == 'unobserved'}
        assert unobserved == set(manifest['expected_final_unobserved'])
        latest_at, last_rows = next(reversed(variant['samples_by_timestamp'].items()))
        for track in world['tracks'].values():
            entity = world['entities'][track['entityId']]
            if entity['label'] in unobserved:
                assert track['state'] == 'stale'
                assert track['latest']['timestamp'] < latest_at
            else:
                row = next(row for row in last_rows if row['drone_id'] == entity['label'])
                assert track['latest']['timestamp'] == latest_at
                assert track['latest']['position']['latitudeDeg'] == row['latitude_deg']
                assert track['latest']['position']['longitudeDeg'] == row['longitude_deg']
        before_catalog = client.get('/api/missions').json()
        rejected = client.post('/api/simulation/v1/commands', json=invalid)
        assert rejected.status_code == 422
        assert client.get('/api/missions').json() == before_catalog
        assert not app.state.service.repository.has_mission(mission_identity(invalid['mission_id']))


def test_cli_keeps_existing_review_inputs(tmp_path):
    command = [sys.executable, str(ROOT / 'scripts/assessment_data.py'), '--output', str(tmp_path / 'inputs')]
    first = subprocess.run(command, capture_output=True, text=True)
    assert first.returncode == 0, first.stderr
    contents = {path.name: path.read_bytes() for path in (tmp_path / 'inputs').iterdir()}
    second = subprocess.run([*command, '--seed', '42'], capture_output=True, text=True)
    assert second.returncode != 0 and 'not empty' in second.stderr
    assert {path.name: path.read_bytes() for path in (tmp_path / 'inputs').iterdir()} == contents
