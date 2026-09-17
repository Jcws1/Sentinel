# Sentinel internal contracts 1.2

This is the coordinated M1.2 world/stream release. Backend ownership stays in `backend/app/domain/models.py`, `world/contracts.py` and `commands/contracts.py`. Export with `backend/.venv/Scripts/python scripts/export_contracts.py`; generate TypeScript with `npm run contracts:generate` in `frontend`. Deploy the matching backend and frontend together; strict older world decoders reject this release.

World/stream are **1.2**, the optional interactive module is **1.1**, new receipts/current run status are **1.1**. The complete interactive projection travels with each complete world update. `demo.world.json` is a deterministic example of the actual template's initial paused frame. `fixture.world.json` retains the Alpha fixture semantics. Catalog, observed-history and recording metadata versions remain unchanged. External Phase 5 contracts are unchanged.

Archived `../v1/` and `../v1.1/` artifacts remain unchanged. Legacy worlds are validated by their original models and adapted only in memory. Original 1.0 receipts are returned through a strict legacy/current union; they are not rewritten. SQLite remains schema **2**; the existing atomic JSON checkpoint and recording journal hold execution projection 1.1. There is no additional database migration.

| Operation | Route |
| --- | --- |
| Demo availability / active run | GET `/api/interactive/entry` |
| Idempotent creation | POST `/api/interactive/runs` |
| Original creation receipt | GET `/api/interactive/creations?identity={encodedId}` |
| Separate current run/control status | GET `/api/interactive/{missionId}/status` |
| Fresh lifecycle/control/Cancel intent | POST `/api/interactive/{missionId}/intents` |
| Idempotent lifecycle/control/Cancel command | POST `/api/interactive/{missionId}/commands` |
| Idempotent group Move admission | POST `/api/interactive/{missionId}/moves` |
| Original immutable command receipt | GET `/api/interactive/{missionId}/receipts?identity={encodedId}` |
| Bounded executions through a committed frame | GET `/api/interactive/{missionId}/executions?throughFrameId={encodedFrameId}` |

Use canonical query receipt lookup for opaque IDs. Deprecated path aliases cannot represent every ID because browsers normalize paths. Move freezes members, explicit Asset/executor/control-Track/source bindings, grant/binding/busy revisions, origin, endpoint, reviewed running frame, executor epoch, and the original 30-second initial-admission/start deadline. Global frame equality is not required. Cancel uses fresh intent naming one execution and its state revision, including after long pauses. Accepted movement can continue after its initial deadline or lease expiry. Receipt acceptance does not establish motion or completion; the committed world and completion sample do.

Valid admission rejections produce immutable `accepted=false` receipts. Conflicting identity returns 409; malformed schema returns 422; unavailable reads return 404; failed storage returns 503 without committed success. `X-Sentinel-Control` is private session evidence, never copied into frames, checkpoints, requests, receipts, URLs, events or diagnostics. Authority and geometric boundaries are defined in [M1.2 decisions](../../../docs/m1.2/CONTRACT_DECISIONS.md), extending [M1.1 decisions](../../../docs/m1.1/CONTRACT_DECISIONS.md).
