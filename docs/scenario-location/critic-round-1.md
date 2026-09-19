# Independent critic — round 1

19 September 2026. Reviewer: fresh `location_critic_round1` agent, independent of the implementation author. Baseline: `d85fc6e`. No production code was changed by this reviewer. This report covers the source inspected before the two corrections below; it does not certify later edits.

**Recommendation: changes required. Overall: 8.1/10.** Two reproduced Medium defects remain in the reviewed state. Neither invalidates the useful location implementation, but both violate explicit geometry/compatibility requirements. A fresh reviewer must inspect the corrections.

## Findings

### M1 — A live Restricted boundary's occupancy check loses the frozen origin

- **Severity:** Medium.
- **Source:** [live_boundaries.py:46](C:/Archive/Coding/Sentinel3/backend/app/commands/live_boundaries.py:46), used at line 52; [zone_rules.py:15](C:/Archive/Coding/Sentinel3/backend/app/commands/zone_rules.py:15).
- **Cause:** `candidate()` constructs a temporary `check` containing only `zones` and `boundaryRules`. `blocked(check, position)` consequently falls back to the historical Singapore metric, even though the proposed boundary and source position belong to a v2 run. Structural validation earlier in this method correctly uses the run, but occupancy validation does not.
- **Personally reproduced:** origin `(0,80)`, source actor at local `(99.99950624785349,0)` metres, and a Restricted rectangle from `(100,-20)` to `(140,20)` metres. `candidate()` accepts the new boundary. Calling `blocked()` on the resulting frame rejects the same actor because it is within the established 1 mm inclusive edge-contact tolerance. The wrong longitude scale makes the temporary check treat it as farther away. The discrepancy is a sub-millimetre edge case, not a claim that ordinary interior points evade containment.
- **Impact:** live activation and subsequent authoritative movement/eligibility disagree about whether an actor occupies a Restricted boundary. A change can be acknowledged as valid and immediately place the actor in a state that ordinary checks consider prohibited. This fails the requirement to preserve existing boundary semantics at supported latitudes.
- **Correction:** retain the frozen `interactive` geometry in the narrowed boundary-check frame, or pass that geometry explicitly. Add regression coverage that compares activation with ordinary occupancy at high-latitude edges, including a point just beyond tolerance. Do not enlarge the tolerance or change boundary rules.
- **Evidence:** [backend probe result](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/backend-probes.json), [reproducer](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/critic1-probes.py).

### M2 — New nullable geometry is accepted on historical wire versions

- **Severity:** Medium.
- **Source:** [serialization.py:21](C:/Archive/Coding/Sentinel3/backend/app/world/serialization.py:21), [contracts.py:252](C:/Archive/Coding/Sentinel3/backend/app/commands/contracts.py:252), [interactive.ts:398](C:/Archive/Coding/Sentinel3/frontend/src/contracts/interactive.ts:398), [scenarios.ts:153](C:/Archive/Coding/Sentinel3/frontend/src/contracts/scenarios.ts:153).
- **Cause:** the broadened shared schemas use the truthiness/value of `localGeometry` to determine versions. They do not consistently reject the *presence* of this previously unknown property on old representations. World 1.10 is sent directly to the broadened current model. Frontend scenario 1.4/1.5 decoding has no corresponding historical shape check for the new field.
- **Personally reproduced:** take a valid world 1.10 containing run 1.7 and add `interactive.localGeometry: null`. Both backend `read_frame()` and frontend `validateFrame()` accept it. Take a valid typed scenario revision 1.4 and add `content.localGeometry: null`; frontend `decodeScenarioRevision()` accepts it, while backend `ScenarioRevision.strict_legacy()` rejects it. Both frontend reproduction tests passed precisely because the malformed legacy payloads were accepted.
- **Impact:** the historical contract boundary is weakened, and the frontend/backend disagree on admissible old scenario bytes. This does not move existing valid scenarios or prove that stored recordings were rewritten. It does break the explicit requirement to validate old representations strictly before adaptation and increases the chance of drafts/receipts being accepted by one side and rejected by the other.
- **Correction:** reject the new field, including `null`, on old scenario/run/world/status representations before any adaptation, or validate through frozen schemas/readers first. Keep absence as the legacy representation, keep existing bytes/hashes unchanged, and add frontend/backend malformed-payload tests alongside valid legacy retry/hash tests.
- **Evidence:** [backend probe result](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/backend-probes.json), [frontend probes](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/critic1.contracts.test.ts).

No Critical or High findings were established in this review. No separate Low finding is needed to duplicate the missing regression coverage above.

## Personally verified

