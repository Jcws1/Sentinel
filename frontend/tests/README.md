# Tests and performance tools

Run frontend commands from `frontend/` or use `npm --prefix frontend` from the repository root. Install dependencies with `npm ci`. Microsoft Edge is the configured browser. Tests use new contexts and task-owned databases; no operator browser profile or recording is used.

| Folder         | Responsibility                                                                  |
| -------------- | ------------------------------------------------------------------------------- |
| `unit/`        | Focused state, contracts, command, presentation and component regressions       |
| `browser/`     | Current UI workflows, accessibility, authoring, authority and renderer behavior |
| `fixtures/`    | Reusable, tracked world/scenario and geometry inputs                            |
| `harness/`     | Verification-only renderer fixture page                                         |
| `support/`     | Shared UI actions and isolated process/database ownership                       |
| `performance/` | Foreground measurement, lifecycle, recovery, geometry, recording and zoom tools |

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

Other entry points are `lifecycle.mjs` (reopen/resource soak), `geometry.mjs` (synthetic intersection correctness), `recording.mjs` (short movement/layout clip) and `zoom.mjs` (actual isolated browser zoom). Recording requires the Playwright FFmpeg runtime; use `npx playwright install ffmpeg` if that optional component is missing. Geometry and headless functional checks are not display-performance certification.

Backend-only timing from the repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/performance_backend.py current
```

It uses a temporary database and the tracked scenario fixture, records durable tick processing, then removes its temporary database. It does not measure displayed FPS. Results go to ignored `test-results/performance/`.
