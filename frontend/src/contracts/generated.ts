/* Generated from backend v1 JSON Schemas; do not edit.
 * Source SHA-256: 81031836d5522d3d3f7924db50bb3989475296f1a20f86d8a31271710c00adbf
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
  schemaVersion: '1.0';
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
  effectiveAt: string;
  entities: Entities;
  frameId: string;
  mission: Mission;
  /**
   * @maxItems 100
   */
  recentEvents: SentinelEvent[];
  recordedAt: string;
  recordingId: string;
  schemaVersion: '1.0';
  sensors: Sensors;
  sequence: number;
  streamEpoch: string;
  tasks: Tasks;
  tracks: Tracks;
  zones: Zones;
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
export interface Zones {
  [k: string]: Zone;
}
/**
 * This interface was referenced by `Zones`'s JSON-Schema definition
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
  schemaVersion: '1.0';
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
  entities: EntityChanges;
  events: SentinelEvent[];
  mission: Mission;
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
  schemaVersion: '1.0';
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
  schemaVersion: '1.0';
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
