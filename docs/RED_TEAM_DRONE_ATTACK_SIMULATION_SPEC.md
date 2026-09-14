# Red-team drone attack simulation: command and outcome contract

Date: 6 September 2026  
Scope: Sentinel simulator and mission replay; simulation data only

## 1. Summary

This feature executes a **simulation-only red-team drone scenario** inside a
declared geographic area. It consumes time-indexed drone state snapshots,
identifies opposing simulated drones that are close enough to interact, applies
a versioned probability profile, and returns deterministic interaction records
and per-drone health changes.

The service does not plan a real attack, choose real targets, control physical
aircraft, model a weapon or payload, or accept `LIVE` sensor sources. Its purpose
is defensive stress testing, operator training, and reproducible mission replay.

The interface deliberately follows the “current state / proposed state /
observable output” style used by the Kubernetes sidecar KEP's `kubectl changes`
section. The contract below is normative: an implementer should be able to
construct valid and invalid test cases without further guidance.

## 2. Desired system behavior

### 2.1 Current behavior

Sentinel can generate an intercept recommendation and move simulated friendly
vehicles toward a threat. It does not yet expose one authoritative request that:

1. starts or controls a red-team simulation run;
2. accepts a complete time series of simulated drone states;
3. resolves opposing-drone interactions reproducibly; and
4. returns auditable health transitions grouped by input timestamp.

### 2.2 Proposed behavior

Expose the pure domain operation:

```ts
resolveDroneAttackSimulation(
  request: DroneAttackSimulationRequest,
): DroneAttackSimulationResponse
```

For every accepted timestamp, the operation shall:

1. validate and canonically sort the snapshot;
2. retain only drones inside the declared area and altitude band;
3. form each eligible `RED`/`BLUE` pair at most once;
4. resolve that pair using the request's immutable calibration profile and
   deterministic draws;
5. apply health changes simultaneously at the end of the timestamp;
6. emit one interaction result for every eligible pair, including no-effect
   outcomes; and
7. preserve the request, command acknowledgement, profile identity, draws, and
   results in the mission recording.

Identical valid requests must produce byte-equivalent domain results after JSON
object keys are canonicalized. Array order is defined below.

## 3. Goals and non-goals

Goals:

- exact JSON input and output contracts;
- deterministic unit, integration, and replay tests;
- explicit command lifecycle and validation failures;
- auditable probability provenance rather than an unexplained “Ukraine” claim;
- compatibility with Sentinel's WGS84 positions, simulated-source boundary,
  mission events, and terminal track states.

Non-goals:

- route generation, target selection, force optimization, or real-world tactics;
- detailed aerodynamics, electronic warfare, payload, blast, or casualty models;
- use of live telemetry or dispatch to real vehicles;
- claiming empirical validity until a reviewed dataset and calibration report
  have been attached to a profile version.

## 4. Request contract

### 4.1 TypeScript shape

```ts
type DroneTeam = 'RED' | 'BLUE' | 'NEUTRAL' | 'UNKNOWN'
type DroneClass = 'I' | 'II' | 'III' | 'UNKNOWN'

interface DroneStateInput {
  drone_id: string
  longitude_deg: number
  latitude_deg: number
  altitude_m: number
  class: DroneClass
  team: DroneTeam
  health: number
  status: 'ACTIVE' | 'DISABLED' | 'REMOVED'
}

interface EffectRule {
  actor_class: DroneClass
  subject_class: DroneClass
  probability: number
  health_delta: number
}

interface DroneAttackSimulationRequest {
  schema_version: '1.0'
  mission_id: string
  command: {
    command_id: string
    action: 'START' | 'HOLD' | 'RESUME' | 'ABORT'
    issued_at: string
    execute_at: string
    source_mode: 'SIMULATED' | 'REPLAY'
  }
  area: {
    area_id: string
    polygon: Array<[number, number]>
    min_altitude_m: number
    max_altitude_m: number
  }
  resolution: {
    interaction_radius_m: number
    location_grid_deg: number
  }
  calibration_profile: {
    profile_id: string
    version: string
    evidence_status: 'NOTIONAL' | 'PUBLIC_PARTIAL' | 'VALIDATED'
    source_summary: string
    rules: EffectRule[]
  }
  samples_by_timestamp: Record<string, DroneStateInput[]>
}
```

