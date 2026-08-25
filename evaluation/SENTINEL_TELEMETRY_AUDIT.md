# Sentinel telemetry accuracy audit

Date: 2026-08-24

This audit describes the current implementation before real-dataset replay is
introduced. It is an accuracy claim boundary, not a product specification.

## Current paths

| Path | Interface | Contents | Recording status |
|---|---|---|---|
| Simulator to edge gateway | `sentinel-sim` REST + WebSocket | Vehicle lifecycle, local ENU pose, optional ENU velocity, navigation source | WebSocket is proxied but vehicle frames are not included in the built-in NDJSON recording |
| Sensors to edge gateway | `sentinel-edge` JSON producer API | Radar, RF, EO/IR and acoustic observations with timestamps and covariance | Bounded NDJSON recording and deterministic replay are implemented |
| C2 to operator clients | REST + WebSocket | Normalized WGS84 fleet, tracks, mission and decision state | Full state snapshots are streamed; no durable fleet recording exporter |

Drone fleet state and field-sensor fusion remain separate. Sensor observations
produce analytic sensor tracks; they are not fused into a single cooperative
vehicle position.

## Position field semantics

| Field | Current provenance | Accuracy interpretation |
|---|---|---|
| `position` | Scenario-generated WGS84, or local ENU simulator pose converted to WGS84 | A position value, not proof of physical accuracy |
| `speed`, `bearing` | Scenario motion model when present | Modelled in demo scenarios |
| `navigationSource` | Scenario phase or simulator state/fault mapping | Categorical provenance indicator |
| `positionUncertaintyM` | Scenario formula or simulator-backend constant/formula | Modelled scalar; no declared sigma, CEP or protection-level semantics |
| `positioningConfidence` | Scenario formula or C2 heuristic | Heuristic score, not a calibrated probability |
| `comms` | Scenario/prior C2 state | Categorical UI state; not derived from RSSI/SNR/packet loss |
| `battery` | Scenario/prior C2 state | Percentage only; voltage/current/capacity provenance is absent |
| `updatedAt` | Present on raw simulator vehicle, absent from normalized `Drone` | Source freshness is lost in normalized fleet output |
| `sequence` | Present on the simulator event envelope, absent from normalized `Drone` | Cannot currently detect per-vehicle loss/reordering from fleet records alone |
| `velocity` | Present on raw simulator vehicle, reduced to optional scalar speed in `Drone` | Full 3-axis velocity is lost in normalized output |
| pose covariance | Available for sensor observations, absent for cooperative vehicle telemetry | No statistically defined vehicle-position covariance |

## Accuracy restrictions

1. Scenario 02 nominal uncertainty values are plausible model inputs, not GPS
   receiver measurements.
2. Scenario 02 degradation and drift are deterministic fault models.
3. Simulator `GAZEBO_TRUTH` is an evaluation reference and must not be labelled
   as a navigation sensor reading.
4. Simulated VIO is derived from simulator truth and is not evidence of a
   production visual-inertial estimator.
5. Any public or partner-facing report must label values as `MEASURED`,
   `DERIVED`, or `MODELLED`.
6. Absolute accuracy requires an independent truth trajectory and documented
   time/frame alignment. A self-reported GNSS or RTK fix cannot independently
   validate itself.

## Live baseline observed during this audit

- C2 REST telemetry returned 36 fleet records and 72 mesh links.
- C2 WebSocket emitted full `state.snapshot` messages at approximately the
  configured 400 ms cadence.
- Mean observed snapshot size was approximately 27.5 kB for this state.
- The edge gateway reported one registered source and zero accepted field
  observations at the time of inspection.

These values describe one local run and are not performance guarantees.