- Inspected the actual diff and adjacent scenario validators, actions/boundaries, movement math, scheduler, Patrol/Intercept/contact geometry, command admission/idempotency, authority publication, checkpoint/recovery, recording readers, frontend decoders/reducer, draft/pending persistence, live boundary editor, script previews, location component, Tactical interaction modes, renderer camera/guide paths, and provider coverage changes.
- The context is normally owned by scenario content or the frozen interactive run. Save/run creation carries the explicit geometry; manual/script/behavior paths normally use it. The authority rejects changes to a mission's geometry. Changing the authoring origin does not rewrite units, routes, boundaries or altitude fields. The narrowed temporary frame in M1 is the exception found.
- Ran **112 focused backend tests**: `test_scenario_location.py`, `test_boundaries.py`, `test_movement.py`, `test_d4.py`, and `test_scenarios.py`. All passed; two existing dependency deprecation warnings remained.
- Ran all **17 new frontend location tests**. All passed. These include nominal frontend/backend timing agreement, square corners, unsupported coordinates, preserved draft content, and exact pending request retry payloads. Also ran the **two independent contract probes** for M2.
- Added and ran a separate isolated backend exercise at latitudes **0°, 64.13° and 80°**. At each latitude: 40 actors, 20 accepted friendly manual moves, 20 unique existing Intercept assignments, 20 atomic mutual-loss outcomes, 40 persisted NON-OP entities, identical retry receipt, paused restart recovery, no resumed motion of lost entities, and retained recorded geometry. All three cases passed. This uses existing friendly interception and observation-only hostiles, without new combat semantics. [Reproducer](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/critic1-outcomes.py), [results](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/outcome-probes.json).
- Independently operated **foreground Microsoft Edge 153.0.4234.46** on a fresh browser context and task-owned runtime at ports 5385/8185. The bounded `dist-scenario-location` build used the blank-grid/no-credential configuration. Tested a location near Reykjavík `(-21.94,64.13)`, deliberately different from the author's Sydney fixture.
- Through UI: unsupported date-line footprint rejection; numeric preview; Show operating area; Cancel preserving the original geometry while retaining deliberate camera movement; map origin pick and Apply without accidental unit creation; numeric unit placement and Save; exact altitude `321.125` and heading `17.75`; incompatible nonempty origin rejection; Escape; reload; route/boundary conflict listing; exact saved revision Validate/Run; all 40 tracks advancing and all 40 entities rendered; Recenter without Singapore clamping; Video Feed following a remote actor with keyboard look-around; Pause/Resume; End; and screenshots at 760, 820, 900 and 1440 px. No browser page errors or document overflow were observed.
- Inspected the screenshots myself. Origin and square guides were visible at the selected location. Video Feed telemetry and its viewpoint used the high-latitude actor. Existing symbols, colours and pane presentation were retained. Narrow layouts docked the Video Feed below the map and kept its own scrolling.
- No meaningful cleanup deletion is part of this feature diff. The old contract directories/readers were retained; this review provides no approval to remove them later.

## Evidence index

Raw evidence remains ignored and outside tracked source files:

- [Independent UI runner](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/critic1-ui.mjs) and [UI results](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/critic-ui-report.json).
- [Date-line rejection](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/01-dateline-rejection.png).
- [High-latitude origin guide](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/02-high-latitude-map-origin.png).
- [Nonempty origin preview](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/03-nonempty-origin-rejection.png). The full conflict list was below the visible fold in this still; the runner separately checked its contents and disabled Apply.
- [Moving 20v20 run](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/04-high-latitude-40-moving.png).
- [Video Feed](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/05-high-latitude-video.png).
- [760 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/layout-760.png), [820 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/layout-820.png), [900 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/layout-900.png).
- [Ended run](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/06-ended-high-latitude.png) and [service/database cleanup](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic1/cleanup.json).

The screenshot is not proof of motion by itself; movement claims above additionally use committed-position changes from the live application and renderer entity counts. No FPS or performance-target claim is made.

## Supplied evidence and remaining verification

The author reports complete backend/frontend/foundation suites and repository hygiene checks passing, plus additional Sydney UI/restart cases. Those full-suite results were supplied, not independently rerun by this critic. The reviewer personally ran the focused suites and probes listed above.

The UI build used for this round predates the author's latest property-order equality fix and placement-error shortcut buttons. I reviewed the source for the equality fix, but those latest details require a rebuilt UI and fresh reviewer. Normal configured map-pack/provider coverage, actual remote 3D projection switching, pane reopen/bookmark/resource counts, browser zoom, recorded timeline navigation, lost-save-response UI, revision-conflict UI and authoring while another frozen run exists were not independently exercised in this round. Some have unit/backend coverage or supplied author evidence; that is not interchangeable with my UI verification.

Playwright video creation initially failed because its optional ffmpeg binary was unavailable. I used my own screenshots and position evidence instead; no independent recording is claimed. A system ffmpeg path was subsequently supplied to the author for further evidence.

## Scores and acceptance

| Area | Score | Rationale |
|---|---:|---|
| Frontend correctness | 8.5 | Authoring workflow and high-latitude UI passed; legacy null-field mismatch remains; some final UI paths not personally verified. |
| Backend correctness | 8.2 | Commands, moving capacity, outcomes and recovery passed; one real boundary admission inconsistency remains. |
| Spatial correctness | 8.0 | Explicit local model, bounded footprint and normal/high-latitude calculations are sound in tested cases; M1 violates owner propagation. |
| Compatibility/reliability | 7.8 | Valid legacy and retry coverage is substantial; strict historical representation handling is incomplete in M2. |
| Maintainability | 8.5 | Bounded change with reusable math and preserved readers; optional-context fallback makes omitted ownership easy to miss, so regression cases are important. |
| Overall | **8.1** | Useful implementation with substantive positive evidence, but not yet acceptable against the requested strictness and boundary semantics. |

Resolve M1 and M2, rerun affected tests and UI evidence, and obtain the required fresh independent review. A later high score cannot substitute for the remaining verification matrix. This is a review of this feature and affected paths, not a claim that the whole application is bug-free.

## Cleanup

The critic ended its UI demo. Its context/browser and both task-owned services were closed, ports released, and task databases deleted by the isolated runtime. Backend outcome probes used closed in-memory repositories. The focused pytest disposable directory was removed after tests. Raw screenshots, scripts and reports were retained for review; operator databases, profiles, credentials and storage were not used or modified.

Archival note: after review completion, raw evidence was moved with SHA-256 verification to the user's external local archive. Only evidence links were updated; findings, scores and the reviewed source identity are unchanged.
