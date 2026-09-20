# Configurable scenario locations

The current workflow exposes **Scenario location** in **Orchestrator → Units → Location & boundaries**, with a **Location** shortcut in the shared header. See the [Orchestrator guide](../orchestrator-ui/README.md). New scenarios retain the default origin **103.85°E, 1.29°N** until explicitly changed. Choose **Enter coordinates** or **Choose on map**, inspect the proposed guide, then **Apply origin** or **Cancel origin change**. Escape cancels. A picked location returns focus to the coordinate form before confirmation.

The operating area is a **10 × 10 km square: ±5 km east/west and north/south**, not a 5 km radius. Origin and square guides belong only to the editor. They do not count as boundaries or affect rules. **Recenter** moves the camera to the scenario origin; **Show operating area** fits the square or the proposed square during editing. Pan, zoom, projection changes, ordinary saves and telemetry do not change the origin. Each pane retains its own camera ownership/bookmark.

Changing an origin never relocates content. Units, route destinations, boundary vertices, heights, headings, identities and authored action timing stay unchanged. A proposal that would leave existing content outside the square lists affected items and disables Apply. Apply makes the draft dirty, clears its old review and recomputes derived geometry/timing. Saving creates the next immutable revision through the existing expected-revision/idempotency path. An uncertain save must be reconciled before dependent editing.

## Geometry and compatibility decisions

`LocalGeometry` is explicit scenario content: `modelId: local-horizontal-v2`, a WGS84 longitude/latitude origin, and fixed `halfExtentMetres: 5000`. Coordinates remain geographic; metric calculations use the existing spherical local horizontal approximation around the selected latitude. This implementation supports origin latitudes **80°S–80°N inclusive**, with the **whole square** inside longitude [-180,180] without date-line wrapping and within the renderer's Mercator latitude footprint. It does not claim polar or unrestricted global support. V2 allows 0.1 mm only for coordinate round-trip error at an inclusive square edge. The existing 1 mm boundary-contact semantics remain separate and unchanged.

Choosing a location supplies no ground elevation, terrain clearance or altitude rebasing. Stored altitude values, references and datum identifiers remain intact. A geographic intersection with scene geometry remains visible; the feature never lifts units or cameras to conceal it.

Absent geometry remains historical `local-horizontal-v1`, at 103.85°E / 1.29°N with its original numerical behavior. New revisions with geometry use scenario version 1.6, interactive run/status 1.8, and world/stream 1.11, exported in [contract package v1.14](../../contracts/sentinel/v1.14/README.md). Older content retains its original content-derived version and canonical representation. Strict old readers reject the new field even when null; future models/versions are rejected. Old JSON, hashes, archived contracts, exact pending request bodies and identities are not upgraded in place.

No database migration is necessary: scenario revisions, frozen run snapshots, worlds and checkpoints already persist versioned JSON. The geometry travels inside those existing documents. Editing another draft or a later revision cannot change the frozen run or its recordings; the authority rejects a geometry mutation on an existing mission.

## Ownership and affected paths

| Responsibility | Implementation |
|---|---|
| Supported footprint, historical fallback, geometry model | `backend/app/scenarios/location.py`, `frontend/src/world/localGeometry.ts` |
| Parent-owned validation after nested structural validation | `backend/app/scenarios/{contracts,actions,boundaries}.py`, `frontend/src/contracts/scenarios.ts` |
| Saved revision, review, frozen run | `backend/app/scenarios/{service,review}.py`, `backend/app/commands/contracts.py` |
| Movement, group translations, timing, Patrol/Intercept/outcomes | `backend/app/commands/{kinematics,movement,scheduler,behavior_geometry,behaviors,rts_behavior,engagements}.py`; frontend `world/{movement,directMovement,boundaryGeometry,scriptPlan,scriptAuthoring}.ts` |
| Boundaries and candidate activation | `backend/app/commands/{zone_rules,live_boundaries}.py`, `frontend/src/services/liveBoundaryEditor.ts` |
| Publication, recovery and strict recorded readers | `backend/app/{domain/models,missions/service,world/contracts,world/serialization,api/stream}.py`, frontend `contracts/{decode,interactive,schedule}.ts` and `world/reduce.ts` |
| Draft, preview, pending-save ownership and UI | `frontend/src/services/scenarioClient.ts`, `features/units/ScenarioLocation.tsx`, `features/map/TacticalMap.tsx` |
| Scenario home, guides and provider coverage | `frontend/src/world/scenarioDraft.ts`, `renderers/scene.ts`, MapLibre/Cesium adapters |

