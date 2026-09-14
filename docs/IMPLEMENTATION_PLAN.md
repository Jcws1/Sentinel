# Sentinel v3 — implementation plan and delivery status

Status: Phase 3B remains complete within its bounded scope. M1.1 authority/contracts/repeatable run entry is complete under the specific 14 September user implementation request; operator acceptance and required checks pass, and the final independent implementation review scores 9.14/10 with no unresolved material findings. Stop for user review after M1.1. M1.2–M1.4 and the retained Phase 5 compatibility work remain deferred. [M1.1 implementation evidence](m1.1/REVIEW.md).
Originally reviewed: 10 September 2026. Revised: 14 September 2026.

**Revision note — 2026-09-14:** incorporate the reviewed software-only Fleet, movement and operator-declared notional encounter proposal as M1 in §10. Reconcile command/source authority, run creation, paused-clock expiry, atomic outcomes and UI acceptance with the existing architecture. Retain completed-phase evidence and outstanding Phase 4–9 obligations; keep the external Phase 5 contract separate. Neither source specification is changed. Proposal review scored 8.64 then 9.16/10 after correcting paused-run expiry, accepted-work lease semantics and repeatable run creation; those scores assess the proposal, not implemented software or simulation validity.

**Revision note — 2026-09-13:** reconcile the original proposal with the implemented shell, authoritative recording runtime, Phase 3A/3B and approved map-service, regional, attribution and renderer-retention refinements. Current status and evidence are in §10; retained design sketches are explicitly historical. Neither source specification is changed. [Phase 3B review](phase3b/REVIEW.md).

## 1. Basis and recommendation

Read both source documents completely: `Sentinel_v3.md` (2,115 lines) and `RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` (525 lines). The former governs product and internal architecture; the latter governs the external simulation boundary. Neither document is modified by this proposal.

The initial 10 September inspection found only the two specifications. The repository now contains a React workbench, FastAPI/Pydantic mission authority, SQLite recordings, generated contracts, both map adapters and regression suites. The later approved regional refinement adapted compatible v2 cartographic assets and styling through the v3 renderer boundary; provenance and setup are in [the regional review](map-refinement/REVIEW.md). Sentinel v2 remains unchanged.

Use a small monorepo with a React/TypeScript/Vite frontend and a Python/FastAPI/Pydantic backend. Keep one backend mission authority and one frontend session runtime. Every view reads a shared presentation frame derived from that authority. MapLibre and Cesium are disposable projections. Implement the simulation boundary on the backend, including its independent resolver, rather than transporting external drone objects into frontend stores.

Use Zustand vanilla stores, direct MapLibre/Cesium APIs, semantic CSS tokens with Tailwind, selected Radix primitives, Lucide and TanStack Table. FlexLayout React 0.10.8 is selected and implemented; its model is the sole docking authority. TanStack Table 8.21.3 supplies the Phase 3B browser. ECharts remains for future analytics (the Phase 0 experiment is isolated). No custom docking engine, Redux, TanStack Query, deck.gl, plugin runtime or generic event bus is needed.

The user's requested scope makes tabs, splits, basic replay, and one pop-out explicit deliverables, even though section 43 of the product specification places some in its optional tier. Implement recording and adapter contracts early; finish their UI later. Deferring the underlying contracts until the end would risk rebuilding all the views.

**Next recommendation:** deliver **M1 — Interactive synthetic fleet demonstration** before the retained Phase 5 compatibility slice. M1 provides the complete operator workflow: create a synthetic run → inspect friendly/opposing entities → select controllable assets → request movement → observe execution → explicitly initiate a notional encounter → inspect its outcome. M1 is planned, not implemented. It is compatible with product §2.1's macro-level command intent and does not introduce detailed aircraft controls, automatic pursuit, pathfinding or physical dispatch.

The existing Phase 5 describes the external batch resolver, compatibility adapter, lifecycle acknowledgements and counter-UAS controls/details. It does not specify the movement executor, destination authoring or complete Fleet control UI needed here. The external specification's §2.1 claim of existing movement is historical context, not current v3 delivery evidence; [Phase 3B](phase3b/REVIEW.md) and the current mission API establish the present boundary. M1's one-pair **Notional mutual loss v1** is an explicit software state-transition rule, not external conformance: external §7's golden `MUTUAL_EFFECT` leaves both drones `ACTIVE` at health 60. Preserve that fixture and the submitted contract unchanged.

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
| Fleet membership, friendly affiliation and command authority differ | Fleet is a browser mode over explicitly managed Entity/Asset roles. A separate backend grant binds each commandable Asset to an executor and control telemetry Track/source. | The displayed-track selector and affiliation never choose a command destination or establish permission. |
| Interactive movement versus external simulation lifecycle | M1 owns explicit movement/encounter intents and its interactive run controls; Phase 5 retains the submitted batch and lifecycle contract. | No repeated START or hidden HOLD/RESUME loop to impersonate a streaming movement API. Initial integrations use separate missions/runs and one writer per mission. |
| Mutual effect versus non-operational outcome | Preserve the external golden result; use a separately versioned, visibly notional M1 rule for operator-declared pair loss. | No probability, physical-effect or intercept-fidelity claim; current positions are inputs, not proof of proximity or clearance. |
| Paused effective time versus command expiry | Move/Encounter use reviewed running-frame expiry; lifecycle, control and cancellation use fresh backend-issued intent evidence independent of the paused frame's age. | Start/Resume/Cancel/End must remain usable after a long pause; delayed obsolete requests still reject. |
| Lost browser lease versus accepted execution | Current lease gates new admission. Expiry alone does not revoke an already accepted execution; explicit cancellation/revocation, run state, epoch and applicable deadlines remain authoritative. | Navigation, pane disposal or a lost socket cannot silently cancel accepted work. |

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

The tree below is the original architectural sketch, not a scaffold checklist. Actual wire authority is `backend/app/domain/models.py` plus `world/contracts.py`; storage is `recording/sqlite_repository.py`. Layout belongs to `features/workspace/workspaceBridge.ts` and FlexLayout, not a second Zustand layout store. Phase 3B adds `recording/history.py`, `missions/observation_fixture.py`, `world/{entityRows,observedHistory,observedSegments}.ts` and `features/entities/*`. Commands are planned in M1; replay and analytics remain later work. M1's proposed modules and contract migration are listed in §10 rather than represented as existing files in this historical tree.

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

**M1 addition, not implemented:** add explicit Asset control/source bindings and capabilities, correlated command/execution records and typed interactive-run/encounter details. Keep these outside the historical type sketch. Backend models, generated schemas and runtime validators must evolve together; an Asset's availability or friendly affiliation alone is never authorization. A single Entity may have role records, but the Fleet row and group member represent that Entity once; ambiguous control bindings must be resolved explicitly, not arbitrated by the display selector. Current `SelectionState.items` does not establish implemented multi-selection: current picking replaces the primary selection. Group actions, all-member highlighting and condition filtering are new M1 work.

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

