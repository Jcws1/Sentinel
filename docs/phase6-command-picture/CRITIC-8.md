# Phase 6 independent critic — candidate 20 review

**Candidate-20 review complete; acceptance withheld.** The critic did not implement product
source. The critic authored independent review probes and contributed measurement
harness coverage; product fixes and regression-suite corrections remained
implementer-owned. This report distinguishes personally executed checks from
implementer-supplied results and retains earlier failed candidates in CRITIC-1
through CRITIC-7. Missing final evidence is not a pass. In particular, candidate
19's independently measured combined-workspace performance finding remains open;
the candidate-20 tooltip correction does not purport to fix that cost.

Reviewer-contributed tracked harness files are
`frontend/tests/analytics/measure.mjs` (workload/resource/lifecycle coverage) and
`frontend/tests/analytics/foreground-browser.mjs` (fresh native context without
Playwright focus emulation). Other critic probes, samplers and offline parsers
are ignored evidence files. This is not a claim of independence from every line
of measurement tooling; the independent sampler and raw traces make that
methodology inspectable. A separate fresh final reviewer owns CRITIC-9.

## Candidate 20 source review

Frozen product inventory: 440 files, SHA-256
`a7de53f714a6f8ee0a8bf28fc587ca95b946cf9d97a13c694d54c78316fec77e`.
The implementer reports three product changes from candidate 19, with backend
and contract bytes unchanged. Independent final readback verified all 440 product
files; the receipt and cleanup results are recorded below.

The critic personally reviewed `profileSeries.ts:23`, `profileLayer.ts:94` and
`VerticalProfile.tsx:215`. ECharts now owns an HTML tooltip whose content is created
with the chart's owner document and assigned through `textContent`. Raw source
markup and braces remain literal text. `enterable: false` makes the overlay
pointer-transparent; `triggerOn: 'none'` leaves current-marker hover with the
existing public-circle handlers. The zero transition/hide delay avoids a delayed
tooltip from surviving its removed owner. No chart renderer, model, interpolation,
recording cadence, history point, source identity or motion deadline changes.

The formatter still resolves a current series' exact opaque identity against its
last painted tuple. A removed identity cannot inherit another point's old array
index. Disposed or unattached HTML callbacks return empty, and layer disposal hides
the library tooltip before chart disposal. Original historical data remains in
the numeric table; the UI explicitly says to hover current markers and inspect
historical samples numerically. Historical vertex/line tooltips are not claimed.

The new browser regression locates actual canvas marker pixels and checks the
visible DOM tooltip's text, bounds and 0.25 px within-marker pointer movement.
It also checks click-through Details selection, corrected-frame and resized
reinspection, removal and zero command dispatch. The correction/resize portions
rehover the marker; they do not by themselves prove uninterrupted tooltip presence
across a live projection boundary. Independent native monitoring remains separate.

The implementer supplied a passing focused browser result after the unchanged
candidate-19 version failed at the micro-movement assertion. The earlier native
capture interference and isolated projection-boundary blank in CRITIC-7 remain
distinct evidence. The critic has not relabelled those attempts as passes.

Independent native probes now inspect actual tooltip DOM visibility, complete
unit-labelled text, measured confinement bounds and pointer transparency. Canvas
pixels still determine the actual marker coordinate; direct CDP captures avoid
the previously reproduced screenshot preparation/pointer relocation. Archived
candidate-19 probes retain their original canvas-presence assertions.

## Personally verified final regression evidence

The critic executed **57/57 focused checks in seven files, exit 0, 7.54 seconds**
on candidate 20. These cover real-library projection/series/layer behavior, motion
deadlines, aggregate and altitude policies, lifecycle and exact history ownership.
No implementer test or build competed with them. The full frontend **486/486** and
backend **555/555** results are supplied evidence, not independently rerun full
suites. Backend bytes have not changed since the full backend run.

