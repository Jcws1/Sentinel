# Independent D7 performance-closure critic

20 September 2026. Fresh reviewer, independent of the production implementation.
I did not edit production code. I performed source/method review, wrote and ran an
independent foreground probe, inspected its screenshots and ran focused regressions.
The final whole-repository gate belongs to the implementation author's separately
reported run; its result must not be inferred from my subset.

## Source identity and scope

I independently hashed all **193 production files** in the preserved current
working-tree baseline. Exactly two differ: `backend/app/commands/scheduler.py`
and `backend/app/commands/zone_rules.py`. No baseline production file is missing.
This comparison includes the existing uncommitted D7, Orchestrator and location
work; it is not a comparison against an older commit. HEAD is
`83364f617b3e8842426b0551faa670b5cfd5995a`.

My inventory is `frontend/test-results/performance-closure/critic/source-audit.json`,
SHA-256 `0f49339e4f50449d8cdfe59da1362b7533c58dc5c47a73472612429f653e8f21`.
Reviewed production hashes:

- `scheduler.py`: `1b392060ed1729a00cd84c23d3fb54bd6a65ff770f7dc52b5a4d2eafe100dde5`.
- `zone_rules.py`: `79b655351b6bd8578e3a58d213a6aaf1b28c54dae9a7f7246e4032ce3a7633b6`.

I read the changed functions, kinematics, scenario review/instantiation, command
and source ownership, SQLite repository, canonical/historical readers, frontend
revision and pending-request ownership, shared presentation/interpolation,
runtime generation fences and pane visibility ownership. I also inspected the
new goldens and regressions, benchmark runner and original raw results.

## Correctness assessment