Workspace types are a minimal view registry plus an isolated library layout payload, not another competing layout tree. Docking runtime objects remain outside serializable stores. Selection resolves Track/Asset references to the same Entity for highlighting. An inspector pins entity identity; selection may subsequently change without repurposing its tab. Missing or filtered selections are reported, not silently cleared. A mission switch atomically resets mission-scoped selection, playback, cached frames and old subscriptions; implemented pinned inspectors retain their old identity and show explicit inactive-mission/unavailable context. In M1, switching also discards unsubmitted drafts and stops renewal of the old mission's control lease, but does not cancel accepted backend execution.

Typed counter-UAS metadata lives in `modules/counter-uas`, with backend equivalents owned by the adapter: e.g. namespace `sentinel.simulation.v1` holds class, reported health/status, run ID and audit reference. Core treats it as an opaque extension. Health is neither a universal field nor a readiness formula.

## 5. Exact adapter responsibility

This section governs the **external Phase 5 compatibility adapter**, not M1's interactive executor. Preserve the submitted batch semantics, MSL inputs, profiles and golden results. M1's operator-declared encounter rule does not reuse external health math or redefine `MUTUAL_EFFECT` as loss. Any later bridge needs an explicit source/run coordinator and reviewed sample, altitude and continuation semantics before the external resolver can feed an interactive run.

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
| Shared action runtime (M1, planned) | One session-owned command draft, pending request identities and reconciliation; authority credentials remain private runtime/session data | UI drafts cannot alter world state. Receipts give request feedback; committed frame projections supply execution/outcome state. No per-pane command owner or lease-renewal timer. |
| Workspace/UI | WorkspaceBridge plus FlexLayout: view registry, active module, dock layout, ephemeral labels and renderer pool | FlexLayout is the only layout authority; renderer resources never enter serialized operational state. |
| Renderer runtime | Adapter instances, GPU objects, camera handles, hover hit results | Local disposable handles; emit intents, never mutate world. |

Implemented REST: `GET /api/missions`, `GET /api/missions/{id}/world`, `GET /api/missions/{id}/events?after=...`, `GET /api/recordings/{id}` and `GET /api/missions/{id}/observed-history?entityId=...&frameId=...&windowSeconds=60`. The last endpoint returns bounded observed samples anchored to an immutable committed frame, not replay playback. The opt-in `POST /api/fixtures/{id}/advance` is a deterministic test interface, not a simulation run or movement command. M1 adds supported command/run/outcome routes with generated contracts. Frame-at-time lookup, general replay series and `POST /api/compat/simulation/v1/resolve` remain later proposals. The frontend requests actions but does not implement simulation lifecycle rules.

WebSocket `GET /api/missions/{id}/stream` always starts with a complete atomic snapshot, then typed atomic deltas carrying mission, epoch, sequence and predecessor identity. Snapshot capture and queued subscription registration share the mission lock. Bounded queues request resynchronization on overflow; every reconnect resnapshots. There is no resumable backlog. Heartbeats report the last sequence actually sent on that socket. Cache removal remains distinct from Entity.presence=removed; use the generated stream schema for exact fields.

One WebSocket per session runtime, not per pane. Ignore duplicate sequence numbers; an epoch change or sequence gap triggers resnapshot. Display stale/disconnected status and inhibit new Move/Encounter admission until a current verified frame and source are available. Control/lifecycle/cancellation require fresh authoritative intent evidence rather than trusting an old displayed frame. An unknown command outcome is reconciled using the same command ID, not a new request that might repeat effects. On mission change, abort obsolete client reads, discard drafts and guard callbacks by generation; cancelling an HTTP wait is not cancelling an accepted backend command. Tag replay seeks with generations to discard slow obsolete responses.

The shared runtime presentation is the only view-facing world read path. Live and historical frame caches remain separate. Future replay must retain the last complete frame during seeking, continue live ingestion separately and provide Return to live; seeking/playback is not implemented. Phase 3B adds one selected-entity history owner and eight immutable cached results shared across panes. At most one read is in flight; newer frames coalesce. An older compatible result is displayed only with its actual through-time, trimmed to the current window and never beyond presented time. Identity/epoch changes cancel obsolete work.

M1 preserves that presentation boundary: a newer HTTP execution result cannot silently overwrite conditions or positions in an older presented frame. It can report receipt or “awaiting world sync”; frame-keyed projections and frame-anchored detail reads supply operational state. Group selection retains the one primary-entity history owner. Run/command journal events recorded while paused may share effective time but have distinct recorded time/sequence; playback must retain their order. UTC+8 wall time, source simulation time, report-receipt age and replay cursor are separate clocks.

Initially use discrete frame playback for correctness. Later position interpolation may operate in the shared presentation layer using bracketed samples and a common clock; condition, presence, health, events, classifications and assignments always change discretely. No renderer's clock may advance mission time. Do not synthesize predictions from future replay data. Persist initial world state, role metadata, subsequent frames and event references so replay reconstructs more than drone positions. SQLite indexed checkpoints/frames are sufficient; no Kafka or event-sourcing framework.

## 7. Renderer adapters and continuity

The interface sketch below expresses the boundary, not the exact implemented renderer API. M1 will add only the group-pick, destination-pick, condition, requested-target and outcome-annotation contracts needed for its working slice; no command execution or canonical state enters either renderer.

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

M1 will give its new Singapore synthetic template a replaceable regional presentation profile using the existing configuration boundary. Existing fixture definitions remain intact. Any small movement-model extent is separately declared and validated; map navigation bounds do not become movement or encounter eligibility rules. Explicit ellipsoid source coordinates avoid an undisclosed MSL conversion in M1, but do not complete Phase 4 geoid/AGL acceptance or make basemap geometry suitable for route clearance.

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

M1 adds an identifiable **Fleet mode in the existing Tracks workspace**, a compact shared command composer and bounded execution/outcome readouts. Fleet membership is a local browser scope over managed entities, not a shared affiliation filter that hides opponents on maps. Shared selection, search/filters and the new condition filter retain explicit scope and reset. Preserve compact summaries and pinned inspectors; do not add a permanent large Fleet panel or redesign navigation. Concrete workflow and condition/observation treatments are specified in §10/M1.

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

### M1 — Interactive synthetic fleet demonstration

**Partially implemented: M1.1 complete and independently reviewed at 9.14/10. M1.2–M1.4 remain planned and are not authorised by the M1.1 request.** This extends the reviewed simulated-movement proposal into the smallest complete operator workflow, before the retained Phase 5 compatibility work. It uses existing Phase 3B and brought-forward map functionality; completing all outstanding Phase 4 fidelity/coverage requirements is not a prerequisite for the explicitly limited model below.

**Operator acceptance:** create a synthetic run → inspect friendly/opposing entities → select one/group of controllable assets → request movement → observe execution → initiate a notional encounter → inspect its outcome. Backend-only completion does not pass this milestone.

