# Phase 6 performance evidence

Status: candidate 20's final 96-window matrix is complete, with 10 incremental
budget failures, 39 absolute failures among 76 moving-target windows, and two
input-response misses. Overall performance acceptance is withheld. A separate
fresh reviewer is completing representative checks. The predeclared workloads and budgets are in
[PLAN.md](PLAN.md); raw successful, failed and interrupted attempts are retained.

## Environment and attribution

Intel Core i7-10700K (8 cores / 16 logical processors), NVIDIA GeForce RTX 3060,
physical 2560 × 1440 display reporting 144 Hz, Windows, Microsoft Edge
153.0.4234.48. Foreground performance uses a fresh headed browser at 1280 × 700
CSS pixels, DPR 1, blank grid/local fixtures, and task-owned SQLite databases.
The OS foreground window PID must belong to the task browser, with document
visibility/focus tracked throughout the sample. Builds, test suites and other
benchmarks are stopped during display measurements.

The timed application is the final-source **verification build**, with bounded
diagnostic bridges and chart render timestamp capture. It is not byte-identical
to the production bundle. These results describe that instrumented configuration;
matched closed/open windows retain the same instrumentation. No uninstrumented
production or physical scanout certificate is claimed. This limitation does not
waive the measured incremental frame-tail failures.

The CSS viewport/DPR is configured through CDP, even though the browser is actually
in the foreground and the traces record compositor presentation. In candidate 12,
the page reports a 1280 × 700 emulated screen and DPR approximately 1; independent
Win32 enumeration reports the physical 2560 × 1440 desktop and an approximately
2279 × 1385 task-window outer rectangle. These results apply to the configured CSS
viewport on that physical display, not full-display 2560-pixel rendering or a
native-DPR benchmark. Per-run records preserve both sets of measurements.

Browser screenshot dimensions and 760/820/900-pixel layouts are layout evidence,
not physical display performance. Earlier sandbox-desktop attempts and an
interruption by a foreground Chrome window do not qualify as display passes.
Average FPS alone cannot satisfy the p95/p99/long-frame requirements. Static cards
need not repaint continuously; their source age, input response, recomputation,
chart counts and memory remain relevant. Input-to-DOM timing is not input-to-photon.

The source-effective simulator clock advances in fixed ticks. Subtracting it from
wall time measures a different quantity from publication staleness. Recording age
is separately sampled from the current committed frame's `recordedAt`; it includes
normal publication cadence. Both timestamps remain visible in the product.

## Independent representative samples before the history correction

Personally executed by the critic on candidate 4, supplied to the implementation
owner via retained results. Sydney 20v20, all 40 tracks moving, two 30-second
foreground windows, no provider requests:

| Configuration | Compositor p95 / p99 (ms) | Recording-age p95 (ms) |
| --- | ---: | ---: |
| Tactical; analytics closed | 20.814 / 27.737 | 244 |
| Tactical; current Profile, history disabled | 20.874 / 27.816 | 267 |

The 0.060 ms p95 and 23 ms recording-age increments are small, but the closed
baseline already misses the strict 16.9 ms display p95 target. These windows do
not establish sustained 60 FPS acceptance, history performance or final-source
acceptance. The following history workflow failed and led to a narrow correction.

## Retained-history correction

[HISTORY.md](HISTORY.md) explains the full-validation compact read cache and its
compatibility tests. On a task-only 90-second moving 40-unit recording, the
120-second query returned 451 observations identically across cold, warm and
uncached reads. Cold was 4,528.6 ms; repeated reads were 107.0, 94.7 and 92.6 ms.
The cache contained 451 entries / 463,910 serialized bytes. Cold validation cost
remains; these backend diagnostic timings do not replace foreground re-review.

## Candidate 7 large synthetic recording

The independent critic personally ran `phase6-large-2` against candidate 7 in the
foreground, inspected all three screenshots, and recorded exit 0 with no reported
focus loss, provider attempt or page error. The later focus-emulation finding below
limits the continuity claim; the final source requires a repeat. The fixture contains 10,000
entities and 10,000 journal events; the transferred world response was 8,352,874
bytes. All data remains labelled synthetic. It is not a moving 10,000-unit capacity
claim. The browser's native outer rectangle (0,0)–(2268,1379) fits within the
physical 2560×1440 display; configured content viewport is 1280×700, DPR about 1.

| View | Readiness ms | Settled RAF p95 / p99 / max ms | >50 ms | Post-GC JS heap MiB |
| --- | ---: | ---: | ---: | ---: |
| Initial load + Overview | 1,798.0 | 7.1 / 7.1 / 7.4 | 0 | 39.68 |
| Statistics: complete 10,000-event summary | 1,914.1 | 7.1 / 7.1 / 7.2 | 0 | 40.36 |
| Profile: 10,000 compatible native positions | 307.4 | 7.1 / 20.9 / 55.7 | 1 | 64.59 |

The repeated Overview-lens activation itself took 37.4 ms. Each settled sample is
12 seconds. These pass the predeclared 3,000 ms readiness and 16.9 ms RAF-p95
diagnostics; the Profile tail and its one >50 ms interval remain visible. RAF is
main-thread scheduling evidence, not a compositor presentation certificate.
The current projection cache retained one frame/two computations across all three
lenses. Chart counts were two, one and one respectively; replaced charts disposed,
and the recorded Profile had no active motion segment. Raw samples, task cleanup
and the derived `summary.json` are retained with the screenshots.

