# Independent Orchestrator critic — round 1

20 September 2026. Reviewer: a fresh independent agent; no implementation authorship and no production/test source changes. **Recommendation: do not accept this source state yet.** Two reproducible Medium defects affect the new selection and keyboard workflows. No Critical or High defect was found in the inspected paths. This is a scoped review, not a certification of the entire application.

## Reviewed state and method

The baseline is commit `83364f6`; review covers the working implementation captured in `reviewed-source-sha256.json` (193 frontend/backend source files). Manifest SHA-256: `893dbcf8baf4ad37468d219c0dbd4f22cc36e6e5e2e336be5246f3835a12c00c`. The inventory is retained with the critic evidence below. Later corrections require a fresh critic and do not inherit this review.

I inspected the changed registry/module/runtime/client/Units/Conductor/Orchestrator/workspace source, layout normalization, styles and glyph reuse, adjacent UnitEditor, OperationalContext/PaneHost, strict scenario readers, and backend scenario write/review/instantiation ownership. I reviewed the new unit coverage and meaningful browser-selector changes. Backend and versioned contract trees were unchanged at review time. Removed UI blocks are the former duplicate headers/lifecycle/review controls; the shared draft/run owners remain in use. No historical contract, asset, compatibility reader or backend implementation was deleted by this change.

I wrote and executed my own foreground Edge 153.0.4234.48 scripts against an isolated database and fresh browser context, using task-only ports 5395/8195, blank providers and 1440×900 plus 760/820/900×900 viewports. UI actions used rendered controls, not application-state injection. Fixtures were inserted through the supported scenario API and then loaded, validated and run from the UI. Read-only test inspection confirmed the Tactical renderer held all 40 entity IDs. Position advancement was checked against real backend world snapshots. This is movement/workflow evidence, not FPS or a user study.

## Findings

### Medium O1 — Checkbox selection unexpectedly opens a full editor and moves the list by 403 px

