# Independent critic — round 2

19 September 2026. Reviewer: fresh `location_critic_round2`, independent of the implementation authors and round-1 reviewer. Baseline: `d85fc6e`. I changed no production code. I inspected the actual changed source, ran focused checks, and operated a separate foreground Edge runtime.

**Round-2 recommendation: do not accept the entry state. Overall: 8.2/10.** A High compatibility regression was reproduced. The author corrected it during this review, and my affected regression rerun passed. The corrected final state still requires the requested fresh round-3 review and completion of the outstanding verification matrix; this score does not certify subsequent edits.

## Findings

### H1 — Validating any historical scenario raises a validation exception

- **Severity: High. Status: author correction observed; focused recheck passed.**
- **Source:** [service.py:67](C:/Archive/Coding/Sentinel3/backend/app/scenarios/service.py:67), [review.py:35](C:/Archive/Coding/Sentinel3/backend/app/scenarios/review.py:35), and the calling [validate route](C:/Archive/Coding/Sentinel3/backend/app/api/scenarios.py:24).
- **Reproduction:** run `pytest -q tests/test_scenario_location.py tests/test_boundaries.py tests/test_movement.py tests/test_d4.py tests/test_scenarios.py` on the source at the start of this round. `test_boundaries.py::test_review_and_run_both_reject_untyped_and_every_source_owned_occupant` fails. Save ordinary historical content without `localGeometry`, then call `ScenarioService.review()` for its exact reference.
- **Cause:** the service explicitly supplied `local_geometry=revision.content.local_geometry`, including `None`. The newly strict `ScenarioMotionPreset` correctly rejects a geometry field supplied to its historical v1 model, including null. Consequently a valid old scenario fails before a review response can be returned. The public Validate route directly calls this method, so the exception also breaks the operator validation workflow; this HTTP consequence is inferred from the route, whereas the service exception was personally reproduced.
- **Impact:** existing saved scenarios cannot complete Validate and the normal Validate/Run workflow. This is not merely a malformed-payload edge case: absence of geometry is the supported representation for all historical scenarios.
- **Recommended correction:** omit the keyword entirely when geometry is absent. Keep strict rejection of explicitly supplied null on historical wire payloads. Add a positive historical save/review/retry regression and keep the negative null-field case.
- **Response verified:** the current constructor at lines 67–69 conditionally supplies the keyword. The added `test_legacy_saved_revision_review_omits_new_geometry_and_rejects_explicit_null` covers the positive and negative cases. My rerun of the same focused group passed all **118 cases**, including this addition. A fresh critic must still review the corrected source as required by the user.
- **Evidence:** [initial failure record](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/initial-failure.json), [focused rerun output](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/focused-tests.txt).

No additional Critical, High, Medium or Low actionable defect was established during this round. That is a bounded review result, not proof that every path is defect-free.

## Personally verified source and checks

- Traced scenario-owned geometry through parent/nested validation, API save/review/run creation, command admission, manual and scripted motion, group translation, Patrol, Intercept acquisition/contact/outcomes, Restricted and Friendly boundaries, publication, checkpoints, restart handling and recorded readers. The actual source uses scenario content or the frozen run as authority, not the edited draft or camera. The remaining fixed Singapore values examined serve legacy defaults, developer fixtures or pre-scene camera fallbacks; custom run scenes select their own home and bypass the historical region constraint.
- Confirmed the round-1 Restricted-boundary candidate correction retains `interactive` in its narrowed check frame. The high-latitude inclusive-contact regression passes without increasing the 1 mm boundary tolerance. Reviewed both frontend and backend metric calculations and the separate 0.1 mm v2 extent-roundtrip tolerance.
- Confirmed strict field-presence rejection for historical world/run/scenario/review representations and inspected the legacy adaptation paths. The new strictness is correct; H1 was its incorrectly updated caller. Reviewed expected revision/idempotency transactions, exact stored request reconstruction, draft restoration/disarming, and immutable run geometry checks.
- Inspected frontend renderer ownership, subscription usage, origin-pick dispatch precedence, camera events, scenario timing cache invalidation, hidden-pane suspension and the location guide layers. Origin changes clone only geometry; existing authored unit/action/boundary objects remain geographic and preserve their altitude fields.
- The first focused backend run yielded **116 passed, 1 failed** (H1). After the author's constructor correction and positive regression addition, **118 passed**. Two existing dependency deprecation warnings remain.
- Independently ran all **19 frontend location unit cases**, which passed, including field-order-independent geometry equality, legacy null rejection, pending-body preservation and backend-derived timing agreement.
- Independently ran the current contract export check and the **43 Phase-0 structural/hash checks**; both passed. `git diff --name-only` for archived contract directories v1.0 through v1.13 returned no changed files. No meaningful source/asset deletion is part of this feature, so there is no deletion justified by an unsupported claim of disuse.

## Personally verified foreground UI

Used **Microsoft Edge 153.0.4234.46**, `headless: false`, fresh browser context, 1440 × 900 CSS px with narrow checks at 760/820/900 px. The runtime used task ports **5387/8187**, a task-owned database, and the current bounded **dist-verification-scenario-location** blank-provider build. I deliberately chose **Heathrow, approximately −0.4543°, 51.47°**, rather than the author's Sydney fixture or round 1's Reykjavík location.

