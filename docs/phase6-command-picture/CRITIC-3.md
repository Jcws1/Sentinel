# Phase 6 independent candidate-9 follow-up

Status: **review in progress; acceptance withheld until fresh verification and the
remaining matrix complete**. Historical findings and failed attempts remain in
[CRITIC-1.md](CRITIC-1.md) and [CRITIC-2.md](CRITIC-2.md).

## Source and independence

The critic has not implemented product code or regression tests. It independently
hashed the candidate-9 manifest, containing 437 product files:
`26f2a3560e786ec4e82e74b54c00159618458ee6a8304819c4312cb25e3736bf`.
Manifest comparison with candidate 8 shows exactly two changed product files:
`frontend/src/features/analytics/chartMotion.ts` and
`frontend/src/features/mission/MissionControls.tsx`.

The analytics contracts, metrics, altitude/origin policy, projection ownership,
query anchors, selection, persistence and backend cache are unchanged from the
previous independently reviewed source. Candidate-8 foreground functional evidence
is retained with its original identity; it is not relabelled as candidate-9 imagery.

## Material-fix source review

The chart scheduler now queues one owner-window rAF, samples that window's actual
performance clock, and advances accumulated 90 Hz deadlines past missed slots.
It does not replay missed paints. The generation check precedes pending-handle
mutation, preserving a newer callback after a reset. Disposal cancels the pending
callback. Only chart work changes; the shared clock, maps, source frames and
simulation/recording cadence do not.

The 90 Hz scheduling target leaves headroom for the unchanged 60 FPS display
acceptance target. On a 144 Hz display, a 60 Hz deadline necessarily includes
20.83 ms slots. This reasoning is not performance certification: the new scheduler
must meet standalone cadence and the incremental map-workspace budgets. Unit tests
now check 144/120/60 Hz sampling, duplicate notifications, skipped deadlines after
a stall, actual-clock trailing samples and reset/disposal. Their source is sound;
independent execution and actual compositor measurements are still pending.

The mission-menu correction applies Radix `sticky="always"` only to the two
submenus. The critic read the complete controlled before/after results and new
regression: while a fixture submenu is open, a held catalogue response releases
18 saved scenarios. Its parent trigger moves to y=1020 in a 900 px viewport. The
uncorrected Tactical item moves to y=984 and cannot be clicked; the correction
keeps it at y=864 and clickable. The regression requires the real item to remain
inside the viewport, pass a centre-point hit test, load Tactical and connect.
No timeout increase, skipped assertion or blanket retry was introduced.

This inherited menu issue is a narrow regression-gate correction. It does not
close Phase 5 or resolve its mixed-scale polygon/external-batch limitations.

## Personally verified results

Candidate-9 focused frontend checks: **37/37 in four files, process exit 0**,
executed after the complete browser run released the machine, with no competing
tests or measurements. The critic independently traversed all 125 records of
`browser-final-5.json`: every case expected and actually passed exactly once,
zero skipped/flaky/retries/errors, and wrapper exit 0. The preceding zero-test
collection failure from a missing JSON import attribute remains retained.

The critic's fresh native delayed-catalogue reproduction passed at 1280 × 700 CSS
pixels in a physically contained 2279 × 1385 native window on the 2560 × 1440
desktop. After 18 saved scenarios arrived, the trigger was at y=1019.57 while the
Tactical item stayed at y=664.57–696.57, passed its centre hit test and actually
loaded the connected mission. Native task-PID checks passed before and after.
Both own screenshots were personally inspected. No provider attempts/page errors;
task browser/services stopped and the disposable database was deleted.

## Remaining personal verification

The fresh standalone Sydney 40-unit probe completed with process exit 0, all
40 entities moving and no visible map. Both screenshots were personally inspected.
Native task-PID, real focus/visibility and no-loss checks passed. These results
restore the mean-rate target but **do not meet the strict p95/zero-long-tail targets**:

| Configuration | Seconds | Compositor FPS | p95 / p99 ms | >50 ms / max ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Profile alone | 30.492 | 85.532 | 20.815 / 20.941 | 7 / 83.312 | 256 | 80.186 |
| Profile + 120s history alone | 30.480 | 84.907 | 20.824 / 27.773 | 5 / 97.360 | 264 | 77.821 |

