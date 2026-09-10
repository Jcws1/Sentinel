# Phase 0 docking decision

Decision: **select FlexLayout React 0.10.8** for the later Sentinel shell. This decision follows executed browser tests, not documentation alone. Golden Layout 2.6.0 remains a viable alternative, but requires more binding work and failed the blocked-popup preservation check in this prototype. No Phase 1 shell has been started.

## Experiment and environment

The isolated [prototype](../frontend/experiments/docking/) uses the same React `Probe` component for both libraries: context controls and an ECharts bar chart. It has two view IDs, one parent-owned UI session, and buttons to split, pop out, close and reopen the chart. It contains no mission backend, world store, map renderer, simulation engine, activity bar, or product design system.

| Dependency | Tested version |
| --- | --- |
| React / React DOM | 19.3.0 |
| FlexLayout React | 0.10.8 |
| Golden Layout | 2.6.0 |
| ECharts | 6.1.0 |
| Vite | 8.3.0 |
| TypeScript | 7.0.2 |
| Playwright | 1.63.0 |
| json-schema-to-typescript (contract generation only) | 16.0.0 |
| Node / npm | 24.20.0 / 11.19.0 |
| Browser | Microsoft Edge 152.0.4191.66, headless |

Observed host: Windows 10 build 19045, Intel Core i7-10700K, 16 logical CPUs, 32 GiB RAM. GPU identity was not obtained; these are chart/docking checks, not GPU performance qualification. Main viewport starts at 1440×900 CSS pixels, resizes to 1280×800, and child chart resizes to 900×700. No physical second-monitor placement was tested.

## Results

Both development and production serving were tested. [Development results](../frontend/experiments/docking/evidence/results.json) and [production results](../frontend/experiments/docking/evidence-production/results.json) contain versions, dimensions and the layout after each child close.

| Check | FlexLayout | Golden Layout |
| --- | --- | --- |
| Activate Context → Chart → Context tabs | Pass | Pass |
| Split; retain selection ENTITY-B and time 1 | Pass | Pass |
| ECharts canvas and time-dependent values | Pass | Pass |
| Drag divider; chart follows pane width | Pass: 688→572 px in dev run | Pass: see recorded measurements |
| Resize main viewport; chart matches host | Pass | Pass |
| First pop-out: main time→child, child selection→main, resize | Pass | Pass |
| Close and pop out again, keeping context | Pass | Pass |
| Reopen/focus after child close | Pass | Pass |
| Close tab, recreate it with time 3 | Pass | Pass |
| Inject `window.open` returning null: chart remains usable | Pass, floating panel fallback | **Fail**, “Error: Popout blocked”; chart no longer visible |
| Playwright `pageerror` events | None captured | None captured (blocked exception caught by probe UI) |

FlexLayout completes eleven recorded checks. Golden completes nine before the blocked-popup preservation assertion times out; its pageerror list remains empty. The comparison command exits 1 intentionally because one candidate fails a requirement. Do not present this as an all-green suite. The selected library meets the bounded acceptance checks in both dev and production.

Visual evidence reviewed:

- [Flex split](../frontend/experiments/docking/evidence-production/flex-split.png), [Flex pop-out](../frontend/experiments/docking/evidence-production/flex-popout.png).
- [Golden split](../frontend/experiments/docking/evidence-production/golden-split.png), [Golden pop-out](../frontend/experiments/docking/evidence-production/golden-popout.png), [blocked-popup failure](../frontend/experiments/docking/evidence-production/golden-failure.png).

The blocked test is deterministic failure injection, not proof that a particular real popup-blocking browser configuration was exercised. Native browser `window.close()` was used to exercise beforeunload. An initial forced Playwright `page.close()` probe skipped that lifecycle and left stale layout content; that is not counted as a normal user-close result.

The shared ECharts probe was corrected to wait for nonzero host dimensions and schedule size changes through the owner window's animation frame. Final runs include console warning/error capture; initial zero-size and resize-loop diagnostics did not recur in the final development evidence. Console capture still records the intentional Flex blocked-window warning and a resource 404 during initial page loading (resource URL was not captured). Vite also reported the vendor theme's absent CSS source map during development; chart/layout rendering and the production build were unaffected. “No pageerror events” does not mean the console contains no diagnostics.

## Differences that matter for Sentinel

FlexLayout creates React portals into a same-origin popout document. Our existing session subscriptions continue there with no cross-window synchronization code. Closing the native child produces a **floating in-page layout**, not automatic reinsertion into the original tabset. The later workspace bridge should expose “Open to Side”/redock and make this behavior understandable. Pop-out again retains selection and time. The documentation describes the shared opener runtime and owner-document constraints. [FlexLayout README](https://github.com/caplin/FlexLayout/blob/master/README.md).

Golden Layout uses the documented virtual component binding. The prototype supplies component mounting/unmounting, virtual geometry, visibility and z-index handlers. Its child independently loads the application and explicitly accesses the same-origin opener's UI session. It is not a demonstration of backend-driven independent-window resilience. `popInOnClose: true` returns the view into a docked stack, but does not restore the exact prior split arrangement in the observed flow. [Golden framework binding](https://golden-layout.github.io/golden-layout/frameworks/), [Golden pop-outs](https://golden-layout.github.io/golden-layout/popouts/).

Flex split uses a native move action. To keep the Golden spike bounded, its Split button reloads a two-stack configuration with stable view IDs and remounts components; session state survives. This is a limitation of our Golden integration, not evidence that Golden cannot move components without remounting. Both use native draggable dividers. Arbitrary drag docking, drag reordering and exhaustive keyboard accessibility were not tested, so this decision does not certify them.

The blocked-popup observation and lower integration effort favor FlexLayout for this React-only hackathon. No need to spend the remainder of Phase 0 repairing the losing candidate's edge cases or writing a custom window manager. Keep both dependencies **only in the experiment** for reproducibility; Phase 1, if approved, must use only FlexLayout in the product package.

## Limitations and follow-up gates

- No MapLibre/Cesium or real WebGL workload tested. Repeat resize, lifecycle and pop-out checks with real renderers in the appropriate later phases. First demo pop-out should remain an analytic view.
- No backend/WebSocket or live/replay authority implemented; shared state here is explicitly UI probe state.
- Opener closure ends the shared runtime. No independent reload recovery, cross-origin windows, multi-monitor restoration or layout persistence certification.
- Full hidden-opener timer behavior, high-frequency telemetry, display scaling and complete keyboard/ARIA testing remain later gates. No FPS/latency claims derived from this probe.
- Full ECharts import produces a roughly 1.34 MB minified shared chunk (about 440 KB gzip including React) and Vite's >500 KB warning. Acceptable for a bounded comparison; later product should use ECharts modular imports and lazy views.
- Production popout.html was built and tested at the server root. Subpath deployment, CSP and COOP/COEP compatibility remain deployment checks.
- The selected version's native-close-to-float behavior must be reflected in the workspace UX; it is not silently treated as redocking.

## Reproduction

From `frontend/experiments/docking`, run `npm ci`, `npm run dev`, then `npm run verify` in a second terminal. For production, run `npm run build`, `npm run preview`, and set `SPIKE_URL=http://127.0.0.1:5179` and `SPIKE_EVIDENCE=./evidence-production/` before `npm run verify`. Test driver uses installed Microsoft Edge through Playwright; no browser download was required here. Both serving processes are local only.

The comparison intentionally returns nonzero for Golden's blocked-popup case. Inspect results per engine. Prototype code is not a ready-to-promote application shell.