## Final moving matrix

Completed against candidate 15: default and Sydney 10v10/20v20, every lens
with Tactical, with ordinary 3D and alone; current/historical Profile together with
maps; ten hide/show, resize and close/reopen cycles; selection response and memory.
The larger explicitly synthetic 10,000-entity / 10,000-event recording is separate
from supported moving interactive capacity. Final raw results and quantitative
comparison tables are retained in the raw evidence and summarized below.

`phase6-performance-critic-candidate15-c` completed all 96 windows, four sets of
ten lifecycle cycles and four authoritative Ends, exit 0. The independent critic
reports zero focus/visibility failures, provider attempts or page errors. Every
window verifies all 20/40 identities within each visible map and all primary chart
canvases within their panes. Services stopped and the task database was deleted.

Execution completion does **not** mean performance passed. The complete result
contains 12 incremental budget non-passes, 42 applicable absolute non-passes, and
two per-workload input non-passes. Selected material results from the critic's
complete analysis are:

| Workload / configuration | Increment p95 / p99 ms | Publication-age p95 increment ms |
| --- | ---: | ---: |
| Default 10v10, two Profiles + Tactical | +6.965 / +0.540 | +34 |
| Default 10v10, two Profiles + both maps | +8.090 / +14.074 | +25 |
| Default 20v20, two Profiles + both maps | +22.384 / +29.794 | See full result |
| Sydney 10v10, two Profiles + both maps | +15.234 / +22.388 | See full result |
| Sydney 20v20, two Profiles + both maps | +22.090 / +37.563 | +115 |
| Sydney 20v20, two Profiles + ordinary 3D | +13.636 / +15.220 | See full result |

Default 20v20 Resources beside 3D has a separate +207 ms publication-age p95
non-pass. Input-to-DOM p95 is 106.844 / 155.921 / 122.772 / 153.252 ms in workload
order; the latter measurement includes Playwright click actionability and IPC,
so it is not an input-to-photon claim. All four post-GC growth diagnostics pass
(0.290 / 0.766 / 1.413 / 2.386 MiB), with zero closed charts, hidden query reads
or additional mission streams across the lifecycle cycles. The implementer also
read every final raw trace through an independent parser: all 96 windows, 192
visibility records, movement, mission Ends and resource checks agree with the
critic's analysis. Source-clock-age p95 spans 2,117–15,728 ms across these windows;
this uses `recordedAt + publication age - sourceAt` and is distinct from the
publication-age budget for the fixed-tick simulation clock.

These are operational workspace comparisons: opening panes changes map bounds,
and later Comparison selection remains active in the combined layouts. They do
not isolate chart CPU cost. A separately declared four-window Sydney 20v20
control holds camera, exact map/pane bounds, four selected identities, filters and
overlays constant while swapping two static panes with two Profiles. Its purpose
is attribution; it cannot erase the complete matrix's non-passes or replace a
fresh complete final-source run after correction.

The independent control `critic-two-pane-control-candidate15-a` confirms material
chart cost beyond map-area differences: inert-before/inert-after p95 is
15.098/15.265 ms; two current Profiles 28.947 ms, two Profiles with 60s history
31.016 ms. All 40 units move in every window, with no focus loss/provider/page
error. History readiness is 2,530 ms. Separate 10-second CPU diagnostics include
roughly 2.44/2.46 seconds in ECharts animation updates, with nested chart-update
time 1.83/1.78 seconds. These inclusive times overlap and are not additive or
acceptance pacing. The candidate-16 public dirty-rectangle/zlevel change is an
experiment requiring fresh matched measurement; its benefit is not assumed.

Request counts surround native foreground checks as well as the trace, so dividing
them by trace duration overstates the query rate. In this control the history
trace spans 30.590 seconds, while before/after native identity timestamps span
39.856 seconds inside the broader request-counter interval. Its 39 reads do not
establish a throttle violation. The repeated probe now retains request timestamps
and both exact intervals. Previous counts remain counts, not certified per-second
rates. The original control's overly narrow WebSocket matcher also cannot certify
stream count; the complete canonical matrix independently measures one stream.

Candidate 16's identical repeat retained the non-pass: inert-before/after p95
15.087/15.395 ms, two current Profiles 28.633 ms, two history Profiles 37.314 ms.
History had 19 intervals over 50 ms, with 2,715 ms readiness. All four windows
retained the fixed geometry, selection and moving 40 units, with valid native
focus, no providers/errors, one mission stream and complete cleanup. Four canvas
layers while open and zero after hiding were independently verified, but there
was no measured performance benefit. The extra-layer/dirty-rectangle experiment
was removed. Improved request capture measured 38 history reads over the broader
39.286-second counter interval and 30 during the 30.680-second trace window;
this is consistent with the existing one-second refresh policy.

