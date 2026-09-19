# Independent critic — round 3

19 September 2026. Reviewer: fresh `location_critic_round3`, independent of the implementation authors and both earlier critics. Baseline commit: `d85fc6e839df59e9629a37a0ce0c721d0d81f537`. I changed no production code. This is the third and final requested review round.

**Recommendation: accept this scenario-location change. Overall: 9.1/10.** No unresolved Critical, High or Medium defect was established in the corrected source or my independent checks. No additional actionable Low finding was established. This recommendation covers the location feature and its affected paths; it does not certify the entire application or resolve the previously documented performance/rendering limitations.

## Reviewed source state

I inspected the actual changed source and adjacent paths, rather than relying on implementation summaries. The reviewed production inventory covers 198 Python, TypeScript, TSX, CSS and JSON files under `backend/app`, `frontend/src` and `contracts/sentinel/v1.14`. Its aggregate SHA-256 is **`c168c6469001c9697a13e480e79a5f689de9199d52fc78ff57d3eea0c8db3e1c`**. The [file manifest and hashing method](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/source-audit.json) identify this source state; documentation/evidence-only changes do not alter that inventory.

The audit traced:

- Scenario-owned geometry, supported-footprint validation, strict nested legacy readers, current parent validation, save/review/run creation, expected revisions and idempotency.
- Manual and scripted motion, group translations, nominal timing, Restricted/Friendly boundary effects, Patrol, Intercept assignment/contact, atomic outcomes, NON-OP persistence, command ordering, checkpointing, restart interruption and recorded reads.
- Frontend decoders and delta application, exact pending-body persistence/reconciliation, recovered drafts and live boundary drafts, location interaction guards, camera bookmarks, guide layers, provider coverage reporting, hidden renderer ownership and shared presentation.

Remaining fixed Singapore coordinates examined are historical defaults, developer fixtures or pre-scene camera fallbacks. Custom runs derive their home from frozen geometry and bypass the Singapore/Southeast Asia camera constraint. Existing template names still select the same supported profiles/behavior; they no longer provide spatial authority for a located run.

## Earlier findings: personally rechecked

| Earlier finding | Current result |
|---|---|
| Round 1 M1: live Restricted-boundary occupancy omitted its frozen origin | Corrected. [live_boundaries.py:46](C:/Archive/Coding/Sentinel3/backend/app/commands/live_boundaries.py:46) retains `interactive` in the narrowed check frame. The high-latitude edge-contact regression passes with the existing 1 mm boundary tolerance unchanged. |
| Round 1 M2: historical representations admitted the new null geometry field | Corrected. I inspected the backend field-presence guards and frontend historical-version guards, then ran their positive/negative regressions. Old absent-geometry values remain valid; explicitly supplied null geometry on historical scenario/run/review representations is rejected. |
| Round 2 H1: historical Validate failed because the caller supplied explicit `None` | Corrected. [service.py:67](C:/Archive/Coding/Sentinel3/backend/app/scenarios/service.py:67) now omits the keyword for legacy content. The positive legacy save/review/retry test and negative explicit-null test pass. I also independently completed Validate in the real UI for a saved scenario without geometry, receiving a v1.4 review with `local-horizontal-v1`, no `localGeometry` field and `canRun: true`. |

These conclusions apply to the corrected source inspected in this round. Earlier scores were not used as certification.

## Personally executed checks

- **154 backend cases passed:** `test_scenario_location.py`, `test_boundaries.py`, `test_movement.py`, `test_d4.py`, `test_scenarios.py`, `test_scenario_review.py`, and `test_direct_movement.py`. This includes remote 20v20 execution, legacy review, frozen geometry mutation rejection, restart, strict old representations, high-latitude live-boundary admission, remote Intercept outcomes and altitude preservation. Two existing dependency deprecation warnings remain. [Output](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/.cache/scenario-location/critic3-backend.txt).
- **19 frontend location cases passed**, including frontend/backend nominal timing agreement, inclusive square corners, unsupported coordinates, legacy null-field rejection, field-order-independent geometry comparison, unchanged authored content, restored drafts and exact pending request bodies. [Output](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/.cache/scenario-location/critic3-frontend.txt).
- TypeScript and ESLint passed on the current source. Contract export matched, all **43 foundation/structural/hash checks** passed, and repository hygiene passed with 553 candidate source files.
- Independently compared raw bytes for **159 protected files** selected from the baseline inventory: archived Sentinel contracts, legacy-reader paths and specification paths in that selection. None changed. This is my independently checked subset; the author's broader 189-file preservation and 437-database inventory are separately supplied evidence. [Audit](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/source-audit.json).
- I examined the browser-test changes. They select the existing Quadcopter profile explicitly and assert the new authored scenario version together with its geometry. Behavioral assertions were not removed to mask failures. No meaningful source/asset deletion forms part of this feature diff; this review does not authorize deleting retained legacy readers or archived contracts.