The critic independently traversed the entire final browser machine-readable
result, including all **126 tests** and wrapper exit status. Every test has one
actual passed result, retry 0, no errors; there are no skips, unexpected results,
flaky results or root errors. The wrapper exited 0. This verifies the supplied
complete-run result; it does not claim the critic executed that suite. The raw
JSON hash is `7f8a4a8b37f65d652d65d19619dc62a78395878c09d6a1ec79951dcefd26fa88`.
The critic's independent traversal is `critic-browser-final-7-reviewed.json`.

## Personally operated final foreground UI

Raw paths in this report are relative to
`C:/Archive/Coding/Sentinel3-archive/2026-09-20-phase6-command-picture/`, preserving
checkout-relative paths. Final archive/readback is implementer-owned. Native
runs use a fresh task database and browser context, blank/local providers, actual
Windows foreground PID checks, and continuous real focus/visibility monitoring.
They do not use emulated focus. The physical display is 2560×1440 with Windows
175% scaling; the configured application viewport is 1280×700 CSS pixels at
approximately DPR 1. This is foreground compositor evidence for that configured
viewport, not a native-DPR/full-2560 rendering claim. The narrower captures verify
760, 820 and 900 CSS-pixel layouts, not separate performance configurations.
Native diagnostics run `dist-verification-phase6` built from the frozen product
source. That mode enables bounded inspection bridges and render timestamp
capture; it is not byte-identical to the production bundle. The complete browser
runner serves both `dist-test-phase6` (403 files byte-identical to production) on
port 5181 and `dist-verification-phase6` on port 5182. Many runtime cases use the
latter; 126/126 is a final-source production-and-verification suite, not a claim
that every case ran on byte-identical production files. Dedicated production
cases and the production readback remain separate evidence. Instrumentation
is held constant across matched windows and is a methodology limit, not evidence
that the measured incremental regression can be ignored.

**Tooltip setup passed**, tag `critic-two-pane-control-candidate20-setup-a`, exit 0.
The critic hovered actual rendered marker pixels, nudged the pointer 0.25 pixels
within that marker, inspected complete visible tooltip DOM text and confinement
bounds, and captured its own PNGs. The measured chart widths were 205.143 pixels
and 459.143 pixels; the wider condition actually expanded the chart. Both
34-sample monitors have one initial pre-hover hidden sample followed by 33 visible
samples across five distinct committed frame identities, with no subsequent
invisibility or focus failure. Entity label, UTC sample time, ELLIPSOID reference,
three-decimal kilometre distance and two-decimal metre altitude remain readable.
The tooltip uses its owner document and `pointer-events: none`. The picked
original identity agrees with Tactical and Details, with zero command writes.
The critic personally inspected both initial and +350 ms narrow/wide captures
and the selected-entity capture. This passes the candidate-19 micro-movement
reproduction at these measured geometries; earlier failed captures remain failed
evidence. It does not certify every moving-marker/pointer geometry or
uninterrupted visibility in all layouts.

**Final UI B passed 35/35 cases**, tag `critic-ui-candidate20-b`, exit 0, zero
provider requests and application errors. The critic personally viewed all
42 screenshots. Coverage includes the moving Sydney 40-unit mission, actual
marker hover/click and shared map/Details selection, all six lenses and keyboard
controls at each requested narrow width, filters, comparison, origin/range
changes, split/reopen, shared 120-second read with distinct 120/15-second plots,
source gap and recovery, recorded inspection, and supported external switching.
The native gap check preserves the exact committed frame, point pixels and
selected identity for 500 ms after staleness; recovery retains the selection.
The immediate map-history demand path remains distinct from the coalesced
Profile-only path. Fleet Stop was accepted and held the selected resource while
the other 39 moved. Pause, Resume and End preserve exact authoritative history
anchors; paused readiness was 659 ms and there were no redundant reads during
the following 1.2 seconds. The ended audit includes `interactive.end`; analytics
inspection sends no command. External native MSL stays separately labelled and
BLUE affiliation creates no managed-resource authority.

