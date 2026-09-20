# Independent D7 critic — round 1

20 September 2026. Reviewer: a separate critic agent, not an implementation author. This report concerns D7 and its affected ownership/compatibility paths, not a claim that Sentinel is defect-free.

**Round-1 recommendation: hold overall acceptance.** The independently exercised functional/recovery paths passed, but the complete final regression gate and configured-provider evidence were not complete at review close. The implementation author will correct the verified ended-state explanation and obtain a fresh critic for the corrected source. This report does not certify that later source.

## Scope and provenance

I compared the current tree against the exact pre-D7 snapshot, rather than attributing earlier uncommitted Orchestrator work to D7. My independent hash comparison found all 193 production files in `backend/app` and `frontend/src` byte-identical to that snapshot at the time of source review. The reviewed inventory is `.cache/integrated-acceptance/critic-source-sha256.json`, SHA-256 `acbc72b62a045d41a89ec6ae69c458ef320853244e9da59b3d4e41a54eb02090`. It identifies the state before the subsequent ended-message correction. D7 changes inspected were test oracles, isolated verification helpers, the opt-in fault server and documentation. No production behavior rewrite or meaningful cleanup deletion was present.

I inspected the corrected browser cases and adjacent runtime, direct movement, behavior allocation, Suggestions, scenario/draft, renderer/camera, persistence and recovery paths. Particular attention went to `commands/service.py`, `rts_behavior.py`, the versioned behavior readers, `sqlite_repository.py`, `interactiveClient.ts`, `recommendationClient.ts`, `scenarioClient.ts`, `runtime.ts`, the shared presentation owner, pane visibility and renderer pooling.

### Personally verified

- Read final D7 test changes against the preserved baseline; independently traced current v2 ordinary movement versus historical v1 approach/reserve behavior.
- Ran 84 frontend tests in five files: runtime, interactive client, recommendations, renderer pool and map services. All passed.
- Ran 127 backend tests: historical D4, current D4 refinement, recommendations, interactive recovery and six probe-isolation cases. All passed, with two dependency deprecation warnings.
- Operated fresh foreground Edge 153.0.4234.48 contexts against independently owned ports 5417/8217 and disposable databases. Used the existing Sydney 20v20 fixture, seeded through the scenario API, then used the real UI for editing, Save, Validate, Run, selection, commands, recovery and inspection.
- Rejected a nonempty Sydney-to-Singapore origin change, cancelled it and compared the complete geographic draft unchanged. Exercised filtered selection and refusal to delete two units with four dependent actions; tab selection retention; keyboard tab navigation and widths 760, 820 and 900 px.
- Saved revision 2, validated it, ran that exact revision/hash/geometry, observed all 20 Friendly and 20 Hostile positions change, and checked all 40 renderer entity IDs. Exercised ordinary 3D and Video Feed together and returned to Tactical.
- Froze the sole source while the runtime remained connected, observed the delayed-source notice and unchanged authoritative tracks, disabled Move and available Stop, then recovered source advancement.
- Reviewed Suggestions without submitting a command; a policy change invalidated the proposal. Explicit refreshed Apply committed Stop, deliberately lost its response, preserved pending bytes across reload, retried the same ID/body hash, and produced exactly one persisted Stop event.
- Restarted only the owned backend, verified changed executor epoch, paused state and frozen Sydney geometry, explicitly took control, awaited a committed End receipt, and reopened recorded inspection.
- Independently supplemented recorded inspection with a fresh run: required the reopened renderer's mission and all 40 IDs, displayed sequence equal to the committed End sequence, Sydney coordinates, unchanged terminal tracks/geometry, and an ended-state screenshot with populated map and Details.
- Captured and inspected my own screenshots. The optional video attempt was unavailable because the installed Playwright FFmpeg executable was missing; screenshots and a frame-event trace were retained instead.

### Supplied evidence, independently inspected

The implementation author's full regression runs, ten-minute soak, foreground authoring/recovery/workspace checks, hardware inventory and configured-provider checks are separate evidence. I inspected their source, raw results and limitations; I did not personally perform every case in those programs. For the reviewed pre-correction state, supplied unit results were 401 frontend and 397 backend cases, and the frozen specification/foundation gate passed 43 checks. A later 403-case frontend result includes the subsequent terminal-message tests and belongs to the next source review. The first full browser run was 116/117; the second was still running with another reproduced pitch-only equality failure. A complete green final run had not yet been established. The network-blocked provider attempt was fallback evidence, not configured-provider performance evidence.

## Findings

### Critical / High

None established in the reviewed D7 changes or personally exercised paths.

### Medium

No production defect established. Complete regression and performance acceptance remain gates; a favorable score cannot substitute for their results.

### Low — ended recording gives impossible control-acquisition advice

