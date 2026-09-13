# Sentinel v3 — implementation plan and delivery status

Status: Phase 3B completed and verified within its bounded scope, ready for user review; substantial map/continuity work brought forward from Phase 4. No subsequent phase is authorised by this document.
Originally reviewed: 10 September 2026. Revised: 13 September 2026.

**Revision note — 2026-09-13:** reconcile the original proposal with the implemented shell, authoritative recording runtime, Phase 3A/3B and approved map-service, regional, attribution and renderer-retention refinements. Current status and evidence are in §10; retained design sketches are explicitly historical. Neither source specification is changed. [Phase 3B review](phase3b/REVIEW.md).

## 1. Basis and recommendation

Read both source documents completely: `Sentinel_v3.md` (2,115 lines) and `RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` (525 lines). The former governs product and internal architecture; the latter governs the external simulation boundary. Neither document is modified by this proposal.

The initial 10 September inspection found only the two specifications. The repository now contains a React workbench, FastAPI/Pydantic mission authority, SQLite recordings, generated contracts, both map adapters and regression suites. The later approved regional refinement adapted compatible v2 cartographic assets and styling through the v3 renderer boundary; provenance and setup are in [the regional review](map-refinement/REVIEW.md). Sentinel v2 remains unchanged.

Use a small monorepo with a React/TypeScript/Vite frontend and a Python/FastAPI/Pydantic backend. Keep one backend mission authority and one frontend session runtime. Every view reads a shared presentation frame derived from that authority. MapLibre and Cesium are disposable projections. Implement the simulation boundary on the backend, including its independent resolver, rather than transporting external drone objects into frontend stores.

Use Zustand vanilla stores, direct MapLibre/Cesium APIs, semantic CSS tokens with Tailwind, selected Radix primitives, Lucide and TanStack Table. FlexLayout React 0.10.8 is selected and implemented; its model is the sole docking authority. TanStack Table 8.21.3 supplies the Phase 3B browser. ECharts remains for future analytics (the Phase 0 experiment is isolated). No custom docking engine, Redux, TanStack Query, deck.gl, plugin runtime or generic event bus is needed.

The user's requested scope makes tabs, splits, basic replay, and one pop-out explicit deliverables, even though section 43 of the product specification places some in its optional tier. Implement recording and adapter contracts early; finish their UI later. Deferring the underlying contracts until the end would risk rebuilding all the views.

## 2. Contradictions, gaps, and decisions

### Product and architecture

| Issue | Proposed resolution | Consequence / gate |
| --- | --- | --- |
| “One world” versus isolated replay and multiple windows | One authoritative world lineage; separate immutable live and historical caches. One session presentation cursor selects the frame consumed by all views. Replicas are caches, never competing authorities. | Replay must never overwrite the live cache. |
| Backend owns replay state, but the operator scrubs locally | Backend owns recordings, frames, run lifecycle, and permitted commands. Browser owns playback speed, play/pause, and requested cursor. Distinguish viewing replay from submitting a `REPLAY` simulation command. | Pausing playback does not issue `HOLD`. |
| Track, Entity, and Asset relationship unspecified | Entity is identity; Track is an observation stream associated with that identity; Asset is a managed-resource role. A friendly track is not automatically an owned asset. | Prevent double counting entities that have both roles. |
| Switchable map and simultaneous maps | A map view has a mode; opening another map view creates another view instance sharing the session context. Cameras are per view; selection/time/filters/overlays are session shared. | Switching affects only the initiating pane. |
| MSL/ellipsoid/AGL | Preserve source reference and datum provenance. Convert through an explicit altitude service before Cesium projection. | An unqualified MSL value must not silently become an ellipsoid height. |
| Exact vertical datum absent from external contract | Record `MSL` with unspecified datum. Use a named, disclosed demo geoid assumption for visual conversion; retain original values. | Approval-stage data decision; unknown conversion is visibly approximate, not terrain clearance evidence. |
| Prediction, assignments, sensors, confidence and coverage have no simulation inputs | Load explicitly authored scenario metadata where appropriate; otherwise show unknown/unavailable. | Do not infer tasking, sensor confidence, readiness, or predictions from proximity/team/health. |
| Meaning of Vertical Profile horizontal axis | Use radial horizontal distance from an explicit fixed mission reference point or operator-selected reference entity, with altitude on the vertical axis. | Label origin, units, reference time and altitude datum. This is not a terrain cross-section. |
| Stream ordering, reconnect, deletes, and errors unspecified | Versioned atomic snapshots/deltas with stream epoch, sequence, mission identity, and resnapshot on gaps. | Never merge updates from different missions or historical seek requests. |
| “What Sentinel believed” versus late corrections | Record effective time and recorded time plus monotonic sequence. Hackathon replay follows committed frames and makes correction events visible. | Full bitemporal queries deferred; overlapping historical corrections need deterministic precedence. |
| Performance “modest” versus contract maxima | Separate interactive demo budget from compatibility load tests. | A valid 10,000-drone snapshot can yield 25 million opposing pairs; spatial indexing cannot reduce genuinely dense output. |
| Map/imagery/terrain/building sources unspecified | Configured providers with attribution and a tested failure fallback. Primary urban demo plus Mojave and tropical smoke fixtures. | Accounts, coverage, licenses, network access and vertical data must be checked early. |
| Scheduling semantics of `execute_at` unspecified | Treat as earliest allowed sample time; evaluate submitted batches synchronously under the published operation. | Do not create a wall-clock scenario scheduler by implication. |
| Delivery time, team capacity, target hardware unspecified | Use ordered, acceptance-gated phases rather than invented date estimates. | Adopt provisional UI performance budgets below and validate on the demo laptop. |

### Submitted simulation contract: preserve text, document interpretation