The first backend command named a nonexistent `test_recording.py`, so pytest performed no tests. I corrected the reviewer command to the seven actual files above; the stated 154 results are from that successful execution.

## Personally operated foreground UI

I used **Microsoft Edge 153.0.4234.46**, `headless: false`, a fresh browser context, a task-owned database and ports **5389/8189**. The current bounded `dist-verification-scenario-location` build used blank providers. The main viewport was 1440 × 900 CSS px, with explicit 760/820/900 px checks. I chose **Gibraltar, approximately −5.3498°, 36.1512°**, independently of the author's Sydney and earlier critics' Reykjavík/Heathrow examples. Fixture seeding used the public scenario API; subsequent operations used actual UI controls. Read-only world and renderer diagnostics supplied assertions, not application state mutations.

- A historical default scenario without explicit geometry completed **Validate** in the UI. The response retained historical semantics and omitted the geometry field.
- Numeric origin proposals rejected an unsupported date-line footprint. A distant but supported proposal listed affected units, destinations and boundaries and disabled Apply. Escape retained the old geometry.
- A fitting numeric proposal could be shown on the map and cancelled without resetting deliberate camera movement. Map-click origin picking then populated the focused coordinate form; Apply and Save created revision 2. Unit arrays, positions, altitude fields, headings, actions/timing and boundary vertices compared exactly with the pre-change content. Save did not recenter the camera.
- At 760, 820, 900 and 1440 px, keyboard focus brought Apply into view, Cancel remained reachable and the document had no horizontal overflow. The narrow pane intentionally scrolls; I do not claim all controls fit without scrolling.
- Reload, Validate and Run used the exact saved revision. **All 40 committed track positions advanced and all 40 map entities rendered.** Recenter remained at Gibraltar. A live keyboard/map **Direct Move** was accepted.
- Video Feed followed the remote Friendly position with its supplied **150.125 m WGS84 ellipsoid height**. Keyboard look-around and simulated-entity overlays off/on worked. I captured a **7.024-second, 29-frame sampled motion clip**. It illustrates movement and is explicitly **not display-FPS evidence**.
- Ordinary 3D loaded at the remote location. Hiding it behind Command Picture reduced renderer-pool active count to zero and stopped its rendered-frame counter. Reopening retained its camera. This is a bounded hidden/reopen check, not a general soak/leak claim.
- Pause froze the tracks. A real sole-backend restart retained frozen geometry and the existing paused/interrupted recovery semantics. After reload I explicitly returned to the active demo and acquired control through the existing workflow. Resume and End worked. Previous demos reopened the ended recording with all 40 entities and the same frozen geometry.
- The successful run produced no browser page errors. I personally inspected the legacy-validation, origin-conflict, moving Tactical, Video Feed, ordinary-3D and narrow screenshots. Existing dense labels and pane-edge clipping remain visible; they are not concealed or claimed fixed by this feature.

Two initial UI attempts stopped on reviewer harness assumptions: a response predicate used `/review` instead of `/validate`, and a later attempt expected reload to automatically select the active mission. The actual supported workflow requires Return to active demo. I corrected only the ignored runner and repeated the complete exercise on a fresh database/context. Both unsuccessful attempts also cleaned up.

## Independent evidence

