# Phase 6 fresh independent review

Reviewer: `phase6_final_critic`. Review started against frozen candidate 20 at
`30414540b89508193ea84c4f8e235362ebd61a37`. I did not implement or edit product
code, tracked tests, tracked measurement harnesses, or another reviewer's report.
My changes are this report and ignored review probes/evidence. I independently
operated task-owned foreground Edge sessions, inspected their captures, ran
focused checks, and audited source and raw results. Reusing a reviewed isolation
or browser helper is disclosed; it is not a claim that I authored that helper.

**Final candidate-22 disposition: acceptance withheld, 8.5/10 overall.** The
material combined-Profile performance finding is independently reproduced.
The audit-search defect is corrected and independently verified through the
original API reproduction and actual production UI. Candidate 21 was a failed,
separately identified rendering experiment. My final source readback proves its
exact reversion: candidate 22 differs from candidate 20 in only the audit-query
implementation. Passing functional gates do not waive the open pacing budget.

## Findings

**P2 — Combined Profiles exceed the declared incremental frame-tail budgets.**
The ownership points are `frontend/src/features/analytics/VerticalProfile.tsx:279`,
`frontend/src/features/analytics/ChartHost.tsx:184` and its chart initialization/
motion lifecycle, and `frontend/src/features/analytics/profileLayer.ts:132`.
These references identify the affected path, not a claim
that one inspected line independently causes the measured tail. On Sydney 20v20,
show two current Profiles beside Tactical and ordinary 3D maps, with the same
four selections and map/pane geometry as inert Settings/Credits controls. Warm
90 source seconds, then measure four 30-second windows. All 40 units remained
moving and projected in view before/after each window. No provider requests,
focus losses, document hiding, competing test/build/benchmark, mixed mission,
capture overflow, or runtime error occurred in my timing windows.

| Candidate 20, my measurement | FPS | Compositor p95 / p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Inert before | 118.594 | 15.168 / 15.961 | 1 | 258 |
| Two current Profiles | 96.113 | 22.912 / 30.467 | 1 | 278 |
| Two Profiles, selected 60 s history | 87.238 | 30.001 / 45.649 | 15 | 337 |
| Inert after | 117.099 | 15.219 / 16.009 | 1 | 309 |

Current p95 increments are **+7.744 / +7.693 ms** and p99 increments
**+14.506 / +14.458 ms** against the two brackets. History increments are
**+14.833 / +14.782 ms** at p95 and **+29.688 / +29.640 ms** at p99. The
predeclared +5/+10 ms limits fail against both controls. The mean FPS floor is
met; it does not excuse the tail. Applicable absolute p95 <=16.9 ms also fails;
history p99 exceeds 33.4 ms. The controls themselves have long frames, so the
zero->50-ms absolute criterion cannot be represented as baseline-supported in
this pair. Raw long-frame counts remain reported. Publication-age increments
stay within +100 ms.

The impact is visible presentation pacing in an explicitly supported combined
layout. It is Phase 6 work, not an inherited exception. Preserve the failed gate
unless a bounded correction passes the original workload and thresholds. Do not
reduce the 120 Hz target, population, source fidelity, history semantics, or
acceptance limits to make a passing result.

Evidence: `frontend/test-results/phase6-command-picture/final9-control-candidate20-a/`
contains the executed source copy, four raw traces, `result.json`, two raw CPU
profiles, snapshots, native foreground identities and cleanup. Independent raw
arithmetic/identity/focus readback is in
`test-results/phase6-command-picture/final9-evidence-readback.{py,json,log,exit}`.

**P2, resolved in candidate 22 — Displayed request IDs containing JSON escapes
could not be found.**
Candidate-20 `backend/app/recording/analytics.py:173` applies
`instr(lower(body),lower(?))` to serialized JSON. The UI advertises literal
recorded identity search at `frontend/src/features/analytics/RecordedActivity.tsx:146`.
A real interactive `acquire` accepts and records `REQUEST "ALPHA"` unchanged;
its audit query returns zero rows when given that displayed identity, but one
when given its JSON-escaped representation. `REQUEST\ALPHA` behaves similarly.
Unfiltered audit reads and direct receipt lookup preserve the identities, so
this is retrieval behavior, not storage corruption. An operator can incorrectly
conclude that a recorded request is absent, and its filtered summary is empty.

