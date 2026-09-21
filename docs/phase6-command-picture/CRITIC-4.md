# Independent critic: complete candidate-15 native matrix

This report extends `CRITIC-1.md` through `CRITIC-3.md`. The reviewer did not
implement product source. Candidate 15 comprises 438 product files with manifest
SHA-256 `618432350e5084eae80aa75c15b06c8b9bca5cdf59a0f3f2955fe6055a335256`.
The results below were personally executed, parsed and inspected by the critic.
They do not supersede or erase the retained failed and partial attempts.

## Complete measurement evidence

`phase6-performance-critic-candidate15-c` completed all **96/96 windows, exit 0**,
four authoritative End transitions and four sets of ten lifecycle cycles. Its
exact harness and visibility-helper copies are retained with the result. The
critic parsed every measurement and budget comparison into `critic-analysis.json`.
There were no provider attempts, page errors or native foreground continuity
failures. Task services stopped and the task database was deleted. Execution
completion is not a performance pass.

The setup used fixed mission-origin cameras with a 10 km horizontal span. Each
window retained before/after map projected-identity and primary-chart viewport
checks. The critic personally inspected all eight combined end-of-window images:
moving map objects and both complete plot canvases are visible. Projected object
counts are renderer-scene evidence, not independent pixel counts. The routes are
closely spaced and some native map symbols and labels overlap.

The twelve windows below exceed at least one predeclared incremental budget
(p95 +5 ms, p99 +10 ms, recording-publication age p95 +100 ms). These are measured
Phase 6 workspace increments. They cannot be dismissed as inherited-only because
some matched closed configurations pass every absolute pacing budget.

| Configuration | Δ p95 ms | Δ p99 ms | Δ publication-age p95 ms |
| --- | ---: | ---: | ---: |
| Default 10v10, two Profiles + Tactical | 6.965 | 0.540 | 34 |
| Default 10v10, two Profiles + both maps | 8.090 | 14.074 | 25 |
| Default 20v20, Resources + ordinary 3D | 0.012 | 8.515 | 207 |
| Default 20v20, two Profiles + Tactical | 7.016 | 8.188 | 30 |
| Default 20v20, two Profiles + ordinary 3D | 7.464 | 7.835 | 38 |
| Default 20v20, two Profiles + both maps | 22.384 | 29.794 | 81 |
| Sydney 10v10, Comparison + ordinary 3D | 0.007 | 14.173 | 13 |
| Sydney 10v10, two Profiles + both maps | 15.234 | 22.388 | 39 |
| Sydney 20v20, Recorded activity + ordinary 3D | 0.004 | 14.505 | 50 |
| Sydney 20v20, two Profiles + Tactical | 0.977 | 12.778 | 34 |
| Sydney 20v20, two Profiles + ordinary 3D | 13.636 | 15.220 | 18 |
| Sydney 20v20, two Profiles + both maps | 22.090 | 37.563 | 115 |

Forty-two moving-target windows miss at least one absolute budget. Average FPS
does not override p95/p99 or long-frame failures. Five static lenses alone per
workload are explicitly exempt from the moving-target pacing test; standalone
moving Profile remains subject to it. The harness field `sourceAgeMs` measures
age from `recordedAt`, hence publication age. Actual source-clock age must be
derived separately from retained `sourceAt`, `recordedAt` and the sample age.

The subsequent independent raw audit parsed all 96 trace files and inspected all
192 before/after visibility records. It independently recomputed point inclusion,
chart containment and publication-age quantiles, and checked sampled mission
identity, focus and cache/history limits. No discrepancy was found. There are
76 moving-target and 20 static-only windows. `critic-raw-reviewed.json` retains
every trace hash and source-clock-age derivation. The historical harness did not
retain monotonic start/end bounds, so compositor quantiles were audited against
its executed source and result, not claimed independently reconstructed from a
fully specified raw interval. The next bounded probe retains those bounds.

| Ten-cycle workload | Selection-to-DOM p95 ms | Post-GC heap growth MiB |
| --- | ---: | ---: |
| Default 10v10 | 106.844 | 0.290 |
| Default 20v20 | **155.921** | 0.766 |
| Sydney 10v10 | 122.772 | 1.413 |
| Sydney 20v20 | **153.252** | 2.386 |

Both 20v20 workloads exceed the 150 ms input budget. Aggregating all forty checks
must not hide those per-workload non-passes. Every cycle ended with zero charts,
zero hidden history/audit reads and no extra mission stream. The bounded heap
results are below 20 MiB; this is not a proof that all workloads are leak-free.

Closed versus open docking changes map area, and later Comparison interaction
introduces a four-entity selection. These measurements describe the operational
workspace change, not isolated ECharts CPU cost. A separately predeclared,
equal-area two-inert-pane control is required for stronger attribution.

## Final synthetic larger-workload check