The history view was ready in 1,463 ms with the unchanged five-second gate. A real
background tab then disposed all charts, held projection computations at 412,
and issued zero new history reads over 1,200 ms. Returning restored one chart.
No provider attempts/page errors; task services/browser/database cleaned up.

The standalone tails are **not classified as inherited without comparative
evidence**. The candidate-8 mean-rate defect is corrected; strict pacing and
incremental cost require the paired map/control and full matrix results.

Normal docked closed/open increments represent the operational workspace change,
including reduced map drawing area, not isolated ECharts cost. A supplementary
static Credits control passed complete visible-map/bounds preflight before any
timed comparison in `critic-matched-area-candidate9`: both side panes left one
Tactical map at x=40, y=62.2857, width=616, height=637.7143 CSS px. All four own
screenshots were personally inspected. All windows had 40 moving units, valid
native foreground/visibility with no losses, and approximately 30.5 seconds of
data. Process exit 0, zero provider attempts/page errors and complete cleanup.

| Configuration | FPS | p95 / p99 ms | >50 ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full Tactical, analytics closed | 90.995 | 20.831 / 27.762 | 1 | 261 | 0 |
| Tactical + static Credits | 108.140 | 13.965 / 20.872 | 2 | 268 | 0 |
| Tactical + current Profile | 116.941 | 13.925 / 20.850 | 0 | 282 | 73.892 |
| Tactical + Profile, history 120s | 105.229 | 20.835 / 27.806 | 6 | 298 | 66.403 |

**P2, open: history adds 6.870 ms p95 against the equal-area control, exceeding
the predeclared +5 ms incremental budget.** The corresponding p99 +6.934 ms and
publication-age +30 ms remain within their budgets. Comparing only against the
larger closed map would mask this p95 cost (+0.004 ms). This is a material Phase 6
non-pass, not an inherited display issue. It blocks acceptance pending correction
and fresh review; the full matrix was held rather than collecting a known-failing
candidate as acceptance evidence.

The current-only chart received 198 full options updates (6.497/s) and 2,252 motion
updates (73.892/s); history received 284 full updates (9.313/s) and 2,025 motion
updates (66.403/s). Runtime retained 601 history points at both measurement ends;
the screenshot plotted 592 compatible points after current-window trimming.
History became ready in 3,708 ms under the unchanged five-second gate. The existing
`observedSegments` trims against current frame time and retains source/break
arbitration; any optimization must preserve those legitimate boundary changes.

The earlier failed Credits control setups remain retained and supply no
matched-area result. The measurements above are a separate valid fresh run.

Final large-fixture, four-workload/96-window resource and display results, full
browser result inspection, source reconciliation and category scores remain open.
Scores cannot override missing evidence or failed quantitative gates.

## Candidate-10 material-fix follow-up

The critic independently hashed the 438-file candidate-10 product manifest:
`9c5adca02a1fdb3e4e8adfe4dce89c02474f68ca23b187a496b955a92f74bc47`.
Exactly `ChartHost.tsx`, `VerticalProfile.tsx` and new `chartProjection.ts` differ
from candidate 9; their current bytes match the manifest. Profile now reuses
ECharts axes/views with `replaceMerge: ['series']`, explicitly removing obsolete
history paths, and uses complete JSON filter identity for path memoization.
Frame, selected track, history, origin and datum dependencies remain present.

Source review found no new correctness defect. The critic independently executed
**39/39 focused checks in five files, exit 0**, without competing work. The real
ECharts test checks corrected data, removed history/current identities, updated
axis extent and complete history removal; the component check preserves
current-frame trimming despite an unchanged older response.

`critic-matched-area-candidate10` completed four 30-second windows, with exact
map-area preflight, valid native focus, all 40 Sydney entities moving, zero
provider attempts/page errors, process exit 0 and full task cleanup. All six own
screenshots were personally inspected, including the two direct-pointer images.

| Configuration | FPS | p95 / p99 ms | >50 ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full Tactical, analytics closed | 89.603 | 22.496 / 29.451 | 1 | 262 | 0 |
| Tactical + static Credits | 97.458 | 15.984 / 23.017 | 0 | 265 | 0 |
| Tactical + current Profile | 112.182 | 15.512 / 22.985 | 1 | 258 | 75.366 |
| Tactical + Profile, history 120s | 100.794 | 22.236 / 23.595 | 4 | 295 | 68.192 |

