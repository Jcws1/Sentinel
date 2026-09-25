# Per-file test catalogue

Generated from the **assessment-ready** complete run, using JUnit, Vitest and Playwright reports. Individual case names, durations and results are retained in [test-cases.json](../../test-results/assessment/assessment-ready/test-cases.json).

Backend unit and integration cases run together. “Integration / mixed” means the file uses a database, service, API or subprocess, and may also contain focused unit cases. Frontend component/library tests use Vitest; browser files drive actual UI workflows.

Backend source report: [`backend-recheck/backend-full.junit.xml`](../../test-results/assessment/assessment-ready/backend-recheck/backend-full.junit.xml). The runner setup failure and corrected rerun, where applicable, are explained in [DEVELOPMENT-NOTES.md](DEVELOPMENT-NOTES.md). Earlier failed reports remain preserved.

## Backend

| File | Kind | Passed / cases | Other results |
|---|---|---:|---|
| [test_analytics.py](../../backend/tests/test_analytics.py) | Integration / mixed | 19 / 19 | None |
| [test_api.py](../../backend/tests/test_api.py) | Integration / mixed | 9 / 9 | None |
| [test_assessment_data.py](../../backend/tests/test_assessment_data.py) | Integration / mixed | 20 / 20 | None |
| [test_authority.py](../../backend/tests/test_authority.py) | Integration / mixed | 8 / 8 | None |
| [test_boundaries.py](../../backend/tests/test_boundaries.py) | Integration / mixed | 14 / 14 | None |
| [test_capacity.py](../../backend/tests/test_capacity.py) | Integration / mixed | 3 / 3 | None |
| [test_conductor.py](../../backend/tests/test_conductor.py) | Integration / mixed | 27 / 27 | None |
| [test_contracts.py](../../backend/tests/test_contracts.py) | Unit | 2 / 2 | None |
| [test_d3a.py](../../backend/tests/test_d3a.py) | Integration / mixed | 17 / 17 | None |
| [test_d4.py](../../backend/tests/test_d4.py) | Integration / mixed | 28 / 28 | None |
| [test_d4_refinement.py](../../backend/tests/test_d4_refinement.py) | Integration / mixed | 22 / 22 | None |
| [test_defensive_scenario.py](../../backend/tests/test_defensive_scenario.py) | Integration / mixed | 15 / 15 | None |
| [test_demo_profile.py](../../backend/tests/test_demo_profile.py) | Integration / mixed | 6 / 6 | None |
| [test_direct_movement.py](../../backend/tests/test_direct_movement.py) | Integration / mixed | 32 / 32 | None |
| [test_domain.py](../../backend/tests/test_domain.py) | Unit | 56 / 56 | None |
| [test_geometry_exact.py](../../backend/tests/test_geometry_exact.py) | Unit | 150 / 150 | None |
| [test_geometry_history.py](../../backend/tests/test_geometry_history.py) | Unit | 1 / 1 | None |
| [test_integrated_probe.py](../../backend/tests/test_integrated_probe.py) | Integration / mixed | 6 / 6 | None |
| [test_interactive.py](../../backend/tests/test_interactive.py) | Integration / mixed | 45 / 45 | None |
| [test_movement.py](../../backend/tests/test_movement.py) | Integration / mixed | 32 / 32 | None |
| [test_observability.py](../../backend/tests/test_observability.py) | Integration / mixed | 13 / 13 | None |
| [test_observation_cache.py](../../backend/tests/test_observation_cache.py) | Integration / mixed | 9 / 9 | None |
| [test_observed_history.py](../../backend/tests/test_observed_history.py) | Integration / mixed | 12 / 12 | None |
| [test_recommendations.py](../../backend/tests/test_recommendations.py) | Integration / mixed | 26 / 26 | None |
| [test_recording_equivalence.py](../../backend/tests/test_recording_equivalence.py) | Integration / mixed | 1 / 1 | None |
| [test_review_session.py](../../backend/tests/test_review_session.py) | Integration / mixed | 2 / 2 | None |
| [test_scenario_analysis.py](../../backend/tests/test_scenario_analysis.py) | Integration / mixed | 13 / 13 | None |
| [test_scenario_location.py](../../backend/tests/test_scenario_location.py) | Integration / mixed | 26 / 26 | None |
| [test_scenario_review.py](../../backend/tests/test_scenario_review.py) | Integration / mixed | 4 / 4 | None |
| [test_scenarios.py](../../backend/tests/test_scenarios.py) | Integration / mixed | 18 / 18 | None |
| [test_scheduler_performance.py](../../backend/tests/test_scheduler_performance.py) | Unit | 7 / 7 | None |
| [test_simulation_resolver.py](../../backend/tests/test_simulation_resolver.py) | Unit | 48 / 48 | None |
| [test_simulation_service.py](../../backend/tests/test_simulation_service.py) | Integration / mixed | 53 / 53 | None |
| [test_storage_codec.py](../../backend/tests/test_storage_codec.py) | Integration / mixed | 20 / 20 | None |
| [test_tactical_fixture.py](../../backend/tests/test_tactical_fixture.py) | Integration / mixed | 4 / 4 | None |