**Source:** [UnitsPane.tsx](../../frontend/src/features/units/UnitsPane.tsx#L78), selected-unit derivation around lines 78–84; unconditional single-selection editor around lines 545–579; checkbox handler around lines 588–599.

**Reproduction:** Load a six-unit saved arrangement at 1440×900, collapse Add units, and check the first unit's checkbox. Do not click the unit row or request an edit. The checkbox moves from y=432.71 to y=836.00 while the body scroll position remains 0. The entire single-unit form has been inserted above the arrangement rows. The selected checkbox is now below the visible body edge, behind the fixed footer area. Checking a second unit hides that form again and changes the layout in the reverse direction.

**Impact:** The new bulk-selection workflow moves its targets as the user selects them. Selecting adjacent rows requires unexpected scrolling, and a repeated click can target the inserted editor instead of the next unit. This contradicts the stated stable, efficient bulk-editing goal. The automated `.check()` helper can conceal the problem by scrolling each next checkbox into view; passing selection assertions do not establish layout stability.

**Correction:** Separate checkbox/multi-selection membership from opening a unit editor. Open editing through an explicit row/Edit selected action, or place editing in a stable area that does not move the selection list. Preserve existing unapplied-edit locks and map selection semantics. Add a foreground regression that measures row bounds through 0→1→2→1 selected units without scroll assistance, plus keyboard checkbox selection.

**Evidence:** `orchestrator-critic1-final/critic-ui-report.json` → `first-checkbox-shift`; `02-first-checkbox.png`. Reproduced in all three independent-run attempts. The report's selection case asserts selection/deletion-review correctness; its recorded geometry is the adverse result, not a layout pass.

### Medium O2 — Keyboard Validate drops focus to the document body

**Source:** [OrchestratorPane.tsx](../../frontend/src/features/orchestrator/OrchestratorPane.tsx#L111), `validate()` at lines 111–124; [ScenarioRunReview.tsx](../../frontend/src/features/conductor/ScenarioRunReview.tsx#L15), focusable review container.

**Reproduction:** Load a valid saved scenario, focus Validate saved revision and press Enter. The review appears, but it does not receive focus. I repeated this at 760, 820, 900 and 1440 px. Explicit `toBeFocused()` checks failed at every width; `document.activeElement.tagName` was `BODY`, not the review container.

**Cause/impact:** The initiating button becomes disabled during validation. The new code schedules focus with `requestAnimationFrame` immediately after requesting review state, without tying it to the committed visible review. The observed result is lost keyboard context; the next Tab starts from document-level navigation instead of continuing in the review. This is a regression from the intended keyboard validation workflow and an existing assertion cannot be dismissed as an obsolete selector.

**Correction:** Move review focus into a committed visibility/review transition effect with a stable ref. Focus only after the review is mounted and visible; avoid stealing focus on unrelated telemetry updates. Verify Enter and mouse validation, repeated validation, narrow layouts, Back/tab navigation and hidden/reopened pane behavior. Keep the existing focus assertion.

**Evidence:** `orchestrator-critic1-focus/critic-focus.json` contains four explicit failed focus results and actual `BODY` targets; `focus-760.png`, `focus-820.png`, `focus-900.png`, `focus-1440.png`. The implementation author had separately reported a failing regression; I reproduced it independently rather than accepting that report as proof.

### Low O3 — Two current-workflow strings need cleanup

**Source:** [ConductorPane.tsx](../../frontend/src/features/conductor/ConductorPane.tsx#L189) displays `0·600 seconds`; [MissionControls.tsx](../../frontend/src/features/mission/MissionControls.tsx#L197) still directs an empty catalog user to “Save an arrangement in Units”.

**Reproduction/impact:** Open Conductor to see an ambiguous range. Open an empty saved-plan menu to receive navigation using the former top-level entry name. These are small clarity defects in a change whose purpose includes consistent terminology.

**Correction:** Use an unambiguous `0–600 seconds` range and direct users to Orchestrator → Units. The author independently noticed these strings; I verified their current source and the range in my own screenshot. They are not acceptance blockers by themselves.

## Personally verified results

- One Orchestrator navigation entry, internal Units/Conductor tabs and visible existing profile silhouettes/affiliation glyphs. The restrained rectangular presentation fits the surrounding Sentinel UI without new branding.
- Cross-affiliation checkbox selection, explicit count of selections hidden by a filter, Select all shown adding only visible rows, full-impact deletion review, Escape cancellation and return focus to the deletion trigger.
- Unapplied unit editing remains blocked from scripting; edited text survives tab switches. New action uses the selected eligible actor, and its destination text survives switching away and back. Arrow-key internal tab navigation works. Cancelling an action from inside its form returns focus to Add action.
- For 40 authored units with 80 referencing actions, Delete selected(40) identifies all affected actors/actions, disables confirmation and leaves all 40 units intact. Backend/client ownership has not been replaced with a live-delete command.
- A committed save response was deliberately lost. Both tabs remained locked appropriately, and retry sent the exact same request body/identity and reconciled revision 2. No operator storage was touched.
- Exact saved revision 2 was validated and launched from the UI. All 40 latest positions changed between world snapshots (tick 3→4 in the observed run); screenshot sequence shows movement, and a separate renderer inspection lists all 40 entities. Pause, a separate authoring draft, Return to active demo, Resume and End preserved the frozen run's revision/name. Ended schedule inspection remained available.
- Narrow 760/820/900 and desktop layouts kept launch controls in view and did not widen the document beyond the viewport. The narrow layout moves Orchestrator below the map; it reduces the visible tab body to roughly 229 px at 900 px height, so substantive content still requires scrolling. This is acceptable functional density, not evidence of optimal user task time.
- Repeated close/reopen retained one Orchestrator. Open to Side did not create a second editor. The final renderer-pool snapshot had one active Tactical lease and no hidden leases. The actual legacy-layout harness retained the map/editor placements, normalized both old IDs to one Orchestrator and preserved adjacent layout data. Independent unit coverage checks selected internal-tab ownership and input immutability.
- I ran `npx vitest run tests/unit/orchestrator.test.ts`: **8/8 passed**. These cover aliases/layout normalization, cross-affiliation atomic deletion, dependency refusal, stale/edit locks, pending-save restoration and action eligibility.
- No page errors were reported by my completed foreground cases.

## Supplied evidence and limits

The author reports full backend **391** and frontend **399** passing tests and a separate UI acceptance run covering additional location/restart/3D/Video cases. Those are supplied results; I did not independently rerun those entire suites. I inspected their affected source paths and ran the focused checks above.

I did not independently exhaustively re-test Patrol/Intercept/outcomes, old recording readers, lost-command recovery, every legacy serialized layout shape, actual browser zoom, or a long resource soak. I inspected frozen snapshot/save ownership and unchanged backend/contract boundaries; that is not equivalent to exhaustive simulation re-verification. My reopen/pool check is bounded and does not prove the absence of leaks. Hidden-pane subscription suspension looks correctly delegated to `PaneVisibilityContext`, but a single final resource snapshot cannot certify all hidden-work behavior. The author is responsible for completing the remaining required checks before delivery, and the next critic should challenge them.

The author baseline's click counts are useful scripted task counts, not user-study results. Combining separate entries into internal tabs still takes one tab-switch click; no speed improvement should be claimed for that metric. Bulk deletion reduces repeated confirmation work, but O1 currently undermines arbitrary multi-selection. I did not personally run a successful bulk deletion in the foreground; the failure/impact/cancellation path was operated, and atomic successful deletion was independently exercised by the unit test. The next round should include that positive UI path after the selection fix.

Two early critic-run attempts had **critic script errors**, not product failures: an incorrect `Discard changes` selector (actual `Discard edits`) and attempting form Escape while focus was on an external tab. These left an edit active and invalidated later checks in those attempts. They are retained for transparency but are not used to reject the product. The corrected `orchestrator-critic1-final` run completed its cases. Its broad validation case only observed review visibility; the later focused run explicitly asserts and demonstrates O2.

## Scores and acceptance

| Area | Score | Reason |
| --- | ---: | --- |
| Workflow/usability | 7.5/10 | Coherent common context and useful scoped bulk operations; large selection jump and lost validation focus are substantive friction. |
| Visual consistency | 8.5/10 | Existing symbols, silhouettes, semantic colours and compact aligned controls fit Sentinel; minor copy defects and long dependency detail remain. |
| Frontend correctness | 8.0/10 | Strong shared ownership and locked exact-save paths, but two deterministic UI regressions need correction. |
| Compatibility/reliability | 9.0/10 | Preserved canonical save identity/revision and frozen-run ownership; deterministic legacy layout normalization; bounded tests are credible. |
| Maintainability | 8.5/10 | Reuses runtime and assets; extracted impact/normalization logic has tests. Focus and selection intent should be modeled more explicitly. |
| **Overall** | **8.0/10** | **Changes are promising but not ready for acceptance until O1/O2 are fixed and independently rechecked.** |

No score overrides these defects or missing required verification. Obtain a fresh independent critic after the material fixes. Verify successful filtered multi-delete, stable checkbox bounds, retained map/keyboard selection, exact save/run and validation focus on the corrected source. Earlier scores do not certify those later changes.

## Evidence and cleanup

Raw evidence is temporarily under ignored `frontend/test-results/orchestrator-ui/`, for the task's hash-verified external archive:

- `orchestrator-critic1-final/critic-ui-report.json` and its screenshots, including the six `08-moving-*.png` frames.
- `orchestrator-critic1-focus/critic-focus.json`, focused screenshots, `legacy-layout.png`, and `reviewed-source-sha256.json`.
- `critic1.mjs` and `critic1-focus.mjs` are the independent runners. Earlier attempt directories are explicitly non-certifying except for the repeatedly measured checkbox jump.
- Each runtime directory has `preflight.json` and `cleanup.json`. All critic runtimes report `servicesStopped: true`, `cleanupOk: true`, owned database deleted, and no active demo remains. Contexts and browsers were explicitly closed. No second operator-database writer was started; provider credentials and operator preferences/storage were not changed.

The parent implementation task may relocate these raw files into the final external evidence archive and index them without changing this report's findings or reviewed-source inventory.
