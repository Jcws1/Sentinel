# Final regression investigation

The first complete Phase 6 browser run uses the candidate-6 production and
verification bundles. It is retained as `browser-final-1`, including the complete
machine-readable result, process exit, failed contexts and service cleanup. It is
not replaced by a focused pass. It finished **114/124**, process exit 1, with no
skipped, flaky or retried tests. All 124 test records and all ten failure records
were read from the complete JSON result.

## Replaced placeholder selectors

The mission, renderer-retention and Tactical selection cases still referenced
`[data-readout="command"]`, the old Command Picture placeholder. The implemented
workspace exposes its committed frame through `data-analytic-frame`, visible
source/recording times and sequence, mission/filtered counts and shared Comparison
selection. The failures occur while finding the removed placeholder or counting
two placeholder panes. They are distinct from the earlier Phase 5 synchronization
correction.

The adapted tests retain the original semantic checks: identical committed frame,
time, sequence and entity count; shared selection and Details; one backend stream;
stale-frame retention and explicit recovery; renderer suspension/reuse, independent
camera preservation; unavailable and unlocated entity selection; and accessibility
at 1920/2560/3840 pixels. They now operate the actual analytic controls. No timeout,
retry policy, fixture identity, assertion threshold or simulation rule was relaxed.
The independent critic compared the old and new assertions directly.

Eight failures used the removed readout selectors. A ninth expected Command
Picture to say NOT IMPLEMENTED; its replacement checks the explicit no-mission
state in both implemented analytic views. The tenth is an inherited Phase 5
keyboard-order assertion: Simulation now sits between Tracks and Command Picture
in the activity bar. The test now asserts focus on Simulation before advancing to
Command Picture. It preserves every original keyboard assertion and changes no
application navigation or frozen fixture. This narrow test correction is recorded
separately from the Phase 6 product change.

## Missing selected entity

Reviewing the Tactical removal assertion exposed a separate Phase 6 product defect:
Comparison discarded selected IDs absent from the current frame. Candidate 7 keeps
the first four shared identities in their original order, showing the original ID,
Unknown measurements and “Unavailable in this frame”. The chart retains a null
value, never a zero. It does not invent a historical label. Component tests cover
both all-missing and mixed available/missing selections; the Tactical browser case
continues to verify selection after removal and subsequent unlocated selection.

Final full results, source identity and acceptance are recorded in DELIVERY.md.
All failed attempts remain in the raw archive; focused checks are diagnostic only.

The first adapted ten-case run passed nine and failed the unload assertion because
the new test steps had left Timeline hidden. Hidden panes intentionally suspend
their subscriptions. The test now explicitly reveals each pane before asserting
that its old frame is gone; it retains the original zero-readout assertion. That
case then passed alone. Both diagnostic runs and their complete JSON results are
retained. The complete final run still determines browser acceptance.

The final complete run, `browser-final-2`, passed **124/124 in 14.4 minutes**, process
exit 0. Every test had expected status passed, one actual passed result and retry
index zero. There were no root errors, unexpected, skipped or flaky records. The
complete JSON and wrapper status were read, and all 436 product files matched
candidate 7 after completion. No passing subset is substituted for this gate.

## Candidate 8 complete run: distinct menu reachability failure

`browser-final-3` completed all 124 tests in 15.1 minutes with **123 passed / 1
failed**, process exit 1, zero skipped/flaky/retried tests and no root errors. The
complete JSON and every actual result were read. The blocked-Cesium-worker case
timed out before exercising worker recovery, in `actions.ts:19`: the Tactical
fixture item was attached, visible/enabled/stable, but its open submenu lay outside
the viewport for the unchanged 45-second test budget. The failure context contains
18 saved scenario rows in the parent mission menu.

This is distinct from the replaced Command Picture placeholders and the earlier
Phase 5 synchronization correction. Candidate 7 passing does not certify this run.
The full result, wrapper status and error context are retained. A deterministic
delayed-catalog/menu-geometry probe is being prepared to distinguish a product
layout defect from test setup; no timeout, retry or fixture assertion is relaxed.

The controlled probe reproduced the product defect: after 18 real saved rows
arrived, the submenu's Tactical item moved below the physical browser viewport.
Candidate 9 keeps both mission submenus collision-constrained even when their
anchor moves offscreen (`sticky="always"`). The identical probe failed before and
passed afterward with zero provider requests; screenshots and geometry are retained
as `menu-catalog-before` and `menu-catalog-after`. The complete browser suite adds a
deterministic delayed-response regression checking hit testing and normal selection.

Attempt `browser-final-4` failed during collection with zero tests because the new
test's JSON import lacked Node's required `type: 'json'` attribute. Its complete
root error and exit 1 are retained. Correcting that import changes only the test;
the candidate-9 product inventory remains unchanged. `browser-final-5` is the next
complete run, not a passing subset.

