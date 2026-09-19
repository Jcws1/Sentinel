# Sentinel backend

FastAPI owns world authority, fixed-step simulation, validated commands, saved scenarios, atomic outcomes and durable SQLite recordings. Current exports are in [v1.13](../contracts/sentinel/v1.13/README.md). Historical readers and migrations remain necessary for earlier recordings.

## Run

From the repository root, using Python 3.10.11 as verified:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
$env:SENTINEL_DEMO = '1'
$env:SENTINEL_FIXTURES = '1'
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Use one process and one worker per database. The default is `backend/data/sentinel.sqlite3`; `SENTINEL_DB_PATH` overrides it. Never run verification against an operator database. Demo commands require `SENTINEL_DEMO=1`; synthetic seeding requires `SENTINEL_FIXTURES=1` and is idempotent.

| Module | Responsibility |
|---|---|
| `api/` | HTTP/WebSocket boundaries and errors |
| `domain/`, `world/` | World models, versioned readers and serialization |
| `missions/` | Mission ordering, fixtures and committed publication |
| `commands/` | Control, idempotency, execution, outcomes and recovery |
| `scenarios/` | Saved revisions, review, supported profiles/actions and bounds |
| `recording/` | Atomic history, checkpoints and inspection |

World, checkpoint and receipt commit atomically before publication. Bounded subscriber queues request resynchronization on overflow; reconnect receives a fresh snapshot. Unknown client outcomes retain request identity. Simulation advances in fixed 200 ms steps without catch-up bursts. Persisted telemetry intentionally grows with history.

Scenarios allow 40 units and at most 32 controlled units. The 20v20 workload uses twenty controlled Friendly and twenty scripted observation-only Hostile units. Batch limits, Intercept eligibility, boundaries, ordering and NON-OP persistence remain unchanged. Expanded revisions/reviews use scenario version 1.5; older messages retain strict readers.

`legacy_*` modules are reachable compatibility code. `drafts/` and unversioned foundation contracts remain used by `scripts/verify_phase0.py`; specifications and hash guards are preserved.

## Checks

```powershell
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
```

For an intentional current-schema update, run the exporter without `--check`, then `npm --prefix frontend run contracts:generate`. Frozen earlier packages must not be regenerated during cleanup.

Isolated UI harnesses call `scripts/end_test_demo.py` after their sole backend listener stops. It refuses operator paths and accepts only the exact `frontend/.cache/verification-*.sqlite3` file owned by that test. Databases are not committed to Git.