My reproduction uses real FastAPI write/read endpoints with three independent
in-memory task applications. Every audit read leaves `total_changes` unchanged.
The original Unicode, quoted and backslash IDs are retained exactly in raw
receipt JSON and returned records. Literal `Ω-REQUEST-ABC` and
`Ω-request-abc` match; `ω-request-abc` does not. SQLite's folding is ASCII-only;
the old unqualified case-insensitive documentation is too broad. A query-only
OR of the original literal substring and distinct JSON string-content escaped
forms is a bounded correction. Preserve stored bytes, identities, retry bodies,
ordering, paging, cutoffs and schemas; document non-ASCII matching honestly.

Evidence: `test-results/phase6-command-picture/final9-search-probe-b.{py,json,log,exit}`
(exit 0). Probe A is also retained: it incorrectly attempted a Unicode external
simulation identifier, which the frozen external contract correctly rejects.
That setup failure is not an analytics defect and does not support this finding.

I have read the candidate-22 correction at `backend/app/recording/analytics.py:22`
and `:182`, its seven new regressions, and the revised `METRICS.md`. It adds at
most three distinct parameterized substring predicates: original text, UTF-8
JSON string content, and ASCII-escaped JSON string content. Ordinary ASCII and
empty text deduplicate to the original single predicate. The raw search form
remains available; stored bytes, returned IDs and the rest of cutoff/order/
pagination logic are untouched. The real-endpoint tests verify accepted opaque
identities and exact retries, original and ASCII-folded search, summary totals,
unchanged tables and zero read writes. Historical tests preserve both encodings
and literal percent/underscore behavior. My final-source verification closes this
finding:

- I repeated the original three-application API reproduction with identical case
  inputs and endpoint operations; only candidate metadata changed. Exact quoted
  and backslash IDs now return one original identity, as do their prior serialized
  queries. Unicode and ASCII-folded queries preserve the documented distinction;
  every read has zero database changes. All in-memory applications close.
- I independently ran all **19 audit tests**, exit 0, including the new real-
  endpoint/retry and historical-encoding cases. The two existing dependency
  deprecation warnings remain visible.
- I operated a fresh foreground Edge against **`dist-production-phase6`**, with
  a newly created, intentionally acquired/started/ended task recording. All six
  typed search cases pass through the actual Recorded activity controls. I read
  the endpoint responses and displayed original identities, complete summaries,
  empty-case result, and unchanged final frame/cutoff. All six original native
  screenshots were personally viewed. Inspection sends zero control commands;
  there are zero provider attempts or page errors, with real visible/focused
  samples and native foreground PID/title/rectangle corroboration.

Evidence: `test-results/phase6-command-picture/final9-search-probe-c22.{py,json,log,exit}`,
`final9-c22-audit-focused.{log,exit}`, and
`frontend/test-results/phase6-command-picture/final9-search-ui-candidate22-b/`.
This final search fixture is the small supported local demo; my moving Sydney
40-unit/ended broad UI evidence remains the separately identified candidate-20
run with byte-identical final frontend source and output.

Final search UI attempt A failed before page creation because my added
`Browser.getBrowserCommandLine` metadata query requires an automation flag that
the native-focus helper intentionally omits. Exit 1, result and cleanup remain
preserved. Attempt B uses an ignored exact copy of the helper with only the
already allocated debug port added to its returned metadata. The launch,
visibility, capture and close behavior is unchanged; no assertion was weakened
or retried. `final9-prepare-search-ui-b.{py,json}` records that delta, and my final
readback independently checks the copy against the tracked helper.

## CPU attribution and rejected experiment

After all candidate-20 acceptance windows, I collected separate 10-second main
thread CPU profiles, at a requested 1 ms sample interval. These are diagnostic
samples with profiler overhead, not timing acceptance or exact call durations.
They lack a baseline CPU profile and have paint-timestamp capture disabled.
`final9-cpu-categories.py` unions matching stack categories per sample so
recursion is not double-counted; categories still overlap and must not be added.

| Sampled subtree | Current ms / % of wall | History ms / % of wall |
| --- | ---: | ---: |
| Public `convertToPixel` | 49.631 / 0.479% | 34.343 / 0.338% |
| Entire current-marker `paint` | 82.503 / 0.796% | 64.542 / 0.635% |
| Authoritative ECharts `setOption` | 278.134 / 2.682% | 378.435 / 3.721% |
| Projection effect including its immediate paint | 316.533 / 3.053% | 435.469 / 4.281% |
| Automatic chart flush | 654.700 / 6.314% | 615.671 / 6.053% |
| All chart canvas paint-list work | 477.028 / 4.601% | 496.883 / 4.885% |

There were 106/122 authoritative updates and 1,537/1,447 motion updates across
both charts over explicitly separate counter intervals of 10.456/10.293 s;
profile durations were 10.369/10.171 s. A proposed converter-only optimization
is not justified as the remedy by these measurements. The larger chart layout
and rendering categories warrant investigation, but this profile does not
prove a particular scheduling change will close the frame-tail gap.

