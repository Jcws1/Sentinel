# Field dictionary

| Field | Type | Meaning |
|---|---|---|
| `protocol` | string | Always `sentinel-sim` for this interface. |
| `protocolVersion` | string | Gateway contract version; `1.0` here. |
| `messageId` | string | Deterministic unique message identifier. |
| `sequence` | integer | Monotonic event sequence within the recording. |
| `timestamp` | ISO-8601 UTC | Source-correlated event time after documented clock alignment. |
| `scenarioId` | string | Evaluation stream identifier. |
| `type` | string | `telemetry.frame`. |
| `data.vehicleId` | string | Stable cooperative vehicle identity. |
| `data.lifecycle` | string | `ACTIVE` in this recording. |
| `data.pose.frame` | string | `LOCAL_ENU`: x east, y north, z up. |
| `data.pose.eastM` | metres | East displacement from handshake origin. |
| `data.pose.northM` | metres | North displacement from handshake origin. |
| `data.pose.upM` | metres | Relative height aligned once to the PPK vertical datum. |
| `data.pose.rollRad/pitchRad/yawRad` | radians | Zero; attitude was unavailable and must not be evaluated. |
| `data.navigationSource` | enum | `GNSS` normally; `SIMULATED_VIO` during controlled denial. |
| `data.updatedAt` | ISO-8601 UTC | Vehicle source update time. |

The existing record does not carry GNSS fix type, satellites, covariance,
statistically defined confidence, fix age, or three-axis velocity.
