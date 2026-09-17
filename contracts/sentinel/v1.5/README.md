# Sentinel internal contracts 1.5 — D1a

Current coordinated backend/frontend release. Archives v1.0–v1.4 are unchanged. This is an internal local-demo contract, not the external drone simulation API or real vehicle control.

- World/stream **1.5** adds optional `scenario`: definition ID, immutable revision, canonical content hash, name and a complete one-to-one placement-ID → instantiated Entity-ID map. World validation requires a corresponding interactive run. Deltas carry the same binding. Generic fixtures and quick demos omit it.
- Existing interactive/status **1.3**, receipts **1.2**, execution read **1.2**, and template/profile values remain unchanged. New custom arrangements use `singapore-local-v2` as the notional movement preset, without claiming manufacturer capabilities. Quick New demo and legacy profile behavior are preserved.
- Separate scenario schema **1.0** appears in `scenarios.schema.json`. A definition contains a name and at most 32 placements: `friendly`, `hostile`, `unknown`. Each has an explicit role (`sentinel` or `observation`), label, ID, WGS84 ellipsoid position and true heading. Only friendly placements may request Sentinel authority. Affiliation alone never creates an Asset/control binding.
- Poses must lie within the existing ±5,000 m local extent around 103.85° E, 1.29° N. Height is 0–5,000 m ellipsoid, heading [0,360). This bounds editing; it is not an aircraft performance or terrain-clearance model.

## Authoring and run interfaces

`GET /api/scenarios` lists latest saved revisions. `POST /api/scenarios` creates a backend-identified definition with `requestId`, `expectedRevision: 0`, and content. `GET /api/scenarios/creations?identity=…` reconciles its immutable receipt.

`GET /api/scenarios/{definitionId}?revision=…` loads an exact revision; omit `revision` for latest. `POST /api/scenarios/{definitionId}/revisions` saves with the expected latest revision. `GET /api/scenarios/{definitionId}/receipts?identity=…` reconciles that save. Concurrent stale saves produce a durable `REVISION_CONFLICT`, preserving all prior revisions. Retry identical content under the same ID returns the original receipt; changed content under that ID conflicts. Request-shape failures occur before admission and have no committed receipt.

`POST /api/interactive/runs` accepts **exactly one** of `templateId` or `scenario: {definitionId, revision, contentHash}`, plus the existing `creationId`. A custom run requires a nonempty saved revision. A ready run, recording, checkpoint, alias, full pinned definition snapshot and creation receipt commit atomically. Global creation reconciliation and the existing acquire/start workflow are reused. End → Run again uses a new creation ID and fresh operational identities while retaining the same immutable source revision.

## Storage and compatibility

SQLite **4** adds `scenario_revisions`, `scenario_receipts` and `scenario_runs` inside the existing repository migration transaction. The head is the maximum committed revision; there is no separately mutable head document. Revision hashes are SHA-256 of backend canonical JSON (including model defaults) and are checked on decoding. Scenario records and run snapshots are separate from immutable recording frames/events/receipts.

Reading v1.4 first validates the archived model, then adapts only the in-memory response to v1.5. Original recording and receipt bytes are not rewritten. Existing older adaptation chains remain. Source-spec hashes remain unchanged. Deploy frontend and backend together; an old strict client must not silently consume new world frames.

Pydantic/JSON schema exports plus semantic checks govern authority bindings, unique identities, reference integrity, extents and receipt evidence. Regenerate with `backend/.venv/Scripts/python.exe scripts/export_contracts.py`, then `npm run contracts:generate` in `frontend`. Both `--check` paths detect drift.

No zone semantics, timeline scheduling, behavior policies, assignments, recommendations, cockpit or catalog expansion ships in D1a.
