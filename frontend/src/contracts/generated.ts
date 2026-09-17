/* Generated from backend contract package v1.7 JSON Schemas; do not edit.
 * Source SHA-256: ef0dfeabc1a8ad4dd3f5ba725b35efdbcd35bbdff316161ad631a691fb5d2c08
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
  schemaVersion: '1.6';
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
  frameId: string;
  interactive?: InteractiveRun | null;
  mission: Mission;
  /**
   * @maxItems 100
   */
  recentEvents: SentinelEvent[];
  recordedAt: string;
  recordingId: string;
  scenario?: ScenarioBinding | null;
  schemaVersion: '1.6';
  sensors: Sensors;
  sequence: number;
  streamEpoch: string;
  tasks: Tasks;
  tracks: Tracks;
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
  [k: string]: 'annotation' | 'friendly' | 'patrol' | 'restricted';
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
 * via the `definition` "InteractiveRun".
 */
export interface InteractiveRun {
  capabilities: ('run-control' | 'scenario-pair')[];
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
  missionId: string;
  movementModel?: 'local-horizontal-v1';
  runId: string;
  runRevision: number;
  schemaVersion?: '1.3';
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
  capabilities: 'move-horizontal'[];
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
  schemaVersion: '1.6';
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
  interactive?: InteractiveRun | null;
  mission: Mission;
  scenario?: ScenarioBinding | null;
  sensors: SensorChanges;
  tasks: TaskChanges;
  tracks: TrackChanges;
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
  schemaVersion: '1.6';
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
  schemaVersion: '1.6';
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
    | 'cancel';
  executionId?: string | null;
  executionRevision?: number | null;
  executorEpoch: string;
  expiresAt: string;
  grantId: string;
  grantRevision: number;
  id: string;
  issuedAt: string;
  leaseRevision: number;
  missionId: string;
  runId: string;
  runRevision: number;
  sourceId: string;
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
  /**
   * @minItems 1
   * @maxItems 32
   */
  members: [DirectMoveMember, ...DirectMoveMember[]];
  missionId: string;
  modelId?: 'local-horizontal-v1';
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
  schemaVersion?: '1.2';
  sequence: number;
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
  modelId?: 'local-horizontal-v1';
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
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "Receipt".
 */
export interface Receipt {
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
  memberOutcomes?: DirectMemberOutcome[];
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
 * via the `definition` "RunRead".
 */
export interface RunRead {
  frameId: string;
  leaseState: 'unclaimed' | 'held' | 'expired';
  ownsControl: boolean;
  run: InteractiveRun;
  schemaVersion?: '1.3';
  sequence: number;
  serverTime: string;
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "BoundaryDefinition".
 */
export interface BoundaryDefinition {
  id: string;
  name: string;
  type: 'untyped' | 'annotation' | 'friendly' | 'patrol' | 'restricted';
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
  boundaries?:
    | []
    | [BoundaryDefinition]
    | [BoundaryDefinition, BoundaryDefinition]
    | [BoundaryDefinition, BoundaryDefinition, BoundaryDefinition]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | [
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
        BoundaryDefinition,
      ]
    | null;
  boundaryRuleVersion?: 'local-boundary-v1' | null;
  name: string;
  /**
   * @maxItems 32
   */
  units: UnitPlacement[];
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
 * via the `definition` "ScenarioList".
 */
export interface ScenarioList {
  scenarios: ScenarioRevision[];
  schemaVersion?: '1.0' | '1.1';
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
  schemaVersion?: '1.0' | '1.1';
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
  schemaVersion?: '1.0' | '1.1';
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
  modelId: 'local-horizontal-v1';
  speedMps: number;
  templateId: 'singapore-local-v2';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioReview".
 */
export interface ScenarioReview {
  activeMissionId?: string | null;
  boundaryCount: number;
  canRun: boolean;
  checkedAt: string;
  counts: ScenarioCounts;
  issues: ScenarioReviewIssue[];
  motionPreset: ScenarioMotionPreset;
  name: string;
  reference: ScenarioRef;
  schemaVersion?: '1.1';
}
/**
 * This interface was referenced by `BackendContracts`'s JSON-Schema
 * via the `definition` "ScenarioReviewIssue".
 */
export interface ScenarioReviewIssue {
  boundaryId?: string | null;
  code:
    | 'EMPTY_ARRANGEMENT'
    | 'DEMO_DISABLED'
    | 'ACTIVE_RUN_EXISTS'
    | 'UNTYPED_BOUNDARY'
    | 'RESTRICTED_OCCUPANT';
  message: string;
  unitId?: string | null;
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