1. **Fixture prose conflict (§7):** introduction says probabilities 1 and 0; JSON contains one I→I rule with probability 1, and the explanation/golden response show mutual effects. Use the JSON and golden response as the fixture; record the prose inconsistency.
2. **Lifecycle conflict (§8):** aborted `RESUME` is specified as both `RUN_NOT_HELD` and `RUN_TERMINAL`. Propose the more specific `RESUME` row taking precedence, but obtain organiser clarification before claiming exact edge-case conformance. Keep the policy isolated and tested.
3. **Missing transitions:** no-run `HOLD`/`ABORT`, held `START`/`HOLD`, and failed-run transitions lack a complete matrix. Propose 409 for unspecified transitions with a documented provisional code; do not describe those codes as submitted requirements.
4. **Pure function versus stateful service:** the resolver can be pure for a validated batch; lifecycle, idempotency, immutable profiles and recording require a stateful application service. Separate them.
5. **Error envelope cannot always be constructed:** missing/invalid mission ID, command ID or calibration identity makes the required response fields unavailable. Generic null rejection refers to requests; success responses explicitly require null error fields. Propose a separate minimal error envelope when identifiers cannot be recovered, pending clarification; preserve the specified envelope whenever possible. FastAPI's default 422 payload is not contract compatible.
6. **Canonicalisation/first-error order:** only object-key canonicalisation is explicit; input array permutation must leave domain outcomes unchanged, but need not be an identical idempotency payload. Define recursive key ordering, finite number encoding, and prescribed field traversal; sort timestamp keys and inspect arrays in supplied order for validation. Reject duplicate JSON keys before ordinary parsing discards them. Clarify numeric canonicalisation and error-code vocabulary with organisers.
7. **Calibration completeness:** “ordered class pair that can occur” may mean all input classes or only eligible opposing pairs. Proposed interpretation is all actually eligible pairs across the whole request; reject duplicate rules even if unused and allow unused unique rules. Clarify before freezing tests. Validate all supplied fields even on `HOLD`/`ABORT`; evaluate no outcomes for those commands.
8. **Terminal state wording:** §5.3's zero-health rule could turn an already `REMOVED` drone into `DISABLED`; response text also requires unchanged rows for nonparticipants. Preserve input `DISABLED`/`REMOVED` for nonparticipants; apply ACTIVE→DISABLED only to participating active drones reaching zero.
9. **Interaction identity:** external interaction hash excludes command ID, so later commands can collide at the same timestamp/pair. Preserve that external hash; internal event identity also includes run and command. Do not deduplicate solely on the external hash. Delimiter characters are permitted in IDs, so never reuse the specified pipe-joined hashing format for internal compound keys; retain it exactly for external results.
10. **Cross-command time/source/profile rules:** overlaps, backward timestamps, discontinuity after disappearance, source-mode changes and run identity are not fully defined. Propose one run per mission for v1, stable profile identity during that run, last observed output as discontinuity comparison, and revisioned frames for overlaps; seek uses recorded sequence as tie-breaker. Keep these as open compatibility decisions, not extra undocumented validation restrictions.
11. **Global geometry:** polygon interior across the antimeridian/poles and rounding ties are unspecified. Propose documented planar lon/lat polygon containment with inclusive boundary and the exact specified spherical distance for resolution; use non-wrapping synthetic demo areas. Do not substitute Cesium's distance calculations or a different geodesic. Clarify global edge cases rather than silently rejecting otherwise allowed coordinates.
12. **Scale:** 10,000 timestamps × 10,000 drones permits 100 million samples before results. Set interactive demo sizes, but do not invent a lower compatibility maximum. Use a sparse maximum-size fixture and separately measure dense-output limits; full worst-case completion is not established by a sparse test.

These gaps need a small compatibility decision record/organiser clarification, not edits to either specification. Core shell and domain work can proceed after architecture approval while the external edge cases are resolved.

## 3. Repository boundaries and original layout sketch

The tree below is the original architectural sketch, not a scaffold checklist. Actual wire authority is `backend/app/domain/models.py` plus `world/contracts.py`; storage is `recording/sqlite_repository.py`. Layout belongs to `features/workspace/workspaceBridge.ts` and FlexLayout, not a second Zustand layout store. Phase 3B adds `recording/history.py`, `missions/observation_fixture.py`, `world/{entityRows,observedHistory,observedSegments}.ts` and `features/entities/*`. Replay/commands/analytics paths remain deferred.

```text
frontend/
  package.json, package-lock.json, tsconfig.json, vite.config.ts
  index.html, popout.html
  src/
    main.tsx
    app/ App.tsx, runtime.ts, shell/{Shell,ActivityBar,StatusBar}.tsx
    domain/ model.ts, refs.ts, units.ts
    contracts/ generated.ts, decode.ts
    state/ worldStore.ts, sessionStore.ts, workspaceStore.ts
    world/ selectors.ts, presentation.ts, historyCache.ts
    services/ api.ts, worldStream.ts, commandClient.ts, replayClient.ts
    renderers/
      contracts.ts, scene.ts, symbology.ts, camera.ts, altitude.ts
      providers.ts
      maplibre/ MapLibreAdapter.ts, layers.ts
      cesium/ CesiumAdapter.ts, objects.ts
    features/
      workspace/ WorkspaceHost.tsx, viewRegistry.ts, docking.ts
                 flexLayoutBridge.tsx, windowContext.ts
      map/ MapView.tsx, MapModeSwitch.tsx, MapToolbar.tsx
      entity-detail/ EntitySummary.tsx, EntityInspector.tsx
      entity-browser/ EntityTable.tsx
      command-picture/ CommandPicture.tsx, selectors.ts
      vertical-profile/ VerticalProfile.tsx, projection.ts
      timeline/ Timeline.tsx, PlaybackControls.tsx
    modules/counter-uas/ metadata.ts, SimulationControls.tsx,
                         SimulationEventDetails.tsx
    components/ shared/
    styles/ tokens.css, global.css, workspace.css
  tests/ unit/, integration/, e2e/
backend/
  pyproject.toml
  app/
    main.py
    api/ missions.py, stream.py, replay.py, simulation_v1.py
    domain/ models.py, events.py
    missions/ service.py, commands.py
    world/ projector.py, distribution.py
    recording/ repository.py, sqlite_repository.py
    replay/ service.py
    adapters/simulation_v1/ mapping.py, identities.py
    simulation/ schemas.py, parsing.py, validation.py, resolver.py,
                geometry.py, lifecycle.py, canonical.py, service.py
  tests/ domain/, compatibility/, integration/
contracts/
  sentinel/ openapi.json, stream.schema.json
  simulation/ v1.request.schema.json, v1.response.schema.json,
              compatibility-decisions.md, fixtures/
docs/
  Sentinel_v3.md                       # unchanged
  RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md  # unchanged
  IMPLEMENTATION_PLAN.md
  demo-runbook.md                      # later
scripts/ export_contracts.py
```

Keep modules as a few files until complexity warrants folders. Standard npm plus a Python virtual environment is sufficient. Backend Pydantic models export OpenAPI and explicit JSON Schemas; the established `json-schema-to-typescript` generator creates frontend types, and Ajv plus semantic guards validate ingress. Export and generation checks detect drift. Observed history has its own v1 schema. External simulation contracts remain separate. JSON Schema alone cannot enforce polygon validity, lifecycle or cross-sample rules.

The domain types below describe the proposed generated data shape, not a second handwritten copy of Python API types. Frontend-only session/workspace types remain handwritten. Runtime decoding is separate from TypeScript typing; use generated JSON Schema with Ajv at ingress if needed, with reducers also checking identity/order invariants.

Import direction: features → selectors/session actions → domain/contracts. Renderers → scene contracts only. Simulation code stays in backend simulation/adapter and typed counter-UAS presentation metadata. Domain has no imports from React, Zustand, map engines, docking libraries, or external simulation DTOs.

## 4. Original domain sketch and authoritative contracts

**Historical design sketch:** the following types explain the original model, but are not the implemented wire contract. Use [current contract notes](../contracts/sentinel/v1/README.md), backend Pydantic models and `frontend/src/contracts/generated.ts` for exact fields/enums/validation. Do not reintroduce handwritten duplicate domain DTOs or the illustrative dock tree below. Session filters/selection/time remain frontend-owned; FlexLayout owns layout.

Omission means unknown/not supplied; zero is a known measurement. Internal IDs are opaque and backend allocated, with stable source mappings. UTC strings use millisecond precision on the wire; epoch milliseconds are derived for charts. Generic domain classifications are namespaced strings, not external drone-class enums.

