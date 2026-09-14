# Sentinel to Anchor blind handoff

This package contains existing-format `sentinel-sim` gateway telemetry from a
real DJI M600 trajectory in the MUN-FRL quarry1 dataset.

## Recordings

- `gateway-normal.telemetry.ndjson`: measured onboard DJI GNSS trajectory,
  transformed into local ENU and wrapped in Sentinel's existing gateway event.
- `gateway-gnss-degraded.telemetry.ndjson`: the same measured motion with a
  deterministic MODELLED fault overlay. It is not a naturally recorded jammer.

The independent PPK truth, degradation timeline, enriched sidecars, and accuracy
results are intentionally excluded so Anchor can be assessed blind. Sentinel
retains those in a separate private package.

## Limitations

The raw DJI CSV download was quota-blocked by Google Drive. The candidate
trajectory was recovered from Drive's public CSV preview PDF with a reproducible
extractor and hashed. Onboard GNSS and PPK are related GNSS sources, so
common-mode GNSS error is not independently observable in this sequence.

## Existing gateway sample

```json
{
  "protocol": "sentinel-sim",
  "protocolVersion": "1.0",
  "messageId": "accuracy-MUN-FRL-QUARRY1-UAV-000000",
  "sequence": 0,
  "timestamp": "2022-02-22T19:12:31.060Z",
  "scenarioId": "accuracy-evaluation",
  "type": "telemetry.frame",
  "data": {
    "vehicleId": "MUN-FRL-QUARRY1-UAV",
    "platformId": "real-uav-dataset-replay",
    "displayName": "MUN-FRL-QUARRY1-UAV",
    "role": "scout",
    "groupId": "accuracy-evaluation",
    "controlBackend": "px4_sitl",
    "lifecycle": "ACTIVE",
    "source": "runtime",
    "pose": {
      "frame": "LOCAL_ENU",
      "eastM": 4.099341000824264,
      "northM": 0.12374571645881499,
      "upM": -0.7303662836903788,
      "rollRad": 0,
      "pitchRad": 0,
      "yawRad": 0
    },
    "navigationSource": "GNSS",
    "updatedAt": "2022-02-22T19:12:31.060Z"
  }
}
```

Run Anchor in shadow mode. Do not feed decisions back into Sentinel or the
aircraft during this evaluation.
