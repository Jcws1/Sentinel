# Tests you can show and rerun

Tests are executable checks of specific behaviours. Passing these checks supports those behaviours on the tested machine and build; it does not establish field reliability or full requirement conformance.

## What the terms mean

| Type | Meaning | Sentinel example |
|---|---|---|
| Unit | Check a small function or component against expected results | Polygon validity, input rules, browser state and UI components |
| Integration | Check components working together | API + service + SQLite; failure rolls back and publishes no new frame |
| System | Exercise a running server through real HTTP | Frozen inputs, malformed requests, restart and exact retry |
| End-to-end (E2E) | Drive the real browser and backend through a user workflow | Submit, inspect, lose a response, reload and retry |
| Static/contracts/build | Check types, schema compatibility, formatting and whether the app builds | TypeScript, frozen schema comparison, frontend production build |
| Performance/recovery | Measure a defined workload or inject a disruption | Update gaps during a batch, browser storage limit, reconnect |

The complete backend pytest run contains **both unit and integration tests**. It is not correct to describe every backend test as a unit test. Frontend Vitest also includes component and library integration checks. Playwright normally runs headless; separate foreground checks verify the actual Windows browser window.

A 100% test pass rate is not 100% code coverage. No code-coverage percentage is claimed in this evidence pack. Fault-injection tests deliberately generate rejection and error logs; the assertion and final test result tell you whether the expected recovery occurred.

## A short live test demonstration

From PowerShell in `C:\Archive\Coding\Sentinel3`:

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest -c backend/pyproject.toml backend/tests/test_observability.py backend/tests/test_assessment_data.py backend/tests/test_review_session.py -p no:cacheprovider
```

This uses temporary databases. You can leave the review launcher running for these focused correctness tests. Avoid running timing measurements alongside any other suite.

Show one test before executing it. Good examples are `test_failed_recording_has_no_committed_publication_log` in `backend/tests/test_observability.py` and `test_variation_ingestion_preserves_gaps_and_exact_retry_without_false_changes` in `backend/tests/test_assessment_data.py`. Explain the setup, deliberately introduced problem and assertion that proves the expected response.

For browser evidence, open `frontend/tests/browser/assessment.spec.ts` and `simulation-compatibility.spec.ts`, then the retained Playwright result. The latter deliberately drops a response after the server processed it and checks the exact retry after page reload.

## Run the standard suites yourself

All commands below start in the repository root unless a command explicitly changes directory. Verified environment: PowerShell 7.6.5, Python 3.10.11, Node 24.20.0, npm 11.19.0, installed Microsoft Edge. Some historical documents describe Windows PowerShell 5.1; that is not the shell used for these new instructions.

Frontend unit/component suite:

```powershell
npm --prefix frontend test -- --maxWorkers=2
```

Complete backend unit/integration suite:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
Remove-Item Env:PYTHONUTF8 -ErrorAction SilentlyContinue
& .\backend\.venv\Scripts\python.exe -m pytest -c backend/pyproject.toml backend/tests -p no:cacheprovider --junitxml=test-results/assessment/manual-backend.xml
```

The final verification also runs an explicitly separate `PYTHONUTF8=1` compatibility check. It is the same test set in another encoding mode, not twice as many distinct tests.

Static, schema and build checks:

```powershell
& .\backend\.venv\Scripts\python.exe scripts/verify_phase0.py
& .\backend\.venv\Scripts\python.exe scripts/export_contracts.py --check
& .\backend\.venv\Scripts\python.exe scripts/check_repository.py
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run contracts:check
npm --prefix frontend run contracts:foundation:check
npm --prefix frontend run build -- --outDir dist-review-check
$env:SENTINEL_TEST_BUILD_SUFFIX = '-review-check'
npm --prefix frontend run build:test
```

`verify_phase0.py` rewrites its verification JSON; its bytes must remain unchanged. Contract commands with `--check` compare the current generated contract with checked-in files. Do not regenerate frozen contracts simply to suppress a mismatch.

System corpus (after the test build above):

```powershell
& .\backend\.venv\Scripts\python.exe scripts/simulation_system_corpus.py review-check --build dist-test-review-check
```

Complete browser suite (about 15 minutes):

```powershell
$env:SENTINEL_TEST_BUILD_SUFFIX = '-review-check'
npm --prefix frontend run test:browser
```

The browser runner owns ports **8011/5181/5182**, uses a disposable database, and refuses occupied ports. The system corpus owns **8321/5321**. Save `frontend/test-results/browser` and `frontend/test-results/playwright` before another browser run overwrites them. The preparation runner archives and hash-checks these outputs automatically.

For one focused browser file, after the same build:

```powershell
npm --prefix frontend run test:browser -- assessment.spec.ts
```

A focused pass supplements a complete run; it does not replace one.

## New checks added for this assessment

- Logging tests verify file/console output, request correlation, bounded metrics, error privacy, rollback, exact retry, interrupted preparation, connection cleanup, source recording failures and continued success when a log sink fails.
- Dataset tests verify fixed-seed reproduction, valid shifts and jitter, exact omitted rows, supported parameter edges, invalid input rejection, no new frames on retry and retained stale observations.
- Review setup tests check exact saved-revision copying, byte-unchanged source data on the small test fixture, refusal to overwrite an existing copy and refusal to read an unclean source with SQLite sidecars.
- Browser tests exercise the generated baseline/variant/invalid inputs through the actual Simulation editor, mapped inspection, trace headers, metrics and rejection display.

