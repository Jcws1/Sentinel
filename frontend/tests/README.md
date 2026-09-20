# Tests and performance tools

The [D7 performance follow-up](../../docs/performance-closure/README.md) adds
`scripts/performance_closure.py` for isolated matched backend review/recording
probes and `tests/performance/validation.mjs` for exact-revision UI timings.
The latter currently uses the task build suffix `-performance-closure`; build
with `SENTINEL_TEST_BUILD_SUFFIX=-performance-closure` first. Run it from
`frontend/`; `PERF_BACKEND_DIRECTORY` can point to an explicitly preserved
working-tree snapshot. No historical checkout is selected implicitly.
On Windows, verify the headed browser is on the actual visible desktop before
making display claims: a sandbox desktop can report `visible` and `hasFocus`
without appearing on the operator's physical display. Keep diagnostic runs
separate. Backend goldens in `test_scheduler_performance.py` preserve exact
pre-change nominal execution content, including failure and dependency outcomes.

Run frontend commands from `frontend/` or use `npm --prefix frontend` from the repository root. Install dependencies with `npm ci`. Microsoft Edge is the configured browser. Tests use new contexts and task-owned databases; no operator browser profile or recording is used.

| Folder                   | Responsibility                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `unit/`                  | Focused state, contracts, command, presentation and component regressions                       |
| `browser/`               | Current UI workflows, accessibility, authoring, authority and renderer behavior                 |
| `fixtures/`              | Reusable, tracked world/scenario and geometry inputs                                            |
| `harness/`               | Verification-only renderer fixture page                                                         |
| `support/`               | Shared UI actions and isolated process/database ownership                                       |
| `performance/`           | Foreground measurement, lifecycle, recovery, geometry, recording and zoom tools                 |
| `orchestrator-ui/`       | Foreground unified authoring, bulk deletion, pending saves, 40 moving actors and narrow layouts |
| `scenario-location/`     | Foreground origin authoring, remote runs, retries, recordings and configured coverage           |
| `integrated-acceptance/` | Foreground connected-source/receipt-rollback/Stop recovery probes                               |

Phase names on some regression files describe provenance, not obsolescence. The assertions remain relevant; one-off critic/capture programs moved to the [archive](../../docs/ARCHIVE.md).

## Canonical checks

```powershell
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
npm run format:check
npm run contracts:check
npm run contracts:foundation:check
npm run build:test
npm run test:browser
```

`test:browser` owns ports 8011/5181/5182, rejects occupied ports, runs serially, stops its services, then finalizes/deletes only its named verification database. It does not start a second writer against existing data. Direct `npx playwright test` remains supported by Playwright's server configuration. Authority workflows keep network traces off. Outputs go to ignored `frontend/test-results/`.

The geometry baseline required by `chrome.spec.ts` is `fixtures/chrome-before-geometry.json`, promoted with its original JSON values unchanged. Authoring helpers explicitly choose the supported Quadcopter / strike profile after category expansion; this is required by the current UI, including before repository cleanup. These are fixture/setup repairs, not deleted assertions.

## Forty moving entities and recovery

```powershell
npm run build:performance
npm run test:capacity
npm run test:geometry
```

The first command builds `dist-performance/` without repeated public/map-pack copies. The others use isolated headed Edge sessions, APIs and real UI controls. `fixtures/scenario-20v20.json` is the shareable saved-plan content; `performance/scenario.mjs` also generates smaller matched workloads. Neither adds Hostile interception semantics.

For an isolated manual session, run `node tests/performance/manual.mjs local-demo`. Open its printed frontend URL in a separate browser context. The helper exits after its bounded wait or when a `stop` file is placed in its `test-results/performance/local-demo/` output directory. Its owned demo is finalized after shutdown.

## Foreground measurement

```powershell
$env:PERF_BUILD = 'dist-performance'
$env:PERF_COUNTS = '1,10,20'
node tests/performance/measure.mjs current-grid
```

Keep the browser foreground and avoid competing test/build work. Default windows are 12 seconds. The helper records compositor presentation intervals, RAF/CPU diagnostics, provider/pane state and state-age/command samples. RAF counts alone are not FPS acceptance. Cold loading, steady state and configured-provider measurements must be reported separately. The script's original methodology and known limitations are in the [performance summary](../../docs/reports/performance-stability.md) and retained raw archive.

