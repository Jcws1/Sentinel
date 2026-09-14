# Private controlled-degradation timeline

| Flight time | Phase | Treatment |
|---|---|---|
| 0–30 s | Calibration/baseline | Original measured onboard GNSS; used to fit clock and height datum. |
| 30–45 s | Degraded | Increasing deterministic position disturbance. |
| 45–85 s | Denied | Fallback source with accumulating drift. |
| 85–100 s | Recovering | GNSS return with decaying validation offset. |
| 100 s–end | Recovered | Original measured onboard GNSS. |

Keep this timeline private until Anchor returns its first decisions.
