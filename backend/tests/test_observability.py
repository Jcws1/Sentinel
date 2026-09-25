"""Application diagnostic evidence: truth, retry identity, privacy and sink failure."""
import io
import json
import logging
from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from app.observability import Telemetry, TRACE_ID

ROOT = Path(__file__).resolve().parents[2]


def read_events(path):
    return [json.loads(line) for file in sorted(path.glob('*.jsonl')) for line in file.read_text(encoding='utf-8').splitlines()]


@pytest.fixture
def diagnostics_app(tmp_path, monkeypatch):
    logs = tmp_path / 'application-logs'
    monkeypatch.setenv('SENTINEL_LOG_DIR', str(logs))
    monkeypatch.setenv('SENTINEL_LOG_CONSOLE', '0')
    app = create_app(str(tmp_path / 'observability.sqlite3'), fixtures_enabled=True, demo_enabled=True)
    with TestClient(app) as client:
        yield app, client, logs


def golden():
    return (ROOT / 'contracts/simulation/fixtures/golden.request.json').read_bytes()


def test_logs_are_one_line_allowlisted_and_share_trace_with_console(tmp_path):
    stream = io.StringIO()
    telemetry = Telemetry(tmp_path, stream=stream)
    token = TRACE_ID.set('trace-unit-test')
    try:
        telemetry.event('request.rejected', level=logging.WARNING, code='INVALID_REQUEST',
                        command_id='line1\nline2', secret='PRIVATE-SECRET', body={'password': 'PRIVATE-BODY'},
                        authorization='PRIVATE-AUTH', duration_ms=float('nan'))
    finally:
        TRACE_ID.reset(token)
        telemetry.close()
    text = stream.getvalue()
    events = read_events(tmp_path)
    assert len(text.splitlines()) == len(events) == 1
    assert events[0]['trace_id'] == 'trace-unit-test'
    assert events[0]['command_id'] == 'line1\nline2'
    assert events[0]['duration_ms'] is None
    assert 'PRIVATE' not in text + json.dumps(events)
    assert 'INVALID_REQUEST' in text


def test_operation_spans_keep_identity_and_monotonic_timing(tmp_path):
    telemetry = Telemetry(tmp_path, console=False)
    with telemetry.span('validation'):
        telemetry.event('simulation.validated', input_rows=3, timestamps=2)
    with pytest.raises(ValueError):
        with telemetry.span('broken'):
            raise ValueError('PRIVATE-EXCEPTION-CONTENT')
    result = telemetry.metrics()
    telemetry.close()
    events = read_events(tmp_path)
    first = [e for e in events if e.get('operation') == 'validation']
    assert [e['event'] for e in first] == ['operation.started', 'operation.finished']
    assert first[0]['span_id'] == first[1]['span_id']
    assert first[-1]['duration_ms'] >= 0
    assert result['durations_ms']['broken']['count'] == 1
    assert 'PRIVATE-EXCEPTION-CONTENT' not in json.dumps(events)


def test_metrics_are_bounded_and_rate_limited_events_still_count(tmp_path):
    telemetry = Telemetry(tmp_path, console=False)
    for i in range(400):
        telemetry.count(f'key-{i}')
        telemetry.timing(f'timing-{i}', i)
    telemetry.event('source.delayed', min_interval=60, gap_ms=1200)
    telemetry.event('source.delayed', min_interval=60, gap_ms=1300)
    result = telemetry.metrics()
    telemetry.close()
    assert len(result['counters']) <= 129
    assert len(result['durations_ms']) <= 65
    assert sum(row['count'] for row in result['durations_ms'].values()) == 400
    assert len([e for e in read_events(tmp_path) if e['event'] == 'source.delayed']) == 1