The complete candidate-9 run, `browser-final-5`, passed **125/125 in 14.7 minutes**,
process exit 0. The full JSON was read: every test expected passed and contained
exactly one actual passed result, retry zero and no errors. There were no root
errors, skipped or flaky cases. All 437 candidate-9 product files still matched
the reviewed inventory after the run, and all three task ports were free. This
complete run includes the new deterministic menu regression and the previously
failing blocked-worker recovery case.

## Later focused/static corrections

Candidate 11's full frontend run passed 471 checks, but its first typecheck rejected
the new test fixture's general array where the contract requires a nonempty tuple.
The fixture annotation was corrected; focused recheck and final typecheck passed.
The original failure log remains retained. No runtime or contract was weakened.

Candidate 12's first focused run exposed floating-point deadline accumulation when
the chart target exactly matches a 120 Hz display. A sub-microsecond comparison
tolerance fixes skipped ticks; the original near-target count assertion remains.
Its new deferred-paint test also assumed a hard-coded grid-left coordinate. It now
compares the unchanged pre-paint coordinate against the actual initial axis result,
then checks the corrected post-paint extent. All 25 focused checks pass; the failed
23/25 attempt remains in evidence. No acceptance threshold, timeout or retry changes.

Candidate 14 passed all 473 frontend tests, but typecheck correctly rejected an
unsupported Testing Library `exact` option in the new missing-origin assertion.
Candidate 15 uses an anchored accessible-name expression; the assertion and
runtime behavior are unchanged. The failed static log is retained.

Candidate 15 also separates named MSL datum keys from unspecified MSL/source keys.
A valid datum ID containing `unspecified datum · source one` previously collided
with the unnamed group for source `one`. The named branch now has a distinct
`datum` prefix, with a regression for that exact valid collision. Native altitude
values, WGS84 aliases, source identities and conversion policy are unchanged.

## Final candidate-15 complete browser gate

`browser-final-6` passed **125/125 in 889.413 seconds (14.8 minutes)**, process
exit 0. The implementer and critic independently read the complete machine-readable
result: every case expected passed, actually passed exactly once, retry zero, no
per-result or root errors, and zero skips/flaky cases. This is the complete suite
on the frozen final candidate, not a subset or a combination of earlier runs.
The raw result, logs, screenshots and wrapper exit record are retained separately
from all five earlier attempts. The owned browser-test database was removed after
the suite; no active mission remained.

The first final-source performance matrix stopped after 20 completed windows at
its setup helper: it closed the primary map while in 3D mode, then sought a
`Tactical Map options` button. The existing workspace correctly retains the closed
pane's mode/title. The helper now reopens `3D Map`, then explicitly switches back
to Tactical as already required. It also captures a failure screenshot and ARIA
snapshot before browser cleanup. Syntax, focused ESLint and formatting checks
pass. No product, canonical browser case, timeout, workload or assertion changed.
The partial matrix, exact old helper, traces, failure and successful cleanup remain
retained; a new complete 96-window run is required rather than joining subsets.

The second matrix completed 48 windows before Sydney validation reported
`canRun: false` with the preceding demo still active. The original response body
was not retained. The independent critic reproduced the close-before-End lifetime
with a controlled 1,000 ms End-intent delay: old lifetime left the active mission
and produced `ACTIVE_RUN_EXISTS`; awaiting ended UI/empty entry completed End and
made the next exact saved revision runnable. Both controlled probes exited 0 with
their intended assertions and cleaned only owned databases. The reusable harness
now awaits authoritative completion with the unchanged five-second checks.

New setup-only preflight first failed after 24 layouts because its empty-slot
assertion required literal null although the existing contract also permits an
omitted `activeMissionId`. HTTP success and enabled entry are now checked before
normalizing that optional field. The fresh preflight passed **96/96** layouts,
**4/4** mission Ends and **40** reopen/resize cycles, exit 0, no provider requests
or page errors; its task services and database were cleaned. It additionally
checks projected map markers and both analytic canvases within their viewports,
correcting a separately discovered visibility limitation in prior partial timing
runs. No product, workload, timeout, retry or acceptance budget changed. The new
helper and harness pass syntax, ESLint and formatting. Setup-only success is not
performance certification; all failed/partial results remain archived separately.

## Candidate 16 correction checks

The initial focused run passed 31/31. Its new signed-bar checks execute real
ECharts SVG rendering in Node, verifying that zero and both signed measurements
are inside the plot, lengths preserve the raw ratio, and a missing value stays
null. Component checks cover unchanged count bars with a newer frame header and
Comparison invalidation for labels, missing values and negative altitude.

