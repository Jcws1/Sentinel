# Current architecture

The backend is the sole world/command authority. A mission lock orders validated commits; SQLite atomically persists world, checkpoint and receipt before publication. Versioned readers preserve historical meaning, idempotent request identities survive uncertainty, and recovery resumes from durable evidence. One backend process owns each database.

The frontend session runtime owns one shared transport, immutable current state, selection, command renewal/reconciliation and a bounded interpolation clock. Presentation interpolates committed positions without stale extrapolation. Panes subscribe only while visible and read fresh state when reopened. Renderer instances, cameras, SDK workers and GPU resources belong to the bounded renderer pool.

Tactical uses MapLibre; ordinary 3D and Video use role-specific Cesium presentation. Provider readiness and fallback are explicit. Video has a supplied viewpoint, simulated overlays and preserved height semantics. Standard-map collision remains enabled; Video's unused automatic tileset-collision query is disabled while intersection reporting remains.

Saved scenarios support forty entities, with at most thirty-two controlled actors. The supported 20v20 case has twenty Friendly controlled actors and twenty Hostile observation-only scripted actors. Existing assignment/Intercept eligibility, ordering, boundaries, atomic outcomes and NON-OP persistence remain unchanged.

New scenarios own versioned horizontal geometry, frozen into each run and recording. Legacy absence retains the historical origin. The ±5 km square is fixed; origin edits preserve geographic content and reject invalidating changes. Drafts and map viewports never own a running mission's geometry. See [scenario locations](scenario-location/README.md).

## Orchestrator ownership

One Orchestrator pane contains Units/Conductor tabs around the existing scenario client. Shared context and lifecycle controls own no second draft or transport. Internal tab visibility suspends runtime subscriptions while retaining form state; map-picking modes are disarmed on hiding/closing. The selected authoring map is shared, but its camera bookmark remains renderer-owned. Draft selection can include mixed affiliations; existing batch-movement eligibility still requires one known category. `scenarioDeletionImpact` and the scenario client's atomic deletion preserve action dependency rules and never mutate live entities.

`WorkspaceBridge` accepts legacy view aliases and normalizes supplied FlexLayout JSON through `orchestratorLayout.ts`, retaining one editor and a deterministic internal tab without mutating adjacent panes or input JSON. The baseline has no automatic browser layout persistence. See [Orchestrator](orchestrator-ui/README.md) for the workflow and compatibility boundary. No backend schema or historical contract changes accompany this UI change.

## Recovery acceptance

D7's [integrated acceptance matrix](integrated-acceptance/RECOVERY.md) exercises these ownership boundaries with isolated writers. Transport connectivity and source freshness are separate: genuine heartbeats can continue while the simulator stops reporting. The shared presentation then retains committed positions, labels source delay and blocks positional commands/Suggestions. Nonpositional Stop and lifecycle controls retain their existing authority checks. A paused source is not treated as a stalled running source.

The D7 performance follow-up preserves this architecture. Live and nominal
schedule movement copy mutable scalar progress without recursively copying
read-only motion geometry on every tick. Restricted-boundary checks read current
rings each time and avoid coordinate calculations when none exist. There is no
review cache or changed recording representation; strict readers, complete
validation, transaction/publication order and SQLite schema 4 remain. See the
[diagnosis and compatibility boundary](performance-closure/DIAGNOSIS.md).

## Files that remain intentionally

- `backend/app/**/legacy*.py`: strict versioned compatibility readers, reached through current imports.
- `contracts/sentinel/v*/`: immutable historical message packages and current v1.14 exports.
- `backend/drafts/`, unversioned foundation exports and Phase-0 scripts: still used by structural/specification verification.
- Developer fixtures, migration code, worker configuration, font/map notices and test harness entry points: active behavior or verification dependencies.

A module import audit reached every current production frontend/backend module, including dynamic renderer imports. That does not prove every function is indispensable or bug-free; it establishes that deleting entire production files as “legacy” is not justified. The removed experiment and one-off review entry points were outside product imports, build entries and the canonical unit/browser suites.
