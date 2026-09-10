# Sentinel v3 — proposed implementation plan

Status: architecture proposal for approval; no application scaffold created.
Reviewed: 10 September 2026.

## 1. Basis and recommendation

Read both source documents completely: `Sentinel_v3.md` (2,115 lines) and `RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` (525 lines). The former governs product and internal architecture; the latter governs the external simulation boundary. Neither document is modified by this proposal.

Repository inspection found only those two files, with empty `frontend/`, `backend/`, and `contracts/` directories. There is no existing application, dependency manifest, test suite, build configuration, or repository AGENTS.md. Initial Git status was clean. Sentinel v2 was not needed for this proposal and no code was copied from it.

Use a small monorepo with a React/TypeScript/Vite frontend and a Python/FastAPI/Pydantic backend. Keep one backend mission authority and one frontend session runtime. Every view reads a shared presentation frame derived from that authority. MapLibre and Cesium are disposable projections. Implement the simulation boundary on the backend, including its independent resolver, rather than transporting external drone objects into frontend stores.

Use Zustand vanilla stores, direct MapLibre/Cesium APIs, ECharts, semantic CSS tokens with Tailwind, selected Radix primitives, Lucide for chrome, and TanStack Table when the entity browser arrives. Provisionally prefer FlexLayout, but make a short docking evaluation an approval-gated implementation phase. Do not introduce a custom docking engine, Redux, TanStack Query, deck.gl, a plugin runtime, or a generic event bus initially.

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

## 3. Proposed repository layout

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

Keep modules as a few files until complexity warrants folders. No monorepo build framework or shared npm package is needed. Standard npm plus a Python virtual environment is sufficient. Backend Pydantic models are the internal wire-schema source; export OpenAPI and WebSocket JSON Schema and generate TypeScript using `openapi-typescript`. Ensure stream payload models are included explicitly in generation. CI checks generated output for drift. Stable external JSON Schemas are versioned independently and checked against the Pydantic compatibility models and golden fixtures. JSON Schema alone cannot enforce polygon validity, lifecycle or cross-sample rules.

The domain types below describe the proposed generated data shape, not a second handwritten copy of Python API types. Frontend-only session/workspace types remain handwritten. Runtime decoding is separate from TypeScript typing; use generated JSON Schema with Ajv at ingress if needed, with reducers also checking identity/order invariants.

Import direction: features → selectors/session actions → domain/contracts. Renderers → scene contracts only. Simulation code stays in backend simulation/adapter and typed counter-UAS presentation metadata. Domain has no imports from React, Zustand, map engines, docking libraries, or external simulation DTOs.

## 4. Proposed first TypeScript model

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

No duplicate mutable position on Asset or Entity. A selector chooses the track for an entity; simulation initially provides one track per entity/source. Multiple-source arbitration/fusion is deferred. Static entities can have a manually sourced track. A generic Entity may exist without a position and then remains available in tables/details without an invented map point. History/prediction series are timestamped, source-attributed and fetched by range, outside the hot world dictionary.

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
| Workspace/UI | `workspaceStore`: view registry, active module, dock configuration, modal state | Frontend only; domain state contains no layout. |
| Renderer runtime | Adapter instances, GPU objects, camera handles, hover hit results | Local disposable handles; emit intents, never mutate world. |

Proposed REST: `GET /api/missions`, `GET /api/missions/{id}/world`, `GET /api/missions/{id}/events?after=...`, `GET /api/recordings/{id}`, `GET /api/recordings/{id}/frame?at=...`, `GET /api/recordings/{id}/series?from=...&to=...`, `GET /api/events/{id}/detail`. Proposed compatibility route: `POST /api/compat/simulation/v1/resolve`; the submitted operation name remains documented because the contract does not prescribe a URL. Domain command routes are added only for supported actions; UI simulation controls assemble/request the external command through the backend's scenario/run service without implementing lifecycle rules locally.

