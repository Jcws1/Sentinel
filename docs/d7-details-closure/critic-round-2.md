# Independent critic review, round 2

20 September 2026. Fresh reviewer; I did not implement the changes and did not
edit production source. This review applies to the cooperative-analysis candidate
inventoried below. It supersedes neither the retained round-1 adverse evidence
nor the need to review a later material fix.

The cold active-review publication defect identified in round 1 is corrected in
my two independent foreground samples. Storage fidelity and the Details changes
have strong focused evidence. I also reproduced a **5,179.6 ms Resume operation**
after lost Stop/reload/Return to active demo. Only about 75.8 ms was spent between
network request start and response completion. Two instrumented follow-ups were
fast; their evidence does not establish the original delay's cause. Separately,
source inspection and deterministic regressions establish a dropped-authority-read
defect in this candidate. **Do not grant overall milestone acceptance yet.**

## Identity and method

HEAD is `6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6` plus the uncommitted changes.
The 198-file production/static-asset inventory is
`test-results/d7-details-closure/critic-round-2/source-reviewed.json`, SHA-256
`6f05b33a2917e932aa3b95af3b6f5056b7f924e0476a6b5a8a83cc3111d90d94`.
Every inventoried file still matched after my successful UI run. I inspected the
full production diff plus adjacent recording, authority, scheduler, contracts,
geometry, profile, renderer camera/picking, Details and control-client paths.

I ran the focused tests and two recording probes sequentially, then obtained an
exclusive foreground runtime window. The author held all competing task tests,
builds and benchmarks. Edge was 153.0.4234.48, headed and launched outside the
sandbox into the actual desktop, with a fresh context and isolated database.
Viewport was 1440×900 CSS pixels, DPR approximately 1. The supplied machine
inventory is i7-10700K/RTX3060, physical 2560×1440 at 144 Hz; I did not independently
remeasure physical hardware. The browser's emulated screen dimensions and the
760/820/900 layouts do not certify separate physical displays.

Native `sky.list_windows` independently returned the uniquely titled reviewer
Edge window (successful attempt B: window 2954048). Browser visibility/focus and
my screenshots provide additional evidence. Native accessibility capture hung
in attempt A despite a requested 20-second timeout, until the parent interrupted
it after 568.5 seconds. A's browser correctly stopped at its finite 60-second
confirmation checkpoint and cleaned itself up. Its failure is retained; it is
not an application failure. B used immediate native enumeration only, preserving
the same application assertions. I obtained no native screenshot/accessibility
result and did not retry the known failing capture path.

All external requests were blocked: **0 provider requests and 0 attempted
external requests**. No Google/configured-content verification is claimed here.

## Severity-ranked findings

### Critical

None demonstrated in this candidate.

### High

No new high-severity defect demonstrated. Round-1 H1 is closed for the measured
cold-active workload, subject to final source identity and complete regression.

The change in `backend/app/commands/scheduler.py:231–271` extracts the original
nominal loop into a generator. Synchronous callers exhaust the same generator;
review yields only between complete nominal ticks. Termination, transitions and
returned plan are unchanged. `backend/app/scenarios/analysis.py:35–77` retains
complete private analysis, a single async gate and bounded immutable cache. It
has no CPU thread or background executor. Cancellation discards partial work;
cache entries appear only after complete analysis. Fresh admission and checked-at
state are assembled after the await in `backend/app/scenarios/service.py:44–61`.
The live source's fixed-step and publication paths remain unchanged.

Two genuinely cold saved revisions while Sydney forty remained active produced
maximum source-arrival gaps **265.8 and 280.7 ms**, well within the unchanged
750 ms goal. Consecutive server recorded-at gaps were **250 and 281 ms**. Full
review completion took **4,320.2 and 5,224.1 ms**: cooperative sharing improves
source responsiveness but does not make cold active analysis faster. Both replies
correctly refused admission, named the exact requested revision/hash, and left
running revision 2 unchanged. No early or partial success was shown.

### Medium — M1: overlapping authority reads can be dropped; Resume outlier retained

Relevant source: `frontend/src/services/interactiveClient.ts:263–304,946–990,1049–1074`
and `frontend/src/features/entities/SimulationControls.tsx:19–43,66–70,136–146`.

Reproduction in my successful B: Pause a moving Sydney forty-unit mission; lose
a committed Stop response; reload, retry its exact retained request, return to
the active mission, then open Simulation and choose Resume. The helper's two UI
clicks through receipt parsing took **5,179.6 ms**. Resume's network
requestStart→responseEnd was **75.763 ms**. Pause and End took 486.2 and 428.2 ms.

This independently reproduces the *size* of the historical Resume outlier. It
must not be summarized as absent merely because six simpler pause/resume cycles
were fast. The original B probe did not persist its menu-item input/actionability
marks, so it does not establish exactly where the pre-dispatch delay occurred.

