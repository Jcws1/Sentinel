"""Local application diagnostics, separate from authoritative mission recordings.

Only explicitly selected fields are logged. No headers, request bodies, credentials,
exception messages or domain payloads enter the sinks. Metrics have bounded keys
and reset when this application instance stops. Diagnostic sink failures cannot
turn a successfully committed operation into an application failure.
"""
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
from threading import Lock
import time
from uuid import uuid4


TRACE_ID = ContextVar('sentinel_trace_id', default=None)
FIELDS = frozenset({
    'trace_id', 'span_id', 'operation', 'outcome', 'code', 'error_type',
    'mission_id', 'command_id', 'definition_id', 'revision', 'frame_id',
    'sequence', 'recorded_at', 'source_at', 'action', 'run_status', 'accepted',
    'duration_ms', 'input_bytes', 'input_rows', 'timestamps', 'event_count',
    'event_types', 'issue_codes', 'unit_count', 'method', 'route', 'http_status',
    'reason', 'connection_id', 'subscriber_count', 'demo_enabled',
    'fixtures_enabled', 'interrupted_runs', 'pending', 'gap_ms', 'interval_ms',
})
MESSAGES = {
    'application.started': 'Application ready',
    'application.stopping': 'Application stopping',
    'application.recovered': 'Recorded state recovered',
    'application.start_failed': 'Application startup failed',
    'http.completed': 'HTTP request handled',
    'http.failed': 'HTTP request failed',
    'request.rejected': 'Request rejected',
    'recording.failed': 'Recording unavailable',
    'command.receipt': 'Command receipt returned; acceptance is not execution completion',
    'command.retry_returned': 'Exact retry returned the existing receipt',
    'scenario.receipt': 'Scenario save receipt returned',
    'scenario.reviewed': 'Saved scenario validation completed',
    'scenario.retry_returned': 'Exact scenario retry returned the existing receipt',
    'simulation.validated': 'External batch validated',
    'simulation.prepared': 'External command durably prepared; result pending',
    'simulation.recorded': 'External result durably recorded',
    'simulation.retry_returned': 'Exact retry returned the stored external result',
    'simulation.interrupted': 'External completion interrupted; retry the exact command',
    'world.recorded_activity': 'Recorded activity published',
    'world.snapshot_published': 'Recorded snapshot published',
    'stream.connected': 'Browser stream connected with a fresh snapshot',
    'stream.disconnected': 'Browser stream disconnected',
    'stream.resync_required': 'Slow subscriber needs a fresh snapshot',
    'stream.failed': 'Browser stream interrupted',
    'source.delayed': 'Source loop delayed',
    'source.recording_failed': 'Source recording failed; last committed state retained',
    'operation.started': 'Operation started',
    'operation.finished': 'Operation finished',
    'operation.failed': 'Operation failed',
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def clean_value(value):
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value[:256]
    if isinstance(value, (list, tuple)):
        return [clean_value(v) for v in value[:12] if isinstance(v, (str, int, float, bool))]
    return None


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(record.payload, ensure_ascii=True, allow_nan=False, separators=(',', ':'))


class ConsoleFormatter(logging.Formatter):
    def format(self, record):
        data = record.payload
        details = ' '.join(f'{key}={json.dumps(value, ensure_ascii=True)}'
                           for key, value in data.items()
                           if key not in {'timestamp', 'level', 'message', 'process_id', 'instance_id', 'event'} and value is not None)
        return f'{data["timestamp"]} {data["level"]:<7} {data["event"]}: {data["message"]} {details}'.rstrip()


class SafeConsoleHandler(logging.StreamHandler):
    def __init__(self, failure, stream=None):
        super().__init__(stream)
        self.failure = failure

    def handleError(self, record):
        self.failure()


class SafeFileHandler(RotatingFileHandler):
    def __init__(self, filename, failure):
        super().__init__(filename, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8', delay=True)
        self.failure = failure

    def handleError(self, record):
        self.failure()


class NullTelemetry:
    def event(self, *args, **kwargs):
        pass

    def count(self, *args, **kwargs):
        pass

    def timing(self, *args, **kwargs):
        pass

    def published(self, *args, **kwargs):
        pass

    def span(self, *args, **kwargs):
        return nullcontext()


NULL_TELEMETRY = NullTelemetry()


class Telemetry:
    def __init__(self, log_dir=None, console=True, stream=None):
        self.started_at = utc_now()
        self.instance_id = uuid4().hex[:12]
        self._started = time.perf_counter()
        self._lock = Lock()
        self._counters = {}
        self._timings = {}
        self._last_emit = {}
        self.file_name = None
        # A private logger avoids global handler duplication across TestClient apps.
        self.logger = logging.Logger('sentinel.application', logging.INFO)
        self.logger.propagate = False
        self.logger.addHandler(logging.NullHandler())
        if console:
            handler = SafeConsoleHandler(self._sink_failed, stream)
            handler.setFormatter(ConsoleFormatter())
            self.logger.addHandler(handler)
        if log_dir:
            try:
                directory = Path(log_dir).resolve()
                directory.mkdir(parents=True, exist_ok=True)
                self.file_name = f'application-{os.getpid()}-{self.instance_id}.jsonl'
                handler = SafeFileHandler(directory / self.file_name, self._sink_failed)
                handler.setFormatter(JsonFormatter())
                self.logger.addHandler(handler)
            except (OSError, ValueError):
                self._sink_failed()

    def _sink_failed(self):
        self.count('diagnostics.sink_failures')

    def count(self, name, value=1):
        with self._lock:
            key = name if name in self._counters or len(self._counters) < 128 else 'other'
            self._counters[key] = self._counters.get(key, 0) + value

    def timing(self, name, milliseconds):
        if not math.isfinite(milliseconds):
            return
        value = max(0, milliseconds)
        with self._lock:
            key = name if name in self._timings or len(self._timings) < 64 else 'other'
            row = self._timings.setdefault(key, dict(count=0, total=0., max=0., last=0.))
            row.update(count=row['count'] + 1, total=row['total'] + value, max=max(row['max'], value), last=value)

    def event(self, event, level=logging.INFO, min_interval=0, **fields):
        # The complete method is best-effort: instrumentation never owns a commit.
        try:
            self.count(event)
            if min_interval:
                now = time.perf_counter()
                with self._lock:
                    if now - self._last_emit.get(event, float('-inf')) < min_interval:
                        return
                    if event in self._last_emit or len(self._last_emit) < 64:
                        self._last_emit[event] = now
            payload = dict(timestamp=utc_now(), level=logging.getLevelName(level), event=event,
                           message=MESSAGES.get(event, event), process_id=os.getpid(), instance_id=self.instance_id)
            trace = TRACE_ID.get()
            if trace:
                payload['trace_id'] = trace
            payload.update({key: clean_value(value) for key, value in fields.items() if key in FIELDS and value is not None})
            self.logger.log(level, payload['message'], extra={'payload': payload})
        except Exception:
            self._sink_failed()

    @contextmanager
    def span(self, operation, **fields):
        span_id = uuid4().hex[:16]
        started = time.perf_counter()
        self.event('operation.started', operation=operation, span_id=span_id, **fields)
        try:
            yield span_id
        except BaseException as error:
            self.event('operation.failed', level=logging.ERROR, operation=operation, span_id=span_id,
                       error_type=type(error).__name__, code=getattr(error, 'code', None),
                       duration_ms=round((time.perf_counter() - started) * 1000, 3))
            raise
        else:
            self.event('operation.finished', operation=operation, span_id=span_id,
                       outcome='handler_returned', duration_ms=round((time.perf_counter() - started) * 1000, 3))
        finally:
            self.timing(operation, (time.perf_counter() - started) * 1000)

    def published(self, mission_id, message):
        try:
            self.count('world.publications')
            # Read the actual transport structure: substring checks could confuse
            # an unrelated extension's empty events with this frame's activity.
            payload = json.loads(message)
            if payload['type'] == 'snapshot':
                self.event('world.snapshot_published', mission_id=mission_id, sequence=payload.get('sequence'))
                return
            events = payload.get('changes', {}).get('events', [])
            if events:
                self.count('world.events_published', len(events))
                self.event('world.recorded_activity', mission_id=mission_id, sequence=payload.get('sequence'),
                           frame_id=payload.get('frameId'), recorded_at=payload.get('recordedAt'),
                           source_at=payload.get('effectiveAt'), event_count=len(events),
                           event_types=sorted({row['type'] for row in events}))
        except Exception:
            self.count('diagnostics.projection_failures')

    def metrics(self):
        with self._lock:
            timings = {key: dict(count=value['count'], mean=round(value['total'] / value['count'], 3),
                                max=round(value['max'], 3), last=round(value['last'], 3))
                       for key, value in self._timings.items()}
            return dict(scope='this application process; resets on restart; not mission truth',
                        started_at=self.started_at, uptime_seconds=round(time.perf_counter() - self._started, 3),
                        process_id=os.getpid(), instance_id=self.instance_id, counters=dict(self._counters),
                        durations_ms=timings, log_file=self.file_name)

    def close(self):
        for handler in self.logger.handlers[:]:
            try:
                handler.close()
            except Exception:
                self._sink_failed()
            self.logger.removeHandler(handler)


def log_receipt(telemetry, receipt, kind='command'):
    """Select receipt evidence explicitly; never serialize a complete response."""
    fields = dict(command_id=receipt.request_id, accepted=receipt.accepted, code=receipt.code)
    if kind == 'scenario':
        if receipt.result:
            fields.update(definition_id=receipt.result.definition_id, revision=receipt.result.revision)
    else:
        fields.update(operation=receipt.operation, mission_id=receipt.mission_id,
                      frame_id=receipt.frame_id, sequence=receipt.sequence, recorded_at=receipt.recorded_at)
    telemetry.event(kind + '.receipt', level=logging.INFO if receipt.accepted else logging.WARNING, **fields)
    return receipt
