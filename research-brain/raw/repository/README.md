# Sentinel v3

Sentinel is a local real-time mission workbench with Tactical and 3D maps, a simulated Video Feed, scenario authoring, command controls and durable recordings. This is the private application source repository.

## Start locally

Verified development runtimes: **Node 24.20.0** and **Python 3.10.11**. Install dependencies once from the repository root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
```

Start the backend in one terminal:

```powershell
$env:SENTINEL_DEMO = '1'
$env:SENTINEL_FIXTURES = '1'
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
npm --prefix frontend run dev
```

Open <http://127.0.0.1:5180>. Choose **New demo**, or open **Orchestrator** to author a saved plan in its Units and Conductor tabs. Select a profile within a unit category before placing it. The default database is `backend/data/sentinel.sqlite3`; run **one backend process per database**. `SENTINEL_DB_PATH` selects another database without deleting existing recordings.

No credentials are needed for the labelled grid/globe fallbacks. The optional regional map pack and existing providers are covered in [map setup](docs/MAP_REFINEMENT_SETUP.md). Local configuration, databases, dependencies, builds and the large map pack are ignored. Preserve any existing `.env.local` when following setup instructions.

## Repository layout

| Directory | Contents |
|---|---|
| `backend/app/` | Authority, APIs, simulation, persistence and compatibility readers |
| `backend/tests/` | Backend regression tests |
| `backend/drafts/` | Frozen foundation models still used by verification |
| `frontend/src/` | React workbench, shared runtime and map renderers |
| `frontend/tests/` | Unit/browser tests, reusable performance tools, fixtures and support |
| `frontend/public/` | Shipped application assets; optional `edge-map/` is ignored |
| `frontend/map-data/licenses/` | Notices required to prepare the regional map pack |
| `contracts/` | Current exported schemas and required frozen historical contracts |
| `scripts/` | Contract generation, repository checks, benchmarking and test cleanup |
| `docs/` | Setup, architecture, specifications, planning records and concise reports |

Raw results go in ignored `test-results/` directories. Historical experiments, review scripts, screenshots, traces and recordings live in a separate local archive; see [the archive index](docs/ARCHIVE.md). They are not dependencies of the current application or test setup.

## Verify

From the repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/check_repository.py
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
npm --prefix frontend run contracts:check
npm --prefix frontend run contracts:foundation:check
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend test -- --maxWorkers=2
npm --prefix frontend run build:test
npm --prefix frontend run test:browser
```

Browser checks use installed Microsoft Edge and isolated databases on ports 8011, 5181 and 5182. Existing listeners are not reused. Verification builds share canonical public assets instead of repeatedly copying map packs. See [test instructions](frontend/tests/README.md) for 20v20 and foreground measurements.

The [Orchestrator guide](docs/orchestrator-ui/README.md) describes shared Save/Validate/Run controls, draft multi-selection, dependency-safe deletion and legacy pane compatibility.

[D7 integrated acceptance](docs/integrated-acceptance/README.md) records the earlier version-correct regression gate, foreground workflow/recovery checks and bounded resource evidence. Functional and recovery results are separate from the documented display-performance limits.

The earlier bounded [D7 performance follow-up](docs/performance-closure/README.md)
is preserved as historical evidence. The subsequent [Milestone 1 D7 and Details
closure](docs/d7-details-closure/README.md) adds lossless versioned storage,
responsive complete validation, a coalesced authority refresh and supplied
profile-specific drone images. Existing recordings remain readable; newly
compressed records use SQLite format marker 5 and must not be opened with an
older format-4 application. No operator database was migrated during this work.
The milestone reports functional, recovery, storage, display and Details acceptance
separately; display closure remains partial. Phase 5 and Phase 6 are deferred.

## Current limits

Scenarios support **40 units**, including the verified **20 Friendly / 20 Hostile** moving workload. Controlled units remain capped at 32; existing command and assignment rules remain. Hostile interception semantics have not been added. Current exports are in [v1.14](contracts/sentinel/v1.14/README.md); individual wire versions differ by message.

**Orchestrator → Units → Location & boundaries → Scenario location** supports an explicit WGS84 origin while retaining a fixed ±5 km square and unchanged geographic positions/heights. See [location workflow, compatibility and verification](docs/scenario-location/README.md).

Configured Google Video visibly loads, but its latest bounded capture exhausted
the request budget before a complete pacing window. No sustained configured
Video FPS is claimed. Some blank-grid pane combinations still exceed the strict
50 ms compositor-stall limit. See [current measurements](docs/d7-details-closure/PACING.md)
and [provider evidence](docs/d7-details-closure/PROVIDER.md); older
[performance reports](docs/reports/performance-stability.md) remain historical.

Historical compatibility contracts and third-party asset notices are retained intentionally. Upstream notices and attribution remain with their assets.
