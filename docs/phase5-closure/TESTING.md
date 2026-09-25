# Testing — tiers, commands and pitfalls

How this closure's four test tiers map to the repository and how to run them.
Results for the final candidate are in [TEST-REPORT](TEST-REPORT.md).

## Environment

| Item | Value / rule |
| --- | --- |
| Machine | Windows 10 Home, i7-10700K, RTX 3060, Edge 153 |
| Shell | The recorder uses Git Bash. The 25 September assessment verified PowerShell 7.6.5 is installed; see [current commands](../assessment/TESTING.md). Windows PowerShell 5.1 handles empty `VITE_*` overrides differently, so do not substitute it for the documented provider-free setup |
| Toolchain | `backend/.venv/Scripts/python.exe` (3.10.11), Node 24.20.0, npm 11.19.0 (`npm --prefix frontend …`; no root `package.json`) |
| Encoding | Canonical backend runs leave `PYTHONUTF8` unset. A `PYTHONUTF8=1` run is reported separately |
| Neutral overrides | `PYTHONDONTWRITEBYTECODE=1` and pytest `-p no:cacheprovider` keep pre-existing caches untouched; they change no result |
| Candidate identity | `python test-results/phase5-closure/tools/inventory.py <dir>` → `candidate.json` digest (non-documentation files) plus HEAD |
| Recorder | `test-results/phase5-closure/tools/run.sh <outdir> <label> <cwd> <command…>` writes `<label>.log/.exit/.meta.json` (command, cwd, UTC start/end, duration, exit) |

## Ports (check before starting; never run two owners together)

| Owner | Ports |
| --- | --- |
| User development servers (never touch) | 8000, 5180 |
| `npm run test:browser` | 8011, 5181, 5182 |
| `scripts/simulation_system_corpus.py` | 8321 backend, 5321 frontend |
| `scripts/performance_simulation_concurrency.py` (M1, M2, M9) | 8341 |
| `tests/simulation-ui/foreground.mjs` | 8205, 5405 |
| `tests/simulation-ui/storage-limit.mjs` | 8225, 5425 |

## Tiers

| Tier | What runs | Command (repository root unless noted) | Typical duration | Pass rule |
| --- | --- | --- | --- | --- |
| Prerequisites | Frozen guards, contracts, repository hygiene, static checks, builds | `scripts/verify_phase0.py`; `scripts/export_contracts.py --check`; `scripts/check_repository.py`; `npm --prefix frontend run typecheck`/`lint`/`format:check`/`contracts:check`/`contracts:foundation:check`; `npm --prefix frontend run build -- --outDir dist-<tag>` (never overwrite the configured `frontend/dist`); `env SENTINEL_TEST_BUILD_SUFFIX=-<tag> npm --prefix frontend run build:test` | ~1 min | All exit 0; `contracts/phase0-verification.json` byte-identical afterwards |
| Unit | Vitest `tests/unit/**`; backend pure-logic files (table below) | `npm --prefix frontend test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=<abs path>` | ~45–80 s | 100% pass |
| Integration | Complete backend suite (unit and integration files together) | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests -p no:cacheprovider --junitxml=<path>` | ~100 s | 100% pass |
| System | Real uvicorn + built frontend preview proxy; golden, all frozen fixtures (negatives pinned by code and path), §10 negatives, 64 shared + 16 containment + 200 seeded random geometry vectors, lifecycle matrix (spec §8 table written out in the corpus), restart exact retry, hard kill after preparation (triggered by the durably pending command in the corpus's own database, read-only) | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/simulation_system_corpus.py <tag> --build dist-test-<suffix>` → `test-results/simulation-system/<tag>/summary.json`, `cases.json` | ~30 s | 0 failures, 0 server errors, ports free, database removed |
| End-to-end | Complete Playwright suite | `env SENTINEL_TEST_BUILD_SUFFIX=-<suffix> npm --prefix frontend run test:browser` → `frontend/test-results/browser/results.json` | ~15 min (run in background) | All expected; 0 skipped/unexpected/flaky; no retries; runner deletes its database |
| End-to-end (foreground) | Headed native-foreground workflows | from `frontend/`: `env PHASE5_BUILD=dist-verification-<suffix> PHASE5_EVIDENCE_ROOT=../test-results/phase5-closure/<dir> node tests/simulation-ui/foreground.mjs <tag> 0` (then `10`, `20` with new tags) | 1–3 min each | `result.json` has `completed`, empty `errors`/`externalRequests`, every `foreground[]` check `taskBrowserPidMatched: true`; exit 0 |

The foreground harness verifies the OS foreground window PID against the task
browser before every CDP screenshot. If Edge cannot become foreground it waits
(`PHASE5_FOREGROUND_WAIT_MS`, default 15 min) and writes
`foreground-waiting.json`; the user must then click the Edge window.

## Measurements (after all tiers, machine otherwise idle, never alongside suites or builds)