## Frontend

| File | Kind | Passed / cases | Other results |
|---|---|---:|---|
| [activePlans.test.ts](../../frontend/tests/unit/activePlans.test.ts) | Unit / component | 4 / 4 | None |
| [analytics-lifecycle.test.tsx](../../frontend/tests/unit/analytics-lifecycle.test.tsx) | Unit / component | 21 / 21 | None |
| [analytics.test.ts](../../frontend/tests/unit/analytics.test.ts) | Unit / component | 9 / 9 | None |
| [assetPortrait.test.tsx](../../frontend/tests/unit/assetPortrait.test.tsx) | Unit / component | 8 / 8 | None |
| [boundaries.test.ts](../../frontend/tests/unit/boundaries.test.ts) | Unit / component | 8 / 8 | None |
| [camera.test.ts](../../frontend/tests/unit/camera.test.ts) | Unit / component | 4 / 4 | None |
| [cesiumLayerRecovery.test.ts](../../frontend/tests/unit/cesiumLayerRecovery.test.ts) | Unit / component | 4 / 4 | None |
| [cesiumSurfaceSafety.test.ts](../../frontend/tests/unit/cesiumSurfaceSafety.test.ts) | Unit / component | 8 / 8 | None |
| [chartMotion.test.ts](../../frontend/tests/unit/chartMotion.test.ts) | Unit / component | 6 / 6 | None |
| [chartProjection.test.ts](../../frontend/tests/unit/chartProjection.test.ts) | Unit / component | 5 / 5 | None |
| [cockpit.test.ts](../../frontend/tests/unit/cockpit.test.ts) | Unit / component | 30 / 30 | None |
| [cockpitAdapter.test.ts](../../frontend/tests/unit/cockpitAdapter.test.ts) | Unit / component | 1 / 1 | None |
| [cockpitPresentation.test.ts](../../frontend/tests/unit/cockpitPresentation.test.ts) | Unit / component | 14 / 14 | None |
| [conductor.test.ts](../../frontend/tests/unit/conductor.test.ts) | Unit / component | 7 / 7 | None |
| [d3a.test.ts](../../frontend/tests/unit/d3a.test.ts) | Unit / component | 15 / 15 | None |
| [d4.test.ts](../../frontend/tests/unit/d4.test.ts) | Unit / component | 11 / 11 | None |
| [details.test.tsx](../../frontend/tests/unit/details.test.tsx) | Unit / component | 7 / 7 | None |
| [directClient.test.ts](../../frontend/tests/unit/directClient.test.ts) | Unit / component | 5 / 5 | None |
| [displayPreferences.test.ts](../../frontend/tests/unit/displayPreferences.test.ts) | Unit / component | 6 / 6 | None |
| [entityRows.test.ts](../../frontend/tests/unit/entityRows.test.ts) | Unit / component | 4 / 4 | None |
| [exactGeometry.test.ts](../../frontend/tests/unit/exactGeometry.test.ts) | Unit / component | 135 / 135 | None |
| [interactiveClient.test.ts](../../frontend/tests/unit/interactiveClient.test.ts) | Unit / component | 22 / 22 | None |
| [mapServices.test.ts](../../frontend/tests/unit/mapServices.test.ts) | Unit / component | 6 / 6 | None |
| [motionPresentation.test.ts](../../frontend/tests/unit/motionPresentation.test.ts) | Unit / component | 9 / 9 | None |
| [movement.test.ts](../../frontend/tests/unit/movement.test.ts) | Unit / component | 12 / 12 | None |
| [observedHistory.test.ts](../../frontend/tests/unit/observedHistory.test.ts) | Unit / component | 9 / 9 | None |
| [observedProgress.test.ts](../../frontend/tests/unit/observedProgress.test.ts) | Unit / component | 2 / 2 | None |
| [orchestrator-selection.test.tsx](../../frontend/tests/unit/orchestrator-selection.test.tsx) | Unit / component | 2 / 2 | None |
| [orchestrator.test.ts](../../frontend/tests/unit/orchestrator.test.ts) | Unit / component | 8 / 8 | None |
| [paneSubscription.test.tsx](../../frontend/tests/unit/paneSubscription.test.tsx) | Unit / component | 1 / 1 | None |
| [profileLayer.test.ts](../../frontend/tests/unit/profileLayer.test.ts) | Unit / component | 4 / 4 | None |
| [profileSeries.test.ts](../../frontend/tests/unit/profileSeries.test.ts) | Unit / component | 3 / 3 | None |
| [providers.test.ts](../../frontend/tests/unit/providers.test.ts) | Unit / component | 9 / 9 | None |
| [recommendations.test.ts](../../frontend/tests/unit/recommendations.test.ts) | Unit / component | 12 / 12 | None |
| [refinementContracts.test.ts](../../frontend/tests/unit/refinementContracts.test.ts) | Unit / component | 1 / 1 | None |
| [regions.test.ts](../../frontend/tests/unit/regions.test.ts) | Unit / component | 2 / 2 | None |
| [rendererPool.test.ts](../../frontend/tests/unit/rendererPool.test.ts) | Unit / component | 9 / 9 | None |
| [requestRecovery.test.ts](../../frontend/tests/unit/requestRecovery.test.ts) | Unit / component | 20 / 20 | None |
| [rts-presentation.test.tsx](../../frontend/tests/unit/rts-presentation.test.tsx) | Unit / component | 8 / 8 | None |
| [rtsMapGestures.test.ts](../../frontend/tests/unit/rtsMapGestures.test.ts) | Unit / component | 10 / 10 | None |
| [runtime.test.ts](../../frontend/tests/unit/runtime.test.ts) | Unit / component | 38 / 38 | None |
| [scenario-location.test.ts](../../frontend/tests/unit/scenario-location.test.ts) | Unit / component | 19 / 19 | None |
| [scenarios.test.ts](../../frontend/tests/unit/scenarios.test.ts) | Unit / component | 15 / 15 | None |
| [scene.test.ts](../../frontend/tests/unit/scene.test.ts) | Unit / component | 14 / 14 | None |
| [scheduleContracts.test.ts](../../frontend/tests/unit/scheduleContracts.test.ts) | Unit / component | 14 / 14 | None |
| [selectedControl.test.ts](../../frontend/tests/unit/selectedControl.test.ts) | Unit / component | 3 / 3 | None |
| [simulation-client.test.ts](../../frontend/tests/unit/simulation-client.test.ts) | Unit / component | 36 / 36 | None |
| [tabContextMenu.test.tsx](../../frontend/tests/unit/tabContextMenu.test.tsx) | Unit / component | 3 / 3 | None |
| [videoOverlay.test.ts](../../frontend/tests/unit/videoOverlay.test.ts) | Unit / component | 23 / 23 | None |
| [workspaceBridge.test.ts](../../frontend/tests/unit/workspaceBridge.test.ts) | Unit / component | 11 / 11 | None |