### 4.2 Field rules

| Field | Required rule |
| --- | --- |
| `schema_version` | Exactly `"1.0"`. |
| `mission_id`, `command.command_id`, `area.area_id` | 1–128 printable ASCII characters; no leading or trailing whitespace. |
| `command.action` | `START` evaluates samples. `HOLD` and `ABORT` return no interactions. `RESUME` evaluates samples only when applied to a held run. |
| `issued_at`, `execute_at`, timestamp map keys | RFC 3339 UTC with millisecond precision, e.g. `2026-09-06T00:00:00.000Z`. Offsets other than `Z` are rejected. |
| `source_mode` | `SIMULATED` or `REPLAY`. Any `LIVE` value is rejected. |
| `polygon` | Closed GeoJSON-style linear ring: 4–101 positions, first equals last, each position is `[longitude_deg, latitude_deg]`. No self-intersection. |
| longitude / latitude | Longitude in `[-180, 180]`; latitude in `[-90, 90]`; both finite. |
| altitude | Metres above mean sea level, finite, in `[-100, 20_000]`. Area minimum must be less than or equal to maximum. |
| `interaction_radius_m` | Finite value in `[0.1, 10_000]`. Boundary is inclusive. |
| `location_grid_deg` | One of `0.0001`, `0.0005`, or `0.001`. |
| `profile_id`, `version` | Non-empty. They identify immutable calibration content. Reusing the pair with different rules is an error. |
| `source_summary` | Non-empty provenance statement. `VALIDATED` additionally requires an externally stored calibration report; it must not be inferred from this string. |
| rule probability | Finite value in `[0, 1]`. |
| rule health delta | Integer in `[-100, -1]`. Effects cannot increase health. |
| timestamp count | 1–10,000 for `START` or `RESUME`; zero or more for `HOLD` or `ABORT`. |
| snapshot size | 0–10,000 drones. |
| `drone_id` | 1–128 printable ASCII characters and unique within a snapshot. |
| `health` | Integer in `[0, 100]`. `ACTIVE` requires health greater than zero. `DISABLED` or `REMOVED` requires health equal to zero. |

Unknown fields are rejected in version `1.0`. JSON `null`, `NaN`, and infinity
are invalid for every field. Empty snapshots are valid and produce an empty
interaction list.

Timestamps are processed in ascending instant order, regardless of JSON member
order. Timestamps must be unique after parsing and must be greater than or equal
to `execute_at`. A drone may disappear from a later snapshot; this means only
that it was not observed in that input snapshot and does not itself create a
`REMOVED` outcome.

### 4.3 Calibration completeness

For each eligible pair, the engine performs two directional effect checks:
`RED -> BLUE` and `BLUE -> RED`. The profile therefore needs exactly one rule
for every ordered class pair that can occur in the supplied samples. Duplicate
rules or missing rules are validation errors. `UNKNOWN` is an ordinary class
for lookup purposes and does not act as a wildcard.

No probability values are hard-coded by this contract. Until a reviewed public
dataset, extraction method, sample period, uncertainty analysis, and validation
report exist, test profiles must use `evidence_status: "NOTIONAL"`. A profile
must not be described as “estimated from field data in Ukraine” merely because
that phrase appears in `source_summary`.

## 5. Resolution algorithm

### 5.1 Eligibility

A drone is spatially eligible when its horizontal point is inside the polygon
(the boundary counts as inside) and its altitude is within the inclusive area
band. An interaction pair is eligible only when all are true:

- both drones are spatially eligible;
- both have `status: "ACTIVE"` and health greater than zero;
- one is `RED` and the other is `BLUE`; and
- their three-dimensional separation is at most
  `resolution.interaction_radius_m`.

`NEUTRAL` and `UNKNOWN` drones never form pairs in version `1.0`, but remain
valid inputs. Horizontal distance uses WGS84 great-circle distance with Earth
radius `6_371_008.8 m`; 3-D separation is:

