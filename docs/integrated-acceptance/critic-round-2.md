# Independent D7 critic — round 2

20 September 2026. This is a fresh reviewer, independent of the production implementation and the first critic. Scope: D7's corrected source, verification changes and affected ownership/compatibility paths. It is not an audit certificate for every Sentinel path.

**Final recommendation: accept the scoped functional and recovery baseline; withhold performance and unqualified overall acceptance.** The corrected source passed my foreground UI/focused checks and the required complete 117-case browser gate. Configured Video pacing remains unverified in this D7 pass, and existing performance limits remain. Overall review score: **9.0/10**, subject to those explicit acceptance limits.

## Source and evidence provenance

I compared the preserved pre-D7 source snapshot with the current checkout. Of 193 production files, only `frontend/src/world/directMovement.ts` and `frontend/src/world/scriptControl.ts` changed: both now explain terminal recorded inspection before suggesting lease acquisition. Baseline backend tests and contracts/specifications were unchanged; no baseline file was removed. My source/test inventory is retained as `frontend/test-results/integrated-acceptance/d7-critic-round2-audit/source-sha256.json`, alongside its reproduction script. Its close-of-review SHA-256 is `e2e4fbf56fcbfe05ae34fd64e93000b5b04d0a1326d438aa8b3bf492f08c9561`; this includes the final shared validator's revision-specific heading. The earlier inventory at personal UI verification is separately retained as `source-sha256-at-ui.json`, SHA-256 `bb099cb2ec8acc45501d3498dbbaebff42a1cf74f72001509d3209ab75dc03a1`. No production file changed between those inventories.

I independently inspected the v2 browser changes, historical v1 tests, command service, proximity allocator, Suggestions client/service, pending-request persistence, scenario save/revision ownership, stream generation/sequence fences, transaction/publication order, pane visibility/memoization and renderer leasing. I read the new opt-in fault server and its isolation tests, camera assertion helper and measurement/soak runners. This review did not rely on the prior critic's score.

### Personally verified

- **105 frontend tests across eight files passed:** D4, runtime, interactive client, recommendations, renderer pool, map services, Orchestrator state and selection. This includes both new ended-state cases with `ownsControl` true/false.
- **127 backend tests passed:** dedicated historical D4/v1, current D4 refinement/v2, recommendations, interactive lifecycle/recovery and all six fault-probe isolation tests. Two dependency deprecation warnings remain.
- Operated foreground Edge 153.0.4234.48 at 1440×900 CSS pixels, DPR 1, in a fresh context on owned ports 5421/8221. The runtime used the normal `app.main:app`, not the test fault-server entry point. The existing Sydney 20v20 fixture was seeded through the scenario API; the subsequent authoring, Save/Validate/Run, controls and recovery steps used the actual UI.
- Rejected a nonempty origin change from Sydney to Singapore; Cancel retained the complete draft. Selected Friendly 01 and 03, filtered them out, verified the full hidden selection count, attempted bulk deletion and received a specific four-action dependency refusal. Draft content remained exact.
- Exercised keyboard internal-tab navigation and widths 760, 820 and 900. The shared Save control stayed in the viewport and the document did not overflow horizontally. I inspected my own narrow-layout capture.
- Deliberately lost the committed Save response. Add action stayed disabled while uncertain; switching tabs and reloading retained the exact pending bytes. Explicit retry transmitted the same request ID/body hash twice and recovered saved revision 2. Validation's reference and the resulting run matched that exact revision/hash.
- Observed all 20 Friendly and 20 Hostile source positions change, and all 40 renderer IDs. Frozen Sydney geometry and every supplied altitude object matched the authored scenario. This proves a moving workload through the application, not 40 static icons or a display-FPS claim.
- Exercised ordinary 3D and Video Feed together, closed Video, switched back to Tactical, and repeatedly reopened Orchestrator. The pool held two renderers, then one active/one hidden; no active closed cockpit remained. Tactical camera values stayed exact across three reopen/tab cycles.
- Paused through an accepted receipt; deliberately lost a committed Stop response; reloaded and retried the same ID/body hash; verified one persisted Stop event. Restarted only the owned backend after its listener stopped, observed a changed executor epoch and paused state, then explicitly took control and ended the run.
- Reloaded and opened Previous demos. The recording displayed all 40 IDs at the exact committed End sequence, retained Sydney coordinates/terminal tracks/geometry, and disabled Move, behavior Apply, Stop and Return to script with **“Demo ended. Recorded inspection is read-only.”** The misleading acquire/reclaim advice was absent. I inspected my own populated ended-state screenshot.
- The foreground runner passed on its first execution, with zero page errors. My browser contexts closed; services stopped and the disposable database was deleted. Independent stat comparison found all **437** baseline database artifacts still present with unchanged size and nanosecond modification time; I did not open their contents or write to them.

My frontend/backend checks and foreground exercise overlapped the implementation author's headless final regression. They are functional evidence, not uncontended performance measurements.