The implementer then tried the single public `useDirtyRect:true` chart-init
option, with no other product delta, as candidate 21. I ran the same control
against the separately named `dist-verification-phase6-candidate21` build and
candidate-21 manifest. The experiment **failed**:

| Candidate 21 | FPS | Compositor p95 / p99 ms | >50 ms |
| --- | ---: | ---: | ---: |
| Inert before | 116.931 | 15.393 / 16.033 | 3 |
| Two current | 94.780 | 22.964 / 30.822 | 2 |
| Two history 60 s | 92.075 | 29.004 / 38.634 | 9 |
| Inert after | 115.204 | 15.342 / 16.010 | 2 |

Both Profile modes still miss +5/+10 ms against both brackets. The actual
205/459-CSS-pixel tooltip/selection checks pass, with zero provider/runtime/focus
errors, but those passes do not rescue pacing. I recommended reverting the
one-line experiment and verified its reversion in candidate 22. I inspected all
18 experiment captures. All raw failed-experiment evidence is preserved in
`frontend/test-results/phase6-command-picture/final9-control-candidate21-a/`.

## Personally verified functional and source review

I ran **53 backend tests** covering analytics, observed history, exact-byte
observation caching and storage codecs, and **57 frontend tests in seven files**
covering analytics/lifecycle, chart projections/motion/graphics/series and
history. Both exited 0. Logs and wrapper exits are
`test-results/phase6-command-picture/final9-{backend,frontend}-focused.*`.
The backend used `PYTHONUTF8=0`, preserving the repository's frozen Windows
fixture/subprocess expectation. No tests or source fixtures were rewritten.

My task-owned native UI run B passed **35/35**, produced **42 screenshots**, and
exercised moving Sydney 40-unit data, all six lenses, current canvas hover and
pick, shared ObjectRef selection in map/Details, captured origin and exclusion
counts, 120/15-second split histories, numerical history inspection, a source
gap with frozen pixels and recovery, genuine background disposal/read silence,
all six lenses at 760/820/900 CSS widths, Fleet Stop with 39 other units moving,
Pause/Resume/End, final committed history anchors, ended audit and supported
external/native-MSL data. Analytic selections and ended inspection dispatch no
commands. Stop/Pause/Resume/End are separately intentional task-fixture controls.
External BLUE affiliation does not become local management authority.

Evidence: `frontend/test-results/phase6-command-picture/final9-ui-candidate20-b/critic-result.json`
and its executed probe, screenshots and cleanup. I inspected all 42 captures and
all 20 candidate-20 control captures using the original files and review contact
sheets indexed in `final9-visual-readback/index.json`. The sheets do not replace
the unmodified originals. Native screenshots are 2240x1225 at a configured
1280x700 CSS viewport and DPR approximately 1 under Windows scaling, not a
2560x1440 native-DPR performance certificate. Narrow widths certify layout,
keyboard access and controls, not a separate timing envelope.

Attempt A is preserved as a failed strict tooltip-persistence assertion. It
first displayed the correct Friendly 01 tooltip, then had no tooltip after a
0.25 px pointer nudge/capture. Pixel readback of that exact PNG places the marker
**63.034 CSS px from the pointer**, well outside its approximately 3–4 px radius.
It does not establish hiding while still over the target. A did not capture all
intermediate axis/pointer/focus transitions, so the precise transition cause is
not claimed. B added bounded actual painted-pixel, pointer-event, DOM and focus
sampling; the same strict assertion passed without a retry. Fourteen samples
preserve the geometry, real visibility/focus and changing source frames. The
diagnostic continuation would have retained an assertion failure, not silently
retried it; that path was not taken. Current tooltips show the entity label, UTC
sample time, observation state and altitude reference. The native datum/group
is separately displayed in axis context. Historical vertices use the numerical
inspection table; these tests do not promise per-vertex historical tooltips.

The source review found the following substantive boundaries correctly implemented:

- **Metrics and identity.** `projections.ts` uses the same displayed track/source
  arbitration as the map, while retaining mission-wide denominators and explicit
  managed-asset membership. Unknown/missing values are not fabricated zeros.
  Comparison uses raw measurements and a selected common native datum. Frames,
  mission/recording/epoch, source time and filters are explicit; audit range and
  cutoff remain pinned independently of shared map filters.