`phase6-large-critic-candidate15` completed in native foreground, exit 0, with
10,000 explicitly synthetic entities and 10,000 events. The critic read the full
result, all frame stamps, the wrapper exit and cleanup, and personally inspected
all three screenshots. `critic-reviewed.json` retains the analysis and source
result hash. Initial load plus Overview took 1,846.858 ms. Subsequent readiness
was 44.030 ms for Overview, 1,403.033 ms for Statistics and 278.122 ms for Profile,
all within the predeclared 3,000 ms budget. Settled static rAF p95 was 8.1 ms for
all three views; p99 was 8.1, 8.1 and 8.4 ms, with no intervals above 50 ms.
There were no provider attempts, page errors, focus losses or timeout. Services
stopped and the task database was deleted.

These are static-load/readiness and settled-rAF diagnostics. They do not certify
moving 10,000-entity workloads, full physical-resolution rendering, or compositor
pacing. The native window was on a 2560×1440 display, while the configured content
viewport was 1280×700 at approximately DPR 1. The Profile screenshot honestly
shows substantial overplotting; accessible numeric inspection remains necessary.

## New findings on candidate 15

### P2 — material combined-workspace performance budget misses remain

Reproduce with the complete native matrix above, particularly either 20v20
two-Profile/both-map window. Impact: visible moving analytics can materially
increase frame tails and input latency. The matrix and exact raw traces establish
the non-pass; they do not by themselves isolate its implementation cause.

Relevant paths are `frontend/src/features/analytics/VerticalProfile.tsx`
(`onMotion` current-series update) and `ChartHost.tsx` / `chartMotion.ts`
(chart-owned queued updates). Library inspection shows partial `setOption`
still enters ECharts' complete series update/render pipeline. That is a concrete
candidate for diagnosis, not proof that it accounts for every missed budget.
Keep source and budgets fixed while measuring the equal-area control; any valid
correction needs fresh independent focused, actual UI and performance review.

### P2 — altitude Comparison bars can conceal their zero baseline

Location: `frontend/src/features/analytics/CommandPicture.tsx:381-382`.
The altitude override uses `scale: true`. The critic independently reproduced its
real ECharts behavior in `critic-comparison-zero-baseline`: same-datum heights
180 m and 185 m produce an axis extent of `[180,185]`, putting zero at
−12,353.88 px outside a 500 px chart. The 180 m bar clips at the left plotting
edge while the 185 m bar spans its width. The resulting visible bar lengths
exaggerate a 2.8% difference even though numeric labels retain the raw values.
Negative-only values show the symmetric problem.

The six-case SVG/axis-layout reproduction is a real-library check, not a new
native-UI run. Removing the fixed minimum while retaining `scale: false` gives
`[0,210]` for 180/185 and `[-210,0]` for −185/−180; mixed-sign data remain valid.
Use a zero-inclusive bar axis and test positive-only and negative-only values.
Keep native datum grouping and null/missing values unchanged.

### P3 — dense four-column Profile labels overlap or clip

Location: `frontend/src/features/analytics/VerticalProfile.tsx` axis layout
(approximately lines 194–196 on candidate 15). At roughly 260 px pane width,
the radial axis name clips its final unit characters and young-history tick
labels overlap. Reproduced in personally inspected matrix and control-preflight
screenshots. Numeric inspection and ordinary-width views retain units and values;
this is a presentation limitation rather than a changed measurement or datum.
Consider compact/wrapping axis labels or a readable minimum plot width without
changing the radial-distance interpretation.

The acceptance gate remains open. No score or complete execution result may
override these material Phase 6 findings. Phase 5 external-conformance and
inherited D7/configured-Video gaps remain separate.

## Equal-area Sydney 20v20 control

The critic and implementer agreed this bounded diagnostic before execution:
90 seconds of source history, four 30-second windows, fixed four-entity shared
selection, fixed filters/overlays and 10 km mission-origin cameras. Two existing
inert panes (Settings and Credits) occupy the exact same tabsets as Command
Picture and dedicated Profile. The two map bounds remain 436×637.7 and
260×637.7 CSS pixels; supporting pane bounds are 260×637.7 each. This controls
the area and selection differences in ordinary closed/open docking.

`critic-two-pane-control-candidate15-setup-a` first verified current, inert and
history arrangements without timed windows, exit 0. The critic personally
inspected all three preflight screenshots. `critic-two-pane-control-candidate15-a`
then completed every declared window, exit 0, after 90.8 seconds of source time.
All 40 units moved in every window. Before/after scene points and complete plots
remained visible, selection and overlays were unchanged, and native foreground
continuity was valid. All four timed screenshots were personally inspected.

| Configuration | Mean display FPS | p95 ms | p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert panes before | 118.444 | 15.098 | 15.970 | 1 | 262 |
| Two current-only Profiles | 75.949 | 28.947 | 31.506 | 3 | 292 |
| Two Profiles with 60s history | 69.403 | 31.016 | 39.016 | 7 | 280 |
| Inert panes after | 117.087 | 15.265 | 16.021 | 1 | 310 |