| ID | Command | Output |
| --- | --- | --- |
| M1/M2 | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/performance_simulation_concurrency.py <tag> --repeats 3` (~6 min) | `test-results/simulation-concurrency/<tag>/summary.json`, per-run JSON: arrival, publication and event-loop gaps, sequence continuity, control-action latency (intent plus command, each also reported alone) |
| M9 | Same harness, timestamp dimension: `... performance_simulation_concurrency.py <tag> --repeats 3 --kinds control,steps100x40,churn300` | As M1/M2; batch `inputRows`, latency and the pause it causes |
| M3 | For each kind in `golden local40 remote40 sparse10000 dense50 dense100 dense200`: `backend/.venv/Scripts/python.exe scripts/performance_simulation.py <tag>-<kind> --kind <kind>` (1 cold + 3 repeated) | `test-results/phase5-simulation-compatibility/<tag>-<kind>/summary.json` (script path unchanged) |
| M4 | `backend/.venv/Scripts/python.exe scripts/performance_geometry.py frames <frames.json>`; `git show HEAD:frontend/src/contracts/integrity.ts > frontend/.cache/p5c-bench/integrity.baseline.ts`; from `frontend/`: `node tests/performance/decode-integrity.mjs <frames.json> .cache/p5c-bench/integrity.baseline.ts <out.json> 30 20` | Worst decode median ratio ≤ 1.05 over tracked-fixture frames; the six `diagnostic-*` 101-position frames (stars and box-dense accordions) are reported separately |
| M5 | `git archive HEAD backend/app backend/tests contracts \| tar -x -C .cache/p5c-baseline-src`; `backend/.venv/Scripts/python.exe scripts/performance_geometry.py backend <frames.json> --baseline-root .cache/p5c-baseline-src --rounds 30 --iterations 20 --out <out.json>` | Worst median ratio ≤ 1.10 over tracked-fixture frames; diagnostic frames and `containment:*` entries (100 drones on the golden area and each diagnostic zone) reported separately |
| M7 | from `frontend/`: `env PHASE5_BUILD=dist-verification-<suffix> PHASE5_EVIDENCE_ROOT=<root> node tests/simulation-ui/storage-limit.mjs <tag>` (~4 min, headless) | `summary.json`: largest persisted drones/bytes |

Optional long geometry differential run (not part of the gate):
`env SENTINEL_GEOMETRY_ITERATIONS=100000 backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests/test_geometry_exact.py -k randomized -p no:cacheprovider`.

## Backend file mapping (no restructuring)

| Kind | Files |
| --- | --- |
| Unit (no database, service, subprocess or network; some read tracked files) | `test_domain.py`, `test_geometry_exact.py`, `test_geometry_history.py` (reads tracked fixtures and contract examples), `test_simulation_resolver.py`, `test_contracts.py`, `test_scheduler_performance.py` |
| Integration (SQLite, API, subprocess or service harness) | `test_simulation_service.py`, `test_defensive_scenario.py`, `test_recording_equivalence.py`, `test_storage_codec.py`, `test_api.py`, `test_authority.py`, `test_interactive.py`, `test_scenarios.py`, `test_scenario_*.py`, `test_analytics.py`, `test_observation_cache.py`, `test_observed_history.py`, `test_capacity.py`, `test_integrated_probe.py`, `test_boundaries.py`, `test_conductor.py`, `test_d3a.py`, `test_d4.py`, `test_d4_refinement.py`, `test_demo_profile.py`, `test_direct_movement.py`, `test_movement.py`, `test_recommendations.py`, `test_tactical_fixture.py` |

Phase 5 closure additions: shared vectors `frontend/tests/fixtures/geometry/polygon-vectors.v1.json`
(64 rings, 59 polygons including every order of four holes, 16 containment points;
generator `backend/tests/geometry_vectors.py`, oracle `backend/tests/geometry_oracle.py`),
§9 dataset `frontend/tests/fixtures/simulation/defensive-s9.json` (generator
`backend/tests/defensive_scenario.py`). After regenerating either, run
`npm --prefix frontend exec prettier -- --write <file>`; tests compare parsed JSON.

## Pitfalls

- `requestRecovery.test.ts` imports the Cesium SDK inside a 5 s test; under heavy
  contention it can time out (seen at baseline). Keep the machine otherwise idle.
- Commands longer than ~10 minutes (browser suite) must run in the background;
  read the real exit code and JSON. A timeout is an incomplete attempt.
- `verify_phase0.py` rewrites `contracts/phase0-verification.json`; its bytes must
  not change.
- `format:check` covers `frontend/tests/**`, including `tests/README.md`. Working
  copies use LF; Python text-mode writes on Windows produce CRLF and fail the
  check (candidate 1's gate recorded exactly this after a README edit).
- `build` must use `--outDir dist-<tag>`; plain `build` overwrites the operator's
  configured `frontend/dist`.
- Outputs under `frontend/test-results/browser` are overwritten by the next browser
  run; copy them to the task directory first.
- Never start a harness while another owns its ports, and never run measurements
  or foreground workflows alongside suites or builds.
- A fault trigger must not rely on an HTTP status read: a read made during a short
  cooperative phase can reach the client only after the next synchronous block.
  The corpus's hard kill therefore watches its own database for the durably
  pending command (one dev run on 2026-09-24 killed after the commit).
- `test_defensive_scenario.py` starts two short subprocesses (separate clean
  runs with fixed `PYTHONHASHSEED` values); they inherit the environment.