- **Audit semantics.** `recording/analytics.py` joins event frame sequences,
  bounds receipt rowids/accepted sequence, orders recorded time/kind/sequence,
  and preserves retries as one identity. Request and resulting event rows are
  separate. `NO_EFFECT` contributes an interaction outcome but zero affected
  entities; affected-entity aggregation is distinct and explicit. Backend tests
  exercise same-time pagination, late receipts and immutable cutoffs. Summaries
  cap inspection at 20,000 rows and mark incomplete; page reads cap at 100.
- **Native altitude and history.** `VerticalProfile.tsx`, `projections.ts` and
  `observedSegments.ts` keep named/unnamed MSL and ellipsoid/native groups separate,
  exclude AGL where conversion is unsupported, and use a fixed mission origin
  or captured present selection with a source-time floor. The view is radial
  distance versus altitude, not terrain or seeking. Retained histories clip to
  each pane's source window; exclusion reasons and numeric denominators are
  displayed. Live interpolation is presentation, not recorded observation data.
- **Ownership and bounded work.** `app/runtime.ts:241`,
  `world/observedHistory.ts:147`, `services/auditClient.ts:65` and `ChartHost.tsx`
  maintain shared read ownership, cancellation/generation checks, an eight-entry
  history cache, one immutable projection frame and ten-second request bounds.
  Live interactive Profile demand coalesces at one second while map demand and
  final Pause/End anchors remain immediate. Hidden charts dispose and release
  motion subscriptions; the real background check found no continuing reads or
  projection work. Chart timers/resize/tooltip nodes use their owner document.
  Audit row caps bound materialized results, not constant-time text scanning;
  client cancellation does not establish interruption of a SQLite statement
  already executing under the repository lock. I did not measure a large
  Unicode-search timing envelope for the final query change.
- **Persistence and recovery.** `observation_cache.py:22` bounds selected
  projections to 1,000 entries/16 MiB and committed proofs to 1,000 exact stored
  byte digests. `sqlite_repository.py:268` and `:284` admit proofs after successful
  commit; rollback cannot promote them. Unknown stored content still receives
  strict full validation before projection. Tests cover cold/hot paths,
  mutation isolation, rollback and invalid records. These changes retain the
  authoritative writer and recording format; they do not make cold history free.

I found no additional material semantic defect in those inspected paths beyond
the corrected search finding. This is evidence-bounded review, not a claim that tests prove
all inputs or concurrency schedules.

## Measurement limits, supplied evidence and preservation

The acceptance data uses the verification build with bounded inspection bridges
and render timestamp capture. That instrumentation has unquantified cost and is
not byte-identical to production. Both sides of each control use it. The
production/test build identity and complete browser suite are separate evidence;
they do not convert this into an uninstrumented production pacing certificate.
The fresh Edge helper avoids Playwright focus emulation. I independently checked
real two-tab hidden/focus transitions and native foreground browser PID/title/
rectangle before/after timed windows. Direct CDP surface capture avoids viewport
preparation that can relocate the native pointer. Compositor intervals and per
chart render callbacks are distinct; neither a callback count nor RAF alone is
physical input-to-photon latency.

Candidate-20 per-chart rendered callback p95 was 29.8–30.7 ms for current and
36.3–37.2 ms for history, approximately 83.8–84.3 and 75.3–75.5 callbacks/s.
The 120 Hz target is not achieved by those measurements. Thirty history reads
occurred inside the actual 30.686 s history trace; broader setup/read intervals
must not be divided by that trace duration. The inert windows had no history
reads and zero active charts. One preflight history screenshot shows a transient
map patrol-area tooltip; timed-end screenshots show no chart tooltip. There is
no continuous map-tooltip census, so I do not claim its absence at every instant.
The independently failing current-only comparison does not depend on that
history-preflight state.

`sourceAgeMs` in the raw sampler is **publication age**, calculated from recorded
time. My readback separately calculates source-clock age: candidate-20 p95 is
4,191/4,584/5,930/7,107 ms over the four windows. The simulator's fixed-step clock
does not catch up to elapsed wall time. That drift is not publication staleness,
and neither quantity should be hidden or substituted for the other.