```text
sqrt(horizontal_distance_m^2 + (altitude_a_m - altitude_b_m)^2)
```

Candidate pairs are sorted by `(red.drone_id, blue.drone_id)` using ascending
Unicode code-point order. Each pair is resolved once per timestamp. A drone may
participate in multiple pairs at the same timestamp.

### 5.2 Deterministic effect draw

Each directional check is order-independent. Construct this UTF-8 string:

```text
schema_version|mission_id|command_id|timestamp|actor_id|subject_id|profile_id|version
```

Compute SHA-256, interpret the first eight digest bytes as an unsigned 64-bit
big-endian integer `n`, and calculate:

```text
draw = n / 18446744073709551616
```

The effect occurs when `draw < rule.probability`. The exact decimal `draw`
serialized in the response must be the implementation's IEEE-754 double value.
Tests comparing JSON should use a tolerance of `1e-15` for this field only.

### 5.3 Simultaneous health update

For each successful directional effect, add the matched rule's negative
`health_delta` to the subject's pending delta. Sum all pending deltas at that
timestamp, then apply them simultaneously:

```text
health_after = max(0, min(100, health_before + sum(health_delta)))
```

`health_after == 0` yields `status_after: "DISABLED"`; otherwise the status
remains `ACTIVE`. An output at timestamp `T` does not silently mutate an input at
timestamp `T+1`: the caller must provide the next snapshot's health. If that
next health differs from the prior calculated health, the snapshot is still
accepted and `state_discontinuity: true` is emitted for that drone. This makes
replay/import corrections visible instead of guessing which source is right.

### 5.4 Location identifier

For an eligible pair, take the arithmetic midpoint of longitude, latitude, and
altitude. Let `g = location_grid_deg` and calculate:

```text
lat_index = floor(((midpoint_latitude + 90) / g) + 1e-9)
lon_index = floor(((midpoint_longitude + 180) / g) + 1e-9)
alt_index = floor(midpoint_altitude_m / 50)
location_id = "grid:" + g + ":" + lat_index + ":" + lon_index + ":" + alt_index
```

The `1e-9` quotient epsilon prevents a value mathematically on a grid boundary
from falling into the preceding bin because of binary floating-point noise.
This identifier is only a stable simulation bin. It is not a navigational
coordinate or a target identifier.

## 6. Response contract

```ts
interface DirectionalEffectResult {
  actor_drone_id: string
  subject_drone_id: string
  probability: number
  draw: number
  applied: boolean
  health_delta: number
}

interface InteractionResult {
  interaction_id: string
  location_id: string
  red_drone_id: string
  blue_drone_id: string
  separation_m: number
  outcome: 'NO_EFFECT' | 'RED_EFFECT' | 'BLUE_EFFECT' | 'MUTUAL_EFFECT'
  effects: [DirectionalEffectResult, DirectionalEffectResult]
}

interface DroneHealthResult {
  drone_id: string
  health_before: number
  health_after: number
  status_after: 'ACTIVE' | 'DISABLED' | 'REMOVED'
  state_discontinuity: boolean
}

interface TimestampResult {
  interactions: InteractionResult[]
  drone_health: DroneHealthResult[]
}

interface DroneAttackSimulationResponse {
  schema_version: '1.0'
  mission_id: string
  command_ack: {
    command_id: string
    status: 'ACCEPTED' | 'SUCCEEDED' | 'REJECTED'
    run_status: 'RUNNING' | 'HELD' | 'ABORTED' | 'FAILED'
    error_code: string | null
    error_path: string | null
    error_message: string | null
  }
  calibration: {
    profile_id: string
    version: string
    evidence_status: 'NOTIONAL' | 'PUBLIC_PARTIAL' | 'VALIDATED'
  }
  results_by_timestamp: Record<string, TimestampResult>
}
```

`interaction_id` is the lowercase hexadecimal SHA-256 digest of:

```text
mission_id|timestamp|red_drone_id|blue_drone_id
```