WebSocket `GET /api/missions/{id}/stream`: initial atomic snapshot followed by `{schemaVersion, missionId, streamEpoch, sequence, previousSequence, effectiveAt, changes}`. Changes use explicit typed table upserts/removals and an event append list; each message is an atomic transaction, not individual mutable-object notifications. Removal from a cache is distinct from Entity.presence=removed. Supply lifecycle metadata in the same update. A bounded sequence backlog allows reconnect; otherwise send `resync-required` and a fresh snapshot. The REST snapshot revision plus resumed stream must have no subscribe race; simplest implementation obtains snapshot and registers queued subsequent updates under the same backend lock.

One WebSocket per session runtime, not per pane. Ignore duplicate sequence numbers; an epoch change or sequence gap triggers resnapshot. Display stale/disconnected status and inhibit new simulation commands until reconnected. An unknown command outcome is reconciled using the same command ID, not a new request that might repeat effects. Cancel requests on mission change and tag replay seeks with generations to discard slow obsolete responses.

`getPresentationFrame(session, liveCache, replayCache)` is the only view-facing world read path. On seek, keep the last complete frame with a visible seeking indicator until the new complete frame arrives; do not show a mixture of moments. All charts/inspectors/maps include the same frame key. Live ingestion continues during historical inspection. “Return to live” selects the latest committed live frame.

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

Switch transaction: capture neutral camera intent → preserve session state and view ID → dispose inactive renderer → lazy-load/create requested adapter → reapply current complete scene → restore equivalent area. If initialization fails, retain context and offer Tactical recovery. Async mount/disposal uses a generation token so rapid switches cannot attach a stale viewer. Independent map panes use independent cameras and a shared session; no automatic camera feedback loop.

Camera equivalence is operational, not an exact pitch/zoom conversion: preserve focus, ground span, heading, and optionally selected entity. Use a visible-earth intersection for the Cesium focus, falling back to last focus when looking at the sky. Refit span for pane aspect ratio. Retain private per-mode pitch bookmarks where useful; never export Cesium camera objects into domain state. Proposed test tolerance: focus within 5% of viewport ground span and target remains visible for normal demo views.

Altitude conversion: Cesium's geographic conversion expects height above ellipsoid ([official Cartesian3 documentation](https://cesium.com/learn/cesiumjs/ref-doc/Cartesian3.html)). Convert MSL H using a named geoid offset N to ellipsoid h=H+N; AGL needs terrain height plus offset in a known reference. Cache conversions by provider/version and location. Keep unresolved conversions explicitly marked and preserve source MSL values in labels and Vertical Profile. Until a geoid is configured, any h≈H visual fallback must be labeled approximate and is not a completed altitude-fidelity acceptance criterion. Never clamp airborne tracks to terrain. Zone floors/ceilings use the same conversion; missing altitude bands remain surface areas rather than fabricated volumes.

Provider configuration describes imagery/style/terrain/3D Tiles URLs, attribution, token references and vertical model. No provider-specific fields in Entity. Confirm Vite deployment of Cesium Workers/Assets/Widgets/ThirdParty and base URL in Phase 4. Destroy hidden map renderers; explicitly open simultaneous views may run both. Resize from pane lifecycle, not browser resize alone. Clean up listeners, sources, subscriptions and animation loops on every unmount; test React development lifecycle as well as production build.

## 8. Workspace library evaluation

Documentation review, not a completed runtime spike. Pin actual compatible package versions only during implementation.

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

**Recommendation:** evaluate FlexLayout first using identical test views and retain it if it passes. Time-box the comparison to a half day after approval, record package versions and concrete failures. Test tabs, reorder, close, Open to Side, resizing, a mock high-rate counter, an ECharts plot, child close/reopen, popup blocking, and shared selection/time; repeat critical checks with real maps when available. Both candidates must be judged against the installed React version and production serving paths. Documentation alone cannot decide WebGL behavior or accessibility.

