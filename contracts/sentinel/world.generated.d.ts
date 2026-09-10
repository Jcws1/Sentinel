/* Generated from backend/drafts/domain.py via world.schema.json. Phase 0 draft; do not edit. */

/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

export interface WorldFrame {
  schemaVersion?: "0.1-draft";
  mission: Mission;
  frameId: string;
  streamEpoch: string;
  sequence: number;
  effectiveAt: string;
  entities: Entities;
  tracks: Tracks;
  assets: Assets;
  sensors: Sensors;
  zones: Zones;
  tasks: Tasks;
  recentEvents: SentinelEvent[];
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Mission".
 */
export interface Mission {
  id: string;
  name: string;
  domain: string;
  lifecycle: "draft" | "active" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  zoneIds?: string[];
  referencePoint?: Position3D | null;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Position3D".
 */
export interface Position3D {
  longitudeDeg: number;
  latitudeDeg: number;
  altitude: Altitude;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Altitude".
 */
export interface Altitude {
  metres: number;
  reference: "MSL" | "ELLIPSOID" | "AGL";
  datumId?: string | null;
}
export interface Extensions {
  [k: string]: JsonValue;
}
export interface Entities {
  [k: string]: Entity;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Entity".
 */
export interface Entity {
  id: string;
  missionId: string;
  label: string;
  kind: string;
  classification?: Classification | null;
  affiliation: "friendly" | "hostile" | "neutral" | "unknown";
  condition: "operational" | "degraded" | "non-operational" | "unknown";
  presence: "present" | "unobserved" | "removed";
  provenance: Provenance;
  extensions?: Extensions1;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Classification".
 */
export interface Classification {
  scheme: string;
  code: string;
  label?: string | null;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Provenance".
 */
export interface Provenance {
  source: SourceRef;
  effectiveAt: string;
  recordedAt: string;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "SourceRef".
 */
export interface SourceRef {
  id: string;
  kind: "simulation" | "sensor" | "manual" | "import";
  mode: "simulated" | "live" | "replay";
  externalId?: string | null;
  recordingId?: string | null;
}
export interface Extensions1 {
  [k: string]: JsonValue;
}
export interface Tracks {
  [k: string]: Track;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Track".
 */
export interface Track {
  id: string;
  missionId: string;
  entityId: string;
  source: SourceRef;
  state: "tracking" | "stale" | "ended";
  latest: TrackSample;
  historySeriesId: string;
  predictedSeriesId?: string | null;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "TrackSample".
 */
export interface TrackSample {
  timestamp: string;
  position: Position3D;
  velocity?: Velocity | null;
  confidence?: number | null;
  discontinuity?: boolean;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Velocity".
 */
export interface Velocity {
  speedMps: number;
  headingTrueDeg: number;
  verticalSpeedMps?: number | null;
}
export interface Assets {
  [k: string]: Asset;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Asset".
 */
export interface Asset {
  id: string;
  missionId: string;
  entityId: string;
  availability: "available" | "assigned" | "unavailable" | "unknown";
  capabilityCodes?: string[];
  taskIds?: string[];
  provenance: Provenance;
}
export interface Sensors {
  [k: string]: Sensor;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Sensor".
 */
export interface Sensor {
  id: string;
  missionId: string;
  entityId?: string | null;
  modality: string;
  coverageZoneIds?: string[];
  status: "available" | "unavailable" | "unknown";
  provenance: Provenance;
}
export interface Zones {
  [k: string]: Zone;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Zone".
 */
export interface Zone {
  id: string;
  missionId: string;
  label: string;
  purpose: string;
  geometry: Polygon;
  altitudeBand?: AltitudeBand | null;
  validFrom?: string | null;
  validUntil?: string | null;
  provenance: Provenance;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Polygon".
 */
export interface Polygon {
  type?: "Polygon";
  coordinates: [number, number][][];
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "AltitudeBand".
 */
export interface AltitudeBand {
  lower: Altitude;
  upper: Altitude;
}
export interface Tasks {
  [k: string]: Task;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "Task".
 */
export interface Task {
  id: string;
  missionId: string;
  type: string;
  status: "proposed" | "accepted" | "active" | "completed" | "cancelled";
  assetIds?: string[];
  subjectEntityIds?: string[];
  zoneIds?: string[];
  provenance: Provenance;
}
/**
 * This interface was referenced by `WorldFrame`'s JSON-Schema
 * via the `definition` "SentinelEvent".
 */
export interface SentinelEvent {
  id: string;
  missionId: string;
  sequence: number;
  effectiveAt: string;
  recordedAt: string;
  type: string;
  severity: "info" | "warning" | "critical";
  entityIds?: string[];
  zoneIds?: string[];
  taskIds?: string[];
  location?: Position3D | null;
  source: SourceRef;
  detailRef?: string | null;
  extensions?: Extensions2;
}
export interface Extensions2 {
  [k: string]: JsonValue;
}
