# Independent Orchestrator critic — round 2

20 September 2026. Fresh independent reviewer; I did not implement this change and did not edit production or regression source. **Scoped implementation score: 9.1/10. No unresolved material source defect was found in the inspected paths. Delivery acceptance remains conditional on completing the outstanding broader regression checks described below.** A score is not permission to disregard a failed test or incomplete verification.

## Reviewed source and method

Baseline: `83364f6`. My final inventory covers 193 frontend/backend source files. The retained `orchestrator-critic2-final-check/reviewed-source-sha256.json` has SHA-256 `0bfa1503e6a073c393a204493d4b5a38f93e51f85e867a105b80d59d0a2cf745`. It includes the two small polish corrections made during this review. Later material changes require a new independent critic; this score does not certify them.

I inspected the changed navigation/module registry, workspace bridge and normalization, Orchestrator, Units, Conductor, run review, symbols, runtime selection/deletion and scenario client. Adjacent inspection included UnitEditor, OperationalContext, PaneHost, profile mappings, strict scenario readers, backend scenario writes/reviews/instantiation, run creation and pending-request ownership. I inspected the documentation and relevant new/changed tests. The backend and versioned contract production trees are unchanged. The removed code is duplicate UI context/lifecycle presentation, not a deleted persistence reader, simulation implementation or asset. Shared owners remain in use.

I wrote my own Playwright program using the existing isolated-runtime helper. Foreground Microsoft Edge 153.0.4234.48 used a fresh context, blank providers, ports 5397/8197 and a disposable database. Viewports were 760, 820, 900 and 1440 × 900 CSS pixels. The final observation reports `visibility: visible`, `document.hasFocus(): true` and approximately 1.0 device-pixel ratio. API calls seeded supported scenarios; rendered UI controls performed the editing, deletion, save/retry, validation, Run, Pause/Resume/End and docking actions. Read-only world/renderer inspection supplemented visible evidence. This is functional evidence, not FPS evidence or a user study.

## Findings and disposition

There are no unresolved Critical, High or Medium **source** findings from this review. The remaining verification gate is separate from that conclusion.

### Resolved Low O4 — Back from validation had no explicit focus target