#### M1 scope and baseline capability gap

The following table retains the reviewed planning baseline before M1.1. Delivered M1.1 status and evidence are recorded in its slice below; the remaining M1 additions are still planned.

| Capability | Evidence before M1.1 | M1 addition |
| --- | --- | --- |
| Tactical/Cesium, affiliation symbols and independent cameras | Implemented in Phase 3A/3B and map refinements | Preserve resources, shared context, retention, recovery and attribution; supply an explicitly interactive synthetic source. |
| Tracks browser, summaries and pinned inspectors | Implemented; one row per Entity and one selected displayed-track history | Fleet mode, group actions, control/execution information and inspectable outcome detail. |
| Selection collection and Asset roles | Modeled, but picking currently replaces the primary selection and no command grant/executor binding exists | All-member highlighting and explicit Asset-to-executor/control-source binding. Friendly affiliation is not authority. |
| Movement and interactive run UI/API | Absent; fixture advancement is a test interface | Destination authoring, admission, execution, cancellation and repeatable run creation/control. |
| Encounter requests and resolution | Absent; external Phase 5 is deferred | One-pair operator-declared notional handler, request composer and correlated outcome. |
| Non-operational condition | Generic Entity field exists; current scene carries staleness rather than condition | Both-renderer condition treatment and a new shared condition filter. |
| Recording and generic events | Implemented; no interactive execution journal/checkpoint semantics | Durable receipts, execution/model identity and atomic recorded outcomes. Playback and analytics remain later work. |

Use a **new, explicitly synthetic Singapore template**; do not rename or alter Alpha, Bravo, Tactical or Observations fixtures. Include enough authored cases to verify group movement, an opposing virtual entity, a friendly observation without a movement grant, and missing/stale input handling. These are test cases, not a fleet-size commitment. Initial opposition can remain stationary. Initial positions are authored, but losses and later positions arise from operator requests and current execution state, not a timed loss script or preauthored encounter sequence.

The first encounter is **one friendly participant plus one opposing virtual entity**. Group movement is included; group encounter allocation/pairing, automatic approach and proximity-triggered resolution are not. The versioned rule **Notional mutual loss v1** explicitly declares both participants non-operational. No probability/health calibration, physical effect, collision or real-world prediction is implied. If automatic geographic convergence is required later, review a distinct eligibility/execution model rather than presenting this rule as one.

#### M1 workbench and selection

- **Entry:** Tracks Activity Bar → **All entities / Fleet** modes. An **Open Fleet** action from the selection summary opens/focuses the existing workbench item. Reuse TanStack Table, Entity rows and selectors; no second operational store or duplicated fleet table implementation.
- **Fleet scope:** list explicitly managed Entities once, including unavailable assets. Label visible managed-Entity counts versus total managed Entities; Track/role counts are different. Fleet membership is table-local UI state, not a shared filter that hides opposing map symbols. Empty Fleet explains the absence of managed resources.
- **Shared filters:** existing search/source/affiliation/classification/observation/presence/zone filters remain explicitly shared. Condition filtering is new and defaults to all conditions, retaining newly non-operational entities. Show filtered selection reasons and a reset; never recenter because of filters.
- **Controls:** Fleet toolbar offers Move, Simulated encounter and execution-specific Cancel. Its Simulation menu offers New demo run, Acquire control, Start, Pause, Resume and End. Eligibility, pending requests and failures are visible, keyboard-accessible text; not only disabled-hover tooltips. Run controls do not move into the wall-clock header.
- **Composer:** one shared draft, displayed in a compact normal workbench pane that can open to the side. Switching maps keeps that draft; starting/replacing one is explicit. Ordinary frames cannot silently change draft participants or destination coordinates. Pending requests and bounded execution rows remain accessible when summaries close.
- **Group selection:** table checkboxes/keyboard and modifier symbol picking update one shared Entity collection. Primary selection drives individual summary/details and the existing single observed trail; other members get neutral outlines. Pinned inspectors remain bound to their mission/entity. Do not open one inspector automatically per group member.
- **Exceptions:** hidden, stale, unlocated, unauthorized and missing selected identities remain explicit. Show selected/eligible counts and reasons; an operator must remove exceptions rather than silently dispatching an eligible subset. Resolve ambiguous Asset/control-source bindings explicitly. A displayed Track is a presentation choice, never a command-routing decision.
- **Opponent selection:** a dedicated encounter pick mode or searchable same-run list fills the opposing-participant field. It does not convert that Entity into a controlled Fleet selection. Picking works from either map; source/condition eligibility is checked by the backend. A filtered candidate is labelled as such rather than silently changing shared filters.
- **Detail on demand:** summary and inspector add only supplied eligibility, bound control source, target/reference, execution state/reason and recent outcome references. Preserve copyable identifiers, values and timestamps; technical audit stays behind disclosure. No invented battery, confidence, readiness, assignments or ETA.

#### M1 run entry, movement and encounter interaction

**Repeatable entry.** Simulation → New demo run is enabled only for the explicitly configured synthetic template. An idempotent backend operation creates fresh mission/run/recording IDs and commits an initial paused frame before the frontend loads it. Completed recordings are never reset in place. Initially permit one nonterminal interactive run per local backend: reopen the existing run, or explicitly End it before creating another. Loading another fixture mission does not End the run. The limit bounds background executors without restricting existing read-only fixtures or later compatibility input limits.

Acquire demo control explicitly. One local session holds a mission lease; public holder identity is distinct from its opaque authority credential. The template provides Asset movement grants and a separate scenario-action capability for modifying virtual opponent state. A friendly Asset grant alone cannot authorize an encounter; the same demo operator may hold both permissions.

| Interactive control | Proposed meaning |
| --- | --- |
| Start | Activate the seeded executor and its source clock. |
| Pause | Freeze simulation time and suspend active movement; reject new Move/Encounter admission. |
| Resume | Continue suspended movement. Accepted, unevaluated encounters remain subject to their original expiry and current eligibility. |
| End | Terminalize unfinished execution, finalize the recording and retain inspectable outcomes; do not mark every Entity non-operational. |
| New demo run | Create a new identity/recording from the template after the previous run is terminal; never revive losses by rewriting the old run. |

Cancellation and lifecycle/expiry processing remain possible while simulation time is paused; they do not fabricate source observations or advance movement. Their journal changes may share effective time and are ordered by committed sequence. The exact transition matrix and rejection codes are an M1.1 contract gate. These are **interactive executor controls**, not external START/HOLD/RESUME/ABORT aliases or replay playback controls.

**Move.** Select eligible assets → Move → author longitude/latitude in Tactical top-down or by numeric keyboard input → review exact per-member endpoints and references → Submit. Cesium displays selection, targets, movement and outcomes; its Move entry opens/focuses Tactical destination authoring initially. Use each supplied **WGS84 ellipsoid height**, held constant. No MSL/AGL reinterpretation, 3D roof picking, takeoff or landing. Temporary top-down authoring is an explicit tool action and restores the pane's prior perspective on exit; other pane cameras are untouched.