Historical nested validators remain strict for old representations. Located nested unit/destination/boundary types validate shape; their owning scenario or frozen world validates the geographic extent. This avoids checking new coordinates against a historical origin before the parent exists. Metric helpers receive the owner explicitly. Geometry equality compares fields rather than JSON property order.

Custom-location runs use their frozen origin for camera home and no longer inherit the interactive Singapore/Southeast Asia camera region. Existing developer fixtures retain their own region policies. Existing map-provider arrangements and attribution are preserved. Regional coverage comes from the installed PMTiles archive's header: outside its bounds, Tactical displays **LOCAL GRID · OUTSIDE MAP PACK**; partial coverage is identified. There is no geocoder, new provider account or additional credential requirement. A mathematically supported location does not guarantee imagery, terrain or 3D content from the configured provider.

## Reproduce

Reusable scenario content is in `frontend/tests/fixtures/scenario-location/`: default, nearby Singapore airbase area, Sydney, and Sydney 20v20, plus expected backend timing output. `scripts/scenario_location_fixtures.py` regenerates these deterministically. The 20v20 fixture uses supported STING Friendly and Lancet-3 Hostile profiles, with 80 existing chained Move actions. Hostiles remain scripted observations; no hostile interception or new combat behavior is introduced.

After regeneration, run `npx prettier --write tests/fixtures/scenario-location` from `frontend/` to apply the repository's pinned JSON formatting. Fixture values and backend timing expectations are unchanged by formatting.

The UI runners save fixtures through the existing scenario API, then load, validate and run exact saved revisions using actual UI controls. They use new foreground Edge contexts and task-owned databases. From `frontend/`:

```powershell
$env:SENTINEL_TEST_BUILD_SUFFIX = '-scenario-location'
node scripts/build-test-bundles.mjs
node tests/scenario-location/ui.mjs location-ui
node tests/scenario-location/extended-ui.mjs location-extended
node tests/scenario-location/configured-ui.mjs location-configured
```

The first two reuse the bounded blank-provider verification build at ports 5381/8181. The configured check uses the existing local provider configuration and canonical assets at 5383/8183, with a bounded external-request count; it never logs credentials. Motion capture uses installed system `ffmpeg` to encode a short browser screenshot sequence. It demonstrates movement and is **not display-FPS evidence**. Helpers refuse occupied ports, stop their owned services and finalize/delete only their owned databases.

See [implementation plan and baseline](PLAN.md), [verification/evidence index](VERIFICATION.md), and the independent [round 1](critic-round-1.md), [round 2](critic-round-2.md) and [round 3](critic-round-3.md) reports with [implementation responses](REVIEW-RESPONSES.md). For the recorded scenario-location source state, final round 3 recommends acceptance at **9.1/10**, with no established unresolved material defect. The full backend/frontend suites and affected browser checks pass; that archived source state matches the final critic's manifest. Raw screenshots, clips and logs live in the external local archive identified in the evidence index; current builds/tests do not depend on it.

This feature does not add timeline scrubbing or replay controls, which remain unavailable in the existing product. Recorded inspection uses the supported Previous demos workflow and strict stored-world readers. It does not resolve the previously documented loaded-Video FPS limitation, intermittent ordinary-3D cold startup, or dense 3D label overlap; see [existing performance limitations](../reports/performance-stability.md).