For configured-provider work, explicitly set `PERF_CONFIGURED=1` while building a separate `PERF_BUILD=dist-performance-configured`, then pass `--configured` to `measure.mjs`. Retain a bounded `PERF_MAX_PROVIDER_REQUESTS` limit. Do not use real credentials for ordinary regression tests. `PERF_BACKEND_DIRECTORY` optionally names a separately prepared backend checkout for a deliberate comparison; no hidden historical checkout is assumed.

Configured capture now requires a finite request cap. `PERF_VIDEO_ONLY=1` avoids
spending that allocation on earlier ordinary-3D windows; `PERF_VISIBLE_PROVIDER=1`
uses visible ready content with resident tiles instead of waiting indefinitely
for moving-camera network idle. `PERF_RUN_BUDGET_MS` defaults to 180000. The
configured probe intercepts requests with CDP, explicitly keeps HTTP caching
enabled, and fails/ends before dispatch beyond its allocation. Interception adds
unquantified overhead and conservative request counts; record this limitation.
Always share a total request ledger across implementer and critic runs.

`PERF_WINDOW_MS=30000` selects the longer supported ±0.035° route used by the
ten-minute soak. End-of-window renderer state is captured before trace export,
so a later turn during diagnostic serialization is not misattributed to the
measured window. Failed window timing and frame events are retained as well.

Other entry points are `lifecycle.mjs` (reopen/resource soak), `geometry.mjs` (synthetic intersection correctness), `recording.mjs` (short movement/layout clip) and `zoom.mjs` (actual isolated browser zoom). Recording requires the Playwright FFmpeg runtime; use `npx playwright install ffmpeg` if that optional component is missing. Geometry and headless functional checks are not display-performance certification.

