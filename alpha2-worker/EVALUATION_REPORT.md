# Level 3 v3 Evaluation Report

## Alpha.2 full-development status

The current artifact uses all 900 development scenarios. Validation was divided by stable scenario hash into 164 calibration scenarios and 136 untouched evaluation scenarios.

| Task | Accuracy | Macro-F1 | Important class result |
|---|---:|---:|---|
| Motion | 59.1% | 0.566 | Irregular recall 39.9% |
| Asset relation | 81.5% | 0.647 | Approaching recall 75.5%; precision 74.5% |
| Coordination | 33.4% | 0.191 | Experimental only |

Crossing tracks classified as approaching: 6.0%.

The asset-relation layer is suitable for guarded demo integration. Motion remains provisional. Coordination must not drive priority or response decisions.

## Earlier architecture experiment

These earlier numbers are retained for traceability and are not operational accuracy claims.

The 300-scenario validation archive was partitioned by a stable scenario hash:

- training: 171 scenarios;
- probability calibration and threshold selection: 68 scenarios;
- untouched internal test: 61 scenarios.

No individual frames from one scenario cross partitions.

## Internal test results

| Task | Accuracy | Macro-F1 | Important class result |
|---|---:|---:|---|
| Motion | 60.1% | 0.633 | Irregular recall 61.9% |
| Asset relation | 83.6% | 0.633 | Approaching recall 68.5% |
| Coordination | 51.2% | 0.184 | Diagnostic only; simulator truth is invalid |

Crossing tracks classified as approaching: 5.8%.

## Locked sealed-transfer diagnostic

The fitted model was applied unchanged to the existing sealed trajectories. The model does not read any known leakage fields. Nevertheless, the archive itself is compromised, so these remain diagnostic results:

| Task | Accuracy | Macro-F1 | Important class result |
|---|---:|---:|---|
| Motion | 45.5% | 0.523 | Irregular recall 36.6% |
| Asset relation | 81.2% | 0.621 | Approaching recall 57.2% |
| Coordination | 47.9% | 0.176 | Diagnostic only |

Crossing tracks classified as approaching: 6.6%.

The transfer drop is important. It demonstrates that the earlier 95.66% result should not be treated as general real-world accuracy.

## Iteration history

| Iteration | Motion macro-F1 | Relation macro-F1 | Approach recall |
|---|---:|---:|---:|
| Initial v3 | 0.593 | 0.507 | 25.8% |
| Longer temporal memory | 0.633 | 0.511 | 30.5% |
| Causal distance trends | 0.633 | 0.633 | 68.5% |

The third iteration improved approach detection using observed distance trends over multiple causal windows. It did not use sealed results for tuning.

## Interpretation

The asset-relation layer is now a useful research baseline. Motion classification needs domain-randomized training, especially for irregular behaviour. Coordination cannot be repaired through model tuning until the simulator generates real formations, splits and merges.