No tests were removed to get a passing result. The final report retains failures encountered during development and separates them from the frozen final verification.

## Existing tests and specialist tools

The per-file catalogue in TEST-CATALOGUE.md lists all discovered backend, frontend unit and browser files with their measured results. Machine-readable JUnit, Vitest and Playwright outputs contain individual test names and durations. The older files remain included in the complete suite commands above.

The [existing test guide](../../frontend/tests/README.md) is the command reference for specialist scripts. These are retained measurement and manual-workflow tools, not additional pytest/Vitest/Playwright tests discovered by the normal suites. Their evidence status must be read separately:

The batch/concurrency, geometry comparison, simulation foreground and storage tools are rerun for this assessment and receive current results. The other specialist tool groups below retain their linked historical results; they are **not rerun or recertified tonight**. Normal regression tests for those features remain in the complete current suites.

| Tools | How to run / evidence reference |
|---|---|
| Batch latency, memory, recording and concurrency | `scripts/performance_simulation.py <new-tag> --kind local40`; `scripts/performance_simulation_concurrency.py <new-tag> --repeats 3`; see PERFORMANCE-AND-LIMITS.md for all seven workloads and the timestamp dimension |
| Geometry decode and backend comparison | Commands and baseline preparation in [Phase 5 testing](../phase5-closure/TESTING.md); comparisons need the specified historical source files, not an arbitrary current copy |
| Foreground simulation workflows and browser storage | `frontend/tests/simulation-ui/foreground.mjs` and `storage-limit.mjs`; exact commands below |
| Backend tick/recording probes | `scripts/performance_backend.py <tag>`; `scripts/performance_closure.py --help`; `scripts/recording_storage_report.py --help`; historical [performance closure](../performance-closure/VERIFICATION.md) |
| Renderer pacing, recovery, lifecycle, geometry, recording, zoom | From `frontend`: `npm run build:performance`; corresponding `node tests/performance/<tool>.mjs <new-tag>`; options and prerequisites in the existing test guide; historical [performance summary](../reports/performance-stability.md) |
| Orchestrator foreground workflows | From `frontend`: `node tests/orchestrator-ui/ui.mjs <new-tag>` and `workspace.mjs`; historical [verification](../orchestrator-ui/VERIFICATION.md) |
| Scenario location workflows and configured providers | `tests/scenario-location/ui.mjs`, `extended-ui.mjs`, `configured-ui.mjs`; historical [verification](../scenario-location/VERIFICATION.md); configured-provider runs have separate credentials and request budgets |
| Integrated fault injection | From `frontend`: `node tests/integrated-acceptance/faults.mjs <new-tag>` with its documented test build; historical [verification](../integrated-acceptance/VERIFICATION.md) |
| Analytics foreground, large-data and measurement tools | `tests/analytics/foreground.mjs`, `large.mjs`, `measure.mjs`; historical [verification](../phase6-command-picture/VERIFICATION.md); full moving/layout matrix is separate from the normal browser suite |

Helpers such as `actions.ts`, `support/*.mjs`, `simulation_fixtures.py`, `geometry_oracle.py` and fixture generators support tests; they are not separately counted as passed tests. Optional FFmpeg recording and configured internet-provider measurements have their own prerequisites. Previously deferred display-pacing, configured Video and Phase 7 replay work is not made complete by a new regression-suite pass.

## Foreground checks

Build a uniquely named verification bundle from the repository root, then run the workflows sequentially from `frontend/`. Use a different evidence tag for every new run:

```powershell
npm --prefix frontend run build:verification -- --outDir dist-verification-review-check
Set-Location frontend
$env:PHASE5_BUILD = 'dist-verification-review-check'
$env:PHASE5_EVIDENCE_ROOT = 'C:/Archive/Coding/Sentinel3/test-results/assessment/manual-foreground'
node tests/simulation-ui/foreground.mjs review-ui-0 0
node tests/simulation-ui/foreground.mjs review-ui-10 10
node tests/simulation-ui/foreground.mjs review-ui-20 20
node tests/simulation-ui/storage-limit.mjs review-storage
Set-Location ..
```

Foreground workflows use **8205/5405**; storage uses **8225/5425**. Keep the task's Edge window in front. The foreground harness records whether the actual Windows foreground window belongs to its browser process before each capture. A headless screenshot or `document.hasFocus()` alone does not establish that.

## Reading the results honestly

TEST-RESULTS.md gives the final summary, exact source identity, start/end times, exit codes and links to raw reports. PERFORMANCE-AND-LIMITS.md distinguishes budgeted checks from diagnostics that merely measured a known limitation. A benchmark process exiting successfully is not by itself proof that its numerical budget passed.

The Phase 5 candidate-5 report is historical. The preserved candidate-6 baseline was verified before logging changes. The new assessment build is a separate candidate and is checked again after those changes. None of these labels constitutes organiser sign-off or completion of the remaining Phase 5 independent critic process.