Backend-only timing from the repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/performance_backend.py current
```

It uses a temporary database and the tracked scenario fixture, records durable tick processing, then removes its temporary database. It does not measure displayed FPS. Results go to ignored `test-results/performance/`.

## Orchestrator acceptance

`unit/orchestrator.test.ts` covers atomic dependency-safe deletion, preserved pending-save bytes, selection/actor eligibility and legacy layout normalization. `unit/orchestrator-selection.test.tsx` checks selection versus editor intent and invalidation of stale deletion reviews. Browser authoring helpers open the real Orchestrator internal tabs and disclosures; existing behavioural assertions remain in place. `browser/orchestrator-layout.spec.ts` uses the verification-only legacy layout fixture through the real workspace bridge.

From `frontend/`, run `node tests/orchestrator-ui/ui.mjs orchestrator-local-check`. It uses isolated ports 5391/8191, a fresh foreground Edge context, the existing Sydney 20v20 fixture, API setup and actual UI controls. It verifies origin selection, silhouettes, filtered/mixed keyboard selection, deletion, exact saved revision Run, lost-save retry across reload, narrow 760/820/900 layouts, paused-run isolation and recovery. Installed system `ffmpeg` encodes a bounded motion clip; it is not an FPS measurement. Raw output goes to `test-results/orchestrator-ui/`, then to the external archive described in the [verification index](../../docs/orchestrator-ui/VERIFICATION.md).

Run `node tests/orchestrator-ui/workspace.mjs orchestrator-workspace-check` separately for actual 80/100/125% browser zoom, keyboard resizing, hidden schedule suspension and eight close/reopen cycles. It owns ports 5393/8193 and a temporary Edge profile/zoom-only extension outside Vite's watched source tree. Close the context before removing the task paths listed in its report. Do not run the two foreground programs simultaneously. Neither bounded resource check certifies an absence of leaks or changes the prior FPS findings.

## D7 integrated acceptance

Use one final complete browser run, not an aggregate of passing subsets. `browser/d4.spec.ts` now explicitly tests current `local-fleet-v2`; backend `test_d4.py` retains historical `local-fleet-v1` behavior. The [expectation matrix](../../docs/integrated-acceptance/VERSION-MATRIX.md) and [regression notes](../../docs/integrated-acceptance/REGRESSION-NOTES.md) explain substantive replacements and tightly bounded SDK readback assertions.

From `frontend/`, with no competing foreground benchmark:

```powershell
$env:SENTINEL_TEST_BUILD_SUFFIX = '-integrated-acceptance'
npm run build:test
node tests/support/run-browser.mjs
node tests/integrated-acceptance/faults.mjs d7-faults-local
$env:PERF_BUILD = 'dist-verification-integrated-acceptance'
node tests/performance/recovery.mjs d7-recovery-local
$env:PERF_SOAK_SECONDS = '600'
node tests/performance/lifecycle.mjs d7-soak-local
```

The faults runner owns ports5401/8201 and explicitly opts into `backend/tests/integrated_runtime.py`; the normal app has no verification routes. The guard rejects databases outside the exact disposable directory/naming convention. It freezes the existing tick loop and injects one receipt-write failure inside the sole writer. It tests truthful source delay, exact lost Stop/retry identity, rollback before publication, reload, long Pause and persisted End. It does not write to a second operator connection.

The lifecycle helper defaults to120s and also accepts600s. The longer case keeps unchanged profiles/speeds but uses supported ±0.035° route destinations inside the same scenario square, observes movement for every entity at each30s checkpoint, requires one active WebSocket, captures renderer/heap/listener/service/recording growth and performs20 tab transitions. GC diagnostics are labelled separately from the uncollected steady window. All40 moving is a workload condition, not a display-FPS assertion. Keep raw evidence outside tracked source using the [archive convention](../../docs/ARCHIVE.md).

## Milestone 1 D7 and Details

`browser/details-closure.spec.ts` uses the shared real-interaction helper in
`support/details-closure.mjs` for a supported Sydney forty-unit scenario. It checks
supplied image/profile/silhouette identity, supported cross-affiliation mapping,
fallback, pinned selection, narrow layouts, load failure and ended inspection.
`performance/details.mjs` runs the same interactions in a fresh headed context;
actual desktop visibility must be verified separately on sandboxed Windows.
`unit/assetPortrait.test.tsx` covers unsupported/prototype-like identities and
image failure without contaminating a different selection.

Backend `test_storage_codec.py`, `test_recording_equivalence.py` and
`test_scenario_analysis.py` cover encoding/rollback/restart and complete cached
analysis ownership. `scripts/performance_closure.py --source-root ...` compares
isolated current-source snapshots, separating logical payload, stored payload,
database allocation and normal-close components. `recording_storage_report.py`
reads task-owned copies; it does not measure physical write volume. Never compare
a main timed tick window with bytes from extra profiling/teardown frames.

`unit/interactiveClient.test.ts` also holds an old status response across a
mission switch and overlaps refresh callers after a revision change. It verifies
the coalesced fresh read without advancing the periodic poll clock, strict status
decoding, rejection of old-generation data and disposal without a late read.

Foreground `performance/recovery.mjs` accepts `PERF_LOCATION=sydney` and needs a
verification bundle through `PERF_BUILD` because its geographic click setup uses
the map verification hook. It blocks receipt lookup before simulating a lost
Apply response, then checks the exact persisted pending body across reload and
the exact command body/identity on explicit retry. Allowing successful background
reconciliation before blocking lookup would invalidate that fault setup.

The `performance/measure.mjs` Video-only mode (`PERF_VIDEO_ONLY=1`) keeps Video in
its ordinary auxiliary stack so Details can exercise actual hidden-tab suspension.
`PERF_VISIBLE_PROVIDER=1` permits resident visible tiles while moving-camera
streaming continues; readiness is distinct from the fixed initial warmup and
the subsequent compositor window. Configured runs require an explicit
`PERF_MAX_PROVIDER_REQUESTS` dispatch-gate allocation and finite
`PERF_RUN_BUDGET_MS`; charge all observed attempts, including concurrently blocked
ones and cache-served requests, against a shared pass ledger. Use CDP interception
with normal caching; Playwright request routing would disable HTTP caching.
Do not rerun a budget-stopped capture without checking the remaining approved
allocation. Current [Milestone 1 provider evidence](../../docs/d7-details-closure/PROVIDER.md)
retains its incomplete configured window rather than claiming an FPS pass.