For group movement, translate captured horizontal offsets from the selected group's centroid to the requested anchor in a declared local metric frame. Show every endpoint before submission. Invalid/coincident endpoints require explicit revision. This is geometric convenience, not formation control, task allocation or separation assurance. The template starts already positioned; a constant-speed fixed-step kinematic model moves horizontally within its declared small model extent. Proposed cadence is 5 Hz, subject to measurement. No planner, wind/dynamics, obstacle avoidance or clearance model is included.

Neutral draft/requested/accepted destination marks differ from affiliation symbols at reported positions and the bounded observed trail. No “planned route” layer exists without a planner. Busy assets initially reject a new Move; use execution-specific Cancel, confirmed termination, then a fresh Move. Group admission is all-or-none, but accepted members have individual completion/failure outcomes. Keep one primary history request owner, not a request per selected member.

**Encounter.** Choose a friendly managed participant → Simulated encounter → explicitly pick one opposing virtual Entity → review participants, input state and profile → Initiate simulated encounter → inspect receipt/execution/outcome. The preview says **“Operator-declared; no approach, proximity or clearance model. Both participants become non-operational.”** It freezes participant/profile identities and review references, and explains that execution uses their current backend positions when processed.

Require the same interactive run/source authority, operational condition, supplied positions in supported frames and fresh reports; require movement authority for the friendly participant and separate scenario-action authority for the pair. Live/import/replay or unrelated simulation identities cannot be mutated. Do not infer eligibility from affiliation, visible proximity, basemap geometry or a display filter.

Evaluate at the next eligible simulation tick. Expose actual Received, Executor accepted, Evaluating and Completed/Failed/Expired/Cancelled states; a cheap handler can finish immediately, without a fake countdown or progress percentage. Within the mission-serialized command/tick path, drain requests in server order and recheck run, executor epoch, participant state/source, cancellation and deadline. Reserve the pair for that tick, apply the outcome and terminate its movement **before** advancing that tick's movement. Other assets continue. Overlapping encounters cannot consume the same participant twice. Record preview anchor and actual evaluation frame/tick separately.

A cancellation processed before evaluation prevents it; cancellation after committed completion reports the terminal outcome and does not undo it. A new request against a non-operational participant is ineligible; a duplicate request returns the original receipt and outcome references. Merely waiting, navigating or passing through an opponent does not trigger this operator-declared rule.

#### M1 condition and outcome presentation

**Grey alone is insufficient.** Condition, observation state, presence and UI visibility must remain independently interpretable and composable; a non-operational entity can later become stale.

| State | Map treatment | Browser/inspector treatment |
| --- | --- | --- |
| Non-operational simulated Entity | Neutral slashed/shaded condition variant with persistent NON-OP label; retain affiliation shape/outline/text and readable hit target. | Condition, notional cause, outcome time and execution consequences. |
| Stale/disconnected source | Existing stale observation treatment, age and connection indication; not a loss symbol. | Last actual report and source/connection state. Heartbeats do not make observations fresh. |
| Unlocated Entity | No invented position. | Discoverable row/details with position unavailable. |
| Hidden by filters | Hidden in normal projection, without mutating domain state. | Retained selection explanation and reset. |
| Ended Track | LAST OBSERVED/ENDED with timestamp, not evidence of loss. | Ended observation and independent Entity condition. |
| Missing identity | No substitute selected. | Pinned identity with explicit unavailable/inactive-mission context. |

For this synthetic model, set `Entity.condition=non-operational`, preserve affiliation and `presence=present`, and continue authoritative stationary observations while the source runs. A virtual object still exists at its computed position; loss does not automatically set `Track.state=ended` or `presence=removed`. In Cesium, disclose a **frozen simulation position**, not ground wreckage. Do not add falling motion or terrain snapping. Report zero speed only because the executor supplies it; missing speed remains unavailable.

In **one authoritative transaction**, commit both participants' conditions, affected Asset availability/control eligibility, movement termination, checkpoint and outcome events. Active movement terminates as Cancelled with an explicit simulation-loss reason; already completed movement stays completed, and surviving group members continue. Reject pending new movement for lost participants. The initial template has no assignment engine: no automatic Task per click, invented Task status or rewrite of unrelated supplied Tasks. Any executor-owned Task integration requires an explicit lifecycle policy.

Use a brief neutral acknowledgement, honoring reduced motion, and bounded dismissible annotations tied to each participant's actual recorded position with a shared event reference. Do not invent a physical encounter midpoint for distant participants. Keep NON-OP labels and outcome details after temporary cues disappear. Fleet retains unavailable rows and distinguishes managed, controllable and non-operational counts. Marker visibility is a shared overlay setting; dismissing an annotation does not remove the recording. No explosion/glow/radius effect or celebratory counter is required.

#### M1 authority, contracts and recording

```text
Fleet / summary / composer / map picks
              ↓
shared session draft + command reconciliation
              ↓ REST intent
backend mission authority: identity, grants, revisions, expiry, idempotency
              ↓
SQLite durable receipt / pending execution journal BEFORE execution
              ↓
in-process kinematic executor / notional encounter handler → candidate changes
              ↓
ONE atomic checkpoint + execution transitions + world + event commit
              ↓ adopt executor state, then publish via existing WebSocket
shared complete presentation frame → Tactical / Cesium / Fleet / inspectors

future Phase 5 resolver + adapter → same authority through a separate boundary
```

The browser authors intent; renderers only pick and project. The backend owns accepted intent and state transitions. Pure handlers cannot publish or advance canonical in-memory state before successful recording. Reuse the single-process mission service and SQLite writer; no microservice, broker or event-sourcing framework. Persist pending work for the mission service to drain; do not introduce a second world writer or a per-pane executor. Keep the isolated workspace harness separate from operational command state.

| Proposed contract | Minimum responsibility |
| --- | --- |
| AssetControl | Mission/Asset/Entity, explicit executor and control Track/source, capabilities and accepted position references, eligibility/reason, public holder/control revision and report-health timing. |
| Move request / per-member Execution | Stable request identity, mission/run, reviewed frame, binding/executor revisions, exact member targets; durable receipt, executor acceptance/start and confirmed terminal evidence. |
| Interactive RunStatus | Typed module-owned executor lifecycle/source-clock state; independent of external simulation lifecycle and generic Mission lifecycle. |
| Encounter request / Execution | Exact pair, profile/model identity, reviewed input references, source/control revisions and expiry evidence; actual evaluation tick/frame and outcome correlation. |
| Outcome detail | Requester public identity, notional assumptions/model version, pre/post state, affected entities and execution consequences; committed frame/event references. |
| CommandReceipt | Original immutable receipt/admission result. Current execution status is a separate read, not an overwritten retry response. |