First pop-out is Command Picture or Vertical Profile, not Cesium. With FlexLayout, use the same session runtime and backend stream; no BroadcastChannel is needed for that portal. Obtain document/window from the host element and point Radix portal containers, chart resize and keyboard listeners there. If opener closes, the POC session ends; independent restart/multi-monitor restoration is deferred. Popup failure leaves the view docked and gives an actionable message.

If Golden Layout wins, independent child runtimes each derive cache from the backend and need a small parent-coordinated UI channel carrying session/mission ID, revision, selection, cursor and filters. Parent assigns UI revisions, bootstraps child state and prevents echo loops; never broadcast authoritative world writes. This added work is a reason to prefer FlexLayout for this scope, not a reason to misrepresent its pop-out as an independent app.

## 9. UX and analytic contracts

Default layout: compact mission/time header, Activity Bar, one Map workspace, small connection/count status bar. Tactical/3D switch belongs above the map; activities open or focus views rather than route away from the workbench. Only implemented modules are interactive. Keep map tools to selection, pan and recenter initially.

Selection opens a compact summary with ID, affiliation, timestamp/staleness, source, altitude and any actually supplied speed/assignment. Open Details creates a tab. Provide keyboard entity browsing and focus-visible controls; affiliation uses shape and text as well as color. Define semantic tokens once for both engines, charts and chrome. Check 1440p/4K scaling and readable density at common display scaling settings.

Command Picture initial widgets: (1) present tracks by affiliation/classification, (2) managed resources by explicit availability including unknown, (3) recorded events over a selected time range. Titles state mission/time and whether filtering is applied. Do not label simulation health as fleet readiness or input presence as sensor detection confidence. Global mission totals and filtered counts must be visibly distinguished.

Vertical Profile consumes the same visible tracks and frame, expresses altitude in a common reference, and highlights the shared selection. Radial distance from the declared origin avoids a hidden projection axis; show trajectories with breaks and timestamp tooltips. Exclude or visibly mark positions whose altitude cannot be converted to the chart's chosen reference. Provide it as a reusable view component inside Command Picture and as a workspace tab/split/pop-out, without duplicating computation.

Timeline provides event markers, discrete timestamp selection, play/pause/rate and Return to live. Distinguish playback controls from simulation lifecycle buttons with separate labels and placement. A visible replay banner and pending-command indicator prevent confusion. Avoid a persistent large inspector or a dashboard of individual vehicle cards.

## 10. Phased implementation after approval

Dependencies listed below are incremental; previous phase dependencies remain available. Each phase should end in a reviewable slice and its acceptance evidence. No application work in these phases has begun.

### Phase 0 — contracts and docking decision

- **Files/modules:** `contracts/simulation/compatibility-decisions.md`, initial schemas/fixtures; `docs/demo-runbook.md` prerequisites; temporary `frontend` docking spike; backend domain model draft.
- **Dependencies:** React, TypeScript, Vite; evaluate `flexlayout-react` and `golden-layout` separately, plus ECharts for the plot probe. Remove the losing candidate before the shell lands.
- **Interfaces:** ViewDescriptor, SessionState, layout bridge; simulation edge-case decision table; altitude/provider configuration.
- **Acceptance:** document spike results and select one library; identify primary demo data/provider and hardware; record responses or provisional policy for every ambiguous external case. Preserve both source docs.
- **Depends on:** architecture approval.
- **Risks:** unresolved organiser errors, unavailable imagery/buildings, library/version mismatch. Shell work can continue with recorded open compatibility items, but exact-conformance signoff cannot.

### Phase 1 — application shell and tabs

- **Files/modules:** frontend manifests/config, `main.tsx`, `app/*`, `styles/*`, `features/workspace/*`, `state/workspaceStore.ts`, placeholder peer views.
- **Dependencies:** selected docking library, Zustand, Tailwind/Vite integration, selected Radix menus/tooltips/dialog primitives, Lucide; Vitest, Testing Library, ESLint, Prettier.
- **Interfaces:** view registry, WorkspaceState, open/focus/close commands and pane visibility/resize lifecycle.
- **Acceptance:** desktop shell with keyboard focus, semantic tokens, working tabs and entity inspector placeholder; Activity Bar opens/focuses peers; no page reload navigation. Production build works.
- **Depends on:** Phase 0 docking decision.
- **Risks:** competing library layout/store ownership and inaccessible compact controls. Keep one layout authority in the bridge.