The prior UI A attempt is retained as **exit 1 after five passed cases**. Its new
historical-line pixel locator incorrectly required alpha >200 for an antialiased
1.5-pixel line. The retained failure PNG and numeric observations showed the
history. The corrected review-only locator keeps the distinctive RGB colour and
more-than-five-pixel row coverage, permits positive antialias coverage, and
records actual RGBA. B found `[158,178,196,191]` on a 133-pixel row (alpha 191–212).
No product, assertion timeout or data was changed. Direct historical-line hover
does not show a tooltip; retained samples have the explicit numeric inspection
alternative. This is a documented capability boundary, not claimed hover
support.

Native setup and UI runs ended their task mission, stopped their services and
deleted only their disposable task database. Setup closed all chart instances
and canvases. Both successful and failed attempts remain retained for archiving.

## Final correctness and ownership assessment

The final source review, focused checks and personally operated UI support the
following conclusions. The more detailed initial findings and correction history
remain in CRITIC-1 through CRITIC-7; earlier failures were not replaced by later
passing subsets.

| Area | Evidence-supported assessment |
| --- | --- |
| Metrics and denominators | `projections.ts:29` separates mission totals from filtered map arbitration and explicit Assets from affiliation. `CommandPicture.tsx` preserves unknowns and selected-but-unavailable identities; signed altitude bars include zero. Counts do not invent management, readiness or confidence. |
| Recorded audit and statistics | `backend/app/recording/analytics.py:151` pins the committed frame/event sequence and receipt ceiling, bounds pages/summary work and orders ties by recording time/kind/sequence. `RecordedActivity.tsx:74` does not advance this cutoff with live frames. Requests remain distinct from events; retry identities and NO_EFFECT survive; affected-entity unions differ from interaction counts. This is recorded operational audit, not tamper-proof compliance or real-world effectiveness. |
| Time/filter/mission consistency | `observedHistory.ts:19` validates the complete returned anchor, reused by telemetry at `ObservedTelemetry.tsx:98`. Late responses and changed mission/entity/range cannot fill another projection. Current charts use the runtime frame and map selection/filter ownership; historical reads do not seek or alter live mission time. |
| Altitude and origin | `projections.ts:132`, `:146`, `:179` and `VerticalProfile.tsx` use the declared mission reference or a fixed selected-entity capture, native datum groups and visible exclusions. AGL/unknown conversion is excluded, never relabelled as exact ellipsoid/MSL. Captured origins do not reach backward before their source time. Historical exclusion counts use the displayed-track/current-window denominator and exclusive reasons. |
| Profile interpretation | Radial horizontal distance is not a terrain cross-section, clearance, coverage or engagement feasibility. Current circles use the same bounded sampler as maps; source gaps freeze at committed position. Observed paths preserve gaps/corrections/discontinuities and are separately labelled, with paginated source-time numeric inspection. The conservative axis envelope is not a fabricated observation. |
| Lifecycle and resources | One shared analytic projection owner and the existing observed-history owner replace independent per-card transports. Profile-only reads coalesce to the latest committed anchor without decimating samples; immediate map/final-frame/identity-change behavior is retained. Real hidden-document and 40 lifecycle cycles verify disposal and no hidden query/stream growth. The final public-circle layer uses ECharts' own canvas and public APIs, with exact-ID selection and tooltip disposal. |
| Persistence and compatibility | The selected-observation cache is byte/entry bounded. Proofs for exact fully validated bytes become visible only after successful SQL COMMIT, roll back with outer transactions, and use a separate short lock. Changed/unknown/legacy bytes retain strict validation. No recording cadence, schema migration, writer ownership, simulation fidelity or durability is changed. Strict cold historical decoding remains a latency limit, not a silently weakened validation path. |

Working supported interactive/recorded analytics and supported external projection
are separate conclusions from external conformance. The carried Phase 5 mixed-scale
polygon 500, large external batch responsiveness, historical 8.6/10 withheld
review and provisional compatibility interpretations remain in the deferred
register. The new 126-case browser result supersedes neither those issues nor
the incomplete configured-Video evidence. Phase 6 does not complete Phase 5,
introduce Timeline seeking/replay ownership, or authorize Phase 7/8 work.

