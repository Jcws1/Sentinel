/* Generated from frozen simulation v1 response; do not edit.
 * Source SHA-256: a81b026fefc25833eec586b047ae18703c4d17f28f5eebed6346a20b39d4cfee
 */

export type Identifier = string;
export type Evidence = 'NOTIONAL' | 'PUBLIC_PARTIAL' | 'VALIDATED';
export type DroneId = string;

export interface SimulationResponse {
  schema_version: '1.0';
  mission_id: Identifier;
  command_ack: {
    command_id: Identifier;
    status: 'ACCEPTED' | 'SUCCEEDED' | 'REJECTED';
    run_status: 'RUNNING' | 'HELD' | 'ABORTED' | 'FAILED';
    error_code: string | null;
    error_path: string | null;
    error_message: string | null;
  };
  calibration: {
    profile_id: string;
    version: string;
    evidence_status: Evidence;
  };
  results_by_timestamp: {
    [k: string]: {
      interactions: {
        interaction_id: string;
        location_id: string;
        red_drone_id: DroneId;
        blue_drone_id: DroneId;
        separation_m: number;
        outcome: 'NO_EFFECT' | 'RED_EFFECT' | 'BLUE_EFFECT' | 'MUTUAL_EFFECT';
        /**
         * @minItems 2
         * @maxItems 2
         */
        effects: [
          {
            actor_drone_id: DroneId;
            subject_drone_id: DroneId;
            probability: number;
            draw: number;
            applied: boolean;
            health_delta: number;
          } & {
            actor_drone_id: DroneId;
            subject_drone_id: DroneId;
            probability: number;
            draw: number;
            applied: boolean;
            health_delta: number;
          },
          {
            actor_drone_id: DroneId;
            subject_drone_id: DroneId;
            probability: number;
            draw: number;
            applied: boolean;
            health_delta: number;
          } & {
            actor_drone_id: DroneId;
            subject_drone_id: DroneId;
            probability: number;
            draw: number;
            applied: boolean;
            health_delta: number;
          },
        ];
      }[];
      drone_health: {
        drone_id: DroneId;
        health_before: number;
        health_after: number;
        status_after: 'ACTIVE' | 'DISABLED' | 'REMOVED';
        state_discontinuity: boolean;
      }[];
    };
  };
}