Source inspection identifies a concrete race: `refresh()` drops requests while
another read is polling; `setMission()` increments generation, clears current
status, and requests refresh. An old generation's read can then be discarded
without a replacement read until the five-second poll. Resume correctly remains
disabled without synchronized authority. A same-generation refresh can also be
dropped after a committed revision changes, leaving the earlier status in place.
Do not remove ownership or synchronized-state guards to make Resume appear
responsive.

I inspected the author's new deterministic tests before execution: a held old
status followed by a mission switch, overlapping same-generation refreshes, and
disposal. They use valid decoded status fixtures and do not advance the five-second
poll. The author's retained **pre-fix execution** has **2 failed / 20 passed**:
the new mission remained undefined, and the overlapping read remained revision 1
instead of revision 2. I read the full failures in
`test-results/d7-details-closure/resume-regression-before.log`; execution itself
is supplied evidence, not my independent test run.

Recommended correction: preserve stale-response refusal and queue
an authoritative reread for the current generation, with meaningful generation,
overlap and disposal tests. A material production correction requires another
fresh independent reviewer.

After my runtime window, the author implemented a shared refresh promise and
queued follow-up read. The supplied post-fix log has **22 passed**. This report
and its scores apply to my frozen 198-file **pre-fix** inventory; I do not claim
independent approval of that later change. Its fresh third review remains required.

#### Instrumented foreground follow-up

Both fresh attempts repeated lost Stop → reload → exact retry → Return active →
Resume, with the original UI assertions retained. Native enumeration corroborated
Edge windows **153094502** and **46141366**. Input capture, DOM mutation records,
fetch timings and source/status revisions are retained separately in
`frontend/test-results/d7-details-closure/critic-round-2-resume-a` and
`critic-round-2-resume-b`; `resume-audit.json` contains the full timelines.

| Measurement | A | B |
| --- | ---: | ---: |
| Helper start through committed Resume receipt | 387.742 ms | 399.927 ms |
| Observed disabled “Waiting for synchronized state” interval | 74.2 ms | 84.0 ms |
| Simulation menu click → actual Resume click | 81.3 ms | 60.2 ms |
| Actual Resume click → command fetch invocation | 47.5 ms | 19.7 ms |
| Actual Resume click → decoded command response | 200.2 ms | 210.5 ms |
| Command network requestStart → responseEnd | 126.654 ms | 162.960 ms |

In A, the menu click was at epoch-ms **1789895668749**, Resume click at
**1789895668830**, and command fetch at **1789895668878**. In B the corresponding
raw events are retained alongside the summarized values in
`test-results/d7-details-closure/critic-round-2/resume-summary.json`. Both clicks
occurred only after matching paused run revision 2, lease revision 1 and executor
epoch were available from source and status; the accepted command advanced to
running revision 3. These are short authority-readiness waits, not a demonstrated
five-second post-click stall. The observation code itself adds small browser work.

Neither instrumented attempt reproduced the original delay. The dropped-read
defect is proven separately; attributing the original 5,179.6 ms result to that
defect remains an inference. Do not remove that outlier, replace it with these
two fast results, or present the inference as a traced causal result.

### Medium — M2: full acceptance evidence and historical 5v0 attribution remain open

`frontend/tests/browser/d4-refinement.spec.ts:71–117` retains a real canvas pick
and the accepted-receipt assertion. Its new request/receipt/camera attachment is
useful diagnostic evidence, not a proven fix. I inspected camera restore and
surface-picking adjacent paths and found no evidence to name the historical
out-of-area root cause. Passing untouched-baseline repeats cannot establish it.
Retain the original failure and say that attribution is unresolved.

The complete final browser suite, final matched ten-minute soak and configured
Video results were pending when this review ran. The author subsequently reported
completed baseline/candidate blank-grid pane captures; I did not independently
reproduce or inspect every result from that matrix. My one bounded
Tactical capture cannot establish those gates. Earlier >50 ms stalls remain
adverse evidence even though this capture passes. Finish the required checks on
the final reviewed source, or withhold the affected acceptance decision.

### Low — L1: checkpoint transaction contract remains caller-owned

`backend/app/recording/sqlite_repository.py:152–158,269–272` may advance schema 5
while storing a checkpoint. Both production callers enclose it in the existing
transaction, so no current production atomicity defect was found. The low-level
method itself does not reject an autocommit caller. Keep its explicit documented
precondition; a future standalone caller must not advance the format marker
before a failed insert. This does not justify an unrelated late rewrite.

## Personally verified results

### Exactness, persistence and recovery

Focused command covered `test_storage_codec.py`, `test_scenario_analysis.py`,
`test_recording_equivalence.py` and `test_demo_profile.py`: **40 passed in 16.01 s**,
two existing dependency deprecation warnings. Full log and JUnit XML are retained
under `test-results/d7-details-closure/critic-round-2`.