## Performance and final disposition

### P2 — material combined-Profile pacing regression remains

**Personally reproduced on final candidate 20.** Ownership references are
`frontend/src/features/analytics/VerticalProfile.tsx:279`,
`frontend/src/features/analytics/ChartHost.tsx:248`, and
`frontend/src/features/analytics/profileLayer.ts:113`. These identify the active
motion/projection path, not a claim that one particular line is the measured CPU
bottleneck. The current implementation does not satisfy the agreed incremental
display budget in the supported combined workspace.

Reproduction: run `critic-two-pane-control.mjs` on Sydney 20v20, allow the recording
to reach 90 source seconds, keep the same four selected identities, filters,
overlays, 10 km cameras, Tactical/ordinary-3D map bounds and pane bounds, then take
four 30-second windows: two inert panes, two current Profiles, two Profiles with
60-second selected observed history, then the two inert panes again. Final tag:
`critic-two-pane-control-candidate20-a`, exit 0. All 40 tracks moved in every
window. Native focus/visibility, map point visibility, source isolation and
selection assertions pass; there are zero provider requests or application errors.
History readiness was 2,273 ms. Task services stopped and the disposable database
was deleted after authoritative End.

| Equal-area window | Compositor FPS | p95 ms | p99 ms | >50 ms intervals | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert before | 115.432 | 15.381 | 22.183 | 2 | 253 |
| Two current Profiles | 91.505 | 23.076 | 37.636 | 6 | 280 |
| Two Profiles, history 60 s | 91.194 | 29.192 | 38.435 | 6 | 280 |
| Inert after | 118.499 | 15.073 | 15.899 | 3 | 315 |

Current-only p95 increments are **+7.695 / +8.003 ms**, and historical increments
are **+13.811 / +14.119 ms**, exceeding the predeclared +5 ms budget against both
brackets. Current p99 increments are +15.453 / +21.737 ms; historical increments
are +16.252 / +22.536 ms, also exceeding +10 ms against both. Publication-age
increments remain within +100 ms. Baseline long frames are visible and remain
absolute nonpasses; they do not explain away the measured incremental regression.

Per-chart rendered-event captures independently expose current-chart p95
**33.1–34.7 ms** (about 79 events/s, 29 intervals >50 ms each), and historical-chart
p95 **32.1–32.9 ms** (about 80.6–80.7 events/s, 23–24 intervals >50 ms). These are
library render callbacks, not physical presentation timestamps. They prevent the
compositor mean from being used as a substitute for chart motion pacing. There
is no capture overflow. History traffic is 30 reads inside the 30.561-second trace;
the broader request-counter interval spans 41.648 seconds and contains 41 reads.
Dividing that broader count by the trace duration would be misleading.

The critic personally viewed all four post-window screenshots: no Profile tooltip
is visible. The last programmed pointer action in each preflight is the Tactical
Map-layers button followed by Escape. Continuous pointer coordinates are not
recorded, so uninterrupted non-hover is not asserted. Narrow/wide tooltip and
selection captures taken after measurement are separately verified; they are not
part of these pacing samples.

Impact: opening the supported combined workspace materially worsens frame tails
and chart-motion smoothness. This is a **Phase 6 acceptance blocker**, separate
from inherited D7/Video and Phase 5 issues. Do not change recording, fidelity,
retention or thresholds to mask it. A future bounded correction must reproduce
this same matched control and pass the unchanged incremental budgets, followed
by independent review. Further speculative renderer/scheduling changes are not
required to describe this delivery honestly. Candidate-20 complete matrix and
large-fixture results below do not close this finding; acceptance remains withheld.

### Complete final-source matrix

