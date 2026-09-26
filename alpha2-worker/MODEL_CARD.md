# Sentinel Level 3 v3 — Model Card

## Intended use

Research and synthetic evaluation of defensive drone-track behaviour. The output is decision-support evidence, not an autonomous engagement decision.

## Inputs used

- observed fused position, velocity, altitude and time;
- track and identity confidence;
- sensor age;
- protected-asset coordinates and monitoring boundaries.

## Inputs deliberately excluded

- scenario metadata and family;
- generator seeds and configuration hashes;
- audit trails and declared behaviour plans;
- event streams containing truth transitions;
- truth profile or track association fields;
- building-value ordinals from this simulator.

## Architecture

- Causal rolling track features at short and long time horizons.
- Calibrated histogram gradient-boosting classifiers for motion and asset relation.
- Calibration-only thresholds for irregular-motion sensitivity and approach recall subject to a crossing false-positive constraint.
- Deterministic ETA from smoothed boundary-distance rate.
- Geometry-derived group state using proximity, velocity alignment and expansion/contraction.

## Known limitations

- Alpha.2 was trained on all 900 development scenarios, calibrated on 164 validation scenarios, and evaluated on a disjoint 136-scenario validation partition.
- This is synthetic evidence only.
- Simulator v2 contains physical group formations, but the current rule-based coordination detector remains insufficient for integration.
- `ambiguous` asset relations are partly assigned by a hidden scenario declaration, making them poorly identifiable from permitted inputs.
- The prediction path is batch-oriented. A production streaming implementation should retain rolling state instead of recomputing complete histories.
- The model does not estimate hostility, consequences, legal permissibility, countermeasure effectiveness, or engagement recommendations.

## Acceptance requirements before operational research claims

1. Improve motion and coordination against independently generated trajectories.
2. Freeze the architecture and thresholds.
3. Evaluate once on a newly generated private sealed split.
4. Test against separately implemented generators and recorded flight data.
5. Report scenario-bootstrap confidence intervals and performance by environment, platform and track age.