Initial static checking rejected a direct assignment to the new test fixture's
readonly filter field. The fixture now replaces that immutable filter object;
no application or contract relaxation is involved. Lint, formatting and both
contract checks passed. The original static result remains retained.

The complete frontend attempt `frontend-full-13` passed 477/478, exit 1. The
existing actual-Cesium-child-resource recovery test timed out during its dynamic
SDK import (25.237 seconds elapsed; unchanged 5-second test timeout). Static jobs
were running concurrently. With no competing check, the unchanged isolated test
file passed all 20 in 2.62 seconds. Contention is a plausible explanation, not
proof of every failure cause. No assertion, retry setting or timeout changed.
A new complete frontend run is required; the focused result cannot replace it.

The fresh complete run `frontend-full-14` passed **478/478 in 47 files**, 43.06
seconds, exit 0, with no concurrent static jobs. All five final frontend static
checks and production/test/verification builds exit 0. Existing build chunk-size
warnings remain. The correction changes three frontend product files; backend
application and contracts still match the fully tested source. Independent review,
foreground remeasurement and a final complete browser repeat remain required.

Candidate 17's first real-library check exposed a test assumption: ECharts callback
`encode` contains coordinate dimensions, not tooltip encoding. The test now checks
the actual formatted tooltip as well as callback coordinates/identity. The next
check caught a product issue in the new tuple path: ECharts' default series opacity
0.8 multiplied the preserved RGBA stale alpha 0.45 into 0.36. Explicit series opacity
one restores the original 1/0.45 visual policy; the unchanged rendered-alpha assertion
then passes. All three focused files pass 27/27. Both failed new-check attempts
remain retained; no existing assertion or timeout was relaxed.

The complete candidate-17 frontend run `frontend-full-15` passes **480/480 in 48
files**, 43.43 seconds, exit 0. All five static checks and production/test/verification
builds pass. The source adds `profileSeries.ts`; the 439-file product inventory is
recorded in DELIVERY.md. Backend/contracts remain unchanged. No complete browser
or foreground pass from an earlier candidate is reused as candidate-17 evidence.

Candidate 18's focused run passes 34/34 in four files. The fresh complete frontend
run `frontend-full-16` passes **481/481 in 48 files**, 42.10 seconds, exit 0.
Typecheck, lint, formatting, generated contracts and frozen foundation checks all
exit 0, as do production/test/verification builds. The four-file product correction
is frontend-only; all 84 backend application and 205 contract files remain identical
to the fully tested backend source. The 439-file product manifest SHA-256 is
`c2190ad183ef46b442e8ec8eb66f3ae89cc9385322c0f99ea30fff85b300d92d`.
The final complete browser gate and fresh independent display evidence are pending.

Candidate 19's first focused run passed 37/38: an old component assertion expected
only one series after history expiry. It now explicitly requires `current` and the
silent `motion-axis-bounds` helper, retaining the assertion that no historical
series survives. The fresh focused run passes 38/38. New test typechecking also
caught omitted synthetic event arguments to actual graphic `trigger`; those calls
now supply explicit empty test events. Both failed attempts remain retained.

The first complete run `frontend-full-17` passes 485/485. After additional real-chart
resize/frozen-position checks and the critic's tooltip-disposal finding were fixed,
`frontend-full-18` again passes **485/485 in 49 files**, 42.35 seconds, exit 0.
All five final static checks pass. Tests verify actual public graphics, no per-motion
model update, last-painted current versus original historical tooltip values,
opaque IDs and reordered hit indices, removed/mission-changed identities, cleanup
before chart disposal, and conservative axis containment for the complete existing
linear coordinate path. Native pointer dispatch and final display gates remain
separate from SSR/library and component checks.

The new actual-browser hover regression failed on candidate 19 after a 0.25 px
pointer move inside the marker: its confined canvas tooltip intercepted the hit
and disappeared. The failed result, exit 1 and original context are retained as
`browser-hover-candidate19-a`. Candidate 20 uses ECharts' built-in non-enterable
HTML tooltip and owner-document literal text. The same pointer movement now keeps
the visible tooltip, complete source/value text and confined bounds; clicking
through it selects the original entity in Details. Corrected-frame/resize
reinspection and removal cleanup also pass with zero commands (2.2-second test,
3.547-second run, exit 0). Assertions inspect actual DOM visibility/content because
the tooltip is now a DOM element, while actual canvas pixels still locate the
marker. No private chart model, timeout extension or retry is used.

Candidate 20 focused checks pass **39/39** and the fresh complete frontend run
`frontend-full-19` passes **486/486 in 49 files**, 43.37 seconds, exit 0. All five
static checks, repository hygiene (788 source files) and production/test/verification
builds pass. The 403 production/test output files match byte-for-byte.

