# Phase 6 independent critic — round 1

Status: **review in progress; acceptance withheld**. This critic did not implement
the Phase 6 product or tests. Static review began while the implementer's exclusive
foreground performance run occupied the machine. No critic execution load ran
before the implementer released the machine. Actual foreground evidence is recorded
below. Final scores remain pending the corrected history workflow and final gates;
missing evidence is not a pass.

## Actual foreground round 1 evidence (candidate 4)

Personally operated a fresh elevated headed Edge process with a task-owned database,
blank-grid providers and OS foreground PID corroboration. Product inventory:
`test-results/phase6-command-picture/candidate-4-product.json`, SHA-256
`5e65a296948692ff180c7de9a75adb83d1ca0218c5b863de60eeb177a59893c2`.

- `frontend/test-results/phase6-command-picture/critic-round1-a`: initial closed
  30-second sample and all lenses, then interrupted by physical foreground loss to
  the user's Chrome window. Exit 1; not an open-Profile pacing pass. Services and
  owned database cleaned successfully. The interrupted open sample did not retain
  its full trace; the sampler was subsequently hardened to retain failed traces,
  require sampled focus/visibility throughout and bound stalled rAF waits.
- `critic-round1-b`: all 40 Sydney units moving, all six lenses, current filter
  count 1/40, Profile shared selection agrees with Tactical and Details, two
  exclusive 30-second measurements. Closed Tactical display p95/p99 was
  20.814/27.737 ms; open Profile without history was 20.874/27.816 ms. Recording-age
  p95 was 244/267 ms. Both passed continuous visibility/focus checks, but the closed
  baseline already fails the strict 16.9 ms p95 target. These are bounded samples,
  not proof of sustained display acceptance.
- `critic-controls-agl-a`: exit 0; actual Fleet Stop accepted and held the selected
  entity while the other 39 moved; Pause/Resume/End operated with analytics open;
  explicit synthetic AGL-only stream excluded by Profile and shown Unknown in
  Comparison. Frozen fixture files unchanged. Zero provider attempts and page
  errors. Own screenshots personally opened and inspected.

The ended Statistics screenshot shows the honest distinction between a pinned
earlier cutoff and a later ended header; the helper clicked End before waiting for
its presented frame. A follow-up must explicitly inspect the completed cutoff/End
event before claiming final ended-audit coverage.

### P2 — Mature moving-40 history does not become available within the normal UI gate

Reproduction on candidate 4: run Sydney 20v20 for approximately 90 seconds, select
Friendly 01 in Profile, enable observed history and select 120 seconds. Both 60s
and 120s reads are emitted, but the Profile remains `History: loading` past the
existing five-second assertion. Neither request completed in the retained backend
log before teardown. `critic-round1-b/critic-failure.png` and its machine-readable
result/log retain the failure. This is independent of foreground loss.

Relevant path: `frontend/src/features/analytics/VerticalProfile.tsx` history-demand
effect, and `backend/app/recording/sqlite_repository.py:194`–`211`, which supplies
full retained frames to `project_history` for validation/projection. The existing
history path is inherited, but the failure directly blocks the Phase 6 history
workflow and its required performance gate. Diagnose and correct narrowly while
preserving all bounds, correction precedence and recording semantics. Do not
inflate timeouts or lower history limits to turn this into a pass.

The screenshot's source-time/wall-time difference is **not** a measured publication
gap: the simulator advances effective time in fixed 0.2s steps. Additional live
recording-age measurement is required before quantifying responsiveness impact.

### P2 — Profile history failure hides the reason and suggests the wrong recovery

`VerticalProfile.tsx:356` currently formats every unavailable result as
`${state.observed.status} · select an entity with observations`, including
`error`. A valid selected entity with a timeout therefore loses the actual error
reason and gets misleading selection guidance. Reuse the existing Details pattern:
show `state.observed.error` and offer `runtime.retryHistory()`.

## Responses reviewed so far

Candidate 4 adds defined-group checks at `VerticalProfile.tsx:70`, `:110` and
`CommandPicture.tsx:356`; actual AGL-only UI results confirm the current-point and
comparison corrections. `ObservedTelemetry.tsx:98` reuses exact
`assertHistoryAnchor`. The new historical numeric disclosure begins at
`VerticalProfile.tsx:363`. `ChartHost.tsx:152` disposes synchronously on hidden,
and Command Picture now propagates owner-document visibility to its subscribers.
Literal raw-content search is accurately labelled. These source corrections are
appropriate; focused independent tests and resumed history/background UI checks
remain pending. The original findings below are retained as review history.