For each timestamp, `interactions` uses candidate-pair order and `drone_health`
contains every input drone sorted by `drone_id`, including drones outside the
area and drones whose health did not change. For every effect, `health_delta` is
the rule delta when applied and `0` otherwise. The two `effects` entries are
always ordered `RED -> BLUE`, then `BLUE -> RED`.

`separation_m` is rounded to three decimal places. All other domain numbers are
unrounded except calculated health, which is an integer by construction.

On validation failure, the service stops before evaluating any timestamp,
returns HTTP `422`, sets `command_ack.status` to `REJECTED`, sets `run_status`
to `FAILED`, reports the first error in deterministic document order, and
returns an empty `results_by_timestamp`. Syntax errors return HTTP `400`.
Repeated submission of the same `command_id` and byte-equivalent canonical
request returns the stored response. Reuse with different content returns HTTP
`409 COMMAND_ID_CONFLICT`.

## 7. Minimal valid test fixture

The following fixture deliberately uses a notional probability of `1` in one
direction and `0` in the other so its expected outcome does not depend on
manually calculating SHA-256.

```json
{
  "schema_version": "1.0",
  "mission_id": "MSN-REDTEAM-001",
  "command": {
    "command_id": "CMD-0001",
    "action": "START",
    "issued_at": "2026-09-06T00:00:00.000Z",
    "execute_at": "2026-09-06T00:00:01.000Z",
    "source_mode": "SIMULATED"
  },
  "area": {
    "area_id": "TRAINING-AREA-A",
    "polygon": [[103.8, 1.3], [103.9, 1.3], [103.9, 1.4], [103.8, 1.4], [103.8, 1.3]],
    "min_altitude_m": 0,
    "max_altitude_m": 500
  },
  "resolution": {
    "interaction_radius_m": 100,
    "location_grid_deg": 0.001
  },
  "calibration_profile": {
    "profile_id": "NOTIONAL-UNIT-TEST",
    "version": "1.0.0",
    "evidence_status": "NOTIONAL",
    "source_summary": "Synthetic values for deterministic software tests only.",
    "rules": [
      {"actor_class": "I", "subject_class": "I", "probability": 1, "health_delta": -40}
    ]
  },
  "samples_by_timestamp": {
    "2026-09-06T00:00:01.000Z": [
      {"drone_id": "RED-001", "longitude_deg": 103.8500, "latitude_deg": 1.3500, "altitude_m": 100, "class": "I", "team": "RED", "health": 100, "status": "ACTIVE"},
      {"drone_id": "BLUE-001", "longitude_deg": 103.8504, "latitude_deg": 1.3500, "altitude_m": 100, "class": "I", "team": "BLUE", "health": 100, "status": "ACTIVE"}
    ]
  }
}
```

Both directions use the same ordered class rule, so both effects apply. The
complete golden domain response is:

```json
{
  "schema_version": "1.0",
  "mission_id": "MSN-REDTEAM-001",
  "command_ack": {
    "command_id": "CMD-0001",
    "status": "SUCCEEDED",
    "run_status": "RUNNING",
    "error_code": null,
    "error_path": null,
    "error_message": null
  },
  "calibration": {
    "profile_id": "NOTIONAL-UNIT-TEST",
    "version": "1.0.0",
    "evidence_status": "NOTIONAL"
  },
  "results_by_timestamp": {
    "2026-09-06T00:00:01.000Z": {
      "interactions": [
        {
          "interaction_id": "eeeb957e3be315d758ad600cc25ab949fe9378c5fe34915e6b117035697f7bde",
          "location_id": "grid:0.001:91350:283850:2",
          "red_drone_id": "RED-001",
          "blue_drone_id": "BLUE-001",
          "separation_m": 44.466,
          "outcome": "MUTUAL_EFFECT",
          "effects": [
            {
              "actor_drone_id": "RED-001",
              "subject_drone_id": "BLUE-001",
              "probability": 1,
              "draw": 0.8204014648443899,
              "applied": true,
              "health_delta": -40
            },
            {
              "actor_drone_id": "BLUE-001",
              "subject_drone_id": "RED-001",
              "probability": 1,
              "draw": 0.08531604384705933,
              "applied": true,
              "health_delta": -40
            }
          ]
        }
      ],
      "drone_health": [
        {
          "drone_id": "BLUE-001",
          "health_before": 100,
          "health_after": 60,
          "status_after": "ACTIVE",
          "state_discontinuity": false
        },
        {
          "drone_id": "RED-001",
          "health_before": 100,
          "health_after": 60,
          "status_after": "ACTIVE",
          "state_discontinuity": false
        }
      ]
    }
  }
}
```