**The history P2 remains open:** p95 +6.252 ms against the equal-area control
still exceeds +5 ms. p99 +0.578 ms and publication-age +30 ms pass their budgets.
Full option updates fell to 4.974/s current and 7.519/s with history. History was
ready in 3,663 ms; 601 points were retained and 590 plotted in the screenshot after
window trimming. No standalone or full matrix was run after this material miss.

The critic filtered to Friendly 01, cleared shared selection, located the visible
blue point in rendered canvas pixels, hovered it and clicked it. The actual
tooltip displayed identity, source timestamp, observation/datum and altitude.
The chart click selected the same ObjectRef, produced the Tactical selection halo
and opened Details with the supplied photograph and native 180 m ellipsoid value.
This analytic interaction emitted no command/intent write.

A separate clarity finding remains for the final copy: the history status names
the returned read cutoff, while the displayed subset is further clipped against
current frame time during refresh. The current policy text does not explain that
distinction. A concise range/cutoff note is recommended; the trimming semantics
should remain unchanged. The implementer accepted the note but did not mutate the
measured candidate-10 source during this run.

## Candidate-11 material-fix follow-up

The critic independently verified the candidate-11 product manifest SHA-256
`284a08b7b67d0c1977c47f012d328c470b5457da6fd167c19a7e4eb75692bf81`
and the three changed product files: `runtime.ts`, `observedHistory.ts` and
`VerticalProfile.tsx`. The shared observed-history owner now coalesces running
interactive Profile-only refreshes to one request start per second. It retains
the newest exact frame demand, all returned observations and existing clipping.
Map overlay demand and paused/final frames have zero added scheduling delay.
Identity/filter/range changes, retry and hidden/disposal cancel the prior timer
and request generation; one in-flight read remains the maximum. Cache and exact
eight-field response-anchor checks remain intact. No recording or writer change
is involved. The critic found no new static correctness issue and independently
ran **42/42 focused checks in five files, exit 0**, without competing load.

`critic-matched-area-candidate11` completed four approximately 30.5-second native
foreground windows with exact same-area preflight (Tactical 616 by 637.7143 CSS
px for the control/current/history panes). All 40 Sydney units moved; every
window retained native PID and uninterrupted real focus/visibility evidence.
All six own screenshots were personally inspected. Direct rendered-point hover
and click again agreed with Tactical selection and Details, including the supplied
photo and original ellipsoid altitude, with no command/intent dispatch.

| Configuration | FPS | p95 / p99 ms | >50 ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full Tactical, analytics closed | 84.546 | 22.847 / 30.420 | 2 | 288 | 0 |
| Tactical + static Credits | 97.732 | 15.972 / 23.058 | 1 | 276 | 0 |
| Tactical + current Profile | 111.100 | 15.525 / 22.837 | 3 | 271 | 73.187 |
| Tactical + Profile, history 120s | 104.212 | 16.008 / 23.638 | 3 | 282 | 69.333 |

**The representative history increment now passes:** p95 +0.036 ms, p99 +0.580
ms and publication-age +6 ms satisfy the unchanged +5/+10/+100 ms budgets. The
specific equal-area P2 is corrected on this workload; it is not a certification
of the still-pending complete matrix. Full options updates were 4.918/s current
and 5.966/s history. Initial history readiness was 3,640 ms under the original
five-second gate. Runtime retained 601 points and the screenshot plotted 591;
the new text visibly distinguishes the retained read cutoff from current-frame
clipping, resolving the clarity finding without changing sample semantics.

Process exit 0, no provider attempts/page errors, task services stopped and task
database deleted after the storage report. The long-frame counts remain explicit
strict-pacing non-passes and are not classified as inherited from this single
paired result. Final standalone, UI policy, full matrix/large-fixture evidence and
the complete browser gate on this product remain open at this report checkpoint.

The separate `critic-standalone-candidate11` 30-second windows completed with
valid native focus, no maps and all 40 entities moving:

| Configuration | FPS | p95 / p99 ms | >50 ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current Profile alone | 85.987 | 16.023 / 23.345 | 2 | 259 | 81.813 |
| Profile alone, history 120s | 84.020 | 21.818 / 29.837 | 2 | 261 | 79.918 |

