/* Generated from backend contract package v1.16 JSON Schemas; do not edit.
 * Source SHA-256: f20feb2e3cedd0b8a7318549440ca9524583d7b0f64247793fbdfe8e3c2e6c8f
 */

/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface BackendContracts {
  stream:
    SnapshotMessage | DeltaMessage | HeartbeatMessage | ResyncRequiredMessage;
  catalog: MissionList;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SnapshotMessage".
 */
export interface SnapshotMessage {
  frame: WorldFrame;
  missionId: string;
  schemaVersion: '1.10' | '1.11';
  sequence: number;
  streamEpoch: string;
  type: 'snapshot';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "WorldFrame".
 */
export interface WorldFrame {
  assets: Assets;
  boundaryRules?: BoundaryRules | null;
  effectiveAt: string;
  entities: Entities;
  fleetBehavior?: FleetBehavior | null;
  frameId: string;
  interactive?: InteractiveRun | null;
  liveBoundaries?: LiveBoundaries | null;
  mission: Mission;
  /**
   * @maxItems 100
   */
  recentEvents: SentinelEvent[];
  recordedAt: string;
  recordingId: string;
  scenario?: ScenarioBinding | null;
  scenarioSchedule?: ScenarioSchedule | null;
  schemaVersion: '1.10' | '1.11';
  sensors: Sensors;
  sequence: number;
  streamEpoch: string;
  tasks: Tasks;
  tracks: Tracks;
  unitProfiles?: Unitprofiles;
  zones: Zones1;
}
export interface Assets {
  [k: string]: Asset;
}
/**
 * This interface was referenced by `Assets`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Asset".
 */
export interface Asset {
  availability: 'available' | 'assigned' | 'unavailable' | 'unknown';
  capabilityCodes?: string[];
  entityId: string;
  id: string;
  missionId: string;
  provenance: Provenance;
  taskIds?: string[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Provenance".
 */
export interface Provenance {
  effectiveAt: string;
  recordedAt: string;
  source: SourceRef;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SourceRef".
 */
export interface SourceRef {
  externalId?: string | null;
  id: string;
  kind: 'simulation' | 'sensor' | 'manual' | 'import';
  mode: 'simulated' | 'live' | 'replay';
  recordingId?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BoundaryRules".
 */
export interface BoundaryRules {
  ruleVersion?: 'local-boundary-v1';
  zones: Zones;
}
export interface Zones {
  /**
   * This interface was referenced by `Zones`'s JSON-Schema definition
   * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
   */
  [k: string]: 'annotation' | 'friendly' | 'patrol' | 'restricted' | 'keep_in';
}
export interface Entities {
  [k: string]: Entity;
}
/**
 * This interface was referenced by `Entities`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts1`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Entity".
 */
export interface Entity {
  affiliation: 'friendly' | 'hostile' | 'neutral' | 'unknown';
  classification?: Classification | null;
  condition: 'operational' | 'degraded' | 'non-operational' | 'unknown';
  extensions?: Extensions;
  id: string;
  kind: string;
  label: string;
  missionId: string;
  presence: 'present' | 'unobserved' | 'removed';
  provenance: Provenance;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Classification".
 */
export interface Classification {
  code: string;
  label?: string | null;
  scheme: string;
}
export interface Extensions {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "FleetBehavior".
 */
export interface FleetBehavior {
  /**
   * @maxItems 64
   */
  assignments?: InterceptAssignment[];
  /**
   * @maxItems 32
   */
  members?: BehaviorState[];
  model: EngagementModel;
  /**
   * @maxItems 32
   */
  outcomes?: DemoOutcome[];
  ruleVersion?: 'local-fleet-v1' | 'local-fleet-v2';
  runId: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "InterceptAssignment".
 */
export interface InterceptAssignment {
  assetId: string;
  commandId: string;
  createdSequence: number;
  id: string;
  interceptorId: string;
  policyId: string;
  reason?: string | null;
  releasedSequence?: number | null;
  state?: 'active' | 'released';
  targetId: string;
  targetTrackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BehaviorState".
 */
export interface BehaviorState {
  acceptedSequence: number;
  acceptedTick: number;
  assetId: string;
  assignmentId?: string | null;
  bindingRevision: number;
  commandId: string;
  controlTrackId?: string | null;
  deadline?: string | null;
  entityId: string;
  executorEpoch: string;
  grantRevision: number;
  id: string;
  movementExecutionId?: string | null;
  order: number;
  patrol?: PatrolRoute | null;
  policy: 'hold' | 'intercept' | 'patrol';
  reason: string;
  reservationRevision: number;
  startedTick?: number | null;
  state:
    | 'hold'
    | 'armed'
    | 'patrolling'
    | 'pursuing'
    | 'reserve'
    | 'blocked'
    | 'interrupted'
    | 'unavailable';
  /**
   * @maxItems 32
   */
  targetScope?: string[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "PatrolRoute".
 */
export interface PatrolRoute {
  boundaryId: string;
  completedLoops?: number;
  entered?: boolean;
  geometryHash: string;
  /**
   * @minItems 3
   * @maxItems 32
   */
  loop: [
    BehaviorPosition,
    BehaviorPosition,
    BehaviorPosition,
    ...BehaviorPosition[],
  ];
  visitedWaypoints?: number;
  waypoint: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BehaviorPosition".
 */
export interface BehaviorPosition {
  altitude: BehaviorAltitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BehaviorAltitude".
 */
export interface BehaviorAltitude {
  datumId?: 'WGS84';
  metres: number;
  reference?: 'ELLIPSOID';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "EngagementModel".
 */
export interface EngagementModel {
  acquisitionRadiusM?: number;
  allocationRule?: 'distance-target-asset-v1';
  contactAlgorithm?: 'relative-swept-sphere-v1';
  contactRadiusM?: 25;
  movementModel?: 'local-horizontal-v1' | 'local-horizontal-v2';
  patrolInsetFraction?: 0.1;
  patrolRule?: 'convex-centroid-inset-v1';
  ruleVersion?: 'demo-mutual-loss-v1';
  speedMps: 20 | 43.05555555555556;
  stepMs?: 200;
  toleranceM?: 0.001;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DemoOutcome".
 */
export interface DemoOutcome {
  assignmentId: string;
  commandId: string;
  committedSequence: number;
  executorEpoch: string;
  fraction: number;
  id: string;
  inputFrameId: string;
  inputSequence: number;
  /**
   * @minItems 2
   * @maxItems 2
   */
  participants: [EngagementParticipant, EngagementParticipant];
  policyId: string;
  ruleVersion?: 'demo-mutual-loss-v1';
  runId: string;
  separationM: number;
  sourceId: string;
  tick: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "EngagementParticipant".
 */
export interface EngagementParticipant {
  affiliation: 'friendly' | 'hostile';
  afterCondition?: 'non-operational';
  before: BehaviorPosition;
  beforeCondition?: 'operational';
  entityId: string;
  evaluated: BehaviorPosition;
  proposed: BehaviorPosition;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "InteractiveRun".
 */
export interface InteractiveRun {
  capabilities: (
    | 'run-control'
    | 'scenario-pair'
    | 'boundary-edit'
    | 'fleet-policy'
    | 'demo-outcome'
  )[];
  /**
   * @maxItems 32
   */
  controls: AssetControl[];
  /**
   * @maxItems 64
   */
  executions?: MovementExecution[];
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  lastReportAt?: string | null;
  lease: Lease;
  localGeometry?: LocalGeometry | null;
  missionId: string;
  movementModel?: 'local-horizontal-v1' | 'local-horizontal-v2';
  runId: string;
  runRevision: number;
  schemaVersion?: '1.7' | '1.8';
  sourceId: string;
  state: 'ready' | 'running' | 'paused' | 'ended';
  supportedActions: (
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'cancel'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
    | 'behavior'
  )[];
  templateId?: 'singapore-local-v1' | 'singapore-local-v2';
  tick: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AssetControl".
 */
export interface AssetControl {
  assetId: string;
  bindingRevision: number;
  busyRevision?: number;
  capabilities: ('move-horizontal' | 'demo-intercept')[];
  controlTrackId?: string | null;
  eligible?: boolean;
  entityId: string;
  executorId: string;
  grantId: string;
  lastDirectOrder?: DirectOrderContext | null;
  missionId: string;
  positionReference: 'ELLIPSOID/WGS84';
  reason: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DirectOrderContext".
 */
export interface DirectOrderContext {
  executorEpoch: string;
  grantId: string;
  grantRevision: number;
  holderId: string;
  order: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MovementExecution".
 */
export interface MovementExecution {
  acceptedAt: string;
  acceptedSequence: number;
  assetId: string;
  bindingRevision: number;
  busyRevision: number;
  commandId: string;
  completionSample?: CompletionSample | null;
  controlTrackId: string;
  deadline: string;
  destination: MovePosition;
  directOrder?: number | null;
  entityId: string;
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  id: string;
  kind?: 'move';
  missionId: string;
  origin: MovePosition;
  reason?: string | null;
  remainingMetres: number;
  reservationRevision: number;
  revision: number;
  runId: string;
  sourceId: string;
  speedMps?: number;
  startedAt?: string | null;
  startedTick?: number | null;
  state:
    | 'Accepted'
    | 'Running'
    | 'Suspended'
    | 'Completed'
    | 'Cancelled'
    | 'Failed'
    | 'Expired'
    | 'Interrupted';
  suspendedBy?: string | null;
  terminalSequence?: number | null;
  travelledMetres: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "CompletionSample".
 */
export interface CompletionSample {
  position: MovePosition;
  sequence: number;
  timestamp: string;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MovePosition".
 */
export interface MovePosition {
  altitude: MoveAltitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MoveAltitude".
 */
export interface MoveAltitude {
  datumId?: 'WGS84';
  metres: number;
  reference?: 'ELLIPSOID';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Lease".
 */
export interface Lease {
  expiresAt?: string | null;
  holderId?: string | null;
  revision: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocalGeometry".
 */
export interface LocalGeometry {
  halfExtentMetres: 5000;
  modelId: 'local-horizontal-v2';
  origin: GeometryOrigin;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "GeometryOrigin".
 */
export interface GeometryOrigin {
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LiveBoundaries".
 */
export interface LiveBoundaries {
  committedSequence: number;
  lastCommandId: string;
  revision: number;
  ruleVersion?: 'local-boundary-v1';
  runId: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Mission".
 */
export interface Mission {
  createdAt: string;
  domain: string;
  extensions?: Extensions1;
  id: string;
  lifecycle: 'draft' | 'active' | 'completed' | 'cancelled';
  name: string;
  referencePoint?: Position3D | null;
  updatedAt: string;
  zoneIds?: string[];
}
export interface Extensions1 {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Position3D".
 */
export interface Position3D {
  altitude: Altitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Altitude".
 */
export interface Altitude {
  datumId?: string | null;
  metres: number;
  reference: 'MSL' | 'ELLIPSOID' | 'AGL';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SentinelEvent".
 */
export interface SentinelEvent {
  detailRef?: string | null;
  effectiveAt: string;
  entityIds?: string[];
  extensions?: Extensions2;
  id: string;
  location?: Position3D | null;
  missionId: string;
  recordedAt: string;
  sequence: number;
  severity: 'info' | 'warning' | 'critical';
  source: SourceRef;
  taskIds?: string[];
  type: string;
  zoneIds?: string[];
}
export interface Extensions2 {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioBinding".
 */
export interface ScenarioBinding {
  contentHash: string;
  definitionId: string;
  entityIds: Entityids;
  name: string;
  revision: number;
}
export interface Entityids {
  /**
   * This interface was referenced by `Entityids`'s JSON-Schema definition
   * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
   */
  [k: string]: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioSchedule".
 */
export interface ScenarioSchedule {
  /**
   * @maxItems 128
   */
  actions: ScheduledExecution[];
  executorEpoch: string;
  /**
   * @maxItems 32
   */
  manualOverrides?: string[];
  ruleVersion: 'local-schedule-v1' | 'local-schedule-v2';
  runId: string;
  sourceId: string;
  startConsumed: boolean;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScheduledExecution".
 */
export interface ScheduledExecution {
  action: LocatedScheduledAction;
  consumedTick?: number | null;
  entityId: string;
  motion?: SourceMotion | null;
  reason?: string | null;
  revision: number;
  state:
    | 'Pending'
    | 'Accepted'
    | 'Running'
    | 'Completed'
    | 'Skipped'
    | 'Failed'
    | 'Cancelled'
    | 'Interrupted';
  terminalSequence?: number | null;
  terminalTick?: number | null;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocatedScheduledAction".
 */
export interface LocatedScheduledAction {
  afterActionId?: string | null;
  delayMs?: number | null;
  destination: LocatedScriptDestination;
  id: string;
  kind?: 'move';
  offsetMs?: number | null;
  ordinal: number;
  unitId: string;
}
/**
 * Extent is checked by the owning scenario/run, after its origin is known.
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocatedScriptDestination".
 */
export interface LocatedScriptDestination {
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SourceMotion".
 */
export interface SourceMotion {
  acceptedSequence: number;
  acceptedTick: number;
  completionSample?: CompletionSample | null;
  destination: MovePosition;
  id: string;
  origin: MovePosition;
  remainingMetres: number;
  speedMps: number;
  startedTick?: number | null;
  travelledMetres: number;
}
export interface Sensors {
  [k: string]: Sensor;
}
/**
 * This interface was referenced by `Sensors`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts2`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Sensor".
 */
export interface Sensor {
  coverageZoneIds?: string[];
  entityId?: string | null;
  id: string;
  missionId: string;
  modality: string;
  provenance: Provenance;
  status: 'available' | 'unavailable' | 'unknown';
}
export interface Tasks {
  [k: string]: Task;
}
/**
 * This interface was referenced by `Tasks`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts3`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Task".
 */
export interface Task {
  assetIds?: string[];
  id: string;
  missionId: string;
  provenance: Provenance;
  status: 'proposed' | 'accepted' | 'active' | 'completed' | 'cancelled';
  subjectEntityIds?: string[];
  type: string;
  zoneIds?: string[];
}
export interface Tracks {
  [k: string]: Track;
}
/**
 * This interface was referenced by `Tracks`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts4`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Track".
 */
export interface Track {
  entityId: string;
  historySeriesId: string;
  id: string;
  latest: TrackSample;
  missionId: string;
  predictedSeriesId?: string | null;
  source: SourceRef;
  state: 'tracking' | 'stale' | 'ended';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "TrackSample".
 */
export interface TrackSample {
  confidence?: number | null;
  discontinuity?: boolean;
  position: Position3D;
  timestamp: string;
  velocity?: Velocity | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Velocity".
 */
export interface Velocity {
  headingTrueDeg: number;
  speedMps: number;
  verticalSpeedMps?: number | null;
}
export interface Unitprofiles {
  [k: string]: UnitProfile;
}
/**
 * This interface was referenced by `Unitprofiles`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Unitprofiles1`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "UnitProfile".
 *
 * This interface was referenced by `Unitprofiles2`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Unitprofiles3`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 */
export interface UnitProfile {
  cruiseMps: number;
  id: 'hornet-10-v1' | 'sting-v1' | 'lancet-3-v1' | 'shahed-136-v1';
  label: string;
  model?: 'notional-unit-speed-v1';
  pursuitMps: number;
  reference: string;
  referenceDate?: '2026-09-18';
  variant: string;
}
export interface Zones1 {
  [k: string]: Zone;
}
/**
 * This interface was referenced by `Zones1`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `Upserts5`'s JSON-Schema definition
 * via the `patternProperty` "^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$".
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Zone".
 */
export interface Zone {
  altitudeBand?: AltitudeBand | null;
  geometry: Polygon;
  id: string;
  label: string;
  missionId: string;
  provenance: Provenance;
  purpose: string;
  validFrom?: string | null;
  validUntil?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AltitudeBand".
 */
export interface AltitudeBand {
  lower: Altitude;
  upper: Altitude;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Polygon".
 */
export interface Polygon {
  /**
   * @minItems 1
   */
  coordinates: [[number, number][], ...[number, number][][]];
  type?: 'Polygon';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DeltaMessage".
 */
export interface DeltaMessage {
  changes: WorldChanges;
  effectiveAt: string;
  frameId: string;
  missionId: string;
  previousSequence: number;
  recordedAt: string;
  recordingId: string;
  schemaVersion: '1.10' | '1.11';
  sequence: number;
  streamEpoch: string;
  type: 'delta';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "WorldChanges".
 */
export interface WorldChanges {
  assets: AssetChanges;
  boundaryRules?: BoundaryRules | null;
  entities: EntityChanges;
  events: SentinelEvent[];
  fleetBehavior?: FleetBehavior | null;
  interactive?: InteractiveRun | null;
  liveBoundaries?: LiveBoundaries | null;
  mission: Mission;
  scenario?: ScenarioBinding | null;
  scenarioSchedule?: ScenarioSchedule | null;
  sensors: SensorChanges;
  tasks: TaskChanges;
  tracks: TrackChanges;
  unitProfiles?: Unitprofiles1;
  zones: ZoneChanges;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AssetChanges".
 */
export interface AssetChanges {
  removes: string[];
  upserts: Upserts;
}
export interface Upserts {
  [k: string]: Asset;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "EntityChanges".
 */
export interface EntityChanges {
  removes: string[];
  upserts: Upserts1;
}
export interface Upserts1 {
  [k: string]: Entity;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SensorChanges".
 */
export interface SensorChanges {
  removes: string[];
  upserts: Upserts2;
}
export interface Upserts2 {
  [k: string]: Sensor;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "TaskChanges".
 */
export interface TaskChanges {
  removes: string[];
  upserts: Upserts3;
}
export interface Upserts3 {
  [k: string]: Task;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "TrackChanges".
 */
export interface TrackChanges {
  removes: string[];
  upserts: Upserts4;
}
export interface Upserts4 {
  [k: string]: Track;
}
export interface Unitprofiles1 {
  [k: string]: UnitProfile;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ZoneChanges".
 */
export interface ZoneChanges {
  removes: string[];
  upserts: Upserts5;
}
export interface Upserts5 {
  [k: string]: Zone;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "HeartbeatMessage".
 */
export interface HeartbeatMessage {
  missionId: string;
  schemaVersion: '1.10' | '1.11';
  sequence: number;
  serverTime: string;
  streamEpoch: string;
  type: 'heartbeat';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ResyncRequiredMessage".
 */
export interface ResyncRequiredMessage {
  missionId: string;
  reason: string;
  schemaVersion: '1.10' | '1.11';
  type: 'resync-required';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MissionList".
 */
export interface MissionList {
  fixtureAdvanceEnabled?: boolean;
  missions: Mission[];
  schemaVersion: '1.0';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ObservedSegment".
 */
export interface ObservedSegment {
  breakReason:
    | 'window-start'
    | 'missing-observation'
    | 'source-change'
    | 'altitude-reference'
    | 'discontinuity'
    | 'time-regression'
    | 'observation-gap';
  historySeriesId: string;
  /**
   * @minItems 1
   * @maxItems 2000
   */
  points: [RecordedObservation, ...RecordedObservation[]];
  source: SourceRef;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecordedObservation".
 */
export interface RecordedObservation {
  frameEffectiveAt: string;
  frameId: string;
  recordedAt: string;
  sample: TrackSample;
  sequence: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BehaviorMemberOutcome".
 */
export interface BehaviorMemberOutcome {
  assetId: string;
  assignmentId?: string | null;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
  state?:
    | (
        | 'hold'
        | 'armed'
        | 'patrolling'
        | 'pursuing'
        | 'reserve'
        | 'blocked'
        | 'interrupted'
        | 'unavailable'
      )
    | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BehaviorPolicy".
 */
export interface BehaviorPolicy {
  boundaryId?: string | null;
  deadline?: string | null;
  kind: 'hold' | 'intercept' | 'patrol';
  reviewedFrameId?: string | null;
}
/**
 * Strict legacy reader, also used by archived command/scenario contracts.
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BoundaryDefinition".
 */
export interface BoundaryDefinition {
  id: string;
  name: string;
  type:
    'untyped' | 'annotation' | 'friendly' | 'patrol' | 'restricted' | 'keep_in';
  /**
   * @minItems 3
   * @maxItems 32
   */
  vertices: [
    [number, number],
    [number, number],
    [number, number],
    ...[number, number][],
  ];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BoundaryMutation".
 */
export interface BoundaryMutation {
  boundaryId: string;
  definition?: BoundaryDefinition | null;
  expectedRevision: number;
  operation: 'upsert' | 'delete';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "CommandRequest".
 */
export interface CommandRequest {
  commandId: string;
  holderId: string;
  intent: Intent;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Intent".
 */
export interface Intent {
  action:
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'cancel'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
    | 'behavior';
  boundary?: LocatedBoundaryMutation | null;
  executionId?: string | null;
  executionRevision?: number | null;
  executorEpoch: string;
  expiresAt: string;
  grantId: string;
  grantRevision: number;
  id: string;
  issuedAt: string;
  leaseRevision: number;
  members?: [DirectMoveMember, ...DirectMoveMember[]] | null;
  missionId: string;
  order?: number | null;
  policy?: BehaviorPolicy | null;
  recommendation?: RecommendationAudit | null;
  runId: string;
  runRevision: number;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocatedBoundaryMutation".
 */
export interface LocatedBoundaryMutation {
  boundaryId: string;
  definition?: LocatedBoundaryDefinition | null;
  expectedRevision: number;
  operation: 'upsert' | 'delete';
}
/**
 * Structural input; the owning scenario/run validates its actual geometry.
 *
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocatedBoundaryDefinition".
 */
export interface LocatedBoundaryDefinition {
  id: string;
  name: string;
  type:
    'untyped' | 'annotation' | 'friendly' | 'patrol' | 'restricted' | 'keep_in';
  /**
   * @minItems 3
   * @maxItems 32
   */
  vertices: [
    [number, number],
    [number, number],
    [number, number],
    ...[number, number][],
  ];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DirectMoveMember".
 */
export interface DirectMoveMember {
  assetId: string;
  bindingRevision: number;
  controlTrackId?: string | null;
  entityId: string;
  executorId: string;
  grantId: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationAudit".
 */
export interface RecommendationAudit {
  assignmentCount: number;
  createdAt: string;
  /**
   * @maxItems 32
   */
  eligibleTargetIds: string[];
  executorEpoch: string;
  expiresAt: string;
  fingerprint: string;
  inputFrameId: string;
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [RecommendationMember, ...RecommendationMember[]];
  missionId: string;
  option: RecommendationOption;
  recommendationId: string;
  runId: string;
  schemaVersion?: '1.0';
  /**
   * @minItems 1
   * @maxItems 32
   */
  selectedEntityIds: [string, ...string[]];
  sequence: number;
  situation: string;
  source?: 'rules';
  sourceId: string;
  unavailableReason?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationMember".
 */
export interface RecommendationMember {
  available: boolean;
  entityId: string;
  exclusion?: string | null;
  label: string;
  state: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationOption".
 */
export interface RecommendationOption {
  action?: SuggestedAction | null;
  /**
   * @maxItems 6
   */
  consequences:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string];
  explanation: string;
  id: string;
  title: string;
  /**
   * @maxItems 32
   */
  unchangedEntityIds: string[];
  /**
   * @maxItems 32
   */
  unchangedReasons: RecommendationUnchanged[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SuggestedAction".
 */
export interface SuggestedAction {
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [DirectMoveMember, ...DirectMoveMember[]];
  operation: 'behavior' | 'stop' | 'return-to-script';
  policy?: BehaviorPolicy | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationUnchanged".
 */
export interface RecommendationUnchanged {
  disposition: 'unchanged' | 'excluded';
  entityId: string;
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ControlMemberOutcome".
 */
export interface ControlMemberOutcome {
  assetId: string;
  code: 'OK' | 'ORDER_SUPERSEDED' | 'UNAVAILABLE';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "CreateRunRequest".
 */
export interface CreateRunRequest {
  creationId: string;
  scenario?: ScenarioRef | null;
  templateId?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioRef".
 */
export interface ScenarioRef {
  contentHash: string;
  definitionId: string;
  revision: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DemoEntry".
 */
export interface DemoEntry {
  activeMissionId?: string | null;
  enabled: boolean;
  schemaVersion?: '1.1';
  templateId?: 'singapore-local-v2';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DirectMemberOutcome".
 */
export interface DirectMemberOutcome {
  assetId: string;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  executionId?: string | null;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DirectMoveIntent".
 */
export interface DirectMoveIntent {
  anchor: MoveAnchor;
  deadline: string;
  executorEpoch: string;
  grantId: string;
  grantRevision: number;
  intercept?: true | null;
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [DirectMoveMember, ...DirectMoveMember[]];
  missionId: string;
  modelId?: 'local-horizontal-v1' | 'local-horizontal-v2';
  order: number;
  reviewedFrameId: string;
  runId: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MoveAnchor".
 */
export interface MoveAnchor {
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "DirectMoveRequest".
 */
export interface DirectMoveRequest {
  commandId: string;
  direct: DirectMoveIntent;
  holderId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ExecutionRead".
 */
export interface ExecutionRead {
  /**
   * @maxItems 64
   */
  executions: MovementExecution[];
  frameId: string;
  missionId: string;
  schemaVersion?: '1.3';
  sequence: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD2DirectMemberOutcome".
 */
export interface LegacyD2DirectMemberOutcome {
  assetId: string;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  executionId?: string | null;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD2Receipt".
 */
export interface LegacyD2Receipt {
  accepted: boolean;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL'
    | 'NO_AVAILABLE_ASSETS'
    | 'ORDER_SUPERSEDED';
  directOrder?: number | null;
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  /**
   * @maxItems 32
   */
  memberOutcomes?: LegacyD2DirectMemberOutcome[];
  message: string;
  missionId?: string | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel'
    | 'direct-move';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.2';
  sequence?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3ControlMemberOutcome".
 */
export interface LegacyD3ControlMemberOutcome {
  assetId: string;
  code: 'OK' | 'ORDER_SUPERSEDED';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3DirectMemberOutcome".
 */
export interface LegacyD3DirectMemberOutcome {
  assetId: string;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  executionId?: string | null;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3Receipt".
 */
export interface LegacyD3Receipt {
  accepted: boolean;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL'
    | 'NO_AVAILABLE_ASSETS'
    | 'ORDER_SUPERSEDED';
  controlOrder?: number | null;
  /**
   * @maxItems 32
   */
  controlOutcomes?: LegacyD3ControlMemberOutcome[];
  directOrder?: number | null;
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  /**
   * @maxItems 32
   */
  memberOutcomes?: LegacyD3DirectMemberOutcome[];
  message: string;
  missionId?: string | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel'
    | 'direct-move'
    | 'stop'
    | 'return-to-script';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.3';
  sequence?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aAssetControl".
 */
export interface LegacyD3AAssetControl {
  assetId: string;
  bindingRevision: number;
  busyRevision?: number;
  capabilities: 'move-horizontal'[];
  controlTrackId?: string | null;
  eligible?: boolean;
  entityId: string;
  executorId: string;
  grantId: string;
  lastDirectOrder?: LegacyD3ADirectOrderContext | null;
  missionId: string;
  positionReference: 'ELLIPSOID/WGS84';
  reason: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aDirectOrderContext".
 */
export interface LegacyD3ADirectOrderContext {
  executorEpoch: string;
  grantId: string;
  grantRevision: number;
  holderId: string;
  order: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aCompletionSample".
 */
export interface LegacyD3ACompletionSample {
  position: LegacyD3AMovePosition;
  sequence: number;
  timestamp: string;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aMovePosition".
 */
export interface LegacyD3AMovePosition {
  altitude: LegacyD3AMoveAltitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aMoveAltitude".
 */
export interface LegacyD3AMoveAltitude {
  datumId?: 'WGS84';
  metres: number;
  reference?: 'ELLIPSOID';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aControlMemberOutcome".
 */
export interface LegacyD3AControlMemberOutcome {
  assetId: string;
  code: 'OK' | 'ORDER_SUPERSEDED';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aDirectMemberOutcome".
 */
export interface LegacyD3ADirectMemberOutcome {
  assetId: string;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  executionId?: string | null;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aInteractiveRun".
 */
export interface LegacyD3AInteractiveRun {
  capabilities: ('run-control' | 'scenario-pair' | 'boundary-edit')[];
  /**
   * @maxItems 32
   */
  controls: LegacyD3AAssetControl[];
  /**
   * @maxItems 64
   */
  executions?: LegacyD3AMovementExecution[];
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  lastReportAt?: string | null;
  lease: LegacyD3ALease;
  missionId: string;
  movementModel?: 'local-horizontal-v1';
  runId: string;
  runRevision: number;
  schemaVersion?: '1.5';
  sourceId: string;
  state: 'ready' | 'running' | 'paused' | 'ended';
  supportedActions: (
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'cancel'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
  )[];
  templateId?: 'singapore-local-v1' | 'singapore-local-v2';
  tick: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aMovementExecution".
 */
export interface LegacyD3AMovementExecution {
  acceptedAt: string;
  acceptedSequence: number;
  assetId: string;
  bindingRevision: number;
  busyRevision: number;
  commandId: string;
  completionSample?: LegacyD3ACompletionSample | null;
  controlTrackId: string;
  deadline: string;
  destination: LegacyD3AMovePosition;
  directOrder?: number | null;
  entityId: string;
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  id: string;
  kind?: 'move';
  missionId: string;
  origin: LegacyD3AMovePosition;
  reason?: string | null;
  remainingMetres: number;
  reservationRevision: number;
  revision: number;
  runId: string;
  sourceId: string;
  speedMps?: 20 | 43.05555555555556;
  startedAt?: string | null;
  startedTick?: number | null;
  state:
    | 'Accepted'
    | 'Running'
    | 'Suspended'
    | 'Completed'
    | 'Cancelled'
    | 'Failed'
    | 'Expired'
    | 'Interrupted';
  terminalSequence?: number | null;
  travelledMetres: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aLease".
 */
export interface LegacyD3ALease {
  expiresAt?: string | null;
  holderId?: string | null;
  revision: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aReceipt".
 */
export interface LegacyD3AReceipt {
  accepted: boolean;
  boundaryRevision?: number | null;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL'
    | 'NO_AVAILABLE_ASSETS'
    | 'ORDER_SUPERSEDED'
    | 'BOUNDARY_CONFLICT';
  controlOrder?: number | null;
  /**
   * @maxItems 32
   */
  controlOutcomes?: LegacyD3AControlMemberOutcome[];
  directOrder?: number | null;
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  /**
   * @maxItems 32
   */
  memberOutcomes?: LegacyD3ADirectMemberOutcome[];
  message: string;
  missionId?: string | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel'
    | 'direct-move'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.4';
  sequence?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD3aRunRead".
 */
export interface LegacyD3ARunRead {
  frameId: string;
  leaseState: 'unclaimed' | 'held' | 'expired';
  ownsControl: boolean;
  run: LegacyD3AInteractiveRun;
  schemaVersion?: '1.5';
  sequence: number;
  serverTime: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4AssetControl".
 */
export interface LegacyD4AssetControl {
  assetId: string;
  bindingRevision: number;
  busyRevision?: number;
  capabilities: ('move-horizontal' | 'demo-intercept')[];
  controlTrackId?: string | null;
  eligible?: boolean;
  entityId: string;
  executorId: string;
  grantId: string;
  lastDirectOrder?: LegacyD4DirectOrderContext | null;
  missionId: string;
  positionReference: 'ELLIPSOID/WGS84';
  reason: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4DirectOrderContext".
 */
export interface LegacyD4DirectOrderContext {
  executorEpoch: string;
  grantId: string;
  grantRevision: number;
  holderId: string;
  order: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4BehaviorMemberOutcome".
 */
export interface LegacyD4BehaviorMemberOutcome {
  assetId: string;
  assignmentId?: string | null;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
  state?:
    | (
        | 'hold'
        | 'armed'
        | 'patrolling'
        | 'pursuing'
        | 'reserve'
        | 'blocked'
        | 'interrupted'
        | 'unavailable'
      )
    | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4CompletionSample".
 */
export interface LegacyD4CompletionSample {
  position: LegacyD4MovePosition;
  sequence: number;
  timestamp: string;
  trackId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4MovePosition".
 */
export interface LegacyD4MovePosition {
  altitude: LegacyD4MoveAltitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4MoveAltitude".
 */
export interface LegacyD4MoveAltitude {
  datumId?: 'WGS84';
  metres: number;
  reference?: 'ELLIPSOID';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4ControlMemberOutcome".
 */
export interface LegacyD4ControlMemberOutcome {
  assetId: string;
  code: 'OK' | 'ORDER_SUPERSEDED' | 'UNAVAILABLE';
  entityId: string;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4DirectMemberOutcome".
 */
export interface LegacyD4DirectMemberOutcome {
  assetId: string;
  code:
    | 'OK'
    | 'UNAVAILABLE'
    | 'NO_RESPONSE'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'ORDER_SUPERSEDED';
  entityId: string;
  executionId?: string | null;
  outcome: 'accepted' | 'skipped';
  reason: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4InteractiveRun".
 */
export interface LegacyD4InteractiveRun {
  capabilities: (
    | 'run-control'
    | 'scenario-pair'
    | 'boundary-edit'
    | 'fleet-policy'
    | 'demo-outcome'
  )[];
  /**
   * @maxItems 32
   */
  controls: LegacyD4AssetControl[];
  /**
   * @maxItems 64
   */
  executions?: LegacyD4MovementExecution[];
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  lastReportAt?: string | null;
  lease: LegacyD4Lease;
  missionId: string;
  movementModel?: 'local-horizontal-v1';
  runId: string;
  runRevision: number;
  schemaVersion?: '1.6';
  sourceId: string;
  state: 'ready' | 'running' | 'paused' | 'ended';
  supportedActions: (
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'cancel'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
    | 'behavior'
  )[];
  templateId?: 'singapore-local-v1' | 'singapore-local-v2';
  tick: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4MovementExecution".
 */
export interface LegacyD4MovementExecution {
  acceptedAt: string;
  acceptedSequence: number;
  assetId: string;
  bindingRevision: number;
  busyRevision: number;
  commandId: string;
  completionSample?: LegacyD4CompletionSample | null;
  controlTrackId: string;
  deadline: string;
  destination: LegacyD4MovePosition;
  directOrder?: number | null;
  entityId: string;
  executorEpoch: string;
  executorId: string;
  grantId: string;
  grantRevision: number;
  id: string;
  kind?: 'move';
  missionId: string;
  origin: LegacyD4MovePosition;
  reason?: string | null;
  remainingMetres: number;
  reservationRevision: number;
  revision: number;
  runId: string;
  sourceId: string;
  speedMps?: 20 | 43.05555555555556;
  startedAt?: string | null;
  startedTick?: number | null;
  state:
    | 'Accepted'
    | 'Running'
    | 'Suspended'
    | 'Completed'
    | 'Cancelled'
    | 'Failed'
    | 'Expired'
    | 'Interrupted';
  terminalSequence?: number | null;
  travelledMetres: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4Lease".
 */
export interface LegacyD4Lease {
  expiresAt?: string | null;
  holderId?: string | null;
  revision: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4Receipt".
 */
export interface LegacyD4Receipt {
  accepted: boolean;
  behaviorOrder?: number | null;
  /**
   * @maxItems 32
   */
  behaviorOutcomes?: LegacyD4BehaviorMemberOutcome[];
  boundaryRevision?: number | null;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL'
    | 'NO_AVAILABLE_ASSETS'
    | 'ORDER_SUPERSEDED'
    | 'BOUNDARY_CONFLICT';
  controlOrder?: number | null;
  /**
   * @maxItems 32
   */
  controlOutcomes?: LegacyD4ControlMemberOutcome[];
  directOrder?: number | null;
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  /**
   * @maxItems 32
   */
  memberOutcomes?: LegacyD4DirectMemberOutcome[];
  message: string;
  missionId?: string | null;
  movementOrder?: number | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel'
    | 'direct-move'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
    | 'behavior'
    | 'intercept-approach';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.5';
  sequence?: number | null;
  /**
   * @maxItems 32
   */
  targetScope?: string[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyD4RunRead".
 */
export interface LegacyD4RunRead {
  frameId: string;
  leaseState: 'unclaimed' | 'held' | 'expired';
  ownsControl: boolean;
  run: LegacyD4InteractiveRun;
  schemaVersion?: '1.6';
  sequence: number;
  serverTime: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyM12Receipt".
 */
export interface LegacyM12Receipt {
  accepted: boolean;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL';
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  message: string;
  missionId?: string | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.1';
  sequence?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LegacyReceipt".
 */
export interface LegacyReceipt {
  accepted: boolean;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND';
  frameId?: string | null;
  message: string;
  missionId?: string | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.0';
  sequence?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MoveIntent".
 */
export interface MoveIntent {
  anchor: MoveAnchor;
  deadline: string;
  executorEpoch: string;
  grantId: string;
  grantRevision: number;
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [MoveMember, ...MoveMember[]];
  missionId: string;
  modelId?: 'local-horizontal-v1' | 'local-horizontal-v2';
  reviewedFrameId: string;
  runId: string;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MoveMember".
 */
export interface MoveMember {
  assetId: string;
  bindingRevision: number;
  busyRevision: number;
  controlTrackId: string;
  destination: MovePosition;
  entityId: string;
  executorId: string;
  grantId: string;
  origin: MovePosition;
  sourceId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "MoveRequest".
 */
export interface MoveRequest {
  commandId: string;
  holderId: string;
  move: MoveIntent;
  order?: number | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Receipt".
 */
export interface Receipt {
  accepted: boolean;
  behaviorOrder?: number | null;
  /**
   * @maxItems 32
   */
  behaviorOutcomes?: BehaviorMemberOutcome[];
  boundaryRevision?: number | null;
  code:
    | 'OK'
    | 'NOT_INTERACTIVE'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'IDENTITY_CONFLICT'
    | 'INTENT_INVALID'
    | 'INTENT_EXPIRED'
    | 'OBSOLETE_INTENT'
    | 'REFERENCE_MISMATCH'
    | 'CONTROL_HELD'
    | 'CONTROL_REQUIRED'
    | 'LEASE_EXPIRED'
    | 'RECLAIM_REQUIRED'
    | 'INVALID_TRANSITION'
    | 'RUN_TERMINAL'
    | 'INVALID_REQUEST'
    | 'NOT_FOUND'
    | 'SOURCE_UNHEALTHY'
    | 'FRAME_INVALID'
    | 'MOVE_EXPIRED'
    | 'SELECTION_INVALID'
    | 'BINDING_CHANGED'
    | 'ASSET_BUSY'
    | 'POSITION_UNAVAILABLE'
    | 'UNSUPPORTED_REFERENCE'
    | 'OUTSIDE_EXTENT'
    | 'ENDPOINT_INVALID'
    | 'EXECUTION_TERMINAL'
    | 'NO_AVAILABLE_ASSETS'
    | 'ORDER_SUPERSEDED'
    | 'BOUNDARY_CONFLICT';
  controlOrder?: number | null;
  /**
   * @maxItems 32
   */
  controlOutcomes?: ControlMemberOutcome[];
  directOrder?: number | null;
  /**
   * @maxItems 32
   */
  executionIds?: string[];
  frameId?: string | null;
  /**
   * @maxItems 32
   */
  memberOutcomes?: DirectMemberOutcome[];
  message: string;
  missionId?: string | null;
  movementOrder?: number | null;
  operation:
    | 'create'
    | 'acquire'
    | 'renew'
    | 'reclaim'
    | 'revoke'
    | 'start'
    | 'pause'
    | 'resume'
    | 'end'
    | 'move'
    | 'cancel'
    | 'direct-move'
    | 'stop'
    | 'return-to-script'
    | 'boundary-edit'
    | 'behavior'
    | 'intercept-approach';
  recordedAt: string;
  recordingId?: string | null;
  requestId: string;
  runId?: string | null;
  schemaVersion?: '1.6';
  sequence?: number | null;
  /**
   * @maxItems 32
   */
  targetScope?: string[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationRequest".
 */
export interface RecommendationRequest {
  /**
   * @minItems 1
   * @maxItems 32
   */
  entityIds: [string, ...string[]];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RecommendationSet".
 */
export interface RecommendationSet {
  assignmentCount: number;
  createdAt: string;
  /**
   * @maxItems 32
   */
  eligibleTargetIds: string[];
  executorEpoch: string;
  expiresAt: string;
  fingerprint: string;
  id: string;
  inputFrameId: string;
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [RecommendationMember, ...RecommendationMember[]];
  missionId: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  options:
    | [RecommendationOption]
    | [RecommendationOption, RecommendationOption]
    | [RecommendationOption, RecommendationOption, RecommendationOption]
    | [
        RecommendationOption,
        RecommendationOption,
        RecommendationOption,
        RecommendationOption,
      ];
  runId: string;
  schemaVersion?: '1.0';
  /**
   * @minItems 1
   * @maxItems 32
   */
  selectedEntityIds: [string, ...string[]];
  sequence: number;
  situation: string;
  source?: 'rules';
  sourceId: string;
  unavailableReason?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "RunRead".
 */
export interface RunRead {
  frameId: string;
  leaseState: 'unclaimed' | 'held' | 'expired';
  ownsControl: boolean;
  run: InteractiveRun;
  schemaVersion?: '1.7' | '1.8';
  sequence: number;
  serverTime: string;
  unitProfiles?: Unitprofiles2;
}
export interface Unitprofiles2 {
  [k: string]: UnitProfile;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "LocatedUnitPlacement".
 */
export interface LocatedUnitPlacement {
  category: 'friendly' | 'hostile' | 'unknown';
  commandRole: 'sentinel' | 'observation';
  headingTrueDeg: number;
  id: string;
  label: string;
  position: ScenarioPosition;
  profileId?:
    ('hornet-10-v1' | 'sting-v1' | 'lancet-3-v1' | 'shahed-136-v1') | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioPosition".
 */
export interface ScenarioPosition {
  altitude: ScenarioAltitude;
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioAltitude".
 */
export interface ScenarioAltitude {
  datumId?: 'WGS84';
  metres: number;
  reference?: 'ELLIPSOID';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioContent".
 */
export interface ScenarioContent {
  actions?: LocatedScheduledAction[] | null;
  boundaries?:
    | []
    | [LocatedBoundaryDefinition]
    | [LocatedBoundaryDefinition, LocatedBoundaryDefinition]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | [
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
        LocatedBoundaryDefinition,
      ]
    | null;
  boundaryRuleVersion?: 'local-boundary-v1' | null;
  localGeometry?: LocalGeometry | null;
  name: string;
  scheduleRuleVersion?: ('local-schedule-v1' | 'local-schedule-v2') | null;
  /**
   * @maxItems 40
   */
  units: LocatedUnitPlacement[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioList".
 */
export interface ScenarioList {
  scenarios: ScenarioRevision[];
  schemaVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5' | '1.6';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioRevision".
 */
export interface ScenarioRevision {
  content: ScenarioContent;
  contentHash: string;
  createdAt: string;
  definitionId: string;
  revision: number;
  schemaVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5' | '1.6';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioReceipt".
 */
export interface ScenarioReceipt {
  accepted: boolean;
  code: 'OK' | 'REVISION_CONFLICT' | 'NOT_FOUND';
  message: string;
  requestId: string;
  result?: ScenarioRevision | null;
  schemaVersion?: '1.0' | '1.1' | '1.2' | '1.3' | '1.4' | '1.5' | '1.6';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioWrite".
 */
export interface ScenarioWrite {
  content: ScenarioContent;
  expectedRevision: number;
  requestId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScheduledAction".
 */
export interface ScheduledAction {
  afterActionId?: string | null;
  delayMs?: number | null;
  destination: ScriptDestination;
  id: string;
  kind?: 'move';
  offsetMs?: number | null;
  ordinal: number;
  unitId: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScriptDestination".
 */
export interface ScriptDestination {
  latitudeDeg: number;
  longitudeDeg: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "UnitPlacement".
 */
export interface UnitPlacement {
  category: 'friendly' | 'hostile' | 'unknown';
  commandRole: 'sentinel' | 'observation';
  headingTrueDeg: number;
  id: string;
  label: string;
  position: ScenarioPosition;
  profileId?:
    ('hornet-10-v1' | 'sting-v1' | 'lancet-3-v1' | 'shahed-136-v1') | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioCounts".
 */
export interface ScenarioCounts {
  controlled: number;
  friendly: number;
  hostile: number;
  observationOnly: number;
  total: number;
  unknown: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioMotionPreset".
 */
export interface ScenarioMotionPreset {
  localGeometry?: LocalGeometry | null;
  modelId: 'local-horizontal-v1' | 'local-horizontal-v2';
  speedMps: number;
  templateId: 'singapore-local-v2';
  unitProfiles?: Unitprofiles3;
}
export interface Unitprofiles3 {
  [k: string]: UnitProfile;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioReview".
 */
export interface ScenarioReview {
  actionCount: number;
  activeMissionId?: string | null;
  boundaryCount: number;
  canRun: boolean;
  checkedAt: string;
  counts: ScenarioCounts;
  issues: ScenarioReviewIssue[];
  motionPreset: ScenarioMotionPreset;
  name: string;
  reference: ScenarioRef;
  schemaVersion?: '1.4' | '1.5' | '1.6';
  scriptDurationMs: number;
  /**
   * @maxItems 128
   */
  timings?: ScriptTimingReview[];
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioReviewIssue".
 */
export interface ScenarioReviewIssue {
  actionId?: string | null;
  boundaryId?: string | null;
  code:
    | 'EMPTY_ARRANGEMENT'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'UNTYPED_BOUNDARY'
    | 'RESTRICTED_OCCUPANT'
    | 'KEEP_IN_OCCUPANT'
    | 'MULTIPLE_KEEP_IN'
    | 'SCRIPT_PATH_BLOCKED'
    | 'SCRIPT_TIMING_INVALID';
  message: string;
  unitId?: string | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScriptTimingReview".
 */
export interface ScriptTimingReview {
  actionId: string;
  afterActionId?: string | null;
  delayMs?: number | null;
  estimatedEndMs?: number | null;
  estimatedStartMs?: number | null;
  nominalState: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "CalibrationIdentity".
 */
export interface CalibrationIdentity {
  evidenceStatus: 'NOTIONAL' | 'PUBLIC_PARTIAL' | 'VALIDATED';
  profileId: string;
  version: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SimulationCommandSummary".
 */
export interface SimulationCommandSummary {
  action: 'START' | 'HOLD' | 'RESUME' | 'ABORT';
  commandId: string;
  completedAt?: string | null;
  receivedAt: string;
  sequence: number;
  state: 'pending' | 'interrupted' | 'completed';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SimulationEntityDetail".
 */
export interface SimulationEntityDetail {
  calibration: CalibrationIdentity;
  commandId: string;
  droneClass: 'I' | 'II' | 'III' | 'UNKNOWN';
  droneId: string;
  health: number;
  inputHealth: number;
  reportedStatus: 'ACTIVE' | 'DISABLED' | 'REMOVED';
  runId: string;
  schemaVersion?: '1.0';
  stateDiscontinuity: boolean;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SimulationProjection".
 */
export interface SimulationProjection {
  calibration: CalibrationIdentity;
  commandId: string;
  externalMissionId: string;
  phase: 'processing' | 'interrupted' | 'ready';
  policyId?: 'sentinel-simulation-v1-local-1';
  runId: string;
  schemaVersion?: '1.0';
  sourceMode: 'SIMULATED' | 'REPLAY';
  state?: ('RUNNING' | 'HELD' | 'ABORTED' | 'FAILED') | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "SimulationRunStatus".
 */
export interface SimulationRunStatus {
  calibration: CalibrationIdentity;
  commandId: string;
  completedAt?: string | null;
  externalMissionId: string;
  missionId: string;
  phase: 'processing' | 'interrupted' | 'ready';
  policyId?: 'sentinel-simulation-v1-local-1';
  receivedAt: string;
  runId: string;
  schemaVersion?: '1.0';
  sourceMode: 'SIMULATED' | 'REPLAY';
  state?: ('RUNNING' | 'HELD' | 'ABORTED' | 'FAILED') | null;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AuditBucket".
 */
export interface AuditBucket {
  events: number;
  fromAt: string;
  outcomes: number;
  requests: number;
  toAt: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AuditPage".
 */
export interface AuditPage {
  frameId: string;
  fromAt: string;
  missionId: string;
  nextAfter?: string | null;
  receiptCeiling: number;
  recordingId: string;
  /**
   * @maxItems 100
   */
  rows: AuditRow[];
  schemaVersion?: '1.0';
  sourceAt: string;
  summary?: AuditSummary | null;
  throughRecordedAt: string;
  throughSequence: number;
  toAt: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AuditRow".
 */
export interface AuditRow {
  affectedEntityIds?: string[];
  commandId?: string | null;
  detail: string;
  effectiveAt?: string | null;
  entityIds?: string[];
  id: string;
  identity: string;
  kind: 'event' | 'request';
  outcome?: string | null;
  recordedAt: string;
  sequence: number;
  state?: string | null;
  type: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AuditSummary".
 */
export interface AuditSummary {
  affectedEntities: number;
  buckets: AuditBucket[];
  complete: boolean;
  eventCounts: Eventcounts;
  inspectedRows: number;
  outcomeCounts: Outcomecounts;
  requestStates: Requeststates;
  throughRecordedAt?: string | null;
}
export interface Eventcounts {
  [k: string]: number;
}
export interface Outcomecounts {
  [k: string]: number;
}
export interface Requeststates {
  [k: string]: number;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "AuditQuery".
 */
export interface AuditQuery {
  after?: string | null;
  frameId: string;
  fromAt: string;
  includeSummary?: boolean;
  kind?: 'all' | 'event' | 'request';
  limit?: number;
  receiptCeiling?: number | null;
  search?: string;
  toAt: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ObservedHistory".
 */
export interface ObservedHistory {
  entityId: string;
  fromAt: string;
  inspectedFrames: number;
  maxGapSeconds?: 30;
  missionId: string;
  recordingId: string;
  schemaVersion: '1.0';
  /**
   * @maxItems 2000
   */
  segments: ObservedSegment[];
  streamEpoch: string;
  throughAt: string;
  throughFrameId: string;
  throughSequence: number;
  truncated: boolean;
  windowSeconds: number;
}