## 8. Command lifecycle and observable behavior

| Prior run state | Command | Result |
| --- | --- | --- |
| no run | `START` | Validate entire request, create run, evaluate samples, return `SUCCEEDED/RUNNING`. |
| running | `HOLD` | Return `SUCCEEDED/HELD`; no timestamps are evaluated. |
| held | `RESUME` | Evaluate supplied timestamps and return `SUCCEEDED/RUNNING`. |
| running or held | `ABORT` | Return `SUCCEEDED/ABORTED`; no timestamps are evaluated and the recording is finalized. |
| running | `START` | Reject with `409 RUN_ALREADY_STARTED`. |
| no run or aborted | `RESUME` | Reject with `409 RUN_NOT_HELD`. |
| aborted | any mutating command | Reject with `409 RUN_TERMINAL`. |

The mission service, not the browser, owns these transitions. Recording begins
before the first timestamp is evaluated. Each accepted command and each
interaction becomes an append-only mission event; timestamp state becomes a
replay frame. Replay must apply health/status changes discretely at the recorded
timestamp and must never feed them into the live operational store.

## 9. Defensive scenario acceptance test

Use the supplied “Operation Malindo Darsasa 3AB” narrative only as a fictional,
worst-case defensive load test. Scenario labels may mention the fictional
coalition, but fixtures should use synthetic area IDs and perturbed/non-operable
coordinates rather than encode routes to real installations.

The acceptance dataset should contain these simulation phases:

1. `T+00:00`: simultaneous south and north warning tracks appear;
2. `T+00:30`: a large synthetic red swarm enters two defended training areas;
3. `T+01:00`: blue simulated interceptors are present and opposing pairs begin
   producing interaction records;
4. `T+02:00`: some red and blue drones reach zero health while neutral and
   unknown tracks remain unaffected;
5. `T+03:00`: a `HOLD` produces no new outcomes despite supplied samples;
6. `T+03:30`: `RESUME` continues from explicitly supplied health states; and
7. `T+04:00`: `ABORT` finalizes a replayable, internally consistent record.

Pass criteria:

- the same request produces identical results across two clean runs;
- no pair is duplicated within a timestamp;
- boundary distance and polygon cases are inclusive;
- input array order does not affect results;
- simultaneous effects do not depend on pair-processing order;
- neutral/unknown and out-of-area drones receive unchanged health rows;
- the test produces no real dispatch command and accepts no live source;
- hold, resume, abort, idempotency, and conflict behavior match section 8; and
- replay shows the same interaction IDs, draws, health transitions, and
  timestamp ordering as the original run.

## 10. Required negative tests

At minimum, cover: malformed JSON; unknown field; `LIVE` source; unclosed or
self-intersecting polygon; invalid coordinate; duplicate drone ID; active drone
at zero health; missing or duplicate calibration rule; probability outside
`[0,1]`; positive health delta; timestamp before `execute_at`; duplicate parsed
timestamp; command ID conflict; invalid lifecycle transition; exact-radius
pair; just-outside-radius pair; polygon-edge point; altitude-band endpoints;
empty snapshot; and 10,000-drone maximum-size snapshot.

## 11. Open calibration decision

Before changing a profile to `PUBLIC_PARTIAL` or `VALIDATED`, the team must name
the precise source dataset and freeze a calibration artifact containing:
collection dates, inclusion/exclusion rules, class mapping, missing-data policy,
sample counts, estimator, confidence intervals, geographic/operational limits,
reviewer, checksum, and approval date. Until then, all numerical effects remain
explicitly notional and suitable only for software behavior tests.
