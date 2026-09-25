"""Prepare copied saved plans, then launch a local review with visible application logs.

From the repository root:
  backend/.venv/Scripts/python.exe scripts/review_session.py prepare
  backend/.venv/Scripts/python.exe scripts/review_session.py start --open
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'test-results/assessment/demo'
DATABASE = DEMO / 'sentinel.sqlite3'


def free_port(port):
    with socket.socket() as server:
        try:
            server.bind(('127.0.0.1', port))
        except OSError:
            raise RuntimeError(f'Port {port} is occupied. Close its existing server or choose another port; nothing was stopped.') from None


def file_identity(path):
    stat = path.stat()
    return dict(bytes=stat.st_size, mtime_ns=stat.st_mtime_ns)


def copy_saved_plans(source, destination):
    """Read a stopped, sidecar-free SQLite file without opening it as a writer."""
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file():
        raise RuntimeError(f'Saved-plan source does not exist: {source}')
    if destination.exists():
        raise RuntimeError(f'Review database already exists and was preserved: {destination}')
    if any(Path(str(source) + suffix).exists() for suffix in ('-wal', '-shm', '-journal')):
        raise RuntimeError('The source has SQLite sidecars. Stop Sentinel cleanly before copying saved plans.')
    before = file_identity(source)
    with sqlite3.connect(source.as_uri() + '?mode=ro&immutable=1', uri=True) as connection:
        connection.execute('PRAGMA query_only=ON')
        rows = connection.execute('SELECT definition_id, revision, revision_json FROM scenario_revisions ORDER BY definition_id, revision').fetchall()
    after = file_identity(source)
    if before != after or any(Path(str(source) + suffix).exists() for suffix in ('-wal', '-shm', '-journal')):
        raise RuntimeError('The source changed during the read; no review database was created.')
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.scenarios.contracts import ScenarioRevision
    from app.recording.sqlite_repository import RecordingRepository
    for identity, revision, raw in rows:
        parsed = ScenarioRevision.model_validate_json(raw)
        if (parsed.definition_id, parsed.revision) != (identity, revision):
            raise RuntimeError('A saved plan has inconsistent revision identity; source preserved.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    repository = RecordingRepository(str(destination))
    try:
        with repository.transaction():
            repository.db.executemany('INSERT INTO scenario_revisions VALUES (?,?,?)', rows)
        copied = [tuple(row) for row in repository.db.execute('SELECT definition_id, revision, revision_json FROM scenario_revisions ORDER BY definition_id, revision')]
        if copied != rows:
            raise RuntimeError('Saved-plan readback mismatch')
    finally:
        repository.close()
    text = json.dumps(rows, ensure_ascii=True, separators=(',', ':'))
    evidence = dict(source=str(source), source_identity=before, destination=str(destination),
                    saved_plans=len({row[0] for row in rows}), saved_revisions=len(rows),
                    copied_rows_sha256=hashlib.sha256(text.encode()).hexdigest(), exact_readback=True,
                    scope='Saved scenario revisions only; existing mission recordings and receipts are not copied.',
                    created_at=datetime.now(timezone.utc).isoformat())
    (destination.parent / 'saved-plan-copy.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    (destination.parent / 'saved-plan-revisions.json').write_text(text + '\n', encoding='utf-8')
    return evidence


def start(args):
    database = Path(args.database).resolve()
    build = ROOT / 'frontend' / args.build
    if not database.is_file():
        raise RuntimeError('Run the prepare command first. It creates a review database containing your saved plans.')
    if not (build / 'index.html').is_file():
        raise RuntimeError(f'Review build is missing: {build}. See docs/assessment/DEMO-RUNBOOK.md.')
    for port in (args.backend_port, args.ui_port):
        free_port(port)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + f'-{os.getpid()}'
    logs = DEMO / 'sessions' / stamp
    logs.mkdir(parents=True, exist_ok=False)
    base = f'http://127.0.0.1:{args.ui_port}'
    backend = f'http://127.0.0.1:{args.backend_port}'
    environment = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1',
                   'SENTINEL_DB_PATH': str(database), 'SENTINEL_DEMO': '1', 'SENTINEL_FIXTURES': '1',
                   'SENTINEL_LOG_DIR': str(logs), 'SENTINEL_LOG_CONSOLE': '1', 'SENTINEL_API_TARGET': backend}
    commands = [
        ('backend', [sys.executable, '-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', str(args.backend_port), '--no-access-log'], ROOT),
        ('frontend', ['node', 'node_modules/vite/bin/vite.js', 'preview', '--outDir', str(build), '--host', '127.0.0.1', '--port', str(args.ui_port), '--strictPort'], ROOT / 'frontend'),
    ]
    children, readers = [], []
    print(f'Sentinel review: {base}\nMetrics: {base}/api/diagnostics/metrics\nSaved logs: {logs}\nPress Ctrl+C to stop these two review services.\n', flush=True)

    def forward(process, name):
        with (logs / f'{name}.log').open('w', encoding='utf-8') as output:
            for line in process.stdout:
                output.write(line)
                output.flush()
                if name == 'backend':
                    print(line, end='', flush=True)

    try:
        for name, command, cwd in commands:
            startup = None
            if os.name == 'nt':
                startup = subprocess.STARTUPINFO()
                startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startup.wShowWindow = 0
            child = subprocess.Popen(command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                     encoding='utf-8', errors='replace', startupinfo=startup)
            children.append(child)
            reader = threading.Thread(target=forward, args=(child, name), daemon=True)
            reader.start()
            readers.append(reader)
        (logs / 'session.json').write_text(json.dumps(dict(started_at=datetime.now(timezone.utc).isoformat(),
            database=str(database), build=str(build), frontend=base, backend=backend,
            process_ids=[child.pid for child in children]), indent=2), encoding='utf-8')
        deadline = time.monotonic() + 30
        while True:
            if any(child.poll() is not None for child in children):
                raise RuntimeError(f'A review service exited. Read the saved server logs in {logs}.')
            try:
                with urllib.request.urlopen(base + '/api/interactive/entry', timeout=1) as response:
                    if json.load(response)['enabled']:
                        break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('The review did not become ready within 30 seconds; see the saved logs.')
            time.sleep(.2)
        print(f'READY - open {base}. Application events will print below.\n', flush=True)
        if args.open:
            webbrowser.open(base)
        until = time.monotonic() + args.seconds if args.seconds else float('inf')
        while time.monotonic() < until:
            if any(child.poll() is not None for child in children):
                raise RuntimeError('A review service stopped unexpectedly; read the saved logs.')
            time.sleep(.2)
    except KeyboardInterrupt:
        print('\nStopping the review services...', flush=True)
    finally:
        # Only direct children created above are stopped; no port-wide process kill.
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
        for reader in readers:
            reader.join(timeout=2)
        print(f'Review services stopped. Evidence remains in {logs}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare = sub.add_parser('prepare', help='Copy saved scenario revisions from a stopped source database')
    prepare.add_argument('--source-db', type=Path, default=ROOT / 'backend/data/sentinel.sqlite3')
    launch = sub.add_parser('start', help='Run the review UI and print application events')
    launch.add_argument('--database', type=Path, default=DATABASE)
    launch.add_argument('--build', default='dist-assessment-ready')
    launch.add_argument('--backend-port', type=int, default=8040)
    launch.add_argument('--ui-port', type=int, default=5240)
    launch.add_argument('--open', action='store_true')
    launch.add_argument('--seconds', type=float, default=0, help='Optional bounded launch check; normally omit')
    args = parser.parse_args()
    try:
        if args.command == 'prepare':
            free_port(8000)
            free_port(8040)
            print(json.dumps(copy_saved_plans(args.source_db, DATABASE), indent=2))
        else:
            start(args)
    except (RuntimeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'Review setup: {error}\n')


if __name__ == '__main__':
    main()