The critic personally executed **all 96 windows**, all **40 lifecycle cycles**
and four authoritative End/empty-entry confirmations in
`phase6-performance-critic-candidate20-a`. The wrapper exited 0. The critic then
read every raw trace and result, recomputed publication/source-clock age, checked
all 192 before/after visibility records, inspected per-chart captures, and
verified mission identity, all moving IDs, query/cache bounds and native focus.
There are **zero provider requests, application errors, foreground losses,
mixed-mission results, missing in-view projected IDs or clipped primary charts**.
Projected IDs may overlap; this is not a claim of 40 distinct, non-overlapping
glyphs. Hardware, exact source/helper copies, viewport bounds, screenshots and
raw render timestamps are retained with the run.

The critic also personally inspected 24 representative matrix PNGs: closed
Tactical, closed 3D, Tactical plus Profile, 3D plus Resources, Profile alone, and
two Profiles plus both maps for each of the four workloads. This is representative
visual readback, not a claim to have personally viewed every retained matrix
capture. The two charts remain visible in the dense four-column layout, but their
plot areas are narrow and map labels/glyphs overlap. Numeric inspection and pane
resizing remain useful; projected-ID completeness is not visual separability.
No additional material defect was identified in these captures.

The first offline parser attempt incorrectly demanded a chart-capture bridge in
the eight initial closed Tactical/3D baselines. The lazy analytics module had
never loaded and there were no charts in those windows. That derived result,
parser source and exit-1 log are retained. Correcting only the zero-chart
applicability rule produces a complete 96-row review with no integrity issues.
Raw measurements, original assertions, source and budgets were not changed.

Execution success is separate from performance acceptance: **10 configurations
fail an incremental budget; 39 of the 76 moving-target windows fail at least one
absolute target; two of four workloads fail the 150 ms input p95 budget**. The
20 static analytics-alone windows are not assigned a continuous-paint FPS target.
Every moving-target window has mean compositor FPS above 60, which does not
override its tail failures. No matched publication-age increment exceeds 100 ms.

| Incremental nonpass | p95 increment ms | p99 increment ms | Publication-age p95 increment ms |
| --- | ---: | ---: | ---: |
| Default 10v10, two Profiles + Tactical | 6.501 | 0.522 | 0 |
| Default 10v10, two Profiles + 3D | 0.012 | 14.139 | 18 |
| Default 10v10, two Profiles + both maps | 7.437 | 15.341 | 5 |
| Default 20v20, two Profiles + 3D | 7.318 | 23.433 | 64 |
| Default 20v20, two Profiles + both maps | 15.582 | 43.955 | 95 |
| Sydney 10v10, two Profiles + 3D | 0.021 | 14.679 | 5 |
| Sydney 10v10, two Profiles + both maps | 7.714 | 9.028 | 37 |
| Sydney 20v20, two Profiles + Tactical | 0.438 | 13.666 | 2 |
| Sydney 20v20, two Profiles + 3D | 7.197 | 16.542 | -22 |
| Sydney 20v20, two Profiles + both maps | 14.709 | 29.847 | 65 |

The canonical matrix compares ordinary operational layouts: docking changes map
bounds, and later Comparison selections can differ from an initial closed
baseline. Its increments describe the workspace change, not isolated ECharts
cost. The separately bracketed control above holds geometry, selection, filters,
overlays and cameras fixed and independently confirms a material Phase 6 cost.
The critic does not attribute every absolute long-frame failure to inherited D7.

Input-to-DOM p95 is 137.215 / **169.004** / 98.240 / **153.237 ms** for default
10v10 / default 20v20 / Sydney 10v10 / Sydney 20v20. Each has ten samples, so
nearest-rank p95 equals the maximum; these are bounded observations, not a
population latency guarantee. Overall 40-sample p95 is 151.535 ms. The two
20v20 nonpasses remain open alongside the primary P2 pacing finding. This
measurement is not input-to-photon latency.

After ten hide/show/resize/close/reopen cycles per workload, post-GC JS heap growth
is **1.162 / 1.206 / 1.131 / 1.148 MiB**, below the 20 MiB diagnostic budget.
Every hidden check has zero active charts, zero new audit/history reads and no
additional mission WebSocket. A bounded run cannot prove the absence of every
long-duration leak. The original recording continues at its existing cadence;
these resource checks do not discard recorded history.