### Supplied evidence inspected, not personally re-executed

I inspected the author's 403-case frontend and 397-case backend logs, the broader recovery matrix and fault runner, the ten-minute soak result and measurement source/results. I did not personally repeat every rollback injection, the complete ten-minute soak, every lease interleaving, every old layout, browser zoom or the configured-provider window. The first critic's independent compositor trace is another reviewer's evidence, not my own reproduction.

I independently read the complete final `browser-full-3.txt` and its Playwright result JSON: **117 passed**, zero skipped, unexpected or flaky tests, zero retries and no run errors; duration **879,058 ms (14.7 minutes)**. This is one complete headless functional run, separate from my foreground exercise and from display-performance evidence. The earlier two complete runs each finished 116/117 with a derived-pitch-only camera equality failure; they remain failed historical evidence and were not merged into this result. Final TypeScript, lint, formatting, current/foundation contract and 43 frozen specification guard logs also show passing results.

## Findings and disposition

### Critical / High / Medium

No new actionable production defect was established in the reviewed source or my exercised paths. Remaining acceptance gates are stated separately below; absence of a finding is not proof of absence of all races.

### Low — duplicated measurement setup retained an obsolete readiness handshake

- **References:** [measure.mjs:517](C:/Archive/Coding/Sentinel3/frontend/tests/performance/measure.mjs:517), [support.mjs:38](C:/Archive/Coding/Sentinel3/frontend/tests/performance/support.mjs:38), [scenarios.py:12](C:/Archive/Coding/Sentinel3/backend/app/api/scenarios.py:12).
- **Reproduction/evidence:** configured attempts `perf-d7-configured-final` and `perf-d7-configured-final-2` failed the immediate panel-text assertion before any external provider request. I traced the actual caller and found `measure.mjs` still had an inline click/Ready assertion: changing `loadPerformanceScenario` had not changed that path. I also caught an intermediate helper mistake reading revision fields directly from a `ScenarioReceipt`, instead of `receipt.result`.
- **Impact:** false setup failures prevented a valid configured measurement. These were visible verification failures, not false passes or evidence of a production validation defect.
- **Recommended correction:** share one handshake that waits for the complete response body, verifies `canRun` and the exact saved reference, then requires the visible review; use the API's actual receipt shape.
- **Resolved by the implementation author:** both callers now use `validateSavedScenario`, and the saved revision is extracted from the accepted receipt. The five-second assertion budget was retained; no blanket retry or sleep was added. I inspected the corrected call chain. The subsequent configured run passed its exact-reference check: body received at 5,460.5 ms and visible review at 5,506.8 ms after validation input. Failed attempts remain evidence. The later provider-budget interruption is a different limitation.

### Prior low finding — terminal control advice

Resolved and personally verified on the corrected source. [directMovement.ts:15](C:/Archive/Coding/Sentinel3/frontend/src/world/directMovement.ts:15) and [scriptControl.ts:12](C:/Archive/Coding/Sentinel3/frontend/src/world/scriptControl.ts:12) now deny an ended frame with accurate read-only guidance before ownership advice. The new tests exercise both nominal ownership states; actual reopened-recording UI verifies disabled controls and text. Backend authority, lease admission and running/paused simulation rules were not changed.

### Prior low finding — floating-point camera oracle

The shared [cameraAssertions.ts:5](C:/Archive/Coding/Sentinel3/frontend/tests/browser/cameraAssertions.ts:5) preserves exact Tactical cameras and exact non-pitch 3D fields. Only a finite derived 3D pitch permits 64 machine-epsilon units scaled to magnitude. Missing values remain checked. I inspected its boundary, D3A and RTS callers and the pinned Cesium pitch readback path. This is a numerical oracle correction, not permission for meaningful camera drift. The complete final browser gate passed all these callers without retries.

## Compatibility, authority and coverage assessment

The two Intercept updates are justified. New-run tests assert `local-fleet-v2` and the existing 700 m model, exact ordinary movement receipt fields, command identity/order, member outcomes and unavailable codes, empty legacy scope/behavior fields, actual unassigned movement, assignment uniqueness, Stop and persistent NON-OP outcomes. The farther target is authored outside 700 m and later acquired by existing movement; the assertion allowance follows published distance/speed. Production acquisition rules and profiles remain untouched.

Dedicated `backend/tests/test_d4.py` still installs `local-fleet-v1` and the 250 m model, including reserve expectations. I ran it, inspected adjacent current tests and confirmed no baseline backend test/hash contract changed. No test was skipped, quarantined or replaced with a generic success assertion.

The command service resolves an exact duplicate before new admission and commits frame/checkpoint/events/receipt before publication. Suggestions retain the exact reviewed option and membership, compare the current fingerprint and reject stale proposals rather than choosing another target. Frontend generation checks fence late mission callbacks; uncertain requests are persisted before transmission. These conclusions combine source inspection, focused tests and my own lost-response/restart flow. They do not establish every possible interleaving.

