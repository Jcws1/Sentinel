# Foundation contracts â€” Phase 0 draft

**Phase 2 authority:** The runnable generic domain is now `backend/app/domain/models.py`. Its current versioned exports are in [`v1.1/`](v1.1/README.md); [`v1/`](v1/README.md) remains the frozen legacy contract, and the product consumes `frontend/src/contracts/generated.ts`. The files beside this README remain the reproducible Phase 0 design record; they are not imported by the product runtime. Ownership below remains applicable. The validation limitations described here refer to the archived draft, not the promoted application.

`backend/drafts/domain.py` is the backend wire-shape authority. `world.schema.json` and `world.generated.d.ts` are generated outputs; `session-view.ts` is handwritten client-only state and runtime ports. This is not a backend app, frontend shell, simulation resolver or renderer implementation.

Ownership:

| Category | Authority | Restrictions |
| --- | --- | --- |
| WorldFrame / Mission / Entity / Track / Asset / Sensor / Zone / Task / Event | Backend | IDs, role associations, lifecycle and source measurements are not edited by views. |
| OperationalCache | Client replica of backend | Live and historical entries are distinct; no replay frame replaces live state. |
| SessionState / PresentationState | Client user intent and complete frame selection | One cursor/selection/filter context for all views; seeking retains last complete frame. |
| WorkspaceState | Frontend layout | Contains view IDs and isolated layout JSON, never world objects. |
| RendererPort | Local runtime | GPU instances, chart handles and cameras remain outside serializable stores. |

Entity is identity, Track is observation, Asset is a managed-resource role. A friendly Entity is not automatically an Asset. A static object can use a manually sourced Track; unlocated entities remain inspectable without fabricated coordinates. Track carries the sole current position. Condition, presence, observation state and resource availability are distinct. Health, drone class and RED/BLUE enums are absent from core fields.

Source mode describes acquisition/import provenance. Opening historical playback does not change it. Mission lifecycle is distinct from simulation run lifecycle, which will be a module-owned projection. Event effective time and recorded time are separate. Sequence is bounded to JavaScript's safe integer range; a long-lived future service must rotate epoch or adopt string sequences before overflow.

Draft validation covers required structure, scalar bounds, extra fields and finite numeric measurements. It is not a complete aggregate validator: calendar timestamps, reference integrity, same-mission membership, dictionary-key/id equality, polygon closure, time ranges and compatible altitude-band references must be added at the backend boundary. Pydantic frozen models prevent field replacement, not deep mutation of nested lists/dicts; publication must use immutable snapshots/copy discipline. Optional backend values currently allow null and omission; canonical export uses `exclude_none=True`. This deliberate draft detail differs from the plan's illustrative omission-only TS shape and does not change external simulation null rules.

The generator normalizes 2020-12 prefixItems into tuple syntax only in memory for json-schema-to-typescript, and gives Pydantic's unbounded JSON extension schema a recursive JSON-only TS type. The stored schema is unchanged. Do not maintain an independently handwritten frontend world model.

Regenerate from repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/export_phase0_domain.py
Push-Location frontend/experiments/docking
node generate-domain.mjs
npm.cmd run build
Pop-Location
```

Before Phase 2, promote the reviewed draft to `backend/app/domain`, add cross-object validation and export FastAPI OpenAPI plus explicit stream models. No streaming, commands, persistence or store reducers have been implemented in Phase 0.