The complete final candidate-20 browser run `browser-final-7` passes **126/126**
in **886.017766 seconds**, wrapper exit 0. The complete machine-readable JSON and
every actual result were read: one passed result per test, zero retries, skips,
flaky tests, unexpected results or root errors. Readback verifies all 440 frozen
product files and every one of the 403 production/test output files. Ports 8011,
5181 and 5182 are free; its task-owned database was deleted after listener shutdown.
`final-browser-source-check-candidate20.json` retains this proof. All previous
attempts remain preserved with their original source identity.

The first supplemental readback helper could not print a Unicode arrow in a
passing title through Windows cp1252 stdout. Its UTF-8 output correction changes
only that task-local report helper; the complete subsequent readback exits 0.
The encoding error is retained separately and does not alter browser results.

Independent final-source native UI attempt A stops at a new historical-line pixel
coordinate lookup: its alpha >200 requirement cannot locate the thin antialiased
stroke visible in the failure image. The critic preserves the failed attempt and
narrows the lookup to the distinct historical RGB, positive coverage and multiple
matching pixels on one row, recording actual RGBA/coverage and excluding current
markers, grid and labels. The full attempt B passes **35/35**, exit 0, with 42 own
screenshots and zero providers/page errors. All source-gap, narrow, lifecycle,
recorded and external cases rerun. Historical line hover has no tooltip, matching
the declared numeric-inspection boundary. No product, wait, retry, performance
budget or required capability changed to obtain this result.

## Fresh reviewer and final audit-search correction

Fresh review of candidate 20 proves that valid opaque interactive request IDs
containing quotes or backslashes are returned and stored correctly but cannot be
found by pasting the displayed identity into Audit search. The raw JSON-escaped
form succeeds. Its first external-ID probe is rejected by that contract; it is a
retained setup failure, not a defect. Valid interactive endpoint evidence is
`final9-search-probe-b`.

Seven reusable tests exercise actual interactive creation/acquire/retry/audit reads
and historical UTF-8/ASCII-escaped receipts. The pre-fix run has four expected
failures and three passes, pytest exit 1 (`search-before-fix`). Candidate 22 adds
query forms only; all 19 audit cases pass, exit 0 (`search-after-fix`). Stored bytes,
original returned identities, cutoff/order/pagination and no-write behavior remain
asserted. ASCII case folding is documented without promising Unicode folding.
Complete candidate-22 checks pass: **562 backend** in **90.02 s**, **486 frontend
in 49 files** in **43.39 s**, all static/schema/foundation checks, production/test/
verification builds, and repository check (790 files). All exit 0. The final full
browser attempt 8 passes **126/126** in **888.195111 s**, wrapper exit 0. The
implementer reads every actual result: one pass per test, no retries/skips/flaky
results/root errors. Final readback verifies all 440 product files and all 403
paired production/test outputs, free test ports and deleted task database.
Fresh independent search follow-up is recorded below. Prior complete runs are
retained with their original source identity.

The fresh reviewer independently repeats its unchanged valid-ID API probe on
candidate 22 and passes all 19 audit tests. Its production-build foreground
ended-recording check passes **6/6** with six personally inspected screenshots,
zero dispatched commands, zero provider requests and zero application errors.
It verifies original quoted/backslash IDs, retained raw-JSON compatibility and
ASCII-only folding without treating a different-case Greek character as equal.
The first UI attempt fails before creating a page because an added metadata call
requires `--enable-automation`, which the actual-foreground helper deliberately
omits. That setup failure is retained. The reviewer returns the already allocated
debug port from an ignored helper copy and repeats the complete check under a new
tag; no product, browser-focus behavior, assertions or timeout changes.

Candidate 21's single ECharts dirty-rectangle option passes 57 focused tests,
typecheck and its isolated verification build, but independently fails the unchanged
equal-area performance budget. It is reverted, with exact candidate-20 frontend
byte equality verified. Candidate 22 has one product-file difference from candidate
20: the audit query implementation. Its full regression gate is separate from the
failed rendering experiment.

## Final documentation and preservation checks

The repository hygiene check passes on all 790 final source files. A supplementary
whole-tree `git diff --check` exits 2 with 79 whitespace findings, all in the
unrelated `research-brain/raw/repository/README.md`. That file's SHA-256 is exactly
the original Phase 6 baseline value
`8dd80136307ed1039c0d66f5ab3429957cdd04fad58bdb3d3bcb8a604184ce67`.
The full output, actual exit and per-file/line attribution are retained as
`diff-check-final.*` and `diff-check-attribution.json`. No unrelated content or
global Git whitespace setting is changed to manufacture a pass. Required product
format/static/schema checks remain separately passing.