Record canonical request/hash, exact participants and control sources, review/evaluation frame/tick, receipt/accept/start/terminal transitions and reasons, source/effective and recorded times, ordering, executor epoch and checkpoint. A movement completion references a committed sample, not just command acceptance. Simulation-specific details stay in typed module contracts; core retains condition, availability and generic events rather than health/RED/BLUE or weapon-specific fields.

Plan a coordinated internal world/stream update (proposed **1.1**), OpenAPI/explicit WebSocket schemas, generated frontend types and runtime semantic validation. Existing strict 1.0 clients cannot silently accept added fields. Define export paths/version compatibility at M1.1; add a small SQLite journal/checkpoint migration and legacy recording readers without rewriting original stored JSON, identities, timestamps or receipts. Retain one complete frame containing a bounded execution/module projection with atomic outcome changes; use bounded, frame-anchored detail reads for the journal. A newer HTTP result may say “received / awaiting world sync” but cannot change an older frame's map condition or position.

Credentials remain private runtime/session data, outside WorldFrame, recording journal, URLs, logs and screenshots; public holder identity is not the credential. Persist pending request identity/content before sending so reload/reconciliation can use the same command. Preserve normal read-access checks when looking up stored receipts. The current source/Entity/Asset mapping, not presentation-track arbitration, selects the executor. Group selection keeps the existing one-primary-entity history cache/read owner.

#### M1 failure and clock policies

These are proposed local-demo defaults, not measurements or requirements for physical vehicles.

| Case | Required policy and verification |
| --- | --- |
| New Move/Encounter expiry | From a reviewed running source frame, deadline is that committed frame's backend `recordedAt + 30 seconds`. Resolve the anchor in storage and check at admission and before initial execution/evaluation. Retries cannot renew it; a new preview is explicit. It is a start/evaluation deadline, not a maximum movement duration. |
| Long pause / lifecycle intent | Start/Resume/End, control acquisition/renewal and execution cancellation use fresh backend-issued short-lived intent evidence plus relevant run/execution revision, independent of the paused frame's age. Delayed obsolete intents reject; newly authored Start/Resume/Cancel/End remain possible after a long pause. |
| Duplicate / lost response | Same mission-scoped command ID plus same canonical payload returns the original receipt; changed payload conflicts. Receipt lookup precedes new-admission lease/freshness checks. Query current outcome separately. Persist pending identity; no new ID on timeout. New-run creation is separately idempotent by creation request ID. |
| Local ownership | Atomic explicit mission lease acquisition, proposed 30-second lease and renewal every 10 seconds by the shared runtime. An unexpired holder cannot be silently displaced; reclaim is explicit. Public holder/revisions are separate from the credential. |
| Accepted-work continuation | Current lease gates new admission. Once executor acceptance is committed, lease expiry alone does not cancel work. Continue checking run, executor epoch, participant/source state, cancellation and applicable deadline. Explicit capability revocation is separate and recorded; do not recheck the browser's current lease on every execution tick. |
| Optimistic concurrency | Validate per-Asset binding/control/busy revisions and executor epoch; do not require equality with a global frame sequence changing at 5 Hz. Validate the operation's own accepted state, not reject it merely because admission marked its asset busy. |
| Pause / expiry race | Pause suspends movement and unevaluated encounters. Service cancellation/lifecycle/deadline processing independently of frozen simulation time; an expired pending encounter cannot apply on Resume. End terminalizes unfinished work. |
| Freshness | Observation lag uses the source simulation clock; delivery/executor-health age uses elapsed time since a real report. Healthy WebSocket heartbeats never reset that timer. Proposed running-source stall threshold is 2 seconds at 5 Hz. Intentional Pause is labelled/ineligible, not destruction; unknown clock relationships remain unknown. |
| Connection loss | Preserve the last complete frame as visibly stale; block new Move/Encounter until current verified state/source. HTTP timeout is outcome unknown, not failure. Accepted backend execution may continue; reconnect resnapshots and reconciles original request IDs. |
| Mission / pane lifecycle | Discard draft and obsolete client work on mission switch; stop renewing the old lease. Keep accepted backend work independent of navigation/close/eviction. Generation guards reject obsolete replies; retained renderers resume the latest complete frame with their own cameras. |
| Cancellation / overlap | Target a specific execution ID. Server order determines whether cancellation or completion/evaluation wins. Terminal outcomes cannot be undone; late cancellation cannot affect a replacement. Reserve encounter participants within the tick so overlapping requests cannot duplicate loss. |
| Backend restart | Restore last checkpoint; issue a new executor epoch distinct from the persisted transport epoch. Record unfinished synthetic execution Interrupted, start source paused, and break observed history through source/series/discontinuity metadata. Preserve committed losses exactly once; no auto-resend, catch-up or resurrection. |
| Persistence failure | Adopt/publish no candidate movement, success or outcome before the complete transaction commits. A failed receipt commit cannot reach the executor. |
| Replay | Read committed records; never re-execute encounters, dispatch commands or overwrite live cache. Record paused equal-effective-time events with sequence ordering. |

#### M1.1 — authority, contracts and repeatable run entry

**Complete; final independent review 9.14/10 after three rounds, with no unresolved material finding.** New → Acquire → Start → Pause for more than 30 real seconds → Resume → End → New works through the operator UI. Verification: 136 backend and 145 frontend unit tests pass; the full 73-case browser suite passes, followed by all four affected M1 cases on the final receipt-lookup correction. Type, lint, formatting, contract drift and production-build checks pass. Immutable receipts/reconciliation, explicit ownership/reclaim, coordinated world/stream 1.1 and SQLite schema 2 with unchanged legacy reading are exercised. [Contract decisions, screenshots and review evidence](m1.1/REVIEW.md). Movement and encounters remain unavailable; this does not complete M1. Stop here for user review.

- **Files/modules:** proposed `backend/app/commands/{contracts,service}.py`, `simulation/interactive/{template,run}.py`, API command/run routes, recording journal/checkpoint migration and tests; existing contract export/generation/runtime decoder; minimal Fleet mode entry and Simulation menu in `frontend/src/features/entities/*` plus `features/fleet/*`.
- **Dependencies:** Phase 2 mission authority/recording and Phase 3B workspace/read models. Existing FastAPI/Pydantic/SQLite/Ajv/Zustand/Radix/TanStack stack; no new infrastructure dependency.
- **Interfaces:** AssetControl, immutable receipt, explicit local grant/lease and intent evidence, run identity/lifecycle, internal version migration. Freeze the precise transition matrix, rejection codes, module projection and lifecycle-intent wire shape before executor/UI work depends on them.
- **Acceptance:** New demo run → Acquire control → Start → Pause over 30 seconds → Resume → End → New demo run works through UI, with prior recording intact and one nonterminal interactive run. Existing fixtures remain unchanged. Duplicate creation/command identity, conflicting payload, lease reclaim, obsolete lifecycle intent, and wrong mission/source/grant/epoch/reference all have deterministic tests. Legacy records remain readable without mutation.
- **Risks:** paused-frame expiry deadlock, ownership confused with affiliation, silent takeover, contract drift, non-idempotent run creation and unintended changes to historical recordings.

