# Scenario-location package v1.14

This package exports scenario-owned horizontal geometry. The package number is not an individual message's wire version.

| Representation | With explicit geometry | Historical representation |
|---|---|---|
| Scenario revision, receipt/list containing it, validation review | 1.6 | Content-derived versions through 1.5 |
| Interactive run and HTTP run status | 1.8 | 1.7 or its strict earlier reader |
| World and stream | 1.11 | 1.10 or its strict earlier reader |

`localGeometry` contains required `modelId: "local-horizontal-v2"`, `origin: {longitudeDeg, latitudeDeg}`, and `halfExtentMetres: 5000`. The selected origin is horizontal WGS84 longitude/latitude. It supplies no elevation or altitude conversion. Origins are limited to latitude [-80,80]; the entire square must stay inside longitude [-180,180] without wrapping and the supported Mercator latitude footprint. Runtime aggregate validators enforce these constraints in addition to structural schemas.

Absent geometry retains the exact historical `local-horizontal-v1` origin and calculations. Historical versioned payloads must not acquire this field, even with a null value. Old canonical bytes, request identities, hashes and archived packages are unchanged. New content freezes its geometry into the run, world, recording and checkpoint. The existing JSON persistence model requires no SQL migration.

Unit capacity (40 total / 32 controlled), script capacity (128), movement timing, profiles, boundaries and Intercept rules do not change. See [feature and verification documentation](../../../docs/scenario-location/README.md).

Regenerate from the repository root with `backend/.venv/Scripts/python.exe scripts/export_contracts.py`, followed by `npm --prefix frontend run contracts:generate`. Do not regenerate or edit archived v1.0–v1.13 packages.