The shallow candidate copy at [scheduler.py:193](../../backend/app/commands/scheduler.py#L193)
is safe for the current `kinematics.step` contract: that function only replaces
scalar progress values. It reads origin/destination and constructs a position.
The candidate still has a distinct dictionary, so a refused boundary step cannot
advance the retained motion. Completion samples keep their explicit deep copy.
The new refusal test guards that important assumption against future nested
mutation. The complete-plan goldens cover default and non-default geometry,
restricted-path failure/dependency propagation, and explicit-time conflicts.

The unrestricted shortcut reads the current restricted rings on every call. It
does not cache geometry or skip checks on an existing restricted ring. Shape,
extent, altitude and exact revision validation remain owned by the existing
contracts and admission paths. There is no cache key or invalidation change.

I found no introduced change to recording cadence, simulation timing, retained
samples/events, canonical bytes, hash rules, request identities, reader versions,
or renderer quality. SQLite remains FULL-synchronous WAL. The outer transaction
still commits frame/events/checkpoint/receipt before publication; exact duplicate
requests resolve before new admission. Readers validate historical representations
before in-memory adaptation. No migration is required by these edits.

Frontend saved-revision equality, review-generation fencing, dirty/unapplied edit
refusal and pending-body persistence are untouched. Shared interpolation remains
bounded to committed positions; it clears on stale/discontinuous/changed ownership
conditions. Runtime owns transport, panes subscribe, and hidden-pane lifecycle
ownership was not rewritten.

## Methodology challenges

The baseline snapshot is appropriate. The matched fixture hashes and canonical
review hashes agree in the supplied results. First-review samples use fresh
repositories/contexts, but later fixtures reuse imported Python code and OS
caches: these are not cold-machine measurements. Three repeated samples are useful
for a large median effect, not latency-tail certification.

The measured recording window contains **100 simulation ticks plus one renewal
commit**, or **101 newly committed frames**. The profiling runs add ten separate
ticks before End; final closed databases contain **115 frames**. The main
100-tick wall duration must not be divided into final post-profile file size.
Before/after frame JSON byte totals and final closed file sizes are identical in
all four original workloads. Default 40-unit retained frame JSON averages
208,707.12 bytes per new committed frame; Sydney 40-unit averages 195,084.28.
These are retained frame JSON costs, not physical write volume.

WAL length is allocated file space, not cumulative writes. Page allocation,
freelist, retained JSON and normal-close size need separate attribution. Neither
the original combined D7 footprint nor this short probe establishes a leak or
indefinite stability. No storage-efficiency gain can be claimed for this change.

The original durable-tick timing samples include an adverse Sydney 40-unit median
change of 73.27 to 91.58 ms (+25.0%). That observation must remain visible even if
later reverse-order probes differ. A cProfile run is a separate instrumented
workload and cannot replace an adverse uninstrumented result.

I identified a low-severity small-sample percentile error: the initial helper used
`floor(n * .95) - 1`, understating nearest-rank p95. The author changed it to
`ceil(n * .95) - 1`; all original raw samples remain available and the primary
median goals are unaffected. Original derived percentile fields must be treated
accordingly.

The initial sandbox-launched headed browsers were not visible native desktop
windows. Those results must be labelled isolated-desktop diagnostics. My own
foreground run uses the explicitly authorized unsandboxed launcher and native
window observation, with no screenshot/inspection work during its trace window.

## Execution evidence and findings

My two executions used fresh headed Edge 153.0.4234.48 contexts and distinct
task-owned databases, ports 5441/8241, grid fallback, a 1440×900 CSS viewport and
DPR approximately 1. The supplied machine inventory identifies i7-10700K,
RTX 3060 and a physical 2560×1440/144 Hz display. The viewport and narrow layout
sizes are emulated dimensions, not physical display-resolution certifications.
No other test, build or benchmark ran during my measurement slot.

The unsandboxed launch was independently visible to `sky.list_windows`: first
task Edge window 7539260, final window 8982526, both with my unique task title.
Browser visibility and focus were true. Native screenshot/activation API capture
was unavailable because of the separate app-approval timeout reported by the
author. I did not wait on or bypass that approval. Actual Playwright page captures,
native enumeration and focused/visible state jointly support foreground operation;
I do not claim a native full-desktop capture.

The first attempt measured validation successfully, then failed because my runner
did not reopen Orchestrator after reload. Its screenshot shows the recovered
authoring map with the pane closed, and the exact saved pending request survived.
I corrected only this navigation step, retained the failure and used a fresh
database/context for the final complete attempt. No production change, assertion
relaxation, timeout increase or blanket retry was involved.

The final foreground attempt **passed**:

- Keyboard-triggered Validate and exact r1 reference/hash ownership on the
  supported Sydney 40-unit/80-action fixture, with original profiles and geometry.
- Dirty Validate refusal; a real committed Save response deliberately lost;
  reload preserves the exact pending body/identity; explicit retry produces r2
  once; authoritative r2 validation and Run retain its frozen content hash.
- Reachable Run/review controls at 760, 820 and 900 px, with retained screenshots.
- All 40 tracks have positive speed and all 40 authoritative positions change;
  the actual populated Tactical/Orchestrator UI was captured and inspected.
- Pause freezes positions. A real committed Stop response is lost; reload and
  explicit retry preserve the exact body/identity and produce one Stop event.
  Resume and End succeed; reload opens the ended recording with visible read-only
  movement, behavior and script-control guidance.

No page error, external request attempt or provider request occurred. The final
run is `frontend/test-results/performance-closure/critic-native-ui-final/`; the
failed attempt remains in `critic-native-ui/`. The reusable evidence runner and
my independent inventory are in `critic/`. These paths are to be preserved inside
the external archive using their checkout-relative locations.

### Personally measured results

Cold-context Sydney validation took **2,289.2 ms to review DOM** and **2,302.3 ms
to two subsequent RAF opportunities**. Two repeated samples were **2,167.6 /
2,191.6 ms** to DOM and **2,247.0 / 2,263.7 ms** to the paint-opportunity proxy.
After the exact r2 Save retry, the proxy was **2,274.5 ms**. The first, otherwise
incomplete attempt also retained three valid r1 proxy samples of 2,237.5 /
2,249.0 / 2,259.4 ms. These are independent current-source reproductions, not my
own matched before/after pair. The author's matched baseline/current runs provide
the improvement comparison. RAF opportunities do not prove physical scan-out.

My 12-second **Sydney 40-unit Tactical grid plus Orchestrator** trace contains
1,449 `Display::FrameDisplayed` events: **120.60 FPS**, median/p95/p99 intervals
**6.948 / 13.922 / 20.854 ms**, maximum **34.751 ms**, 35 intervals over 16.9 ms,
zero stalls over 50 ms and an estimated 295 missed 144 Hz slots. Source
publication age was median/p95/p99 **66 / 105 / 131 ms**. This window meets the
pass's declared short-window thresholds; it does not certify every pane/provider,
continuous 60 Hz pacing or ten-minute stability. The missed-slot calculation is
an interval estimate, not a GPU-driver dropped-frame counter. No CPU profile or
native screenshot capture overlapped this window.

Action-to-receipt measurements including menu interaction were Pause **317.8 ms**,
Resume **5,220.5 ms**, End **459.7 ms**, one sample each. The large Resume sample
is retained. Without request-start/server/DOM decomposition, I cannot attribute
it to server execution, browser automation, reconnect handling or the two edits.

### Severity-ranked findings

**Critical: none established in the changed source or exercised paths.**

**High: none established in the changed source or exercised paths.**

**Medium M1 — Validation can still stall a running source.**
[api/scenarios.py:22](../../backend/app/api/scenarios.py#L22) calls the synchronous
review on the async server event loop; [scenarios/service.py:48](../../backend/app/scenarios/service.py#L48)
runs the nominal plan before reporting `ACTIVE_RUN_EXISTS`. The source loop at
[main.py:43](../../backend/app/main.py#L43) shares that event loop. Reproduction:
run the supported Sydney 40-unit fixture, then POST its exact saved reference to
`/api/scenarios/validate`. My separate post-trace diagnostic took **2,244.6 ms** to
return the correct refusal and produced a **2,162.9 ms** non-heartbeat message
gap. This is a pre-existing remaining limit, reduced in duration by the selected
optimization, not an introduced regression. It prevents a broad claim that
validation no longer disrupts real-time publication. Correcting it must preserve
the complete review and exact revision, while preventing pure nominal computation
from monopolizing the source loop; add an explicit publication-gap regression
before closing this gate. Do not bypass checks by returning a partial review.

**Medium M2 — Command-latency acceptance remains unsupported.** The single
5.22-second Resume observation in `critic-native-ui-final/result.json` is material
to an interactive application. It is not evidence that the two changed functions
caused a regression. Reproduce with separate input-to-request, request-to-receipt
and receipt-to-visible-state timings before making a command responsiveness claim.
The retained reproduction calls Resume at `critic/reproduce.mjs:178`; its broad
UI-to-receipt timer is at lines 87–90. No defect line in the two-file optimization
is established by that observation.

**Low L1 — Small-sample p95 estimator: corrected.**
[scripts/performance_closure.py:46](../../scripts/performance_closure.py#L46)
now uses nearest rank. The originally reported p95 fields remain historical raw
derived values; medians and original sample vectors remain valid.

**Low L2 — Initial foreground classification: corrected in the evidence scope.**
The initial sandbox-headed samples cannot establish visible native performance.
The author retained that limitation and repeated foreground validation; my native
enumeration and complete UI run provide independent visible-desktop evidence.

Storage efficiency and configured Video pacing are acceptance gaps, not newly
invented source defects: retained recording bytes are unchanged, and I made no
configured-provider request or new ten-minute soak. Short initial schedule-state
storage rates must not be extrapolated to later completed-action recording sizes.

## Focused checks, scores and acceptance

**148 focused backend tests passed, exit 0.** The independently invoked modules
were `test_scheduler_performance`, `test_d3a`, `test_conductor`, `test_boundaries`,
`test_scenario_review`, `test_scenario_location`, `test_authority` and
`test_interactive`. The retained progress log contains 148 passing test markers;
the repository's quiet settings suppress the usual final count line. No skip or
retry was added. Two dependency deprecation warnings concern Starlette/httpx and
AnyIO aliases, not test failures. This covers the new exact-content/refusal
regressions and adjacent schedule, boundary, revision, location, authority,
transaction and recovery behavior; it is not a replacement for the full gate.

I additionally inspected the author's late **test-only** correction in
`test_integrated_probe.py`: both subprocess calls explicitly use the backend
directory as `cwd`. The original root-directory full invocation had five import
failures before reaching the intended ownership checks. The correction leaves
the six tests' assertions, fault guards and 20-second timeouts unchanged; it
makes the subprocess module path independent of the invoking directory. I
independently invoked this module **from the repository root: 6/6 passed**, exit
0. Thus my focused total is **154 passed** across these two invocations. The
author's initial 399-pass/5-fail full result remains failed historical evidence;
only its complete corrected rerun can establish that gate.

At the end of my checks, **all 193 production hashes still match the source I
reviewed**. Both task browser contexts were closed. Both isolated runtimes report
services stopped and successful database deletion after writer shutdown. Their
ports 5441/8241 were released. I also removed the ten files in my explicitly
bounded pytest temporary directory after the tests exited, retaining the test
log, source inventory, screenshots, trace, failure and cleanup receipts. I did
not open, migrate or write an operator database, touch operator browser storage,
or access provider credentials. The author owns final hash-verified archival.

| Category | Score / 10 | Evidence and limit |
| --- | ---: | --- |
| Persistence/backend correctness | 9.3 | Narrow candidate-copy optimization, exact-content regressions and 154 focused tests pass; durability and authoritative ownership are unchanged. |
| Frontend correctness | 9.2 | Unchanged frontend source; independent actual keyboard validation, saved revision, pending retry, populated moving UI, narrow layouts and recorded inspection pass. |
| Compatibility/recovery | 9.2 | Existing readers and request identities unchanged; actual Save/Stop loss-and-retry/End persistence pass, with adjacent restart/transaction regression coverage. |
| Performance/resource efficiency | 7.6 | Large measured validation improvement is credible and my grid window passes; storage does not improve, active validation still stalls publication, command tail evidence is inadequate, configured Video and long-duration stability remain open. |
| Maintainability | 9.3 | Two small production changes with explicit mutability assumptions and useful regressions; no cache/format/renderer rewrite. |
| **Overall** | **8.8** | Useful verified partial closure; the requested 9/10 target is not established for this performance-closure scope. |

**Recommendation:** accept the small optimization within its affected functional
scope **after** the author's required final regression gates pass. My own focused
functional and named recovery checks pass. At this report's close, the full
browser suite and the author's combined final gate are still running, so overall
functional/recovery delivery acceptance is conditional on their actual result.

**Validation responsiveness:** the supplied matched samples and my independent
current-source reproduction support the latency improvement; the source-stall
limitation remains. **Storage efficiency:** withhold; retained bytes are identical,
and the original adverse durable-tick sample is unresolved evidence.
**Display performance:** my one short Tactical grid window passes the declared
thresholds, but withhold broader acceptance because configured Video, all pane
combinations and a new sustained soak are not independently established.
**Overall performance closure:** withhold; deliver as **partial performance
closure**. A later complete regression pass cannot remove the measured source
stall, unanswered Resume tail or missing provider/long-duration evidence.

Personally verified results above are distinct from supplied author measurements,
historical D7 results and source-based reasoning. I did not independently rerun
both ten-minute soaks, configured Video, every recovery failure matrix row or the
full browser suite. No further production change is warranted without enough time
for its required new independent review.