#### M1.2 — complete movement workflow

- **Files/modules:** `simulation/interactive/kinematics.py` and checkpoint integration; Fleet browser mode, group selection, Move composer/execution list and summary/inspector additions; shared runtime command client and proposed scene/renderer target-pick contracts in existing adapters.
- **Dependencies:** M1.1. Reuse current map SDKs, shared primary history and test tools; no route-planning library or additional state system.
- **Interfaces:** frozen per-member Move intents, displayed-versus-control source disclosure, authoritative per-member execution, neutral requested-target projection, one shared draft.
- **Acceptance:** find → select one/group → preview exact endpoints → submit → observe committed movement/progress/completion and trail in both maps. Friendly-but-uncontrolled cases reject; no silent subset, fabricated altitude, ordinary-frame refit or renderer recreation. Cancellation and partial execution failures remain truthful. Keyboard/narrow panes work and one primary history owner remains.
- **Risks:** mistaking acceptance for arrival, sending to the display source, group selection losing exceptions, expired first delivery, unsupported altitude conversion and browser arrival-time motion.

#### M1.3 — complete notional encounter workflow

- **Files/modules:** `simulation/interactive/encounters.py` with versioned notional profile, typed module details/journal and atomic outcome integration; pair composer, condition filter, shared scene/symbology and both renderer annotations/inspector detail.
- **Dependencies:** M1.2, so effects can be verified against actual active movement. No external Phase 5 resolver or probability-model dependency.
- **Interfaces:** exact-pair Encounter request/execution, scenario-action grant, preview/evaluation anchors, generic condition/availability/event updates and execution termination.
- **Acceptance:** time/proximity alone never produces loss; the requested encounter evaluates current state. While F-01/F-02 move, an F-01/O-01 encounter changes both participants to non-operational and cancels F-01 in one committed frame; F-02 continues and unrelated entities/tasks remain unchanged. Both maps, Fleet and pinned inspectors agree. Duplicate/overlapping requests, pause/expiry/cancel races, restart and failed storage are covered. Non-operational/stale/ended/unlocated/filtered states are distinct and inspectable after transient markers disappear. No fake countdown or physical-effect presentation.
- **Risks:** double application, movement overwriting loss, completed tasks incorrectly cancelled, state dimming confused with disconnect, and UI suggesting proximity/intercept fidelity the model lacks.

#### M1.4 — integrated verification and review

- **Files/modules:** backend/frontend regression suites and deterministic fixtures, actual browser workflows, contract/build checks, future M1 review evidence and `docs/demo-runbook.md` additions.
- **Dependencies:** M1.1–M1.3. Existing test stack; preserve source hashes and completed evidence.
- **Interfaces:** full operator workflow, source/command/frame correlation, provider and renderer lifecycle, failure diagnostics and reproducible run setup.
- **Acceptance:** backend/frontend tests, generated-contract drift, lint/type checks and production builds pass. Exercise both maps with lost HTTP response, socket gap/outage, stalled executor with healthy socket, obsolete mission callbacks, storage rollback/restart, lease expiry/reclaim and lifecycle requests after a long pause. Test 20 tab/mode switches plus resize/close/reopen, independent cameras, no ordinary-frame recreation, one backend subscription, one primary history owner, existing renderer limits/provider recovery/attribution. Measure a proposed ten-minute small-demo 5 Hz workload against matching existing visual quality; report update lag, request/resource evidence and limitations rather than asserting unmeasured gains. Capture desktop/narrow/focus/outcome/stale states and obtain independent implementation critique. Backend-only completion fails the UI gate. Stop for review before another milestone.
- **Risks:** replacing working retention/provider behaviour, hidden duplicate command owners, confusing callback timing with GPU performance, and treating a small synthetic workflow as full production or simulation-validity acceptance.

#### M1 walkthrough and decision boundary

Create/start the demo; select F-01/F-02, preview Move and submit. Fleet shows the durable receipt, executor acceptance and reported movement in both maps. Choose F-01 and O-01 in the encounter composer, review the notional rule and submit; lose the HTTP reply. The UI shows outcome unknown, not immediate loss. Backend commits the pair outcome and F-01 cancellation while F-02 continues. If the socket also drops, retain the last frame as STALE and block new Move/Encounter. On reconnect, resnapshot and reconcile the original ID; show real outcomes without another execution. F-01/O-01 remain selectable and their inspectors explain model/evaluation time/termination. F-02 completes only on committed evidence. If the request never arrived, same-ID retry is valid only within its original deadline; otherwise require a fresh preview without inventing an outcome.

The decisive product assumption is **operator-declared notional pair loss, not automatic geographic encounter detection**. Group movement, a stationary authored opponent, one local interactive executor and explicit ellipsoid coordinates keep the workflow bounded. Automatic approach/proximity, group encounter allocation, physical vehicles, pathfinding and swarm behaviour require separately reviewed scope. The exact lifecycle-intent format and state/error matrix remain bounded M1.1 decisions, not reasons to add a broader fleet-management system.

### Phase 5 — simulation compatibility end to end

**Deferred. Recommended after M1 in the revised delivery order**, beginning with the retained bounded resolver/adapter slice and explicitly reviewed compatibility policies; this document does not authorise its implementation. M1 changes the delivery order, not this phase's external contract or acceptance obligations. There is no technical requirement to depend on the interactive executor when validating the pure compatibility resolver.

This phase supplies external run controls and outcome integration, not per-drone Move/destination authoring by implication. M1's notional pair result is not conformance evidence. The submitted batch contract has no streaming append/tick command or selected-pair mask and requires MSL inputs. Do not emulate interaction streaming with repeated START or hidden HOLD/RESUME loops. Initially evaluate compatibility in separate missions/runs so its adapter cannot overwrite an interactive executor. A later bridge requires an explicit single-writer/source coordinator, run/sample continuation policy, selected-input scope, altitude mapping, profile governance and next-input-state/correction rules. Preserve §7's golden health-60 ACTIVE result and all organiser ambiguities.

- **Files/modules:** backend `simulation/*`, `adapters/simulation_v1/*`, compatibility route, complete contract fixtures/tests; frontend `modules/counter-uas/*` controls/details.
- **Dependencies:** Python stdlib hashing/decimal handling; add a polygon library only if its validated semantics reduce risk. Existing transport and persistence stack suffices.
- **Interfaces:** exact external request/response, resolver, lifecycle service, idempotency registry, profile registry, adapter mapping and typed module details.
- **Acceptance:** published golden result matches; all §10 negative/boundary cases covered; same canonical command returns stored result without duplicate recording; conflicting content gives 409; HOLD/RESUME/ABORT are backend acknowledged. Neutral/unknown/out-of-area rows persist; simultaneous outcomes and discontinuities are correct. No raw external drone schema enters core/frontend world state. Sparse 10,000-drone fixture passes and dense scaling is measured separately.
- **Depends on:** Phase 2 foundation, Phase 0 resolved compatibility decisions; Phase 4 enables visual verification.
- **Risks:** unresolved error semantics, quadratic result size, duplicate JSON keys, numeric ordering/rounding, transaction/idempotency races. Do not claim full compatibility while ambiguities remain unresolved.