I verified that the internal codec keeps exact UTF-8 bytes and separately versions
the envelope/SQLite capability. It bounds input/output, checks a single complete
zlib stream, declared size, SHA-256 and UTF-8 before strict historical frame
readers. Historical TEXT remains untouched. Payloads outside optional compression
bounds retain existing TEXT capacity. Unsupported/truncated/concatenated/oversized
and corrupt blobs fail explicitly. FULL durability and transaction-before-
publication remain intact; rollback includes the format marker. Killed-process
checks cover an empty first transaction and updates of previously committed
frame/checkpoint data. Canonical golden tests cover frames, events, checkpoints,
receipts and scenario revisions across both locations, including duplicate create,
lease expiry/reclaim and End. No recording cadence or authoritative history is
removed; static image bytes never enter recordings.

My independent uncontended Sydney40 comparison used the preserved current-source
baseline snapshot and candidate, same fixture hash
`9c0e9326c3a24de26ca5559f4da36fe0525ad3375113f3dab83cd6ae43dfdb56`, 100 ticks,
20 simulated seconds, one renewal, End and normal close. This is one ordered
baseline→candidate pair, not a complete explanation of historical timing variance.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| New measured frames | 101 | 101 |
| Logical measured frame bytes | 19,703,512 | 19,703,512 |
| Stored measured frame bytes | 19,703,512 | 1,456,085 |
| Logical bytes / frame | 195,084.277 | 195,084.277 |
| Stored bytes / frame | 195,084.277 | 14,416.683 |
| Stored bytes / entity / simulation second | 24,629.390 | 1,820.106 |
| Durable tick median / p95 | 76.157 / 113.741 ms | 60.106 / 93.170 ms |
| Measured wall time | 8.447 s | 7.014 s |
| Normal-closed DB allocation, 105 frames | 21,032,960 B | 2,138,112 B |
| Closed DB allocation / total frame | 200,313.905 B | 20,362.971 B |
| Normal-closed WAL / SHM | 0 / 0 B | 0 / 0 B |

This is about **92.61% lower stored frame payload** and **89.83% lower closed DB
allocation**, with identical logical byte counts and independent exact-hash
regressions. The comparison uses matched lifecycle stages, so it is not a WAL
redistribution claim. I did not measure cumulative device write volume, write
amplification or per-operation allocation. Both disposable databases were deleted.
Raw reports: `test-results/performance-closure/critic-m1-r2-recording-before` and
`critic-m1-r2-recording-after`; normalized values are in my `recording-summary.json`.

### UI, exact review and retries

I personally ran the Sydney40/80-action fixture with two supported hornet-profile
substitutions solely to exercise both affiliations' image mapping. Geometry and
actions remain unchanged. All forty authoritative positions changed after Run.
The five UI validation samples were one cold r1, three repeated r1 and cold r2
after the lost-Save retry; the first cold input→review DOM was **2,437.1 ms**, the
three repeated values **204.6, 193.3 and 186.6 ms** (median **193.3 ms**), and r2
was **2,483.9 ms**. Repeated response headers arrived approximately 10.9–15.1 ms
after network start; body completion was approximately 97.7–111.0 ms. These are
candidate observations, not an independent matched frontend A/B comparison.
Two rAFs remain a paint-opportunity proxy, not compositor proof.

Verified through real UI actions and authority assertions:

- Keyboard exact-revision review; dirty Validate disabled. A committed Save
  reply is deliberately lost. Reload/retry preserves the exact request body and
  identity, with only revision 2 created.
- Both supplied PNGs, explicit profile/silhouette/type/name mapping, black framing,
  and same quadcopter image across friendly/hostile profiles. Unsupported Lancet
  receives a truthful fallback. Pin remains tied to Friendly 01 while selection
  follows another entity. No model is inferred from its name or affiliation.
- Desktop and 760/820/900 layouts have usable image/identity/telemetry, no Details
  horizontal overflow, and working scroll access. I inspected each screenshot
  against the supplied Shield AI reference. The narrow docked arrangement moves
  telemetry alongside the image while retaining hierarchy and legibility.
- Deliberately aborted quadcopter asset shows the unavailable fallback; switching
  to STING still succeeds and image-well height does not change. Source PNG and
  repository asset SHA-256s match byte-for-byte. Contain framing adds no crop;
  original airframe edge clipping remains in the supplied material.
- Pause freezes authoritative positions. Lost Stop survives reload, replay body
  and identity are exact, and only one matching Stop event exists. Resume and
  End commit; reload/Previous demos opens populated read-only recorded Details.