def test_http_rejection_logs_no_body_query_or_control_credential(diagnostics_app):
    app, client, logs = diagnostics_app
    response = client.post('/api/interactive/runs?private=PRIVATE-QUERY',
                           json={'creationId': 'reject-log', 'templateId': 'singapore-local-v2', 'private': 'PRIVATE-BODY'},
                           headers={'X-Sentinel-Control': 'PRIVATE-CONTROL-' + 'a' * 64})
    assert response.status_code == 422
    trace = response.headers['X-Sentinel-Trace']
    rows = [e for e in read_events(logs) if e.get('trace_id') == trace]
    assert any(e['event'] == 'request.rejected' and e['code'] == 'INVALID_REQUEST' for e in rows)
    assert any(e['event'] == 'http.completed' and e['http_status'] == 422 for e in rows)
    assert 'PRIVATE-' not in json.dumps(rows)
    assert not any(e['event'] == 'command.receipt' for e in rows)


def test_command_receipt_is_logged_after_commit_and_retry_is_distinct(diagnostics_app):
    app, client, logs = diagnostics_app
    body = {'creationId': 'logging-create', 'templateId': 'singapore-local-v2'}
    first = client.post('/api/interactive/runs', json=body)
    assert first.status_code == 200 and first.json()['accepted']
    mission = first.json()['missionId']
    before = app.state.service.repository.recording_for(mission).frame_count
    second = client.post('/api/interactive/runs', json=body)
    assert second.content == first.content
    assert app.state.service.repository.recording_for(mission).frame_count == before
    events = read_events(logs)
    receipts = [e for e in events if e['event'] == 'command.receipt' and e.get('command_id') == 'logging-create']
    assert len(receipts) == 2 and all(e['accepted'] for e in receipts)
    assert all(e['frame_id'] == first.json()['frameId'] for e in receipts)
    assert any(e['event'] == 'command.retry_returned' and e.get('command_id') == 'logging-create' for e in events)


def test_failed_recording_has_no_committed_publication_log(diagnostics_app):
    app, client, logs = diagnostics_app
    before = client.get('/api/missions/fixture-alpha/world').json()
    app.state.service.repository.db.execute("CREATE TRIGGER fail_logging_frame BEFORE INSERT ON frames BEGIN SELECT RAISE(ABORT, 'PRIVATE-DISK-ERROR'); END")
    response = client.post('/api/fixtures/fixture-alpha/advance', json={'expectedSequence': before['sequence']})
    assert response.status_code == 503
    assert client.get('/api/missions/fixture-alpha/world').json()['sequence'] == before['sequence']
    trace = response.headers['X-Sentinel-Trace']
    events = [e for e in read_events(logs) if e.get('trace_id') == trace]
    assert any(e['event'] == 'recording.failed' for e in events)
    assert not any(e['event'] in {'world.recorded_activity', 'world.snapshot_published'} for e in events)
    assert 'PRIVATE-DISK-ERROR' not in json.dumps(events)


def test_external_exact_retry_logs_one_preparation_and_completion(diagnostics_app):
    app, client, logs = diagnostics_app
    first = client.post('/api/simulation/v1/commands', content=golden())
    assert first.status_code == 200
    second = client.post('/api/simulation/v1/commands', content=golden())
    assert second.content == first.content
    rows = [e for e in read_events(logs) if e.get('command_id') == 'CMD-0001']
    assert sum(e['event'] == 'simulation.prepared' for e in rows) == 1
    assert sum(e['event'] == 'simulation.recorded' for e in rows) == 1
    assert sum(e['event'] == 'simulation.retry_returned' for e in rows) == 1
    completed = next(e for e in rows if e['event'] == 'simulation.recorded')
    assert completed['trace_id'] == first.headers['X-Sentinel-Trace']
    assert app.state.simulation.journal.command('CMD-0001')['state'] == 'completed'


def test_external_failed_completion_is_pending_then_exact_retry_records(diagnostics_app, monkeypatch):
    app, client, logs = diagnostics_app
    complete = app.state.simulation._complete
    def unavailable(*args, **kwargs):
        raise sqlite3.OperationalError('PRIVATE-RECORDING-FAILURE')
    monkeypatch.setattr(app.state.simulation, '_complete', unavailable)
    response = client.post('/api/simulation/v1/commands', content=golden())
    assert response.status_code == 503
    rows = read_events(logs)
    assert any(e['event'] == 'simulation.prepared' for e in rows)
    assert any(e['event'] == 'simulation.interrupted' for e in rows)
    assert not any(e['event'] == 'simulation.recorded' for e in rows)
    assert 'PRIVATE-RECORDING-FAILURE' not in json.dumps(rows)
    assert app.state.simulation.journal.command('CMD-0001')['state'] == 'interrupted'
    monkeypatch.setattr(app.state.simulation, '_complete', complete)
    recovered = client.post('/api/simulation/v1/commands', content=golden())
    assert recovered.status_code == 200
    assert sum(e['event'] == 'simulation.recorded' for e in read_events(logs)) == 1