**P2, open: standalone retained-history pacing remains a Phase 6 concern.**
History misses the 16.9 ms p95 target and adds 5.795 ms p95 to the current-only
view. Mean FPS does not close this finding. Its cause is not assigned to D7.
History readiness was 1,457 ms; full options update rates were 4.996/s and
5.940/s. The real background tab had zero charts, zero new history reads and
unchanged projection computations, then reopened successfully. Both screenshots
were personally inspected. Process exit 0 and all task cleanup succeeded.

At the implementer's request, the critic collected separate 10-second sampled
CPU profiles and timeline traces in `critic-cpu-candidate11`, outside the declared
performance windows. They are diagnostics, not acceptance pacing evidence:

| Nested ECharts path | Current sampled inclusive ms | History sampled inclusive ms |
| --- | ---: | ---: |
| Animation `t.update` | 644 | 935 |
| Model `update` | 506 | 685 |
| Flush | 238 | 387 |
| Paint list | 184 | 314 |
| `setOption` | 146 | 219 |

The measured CPU-profile durations were 10.52 and 10.38 seconds. These nested
inclusive amounts are **not additive**, and 1 ms sampling is not exact call
timing. GC samples increased from about 35 to 63 ms. The evidence supports
investigating the chart update/paint pipeline as well as query scheduling; it
does not prove a single exclusive cause. Raw profiles, filtered timeline events,
weighted per-function summary and the exact diagnostic script are retained.
The CPU diagnostic exited 0 with valid native focus, zero providers/page errors
and complete cleanup. The full matrix remains held pending that investigation.

Final candidate-11 functional UI run `critic-ui-candidate11-c` passed **31/31
checks**, captured 36 own screenshots (all personally inspected), and exited 0.
It exercised all six lenses at desktop and 760/820/900 by 700 CSS px, numeric and
chart selection, source/frame context, filters, history/audit ranges, fixed
selected/mission origin, narrow scrolling, keyboard activation, split/reopen,
native hidden-tab cleanup, Stop with the other 39 units moving, Pause/Resume,
End and recorded audit, and a separate supported external native-MSL mission.
No external provider request or browser page error occurred.

The added UI policy checks recorded three Profile history requests in three
seconds versus 17 with the map trail enabled. Pause reached the displayed source
cutoff in 903 ms; a further distinct committed paused frame generated one valid
new read. Exact response frame IDs matched both committed anchors, with no
duplicate read of an unchanged frame. End inspection queried the captured mission
ID and verified the exact final history response anchor. Ended analytic inspection
emitted no command/intent writes. All services, browser context and task database
were cleaned up.

Two earlier candidate-11 UI attempts remain failures in the archive. Attempt A
looked for the Details trail after its own flow had closed Details. Attempt B
queried the active mission after End had cleared that identity, producing an
undefined expected timestamp; its paused assertion also incorrectly disallowed a
read for a genuinely new committed frame. Corrections reopen Details through
selection, use the captured mission identity and compare exact frame IDs. They
do not relax timeouts or suppress product errors. Those unsuccessful attempts
do not replace the complete successful C run.

## Candidate-12 scheduling follow-up

The critic independently verified product manifest SHA-256
`52cf806eee2105318837c43bbe972713e5dfc5c74892c38315815360f1320147`
and all three changed files (`ChartHost.tsx`, `chartMotion.ts`,
`chartProjection.ts`). The controller uses accumulated 120 Hz deadlines with
one queued callback and actual owner-window time. A 0.000001 ms tolerance handles
floating-point error at exact display periods; it does not relax pacing budgets.
Missed deadlines are skipped, source resets invalidate queued work, and hidden
or disposed hosts cancel chart and motion resources. Profile full options now
defer painting while applying model replacement in order, so a following partial
motion update can share the paint. Static chart updates remain synchronous.

The real ECharts test covers both painting policies and applies a motion patch
after authoritative replacement but before deferred flush. Removed entities and
history stay removed, corrected data remains present, and new axes take effect
after flush. The critic's independent five-file run passed **43/43 checks,
exit 0**. No new static correctness issue was found.

`critic-standalone-candidate12` completed two 30-second windows with all 40 Sydney
units moving and valid native focus throughout:

| Configuration | FPS | p95 / p99 ms | >50 ms / maximum | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current Profile alone | 110.647 | 15.509 / 23.028 | 2 / 62.483 ms | 247 | 106.612 |
| Profile alone, history 120s | 108.527 | 15.525 / 23.460 | 6 / 59.925 ms | 268 | 104.260 |

