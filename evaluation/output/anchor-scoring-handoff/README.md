# Sentinel one-UAV GPS-cycle scoring handoff

This package answers Anchor's request for a handshake/schema, one short UAV
recording containing normal GNSS, controlled degradation, loss, and recovery,
and a separate time-aligned position reference.

## Files to replay and score

- `uav-gps-cycle.gateway.ndjson`: the exact existing `sentinel-sim`
  gateway envelope. Replay this into Anchor, one JSON object per line.
- `uav-position-health.sidecar.ndjson`: evaluation-only health metadata keyed
  by the same UAV ID, sequence, and source timestamp. It is not part of the
  current gateway contract.
- `uav-ground-truth.ppk.ndjson`: separate measured PPK reference. Interpolate
  it to each candidate `sourceTimestampNs` to score position error.
- `gateway-handshake.json`: local ENU origin and protocol information.
- `*.schema.json`: machine-readable schemas for all three record types.

## One-UAV timeline

| Elapsed time | State | Classification |
|---|---|---|
| 0–30 s | Raw onboard GNSS baseline; the opening motor/takeoff records precede P-GPS flight state | MEASURED |
| 30–45 s | Increasing deterministic position disturbance | MODELLED |
| 45–85 s | GNSS unavailable; dead-reckoning drift and fix age increase | MODELLED |
| 85–100 s | GNSS recovery with decaying validation offset | MODELLED |
| 100 s–end | Raw onboard GNSS restored | MEASURED |

## Important semantics

- UAV ID: `MUN-FRL-QUARRY1-UAV` in every stream.
- Gateway `timestamp` is ISO-8601 UTC; sidecar/truth timestamps are decimal
  nanoseconds since Unix epoch UTC.
- Position is local ENU in metres: east, north, up from the handshake origin.
- Gateway `sequence` and sidecar `sequence` are monotonic and correspond
  one-to-one. PPK truth is an independent 5 Hz stream and has no sequence join.
- The gateway maps evaluation dead reckoning to `SIMULATED_VIO`, the closest
  value in the existing simulator contract. The sidecar preserves the more
  precise `DEAD_RECKONING` and `UNAVAILABLE` labels.
- Attitude values in the gateway file are zero placeholders because the public
  source did not expose attitude. Do not score them.
- No measured velocity or odometry was available. None has been invented.
- Satellite count in the sidecar is measured during the real source segment and
  explicitly MODELLED as zero during denial. Reported uncertainty/fix age in
  faulted phases are MODELLED test inputs, not measured sensor accuracy.
- PPK and onboard DJI GNSS are related GNSS sources, so common-mode GNSS errors
  are not independently observable. PPK remains separate from replay input.

This is a scoring handoff, not a blind evaluation: Anchor is intentionally
receiving the reference track. Use a later unseen recording for unbiased final
accept/dead-reckon/withhold evaluation.