- **Source:** [directMovement.ts:29](C:/Archive/Coding/Sentinel3/frontend/src/world/directMovement.ts:29), [scriptControl.ts:20](C:/Archive/Coding/Sentinel3/frontend/src/world/scriptControl.ts:20), consumed by [BehaviorControls.tsx:51](C:/Archive/Coding/Sentinel3/frontend/src/features/entities/BehaviorControls.tsx:51).
- **Reproduction:** End a Sydney 40-unit run, reload, open Previous demos, select Friendly 01 in Fleet. My populated recorded screenshot shows “Waiting for available control” and “Acquire or reclaim control first” while the header correctly says the demo ended.
- **Impact:** misleading disabled-state advice suggests an unavailable recovery action. Buttons remain disabled and the backend retains terminal-state authority; this is not a write-through or recording-corruption defect.
- **Recommended correction:** prefer an ended/read-only explanation before the ownership advice in these presentation guards, with focused terminal-state coverage. It is a nonmaterial clarity issue if explicitly deferred.
- **Status:** acknowledged. The implementation author elected to correct both terminal-state explanation guards with owns-control true/false regression coverage. The corrected production state requires the next independent review; it is not certified here.

### Low — exact Cesium pitch equality makes the regression gate unstable

- **Source:** the original camera assertions in `frontend/tests/browser/boundaries.spec.ts` (including the guarded double-click case near line 645), `d3a.spec.ts` near line 795 and `rts-gestures.spec.ts` near line 310; readback originates in `CesiumAdapter.camera()`.
- **Reproduction:** complete browser runs produced only pitch differences of roughly 2.8e-14 to 5e-14 degrees while all other camera fields matched exactly.
- **Cause verified personally:** pinned Cesium's `Camera.pitch` getter temporarily transforms world/ENU vectors even on a read. The adapter then converts that derived value to degrees. Bit equality over this getter is not a camera-ownership contract.
- **Impact:** false regression failures, obscuring whether an actual camera mutation occurred.
- **Correction reviewed:** retain exact Tactical and non-pitch fields; allow only finite 3D pitch error bounded by 64 machine-epsilon units scaled to the expected magnitude. At 35 degrees this is about 5e-13 degrees, below 0.1 nm over 6 km. Missing values still fail. No production rounding, arbitrary delay or retry is justified.
- **Status:** remaining same-cause assertions are being corrected; a complete final browser run is required.

## Version and authority assessment

The v2 test correction is justified and substantive. New runs explicitly assert `local-fleet-v2` and the existing 700 m acquisition model. Tests now check ordinary direct-movement receipts, request identity/order, exact member outcomes and unavailable-member codes, empty legacy scope fields, actual movement, unique assignments, unassigned ordinary movement, Stop and persistent NON-OP outcomes. The staged second target starts outside 700 m and later enters by existing movement; published distance/speed inform its assertion budget. This changes test geometry, not vehicle speed or simulation rules.

Dedicated backend `test_d4.py` still deliberately selects v1 and 250 m, preserving clicked-area/reserve expectations. Historical readers, contracts and hash assertions were not relaxed. I found no replacement of exact behavior with a generic success check.

The inspected command service resolves exact duplicates before new admission and commits frames, checkpoints, events and receipts transactionally before publication. Suggestions capture the reviewed option, revalidate current conditions and do not silently choose another target. Frontend pending storage retains the exact request; generation checks fence late mission work. Scenario authoring uses a separate draft and immutable saved revision/run geometry. These source conclusions are supported by the focused tests and the personally verified failed-response/restart cases, rather than by the implementation summary alone.

The fault injector remains test-only: explicit opt-in plus exact verification-directory/name/suffix guards run before opening storage; the normal app has no probe routes. The final one-shot test proves disarmed/mismatched receipt calls delegate and a matching armed fault fires once. The added Pause/Resume/End receipt synchronization waits for the actual committed operation instead of reading authoritative state immediately after a click; assertions and the real 31.5-second lease-boundary wait remain intact.

## Independent performance reproduction and resource assessment

My independent trace used foreground Edge, a 1440×900 CSS viewport at DPR 1, blank-grid Tactical, a running Sydney 20v20 scenario and no competing measurement/test job. The supplied machine inventory is i7-10700K, RTX 3060, physical 2560×1440 at 144 Hz. This is an independent diagnostic reproduction, not a matched before/after benchmark or physical 4K certification.

The 12.017-second window contained 1,300 `Display::FrameDisplayed` events: **108.19 mean presented FPS**, median **6.952 ms**, p95 **20.800 ms**, p99 **27.760 ms**, maximum **62.485 ms**, and one interval over 50 ms. The document was visible and focused. Raw evidence retains only frame event names/timestamps/process/thread IDs, without URLs or credentials.