```ts
type Id = string;
type UtcInstant = string;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Extensions = Record<string, Json>; // namespaced, validated by owning module
type Affiliation = 'friendly' | 'hostile' | 'neutral' | 'unknown';

interface Altitude {
  metres: number;
  reference: 'MSL' | 'ELLIPSOID' | 'AGL';
  datumId?: string; // absence means unspecified; never silently WGS84/geoid
}
interface Position3D {
  longitudeDeg: number;
  latitudeDeg: number;
  altitude: Altitude;
}
interface SourceRef {
  id: Id;
  kind: 'simulation' | 'sensor' | 'manual' | 'import';
  mode: 'simulated' | 'live' | 'replay';
  externalId?: string;
  recordingId?: Id;
}
interface Provenance {
  source: SourceRef;
  effectiveAt: UtcInstant;
  recordedAt: UtcInstant;
}
interface Mission {
  id: Id;
  name: string;
  domain: string; // e.g. counter-uas; not a platform enum
  lifecycle: 'draft' | 'active' | 'completed' | 'cancelled';
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
  zoneIds: Id[];
  referencePoint?: Position3D;
  extensions: Extensions;
}
interface Entity {
  id: Id;
  missionId: Id;
  label: string;
  kind: string; // physical-object, incident, facility, etc.
  classification?: { scheme: string; code: string; label?: string };
  affiliation: Affiliation;
  condition: 'operational' | 'degraded' | 'non-operational' | 'unknown';
  presence: 'present' | 'unobserved' | 'removed';
  provenance: Provenance;
  extensions: Extensions;
}
interface TrackSample {
  timestamp: UtcInstant;
  position: Position3D;
  velocity?: { speedMps: number; headingTrueDeg: number; verticalSpeedMps?: number };
  confidence?: number; // [0,1], only if supplied with provenance
  discontinuity: boolean;
}
interface Track {
  id: Id;
  missionId: Id;
  entityId: Id;
  source: SourceRef;
  state: 'tracking' | 'stale' | 'ended';
  latest: TrackSample;
  historySeriesId: Id;
  predictedSeriesId?: Id;
}
interface Asset {
  id: Id;
  missionId: Id;
  entityId: Id;
  availability: 'available' | 'assigned' | 'unavailable' | 'unknown';
  capabilityCodes: string[];
  taskIds: Id[];
  provenance: Provenance;
}
interface Sensor {
  id: Id;
  missionId: Id;
  entityId?: Id;
  modality: string;
  coverageZoneIds: Id[];
  status: 'available' | 'unavailable' | 'unknown';
  provenance: Provenance;
}
type LonLat = [longitudeDeg: number, latitudeDeg: number];
interface Zone {
  id: Id;
  missionId: Id;
  label: string;
  purpose: string; // simulation-area, restricted, defended, search-area...
  geometry: { type: 'Polygon'; coordinates: LonLat[][] };
  altitudeBand?: { lower: Altitude; upper: Altitude };
  validFrom?: UtcInstant;
  validUntil?: UtcInstant;
  provenance: Provenance;
}
interface Task {
  id: Id;
  missionId: Id;
  type: string;
  status: 'proposed' | 'accepted' | 'active' | 'completed' | 'cancelled';
  assetIds: Id[];
  subjectEntityIds: Id[];
  zoneIds: Id[];
  provenance: Provenance;
}
interface SentinelEvent {
  id: Id;
  missionId: Id;
  sequence: number;
  effectiveAt: UtcInstant;
  recordedAt: UtcInstant;
  type: string; // namespaced; simulation.interaction is module-owned
  severity: 'info' | 'warning' | 'critical';
  entityIds: Id[];
  zoneIds: Id[];
  taskIds: Id[];
  location?: Position3D;
  source: SourceRef;
  detailRef?: Id; // raw audit details fetched on demand
  extensions: Extensions;
}
interface WorldFrame {
  mission: Mission;
  frameId: Id;
  streamEpoch: Id;
  sequence: number;
  effectiveAt: UtcInstant;
  entities: Record<Id, Entity>;
  tracks: Record<Id, Track>;
  assets: Record<Id, Asset>;
  sensors: Record<Id, Sensor>;
  zones: Record<Id, Zone>;
  tasks: Record<Id, Task>;
  recentEvents: SentinelEvent[]; // bounded; event API holds full history
}
```

No duplicate mutable position on Asset or Entity. The implemented displayed-track selector restricts sources, prefers non-ended tracks, then newest observation and stable Track ID; this is deterministic presentation choice, not sensor fusion. Fusion remains deferred. Static entities can have a manually sourced Track. A generic Entity may exist without position and remains available in tables/details without an invented map point. Bounded observed history is source-attributed and read separately from the hot world dictionary; prediction series remain deferred.

`Track.state` describes observation quality, `Entity.condition` physical/functional condition, `Entity.presence` observed presence, and `Asset.availability` resource availability. These concepts must not collapse into one overloaded status. A disabled but observed vehicle can still have an observed track. A removed entity remains inspectable in recording history.

```ts
type ObjectRef = { kind: 'entity' | 'track' | 'asset' | 'zone' | 'event' | 'task'; id: Id };
interface SelectionState {
  missionId: Id;
  items: ObjectRef[];
  primary?: ObjectRef;
  revision: number;
}
type TimeState =
  | { mode: 'live'; followLatest: true }
  | { mode: 'replay'; recordingId: Id; requestedAt: UtcInstant;
      resolvedFrameId?: Id; resolvedAt?: UtcInstant;
      seekGeneration: number; playing: boolean; rate: number };
interface FilterState {
  affiliations: Affiliation[];
  classificationCodes: string[];
  sourceIds: Id[];
  zoneIds: Id[];
  showUnobserved: boolean;
  showRemoved: boolean;
}
interface OverlayState {
  zones: boolean;
  history: boolean;
  predictions: boolean;
  assignments: boolean;
  eventMarkers: boolean;
  historyWindowSeconds: number;
}
interface SessionState {
  id: Id;
  missionId?: Id;
  selection?: SelectionState;
  time: TimeState;
  filters: FilterState;
  overlays: OverlayState;
}
interface CameraIntent {
  focus: Position3D;
  groundSpanM: number;
  headingTrueDeg: number;
  focusEntityId?: Id;
}
type ViewDescriptor =
  | { id: Id; type: 'map'; mode: 'tactical' | '3d'; camera?: CameraIntent }
  | { id: Id; type: 'entity-detail'; entityId: Id }
  | { id: Id; type: 'command-picture' | 'timeline' | 'entity-browser' }
  | { id: Id; type: 'vertical-profile'; originEntityId?: Id };
interface WorkspaceState {
  schemaVersion: 1;
  sessionId: Id;
  activeModule: string;
  activeViewId?: Id;
  views: Record<Id, ViewDescriptor>;
  layout: { engine: 'flexlayout' | 'golden-layout'; version: string; config: Json };
  popouts: Record<Id, { viewId: Id; status: 'opening' | 'open' | 'closed' }>;
}
```

Workspace types are a minimal view registry plus an isolated library layout payload, not another competing layout tree. Docking runtime objects remain outside serializable stores. Selection resolves Track/Asset references to the same Entity for highlighting. An inspector pins entity identity; selection may subsequently change without repurposing its tab. Missing or filtered selections are reported, not silently cleared. A mission switch atomically resets mission-scoped selection, playback, cached frames and old subscriptions; mission-specific inspectors close or show explicit context loss.

