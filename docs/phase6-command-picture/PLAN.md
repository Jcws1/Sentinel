# Phase 6 plan and acceptance boundaries

Authorized 20 September 2026 before remaining Phase 5 closure. No timebox, commit,
push, replay controls or operational pop-outs. Preserve the actual dirty tree.

1. Inventory source, original data and ownership; define metrics and matched budgets.
2. Add shared frame/filter projections and one ECharts host. Deliver Overview,
   Resources, Recorded activity, Statistics and Comparison as Command Picture lenses.
3. Reuse one Vertical Profile in Command Picture, its workspace tab and Open to Side.
4. Verify aggregates, immutable audit cutoffs, altitude separation, lifecycle and
   selection with meaningful unit/backend/browser checks. Exercise the foreground UI.
5. Measure isolated matched workloads, run all regression gates, delegate a fresh
   independent critic, correct material findings and obtain fresh review as needed.
6. Archive raw evidence with SHA-256/readback, stop owned services, verify preservation.

## Decisions before implementation

- ECharts is the sole chart library; the old spike is absent from application
  dependencies. Add pinned ECharts to the frontend using modular imports.
- Current projections read the runtime presentation frame and existing entityRows
  arbitration/filters. Charts never read authoritative command state from a newer
  HTTP response. Camera changes do not invalidate projections.
- Audit needs an immutable frame ceiling, explicit recorded-time range and bounded
  pages. Add a read API over existing events/receipts, not a parallel event store.
- Historical analytics are explicitly refreshed snapshots, independent of live
  viewing time. Keep source timestamps separate from recording timestamps.
- Profile uses native altitude groups. No geoid/terrain conversion is currently
  authoritative. The maps' approximate MSL display is not an analytic conversion.
- Comparison uses raw speed/altitude/observation-age bars and values for at most
  four selected entities. No radar normalization or invented capability/readiness.
- Pending local requests and mutable external recovery status are identified
  separately from immutable recorded events; absence of a journal entry is not proof
  that no request was attempted.

## Predeclared performance workloads and budgets

Zero provider requests, fresh Edge contexts and task databases. Actual foreground
windows must be confirmed by native desktop enumeration/activation. No competing
tests/builds/benchmarks during display captures. Record CPU/GPU/display/browser,
viewport, DPR, source hash and durations. Narrow viewports are layout evidence.

Matched moving 10v10 and 20v20 at default and Sydney locations: Tactical and ordinary
3D closed analytics; each Command Picture lens; Profile; Command+Profile with both
maps where docking supports it. Use unchanged speeds and long existing routes.
30-second key windows; 12-second per-lens diagnostics. Include a synthetic large
projection (10,000 entities) and 10,000 journal events; distinguish it from supported
interactive capacity. Ten hide/show and close/reopen cycles, resize and mission swaps.

Targets: mean >=60 FPS, compositor p95 <=16.9 ms, p99 <=33.4 ms, zero >50 ms intervals
where the matched closed configuration supports those thresholds. Incremental
overhead: p95 increase <=5 ms, p99 <=10 ms; publication-age p95 increase <=100 ms;
selection-to-DOM p95 <=150 ms (not input-to-photon). No extra WebSocket; charts zero
while hidden/closed; no hidden projection/query work; cache <=8, audit page <=100,
history retains existing 1,000-frame/2,000-point bounds. Post-GC heap growth after
ten cycles <=20 MiB is a diagnostic budget, not a leak-free claim. Report every
window and failures; inherited D7/configured Video gaps remain separate.

The large synthetic fixture is explicitly a completed recording containing 10,000
entities and 10,000 journal rows, independent of supported moving interactive
capacity. Before running it, set a 3,000 ms diagnostic budget for opening each lens
and displaying the complete 10,000-row summary, with a 12-second settled main-thread
RAF p95 budget of 16.9 ms. RAF is diagnostic, not compositor/physical presentation
evidence. Capture foreground identity, source size, numeric pagination and chart
instances. A static recording does not need continuous repaint and cannot establish
moving 10,000-unit capacity. The four moving workloads use compositor samples.

## Acceptance matrix (evidence pending)

| Gate | Required evidence |
| --- | --- |
| Interactive/recorded analytics | Exact metrics, filtering, audit cutoffs, ended inspection |
| Supported external visualization | Typed module isolation, native MSL, NO_EFFECT/pair counts |
| Vertical Profile | Common-reference policy, origin/time, history breaks, all three hosts |
| Integration | Shared selection/Details/maps, no commands, navigation/docking/keyboard |
| Resources | Bounds/cancellation/hidden cleanup, matched foreground measurements |
| Regression | Complete backend/frontend/browser plus all static/schema/hash/build gates |
| Independent review | Fresh critic's own foreground 40-unit/non-default and recording checks |
| Preservation | Before/after inventory, archive readback, exact final tested/reviewed source |

External conformance, Phase 5 closure and inherited D7 performance are separate
decisions. No score can replace failed tests or missing actual foreground evidence.

## Final bounded chart-pipeline correction

Candidate 18's 60 Hz experiment reduces actual standalone chart cadence below
60 and does not close the combined frame-tail gate. Revert that experiment; retain
its independently verified compact tooltip. The remaining bounded correction is
inside the existing ECharts chart, using public `graphic.Circle`, `getZr` and
coordinate-conversion APIs for current interpolated markers. Current backing data,
axis layout and historical lines continue to update on authoritative projections;
motion only moves owned circles on the same canvas. No second renderer, transport,
store, recording/sample reduction, simulation rule or map-sampler change is allowed.

Before accepting it, verify: axes cover current-to-committed interpolation bounds;
no new-frame circle is projected through old axes; silent backing symbols cannot
duplicate hit targets; tooltip values come from the last rendered marker data;
original IDs, selection sizes, alpha, corrections and source-gap freeze survive;
mission changes and disposal release circles, handlers and tooltip state. Retain
numeric keyboard inspection and prove real-library behavior plus native pointer
selection. Fresh standalone/combined timing must precede final full verification.
If this bounded change cannot meet the unchanged budgets, document the remaining
Phase 6 non-pass rather than expanding into renderer or persistence optimization.

## Fresh-review bounded follow-up

The fresh reviewer confirms the quoted/backslash identity-search defect through
real interactive endpoints. Correct query encoding only, preserve the existing
raw JSON search, document ASCII-only case folding, and re-run complete backend
and browser gates before delivery. Stored data, identity, retries and cutoffs stay
unchanged; the reviewer independently verifies the correction.

Its separate candidate-20 CPU samples attribute less than 0.5% of wall time to
coordinate conversion, so an affine-converter rewrite is not justified. Canvas
paint/display-list work supports one further bounded experiment: ECharts' public
`useDirtyRect` initialization option on the current same-canvas Circle layer.
The earlier candidate-16 experiment predates that layer and does not establish
the new result. Identify this experimental source separately. Keep the full
population, 120 Hz target, source cadence, history, maps and unchanged equal-area
four-window budgets. Adopt only after passing representative pacing and visual
checks, then final regression/review; otherwise revert and retain the failure.
Do not extend this into a renderer/persistence redesign or relax any threshold.