Candidate 17 replaces rich current-point option objects with typed primitive
dimensions and public identity/name/tooltip encoding. Full cadence, point counts,
source metadata, stale alpha and selection sizes remain unchanged. Avoiding the
library's per-item style/label models is supported by source inspection and a
real-library `hasItemOption` check, but its performance benefit still requires
the independent matched control and complete final-source workloads.

The independent native large recording repeat `phase6-large-critic-candidate15`
also completed, exit 0, with all three screenshots personally inspected by the
critic. Initial load plus Overview took 1,846.858 ms. Lens readiness was 44.030 /
1,403.033 / 278.122 ms for Overview / Statistics / Profile. Settled 12-second RAF
p95 was 8.1 ms in all three, p99 8.1 / 8.1 / 8.4 ms, with zero >50 ms intervals,
focus losses, provider attempts or page errors. All readiness/p95 diagnostics
pass. This synthetic 10,000-entity/10,000-event ended recording remains static
diagnostic evidence, not moving 10,000-unit certification.

The first final-source attempt stopped after 20 windows at a retained map-title
locator; the second stopped after 48 at the next mission's validation. Its HTTP
200 response had `canRun: false`; independent controlled reproduction established
that closing the browser immediately after the End-menu click can leave the
asynchronous End request unfinished. The corrected harness awaits the actual
ended state and an empty authoritative active-mission slot before closing Edge.
No command, lifecycle or writer semantics changed. Full failed attempts remain.

Personal inspection also found that the earlier retained cameras let later moving
routes leave the map, and one Profile canvas could remain below its scrolled pane.
Those partial measurements describe their actual configured workspaces, not a
completed visible-moving-map/two-visible-plot gate. Their non-passes remain valid
for those configurations: default 10v10 combined p95 increments +6.780/+6.974 ms;
default 20v20 combined maximum +14.573 ms p95, +15.637 ms p99 and +126 ms publication
age. Default 20v20 selection p95 was 166.367 ms, above 150 ms. No inherited-only
attribution is made. The earlier candidate-12 representative samples likewise
do not prove every marker remained within the viewport throughout their windows.

`visible-workload.mjs` now uses the existing renderer camera APIs, setting each
map to the active mission/location origin and a fixed 10 km horizontal span. This
covers the complete unchanged horizontal routes at both locations. It centers
the first chart within each analytic scroller, then records map/canvas geometry,
camera, frame identity and every projected entity before and after each timing
window. Each map must contain all 20/40 expected projected identities with a
16-pixel inset, and both Profile canvases must fit within pane and browser bounds.
Native screenshots supplement these verification hooks. Source speeds, routes,
cadence, renderer quality, recording and display budgets remain unchanged.

Setup-only preflight `phase6-setup-candidate15-visible-b` passed all 96 layouts,
four authoritative End transitions and four ten-cycle lifecycle checks, exit 0;
zero provider requests/page errors, all owned services stopped and database deleted.
It collected no performance windows and cannot pass a timing gate. Its first
attempt preserved a harness assertion error after 24 layouts: the contract permits
the empty active-mission field to be omitted as well as null. The corrected poll
validates HTTP success and enabled entry, then normalizes only that optional field.
The critic independently inspected the helper and representative actual screenshots.

At the dense four-column 1280 px layout, approximately 250 px analytic panes can
crowd x ticks and clip the long axis title. Numeric tables retain explicit distance
units. The critic rates this P3 usability polish; do not claim arbitrary-width
chart readability. Ordinary 3D map-label overlap is separately inherited.

Candidate 5's independent repeat still failed the first-history five-second UI
check. Its current-Profile sample also showed a 6.911 ms p95 increase, exceeding
the 5 ms incremental budget. Details had been opened for selection before that
sample and the OS window moved during the closed sample; this is a failed and
confounded comparison, not evidence that all later measurements share one cause.
The final harness closes incidental Details before each named measurement.

Candidate 6 adds bounded validation proofs from successful full-validation commits.
The matched backend diagnostic is 1,029.6 ms first recent-commit read and
84.0/91.3/82.9 ms repeated; clearing the proofs/cache takes 4,592.4 ms through the
strict historical reader. Complete response hashes match. This improvement needs
fresh foreground verification and does not change the declared display budgets.

## Candidate 7 incremental cost and candidate 8 correction

The critic's `critic-round1-f` used Sydney 40 moving tracks, closed incidental
Details, and sampled three 30-second windows. Closed Tactical compositor p95/p99
was 20.838/27.767 ms; current Profile was 27.777/34.723 ms; Profile with 120-second
history was 27.702/34.723 ms. The +6.939/+6.864 ms p95 increments exceed the 5 ms
budget. Recording-age p95 was 257/277/284 ms. This is a Phase 6 incremental
non-pass, separately from the closed baseline's inherited D7 non-pass.
Mature-history readiness passed the unchanged five-second UI check at 2,670 ms.

Candidate 8 coalesces chart-only motion updates with a 60-per-second ceiling.
On a 144 Hz display the actual rate can be about 48 Hz; this is not a guaranteed
60 Hz chart paint rate. It samples the unchanged shared presentation sampler at
the actual update time, and drains the last pending update after motion stops.
New projection, hidden-document and disposal boundaries cancel queued work by
generation. Full option changes remain authoritative; changing a callback alone
no longer rebuilds the chart. Deferred ECharts motion updates can coalesce before
painting. Neither maps, interpolation bounds, source cadence nor recording change.
Diagnostics expose motion updates separately from full option updates. New tests
cover a 144 Hz source clock, trailing time, quiescence, superseded callbacks and
immediate hidden cleanup. Fresh matched physical measurements determine acceptance.