Typed counter-UAS metadata lives in `modules/counter-uas`, with backend equivalents owned by the adapter: e.g. namespace `sentinel.simulation.v1` holds class, reported health/status, run ID and audit reference. Core treats it as an opaque extension. Health is neither a universal field nor a readiness formula.

## 5. Exact adapter responsibility

### Processing path

`external JSON → strict compatibility validation → mission/run service → pure resolver → persisted external response + audit → Sentinel adapter → atomic world frames/events → REST/WS → shared selectors → views`.

The compatibility endpoint accepts and returns the submitted shape unchanged. The normal Sentinel world endpoints expose only internal models. Store original request plus canonical digest, response, command acknowledgement, calibration content/identity and resolved output before publishing. Use SQLite transactions for the hackathon, with one authoritative backend process and serialized per-mission command processing. Never announce success over the stream before recording commits. On retry, return the stored response without duplicating events or frames. A rejected command must not change an existing healthy run to failed merely because the error response says `FAILED`.

### Mapping table

| External input/output | Internal projection |
| --- | --- |
| `mission_id` | Stable mission lookup; preserve external ID in source mapping. Do not derive run lifecycle from Mission.lifecycle. |
| `command_id`, action, issued/execute times | Stored command audit; accepted command event with both times; module run projection and pending/acknowledged UI. |
| `SIMULATED` / `REPLAY` | Source mode `simulated` / `replay`; replay-source imports remain separate from current live operational state. Viewing a recording does not rewrite its original source provenance. |
| `drone_id` | Stable entity and track mapping keyed by structured `(mission, source, external drone ID)`. Preserve label and raw ID; no parsing team from ID text. |
| `team` | RED→hostile, BLUE→friendly, NEUTRAL→neutral, UNKNOWN→unknown, within this adapter only. |
| `class` | Classification `{scheme: 'simulation-v1.drone-class', code: input.class}` and typed module detail. Never use it as a core Entity kind. |
| longitude/latitude/altitude | TrackSample Position3D, WGS84 degrees and `{metres: altitude_m, reference: 'MSL'}`. No conversion of stored source altitude. |
| Input timestamp | Sample/event effective time; ingestion time is separately recorded. Sort by parsed UTC instant. |
| `health`, output `health_after` | Module simulation metadata. Use resolver output after the timestamp, not repeated frontend arithmetic. |
| ACTIVE / DISABLED / REMOVED | Operational / non-operational condition and present / removed presence as appropriate. Observed ACTIVE does not imply asset availability. Missing from a snapshot means unobserved/stale, never removed or zero health. |
| `area` | Zone with purpose `simulation-area`, exact polygon and inclusive MSL band. Do not automatically label it defended or sensor coverage. |
| `resolution` | Backend simulation configuration/audit only. No renderer-side eligibility computation. |
| Calibration/profile/evidence | Immutable simulation audit plus module inspector label. Keep evidence status visible in simulation details; no generic confidence score conversion. |
| `interactions` | One generic namespaced event per interaction, including NO_EFFECT. Entity references replace red/blue fields in the core envelope. Fetch original outcome/effects/draws from typed detail. |
| `interaction_id` | Preserve exact external ID in detail; allocate internal event identity from run/command/external ID tuple. |
| `location_id` | Opaque simulation bin in detail, never a coordinate or zone/entity identity. Optional event point uses the input pair midpoint and remains explicitly derived. |
| `drone_health` | Join against original samples by ID; include every input drone, including out-of-area and unchanged rows. Responses alone lack position/class/team and cannot reconstruct the world. |
| `state_discontinuity` | Correction event and sample break; accept the caller's next supplied snapshot, do not carry prior output health forward silently. |
| `run_status` | Module state running/held/aborted/failed; ABORT finalizes the recording without asserting the whole Mission is cancelled. |

Assets, sensor zones and tasks come from a separate explicit scenario manifest or backend domain data. BLUE drones only become Asset roles when that manifest identifies them as managed resources. This preserves a usable fleet view without pretending the external contract supplies ownership or assignments.

Build each timestamp frame by joining validated input and output; write all simultaneous changes atomically. Store pre-resolution samples in audit and expose the post-resolution frame at the exact timestamp. Retain discontinuities as boundaries. An absent observation can retain its last-known position with a stale indication, but normal present-track counts exclude it. No interpolation through missing/removed/discontinuous periods. `HOLD`/`ABORT` generate command records and lifecycle state updates, no supplied-sample outcomes or invented motion. `RESUME` uses supplied health values. Pure resolution and external hashing, probability, grid and health math stay entirely in simulation service code.

## 6. State, transport and replay boundaries

| Boundary | Owner and contents | Update rule |
| --- | --- | --- |
| Authority | Backend Mission, role records, run state, command journal, events, recordings | Validated commands/source ingestion only; commit then distribute. |
| Client operational cache | `worldStore`: latest live frame, connection metadata; bounded historical cache | Only decoded backend snapshots/deltas and replay responses write here. |
| Client session | `sessionStore`: mission context, selection, time cursor, filters, overlays | Explicit user actions; replay seek never writes to live frame. |
| Workspace/UI | WorkspaceBridge plus FlexLayout: view registry, active module, dock layout, ephemeral labels and renderer pool | FlexLayout is the only layout authority; renderer resources never enter serialized operational state. |
| Renderer runtime | Adapter instances, GPU objects, camera handles, hover hit results | Local disposable handles; emit intents, never mutate world. |

Implemented REST: `GET /api/missions`, `GET /api/missions/{id}/world`, `GET /api/missions/{id}/events?after=...`, `GET /api/recordings/{id}` and `GET /api/missions/{id}/observed-history?entityId=...&frameId=...&windowSeconds=60`. The last endpoint returns bounded observed samples anchored to an immutable committed frame, not replay playback. Frame-at-time lookup, general replay series, detailed event payloads and `POST /api/compat/simulation/v1/resolve` remain proposed. Domain command routes will be added only for supported backend actions; the frontend will not implement simulation lifecycle rules.

WebSocket `GET /api/missions/{id}/stream` always starts with a complete atomic snapshot, then typed atomic deltas carrying mission, epoch, sequence and predecessor identity. Snapshot capture and queued subscription registration share the mission lock. Bounded queues request resynchronization on overflow; every reconnect resnapshots. There is no resumable backlog. Heartbeats report the last sequence actually sent on that socket. Cache removal remains distinct from Entity.presence=removed; use the generated stream schema for exact fields.

One WebSocket per session runtime, not per pane. Ignore duplicate sequence numbers; an epoch change or sequence gap triggers resnapshot. Display stale/disconnected status and inhibit new simulation commands until reconnected. An unknown command outcome is reconciled using the same command ID, not a new request that might repeat effects. Cancel requests on mission change and tag replay seeks with generations to discard slow obsolete responses.

The shared runtime presentation is the only view-facing world read path. Live and historical frame caches remain separate. Future replay must retain the last complete frame during seeking, continue live ingestion separately and provide Return to live; seeking/playback is not implemented. Phase 3B adds one selected-entity history owner and eight immutable cached results shared across panes. At most one read is in flight; newer frames coalesce. An older compatible result is displayed only with its actual through-time, trimmed to the current window and never beyond presented time. Identity/epoch changes cancel obsolete work.