- Loaded a 20 Friendly / 20 Hostile scenario created through the public scenario API. An incompatible origin proposal listed units, destinations and boundaries, disabled Apply, and Escape retained the old geometry. These conflict-list assertions were checked in the DOM; the first screenshot does not show the whole scrollable list.
- Tested a fitting numeric preview, Show operating area, Cancel, and actual map-click origin picking followed by Apply. Keyboard focus returned to the coordinate form. Save created revision 2. All unit positions/altitudes/headings, actions/timings and boundary vertices compared exactly with the pre-change content. The deliberate camera position did not reset on Save.
- Focused Apply at 760, 820, 900 and 1440 px, checked it was in the viewport, and captured screenshots. The page had no horizontal document overflow. The narrow form scrolls inside its docked pane; this is not a claim that all controls fit without scrolling.
- Reloaded, validated and ran the exact saved revision through UI. All **40 committed track positions advanced**, all **40 map entities rendered**, and the frozen run geometry matched the saved revision. Recenter remained at the remote location. A live keyboard/map **Direct Move** was accepted through the application; its geometry model was not silently defaulted to v1.
- Opened Video Feed on a remote Friendly, checked its camera pose, toggled simulated overlays off/on, and captured a **6.644-second motion demonstration** (26 sampled frames). This is a screenshot sequence encoded at its measured sampling rate, **not display-FPS evidence**.
- Switched to ordinary 3D, hid the map behind Command Picture, verified renderer-pool active count became zero and the hidden Cesium rendered-frame count remained unchanged, then reopened it at the retained camera. The warm hidden/reopen check passed; no general leak or soak claim follows from this short case.
- Exercised Pause/Resume/End. Paused tracks remained unchanged. Reopened the ended run via Previous demos and verified 40 rendered entities and the original frozen geometry. This is supported recorded inspection, not timeline replay/scrubbing.
- No browser page errors occurred. I personally inspected the rejection, map-origin, moving Video Feed, ordinary-3D and narrow-layout screenshots. Existing dense labels and pane-edge clipping remain visible in the motion screenshot; this feature does not establish a fix for previously documented rendering limitations.

The first UI attempt stopped because my response predicate watched `/commands` instead of the actual `/direct-moves` endpoint. That was a reviewer harness error. I corrected only the ignored runner, reran against a fresh task database/context, and the complete exercise passed. Both attempts cleaned up their services and databases.

## Evidence

Raw evidence is ignored and not part of tracked source:

- [Independent UI runner](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/critic2-ui.mjs), [passing UI results](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/critic-ui-report.json).
- [Invalid nonempty proposal](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/01-nonempty-invalid-origin.png), [map origin Apply](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/02-origin-map-apply.png).
- [Moving remote Video Feed](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/03-remote-motion-video.png), [short motion recording](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/critic-remote-motion.mp4), [ordinary 3D](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/04-remote-ordinary-3d.png), [reopened recording](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/05-reopened-recording.png).
- [760 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/layout-760.png), [820 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/layout-820.png), [900 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/layout-900.png).
- [Passing-run cleanup](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2-rerun/cleanup.json), [first-attempt cleanup](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic2/cleanup.json).

## Supplied evidence and limits

The author reports **391 backend cases passing after H1**, additional Sydney UI/restart, exact uncertain-save/reload/retry, revision conflict, frozen active run versus later saved revision, three Video Feed reopen cycles and a 12-second motion recording. The author also reports configured default/nearby regional map content with more than 93 building features, Sydney outside-pack labelling, unit editing/repositioning, route editing, boundary creation and Save/Validate/Run/Stop, with no external requests in that 2D check. The final browser suite is still in progress at this report's completion. These are supplied or in-progress results, not independent executions by this critic. The round-1 high-latitude outcome probe results are another reviewer's evidence; I instead personally ran the current focused backend tests, including the added remote outcomes/recovery cases.

I did not independently exercise configured provider requests/coverage, browser zoom, every reposition/duplication/route-authoring gesture, lost-response/revision-conflict UI, or active-run authoring in this round. Those paths were source-reviewed and have some author/test evidence, but the final report must retain that distinction. This review made no FPS, general worldwide coverage, unlimited capacity, new hostile-interception or complete-codebase-correctness claim. No provider credentials were used or exposed.

## Scores and acceptance

These scores describe the source state presented at the start of round 2, including the reproduced High regression. The later focused correction is recorded above; fresh round 3 owns final certification.

| Area | Score | Reason |
|---|---:|---|
| Frontend correctness | 9.0 | Compact authoring workflow, remote motion, command, Video Feed and hidden/reopen cases passed; remaining UI matrix is explicitly bounded. |
| Backend correctness | 8.0 | Geometry, movement/outcomes and persistence tests largely pass, but historical validation was broken by a real caller/validator mismatch. |
| Spatial correctness | 9.0 | Scenario/run ownership, bounded footprint, latitude scaling, inclusive boundaries and geographic preservation are supported by source and focused tests. |
| Compatibility/reliability | 7.5 | H1 blocks the supported historical Validate workflow; exact legacy reader preservation itself is correctly strengthened. |
| Maintainability | 8.5 | Change is bounded and retains legacy readers; optional context for compatibility requires disciplined call-site coverage, as round 1 demonstrated. |
| Overall | **8.2** | Positive feature evidence cannot override a reproduced compatibility failure. |

No additional material source defect remained established after the targeted H1 correction was rechecked. **Acceptance remains withheld pending fresh round 3 and the final required checks.** Do not use the passing remote UI or an improved score to obscure a failing legacy check or an unverified requirement.

## Cleanup

The successful demo was explicitly ended. Both critic browser contexts and browsers were closed. Isolated-runtime cleanup reports confirm both attempts stopped their owned services, released the ports and deleted their task databases. The first failed harness attempt's active demo was finalized by the cleanup helper. Both critic pytest disposable directories were removed after verifying their resolved paths were inside the task cache. Screenshots, MP4, ignored runner and text evidence remain for review. No operator database, browser profile, preference, draft, credential or recording was opened for writing. No commits or pushes were made.

Archival note: after review completion, raw evidence was moved with SHA-256 verification to the user's external local archive. Only evidence links were updated; findings, scores and the reviewed source identity are unchanged.