## Browser

| File | Kind | Passed / cases | Other results |
|---|---|---:|---|
| [analytics.spec.ts](../../frontend/tests/browser/analytics.spec.ts) | End-to-end | 4 / 4 | None |
| [assessment.spec.ts](../../frontend/tests/browser/assessment.spec.ts) | End-to-end | 2 / 2 | None |
| [boundaries.spec.ts](../../frontend/tests/browser/boundaries.spec.ts) | End-to-end | 7 / 7 | None |
| [chrome.spec.ts](../../frontend/tests/browser/chrome.spec.ts) | End-to-end | 7 / 7 | None |
| [compact-demo.spec.ts](../../frontend/tests/browser/compact-demo.spec.ts) | End-to-end | 2 / 2 | None |
| [conductor.spec.ts](../../frontend/tests/browser/conductor.spec.ts) | End-to-end | 3 / 3 | None |
| [credits.spec.ts](../../frontend/tests/browser/credits.spec.ts) | End-to-end | 1 / 1 | None |
| [d3a.spec.ts](../../frontend/tests/browser/d3a.spec.ts) | End-to-end | 4 / 4 | None |
| [d4-refinement.spec.ts](../../frontend/tests/browser/d4-refinement.spec.ts) | End-to-end | 6 / 6 | None |
| [d4.spec.ts](../../frontend/tests/browser/d4.spec.ts) | End-to-end | 2 / 2 | None |
| [details-closure.spec.ts](../../frontend/tests/browser/details-closure.spec.ts) | End-to-end | 1 / 1 | None |
| [entities.spec.ts](../../frontend/tests/browser/entities.spec.ts) | End-to-end | 7 / 7 | None |
| [fleet-details.spec.ts](../../frontend/tests/browser/fleet-details.spec.ts) | End-to-end | 5 / 5 | None |
| [interactive.spec.ts](../../frontend/tests/browser/interactive.spec.ts) | End-to-end | 4 / 4 | None |
| [map-recovery.spec.ts](../../frontend/tests/browser/map-recovery.spec.ts) | End-to-end | 8 / 8 | None |
| [mapServices.spec.ts](../../frontend/tests/browser/mapServices.spec.ts) | End-to-end | 11 / 11 | None |
| [mission.spec.ts](../../frontend/tests/browser/mission.spec.ts) | End-to-end | 7 / 7 | None |
| [movement.spec.ts](../../frontend/tests/browser/movement.spec.ts) | End-to-end | 5 / 5 | None |
| [orchestrator-layout.spec.ts](../../frontend/tests/browser/orchestrator-layout.spec.ts) | End-to-end | 1 / 1 | None |
| [regionalMaps.spec.ts](../../frontend/tests/browser/regionalMaps.spec.ts) | End-to-end | 7 / 7 | None |
| [retention.spec.ts](../../frontend/tests/browser/retention.spec.ts) | End-to-end | 3 / 3 | None |
| [rts-gestures.spec.ts](../../frontend/tests/browser/rts-gestures.spec.ts) | End-to-end | 1 / 1 | None |
| [scenario-authoring.spec.ts](../../frontend/tests/browser/scenario-authoring.spec.ts) | End-to-end | 5 / 5 | None |
| [scenarios.spec.ts](../../frontend/tests/browser/scenarios.spec.ts) | End-to-end | 3 / 3 | None |
| [simulation-compatibility.spec.ts](../../frontend/tests/browser/simulation-compatibility.spec.ts) | End-to-end | 7 / 7 | None |
| [tactical.spec.ts](../../frontend/tests/browser/tactical.spec.ts) | End-to-end | 11 / 11 | None |
| [workspace.spec.ts](../../frontend/tests/browser/workspace.spec.ts) | End-to-end | 8 / 8 | None |

## Completeness

Every discovered test file in the normal backend, Vitest and Playwright suite is represented above. Fixture builders, helper modules and optional standalone measurement scripts are not counted as tests. Their commands and evidence status are in [TESTING.md](TESTING.md).