def test_broken_log_sink_does_not_change_authoritative_success(diagnostics_app):
    app, client, logs = diagnostics_app
    class Broken(logging.Handler):
        def emit(self, record):
            raise OSError('PRIVATE-SINK-ERROR')
    broken = Broken()
    app.state.telemetry.logger.addHandler(broken)
    result = client.post('/api/interactive/runs', json={'creationId': 'sink-failure', 'templateId': 'singapore-local-v2'})
    assert result.status_code == 200 and result.json()['accepted']
    frame = client.get('/api/missions/' + result.json()['missionId'] + '/world').json()
    assert frame['frameId'] == result.json()['frameId']
    assert app.state.telemetry.metrics()['counters']['diagnostics.sink_failures'] > 0


def test_local_metrics_report_real_activity_without_domain_payloads(diagnostics_app):
    app, client, logs = diagnostics_app
    response = client.post('/api/simulation/v1/commands', content=golden())
    assert response.status_code == 200
    result = client.get('/api/diagnostics/metrics')
    assert result.status_code == 200
    metrics = result.json()
    assert metrics['counters']['simulation.recorded'] == 1
    assert metrics['durations_ms']['simulation.submit']['count'] == 1
    assert metrics['durations_ms']['simulation.submit']['max'] >= 0
    assert metrics['log_file'].endswith('.jsonl')
    assert 'samples_by_timestamp' not in result.text
    assert '/api/diagnostics/metrics' not in client.get('/openapi.json').json()['paths']


def test_stream_logs_actual_connection_and_cleanup(diagnostics_app):
    app, client, logs = diagnostics_app
    with client.websocket_connect('/api/missions/fixture-alpha/stream') as websocket:
        assert websocket.receive_json()['type'] == 'snapshot'
    assert app.state.service.subscriber_count('fixture-alpha') == 0
    events = read_events(logs)
    opened = [e for e in events if e['event'] == 'stream.connected']
    closed = [e for e in events if e['event'] == 'stream.disconnected']
    assert len(opened) == len(closed) == 1
    assert opened[0]['connection_id'] == closed[0]['connection_id']
    assert closed[0]['subscriber_count'] == 0


def test_source_recording_failure_is_visible_without_claiming_a_commit(diagnostics_app, monkeypatch):
    app, client, logs = diagnostics_app
    async def unavailable():
        raise sqlite3.OperationalError('PRIVATE-TICK-ERROR')
    monkeypatch.setattr(app.state.interactive, 'tick', unavailable)
    deadline = time.monotonic() + 3
    while not app.state.telemetry.metrics()['counters'].get('source.recording_failed'):
        assert time.monotonic() < deadline, 'Source error was not observed'
        time.sleep(.02)
    events = read_events(logs)
    assert any(e['event'] == 'source.recording_failed' and e['error_type'] == 'OperationalError' for e in events)
    assert 'PRIVATE-TICK-ERROR' not in json.dumps(events)


def test_diagnostic_projection_uses_actual_event_array(tmp_path):
    telemetry = Telemetry(tmp_path, console=False)
    telemetry.published('test-mission', json.dumps({'type': 'delta', 'sequence': 1, 'frameId': 'frame-1',
        'changes': {'events': [{'type': 'recorded-test'}], 'mission': {'extensions': {'test': {'events': []}}}}}, separators=(',', ':')))
    telemetry.close()
    rows = read_events(tmp_path)
    assert len(rows) == 1
    assert rows[0]['event_types'] == ['recorded-test']