The representative standalone p95 concern is corrected: history is below
16.9 ms, with +0.016 ms p95, +0.432 ms p99 and +21 ms publication-age over current
Profile. **The zero-long-frame gate still fails**, and those intervals are not
assigned to inherited D7 without further evidence. Full option updates were
4.921/s current and 5.942/s history. History became ready in 1,465 ms. Real
backgrounding disposed all charts and produced zero new history reads or
projection computations (420 before and after); reopening succeeded. Both own
screenshots were inspected. Process exit 0, zero providers/page errors and full
task cleanup. The equal-area comparison, final UI, full matrix and final complete
browser gate remain pending at this checkpoint.

`critic-matched-area-candidate12` also completed all four 30-second windows, with
the same verified Tactical map bounds (616 by 637.7143 CSS px), 40 moving units,
uninterrupted native focus and complete cleanup:

| Configuration | FPS | p95 / p99 ms | >50 ms | Age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Full Tactical, analytics closed | 88.793 | 22.460 / 23.694 | 1 | 278 |
| Tactical + static Credits | 99.491 | 15.728 / 22.695 | 1 | 289 |
| Tactical + current Profile | 113.860 | 15.337 / 22.554 | 1 | 277 |
| Tactical + Profile, history 120s | 105.275 | 15.782 / 23.117 | 3 | 279 |

History adds +0.054 ms p95 and +0.422 ms p99 to the equal-area control, while
publication-age p95 is 10 ms lower. Current/history motion update rates are
88.179/82.601 per second and full option update rates 4.946/5.931 per second.
History was ready in 3,772 ms, with 601 retained points and 590 shown after
current-frame clipping. All six own screenshots were personally inspected,
including direct canvas tooltip and selection agreeing with Tactical/Details
without command dispatch. Exit 0; zero provider attempts/page errors.

The implementer subsequently identified a copy defect for simultaneous Profiles
with different requested ranges. The critic confirmed it against source: the
shared reader returns the maximum requested `history.windowSeconds`, but the
candidate-12 status labels that retained read using the pane's `historySeconds`.
For example, a 15-second plot beside a 120-second plot labels its shared 120-second
response as a 15-second retained read. Current clipping remains correct. The fix
must state both the requested plot range and actual response range, preserving
cutoffs and sample semantics. The matrix remains held for that correction; the
candidate-12 measurements above remain explicitly attributed to those bytes.

## Candidate-13 source review and outstanding exclusion disclosure

The critic verified the candidate-13 product manifest
`7a86442d576520c7b5648de0136d4e9a2e1b2cd77e4cffa162bb085be18977a9`
and the changed `VerticalProfile.tsx` hash. Only the shared read-range wording
differs from candidate 12. Independent focused checks again passed **43/43 in
five files, exit 0**. The corrected wording now distinguishes plot range from
`history.windowSeconds`; an independent final UI check is prepared to use a
120-second primary Profile beside a 15-second side Profile, assert both actual
120-second read labels, compare positive plotted counts and shared selection.
It has not yet run on candidate 13.

**P2, open: historical altitude/origin exclusions lack a visible count.** In the
candidate-13 `VerticalProfile.tsx:103` historical path projection, lines 116–132
drop samples with an incompatible native altitude group or a timestamp before
the captured origin. `world/observedSegments.ts:32` correctly preserves these
in-window samples before that projection. The Profile status at line 353 reports
only compatible samples; the Axis exclusion count describes current entity
positions. A selected displayed track with an earlier MSL/AGL segment and a later
ellipsoid segment therefore loses the incompatible historical observations
without an excluded historical total, even while current entities show zero
exclusions. Original values are not relabeled and incompatible values are not
plotted, so this is an accounting/disclosure defect, not a bad conversion.

This is personally verified source reasoning, not a newly reproduced browser
failure. Reproduction should supply two valid `altitude-reference` segments for
one displayed track, retain both inside the selected time window, choose the
current ellipsoid axis and inspect the history status. The requirement explicitly
asks for visible counts when incompatible values are excluded. Correct it by
counting exclusions in the same single historical projection, after displayed
track/source/time-window arbitration, with a stated denominator and separate or
clearly defined datum/origin reasons. Do not count expired/out-of-window samples
as altitude exclusions or change line breaks, conversions or queries. Add focused
mixed-reference and captured-origin assertions. The critic returned CPU/UI to the
implementer without starting another foreground or matrix run.