The independent candidate-8 standalone repeat confirmed a material non-pass:
current Profile 53.114 FPS, p95/p99 20.958/27.836 ms; 120-second observed-history
Profile 56.458 FPS, 21.009/34.736 ms. Both were 30.4-second foreground windows with
40 moving units, no visible map, and zero focus loss, provider attempts or page
errors. The execution succeeded but the unchanged 60 FPS pacing target failed.

Candidate 9 replaces phase-reset minimum spacing with accumulated 90 Hz deadlines.
90 Hz is a bounded scheduling target with headroom for 60 FPS presentation; it is
not a strict minimum-spacing ceiling. At 144 Hz it can use alternating one/two-frame
slots; a 60 Hz schedule necessarily includes 20.83 ms slots. All painting runs
through one queued rAF, skips missed deadlines and uses the actual owner-window
clock. Tests cover 144/120/60 Hz, final sampling, duplicate notifications, long stalls
and cancellation. No display budget, simulation or recording setting changed.
Independent standalone and matched-map repeats remain the deciding evidence.

## Foreground harness correction

The critic independently found Playwright 1.63 enables focus emulation for ordinary
contexts. A second CDP session cannot override the original session's setting.
Earlier native PID checks still establish task ownership before/after each sample,
but DOM focus/visibility cannot independently establish uninterrupted foreground
continuity in those attempts. Failed hidden-tab probes did not establish a real
visibility transition and are not product failures.

The revised harness uses a fresh task-owned Edge server/profile and its default
context through documented `connectOverCDP({noDefaults:true})`. It retains native
PID checks and requires a real two-tab visibility smoke check before final samples.
No operator profile is attached or cleared. All earlier raw measurements and failed
probes are retained with this limitation; they do not replace the corrected gate.

Inherited D7 pacing and configured Video remain open. No provider budget resets,
new providers, tile downloads, recording-cadence changes, discarded history or
weaker transaction durability are part of this phase.

## Candidate 9 equal-area control

The fresh independent `critic-matched-area-candidate9` run verified before timing
that both Credits and Profile leave exactly one Tactical map at x=40, y=62.286,
width=616, height=637.714 CSS px. Each window contains 40 moving Sydney units,
about 30.5 seconds, valid native foreground ownership and zero provider/page errors.

| Workspace | FPS | Compositor p95 / p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Full-area closed Tactical | 90.995 | 20.831 / 27.762 | 1 | 261 |
| Equal-area static Credits control | 108.140 | 13.965 / 20.872 | 2 | 268 |
| Equal-area current Profile | 116.941 | 13.925 / 20.850 | 0 | 282 |
| Equal-area 120-second observed history | 105.229 | 20.835 / 27.806 | 6 | 298 |

History adds 6.870 ms to p95 against the equal-area control, exceeding the unchanged
5 ms budget. Its p99 increment is 6.934 ms and publication-age increment 30 ms;
those pass. The ordinary full-area closed comparison masks the history cost.
History readiness is 3,708 ms, within the unchanged 5-second UI check. There are
601 retained observations at the sample boundaries, with 592 compatible points in
the captured plot after current-window trimming. This is a material Phase 6
incremental non-pass, not an inherited D7 attribution.

The separate `critic-standalone-candidate9` current/history measurements are
85.532/84.907 FPS, p95 20.815/20.824 ms, p99 20.941/27.773 ms and 7/5 intervals over
50 ms. Mean rate improves, but strict p95 and long-tail targets do not pass. Actual
backgrounding separately confirms zero chart instances, zero history requests and
unchanged projection computations for 1,200 ms. Failed quantitative gates remain
visible even though the probe execution and cleanup succeeded.

Candidate 10 retains ECharts axes/views for the fixed-kind Profile using explicit
series replacement. Removed history series are deleted rather than retained by
ordinary merging. Other chart kinds retain full replacement. Complete serialized
filter identity avoids rebuilding paths for cloned but unchanged filters; frame,
selection, origin, datum and history dependencies remain. Current-frame trimming
and every retained historical point/break are unchanged. Real ECharts tests cover
corrected/removed history, replaced entity data, cleared series and recalculated
axis extents. Component tests cover unchanged filters and advancing-window trimming.
No source, query or recording cadence, durability or display threshold changed.
Fresh independent measurements determine whether this correction is sufficient.

## Candidate 10 result and candidate 11 query policy

The independent equal-area candidate-10 repeat kept 40 Sydney units moving for
four approximately 30-second windows, with valid native foreground ownership,
zero provider attempts and zero page errors. Static Credits control was 97.458 FPS,
p95/p99 15.984/23.017 ms; current Profile 112.182 FPS, 15.512/22.985 ms; 120-second
history 100.794 FPS, 22.236/23.595 ms. History therefore added **6.252 ms p95** and
failed the unchanged 5 ms incremental budget. Its p99 increment (0.578 ms) and
publication-age increment (30 ms) passed. Long intervals over 50 ms were 0/1/4.
History readiness was 3,663 ms. Full-option updates fell to 7.519/s with history,
but model reuse alone did not close the material performance finding.