Initially use discrete frame playback for correctness. Later position interpolation may operate in the shared presentation layer using bracketed samples and a common clock; condition, presence, health, events, classifications and assignments always change discretely. No renderer's clock may advance mission time. Do not synthesize predictions from future replay data. Persist initial world state, role metadata, subsequent frames and event references so replay reconstructs more than drone positions. SQLite indexed checkpoints/frames are sufficient; no Kafka or event-sourcing framework.

## 7. Renderer adapters and continuity

```text
backend → cache → presentation frame + session filters/overlays
                             ↓
                 shared scene/symbology selectors
                    ↙                    ↘
             MapLibreAdapter        CesiumAdapter
                    ↘                    ↙
                  pick/camera intents → session/view actions
```

```ts
interface RendererAdapter {
  mount(host: HTMLElement, emit: (intent: RendererIntent) => void): Promise<void>;
  apply(scene: SceneProjection): void;
  captureCamera(): CameraIntent;
  restoreCamera(intent: CameraIntent): void;
  resize(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
type RendererIntent =
  | { type: 'select'; target?: ObjectRef; additive: boolean }
  | { type: 'camera'; camera: CameraIntent };
// SceneProjection: immutable frame key, display objects with stable refs,
// positions, resolved altitude quality, symbols, paths, zones and relationships.
```

SceneProjection is a derived read model, not another authoritative store. Share visibility, symbology meaning, selection, history window and relationship IDs; adapt only rendering geometry. MapLibre uses batched GeoJSON sources/layers and stable feature IDs instead of one DOM marker per track. Cesium uses keyed objects initially; measure before moving to lower-level primitives. GeoJSON longitude comes first. UI icons are separate from operational affiliation shapes/labels.

Switch transaction: capture neutral camera intent → preserve session state and view ID → suspend/release the previous adapter through the bounded renderer pool → acquire a retained adapter or lazy-create one → apply the latest complete scene/settings before resuming → restore equivalent area. Workspace-tab returns retain their own camera; mode switches transfer geographic intent and preserve private pitch bookmarks. Async generation guards prevent stale attachment. Independent panes have independent cameras. Closed, failed or incomplete viewers are disposed, not retained.

Camera equivalence is operational, not an exact pitch/zoom conversion: preserve focus, ground span, heading, and optionally selected entity. Use a visible-earth intersection for the Cesium focus, falling back to last focus when looking at the sky. Refit span for pane aspect ratio. Retain private per-mode pitch bookmarks where useful; never export Cesium camera objects into domain state. Proposed test tolerance: focus within 5% of viewport ground span and target remains visible for normal demo views.

Altitude conversion: Cesium's geographic conversion expects height above ellipsoid ([official Cartesian3 documentation](https://cesium.com/learn/cesiumjs/ref-doc/Cartesian3.html)). Convert MSL H using a named geoid offset N to ellipsoid h=H+N; AGL needs terrain height plus offset in a known reference. Cache conversions by provider/version and location. Keep unresolved conversions explicitly marked and preserve source MSL values in labels and Vertical Profile. Until a geoid is configured, any h≈H visual fallback must be labeled approximate and is not a completed altitude-fidelity acceptance criterion. Never clamp airborne tracks to terrain. Zone floors/ceilings use the same conversion; missing altitude bands remain surface areas rather than fabricated volumes.

Provider configuration describes imagery/style/terrain/3D Tiles URLs, attribution, token references and vertical model; no provider fields enter Entity. Production Workers/Assets/Widgets/ThirdParty deployment is tested. The approved [retention policy](map-responsiveness/REVIEW.md) supersedes unconditional hidden disposal: at most four slots including pending imports, two hidden instances at most one per projection, 120-second TTL and 512 MiB combined accounted tileset-cache budget. This is not a hard process/GPU memory limit. Hidden work is suspended; oldest hidden entries evict first, close/failure disposes immediately and excess visible capacity is explicit. Pane lifecycle owns resizing and cleanup.

Current environmental choices: local Protomaps/ESA WorldCover vector and Mapterhorn DEM archives with local glyphs/sprites for Tactical; optional MapTiler Cloud; Cesium ion standard imagery/terrain/OSM buildings, or direct Google photorealistic tiles as an alternative base without duplicate ground/buildings. Required logos/dynamic credits stay alongside content; full acknowledgements are under Settings → Credits. [Setup](MAP_SERVICES_SETUP.md), [regional review](map-refinement/REVIEW.md), [attribution](map-attribution/REVIEW.md). Singapore/nearby Southeast Asia presentation bounds are 99°E–105.5°E, 1.5°S–7°N, span 150 m–1,100 km, applied only to Synthetic Tactical and Synthetic Observations. They change neither domain coordinates/eligibility nor source resolution and do not guarantee a tile-request boundary. Alpha/Bravo remain unchanged.

## 8. Workspace library evaluation

The original comparison below informed the completed Phase 0 spike. FlexLayout React 0.10.8 was selected; see [Phase 0 acceptance](phase0-review.md). Golden Layout is no longer a pending choice. The isolated workspace harness proved tab/split/pop-out feasibility separately from operational state.

| Criterion | FlexLayout React | Golden Layout v2 |
| --- | --- | --- |
| React integration | React-focused component factory; natural fit for existing view components | Framework-neutral; documented virtual component binding requires an integration layer |
| Tabs and splits | Built-in tabsets, movement and splitters | Built-in docking layout; viable alternative |
| Pop-out model | React portals into another same-origin document, sharing the opener runtime | Child-window setup and explicit state propagation |
| State impact | Same session/store can feed the POC without a synchronization protocol | Each runtime needs backend-derived cache and coordinated UI context |
| Main risks | Owner-document handling, background throttling, chart/renderer lifecycle, opener dependency | React binding effort, child bootstrap, reconciliation and close lifecycle |
| Proposed fit | First candidate for hackathon | Fallback if the same acceptance spike demonstrates materially better behavior |

