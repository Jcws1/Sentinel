# Current architecture

The backend is the sole world/command authority. A mission lock orders validated commits; SQLite atomically persists world, checkpoint and receipt before publication. Versioned readers preserve historical meaning, idempotent request identities survive uncertainty, and recovery resumes from durable evidence. One backend process owns each database.

The frontend session runtime owns one shared transport, immutable current state, selection, command renewal/reconciliation and a bounded interpolation clock. Presentation interpolates committed positions without stale extrapolation. Panes subscribe only while visible and read fresh state when reopened. Renderer instances, cameras, SDK workers and GPU resources belong to the bounded renderer pool.

Tactical uses MapLibre; ordinary 3D and Video use role-specific Cesium presentation. Provider readiness and fallback are explicit. Video has a supplied viewpoint, simulated overlays and preserved height semantics. Standard-map collision remains enabled; Video's unused automatic tileset-collision query is disabled while intersection reporting remains.

Saved scenarios support forty entities, with at most thirty-two controlled actors. The supported 20v20 case has twenty Friendly controlled actors and twenty Hostile observation-only scripted actors. Existing assignment/Intercept eligibility, ordering, boundaries, atomic outcomes and NON-OP persistence remain unchanged.

## Files that remain intentionally

- `backend/app/**/legacy*.py`: strict versioned compatibility readers, reached through current imports.
- `contracts/sentinel/v*/`: immutable historical message packages and current v1.13 exports.
- `backend/drafts/`, unversioned foundation exports and Phase-0 scripts: still used by structural/specification verification.
- Developer fixtures, migration code, worker configuration, font/map notices and test harness entry points: active behavior or verification dependencies.

A module import audit reached every current production frontend/backend module, including dynamic renderer imports. That does not prove every function is indispensable or bug-free; it establishes that deleting entire production files as “legacy” is not justified. The removed experiment and one-off review entry points were outside product imports, build entries and the canonical unit/browser suites.