Candidate 11 coalesces only Profile-only running-live history query demand to at
most one start per second. It retains every returned sample, the exact committed
anchor and source-time window trimming. Map history demand, paused/ended final
frames and changed query identity remain immediate. The UI exposes read cutoff
and current plot-window end separately. This does not change source or recording
cadence, durability, interpolation or simulation fidelity. New scheduler tests
exercise retained samples, trailing latest-frame demand, map upgrades and cleanup.
Fresh independent equal-area, standalone and full-matrix measurements are pending;
the earlier quantitative failures remain failures.

## Candidate 11 independent equal-area result

`critic-matched-area-candidate11` passes the incremental budgets on the final
query-policy candidate. The critic personally verified exact equal map bounds,
all 40 Sydney units moving, native foreground continuity and all six screenshots.
Four approximately 30-second windows had zero provider attempts/page errors and
normal task cleanup. The actual canvas tooltip and pointer selection again agree
with Tactical and Details, including the supplied photograph, without a command.

| Workspace | FPS | Compositor p95 / p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Full-area closed Tactical | 84.546 | 22.847 / 30.420 | 2 | 288 |
| Equal-area static Credits control | 97.732 | 15.972 / 23.058 | 1 | 276 |
| Equal-area current Profile | 111.100 | 15.525 / 22.837 | 3 | 271 |
| Equal-area 120-second observed history | 104.212 | 16.008 / 23.638 | 3 | 282 |

History adds 0.036 ms p95, 0.580 ms p99 and 6 ms publication age: all pass the
unchanged incremental budgets. First history readiness is 3,640 ms. The response
contains 601 retained points; the screenshot shows 591 compatible observations
after current-window clipping, with both cutoffs explicit. Full-option/motion
updates are 4.918/73.187 per second for current and 5.966/69.333 for history.
The long-frame counts remain strict absolute non-passes. This representative
incremental pass does not replace standalone, complete moving-matrix, larger
fixture or final browser evidence, which remain in progress.

The independent candidate-11 standalone repeat retains a narrower unresolved
pacing result: current Profile 85.987 FPS, p95/p99 16.023/23.345 ms; 120-second
history 84.020 FPS, 21.818/29.837 ms. Both have two intervals over 50 ms. The
history p95 is 5.795 ms higher than current-only and exceeds the absolute 16.9 ms
target; it is not attributed to inherited map pacing. Publication-age p95 is
259/261 ms. History readiness is 1,457 ms. Both windows contain 40 moving Sydney
units with valid native focus, zero provider/page errors and normal cleanup.
Actual backgrounding confirms zero charts, no history reads and unchanged
projection computations. A separate CPU diagnostic is being collected before
running the long matrix; profiling does not occur inside declared timing windows.

## Candidate 12 chart paint scheduling

Separate 10-second CPU profiles on candidate 11 show increased ECharts work with
history: sampled inclusive animation update 644→935 ms, ECharts update 506→685 ms,
flush 238→387 ms, paint list 184→314 ms and setOption 146→219 ms. GC is 35→63 ms.
These nested times are not additive and profiler overhead prevents interpreting
these windows as acceptance pacing. Raw profiles/traces are retained in
`critic-cpu-candidate11`; no profiler ran during the declared comparison windows.

Candidate 12 uses a 120 Hz accumulated scheduling target, retaining one queued
callback, actual owner-window time, skipped missed deadlines and trailing sampling.
A sub-microsecond numerical tolerance avoids falsely skipping exact 120 Hz ticks.
Full Profile options now use ECharts deferred painting: model replacement is
immediate and ordered, while full/current-only updates can share the next paint.
Static chart kinds remain synchronous. Real ECharts tests retain corrected history,
remove obsolete series/entities and recompute axes even when a motion patch arrives
before the deferred paint. No new renderer, query/sample changes or altered display
budgets are introduced. Fresh independent measurements must decide this correction.

## Candidate 12 independent representative measurements

Both corrected standalone and equal-map-area measurements passed the p95/p99
incremental budgets. These are candidate-12 evidence, before the later range-label,
historical-exclusion-count and MSL-key corrections; the final complete matrix is
still required. All windows contained 40 moving Sydney units, valid uninterrupted
native foreground ownership, zero provider attempts and zero page errors.

| Workspace | FPS | Compositor p95 / p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Standalone current Profile | 110.647 | 15.509 / 23.028 | 2 | 247 |
| Standalone 120s history | 108.527 | 15.525 / 23.460 | 6 | 268 |
| Equal-area static Credits control | 99.491 | 15.728 / 22.695 | 1 | 289 |
| Equal-area current Profile | 113.860 | 15.337 / 22.554 | 1 | 277 |
| Equal-area 120s history | 105.275 | 15.782 / 23.117 | 3 | 279 |