The probe is opt-in and test-only, with directory/name/suffix guards before storage is opened. Its disarmed or mismatched receipt paths delegate normally; a matching armed fault fires once. The normal app exposes no probe routes. Existing source-clock, writer, transaction and admission owners remain intact.

No meaningful cleanup deletion occurred in D7. The exact pre-D7 snapshot comparison found no missing baseline file. Earlier Orchestrator and scenario-location work was retained, not misattributed as new D7 implementation.

## Performance and resource acceptance

**Performance acceptance is withheld.** I made no new FPS measurement during the concurrent functional runs. The supplied uncontended grid windows have high averages but uneven tails, and the prior critic's 108.19 FPS remote-grid trace included a 62.485 ms stall. None proves uniformly paced sustained 60 FPS everywhere.

The final configured result contains two valid windows: Tactical **94.53 FPS**, median/p95/p99 **6.984/20.827/27.773 ms**; ordinary 3D **138.43 FPS**, **6.944/7.044/20.833 ms**. Its standard imagery, terrain and buildings reported ready. These are short foreground compositor windows at the stated machine/viewport, not physical 4K or universal performance certification.

Google Video passed the visible-provider readiness predicate, but continued streaming interrupted the measurement before a complete 12-second sample. The guard observed request 4,001 against a 4,000-request budget and closed the browser. The raw network phases include requests during `20v20-3d-video`; describing this as “no content loaded” would be inaccurate. **No valid configured Video pacing result exists for D7.** The earlier Video limitation remains unresolved, and further unbounded provider traffic is not justified.

The supplied 611.353-second soak is useful bounded evidence: all 40 positions changed at 20 checkpoints, one WebSocket and two renderers remained, collected heap rose 7.83 MB, and recording footprint rose 757.65 MB. The latter is a substantial storage cost. Stable DOM/listener/socket counts are not indefinite leak freedom or a direct census of React subscriptions. Raw transport length counts characters, not exact wire bytes. The evidence/documentation distinguish these limits.

## Evidence and cleanup

Own retained evidence, relative to the hash-verified D7 archive:

- `frontend/test-results/integrated-acceptance/d7-critic-round2-ui/`: result, preflight, cleanup, reproducible runner and nine screenshots, particularly `03-width-760.png`, `04-forty-moving.png`, `05-three-d-video.png` and `07-recorded-read-only.png`.
- `frontend/test-results/integrated-acceptance/d7-critic-round2-audit/`: independent 105/127 test logs, source/test hash inventory, database-stat preservation check and audit script.

Owned ports 5421/8221 were released; the database was deleted only after the writer stopped. No operator database/browser profile or credential was changed. The implementation author will hash-verify/archive these raw artifacts and remove the two disposable ignored reviewer scripts.

## Final gate and scores

| Category | Score / 10 | Basis |
| --- | ---: | --- |
| Frontend/UI correctness | 9.4 | Corrected recorded-state guidance verified on the real populated UI; authoring, hidden selection, narrow layouts, exact pending identities and pane/camera ownership passed. |
| Backend/simulation correctness | 9.3 | No simulation-rule change; substantive current/legacy coverage and independent 127-case checks passed, with transaction and authority paths inspected. |
| Compatibility/recovery | 9.4 | Exact Save/Stop retry, frozen geometry, restart/reclaim/End and rendered recorded inspection personally verified; broader named fault boundaries have regression evidence. |
| Performance/resource management | 8.0 | Useful bounded resource and compositor evidence, but uneven tails, substantial retained recording growth and incomplete configured Video measurement prevent performance acceptance. |
| Maintainability | 9.0 | Small attributable production fix; version-correct tests, centralized bounded camera/readiness checks, isolated opt-in fault tooling and preserved failure evidence. |
| **Overall** | **9.0** | The corrected functional/recovery baseline is supported by a complete green gate and independent UI checks. This score does not certify the unresolved performance gate or the whole codebase. |

**Functional: accept within D7's tested scope.** The final 403 frontend, 397 backend and complete 117 browser results, static/contract/frozen guards and my independent foreground evidence support this recommendation. The earlier uncommitted scenario-location/Orchestrator work was retained. No unresolved material defect was established in the reviewed change and affected paths.

**Recovery: accept the named matrix, with its stated evidence boundaries.** My own exact retries, backend restart and rendered recorded inspection passed. The broader rollback, lease, lost-Run and late-callback cases are partly supplied test evidence; this is not proof of every concurrent interleaving or indefinite operation.

**Performance and unqualified overall acceptance: withhold.** Configured Video lacks a complete pacing window, prior configured-Video limitations remain, some measured tails exceed a 60 Hz frame interval, and physical 4K performance was not established. The 757.65 MB recording increase also bounds the practicality of long 40-unit sessions. These limitations must accompany delivery; a 9.0 score cannot remove them. No extra unbounded provider traffic or unrelated performance rewrite is recommended as part of this completed scoped review.