My screenshots are in
`frontend/test-results/d7-details-closure/critic-round-2-ui-b`: `04-sting-detail`,
`05-quadcopter-detail`, `05b-friendly-quadcopter`, `06-pinned-sting`,
`07-unsupported`, `08-layout-760/820/900`, `09-after-image-failure` and
`11-recorded-read-only` PNGs. The source inventory and original-image hash
comparison were checked after the runtime completed.

### One bounded compositor capture

The uncontended moving Sydney40 Tactical-grid capture has **3,431 compositor
presentations / 3,430 intervals**, bounded by CDP timestamps over about 30 seconds:

| Mean FPS | Median | p95 | p99 | Max | >50 ms | Estimated missed 144 Hz slots |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 114.313 | 6.9505 ms | 13.926 ms | 20.849 ms | 27.833 ms | 0 | 954 |

This meets the predeclared thresholds for this capture. Orchestrator was visible,
normal Tactical overlays remained, and all forty tracks still moved at the end.
The frame data uses `Display::FrameDisplayed`, not a rAF average. Missed-slot
counts estimate intervals relative to the supplied 144 Hz display setting; they
do not identify exact driver-level drops. Source age is bounded to this capture
window (correcting the prior review probe's missing end filter): 152 arrivals,
median **64 ms**, p95 **105 ms**, p99 **128 ms**, maximum **138 ms**. It measures
recorded-at→arrival wall-clock difference, not source-observation truth age or
input-to-photon latency. Full trace events are retained.

I did not independently measure ordinary 3D, configured Video, hidden-pane
resource reuse or the ten-minute soak. Renderer/presentation ownership and camera
code have no production diff in this candidate, but that inspection does not
replace the required runtime matrix.

## Supplied evidence and outstanding work

The author's matched backend/UI before/after samples, controlled Sydney ABBA
recording probes, prior complete suites, baseline soak and profiling are supplied
evidence. My measurements above are independent observations. I do not adopt
unfinished final results as passes. In particular, the initially adverse Sydney10
cold validation sample (+11.9%) must remain visible even if the subsequently
prospectively sampled five-pair median meets the unchanged 10% goal.

The full acceptance report must also retain historical 5v0 and Video budget-stop
evidence, all failed attempts, the round-1 thread-contention failure, this review's
Resume outlier, and native-tool limitations. No score waives these gates.

## Runtime cleanup

Both recording databases were removed. UI attempts A and B and both Resume
diagnostics report
`servicesStopped=true`, `cleanupOk=true`, and `deleted=true`; ports 5443/8243 were
independently checked free. Browser contexts were closed in `finally`. All raw
outputs, failures, probe source, screenshots and inventories remain for external
SHA-256 archival. I did not open operator databases, change credentials or
preferences, commit or push.

## Scores and acceptance recommendation

Scores describe the reviewed candidate and demonstrated evidence, not the author's
later refresh correction. An overall score is an engineering judgment, not a
substitute for any required gate or an arithmetic acceptance rule.

| Category | Score / 10 | Reason |
| --- | ---: | --- |
| Persistence/backend correctness | 9.3 | Strong exact reconstruction, transaction, history and cooperative-analysis evidence; no demonstrated new data-loss path. |
| Frontend correctness | 8.3 | Details and authoring work in my foreground runs; the proven dropped-read branch can leave controls waiting for the poll. |
| Compatibility/recovery | 8.8 | Focused old/new storage and exact retry tests pass; final complete browser/recovery evidence remains required. |
| Performance/resource efficiency | 8.8 | Large normalized retained-storage reduction and responsive active source; cold analysis is not universally faster, and full display/soak acceptance is incomplete. |
| Details fidelity and usability | 9.2 | Correct original photos, truthful profile mapping, black framing, silhouette/name hierarchy, keyboard review, narrow layouts, pinning and recorded inspection. |
| Maintainability | 9.0 | Small isolated codec/cache/presentation changes with meaningful tests; concurrency fix needs fresh review rather than assumed approval. |
| **Overall** | **8.8** | Material authority-read defect in reviewed source plus unfinished acceptance evidence. |

**Recommendation: partial performance closure; do not accept the full milestone
on this round-2 candidate.** Round-1 cold-active publication responsiveness is
closed for my bounded samples. Short-workload storage efficiency and the scoped
Details behavior are supported. Full functional/recovery acceptance is conditional
on the final reviewed source passing all required suites. Overall display
performance remains withheld until its full measurements and provider constraints
are accounted for; my single Tactical window is a scoped pass only.

Remaining blockers are fresh review and final regression of the material authority
refresh correction, the required final full-suite/soak/configured-content evidence,
and honest disposition of any unmet thresholds. Historical 5v0 attribution and the
original Resume timing cause remain unresolved diagnostic limitations. All my
services and contexts are stopped, both diagnostic databases are deleted, and I
have released the exclusive runtime window. No operator data was modified.