Standalone history adds 0.016 ms p95, 0.432 ms p99 and 21 ms publication age.
Equal-area history adds 0.054 ms p95, 0.422 ms p99 and reduces age by 10 ms.
History readiness was 1,465 ms standalone and 3,772 ms alongside Tactical. The
same-area response retained 601 samples, of which 590 remained in the current plot
window. The critic inspected the screenshots and selected actual rendered points,
confirming the same entity in Tactical and Details without commands. Actual hidden
state had zero charts, zero history reads and unchanged projection computations.

The nonzero counts above 50 ms are explicit strict absolute failures, despite the
improved means and passing p95. No blanket inherited-D7 attribution is made. These
representative runs do not certify every lens, workload or final product source.

## Candidate 17 control and candidate 18 scheduling correction

The independent candidate-17 four-window Sydney 20v20 control completed with
unchanged map/pane geometry, 40 visible moving identities, valid native foreground
continuity, zero providers/errors and task cleanup. Inert-before/after p95 was
15.137/15.191 ms; two current Profiles were 23.999 ms and two 60-second-history
Profiles were 30.492 ms. Both failed the unchanged +5 ms p95 and +10 ms p99
incremental limits against both brackets. Primitive tuples improved part of the
cost but did not close acceptance. Separate CPU diagnostics retained substantial
ECharts update work; nested samples are not additive. [CRITIC-5.md](CRITIC-5.md)
contains the complete table, exact denominators, native selection and source checks.

Candidate 18 changes only the chart-owned accumulated scheduling target from
120 to 60 Hz, preserving actual-clock sampling, skipped deadlines, projection
generation reset and a final trailing paint. This is a UI paint policy, not a
change to source ticks, map sampling, retained samples, recording or simulation.
The original per-display scheduling tests now assert the explicit 60 Hz policy,
including exact 60/120/144 Hz clocks, late callbacks, stalls and trailing samples.
The quantitative performance budgets are unchanged. A configured target alone
does not establish observed 60 FPS or acceptable frame tails.

Verification builds add opt-in bounded timestamps for each chart's motion callback
and ECharts `rendered` event, separately from compositor measurements. A capture
holds at most 16 charts and 4,096 times per event kind/chart, reports overflow and
is released when stopped. The canonical sampler starts/stops this capture inside
its timing interval. No diagnostic listener is installed in the production build.
These timestamps distinguish requested updates from canvas rendering, but are
not an input-to-photon or per-chart physical scanout measurement. Fresh independent
standalone and combined measurements are required before judging the correction.

The candidate-18 independent result rejects that experiment. Standalone current /
history compositor rates were 59.122/59.384 FPS, with p95 23.517/23.975 ms. Direct
chart rendered rates were 58.558/58.852 per second, p95 23.5/24.5 ms. Combined current
charts rendered about 51.2 per second; with history about 46.6, despite higher
whole-workspace means from the maps. The four-window control still exceeded both
incremental frame-tail budgets. [CRITIC-6.md](CRITIC-6.md) records the complete
unchanged-workload results and cleanup. The 60 Hz change has been reverted.

Candidate 19 retains the previous 120 Hz scheduling target and addresses the
measured model-update cost directly. Public ECharts circles on the existing canvas
move between authoritative projections without a `setOption` pipeline. Full model
and axis updates remain synchronous at projection/resize boundaries, followed by
same-turn marker reprojection and flush. Current backing symbols and the axis-only
interpolation envelope are silent/invisible; historical lines and all retained
samples remain ordinary ECharts data. No private model mutation, second renderer,
map/source cadence, simulation or recording change is introduced. Fresh independent
standalone/combined and large-fixture measurements are pending; no pass is inferred
from the architectural change or unit results.

## Candidate 19 representative result; candidate 20 tooltip correction

The independent 30-second standalone current/history windows improve compositor
cadence to 108.44/106.52 FPS, p95 15.525/15.542 ms and p99 23.538/30.597 ms.
Direct chart render callbacks are 113.36/112.78 per second, p95 15.6 ms. The
compositor still has 7/5 intervals over 50 ms; chart rendering has 4/1. These
strict tails remain non-passes, even with improved sustained cadence.

The equal-area Sydney 40-unit control keeps map/pane geometry, selection and
overlays constant and brackets the open charts with inert controls:

| Window | Compositor p95 / p99 ms | >50 ms |
| --- | ---: | ---: |
| Inert before | 15.118 / 15.947 | 1 |
| Two current Profiles | 23.013 / 30.950 | 1 |
| Two 60-second-history Profiles | 23.528 / 38.532 | 3 |
| Inert after | 15.441 / 21.608 | 1 |

Current p95 increments are +7.895/+7.572 ms; history +8.410/+8.087 ms. History
p99 increments are +22.585/+16.924 ms. These exceed the unchanged +5/+10 ms
budgets. The two current charts render 81.45/81.31 times per second with p95
32.5/32.0 ms and 18/14 intervals over 50 ms; history charts render 80.58/80.34,
p95 32.2/32.0 ms, with 23/26 such intervals. Map FPS does not substitute for
chart cadence. Publication age rises 242 to 275 ms for the current window.
The 2,348 ms history-ready result and 31 reads inside its 30.601-second trace
retain all available samples. The enclosing counter covers 43.404 seconds/42
reads, not the 30-second timing interval. No overflow, focus loss, provider
request, page error or extra mission stream was recorded; cleanup passed.

