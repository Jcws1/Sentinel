# Sentinel internal contracts 1.3

This coordinated RTS refinement adds direct map orders while preserving the existing local authority, fixed-step movement executor and recording writer. Deploy the matching backend and frontend together. Strict older clients reject world/stream 1.3.

World/stream are **1.3**, interactive module/current status **1.2**, new receipts **1.2**, and execution reads **1.1**. Catalog, observed history and recording metadata retain their existing versions. Archived `v1`, `v1.1` and `v1.2` contracts remain unchanged. External Phase 5 contracts are unchanged.

`POST /api/interactive/{missionId}/direct-moves` accepts a typed `DirectMoveRequest`. It captures explicit selected member bindings, one horizontal anchor, a stored running frame and its original 30-second admission/start deadline, control context and a positive safe-integer logical order. The backend validates every binding/ownership reference before admitting any member. It resolves current committed origins, excludes unavailable members from group geometry, validates endpoints, then atomically supersedes each accepted member's prior movement. Busy members can redirect. Invalid replacements leave valid execution intact. Per-member accepted/skipped receipt outcomes remain immutable and distinct from actual execution progress.

`lastDirectOrder` on each control exposes its persisted highest accepted order and holder/executor/grant context. A returning client allocates above the applicable current-context maximum. New direct executions carry `directOrder`; old execution records remain unchanged. A superseded execution is `Cancelled` with the explicit reason `Superseded by order N.` Older delayed orders receive `ORDER_SUPERSEDED` member outcomes and cannot restore prior destinations. Receipt query lookups continue to preserve opaque IDs, and duplicate lookup precedes new admission checks.

The legacy reviewed `POST /moves` endpoint retains its M1.2 all-or-none semantics. This does not constrain the direct-map UI. Lifecycle, fresh cancellation, lease expiry, revocation, checkpoint and restart policies remain in force.

SQLite schema **3** adds transactionally allocated stable demo aliases. Migration validates and adapts historical frames only in memory and never rewrites their JSON. Original receipt versions 1.0 and 1.1 remain readable through strict historical models. New numbered names are committed consistently; existing names are projected through persistent alias records.

Export with `backend/.venv/Scripts/python scripts/export_contracts.py`; generate TypeScript with `npm run contracts:generate` in `frontend`. Runtime decoding validates both shape and semantic execution/receipt evidence. See [refinement decisions](../../../docs/rts-refinement/CONTRACT_DECISIONS.md) for detailed boundaries.