- [Runner](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/critic3-ui.mjs), [successful results](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/critic-ui-report.json), [execution log](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/.cache/scenario-location/critic3-ui-final.txt).
- [Historical Validate](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/01-legacy-validated.png), [invalid nonempty proposal](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/02-origin-conflicts.png), [saved map origin](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/03-saved-remote-origin.png).
- [Moving 40 actors](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/04-remote-40-moving.png), [Video Feed](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/05-remote-video.png), [motion clip](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/critic3-remote-motion.mp4), [ordinary 3D](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/06-remote-ordinary-3d.png), [recorded inspection](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/07-recorded-remote.png).
- [760 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/layout-760.png), [820 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/layout-820.png), [900 px](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/layout-900.png).

Screenshots alone do not prove motion; that claim also uses changed committed positions and the recorded sequence. The conflict screenshot shows part of the scrollable list; assertions checked all three affected-content categories.

## Supplied evidence and limits

The author supplies **391 passing backend tests**, **391 frontend tests**, passing production/verification builds and **36 distinct existing browser cases** across the final affected runs. I read the reports and inspected the relevant test changes; I independently ran the focused checks listed above rather than claiming those complete suites as my own executions.

The author's final UI evidence additionally covers lost committed Save responses with identical request retries, restored pending browser drafts, revision conflicts, a later saved origin while another run stays frozen, numeric editing/repositioning/duplication, routes and boundaries, selected Stop, three Video Feed reopen cycles, and default/nearby configured regional map content with honest outside-pack fallback at Sydney. Those are supplied results. I source-reviewed their affected paths and inspected their evidence summaries but did not independently repeat every one of those UI cases. Earlier critics' high-latitude 20-outcome/40-NON-OP probes are likewise their evidence, not mine.

No global provider coverage, unrestricted geographical simulation, larger operating area, hostile interception, altitude rebasing or whole-arrangement relocation is certified. The supported bound remains an origin between 80°S and 80°N with the entire ±5 km square inside longitude/projection limits. Provider imagery/terrain availability at every allowed origin has not been surveyed. Recorded inspection means the supported Previous demos workflow; the application has no timeline replay UI. No new FPS target or fix for known loaded-Video performance, ordinary-3D cold loading or dense labels is claimed.

## Scores and acceptance

| Area | Score | Justification |
|---|---:|---|
| Frontend correctness | 9.2 | Independent remote authoring, legacy Validate, narrow layouts, live command, Video and hidden/reopen checks pass; camera and origin remain separate. |
| Backend correctness | 9.2 | Ownership is carried into execution/publication/recovery; the previously broken legacy caller is corrected; 154 focused cases pass. |
| Spatial correctness | 9.1 | Bounded footprint, latitude scaling, unchanged altitudes and authoritative boundary semantics are supported by source and tests; unverified worldwide terrain accuracy is not implied. |
| Compatibility/reliability | 9.1 | Strict old-field presence rules, unchanged archived bytes, exact pending bodies, immutable run geometry and restart/recorded paths are supported by independent and clearly identified supplied evidence. |
| Maintainability | 8.9 | The change is bounded and preserves versioned readers. Optional geometry arguments remain necessary for v1 compatibility, making call-site discipline and the new owner-propagation regressions important. |
| Overall | **9.1** | The material findings from earlier rounds are resolved and independently rechecked. The feature works through the real application without changing simulation policy or hiding known limitations. |

**Accept with no established remaining material blocker for this feature.** This score cannot override a later failing test, production-source change or contradictory measurement. If production code changes after the manifest above, this report does not silently certify that new state.

## Cleanup

The final demo was explicitly ended. Every critic context/browser and task service was closed. Cleanup records confirm services stopped, ports released and all three attempt databases deleted: [first attempt](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3/cleanup.json), [second attempt](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-rerun/cleanup.json), [successful attempt](C:/Archive/Coding/Sentinel3-archive/2026-09-19-scenario-location/frontend/test-results/scenario-location/location-critic3-final/cleanup.json). An independent final listener check found neither 5389 nor 8189 listening. Screenshot sequence intermediates were removed after encoding; the short clip and review evidence remain. The task-owned pytest directory was removed after verifying its exact resolved path inside the task cache. No operator database, browser profile, preference, draft, credential or recording was opened for writing. No commit or push was made.

Archival note: after review completion, raw evidence was moved with SHA-256 verification to the user's external local archive. Only evidence links were updated; findings, scores and the reviewed source identity are unchanged.
