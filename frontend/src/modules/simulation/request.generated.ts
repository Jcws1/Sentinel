/* Generated from frozen simulation v1 request; do not edit.
 * Source SHA-256: a3ab577cacbca01aff010e149a5f07e9f6211485cd4c0e36c28b3b1b9e14e232
 */

export type SimulationRequest = {
  schema_version: '1.0';
  mission_id: Identifier;
  command: {
    command_id: Identifier;
    action: 'START' | 'HOLD' | 'RESUME' | 'ABORT';
    issued_at: Timestamp;
    execute_at: Timestamp;
    source_mode: 'SIMULATED' | 'REPLAY';
  };
  area: {
    area_id: Identifier;
    /**
     * @minItems 4
     * @maxItems 101
     */
    polygon: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
      ...[number, number][],
    ];
    min_altitude_m: Altitude;
    max_altitude_m: Altitude;
  };
  resolution: {
    interaction_radius_m: number;
    location_grid_deg: 0.0001 | 0.0005 | 0.001;
  };
  calibration_profile: {
    profile_id: string;
    version: string;
    evidence_status: Evidence;
    source_summary: string;
    rules: Rule[];
  };
  samples_by_timestamp: {
    /**
     * @maxItems 10000
     */
    [k: string]: Drone[];
  };
};
export type Identifier = string;
export type Timestamp = string;
export type Altitude = number;
export type Evidence = 'NOTIONAL' | 'PUBLIC_PARTIAL' | 'VALIDATED';
export type DroneClass = 'I' | 'II' | 'III' | 'UNKNOWN';
export type Drone = {
  drone_id: DroneId;
  longitude_deg: number;
  latitude_deg: number;
  altitude_m: Altitude;
  class: DroneClass;
  team: 'RED' | 'BLUE' | 'NEUTRAL' | 'UNKNOWN';
  health: number;
  status: 'ACTIVE' | 'DISABLED' | 'REMOVED';
};
export type DroneId = string;

export interface Rule {
  actor_class: DroneClass;
  subject_class: DroneClass;
  probability: number;
  health_delta: number;
}
