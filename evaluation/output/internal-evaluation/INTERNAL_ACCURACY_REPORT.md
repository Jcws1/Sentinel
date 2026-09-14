# Sentinel accuracy evaluation — internal

## Result

The coordinate transport itself is effectively lossless, but the current
Sentinel uncertainty/confidence semantics are not calibrated against real 3D
error. Treat them as heuristic display values, not statistical accuracy bounds.

| Measure | Temporal holdout result |
|---|---:|
| Candidate horizontal RMSE | 0.389 m |
| Candidate horizontal p95 | 0.781 m |
| Candidate vertical RMSE | 4.067 m |
| Candidate 3D RMSE | 4.086 m |
| Sentinel transform horizontal RMSE | 0.001 m |
| Sentinel-reported uncertainty coverage | 9.2% |
| Sentinel overconfident samples | 732 |

Clock offset was fitted only on the first 30 seconds and then frozen. All
accuracy values in the primary result are from the later temporal holdout. This
is stronger than scoring the calibration samples, but remains a same-flight
holdout rather than a separate flight.

## Controlled degradation

The degraded recording overlays deterministic modelled drift on measured real
UAV motion. It tests Anchor's decision logic repeatably; it does not claim to
reproduce every RF, multipath, spoofing, or autopilot failure mode.

Holdout degraded horizontal RMSE: 2.553 m.  
Holdout degraded 3D RMSE: 5.226 m.

## Interpretation limits

- Onboard DJI GNSS and PPK can share common-mode GNSS errors.
- DJI height is relative to takeoff; PPK height is ellipsoidal. A constant datum
  fitted on the calibration partition does not remove time-varying barometric
  or vertical-source disagreement.
- The extracted candidate has 11–16 satellites but no trustworthy fix-quality
  or covariance field in the public preview.
- Validate final hardware with independent surveyed RTK truth and synchronized
  clocks before making safety or operational claims.