### Phase 2 — shared world, backend authority and recording foundation

- **Files/modules:** backend `domain`, `missions`, `world`, `recording`, `api/missions.py`, `api/stream.py`; frontend contracts/services/stores/presentation; contract export script and generated types.
- **Dependencies:** FastAPI, Pydantic, Uvicorn; standard-library SQLite; pytest/httpx; `openapi-typescript`, Ajv if using generated runtime validation.
- **Interfaces:** WorldFrame, versioned snapshot/delta, stream epoch/sequence, generic events, typed role records, source identities and recording schema.
- **Acceptance:** deterministic backend fixture feeds all placeholder views; atomic update counts agree; duplicate/gap/reconnect/mission-switch tests pass; persisted state survives backend restart. No pane opens another subscription. Recording starts before source frames are processed.
- **Depends on:** Phase 1; Phase 0 domain/transport decisions.
- **Risks:** snapshot-stream race, schema drift, accidental duplicate entity/asset positions, publication before commit.

### Phase 3 — Tactical view and detail on demand

- **Files/modules:** `renderers/contracts.ts`, `scene.ts`, `symbology.ts`, `maplibre/*`, `features/map/*`, `entity-detail/*`, `entity-browser/*`, shared selectors.
- **Dependencies:** MapLibre GL JS, TanStack Table, provider assets/config; Playwright for first end-to-end flow.
- **Interfaces:** SceneProjection, stable ObjectRef picking, selection/filter/overlay actions, camera intent, shared history series.
- **Acceptance:** muted basemap, distinct affiliation shapes, zones, observed trails; selecting a map symbol/table row selects the same Entity and opens a concise summary; Details is a tab. Missing data displays unknown. Counts do not double count Asset roles.
- **Depends on:** Phase 2.
- **Risks:** feature IDs lost on updates, basemap labeling clutter, stale tracks shown as current, provider errors.

### Phase 4 — Cesium and Tactical ↔ 3D continuity

- **Files/modules:** `renderers/cesium/*`, `camera.ts`, `altitude.ts`, `providers.ts`, mode-switch lifecycle, Vite asset deployment configuration.
- **Dependencies:** CesiumJS and configured terrain/imagery/3D Tiles plus named geoid data/service. No extra renderer wrapper by default.
- **Interfaces:** same SceneProjection, camera conversion, altitude conversion with quality metadata, resize/visibility/dispose.
- **Acceptance:** same selected entity, mission, timestamp, filters, zones and history in both modes; switching back retains operational area within proposed tolerance. Test 20 rapid/back-and-forth switches, clean resource disposal and error recovery. Separate Tactical/3D tabs can both render. Urban, Mojave and tropical sample contexts load; primary urban data demonstrates useful physical context. Datum conversion has a known-point test.
- **Depends on:** Phase 3; provider decision from Phase 0.
- **Risks:** WebGL memory, bad base URLs, height-reference mismatch, stale async mounts, missing urban geometry. Unqualified approximate height is not fidelity signoff.

### Phase 5 — simulation compatibility end to end

- **Files/modules:** backend `simulation/*`, `adapters/simulation_v1/*`, compatibility route, complete contract fixtures/tests; frontend `modules/counter-uas/*` controls/details.
- **Dependencies:** Python stdlib hashing/decimal handling; add a polygon library only if its validated semantics reduce risk. Existing transport and persistence stack suffices.
- **Interfaces:** exact external request/response, resolver, lifecycle service, idempotency registry, profile registry, adapter mapping and typed module details.
- **Acceptance:** published golden result matches; all §10 negative/boundary cases covered; same canonical command returns stored result without duplicate recording; conflicting content gives 409; HOLD/RESUME/ABORT are backend acknowledged. Neutral/unknown/out-of-area rows persist; simultaneous outcomes and discontinuities are correct. No raw external drone schema enters core/frontend world state. Sparse 10,000-drone fixture passes and dense scaling is measured separately.
- **Depends on:** Phase 2 foundation, Phase 0 resolved compatibility decisions; Phase 4 enables visual verification.
- **Risks:** unresolved error semantics, quadratic result size, duplicate JSON keys, numeric ordering/rounding, transaction/idempotency races. Do not claim full compatibility while ambiguities remain unresolved.