Raw source-clock-age p95 ranges **1,986–15,754 ms** across the matrix. It is
computed separately as wall time minus source-effective time. Publication age
uses `recordedAt`; the legacy raw field named `sourceAgeMs` actually holds this
publication measure. The two clocks must not be relabelled as equivalent.
Per-chart render/motion arrays are retained in 24 Profile windows with no
overflow. The raw helper does not retain exact compositor start/end clock
boundaries, so the critic checks its compositor quantiles against result/source
and audits its collected traces, rather than claiming an independently
re-windowed compositor distribution.

### Final standalone current and history measurements

The final `critic-standalone-candidate20-a` run contains two 30-second Sydney
40-unit windows with no visible map. Both have all 40 tracks moving, real native
focus throughout, zero provider requests/application errors and no capture
overflow. The wrapper exits 0. History readiness is **1,458 ms**. This requests a
120-second window from the available retained recording; it does not manufacture
120 seconds of data in a younger mission.

| Standalone window | Compositor FPS | Compositor p95 / p99 ms | Compositor >50 ms | Chart-render events/s | Chart-render p95 / p99 ms | Chart-render >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current Profile | 109.345 | 15.526 / 23.449 | 2 | 114.378 | 15.5 / 22.1 | 1 |
| Profile with requested 120 s history | 106.217 | 15.532 / 30.600 | 9 | 112.296 | 15.7 / 25.9 | 5 |

Motion callback rates are 108.746 / 105.562 per second; their p95/p99 intervals
are 15.2/28.9 and 15.5/33.9 ms. These are actual owner-clock samples, not a promise
that the nominal 120 Hz ceiling is reached. The standalone mean/p95/p99 compositor
targets pass in these samples, while the zero-long-frame target does not. Chart
render events remain distinct from final physical presentation.

Both standalone PNGs were personally inspected. The current points, separately
styled observed path, native-reference numeric rows and explicit retained-read
versus plot-window text are visible. The historical capture reports 410 compatible
available samples; it does not imply a full 120 seconds of observations.

The real hidden-document check observes zero charts, zero motion subscribers,
zero retained observed points, zero new history requests and the same projection
count (423) over 1.2 seconds. Reopening restores one chart and native foreground;
authoritative End then empties the active entry. Cleanup stops task services and
deletes the disposable database. The current/history evidence on the final source
supersedes reliance on candidate 19 for these conditions.

### Final larger synthetic fixture

`phase6-large-critic-candidate20` is explicitly synthetic: 10,000 entities and
10,000 recorded events, three separate 12-second settled samples. It completes
exit 0 with zero provider requests, application errors or foreground losses.
Initial load plus Overview is **2,066.9 ms**. All three lens-readiness values pass
the unchanged 3,000 ms diagnostic budget.

| Lens | Readiness ms | Settled RAF p95 / p99 / max ms | >50 ms | Post-GC JS heap MiB |
| --- | ---: | ---: | ---: | ---: |
| Overview reactivation | 59.9 | 8.1 / 8.1 / 8.4 | 0 | 39.68 |
| Statistics | 1,905.0 | 8.1 / 8.1 / 8.5 | 0 | 40.35 |
| Vertical Profile | 385.9 | 8.1 / 8.5 / 30.7 | 0 | 72.33 |

The cache remains one frame/two computations; active chart counts are two, one
and one, respectively. This is a static aggregation/rendering diagnostic,
**not moving 10,000-unit capacity or a compositor pacing certificate**. The critic
personally inspected all three screenshots. Overview visibly separates 10,000
filtered and mission-total observations, Statistics shows the complete 10,000-row
event range, and the Profile explicitly labels 10,000 compatible synthetic points.
The densely overlapping points are an aggregation stress fixture, not a claim of
individual visual separability. Task cleanup is complete.