The proposed candidate-14 correction has been independently inspected in source.
It counts the existing `observedSegments` subset in the same traversal that builds
the plotted paths. Exclusive reasons are missing origin, incompatible altitude,
then observation before the captured origin. The regression supplies an older
out-of-window MSL point, in-window MSL and AGL points, and two compatible ellipsoid
points, then checks the fixed-capture and missing-origin cases. Native values and
line boundaries are preserved; no additional query, subscription or sample
retention policy is introduced. Source review supports the correction; focused
execution and final native UI/matrix evidence remain pending the frozen build.

## Candidate-15 independent focused review

The critic personally verified the frozen 438-file product manifest hash
`618432350e5084eae80aa75c15b06c8b9bca5cdf59a0f3f2955fe6055a335256`,
the `VerticalProfile.tsx` hash
`25f5c2cbd8bbd1d96bd4327b8f6161c0da32550e6a1230edb8e2cce3ee95ee73`,
and `projections.ts` hash
`b54ad36ce21009d39a18ee24e9eab9fe0ce82b2754d029353f41577430e49870`.
Independent focused tests passed **44/44 in five files, exit 0**. The complete log
is `frontend/test-results/phase6-command-picture/critic-focused-frontend-candidate15.log`.

The historical exclusion finding is closed by source review and executed focused
regression. The final native probe also checks the accounting arithmetic after a
selected fixed-origin capture at all three narrow widths and captures its own
760 px screenshot; that foreground execution remains pending.

The implementer separately identified a native MSL group-key collision. The critic
confirmed that a named datum `unspecified datum · source one` previously had the
same key as anonymous MSL from source `one`. `projections.ts:190` now gives named
MSL datums the disjoint `MSL · datum ` prefix. The focused regression exercises
that collision alongside source-isolated anonymous MSL and reviewed ellipsoid
aliases. This correction is accepted; it changes neither original altitude values
nor the conversion policy. The critic returned exclusive CPU ownership for the
implementer's complete final browser suite before the final native UI/matrix run.

## Candidate-15 complete browser and native UI

The critic independently read the entire `browser-final-6.json`, recursively
inspected all 125 nested test/result records and the wrapper exit record: **125/125
passed exactly once, retry 0, no skips, flaky results or errors, exit 0**, duration
889.413 seconds. `critic-browser-final-6-reviewed.json` retains that independent
per-case audit and the source result hash. The implementer executed this complete
suite; the critic personally audited its full machine-readable evidence.

The critic then personally executed `critic-ui-candidate15-b` with fresh native
Edge/task storage and inspected **all 39 own screenshots**. **33/33 checks passed,
exit 0**, with zero provider attempts/page errors and confirmed task cleanup.
Coverage includes every lens at desktop and 760/820/900 px, keyboard and shared
filters, Profile card/tab/split/reopen, directly hovered/clicked rendered marker
and Tactical/Details agreement without commands, historical numeric inspection,
and simultaneous 120s/15s plots sharing an accurately labelled 120s read. The
captured-origin status arithmetic was checked at all three narrow widths.

Initial history readiness was 380 ms for this young recording. Profile-only demand
made three reads in three seconds; enabling the existing map trail made sixteen.
Actual backgrounding released all charts and issued zero new history reads or
projection computations. Fleet Stop held the selected entity while the other 39
moved. Pause history reached its exact final anchor in 934 ms and made no repeated
read of the unchanged paused frame; Resume/End and final recorded inspection kept
the exact final anchor and dispatched no command. Supported external inspection
retained native MSL and zero inferred managed BLUE assets.

The first attempt, `critic-ui-candidate15`, failed only the newly added rendered
marker pointer check and is retained with its exact probe, images, exit and
successful cleanup. It reused a rendered coordinate after native-PID inspection
and screenshot capture while the young near-origin point moved and the axis
rescaled. The failing coordinate itself was not retained, so this diagnosis is
an inference from the source sequence and two images, not a recovered pointer
trace. The corrected probe reacquires immediately before hover and click, records
both coordinates/timestamps before acting, and preserves the same five-second
selection assertion. On the successful run the two sampled marker positions
differed by 16.37 pixels in 347 ms; the tooltip and selected map/Details images
were personally inspected. No product or regression assertion was changed.