### Phase 6 — Command Picture and Vertical Engagement Profile

**Deferred.** Current Command Picture/Vertical Profile are clearly labelled placeholders, not working analytics. Requires truthful supplied aggregates, declared profile origin and a reviewed common altitude-reference policy; no decorative metrics or invented readiness.

M1's Fleet mode is an individual-resource control surface, not Command Picture completion. Later aggregates may use supplied condition, availability and execution/outcome records, with managed/controllable/non-operational denominators kept distinct. A notional loss count is not a real-world effectiveness or readiness metric. M1's ellipsoid-only fixture does not replace common-reference acceptance for mixed external MSL/AGL data.

- **Files/modules:** `command-picture/*`, `vertical-profile/*`, reusable chart host with owner-document lifecycle, domain/module selectors.
- **Dependencies:** Apache ECharts (reuse spike dependency, no second chart library).
- **Interfaces:** frame-keyed aggregates, profile origin and altitude transform, chart click→ObjectRef selection, bounded history query.
- **Acceptance:** three meaningful widgets and the profile read the same frame as maps; chart selection highlights the correct entity everywhere; unknown resource data stays unknown; profile has labeled distance origin, altitude reference and discontinuities. Opens as card, tab and supported side view.
- **Depends on:** Phases 3–5 for the original counter-UAS acceptance; include M1 projections only after their contracts are delivered. Can develop selectors against Phase 2 fixtures while the external adapter is completed. Vertical Profile still requires the reviewed common-altitude policy.
- **Risks:** misleading counts, radial distance mistaken for cross-section, charts recomputing on every camera movement.

### Phase 7 — Timeline and replay

**Deferred.** Durable recordings and bounded observed-history inspection exist; frame seeking, playback/scrubbing, event navigation and complete seek lifecycle remain unimplemented. Phase 3B is not replay acceptance.

Extend future replay acceptance with M1 requests, execution transitions, interactive run lifecycle and notional outcomes. Reconstruct from committed frames/journals and preserved model identity; never rerun the executor or encounter handler, dispatch a Move, renew a control lease or feed replay results into the live cache. Interactive Pause freezes source time; playback pause only freezes viewing. Preserve equal-effective-time journal ordering and disclose corrections separately from the external v1 lifecycle.

- **Files/modules:** backend `replay/service.py`, `api/replay.py`; frontend `historyCache.ts`, `replayClient.ts`, `timeline/*`, presentation selector replay branch.
- **Dependencies:** existing SQLite/ECharts/time primitives; no timeline framework.
- **Interfaces:** recording metadata, effective-time frame lookup with sequence tie-breaker, bounded series/event ranges, TimeState and seek-generation token.
- **Acceptance:** scrub and play through the defensive synthetic scenario; all views resolve the same frame; external simulation health/status change at exact timestamps and retain interaction IDs/draws/corrections. Also reconstruct an M1 movement/encounter run, including request/acceptance/termination and atomic non-operational changes, without replay dispatch. Live updates continue in their own cache; Return to live reaches latest state. Repeated/rapid seeks cannot show stale responses. External HOLD, interactive Pause and playback pause are visibly distinct; finalized ABORT and M1 End recordings reopen after restart.
- **Depends on:** Phase 2 recording, Phase 5 simulation records and Phase 6 shared analytic projections for original acceptance; M1 journals for the added interactive scenario. Recording these events in M1 does not implement this replay UI.
- **Risks:** incomplete initial metadata, live/replay contamination, mixed moments, history memory growth, future-data leakage through prediction.

### Phase 8 — split panes and one pop-out proof of concept

**Partial, brought forward:** working tabs/splits/context menus and simultaneous independent maps are complete. Isolated harness pop-out feasibility is complete. Real analytic pop-out with shared operational context, child resize/focus/close, popup failure and opener-lifetime acceptance remains deferred until those views exist. Do not enable operational pop-outs based solely on the harness.

M1 uses the existing workbench host and does not bring operational pop-outs forward. Any later child view shares the session's command reconciliation and lease owner as well as its world subscription; opening/closing a window cannot acquire another controller or cancel accepted execution.

- **Files/modules:** finish `docking.ts`, layout bridge, `windowContext.ts`, `popout.html`, owner-document chart/control integration, workspace e2e tests.
- **Dependencies:** selected docking library only; browser primitives as required by the selected model.
- **Interfaces:** open-to-side/move/close/pop-out, pane resize/visibility, shared session runtime; child bootstrap/UI revision protocol only if independent runtimes were chosen.
- **Acceptance:** Map + Vertical Profile + Timeline arrangement; simultaneous Tactical/3D; move views without losing context; pop Command Picture/Profile to another window, change selection/replay time and verify agreement. Resize, close and reopen child; blocked popup leaves usable docked view. No duplicate backend commands/subscriptions or leaked renderers. Document opener-lifetime limitation.
- **Depends on:** Phase 1 tab host and Phases 4, 6, 7 real views. Phase 0 already proved basic pop-out feasibility.
- **Risks:** wrong document listeners, hidden-opener throttling, browser popup rules, chart sizing and focus loss. A single working analytic pop-out is sufficient; map detachment is optional.

### Phase 9 — demo hardening and acceptance

**Deferred beyond current regression coverage.** No complete simulation/analytics/replay demo or worst-case throughput certification exists.

Retain the original canonical counter-UAS demonstration and add M1's interactive creation/movement/encounter/loss-recovery workflow. Neither substitutes for the other. In particular, notional pair loss does not discharge external compatibility, replay, map-fidelity or physical-operations obligations.

- **Files/modules:** Playwright critical-flow tests, backend conformance tests, synthetic scenario/recording fixtures, `docs/demo-runbook.md`, environment/config examples and build checks.
- **Dependencies:** existing test tools only.
- **Interfaces:** canonical demo from product §42, defensive scenario from simulation §9, M1 interactive run/request/outcome contracts and provider failure/reconnect recovery.
- **Acceptance:** clean install/build and complete rehearsed original demo: load → Tactical → select/details → 3D → profile → command aggregates → HOLD acknowledgement → replay → split/pop-out. Also create/run/end/recreate M1 through UI and verify movement plus an encounter across a lost response/reconnect, retaining inspectable outcomes. Check 1440p/4K, keyboard access, production paths, one lost connection and one failed provider. Publish measured performance and explicit remaining limitations.
- **Depends on:** all deliverable phases.
- **Risks:** network-dependent demo, last-minute scope growth, machine-specific GPU/browser behavior. Keep a deterministic recorded demo and clearly labeled fallback basemap.

## 11. Acceptance budgets and exclusions