### Phase 6 — Command Picture and Vertical Engagement Profile

- **Files/modules:** `command-picture/*`, `vertical-profile/*`, reusable chart host with owner-document lifecycle, domain/module selectors.
- **Dependencies:** Apache ECharts (reuse spike dependency, no second chart library).
- **Interfaces:** frame-keyed aggregates, profile origin and altitude transform, chart click→ObjectRef selection, bounded history query.
- **Acceptance:** three meaningful widgets and the profile read the same frame as maps; chart selection highlights the correct entity everywhere; unknown resource data stays unknown; profile has labeled distance origin, altitude reference and discontinuities. Opens as card, tab and supported side view.
- **Depends on:** Phases 3–5; can develop against Phase 2 fixtures while adapter is completed.
- **Risks:** misleading counts, radial distance mistaken for cross-section, charts recomputing on every camera movement.

### Phase 7 — Timeline and replay

- **Files/modules:** backend `replay/service.py`, `api/replay.py`; frontend `historyCache.ts`, `replayClient.ts`, `timeline/*`, presentation selector replay branch.
- **Dependencies:** existing SQLite/ECharts/time primitives; no timeline framework.
- **Interfaces:** recording metadata, effective-time frame lookup with sequence tie-breaker, bounded series/event ranges, TimeState and seek-generation token.
- **Acceptance:** scrub and play through the defensive synthetic scenario; all views resolve the same frame; health/status change at exact timestamps; replay retains interaction IDs/draws and corrections. Live updates continue in their own cache; Return to live reaches latest state. Repeated/rapid seeks cannot show stale responses. HOLD is visibly distinct from playback pause; finalized ABORT record reopens after restart.
- **Depends on:** Phase 2 recording, Phase 5 simulation records, Phase 6 shared analytic projections.
- **Risks:** incomplete initial metadata, live/replay contamination, mixed moments, history memory growth, future-data leakage through prediction.

### Phase 8 — split panes and one pop-out proof of concept

- **Files/modules:** finish `docking.ts`, layout bridge, `windowContext.ts`, `popout.html`, owner-document chart/control integration, workspace e2e tests.
- **Dependencies:** selected docking library only; browser primitives as required by the selected model.
- **Interfaces:** open-to-side/move/close/pop-out, pane resize/visibility, shared session runtime; child bootstrap/UI revision protocol only if independent runtimes were chosen.
- **Acceptance:** Map + Vertical Profile + Timeline arrangement; simultaneous Tactical/3D; move views without losing context; pop Command Picture/Profile to another window, change selection/replay time and verify agreement. Resize, close and reopen child; blocked popup leaves usable docked view. No duplicate backend commands/subscriptions or leaked renderers. Document opener-lifetime limitation.
- **Depends on:** Phase 1 tab host and Phases 4, 6, 7 real views. Phase 0 already proved basic pop-out feasibility.
- **Risks:** wrong document listeners, hidden-opener throttling, browser popup rules, chart sizing and focus loss. A single working analytic pop-out is sufficient; map detachment is optional.

### Phase 9 — demo hardening and acceptance

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
- Offline/on-premises packaging, mobile/tablet redesign, PMTiles/MBTiles pipelines, a complete Storybook catalogue.
- Extra visualization engines, microservices, global event buses, unlimited browser history caches, or full worst-case dense simulation processing presented as a proven capability.

Approval of this plan authorizes a subsequent implementation task, beginning with the bounded decisions/spike and shell. This document itself adds no application code, dependencies, or changes to the source specifications.