This reproduces high average grid throughput but also uneven tails. It does **not** establish sustained even 60 FPS, configured-provider acceptance or a general 100 FPS guarantee. RAF callbacks and simulation ticks were not used as displayed-frame proof.

I independently read the supplied 611.353-second soak result: all 40 positions changed at every checkpoint; two renderers and one WebSocket remained; collected heap grew 7.83 MB; DOM nodes/listeners were unchanged; persisted recording grew 757.65 MB. Stable ownership counts are useful bounded evidence, not indefinite leak freedom. Full retained history explains the deliberate storage growth but makes longer 40-unit sessions storage-intensive. DOM listener counts are not a direct census of React subscribers, and the raw transport length field counts characters rather than exact wire bytes. The documentation now makes those distinctions.

## Failed critic attempts and limits

Every failed attempt remains in raw evidence:

1. `d7-critic-round1-ui`: stopped before application operation because the optional FFmpeg recording binary was unavailable. Subsequent runs used screenshots, not an invented recording.
2. `d7-critic-round1-ui-2`: useful UI/frame evidence, then my immediate post-click End assertion raced the actual command. Service logs show its world read before the End command completed; the screenshot shows Pending. The next attempt awaited the exact committed receipt.
3. `d7-critic-round1-ui-3`: End was committed and persisted, then my supplementary assertion expected null for an absent optional `activeMissionId`. The API intentionally excludes null fields. Corrected to require the field's absence.
4. `d7-critic-round1-ui-4`: my review began before Pause was acknowledged/applied; production correctly displayed “Situation changed while reviewing — refresh.” Corrected by awaiting the Pause receipt and its displayed sequence, without sleeps/retries/time-limit inflation.
5. `d7-critic-round1-ui-5`: the complete functional flow passed. Its immediate recorded screenshot was insufficient evidence of populated rendering, so the separate `d7-critic-recorded` supplement waited for and verified all 40 displayed IDs before capture.

No failed runner assumption was counted as a production correction or silently omitted. Configured provider performance, the complete browser gate, all transaction injection sites and the full soak are supplied evidence, not all personally repeated. I did not verify indefinite operation, physical 4K display performance or every possible concurrency interleaving.

## Evidence, cleanup and final recommendation

Reusable tests remain in source. My ignored runner source is preserved with each final raw result. Intended hash-verified archive paths follow the repository convention:

- `frontend/test-results/integrated-acceptance/d7-critic-round1-ui-1…5` (the first attempt is named `d7-critic-round1-ui`), including failed attempts and screenshots.
- `frontend/test-results/integrated-acceptance/d7-critic-recorded/recorded-sydney40-rendered.png` and its result/cleanup/runner.
- `.cache/integrated-acceptance/critic-frontend.txt`, `critic-backend.txt`, `critic-source-sha256.json` and runner logs.
- Independent frame events: `frontend/test-results/integrated-acceptance/d7-critic-round1-ui-2/critic-frame-events.json`.

All my UI contexts/browsers closed. Every critic-owned runtime reports stopped services and deleted disposable database, after End or explicit cleanup of an interrupted demo. Ports 5417/8217 were checked free. I neither opened an operator database for writing nor touched operator storage/preferences.

## Scores and acceptance at round-1 close

| Category | Score / 10 | Basis |
| --- | ---: | --- |
| Frontend/UI correctness | 9.0 | Real non-default 40-unit authoring and viewing worked; terminal control advice is misleading. |
| Backend/simulation correctness | 9.3 | Substantive v1/v2 coverage and transaction/idempotency ownership; independent focused checks passed without rule changes. |
| Compatibility/recovery | 9.2 | Exact retry identity, frozen geometry, epoch/reclaim/End and rendered recorded inspection verified; broader coverage is partly supplied evidence. |
| Performance/resource management | 7.8 | Bounded renderer/socket behavior and strong mean grid throughput, but tail stalls, substantial retained recording growth and configured-provider limitations remain. |
| Maintainability | 8.8 | Bounded test-only changes with explicit provenance; repeated same-cause camera oracle failures and lifecycle synchronization corrections show the final gate still needs consolidation. |
| **Overall** | **8.8** | Strong scoped functional/recovery evidence, but this reviewed state does not yet satisfy the complete acceptance gate or the 9/10 target. |

**Functional:** personally exercised workflows passed; final complete regression acceptance remains withheld. **Recovery:** personally exercised source-stall, retry, restart, End and recording paths passed; broader transaction and interleaving claims remain limited to the named tests. **Performance:** no blanket sustained 60 FPS or configured-provider acceptance; high short-window averages do not close the documented limitations.

Remaining acceptance blockers are the complete corrected browser gate, final evidence for the corrected production explanation and the required fresh independent review, plus honest resolution or explicit non-acceptance of configured-provider/performance gates. The low UI finding is not an authority bypass. A later score cannot erase a failed test or certify this review's untested successor state.