## Personally verified static findings

### P1 — AGL-only sets bypass the native altitude exclusion

`frontend/src/features/analytics/VerticalProfile.tsx` (`included` and historical
`valid` predicates), and `frontend/src/features/analytics/CommandPicture.tsx`
(Comparison altitude measurement predicate).

Reproduction from the current expressions: filter/select only tracks with AGL
altitude. `altitudeGroup` correctly returns `undefined`; the selectable group list
is then empty and `group` is also `undefined`. Comparing the two with `===` accepts
the excluded observations. The Profile plots current AGL metres, its historical
predicate accepts AGL history, and Comparison emits AGL values under a datum-
unavailable caption. The mixed-datum tests do not cover this all-excluded case.

Impact: incompatible local-ground heights become a common vertical axis, contrary
to mandatory Phase 6 altitude correctness and the displayed exclusion policy.
Correction: require a defined common group for all three predicates; verify AGL-
only current, selected comparison and historical data, including filtering an
initially mixed scene down to AGL alone.

### P2 — Telemetry results are not validated against the pinned recording anchor

`frontend/src/features/analytics/ObservedTelemetry.tsx:88`–`97` accepts the direct
`readObservedHistory` response and assigns it the requested local key. The API
decoder checks the response's internal contract but cannot check its relationship
to this request. The existing `createObservedHistory` owner checks the full anchor;
this path bypasses that check.

Reproduction: supply a schema-valid observed-history response for a different
mission/entity/frame/window to the pending telemetry read. The component currently
labels and summarizes it as the selected entity at the pinned audit cutoff.
Generation cancellation alone does not reject such a mismatched response.

Impact: a historical summary can claim a different mission or time basis than its
measurements. Correction: validate mission, entity, recording, epoch, frame,
sequence, effective time and window against the request before publishing; test
valid but mismatched responses as well as late responses.

### P2 — Historical Profile points lack accessible numeric inspection

`frontend/src/features/analytics/VerticalProfile.tsx` maps history to distance/height
pairs, renders it with `silent: true`, and supplies a numeric table only for current
committed positions. Historical sample timestamps, values and segment reasons are
not inspectable through keyboard controls or tooltips.

Impact: the plotted historical evidence has no accessible numeric alternative,
despite the explicit Profile requirement. Correction: provide a bounded paginated
disclosure table for the already-returned observed points (source timestamp,
distance, original altitude reference and segment/break reason). Do not introduce
another history query or replay state.

## Candidate issue awaiting direct reproduction

`ChartHost.tsx:148`–`156` defers document-hidden disposal to
`requestAnimationFrame`. Background documents may suspend that callback, retaining
the chart and motion subscription until visibility returns. The current lifecycle
test invokes mocked rAF synchronously even with `document.hidden`, so it cannot
demonstrate cleanup when rAF is suspended. Verify a hidden-document transition with
a non-running rAF queue; dispose synchronously on hide if confirmed.

## Supplied evidence and remaining independent gates

Read: Phase 6 baseline, plan, metric dictionary, deferred Phase 5 register, current
analytics/runtime/history/selection/recording/module code and focused tests. The
review found good separation of typed external analytics from generic world data,
explicit asset/control denominators, original request/event identities, null
measurements, native datum groups, recording-time audit bounds and source-time
telemetry definitions. Those observations are source review, not regression or
display certification.

Still required here: exact line references for the final reviewed source, focused
checks, an independently operated actual foreground Sydney moving 40-unit scenario,
ended-recording inspection, own screenshots and representative exclusive
measurements with zero provider requests. Final complete regression evidence must
be inspected independently. Phase 5 resolver/conformance and inherited D7/Video
gaps remain separate; this review will not certify them by inheritance.

## Candidate 5 follow-up: personal results and interruptions

`critic-round1-c` used candidate 5 product inventory SHA-256
`753c751b19cea68b05e090c68d008cb62f8035f8c7dcb83b4dfac4cfbd36017d`.
The same ordinary five-second 60→120-second history readiness assertion failed
after the moving Sydney 40-unit scenario matured. The failure screenshot now
correctly says `loading · reading retained observations`; no request completed
before teardown. The first compact-cache correction therefore did **not** close
the responsiveness finding. No timeout was inflated to call this a pass.

Personally completed two 30-second foreground windows in that run:

| Configuration | Display FPS | Display p95 / p99 ms | >50 ms intervals | Recording-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Tactical, analytics closed | 95.27 | 20.808 / 27.704 | 1 | 263 |
| Tactical + Profile + Details, history off | 83.67 | 27.719 / 27.854 | 2 | 264 |

