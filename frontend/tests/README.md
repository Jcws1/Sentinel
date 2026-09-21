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

## Phase 5 external compatibility

Backend `test_simulation_resolver.py` and `test_simulation_service.py` cover the
frozen golden/negative cases, numerical boundaries, lifecycle, rollback, process
death, exact reconciliation, ownership and additive v6 compatibility. Frontend
`unit/simulation-client.test.ts` covers exact durable pending bodies, selection
generations, storage failure, typed results and opaque command lookup identities.
`browser/simulation-compatibility.spec.ts` adds default/Sydney40 lifecycle,
lost-response reload/retry, recorded inspection and760/820/900/desktop checks.

`tests/simulation-ui/foreground.mjs <tag> [0|10|20]` uses a fresh headed browser and
task-owned services;0 runs external workflows,10/20 separately exercise moving
interactive workloads. Actual desktop enumeration/activation must precede its
`foreground-approved` marker. It blocks external provider requests and preserves
screenshots, raw intervals and cleanup reports. Do not fabricate that marker
from `document.hasFocus()` alone. Source benchmarks use
`backend/.venv/Scripts/python.exe scripts/performance_simulation.py <tag> --kind
<golden|local40|remote40|sparse10000|dense50|dense100|dense200>` from repository root.
Keep performance windows exclusive and preserve failed attempts. See
[Phase5 verification](../../docs/phase5-simulation-compatibility/VERIFICATION.md).

## Milestone 1 D7 and Details (historical workflow)

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

## Phase 6 analytics

`tests/unit/analytics*.test.*`, `tests/browser/analytics.spec.ts` and
`backend/tests/test_analytics.py` cover exact aggregates, native altitude groups,
source/cutoff identity, retry/event ordering, missing values, async cancellation,
chart cleanup and integrated selection/docking. Existing history tests retain
correction, gap and discontinuity coverage.
Audit endpoint tests also retain exact quoted/backslash/Unicode request identities
through real acquire/retry/read calls, both UTF-8 and ASCII-escaped historical JSON,
raw JSON searches, literal percent/underscore, unchanged receipt bytes and zero
read-side writes. Search folds A–Z only; other letters remain case-sensitive.
`tests/unit/chartMotion.test.ts` also exercises accumulated chart deadlines on
144/120/60 Hz clocks, duplicate notifications, missed deadlines after stalls,
actual-clock trailing samples and cancellation after a projection/disposal boundary.
The 120 Hz chart-owned target includes sub-microsecond floating-point tolerance so exact
matching display periods do not accidentally lose frames. `chartProjection.test.ts`
uses real ECharts to verify deferred series replacement followed by a current-only
motion patch before painting: removed history/entities stay removed, corrected
series and new axis extents survive, and removing all history clears the old model.
Its signed-bar cases keep zero in positive/negative/mixed altitude ranges and
preserve proportional lengths and null values. `profileSeries.test.ts` runs real
ECharts to check primitive-dimension IDs, callback picking, formatted tooltip raw
values/source context, selected size and rendered stale alpha, including corrected
and removed points followed by motion patches. Actual native pointer verification
must supplement this library-level inspection; the tests do not establish pacing.
Verification-only per-chart motion/rendered captures supplement compositor timing;
their opt-in arrays are bounded and released after each sample. Actual ECharts
render events are not per-chart physical scanout or input-to-photon evidence.
`profileLayer.test.ts` exercises real ECharts graphics without per-motion model
updates: exact IDs and selected/stale appearance, last-painted tooltip values,
historical/current separation, reordered hit indices, corrected/removed identities,
resize, unchanged frozen positions and mission/disposal cleanup. Real axes contain
the complete existing linear coordinate path, including a longitude crossing and
descending altitude endpoints. Native pointer/tooltip, full moving matrix and
10,000-entity readiness checks are still required for the owned marker layer.
The delayed-catalogue case in `browser/chrome.spec.ts` holds the saved-scenario
response until a submenu is open, then checks viewport hit testing and ordinary
selection after 18 rows arrive; this guards the separately recorded inherited
mission-menu positioning correction.
`unit/observedHistory.test.ts` also checks Profile-only refresh coalescing against
the latest immutable anchor without dropping retained samples, immediate map or
final-frame demand, source-filter changes, hidden trailing timers and an in-flight
map-demand upgrade without overlapping reads. Existing map-demand cadence stays
unchanged. Foreground verification must exercise map history and Pause/End with
Profile history enabled, and distinguish returned read cutoff from the current
plot window.

Build with `SENTINEL_TEST_BUILD_SUFFIX=-phase6`. From frontend,
`node tests/analytics/foreground.mjs <unique-tag>` exercises the actual UI (set
`PHASE6_BUILD=dist-verification-phase6`). `node tests/analytics/measure.mjs
<unique-tag>` runs matched 10v10/20v20 default/Sydney, analytics closed/open with
Tactical/ordinary 3D, and lifecycle/resource diagnostics. On Windows launch these
outside the sandbox desktop. Read-only `scripts/foreground_identity.py` checks the
OS foreground window PID against the task browser; DOM hasFocus alone is
insufficient. `foreground-browser.mjs` uses a fresh task-owned default context via
CDP `noDefaults:true` to avoid Playwright's normal focus emulation; verify a real
two-tab visibility transition before accepting its focus/visibility telemetry.
No competing builds/tests during display measurements. Narrow
viewport captures are layout evidence. All contexts/databases are task-owned;
provider requests are blocked and counted. Results and failures must be archived
using [the Phase 6 evidence policy](../../docs/phase6-command-picture/PLAN.md).

First run `node tests/analytics/measure.mjs <different-unique-tag> --setup-only`
to exercise all 96 layout transitions, four End transitions and ten resource
cycles per workload without collecting timing evidence. `visible-workload.mjs`
sets existing renderer cameras to the mission origin and a 10 km horizontal span
covering the complete unchanged routes. Every timed window requires all expected
entities projected inside each map and every primary chart contained by its pane
and viewport before and after sampling. Both Profile scrollers are centered before
sampling. Retain these screenshots and bounds; a moving source alone does not
prove visible moving markers. Await the ended UI and an empty authoritative
active-mission entry before closing each task browser. Never combine partial
matrices into a complete gate or treat setup-only output as performance evidence.

The Profile browser regression locates actual marker canvas pixels and checks the
visible built-in ECharts tooltip's text and bounds, including pointer movement,
click-through selection, reinspection after a committed position change and
resize, then removal cleanup without commands. A failed canvas-tooltip version
exposed pointer interception; the current non-enterable HTML tooltip retains
literal source text and passes hits through. The check does not infer successful
hover from an action-dispatch spy. On the measured Windows-scaled native surface,
Playwright screenshot preparation can move the pointer to unrelated native
coordinates. For native hover captures use direct CDP `Page.captureScreenshot`
without changing the viewport, retain pointer/focus/visibility samples, and read
the resulting values personally. A screenshot with the pointer moved off a marker
does not establish a product tooltip failure; retain and investigate that attempt.
