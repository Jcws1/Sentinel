# Regression investigation

These notes distinguish product corrections, updated UI paths and pre-existing test assumptions. Failed/intermediate output remains in the local evidence archive. Assertions and historical contract/hash guards are not deleted to obtain a passing result.

## Resolved setup and UI issues

- Browser helpers now open Orchestrator's internal tabs and the labelled file/map and location/boundary disclosures. Profile placement explicitly chooses a supported profile. Existing movement, saved-revision, hash and dependency assertions remain.
- The lost-Run-response test uses the current **Retry Run request** label. Fault injection also blocks receipt lookup while testing explicit retry, so the unchanged automatic reconciliation cannot race that operation. It still asserts two submissions and one created run; its action ordering/completion assertions passed. All four `d3a.spec.ts` workflows passed on a fresh database.
- One exact camera-equality assertion initially differed only in 3D pitch, `34.973070166102296` versus `34.97307016610232`. The exact assertion was retained and passed on the focused rerun. No camera rounding, renderer change or relaxed tolerance was introduced.
- Closed FlexLayout borders serialize their default `selected: -1` by omitting the property. The new layout test checks the normalized default **and** `selectedInPane: false` and actual hidden Details. The normalizer test still checks unchanged input and closed-border data.
- Existing entity/mission tests inspected cached content while its pane was hidden. The unchanged `PaneVisibilityContext` / `useOperationalSnapshot` intentionally suspend those panes. Tests now reveal Details or Command Picture before the original current-state/removal assertion. This exercises catch-up without demanding hidden subscriptions.
- The 5v0 movement test picked a fixed fraction near the top of an oblique 3D camera, producing a legitimately out-of-extent destination. Its 3D setup now frames a known point within the historical square and sends the actual canvas click. The acceptance, movement and Stop assertions are retained; no extent or simulation rule was relaxed.

## Two pre-existing v1/v2 browser expectation conflicts

`frontend/tests/browser/d4.spec.ts` contains two legacy click-scope/held-reserve workflows. New runs already used `local-fleet-v2` at baseline commit `83364f6`, before Orchestrator. The following production paths are unchanged by this task:

- `backend/app/commands/behaviors.py`: new-run initialization chooses `local-fleet-v2`; the existing acquisition radius defaults to 700 m.
- `frontend/src/app/runtime.ts`: the direct-move `intercept` flag is sent only for a non-RTS legacy run.
- `backend/app/commands/service.py`: legacy approach alone returns the clicked `targetScope` and `behaviorOutcomes`; current direct movement returns `directOrder` and `memberOutcomes`.
- `backend/app/commands/rts_behavior.py`: eligible armed members acquire nearby targets independently of a clicked-area scope. Both hostiles in the second browser fixture fall within the existing 700 m radius, so two active assignments are legitimate.
- `backend/tests/test_d4.py` explicitly installs `local-fleet-v1` / 250 m to test historical scope/reserve expectations. Those dedicated compatibility tests are preserved; the independent critic ran them together with `test_d4_refinement.py`, **50/50 passed**.

Consequently the browser's expected one-item `targetScope` (received zero) and expected one active assignment (received two) do not describe current new-run semantics. Neither is evidence that Orchestrator should change simulation behavior.

The user was asked to resolve the instruction to preserve existing assertions: update these two browser workflows to explicit v2 receipt/acquisition expectations while retaining the dedicated v1 compatibility suite, or retain the browser failures as an acceptance limitation. **No semantic assertion changes have been applied pending that answer.** No passing full-browser or unconditional delivery-acceptance claim is made.