The observed +6.911 ms p95 difference exceeds the declared +5 ms incremental
budget. These windows are not a clean attribution of chart cost: opening shared
selection also opened Details, and the OS window rectangle moved during the closed
sample. Both retained continuous DOM visibility/focus and native task-PID checks,
with zero recorded focus-loss events. They remain evidence with these limitations,
not a pacing pass. The broader matched matrix remains required.

Personally ran the final candidate-5 focused commands: 28/28 frontend checks in
three files (`analytics`, `analytics-lifecycle`, `observedHistory`); 49/49 backend
checks (`analytics`, `observed_history`, `observation_cache`, `storage_codec`). Both
processes exited 0. Full logs and backend JUnit were retained. No product or
regression-test source was changed by this critic. The critic did modify the
explicitly authorized measurement harness and its own ignored review scripts.

`critic-round1-d` attempted an explicitly labelled history-duration diagnostic
while retaining the failed five-second gate. It ended before measuring: the task
browser was not the native foreground window. `critic-round1-e` added a bounded
setup pause to activate the task window through the approved Computer Use API.
`sky.list_windows()` returned the task Edge window, but the combined activation /
state-capture call never returned; it was interrupted after 658.7 seconds. There
was no success result or native screenshot. The independent harness had already
hit its 90-second activation setup deadline and cleaned up. No diagnostic history
completion timing was obtained from either attempt. Cleanup manifests confirm
owned services stopped and task databases deleted. These interruptions must not
be recorded as product test passes or substituted with layout emulation.

## Candidate 6 proof-cache correction: independent source review

Candidate-6 product inventory SHA-256:
`345484ecf4dee578f01a3f824dc7384a348fd0f44040501006af6ced19288916`.
No execution was performed by this critic during the implementer's full regression
run; the following is personal source inspection, not yet personal test evidence.

- `backend/app/recording/sqlite_repository.py:252` hashes the exact encoded bytes
  produced from the fully validated canonical frame. Own-transaction proofs are
  installed only after SQL COMMIT (`:268`). Outer transactions retain at most
  1,000 pending fingerprints (`:275`), install them only in the successful `else`
  branch (`:284`) and clear pending state in `finally`; rollback installs none.
- `backend/app/recording/observation_cache.py:60` uses a separate short proof lock,
  so the writer never waits for a history projection's decoding lock. The proof
  stores only a SHA-256 fingerprint, not mutable world state or command authority.
- `:75` validates a freshly decoded selected observation only after matching an
  exact committed-byte proof. `:100` otherwise invokes the original full reader,
  including legacy adaptation. Changed/corrupt bytes cannot inherit a proof from
  the same mission/frame ID; compressed-envelope checks still run on cache misses.
- The existing result cache remains bounded by 1,000 entries and 16 MiB and returns
  fresh models. Proofs are process-local, capped at 1,000 and cleared at close.
  Frames, cadence, SQLite durability, persisted formats and source semantics are
  unchanged.

The new tests directly cover committed/strict byte-identical results, rollback,
validation failure, corrupted unrelated fields, proof bounds and writer-lock
isolation. No new material source correctness finding was identified. The reported
53 focused passes and 1,029.6 ms committed / 4,592 ms strict-cold diagnostic are
**supplied evidence** pending independent reproduction. Mature live history,
ended-audit completion, background cleanup and the expanded matrix remain open.

## Candidate 7 Comparison correction and browser-test adaptations

The implementer discovered another P2 Phase 6 missing-data defect while adapting
the existing Tactical regression: an entity selected before removal silently
vanished from Comparison, and the empty-selection prompt appeared despite the
retained shared ObjectRef/Details selection. This was **not** a critic-discovered
finding. The critic independently reviewed the correction and its tests.

Comparison now preserves the first four selected IDs in original order, keeps
unavailable IDs as explicit rows, uses null chart values, shows `Unknown` numeric
and timestamp fields, and labels the observation `Unavailable in this frame`.
It invents neither a display label nor a measurement. All-missing and mixed
available/missing tests assert both numeric rows and exact chart-data order.
The empty-selection prompt is restricted to genuinely empty ID selections.