FlexLayout documents a same-origin popout host, shared opener JavaScript and limitations involving document ownership/timers. These support a small shared-runtime proof of concept, but do not establish independent-window resilience. [FlexLayout README](https://github.com/caplin/FlexLayout/blob/master/README.md).

Golden Layout recommends virtual component binding for frameworks. Its pop-outs require application-managed state propagation; EventHub broadcasts user messages and does not solve state ownership. [Framework integration](https://golden-layout.github.io/golden-layout/frameworks/), [pop-out documentation](https://golden-layout.github.io/golden-layout/popouts/).

**Implemented decision:** retain FlexLayout and its single model/bridge ownership. Tab ordering, targeted context menus, Open to Side, pointer/keyboard resize and real simultaneous maps are regression-tested. The operational shell has no pop-out entry point; the harness's counter/chart/window checks do not establish operational map or analytic window readiness. Do not replace this architecture with an independent child runtime by following the alternative proposal below.

First pop-out is Command Picture or Vertical Profile, not Cesium. With FlexLayout, use the same session runtime and backend stream; no BroadcastChannel is needed for that portal. Obtain document/window from the host element and point Radix portal containers, chart resize and keyboard listeners there. If opener closes, the POC session ends; independent restart/multi-monitor restoration is deferred. Popup failure leaves the view docked and gives an actionable message.

If Golden Layout wins, independent child runtimes each derive cache from the backend and need a small parent-coordinated UI channel carrying session/mission ID, revision, selection, cursor and filters. Parent assigns UI revisions, bootstraps child state and prevents echo loops; never broadcast authoritative world writes. This added work is a reason to prefer FlexLayout for this scope, not a reason to misrepresent its pop-out as an independent app.

## 9. UX and analytic contracts

Approved layout: compact logo/name plus mission breadcrumb and right-aligned UTC+8 wall clock, narrow Activity Bar, workspace tabs and compact connection status. Wall time remains distinct from mission/replay time. There is no separate mission strip or redundant pane heading. Tab context menus own Split/Open to Side/Close actions; existing tab close buttons remain. Tactical/3D, Select/Pan/Recenter and Layers remain contextual map tools. Monochrome chrome uses neutral selection; saturated color carries domain affiliation. Unimplemented modules remain unavailable. See [chrome refinement](chrome-refinement/REVIEW.md).

Selection opens a compact summary with ID, affiliation, timestamp/staleness, source, altitude and any actually supplied speed/assignment. Open Details creates a tab. Provide keyboard entity browsing and focus-visible controls; affiliation uses shape and text as well as color. Define semantic tokens once for both engines, charts and chrome. Check 1440p/4K scaling and readable density at common display scaling settings.

Command Picture initial widgets: (1) present tracks by affiliation/classification, (2) managed resources by explicit availability including unknown, (3) recorded events over a selected time range. Titles state mission/time and whether filtering is applied. Do not label simulation health as fleet readiness or input presence as sensor detection confidence. Global mission totals and filtered counts must be visibly distinguished.

Vertical Profile consumes the same visible tracks and frame, expresses altitude in a common reference, and highlights the shared selection. Radial distance from the declared origin avoids a hidden projection axis; show trajectories with breaks and timestamp tooltips. Exclude or visibly mark positions whose altitude cannot be converted to the chart's chosen reference. Provide it as a reusable view component inside Command Picture and as a workspace tab/split/pop-out, without duplicating computation.

Timeline provides event markers, discrete timestamp selection, play/pause/rate and Return to live. Distinguish playback controls from simulation lifecycle buttons with separate labels and placement. A visible replay banner and pending-command indicator prevent confusion. Avoid a persistent large inspector or a dashboard of individual vehicle cards.

## 10. Phased delivery and remaining work

Dependencies below are incremental. Completed work is distinct from remaining acceptance and future proposals. Earlier reports record the scope/date at which they were written; their old statements that later phases are deferred are superseded by this status register, not erased from evidence.

### Phase 0 — contracts and docking decision

**Complete within bounded acceptance.** [Review and 43 boundary checks](phase0-review.md). FlexLayout selected and isolated window experiment verified. External simulation ambiguities remain explicitly provisional in `contracts/simulation/compatibility-decisions.md`; this was permitted by the phase gate, not full conformance signoff.

- **Files/modules:** `contracts/simulation/compatibility-decisions.md`, initial schemas/fixtures; `docs/demo-runbook.md` prerequisites; temporary `frontend` docking spike; backend domain model draft.
- **Dependencies:** React, TypeScript, Vite; evaluate `flexlayout-react` and `golden-layout` separately, plus ECharts for the plot probe. Remove the losing candidate before the shell lands.
- **Interfaces:** ViewDescriptor, SessionState, layout bridge; simulation edge-case decision table; altitude/provider configuration.
- **Acceptance:** document spike results and select one library; identify primary demo data/provider and hardware; record responses or provisional policy for every ambiguous external case. Preserve both source docs.
- **Depends on:** architecture approval.
- **Risks:** unresolved organiser errors, unavailable imagery/buildings, library/version mismatch. Shell work can continue with recorded open compatibility items, but exact-conformance signoff cannot.

### Phase 1 — application shell and tabs

**Complete, with approved UI refinements.** [Initial acceptance](phase1-review.md), [operator-console treatment](ui-refinement/REVIEW.md), [compact chrome/breadcrumb/context menus](chrome-refinement/REVIEW.md). The header's mission breadcrumb explicitly supersedes the earlier identity/time-only requirement. Tabs, splits, focus and close/reopen are implemented; operational pop-outs and refresh-persistent layout remain deferred.

- **Files/modules:** frontend manifests/config, `main.tsx`, `app/*`, `styles/*`, `features/workspace/*`, `state/workspaceStore.ts`, placeholder peer views.
- **Dependencies:** selected docking library, Zustand, Tailwind/Vite integration, selected Radix menus/tooltips/dialog primitives, Lucide; Vitest, Testing Library, ESLint, Prettier.
- **Interfaces:** view registry, WorkspaceState, open/focus/close commands and pane visibility/resize lifecycle.
- **Acceptance:** desktop shell with keyboard focus, semantic tokens, working tabs and entity inspector placeholder; Activity Bar opens/focuses peers; no page reload navigation. Production build works.
- **Depends on:** Phase 0 docking decision.
- **Risks:** competing library layout/store ownership and inaccessible compact controls. Keep one layout authority in the bridge.

### Phase 2 — shared world, backend authority and recording foundation

**Complete within tested local single-process scope.** [Acceptance matrix, restart and stream evidence](phase2-review.md). Recording-before-source, commit-before-publish, immutable frames, domain/aggregate validation, generated schemas, one session subscription and reconnect/mission isolation are implemented. No backend simulation/lifecycle authority is claimed beyond generic mission state.

- **Files/modules:** backend `domain`, `missions`, `world`, `recording`, `api/missions.py`, `api/stream.py`; frontend contracts/services/stores/presentation; contract export script and generated types.
- **Dependencies:** FastAPI, Pydantic, Uvicorn; standard-library SQLite; pytest/httpx; `json-schema-to-typescript`, Ajv and semantic runtime validation.
- **Interfaces:** WorldFrame, versioned snapshot/delta, stream epoch/sequence, generic events, typed role records, source identities and recording schema.
- **Acceptance:** deterministic backend fixture feeds all placeholder views; atomic update counts agree; duplicate/gap/reconnect/mission-switch tests pass; persisted state survives backend restart. No pane opens another subscription. Recording starts before source frames are processed.
- **Depends on:** Phase 1; Phase 0 domain/transport decisions.
- **Risks:** snapshot-stream race, schema drift, accidental duplicate entity/asset positions, publication before commit.

### Phase 3A — Tactical map foundation

**Complete within its bounded acceptance.** [Phase 3A review](phase3a-review.md), followed by [map services](map-services/REVIEW.md), [regional cartography](map-refinement/REVIEW.md), [retention/recovery](map-responsiveness/REVIEW.md) and [attribution](map-attribution/REVIEW.md). Hosted MapTiler authentication remains unverified; local cartography and labelled grid fallback are verified alternatives.

- **Files/modules:** `renderers/{contracts,scene,symbology,regions}.ts`, `renderers/maplibre/*`, `features/map/*`, local provider configuration/setup, browser regressions.
- **Dependencies:** MapLibre GL JS 6.9.0, PMTiles 4.5.0 and ignored reviewed vector/DEM/glyph/sprite assets; Playwright.
- **Acceptance met:** Track-derived Entity symbols, affiliation shape/text/color, supplied zones; stable picking and shared selection; mission framing/explicit recenter; no automatic refit on ordinary frames/filters; camera continuity, resize, simultaneous panes, stale/backend/provider recovery; one session subscription and bounded lifecycle. Missing positions remain missing. Narrow and keyboard controls verified.
- **Depends on:** Phase 2 authority/presentation.
- **Remaining risks:** authenticated optional hosted style, source coverage/resolution and provider availability. Regional bounds do not constrain domain validity. Heavy mission performance is not established by six-entity fixtures.

### Phase 3B — entity browsing, detail on demand and observed trails

**Complete within bounded acceptance; ready for user review.** [Phase 3B acceptance and evidence](phase3b/REVIEW.md): 91 backend tests, 129 frontend unit tests and 69 complete browser regressions passed; seven workflow checks passed again after the final copy adjustment. Separate critics scored 8.0 then 9.0/10; both blocking history findings were resolved. Final production capture verified local Tactical, ion standard and the configured direct Google base with one stream/one shared history read. This is not full operational production readiness.

- **Files/modules:** backend `recording/history.py`, bounded query in `sqlite_repository.py`, mission history endpoint, `missions/observation_fixture.py`; `contracts/sentinel/v1/observed-history.schema.json` and generated types; frontend `world/{entityRows,observedHistory,observedSegments}.ts`, `features/entities/*`, shared filters, both adapter trail projections and keyed workspace inspectors.
- **Dependencies:** TanStack Table 8.21.3; existing FastAPI/SQLite/Ajv/Radix/map/test stack. No second operational store or per-pane transport.
- **Contracts:** one row per Entity, deterministic displayed Track (source filter first, non-ended preferred, newest observation then stable ID); distinguish visible/mission Entity totals from raw Track totals. Shared selection/search/filters/overlays; pinned inspector identity is the encoded mission/Entity tuple. History is immutable committed data anchored by mission/recording/epoch/frame/sequence/effective time, maximum 300-second query window (UI 60), 1,000 canonical frame instants/2,000 observations. Highest committed sequence wins corrections as known through that frame. No interpolated/predicted observations.
- **Acceptance:** find → select in table/either map → compact summary → pinned Details → observed trail; missing/filtered/unlocated states explicit, supplied zero distinct from unavailable; provenance/units/datum/freshness copyable; role/task associations only when supplied. Shared counts and displayed history agree across renderers/inspector. Trails break at source/series changes, missing/stale observations, datum changes, declared discontinuity, time reversal or gaps over 30 seconds. History is limited to presented time and stale older results disclose their actual through-time. Mission/selection races and slow-read/live-update progress tested; existing cameras/pool/one subscription retained.
- **Depends on:** Phase 2 recordings and Phase 3A plus brought-forward Cesium adapters.
- **Remaining risks/limits:** selected displayed-track trail only, no full-history UI or replay; 60-second/point/frame caps disclosed; older AGL or unsupported datum samples have no invented 3D height; MSL h≈H remains explicitly approximate. Large mission/recording throughput requires later benchmarking.

### Phase 4 — Cesium and Tactical ↔ 3D continuity

**Brought forward and substantially complete; altitude-fidelity and coverage acceptance remain open.** [Foundation](map-services/REVIEW.md), [regional/real-provider verification](map-refinement/REVIEW.md), [warm-switch and failure evidence](map-responsiveness/REVIEW.md). Both adapters consume the same frame/selection/filters/zones and now observed-history subset. Workers/assets production paths, independent pane cameras, mode bookmarks, daylight presentation, local/standard/Google fallback and bounded renderer retention are implemented. No additional Phase 4 library scaffold is required.

**Outstanding:** known-point geoid/datum conversion and vertical accuracy signoff; Mojave/additional regional smoke contexts; authenticated MapTiler and optional Google-through-ion route verification. Direct Google plus ion standard and local Tactical were verified in earlier real-provider reports; this does not establish universal coverage. The reported intermittent five-minute Google failure was not reproduced in the measured twelve-minute sessions and is not claimed fixed. Account-console quota/billing and hard GPU memory remain unverified.

- **Files/modules:** `renderers/cesium/*`, `camera.ts`, `altitude.ts`, `providers.ts`, mode-switch lifecycle, Vite asset deployment configuration.
- **Dependencies:** CesiumJS and configured terrain/imagery/3D Tiles plus named geoid data/service. No extra renderer wrapper by default.
- **Interfaces:** same SceneProjection, camera conversion, altitude conversion with quality metadata, resize/visibility/dispose.
- **Acceptance:** same selected entity, mission, timestamp, filters, zones and history in both modes; switching back retains operational area within proposed tolerance. Test 20 rapid/back-and-forth switches, clean resource disposal and error recovery. Separate Tactical/3D tabs can both render. Urban, Mojave and tropical sample contexts load; primary urban data demonstrates useful physical context. Datum conversion has a known-point test.
- **Depends on:** Phase 3; provider decision from Phase 0.
- **Risks:** WebGL memory, bad base URLs, height-reference mismatch, stale async mounts, missing urban geometry. Unqualified approximate height is not fidelity signoff.

### Phase 5 — simulation compatibility end to end

**Deferred. Recommended next implementation phase after review**, beginning with a bounded resolver/adapter slice once the compatibility policies below are confirmed; this document does not authorise it.

- **Files/modules:** backend `simulation/*`, `adapters/simulation_v1/*`, compatibility route, complete contract fixtures/tests; frontend `modules/counter-uas/*` controls/details.
- **Dependencies:** Python stdlib hashing/decimal handling; add a polygon library only if its validated semantics reduce risk. Existing transport and persistence stack suffices.
- **Interfaces:** exact external request/response, resolver, lifecycle service, idempotency registry, profile registry, adapter mapping and typed module details.
- **Acceptance:** published golden result matches; all §10 negative/boundary cases covered; same canonical command returns stored result without duplicate recording; conflicting content gives 409; HOLD/RESUME/ABORT are backend acknowledged. Neutral/unknown/out-of-area rows persist; simultaneous outcomes and discontinuities are correct. No raw external drone schema enters core/frontend world state. Sparse 10,000-drone fixture passes and dense scaling is measured separately.
- **Depends on:** Phase 2 foundation, Phase 0 resolved compatibility decisions; Phase 4 enables visual verification.
- **Risks:** unresolved error semantics, quadratic result size, duplicate JSON keys, numeric ordering/rounding, transaction/idempotency races. Do not claim full compatibility while ambiguities remain unresolved.

### Phase 6 — Command Picture and Vertical Engagement Profile

**Deferred.** Current Command Picture/Vertical Profile are clearly labelled placeholders, not working analytics. Requires truthful supplied aggregates, declared profile origin and a reviewed common altitude-reference policy; no decorative metrics or invented readiness.

- **Files/modules:** `command-picture/*`, `vertical-profile/*`, reusable chart host with owner-document lifecycle, domain/module selectors.
- **Dependencies:** Apache ECharts (reuse spike dependency, no second chart library).
- **Interfaces:** frame-keyed aggregates, profile origin and altitude transform, chart click→ObjectRef selection, bounded history query.
- **Acceptance:** three meaningful widgets and the profile read the same frame as maps; chart selection highlights the correct entity everywhere; unknown resource data stays unknown; profile has labeled distance origin, altitude reference and discontinuities. Opens as card, tab and supported side view.
- **Depends on:** Phases 3–5; can develop against Phase 2 fixtures while adapter is completed.
- **Risks:** misleading counts, radial distance mistaken for cross-section, charts recomputing on every camera movement.

### Phase 7 — Timeline and replay

**Deferred.** Durable recordings and bounded observed-history inspection exist; frame seeking, playback/scrubbing, event navigation and complete seek lifecycle remain unimplemented. Phase 3B is not replay acceptance.

- **Files/modules:** backend `replay/service.py`, `api/replay.py`; frontend `historyCache.ts`, `replayClient.ts`, `timeline/*`, presentation selector replay branch.
- **Dependencies:** existing SQLite/ECharts/time primitives; no timeline framework.
- **Interfaces:** recording metadata, effective-time frame lookup with sequence tie-breaker, bounded series/event ranges, TimeState and seek-generation token.
- **Acceptance:** scrub and play through the defensive synthetic scenario; all views resolve the same frame; health/status change at exact timestamps; replay retains interaction IDs/draws and corrections. Live updates continue in their own cache; Return to live reaches latest state. Repeated/rapid seeks cannot show stale responses. HOLD is visibly distinct from playback pause; finalized ABORT record reopens after restart.
- **Depends on:** Phase 2 recording, Phase 5 simulation records, Phase 6 shared analytic projections.
- **Risks:** incomplete initial metadata, live/replay contamination, mixed moments, history memory growth, future-data leakage through prediction.

### Phase 8 — split panes and one pop-out proof of concept

**Partial, brought forward:** working tabs/splits/context menus and simultaneous independent maps are complete. Isolated harness pop-out feasibility is complete. Real analytic pop-out with shared operational context, child resize/focus/close, popup failure and opener-lifetime acceptance remains deferred until those views exist. Do not enable operational pop-outs based solely on the harness.

- **Files/modules:** finish `docking.ts`, layout bridge, `windowContext.ts`, `popout.html`, owner-document chart/control integration, workspace e2e tests.
- **Dependencies:** selected docking library only; browser primitives as required by the selected model.
- **Interfaces:** open-to-side/move/close/pop-out, pane resize/visibility, shared session runtime; child bootstrap/UI revision protocol only if independent runtimes were chosen.
- **Acceptance:** Map + Vertical Profile + Timeline arrangement; simultaneous Tactical/3D; move views without losing context; pop Command Picture/Profile to another window, change selection/replay time and verify agreement. Resize, close and reopen child; blocked popup leaves usable docked view. No duplicate backend commands/subscriptions or leaked renderers. Document opener-lifetime limitation.
- **Depends on:** Phase 1 tab host and Phases 4, 6, 7 real views. Phase 0 already proved basic pop-out feasibility.
- **Risks:** wrong document listeners, hidden-opener throttling, browser popup rules, chart sizing and focus loss. A single working analytic pop-out is sufficient; map detachment is optional.

### Phase 9 — demo hardening and acceptance

**Deferred beyond current regression coverage.** No complete simulation/analytics/replay demo or worst-case throughput certification exists.

- **Files/modules:** Playwright critical-flow tests, backend conformance tests, synthetic scenario/recording fixtures, `docs/demo-runbook.md`, environment/config examples and build checks.
- **Dependencies:** existing test tools only.
- **Interfaces:** canonical demo from product §42, defensive scenario from simulation §9, provider failure/reconnect recovery.
- **Acceptance:** clean install/build and complete rehearsed demo: load → Tactical → select/details → 3D → profile → command aggregates → HOLD acknowledgement → replay → split/pop-out. Check 1440p/4K, keyboard access, production paths, one lost connection and one failed provider. Publish measured performance and explicit remaining limitations.
- **Depends on:** all deliverable phases.
- **Risks:** network-dependent demo, last-minute scope growth, machine-specific GPU/browser behavior. Keep a deterministic recorded demo and clearly labeled fallback basemap.

## 11. Acceptance budgets and exclusions

Provisional interactive target: 200 entities at 5 authoritative updates/second, 60 seconds of visible history, both maps plus two analytic panes. Aim for at least 30 FPS on the selected demo machine and local selection feedback within 150 ms; record actual numbers rather than asserting them in advance. Cold 3D tile loading is measured separately from warm renderer switching. UI counters need not update at animation frequency, but all display the same committed frame/cursor. Performance failure first triggers batching, bounded history and less expensive symbols, not deck.gl by default.

Compatibility tests include every required case in simulation §10, with special attention to exact radius/boundaries, canonical ordering, duplicate parsed timestamps, health/status invariants, immutable profiles, and lifecycle/idempotency. UI tests cover continuity after switches and reconnect, filter/overlay agreement, stale/missing selections, replay isolation, schema drift and window lifecycle. Use deterministic shared read-model assertions plus focused screenshots; do not rely solely on unstable network tile pixels. Test the final chosen versions and production build on the demo browser.

Explicitly do not build during the hackathon:

- HADR functionality, generalized plugin/module loading, arbitrary dashboard builders.
- Full desktop window management, independent-window survival, multi-monitor restoration or saved workspace migration.
- Real aircraft dispatch, live-source simulation input, route planning, target optimization or detailed vehicle-control interfaces.
- New probability/calibration research or claims of empirical validity; fixtures remain NOTIONAL.
- Sensor fusion, invented confidence/coverage/readiness, terrain line-of-sight or validated collision/clearance analysis.
- Automatic prediction/assignment engines; use declared scenario data only when needed for continuity demonstrations.
- Advanced policy/authority UI, enterprise access control, multi-operator collaborative editing, HA/distributed backend infrastructure.
- Offline/on-premises packaging, mobile/tablet redesign, a new PMTiles/MBTiles generation pipeline, a complete Storybook catalogue. Reproducible setup of the already-reviewed local archives is implemented and does not authorise a new tiling pipeline.
- Extra visualization engines, microservices, global event buses, unlimited browser history caches, or full worst-case dense simulation processing presented as a proven capability.

## 12. Next-phase prerequisites and unresolved decisions

Stop for user review after Phase 3B. The next recommended implementation is a bounded Phase 5 simulation resolver/adapter slice, using the existing generic authority and recording rather than adding simulation fields to core entities. Before exact compatibility signoff, resolve or explicitly retain provisional policies for the organiser error envelope, aborted RESUME/missing lifecycle transitions, duplicate JSON keys/numeric canonicalisation, timestamp validation order and cross-command correction/run/profile semantics in `contracts/simulation/compatibility-decisions.md`. Preserve golden fixtures and keep dense-output scale distinct from sparse maximum-input validation.

The remaining Phase 4 datum/coverage decisions can be resolved independently; datum fidelity is a prerequisite for a physically meaningful Vertical Profile or terrain-clearance claims, not for generic resolver arithmetic. Analytics, replay UI and operational window work remain separately gated. Heavy 200-Entity/5 Hz/both-maps performance budgets below are targets, not measurements established by Phase 3B. This documentation revision changes no source specification and authorises no further implementation.