Provisional interactive target: 200 entities at 5 authoritative updates/second, 60 seconds of visible history, both maps plus two analytic panes. Aim for at least 30 FPS on the selected demo machine and local selection feedback within 150 ms; record actual numbers rather than asserting them in advance. Cold 3D tile loading is measured separately from warm renderer switching. UI counters need not update at animation frequency, but all display the same committed frame/cursor. Performance failure first triggers batching, bounded history and less expensive symbols, not deck.gl by default.

M1 first verifies a small explicitly authored demo, proposed 5 Hz execution and a ten-minute workflow/recovery session. Measure command receipt latency, committed update lag, frame intervals, network requests and available resource accounting at matching camera/viewport/quality settings. This is neither a measurement already obtained nor proof of the 200-Entity/both-maps/two-analytics budget. Keep the existing selected-history limits and bounded renderer retention; do not improve numbers by silently reducing settled geographic detail.

Compatibility tests include every required case in simulation §10, with special attention to exact radius/boundaries, canonical ordering, duplicate parsed timestamps, health/status invariants, immutable profiles, and lifecycle/idempotency. UI tests cover continuity after switches and reconnect, filter/overlay agreement, stale/missing selections, replay isolation, schema drift and window lifecycle. Use deterministic shared read-model assertions plus focused screenshots; do not rely solely on unstable network tile pixels. Test the final chosen versions and production build on the demo browser.

**Narrow scope revision:** permit M1's virtual movement intents, minimal local demo authority/run controls and explicit notional pair resolution, including the required operator UI and recording. These are planned deliverables, not implementation authorization from this document. They do not authorize the excluded capabilities below. Basic macro-level intent is consistent with product §2.1; no source-specification rewrite is needed.

Explicitly do not build during the hackathon:

- HADR functionality, generalized plugin/module loading, arbitrary dashboard builders.
- Full desktop window management, independent-window survival, multi-monitor restoration or saved workspace migration.
- Real aircraft dispatch, live-source simulation input, route/path planning, automatic approach/pursuit, target optimization or detailed vehicle-control interfaces. M1 destination authoring is horizontal Tactical intent only; Cesium destination authoring remains outside the first milestone.
- Additional M1 interactive group encounter allocation/pairing, automatic runtime proximity-triggered encounters or swarm coordination. This exclusion does **not** remove Phase 5's required batch eligibility, opposing-pair formation and resolution over submitted samples.
- Physical weapon/effect models, falling/debris/terrain-impact animation or claims of clearance, physical destruction or real-world encounter prediction.
- New probability/calibration research or claims of empirical validity; fixtures remain NOTIONAL.
- Sensor fusion, invented confidence/coverage/readiness, terrain line-of-sight or validated collision/clearance analysis.
- Automatic prediction/assignment engines; use declared scenario data only when needed for continuity demonstrations.
- Advanced policy/authority UI, enterprise access control, multi-operator collaborative editing, HA/distributed backend infrastructure. M1 still requires the explicitly bounded local capability/lease/revision checks; excluding advanced authority UI is not permission to omit command admission checks.
- Offline/on-premises packaging, mobile/tablet redesign, a new PMTiles/MBTiles generation pipeline, a complete Storybook catalogue. Reproducible setup of the already-reviewed local archives is implemented and does not authorise a new tiling pipeline.
- Extra visualization engines, microservices, global event buses, unlimited browser history caches, or full worst-case dense simulation processing presented as a proven capability.

## 12. Next-phase prerequisites and unresolved decisions

**Next recommended order:** Phase 3B review checkpoint → M1.1 authority/run entry → M1.2 complete movement workflow → M1.3 complete notional encounter workflow → M1.4 integration review → retained Phase 5 compatibility slice → remaining analytics, replay, workspace and hardening acceptance. Outstanding map work can proceed under separate scope where needed; do not treat this order as completion of Phase 4. This documentation approval does not start M1 or any other implementation phase.

Before M1 implementation, preserve these reviewed boundaries: Fleet is a mode of the existing entity browser; only explicitly granted synthetic Assets are commandable; movement is group-capable, horizontal Tactical authoring at supplied ellipsoid heights; encounters are explicit one-pair notional loss without proximity/approach modelling; one local interactive executor/run and one session command/transport owner. A request for automatic geographic encounters or a broader authority model would materially change the milestone and needs a deliberate scope decision.

At the M1.1 contract gate, freeze the exact run-state transition/error matrix, fresh lifecycle-intent representation/expiry, Asset/control-source bindings, internal world/module schema version/export path and backward-reading migration. The accepted-work lease policy and long-paused Start/Resume/Cancel/End tests are required. Broader physical platforms, navigation, group encounter allocation and swarm algorithms are not prerequisites. No user question or organiser answer is silently inferred from these defaults.

**M1.1 implementation result:** this contract gate is now resolved in [the contract decisions](m1.1/CONTRACT_DECISIONS.md). Actual long-pause lifecycle UI, immutable reconciliation, explicit control and restart/migration behavior are verified; future accepted-work/cancellation semantics use bounded test doubles. No movement or execution-Cancel UI was added. This completes only M1.1; the order and later prerequisites above remain a plan, not permission to begin M1.2.

For the retained Phase 5 exact-conformance signoff, resolve or explicitly retain provisional policies for the organiser error envelope, aborted RESUME/missing lifecycle transitions, duplicate JSON keys/numeric canonicalisation, timestamp validation order and cross-command correction/run/profile semantics in [the compatibility decision register](../contracts/simulation/compatibility-decisions.md). Preserve golden fixtures and keep dense-output scale distinct from sparse maximum-input validation. M1 does not resolve these questions or turn the external batch contract into a streaming interactive API. A future bridge additionally needs reviewed sample continuation/selection, MSL mapping and one source coordinator before it can affect an interactive mission.

The remaining Phase 4 datum/coverage decisions can be resolved independently; datum fidelity is a prerequisite for a physically meaningful common-reference Vertical Profile or any future terrain-clearance claim, not for generic resolver arithmetic or the limited explicit-ellipsoid M1 fixture. Current MSL h≈H remains a disclosed visual approximation. Analytics, replay UI and operational window work remain separately gated. The 200-Entity/5 Hz/both-maps budgets in §11 are targets, not measurements established by Phase 3B or this proposal.

**Proposal review record (conversation, not implementation evidence):** independent round 1 scored 8.64/10 and identified a high-severity paused-frame expiry flaw plus ambiguous accepted-work lease checks and missing repeatable creation. Round 2 scored 9.16/10 after all were corrected, with no unresolved high/critical finding. The same five criteria were used: evidence fidelity; architecture/authority; maps/altitude/uncertainty; proportionality/sequence; trade-offs/failure/acceptance. Exact lifecycle intent encoding and transition codes remain bounded contract decisions. No new application tests or screenshots were produced for that planning review, and the scores do not establish operational readiness or simulation fidelity.

Both source specifications and completed-phase evidence remain unchanged. Stop for review after M1 verification before starting another milestone.