Independently compared the `mission.spec.ts`, `retention.spec.ts` and
`tactical.spec.ts` adaptations against the earlier assertions. Obsolete Command
Picture placeholder locators are replaced with real frame/context/count and
Comparison controls. Frame ID, source time, sequence, count, shared selection,
stream ownership, stale/recovery, unavailable removed identities, renderer
retention, camera and accessibility invariants remain asserted. No blanket retry,
timeout inflation or material assertion weakening was observed. These changes
require a complete final browser rerun; earlier failures remain evidence.

The finalized candidate-7 product manifest SHA-256 is
`6482dc4d4fbbdf0629304de3fe8403c065a7cb3091e899962c35772513c94ac8`.
After an explicit CPU release, the critic personally ran 30/30 focused frontend
checks (three files) and 53/53 backend analytics/history/cache/storage checks, both
processes exit 0. The backend JUnit contains zero failures, errors and skips.
`test-results/phase6-command-picture/critic-focused-candidate7.json` records the
commands' result identities and links to the complete logs/JUnit. No foreground
browser or task service was launched during those focused checks. This supplies
fresh independent execution of the material backend proof-cache and frontend
missing-selection corrections; actual foreground history and display gates still
remain open.

## Candidate 7 foreground follow-up and measurement limitations

Personally ran `phase6-large-2` against the final candidate-7 build: process exit
0, zero provider attempts and page errors, task-owned cleanup confirmed. Inspected
all three screenshots. The explicitly synthetic 10,000-entity/10,000-event fixture
showed four affiliation totals of 2,500, 10,000 unknown classifications, the complete
10,000-event/zero-request summary and 10,000 compatible ellipsoid profile points.
Load plus Overview took 1,798 ms; Statistics readiness 1,914 ms; Profile 307 ms.
These are bounded synthetic diagnostic results, not moving 10,000-unit capacity.
The focus-emulation limitation below also applies to this run's continuity checks.

`critic-round1-f` personally verified mature Sydney 40-unit history within the
unchanged five-second UI gate: 60→120-second history became available in 2,670 ms.
The retained numeric table showed source UTC, native ELLIPSOID/WGS84 values, radial
distance and window-start segment labels. The first selected history contained
443 points and later reached 601; source limits were not changed. Shared chart,
Tactical and Details selection agreed. This closes the formerly reproduced mature
live-history responsiveness failure for this bounded workload, subject to final
source and regression review.

The same run retained three exclusive 30-second samples, with incidental Details
closed before the two Profile windows:

| Configuration | Display FPS | Display p95 / p99 ms | >50 ms | Recording-age p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Tactical, analytics closed | 89.34 | 20.838 / 27.767 | 0 | 257 |
| Tactical + Profile, history off | 77.34 | 27.777 / 34.723 | 2 | 277 |
| Tactical + Profile, history 120s | 81.80 | 27.702 / 34.723 | 1 | 284 |

The +6.939/+6.864 ms p95 increments exceed the predeclared +5 ms budget. This
cannot be classified solely as an inherited D7 failure. A narrow chart-update
correction and new final-source measurements are required. These samples retain
native task-PID confirmation before and after each window, but their DOM continuity
claims are weakened by the subsequently discovered focus-emulation issue.

Run `f` ended with process exit 1 because the critic's new narrow-layout harness
used visible text `Through UTC` as the accessible input name; the actual explicit
ARIA name is `Audit through UTC` (`RecordedActivity.tsx:135`). The input exists and
the failure screenshot is retained. Only the ignored review harness locator was
corrected; no product assertion or timeout was changed. The incomplete run does
not certify remaining narrow layouts, Stop/End or ended audit.

The background-document check in `f` also correctly recorded a non-pass: opening
a blank page did not make the original document hidden. Reading the installed
Playwright 1.63 implementation found that its page session enables focus emulation
by default (`node_modules/playwright-core/lib/coreBundle.js:37638`). That emulation
can keep `document.hidden` and `document.hasFocus()` from reflecting the desktop;
before/after native PID checks alone do not establish mid-window continuity.
`critic-round1-g`, an explicitly UI-only attempt, confirmed that sending `enabled:
false` from a separate CDP session does not remove the owning Playwright session's
override. It failed the unchanged five-second real-hidden predicate and cleaned
up, with no new performance measurements. Both failures and full results remain.

The critic prepared a harness-only correction using documented
`connectOverCDP({ noDefaults: true })` with a fresh task-owned Edge default context.
Each workload gets a new profile/browser, and both the browser and owning server
are closed. This avoids modifying operator contexts or Playwright package files.
A two-tab real-visibility smoke and resumed UI/measurement gates are still required
before this correction can be called verified. The application lifecycle fix is
not disproved by an emulated document that never actually became hidden.