I independently parsed every actual result in both supplied complete browser
runs. Candidate 20's `browser-final-7.json` contains 126 single-pass results in
886.017766 s. Final candidate 22's `browser-final-8.json` contains **126 single-pass
results in 888.195111 s**, with expected status, retry 0, no skips/flaky/unexpected/
root errors. I also read its wrapper exit 0. My parser retains every actual
result in `test-results/phase6-command-picture/final9-c22-readback.json`.
I read the final complete backend **562 passed, 90.02 s**, frontend **486 passed in
49 files, 43.39 s**, their exit-0 receipts and the passing static-check records.
I did not launch those complete suites or the full 96-window matrix myself.
Their launch/measurement ownership remains the implementer and first critic.
The first critic's final matrix reports 10 incremental, 39
applicable absolute and two input-latency nonpasses, all 10 incremental misses
in two-Profile combined layouts; resource lifecycle checks pass. Its separate
10,000-entity/10,000-event fixture is a static aggregation diagnostic, not moving
10,000-unit capacity. Standalone Profile p95 approximately 15.5 ms does not erase
combined-layout failures or retained long-frame tails. The 150 ms input-to-DOM
budget is automation-inclusive; ten-cycle post-GC heap growth <=20 MiB is a
diagnostic, not a proof of absence of every leak.

I verified all 440 candidate-20 product files after my runs against manifest
SHA-256 `a7de53f714a6f8ee0a8bf28fc587ca95b946cf9d97a13c694d54c78316fec77e`,
and all 440 candidate-21 experiment files against
`f2c8501ce03b73566dc54c0fc4cb1b7c66c28ede4b2b6afa1c549b030577e025`.
All owned services/browser processes stopped, ports 5421/8221/5425/8225 were
free, and four task databases/WAL/SHM files were absent. The in-memory search
applications closed. The exact process, file and cleanup receipts are
`test-results/phase6-command-picture/final9-c20-{source-cleanup,occupancy,browser-cleanup}.json`
and `final9-c21-{source-cleanup,occupancy}.json`. An initial sandbox process-enumeration
denial is recorded; an authorized read-only retry established absence. I did
not touch operator data, browser profiles, protected dirty work or credentials.

After the final search checks I independently verified all **440 candidate-22
product hashes**, against manifest SHA-256
`3f514062a61b1b4ed98c51ff797e7d8ce9841ab978a47cfa18282fcd26879be7`.
Exactly `backend/app/recording/analytics.py` differs from candidate 20; every
frontend, contract and other backend product file matches. The implementer's
separate 403-file build readback establishes final production/test outputs also
match candidate 20. The audit-search path is not exercised in my Profile timing
windows. I retain those measurements as candidate-20 instrumented evidence,
not a freshly run candidate-22 or uninstrumented production timing certificate.

`final9-c22-readback.{py,json,log,exit}` also verifies the unchanged API-probe
inputs, six UI results, helper-copy delta, both owned task databases/WAL/SHM files
absent and awaited browser/service closure. `final9-c22-occupancy.json` confirms
all known task PIDs and descendants are gone, with no listeners on 5421, 8221 or
the successful run's CDP port 57242. The first metadata-setup failure did not
capture its ephemeral CDP port; its browser/server close completed, and the
subsequent OS check finds no descendants of its task Node PID. I explicitly
released exclusive CPU/UI ownership after these checks. No service or browser
from this review remains running.

The original Phase 5 mixed-scale valid polygon 500, roughly 5.218 s external
batch blocking, provisional external interpretations and 8.6/10 withheld
acceptance remain separate. D7/Video gaps remain separate. No Phase 7 seeking,
new providers, renderer/persistence redesign, commit or push is part of this
review. Parent-owned archive/preservation readback is still a final delivery
gate; planned archive root is
`C:/Archive/Coding/Sentinel3-archive/2026-09-20-phase6-command-picture/`, preserving
checkout-relative raw evidence paths. I do not claim to have completed that
archive myself.

## Final candidate-22 scores

| Dimension | /10 | Evidence and remaining limit |
| --- | ---: | --- |
| Data / analytic correctness | 9.2 | Denominators, native groups, cutoffs/outcomes and missing values are well defined; original API reproduction, 19 audit tests and six production UI cases verify the exact-identity correction. |
| Frontend correctness | 9.2 | Own foreground 35-case pass, actual canvas selection/tooltip, source-gap recovery, ended/native-MSL inspection and narrow-layout readback. Pacing is assessed separately. |
| Compatibility / recovery | 9.1 | Strict cold validation and bounded committed proofs preserve storage authority; focused codec/history/rollback tests and live stale/recovery/ended checks pass. |
| Performance / resource efficiency | 6.0 | Bounded ownership and cleanup pass, but own paired controls reproduce material p95/p99 misses, and the narrowly tested dirty-rectangle change fails. |
| Maintainability | 9.0 | Shared typed projections/read owners, public chart APIs and focused meaningful tests; graphics lifecycle and proof caches require continued coverage. |
| **Overall acceptance** | **8.5** | **Withheld. The search defect is resolved; independently reproduced combined-Profile tails and supplied input-budget misses remain open. A target score cannot override them.** |
