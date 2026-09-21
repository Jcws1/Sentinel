# Sentinel backend

FastAPI owns world authority, fixed-step simulation, validated commands, saved scenarios, atomic outcomes and durable SQLite recordings. Current exports are in [v1.16](../contracts/sentinel/v1.16/README.md). Historical readers and migrations remain necessary for earlier recordings.

Use the [root quick start](../README.md) for first-time setup and the canonical [architecture blueprint](../docs/architecture.md) for ownership, complete flows, storage bounds and security/deployment assumptions. The export package version is distinct from world, scenario and SQLite versions.

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
| `simulation/`, `adapters/simulation_v1/` | Separate external validation/resolution/journal and source-owned world mapping |

World, checkpoint and receipt commit atomically before publication. Bounded subscriber queues request resynchronization on overflow; reconnect receives a fresh snapshot. Unknown client outcomes retain request identity. Simulation advances in fixed 200 ms steps without catch-up bursts. Persisted telemetry intentionally grows with history.

Phase 6 adds a bounded read-only operational audit over existing receipts/events.
Observed history streams selected observations after complete frame validation;
a disposable 1,000-entry / 16 MiB serialized-projection cache reuses exact stored
bytes. A separate bounded set of 1,000 fingerprints reuses full validation only
for exact canonical bytes successfully committed in the current process. It changes
neither the database nor recording cadence, validation rules or writer ownership.
Historical, changed or evicted bytes still take the strict reader path. See
[analytic ownership and metrics](../docs/phase6-command-picture/README.md).

Milestone 1 introduced SQLite schema 5 for optional checksummed lossless compression
of new frames/checkpoints. Historical TEXT rows and strict message readers remain
supported; old binaries supporting only schema 4 cannot open a schema-5 store.
There is no operator-data rewrite. Complete saved-revision analysis uses cooperative batches
and a bounded exact-input cache while fresh admission stays authoritative.
See [compatibility and recovery details](../docs/d7-details-closure/COMPATIBILITY.md).

Current readers also support SQLite 6, installed additively in the first external
preparation transaction. This adds the simulation journal and writer claims;
it does not rewrite historical frames. The 16 MiB codec limit applies only to
compressed envelopes, not legacy/larger TEXT. Read-page caps do not cap underlying
SQL scan/sort work or total recording growth. External submission remains installed
without `SENTINEL_DEMO`; that flag is not a network authentication boundary.

Scenarios allow 40 units and at most 32 controlled units. The 20v20 workload uses twenty controlled Friendly and twenty scripted observation-only Hostile units. Batch limits, Intercept eligibility, boundaries, ordering and NON-OP persistence remain unchanged. Expanded revisions/reviews introduced scenario version 1.5; supplied location geometry uses 1.6, with strict older readers retained. See [scenario locations](../docs/scenario-location/README.md).

`legacy_*` modules are reachable compatibility code. `drafts/` and unversioned foundation contracts remain used by `scripts/verify_phase0.py`; specifications and hash guards are preserved.

## Checks

```powershell
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
```

For an intentional current-schema update, run the exporter without `--check`, then `npm --prefix frontend run contracts:generate`. Frozen earlier packages must not be regenerated during cleanup.

Isolated UI harnesses call `scripts/end_test_demo.py` after their sole backend listener stops. It refuses operator paths and accepts only the exact `frontend/.cache/verification-*.sqlite3` file owned by that test. Databases are not committed to Git.