The first complete-matrix attempt stopped after 20 valid default-10v10 windows:
the harness tried to reopen `Tactical Map options` after closing the pane in 3D
mode. Source confirms that its retained title is `3D Map options`. All twenty
raw traces and the exact measurement harness are preserved; this partial run has
zero incremental-budget or foreground failures and three absolute long-frame
non-passes. It is not a complete matrix. The critic returned CPU for the narrow
reusable-harness locator correction and better failure capture before an entirely
new 96-window run. Product source remains candidate 15.

The fresh `phase6-performance-critic-candidate15-b` attempt completed 48 windows
and both default-location ten-cycle resource checks, then exited 1 while
validating the first Sydney scenario. The validation HTTP response was 200; its
`canRun` was false. The critic personally inspected the failure screenshot and
ARIA: the previous Performance 20v20 demo remained active. The helper waits for
the End menu click, then the measurement harness immediately closes the browser;
it does not await the asynchronous lifecycle transition. A close-before-End
completion is the supported explanation, but the original response body was not
captured, and the successfully cleaned task database cannot recover it. A bounded
reproduction retaining exact lifecycle and validation bodies is required before
the setup correction. Cleanup confirms stopped services, an interrupted demo
ended by cleanup, and deletion of only the task database.

These 48 measurements are retained as partial evidence, not a complete matrix.
The default-10v10 two-Profile Tactical and dual-map p95 increments are +6.780 and
+6.974 ms, exceeding the +5 ms budget. Default-20v20 adds a Tactical p99 increment
of +14.009 ms; ordinary 3D adds +7.498 ms p95 / +14.126 ms p99; dual maps add
+14.573 ms p95 / +15.637 ms p99 and +126 ms publication age. These are real
incremental non-passes under the measured configurations, not inherited-only
failures. Both resource cycles end with zero charts, zero hidden history/audit
reads and no extra mission stream; post-GC heap growth is 1.044/1.119 MiB.
Twenty selection checks have aggregate p95 149.113 ms and maximum 166.367 ms;
per-workload p95 is 135.544 ms for default 10v10 and **166.367 ms for default
20v20**, so the latter exceeds the 150 ms input budget. Every timed
window retained valid native foreground continuity and all source units moved;
there were zero provider attempts or page errors.

Personal inspection of all four combined screenshots also exposes a measurement
setup limitation: by these later windows the routes have left the retained map
camera, leaving blank grid/globe views. The single-map combined screenshot shows
the dedicated Profile chart but the Command Picture chart below its scrolled
viewport. The dual-map screenshot shows both plots. These data therefore describe
the configured workspaces and moving sources, not a certificate for visible
moving map markers and two visible plots in every named combination. The fresh
run must verify camera coverage and actual plot-viewport intersection before
timing; preserve the existing windows and thresholds. The critic communicated
these limits immediately and returned CPU/UI ownership for the bounded harness
reproduction/correction. Product source is unchanged.

The critic independently reproduced the End lifetime failure in two fresh task
databases, using an explicit 1,000 ms delay of only the End-intent request. The
old menu-click lifetime closed the browser 272 ms after the click returned,
captured no End command/receipt, and left the active mission intact. The next
exact Sydney revision validation returned HTTP 200, `canRun: false`, with the
`ACTIVE_RUN_EXISTS` issue. The corrected lifetime awaited the actual ended state
and an authoritative null active-mission entry before browser close. Under the
same delay, the ended state appeared in 1,752 ms, the original intent and accepted
End command response were captured, and the next Sydney validation returned
HTTP 200, `canRun: true`, with no issues. Existing five-second assertion budgets
were preserved. This establishes the narrow test-harness correction without
changing product lifecycle, retry or writer semantics.

`critic-end-lifetime-{close-on-click,wait-authoritative}` retain exact task
request/response bodies, fixtures, timestamps and the executed probe; no headers
or credentials were recorded. The critic personally inspected all three images.
Both modes completed as expected, wrapper exit 0, zero provider attempts/page
errors, services stopped and both task databases deleted. This controlled
reproduction supports the original partial-run diagnosis; it does not invent
the original uncaptured validation body.