Candidate 20 changes only tooltip behavior in three product files, with no
additional performance experiment. ECharts' non-enterable HTML tooltip avoids
intercepting the current marker when confined over it. Its final-source full
matrix and independent measurements are required; the candidate-19 budget
misses are not waived or relabelled as inherited D7 gaps. This bounded phase
does not extend into a renderer/persistence redesign to chase a score.

## Final candidate 20 matched control

The critic independently repeats the same Sydney 40-unit, equal-area four-window
control on the final product. Each window is 30 seconds after the 90-source-second
warmup, with identical four-entity selection, map/pane geometry, cameras, filters
and overlays. All 40 tracks move; focus, visibility and point-containment checks
pass. No provider request or page error occurs. Execution exit is 0 and task
cleanup passes; execution success does not imply budget acceptance.

| Window | Compositor FPS | p95 / p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Inert before | 115.432 | 15.381 / 22.183 | 2 | 253 |
| Two current Profiles | 91.505 | 23.076 / 37.636 | 6 | 280 |
| Two Profiles with 60 s history | 91.194 | 29.192 / 38.435 | 6 | 280 |
| Inert after | 118.499 | 15.073 / 15.899 | 3 | 315 |

Current p95 increments are **+7.695/+8.003 ms** and history increments
**+13.811/+14.119 ms**, compared with the before/after brackets. Both exceed +5 ms.
Current p99 increments are +15.453/+21.737 ms; history +16.252/+22.536 ms, above
+10 ms against both brackets. Publication-age increments pass their +100 ms budget.
Baseline long frames are retained as absolute nonpasses; they do not erase the
additional chart cost. This is a material Phase 6 defect, separate from inherited
D7 and configured Video.

Actual chart rendered-event p95 is 33.1–34.7 ms for current points and 32.1–32.9 ms
with history, about 79 and 80.6–80.7 events/second respectively. Counts above 50 ms
are 29 per current chart and 23–24 per historical chart. These library callbacks
are not physical scanout. They show why whole-workspace average FPS is insufficient.
History readiness is 2,273 ms; 30 reads occur inside the 30.561-second trace, while
the broader 41.648-second counter interval contains 41 reads. No overflow occurs.
All four post-window screenshots show no tooltip; the last programmed pointer
action is Map layers then Escape, with no continuous pointer-position capture.

[CRITIC-8.md](CRITIC-8.md) records the independent reproduction and source references.

## Final candidate 20 complete matrix

`phase6-performance-critic-candidate20-a` completes **96/96 windows**, wrapper
exit 0, four workload Ends and **40 lifecycle cycles**. The critic and implementer
each read the complete result and raw traces, including all **192 before/after
visibility records**. Every expected map shows all 20 or 40 moving identities,
the primary charts are visible, and every timed window has valid native foreground
and continuous focus/visibility. Providers, application errors, unexpected mission
sockets and chart-capture overflows are zero. This execution result is separate
from the unchanged numerical acceptance budgets.

All 60 comparable open-map windows pass the publication-age increment budget.
All 48 single-lens/map windows pass incremental p95/p99 budgets. **Ten of the 12
two-Profile/map combinations fail at least one interval increment**:

| Workload / open maps | Delta p95 ms | Delta p99 ms | Delta publication-age p95 ms |
| --- | ---: | ---: | ---: |
| Default 10v10 / Tactical | 6.501 | 0.522 | 0 |
| Default 10v10 / 3D | 0.012 | 14.139 | 18 |
| Default 10v10 / both | 7.437 | 15.341 | 5 |
| Default 20v20 / 3D | 7.318 | 23.433 | 64 |
| Default 20v20 / both | 15.582 | 43.955 | 95 |
| Sydney 10v10 / 3D | 0.021 | 14.679 | 5 |
| Sydney 10v10 / both | 7.714 | 9.028 | 37 |
| Sydney 20v20 / Tactical | 0.438 | 13.666 | 2 |
| Sydney 20v20 / 3D | 7.197 | 16.542 | -22 |
| Sydney 20v20 / both | 14.709 | 29.847 | 65 |

These matrix comparisons include the existing docking geometry change. The equal-area
bracketed experiment above separately establishes additional Profile cost with map
and pane dimensions held constant. It does not excuse these workload nonpasses.

Of **76 moving-target windows**, **39 fail one or more absolute pacing targets**;
none fails mean 60 FPS. Most failures include long intervals. The 20 static standalone
card windows do not need continuous repaint and are excluded from that denominator.
Closed baselines also have long intervals; neither that fact nor high mean FPS
turns open-workspace tails into a pass. All 96 individual rows and exact applicability
remain in `all-windows.csv` and `reviewed-summary.json` alongside the raw traces.

Publication-age p95 spans **214–424 ms** across the matrix; source-clock-age p95
spans **1,986–15,754 ms**. The latter includes the fixed-step simulator's accumulating
source-clock drift and is not a claim of a 15-second publication outage. Both time
bases are retained. The snapshots contain at most 301 selected observed points and
one shared current projection frame; the existing recording/history bounds remain.