**Source:** [OrchestratorPane.tsx:376](../../frontend/src/features/orchestrator/OrchestratorPane.tsx#L376), with tab focus implemented at [line 107](../../frontend/src/features/orchestrator/OrchestratorPane.tsx#L107).

**Reproduction before correction:** From either internal tab, focus Validate and press Enter, then focus Back and press Enter. In all eight width/tab combinations, the review closed and `document.activeElement` became BODY. The next Tab did remain local, landing on Validate; it did not jump to document-start navigation. That limits this finding to a minor keyboard-context defect rather than the earlier validation-entry failure.

**Impact/correction:** There was a moment with no visible focus indication after an intentional return to editing. Reuse the internal-tab selection/focus path when leaving review. The implementation author changed Back to `chooseTab(tab, true)`. I re-read the correction and independently reran all eight combinations on the final source: the correct Units or Conductor tab receives focus, and subsequent Tab continues into Scenario file & authoring map. **Resolved.**

### Resolved Low O5 — Switching internal tabs replaced optional imported pane configuration

**Source:** [workspaceBridge.ts:179](../../frontend/src/features/workspace/workspaceBridge.ts#L179), configuration update at line 186.

**Reproduction/source evidence before correction:** The normalizer copied the winning legacy pane's config, but `setOrchestratorTab` then assigned only `{orchestratorTab: tab}`. Supplying a legacy pane with another config field would lose that field on tab change. The author raised this concern; I independently inspected the assignment. The baseline has no automatic browser-layout persistence and its existing Units/Conductor panes did not use another config field, so I did not find evidence of lost real operator preferences.

**Impact/correction:** This was a limited compatibility defect at the new imported-layout boundary. Spread the retained node configuration when changing only the internal tab. The author made that correction. My final browser-side model test imports `extensionPreference: 'retain-me'`, changes Units to Conductor and verifies both that field and the new internal-tab value survive. **Resolved.**

Neither correction changed simulation, stored scenario content or request identity semantics. They were re-inspected and re-tested before any round-2 score was issued. I made neither correction myself.

### Verification gate V1 — Broader regression results must be closed before delivery acceptance

At report time the author's broader browser run is not yet completely passing: its latest remaining-set run stopped after five failures, with 47 passes and 44 not run. The failed cases concern a 3D group destination outside the supported area, two D4 assignment expectations, retained hidden entity details after removal, and retained hidden readout after mission unload. These must be investigated and rerun; my passing foreground cases do not override them.

Relevant reproduction references are [d4-refinement.spec.ts:83](../../frontend/tests/browser/d4-refinement.spec.ts#L83), [d4.spec.ts:140](../../frontend/tests/browser/d4.spec.ts#L140), [d4.spec.ts:356](../../frontend/tests/browser/d4.spec.ts#L356), [entities.spec.ts:631](../../frontend/tests/browser/entities.spec.ts#L631) and [mission.spec.ts:112](../../frontend/tests/browser/mission.spec.ts#L112). The author retains the exact run log as `browser-remaining-2.txt`.

My source inspection indicates the last two assertions inspect dormant hidden-pane snapshots; the baseline OperationalContext/OperationalReadout visibility policy is unchanged. Revealing those panes and asserting their refreshed state is the meaningful behaviour check. The rejected geographic destination must be corrected in test setup only if it is proven outside the supported area; do not weaken admission.

I subsequently traced the two D4 expectations against both current source and `git show 83364f6`. New runs already use `local-fleet-v2` with a default 700 m acquisition area in [behaviors.py:18](../../backend/app/commands/behaviors.py#L18). [service.py:636](../../backend/app/commands/service.py#L636) only returns the clicked `targetScope`/behavior-outcome receipt for a legacy non-v2 approach; the v2 branch returns ordinary direct-move member outcomes. [rts_behavior.py:131](../../backend/app/commands/rts_behavior.py#L131) automatically allocates eligible nearby targets to armed members. Both hostile positions in the second browser case are within approximately 700 m, so two assignments are consistent with that unchanged policy. The failing browser expectations instead assume v1's clicked 250 m scope and held reserves. The historical tests explicitly select that v1 model at [test_d4.py:37](../../backend/tests/test_d4.py#L37); they must remain intact. I independently ran those historical and refinement backend suites: all 50 cases passed. Do not change production simulation behaviour to accommodate outdated browser assumptions. If the browser cases are updated, their version and receipt/assignment expectations must be explicit and equally substantive, with the baseline mismatch documented.

**These observations explain the source mismatch but do not substitute for the remaining real-application checks.** Final acceptance requires the required checks to pass or an explicitly justified, independently verified baseline limitation to be reported honestly. Any material production correction needs a fresh third critic.

## Personally verified results

The final-source foreground program completed **11/11 cases**, with zero page errors:

- One Orchestrator entry and two internal tabs. Friendly/Hostile use existing coloured affiliation geometry. All four existing profile silhouettes render in the palette; Unknown remains available. I inspected the resulting screenshots rather than relying only on SVG element counts.
- **0 px checkbox movement** through 0→1→2→1 selections at all four widths. Both measured row positions and body scroll offsets remain unchanged. The program clicks the originally measured pointer coordinates during these transitions; it does not use an auto-scrolling checkbox helper to hide a jump. Space toggles membership without opening an editor.
- Explicit Edit selected focuses Unit label. Unapplied text survives tab changes, and editing locks correctly disable action creation and bulk deletion.
- Filtered, mixed-affiliation deletion of two out of six units communicates the hidden selection and removes the requested pair. I saved the result and compared the entire remaining scenario content with the expected payload, including unchanged units, poses, boundaries, geometry and action fields.
- A separate three-unit arrangement was deleted in exactly **three clicks**: Select all shown (3), Delete selected (3), Confirm delete 3. Loading the saved fixture was setup and is excluded from the count. No claim is made that every arbitrary subset or every authoring task becomes faster.
- For a 40-unit/80-action plan, full-selection deletion lists the 80 referencing actions, disables confirmation, and preserves all 40 units. Escape restores the deletion-trigger focus.
- Validate receives focus after the review is committed, from both internal tabs at 760/820/900/1440 px. Back then focuses the correct internal tab on the final source. Launch controls stay in the viewport and the document does not acquire horizontal overflow.
- Actual mouse dragging moves Orchestrator from the auxiliary pane into the main tabset, then back into a right-edge split. There is one editor throughout. Closing/reopening retains the shared draft. I did not count a no-op Open to Side invocation as proof of docking.
- A save committed on the backend while its response was deliberately lost. Both tabs were appropriately locked. Reload retained the pending request, and explicit retry sent the **identical request body and identity**, reconciling saved revision 2.
- Saved revision 2 was validated and launched using the UI. All **40 world-track positions changed** between ticks 1 and 7; the Tactical renderer reported all 40 IDs. Four successive screenshots record the visible moving scene. Pause followed by a separately saved draft revision 3 left the paused run's revision 2 binding and tick unchanged. Return, Resume, End and ended schedule inspection worked.
- While Orchestrator was hidden behind Details, its displayed schedule text remained unchanged for the 1.4-second observation and caught up when revealed. Three close/reopen cycles retained one active Tactical renderer lease and created no additional WebSockets. This bounded check is not proof that every hidden workload or resource leak is impossible.
- The actual legacy-layout harness normalized both old pane IDs into one Orchestrator in the selected active location, retained adjacent Tactical/Command/Details data and reopened on Conductor. A closed border stayed closed: Details was hidden and `selectedInPane` was false. FlexLayout omits its default `selected: -1` from serialized output; I checked the default-normalized value as well as the real hidden state.
- Imported custom pane configuration is retained after internal-tab switching on the final source.

I independently ran `npx vitest run tests/unit/orchestrator.test.ts tests/unit/orchestrator-selection.test.tsx`: **10/10 passed**. These cover aliases/layout normalization, atomic deletion/dependency refusal, stale and edit locks, pending-save restoration, selection/action eligibility, editor intent and draft-bound deletion review. I also ran backend `test_scenarios.py`, `test_scenario_review.py` and `test_capacity.py`: **25/25 passed**, then `test_d4.py` and `test_d4_refinement.py`: **50/50 passed**. These use their existing in-memory/temp stores and include revision/idempotency, frozen runs, advisory review, capacity, legacy/current assignment semantics, atomic outcomes and interruption/recovery. Two existing dependency deprecation warnings were emitted; there were no failures.

## Supplied evidence, methodology and limits

The author reports 401 frontend tests and 391 backend tests passing, plus typecheck/lint, contract/build checks and separate foreground origin, restart/reconnection, Tactical/3D/Video and actual 80/100/125% browser-zoom checks. The supplied workspace check covers eight reopen cycles and keyboard resizing. Those are supplied results, not tests I claim to have personally operated in their entirety. I reviewed the associated evidence/programs and the affected ownership paths. The broader browser gate above remains open at report time.

I did not independently exhaustively replay every old recording/contract variant, every outcome or Intercept assignment, all provider configurations, all possible legacy layout shapes, or a long resource soak. I did not independently operate Video Feed or actual browser zoom in this round. My source inspection and the author's focused checks support those unchanged paths; they are not an exhaustive certification. Backend/contract production changes are absent, but unchanged code alone is not proof that integration cannot regress.

The author's baseline count used six clicks to delete three units; five were sufficient if the already-selected first unit was not selected again. My measured three-click path is valid for deleting all three visible, unscripted units. Switching Units to Conductor remains one click. No add-and-rename click reduction is established. These are scripted interaction counts, not measured human comprehension or user-study timing.

The final 40-unit/80-action validation took **3,587 ms** from click to visible review while other regression work was running. An earlier attempt hit a five-second focus-helper timeout because the review had not appeared yet; the screenshot immediately afterwards showed it. I corrected the observer to wait for the review response/commit before asserting focus, and the committed review received focus. There is no controlled before/after latency comparison here and no claim that this UI pass improves backend validation speed. The existing simulation timing, interpolation and renderer quality were not changed to obtain these results.

Several preliminary runs stopped on errors in my review program: assuming existing auxiliary Open to Side forces a re-dock, reading positions from entities rather than tracks, using the wrong Pause menu label, and treating omitted default border selection as a failed migration. Their partial observations and cleanup logs are retained, but the final completed program supersedes their incomplete cases. The two source polish fixes were already present during the final completed run.

## Scores and recommendation

| Area | Score | Evidence and limit |
| --- | ---: | --- |
| Workflow/usability | 9.0/10 | Shared context and lifecycle, clear internal tabs, stable checkbox selection and scoped deletion remove demonstrated friction. Long arrangements/dependency lists still require scrolling. |
| Visual consistency | 9.0/10 | Existing Sentinel typography, symbols, colours and silhouette assets; compact aligned rectangular controls. No rebranding or surrounding-view redesign. |
| Frontend correctness | 9.2/10 | Direct final-source focus, selection, atomicity, retry and docking checks pass; earlier material findings are corrected. Broad regression closure is still required. |
| Compatibility/reliability | 9.2/10 | Exact request/revision and frozen-run ownership verified, legacy layout and metadata preserved, focused backend checks pass. Historical compatibility is not exhaustively retested by me. |
| Maintainability | 9.0/10 | Existing state owners and assets reused; bounded extracted deletion/layout helpers with meaningful tests; duplicate controls consolidated. |
| **Overall** | **9.1/10** | **Accept the scoped implementation once the remaining verification gate clears. Do not mark the overall delivery accepted while required checks remain failing or unrun.** |

No unresolved material implementation defect was found within this reviewed scope. This is not a claim that the application is bug-free. The final source inventory governs the score. Material later fixes require fresh independent review rather than inheriting it.

## Evidence and cleanup

Raw files are under ignored `frontend/test-results/orchestrator-ui/`, pending the implementation task's hash-verified external archive and final evidence index:

- `orchestrator-critic2-final-check/critic-ui-report.json`, reviewed source inventory, preflight/cleanup reports and final screenshots (`selection-*.png`, `review-*.png`, `profile-*.png`, `filtered-delete-review.png`, `three-click-deletion.png`, `forty-dependency-refusal.png`, `dragged-into-main-tabset.png`, `redocked.png`, `moving-*.png`, `ended-inspection.png`, `legacy-layout.png`).
- `orchestrator-critic2.mjs` is my independent runner; `orchestrator-critic2-final-check-run.txt`, `orchestrator-critic2-final-unit.txt`, `orchestrator-critic2-backend.txt` and `orchestrator-critic2-d4-compat.txt` retain check outputs.
- Earlier `orchestrator-critic2-*` attempts and the before-polish source inventory preserve the adverse observations and script-error history rather than deleting failed evidence.

All my browser contexts and browsers are closed. Every owned runtime reports `servicesStopped: true`, `cleanupOk: true` and deletion of its disposable database. The final run explicitly ended its demo; failed attempts were finalized by the existing owned-database cleanup helper after their sole writer stopped. No operator database, browser storage, credential or preference was changed. No lingering task service uses ports 5397/8197. Retained raw evidence is intentional pending archival, not a claimed disposable-output cleanup.

## Final verification-gate addendum — 20 September 2026, 02:48 SGT

This addendum preserves the preceding chronology. I personally inspected the final setup diffs, the four raw Playwright JSON reports and the final batch's text output. I did **not** execute that broader batch myself. Its supplied execution result is **52/52 passed**. I independently recomputed the latest executed result for each file/title/project across `browser-final-1.json`, `browser-retry-path.json`, `browser-remaining-2.json` and `browser-remaining-final.json`, excluding skipped/interrupted placeholders. The result is **115 passed and 2 failed across 117 distinct cases**, exactly matching the author's aggregate. This is an aggregate of bounded runs, **not one passing full-suite run**. My recomputation, source-report hashes and exact remaining errors are retained in `orchestrator-critic2-final-gate.json`.

The final setup changes are justified and retain their behavioural assertions: entities/mission tests explicitly reveal suspended panes before checking current removal/unload state; the 3D movement test frames a known in-extent destination through the verification camera hook, then performs a real canvas click and retains normal picking, acceptance and movement assertions. No scenario positions, simulation rules or production admission checks are altered to make those tests pass.

The remaining failures are exactly the two `d4.spec.ts` cases discussed in V1: expected clicked `targetScope` length 1 versus actual 0, and expected one active assignment versus actual two. Their current assertions remain intact. The unchanged baseline's v1/v2 policy distinction and the independently passing historical/refinement backend tests explain this mismatch; they do not turn the browser failures into passes. A decision on updating those browser cases to explicit current-v2 expectations while retaining legacy-v1 compatibility checks remains pending. **The 9.1/10 scoped score is unchanged, and delivery acceptance remains conditional while these two required browser tests fail.**

I compared every file in the final 193-file production inventory with disk again: **zero changed, missing or added source files** within the inventoried trees. The inventory SHA-256 remains `0bfa1503e6a073c393a204493d4b5a38f93e51f85e867a105b80d59d0a2cf745`. This follow-up started no services, browser contexts or demos and did not edit production or regression tests. Ports 5397/8197 had no listeners. My review work is concluded; earlier owned-runtime cleanup remains valid, and retained evidence awaits the task's external archive.