## Source, preservation and cleanup readback

At **2026-09-21 01:49:15 UTC**, the critic independently hashed all **440 product
files** against the candidate-20 manifest: zero mismatches. All **84 backend app
files** match candidate 6, the source of the completed backend suite and focused
history/proof checks. The manifest hash is unchanged. The receipt is
`frontend/test-results/phase6-command-picture/critic-candidate20-final-source-cleanup.json`.

All seven final-candidate task runs, including failed UI A, report stopped
services, successful cleanup, deleted task databases and no active mission. The
critic verified those databases are absent, all recorded task browser/service
PIDs are gone, and all ten task ports bind free. The reviewer did not open or
write operator databases, browser profiles, credentials or unrelated files.
Full protected-work preservation and external archive SHA-256/readback are
implementer-owned final gates, not claimed as personally performed here. No
commit, push or later-phase implementation was performed.

## Subsequent fresh-review evidence

After the measurements and source readback above, the implementer relayed a new
finding from the separate fresh reviewer: a valid recorded interactive acquire
identity containing quotes or backslashes cannot be found by entering its exact
displayed text, because the audit query searches the JSON-escaped stored body.
Stored identities and bytes remain correct and the operation is read-only. This
critic has not independently reproduced that case; its reproduction, severity
and correction review belong to CRITIC-9. The implementer accepted a narrowly
scoped query correction with real-endpoint regression coverage and fresh complete
backend/browser gates. Candidate-20 results must not silently certify any later
product source.

The fresh review also retained a first native tooltip attempt that lacked a
tooltip. Subsequent geometry inspection placed the moving marker 63 pixels from
the pointer, and a complete second 35-case run with unchanged strict assertions
passed. These are supplied findings, not this critic's own measurements. They do
not replace or expand the bounded tooltip evidence reported above.

The scores below were reached at the conclusion of this critic's own candidate-20
verification, before CRITIC-9's search finding. They are preserved as a dated
assessment of that personally verified scope, not a final disposition of the
later search correction or the fresh reviewer's independent score.

## Scores and acceptance

These scores are this critic's independent judgment of the supported Phase 6
scope. They do not certify deferred external conformance, inherited D7/Video or
Phase 5 closure, and cannot override a failed gate. The separate fresh review in
CRITIC-9 owns its own findings and scores.

| Dimension | Score / 10 | Basis |
| --- | ---: | --- |
| Data / analytic correctness | 9.4 | Explicit denominators, native altitude partitioning, exact cutoff/identity checks, corrected missing/excluded values, recorded retry/outcome semantics and truthful simulation labels. |
| Frontend correctness | 9.2 | Final focused and complete browser results, personally operated 35-case native UI, all 42 final UI captures, actual marker/nudge/selection checks, narrow layouts and genuine hidden lifecycle. Pacing is scored separately below. |
| Compatibility / recovery | 9.1 | Existing writer/recording authority preserved; exact-byte proof/rollback/fallback checks; source-gap recovery, ended inspection and supported external switching. Strict cold history and unresolved external interpretations remain explicit limits. |
| Performance / resource efficiency | 6.0 | Complete matrix, large static and lifecycle resource bounds are measured; combined-Profile p95/p99 and two input gates still fail. Standalone means and p95 do not erase long-frame tails. |
| Maintainability | 9.0 | Shared projections, bounded owners, typed external boundary and public chart APIs with meaningful lifecycle/real-library tests. The custom current-marker layer and proof cache require continued disciplined coverage. |
| **Overall** | **8.5** | **Acceptance withheld: the material Phase 6 P2 performance finding is unresolved.** |

The analytic workspace is usable for the supported interactive and recorded
data, and supported external visualization has been exercised. This is not
unconditional Phase 6 acceptance. The complete test suite passes, but the declared
performance gate does not. No recommendation, score, average FPS or passing
subset replaces that gate. Finish archive/preservation readback and the fresh
review, retain the performance nonpass, and stop within Phase 6.