Both Profile configurations materially exceed the incremental frame-tail budgets
against either inert bracket. Current-only p95 adds 13.849/13.682 ms against the
before/after controls; history adds 15.918/15.751 ms. The majority of this measured
cost exists without history. The inert brackets still contain one >50 ms interval
each; their mean/p95 results do not convert that absolute miss into a pass.

History became ready in 2,530 ms and retained 301 observations at the end of its
window. Across both chart instances, current-only produced 128.17 motion and
9.96 full-option updates per trace second; history produced 117.00 motion and
11.57 full-option updates. Inert panes produced no chart updates or history reads.
The history counter recorded 39 requests, but its enclosing interval includes
native checks and tracing drain: the retained foreground timestamps alone span
39.856 seconds while the trace window is 30.590 seconds. It is therefore not
valid to call this 39 requests per 30.590 seconds or infer a throttle violation.
The independent control's initial WebSocket URL matcher was too narrow and
recorded zero; that probe does not certify stream count. The canonical complete
matrix used the correct matcher and retains its one-stream evidence.

Two separate ten-second main-thread CPU profiles followed all timing windows.
They are diagnostic evidence with profiler overhead, not acceptance samples.
The current/history profiles attribute approximately 2,441/2,459 ms inclusive to
the chart animation/update path and 1,829/1,777 ms to a nested chart update path;
these nested times must not be added together. MapLibre's render path accounts
for approximately 2,703/2,552 ms inclusive. This supports substantial chart work
under combined-map load; it does not attribute all frame tails to one method.
Both `.cpuprofile` files, exact source, raw traces and parsed summaries are retained.

There were zero provider attempts or page errors. Authoritative End completed,
services stopped and the task database was deleted. The critic independently
hashed every one of the 438 product files after the run: all still matched
candidate 15. CPU/UI ownership was then returned before the implementer's next
correction. Candidate 16's proposed changes require fresh independent review;
they are not a retroactive pass for these measurements.

## Candidate-16 correction review in progress

Frozen product manifest: 438 files, SHA-256
`f923ff790355eac22b47d5fc24ed11253e5c143a296382c90d7f32495c5fc931`.
Only `ChartHost.tsx`, `CommandPicture.tsx` and `VerticalProfile.tsx` changed from
candidate 15. The critic's independent five-file focused run passed **49/49,
exit 0**, including real-ECharts positive-only, negative-only and mixed-sign
bar proportionality, full/deferred projection correction, memoized values,
history identity and hidden lifecycle checks.

Source review confirms that signed altitude bars include zero without clamping
negative values. Memo keys include ordered entity identities, labels, raw values
and units; reusing an option does not freeze the frame header or pick identity.
The current scatter uses the public `zlevel` option, and the existing ECharts
Canvas renderer uses dirty rectangles. The implementation adds no renderer or
new world/history ownership and does not lower motion/source/recording cadence.

The native `critic-two-pane-control-candidate16-setup-a` passed, exit 0. All three
screenshots were personally inspected: current/history plots each have exactly
two canvas layers, and hiding both panes removes every canvas and chart instance.
The compact `Distance (km)` axis name and overlap suppression are readable in
the previously problematic 260 px panes, closing the reproduced P3 presentation
defect for that layout. Four timed matched windows remain required to determine
whether the paint change reduces the measured cost. Full final acceptance and
all required final-source regression/display gates remain open.

The subsequent `critic-two-pane-control-candidate16-a` completed all four windows
and the separate CPU pair, exit 0. The critic personally inspected all four timed
screenshots and independently rehashed all 438 product files: no mismatch.
The paint/layer change did **not** resolve the material performance finding:

| Candidate-16 configuration | Mean display FPS | p95 ms | p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert panes before | 119.016 | 15.087 | 15.997 | 1 | 264 |
| Two current-only Profiles | 75.049 | 28.633 | 31.433 | 1 | 283 |
| Two Profiles with 60s history | 64.276 | 37.314 | 46.999 | 19 | 295 |
| Inert panes after | 115.385 | 15.395 | 16.052 | 3 | 307 |

Current-only cost is essentially unchanged, while this history sample is worse.
Neither chart configuration meets the incremental budgets against either inert
bracket. The CPU profiles also retain roughly 2.47/2.46 seconds inclusive in
the chart update loop and 1.82/1.80 seconds in its nested update path; these
diagnostics provide no established benefit for keeping the extra layer.

History readiness was 2,715 ms and the final retained count was 301. The corrected
traffic accounting confirms one mission stream throughout: 38 history requests
over the enclosing 39.286-second counter interval, of which 30 occur inside the
30.680-second trace window. This is consistent with approximately one refresh per
second; transport event receipt timestamps are not exact browser dispatch times.
Inert/current windows made no history read. The final hidden state had zero chart
instances and zero canvases. Native continuity, visibility, selection and 40-unit
movement checks passed; there were no providers or page errors. End completed,
services stopped, and the task database was deleted before CPU/UI was returned.

The critic recommended removing the ineffective paint/layer experiment while
preserving the independently verified zero-baseline, semantic memo and compact
axis-label corrections. A subsequent implementation must receive fresh review;
these failed measurements remain part of the record.