| Ten-cycle workload | Input-to-DOM p95 ms | Post-GC heap growth MiB |
| --- | ---: | ---: |
| Default 10v10 | 137.215 | 1.162 |
| Default 20v20 | **169.004** | 1.206 |
| Sydney 10v10 | 98.240 | 1.131 |
| Sydney 20v20 | **153.237** | 1.148 |

The two 20v20 input values miss 150 ms. They include automation and DOM readiness,
not input-to-photon latency. All 40 closed cycles have zero chart instances, zero
hidden history/audit reads, and zero additional mission sockets. Heap growth is
below the 20 MiB diagnostic budget; this is bounded-cycle evidence, not a leak-free
claim. Task services/browser contexts stopped and the task database was deleted.

## Final standalone and large-recording checks

The separate Sydney 40-unit `critic-standalone-candidate20-a` probe has two 30-second
windows. Current Profile measures **109.345 FPS**, p95/p99 **15.526/23.449 ms**, with
**two** intervals above 50 ms. With selected history it measures **106.217 FPS**,
**15.532/30.600 ms**, with **nine** such intervals. Actual chart-render callback p95
is **15.5/15.7 ms**, with **one/five** intervals above 50 ms. These are distinct
compositor and library measures. History readiness is **1,458 ms**. A real hidden
check finds zero charts, subscribers and history reads with unchanged projection
count. Exit 0 and cleanup do not waive the observed long-frame failures.

The final `phase6-large-critic-candidate20` fixture is explicitly a static synthetic
10,000-entity/10,000-event recording. Initial load plus Overview takes **2,066.861 ms**.
All lens readiness and settled 12-second main-thread rAF p95 diagnostics pass:

| View | Lens readiness ms | rAF p95 / p99 / max ms | >50 ms | Post-GC JS heap MiB |
| --- | ---: | ---: | ---: | ---: |
| Overview | 59.935 | 8.1 / 8.1 / 8.4 | 0 | 39.684 |
| Statistics, complete summary | 1,905.046 | 8.1 / 8.1 / 8.5 | 0 | 40.349 |
| Profile, compatible positions | 385.934 | 8.1 / 8.5 / 30.7 | 0 | 72.327 |

All three keep one shared frame and two total aggregate computations. Replaced
charts dispose; the ended Profile has no active motion segment. Native foreground,
focus, zero providers/errors and cleanup pass. Main-thread rAF in an ended fixture
is not moving-10,000 capacity or physical-scanout evidence. The final source's larger
Profile heap is reported directly; older candidate measurements are not substituted.

Raw final paths retain their checkout-relative form in the Phase 6 archive under
`frontend/test-results/phase6-command-picture/`. Final scored acceptance and fresh
reviewer reproduction are recorded in DELIVERY.md and the critic reports.

## Fresh final reviewer reproduction and rejected experiment

The separate final reviewer wrote no product, regression-test or tracked measurement
harness source. Its own candidate-20 Sydney 40-unit equal-area control keeps both
maps, cameras and pane geometry fixed and brackets two open Profile modes with
inert panes. All four windows are 30 seconds, genuinely foreground, with every
unit moving, zero provider requests and no application errors.

| Window | Mean FPS | Compositor p95 / p99 ms |
| --- | ---: | ---: |
| Inert before | 118.59 | 15.168 / 15.961 |
| Two current Profiles | 96.11 | 22.912 / 30.467 |
| Two Profiles with observed history | 87.24 | 30.001 / 45.649 |
| Inert after | 117.10 | 15.219 / 16.009 |

Both open modes exceed the unchanged +5 ms p95 and +10 ms p99 increment budgets
against both brackets. The history window has 15 intervals over 50 ms, maximum
230.052 ms. Publication-age p95 is 258/278/337/309 ms; source-clock-age p95 is
4,191/4,584/5,930/7,107 ms, retaining the distinction between publication and
fixed-step clock drift. The reviewer's own native UI repeat passes 35/35 with
42 screenshots, but does not override those quantitative nonpasses.

Separate diagnostic CPU samples show coordinate conversion below 0.5% of sampled
wall time. Chart option updates, automatic flushes and display-list painting are
larger contributors; these overlapping sampled subtrees cannot be summed or
treated as exact call durations. This evidence does not justify speculative
coordinate or renderer rewrites within this phase.

Candidate 21 tries only the public ECharts `useDirtyRect` option. Its independently
measured current p95/p99 is 22.964/30.822 ms and history is 29.004/38.634 ms. Both
again miss the same incremental budgets against both inert brackets. Tooltip,
micro-movement and actual selection checks pass, but the performance hypothesis
fails. The option is exactly reverted. Failed and successful measurements, source
inventories and cleanup receipts remain retained; there is no performance closure
claim based on this experiment.

Candidate 22 changes only audit query search forms. Every frontend product file
and all 403 production/test outputs match candidate 20; source, history and
recording behavior also remain unchanged. The complete final regression and
separate production-UI search verification cover that correction. The 96-window
matrix and matched controls retain candidate-20 attribution, not a claim of a
new candidate-22 timing run. [CRITIC-9.md](CRITIC-9.md) records personally verified
results, source references, raw paths, remaining findings and final scores.
