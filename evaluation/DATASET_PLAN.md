# Real-UAV dataset evidence plan

Dataset downloads are gated by licence verification, published frame/time
documentation, independent truth quality, and reproducible source hashes.

## Evidence tiers

| Priority | Dataset | Role | Candidate estimate | Independent truth | Distribution note |
|---|---|---|---|---|---|
| 1 | EuRoC MAV | Small real-flight pipeline smoke test and GNSS-denied dynamics | No native GNSS candidate; any replay estimate must be labelled modelled | Vicon or Leica | Verify ETH terms before redistribution |
| 2 | MUN-FRL quarry sequence | Primary outdoor nominal trajectory and controlled GNSS withholding | Online RTK `/fix` | PPK `/fix_frl` | Dataset documentation states CC BY 4.0 |
| 3 | NTU VIRAL | Singapore-context GNSS-denied trajectory validation | VIO/LiDAR/ranging estimator outputs where available | Leica tracker | CC BY-NC-SA; do not send derivatives until collaboration use is cleared |
| 4 | INSANE transition sequence | Naturally difficult indoor/outdoor transition | Raw/onboard navigation streams | Continuous high-accuracy reference | Licence and sequence-level availability require audit |

## Leakage controls

- Truth files are private and physically separate from Anchor input.
- Controlled outages mask the candidate navigation input only; truth remains
  continuous and hidden.
- One sequence is used for schema/calibration work and a different sequence is
  reserved for holdout scoring.
- Outage intervals and score thresholds are frozen before holdout execution.
- SE(3)-aligned trajectory error is supplementary only; absolute unaligned
  error remains the primary metric for a global-position integrity checker.

## Planned first acquisition

Use one EuRoC sequence to prove extraction, timestamp alignment, replay and
scoring at manageable size. It is a tooling smoke test, not the final nominal
GNSS claim. The first defensible outdoor accuracy report will use MUN-FRL or a
comparable real UAV sequence containing both a candidate navigation stream and
a separately processed/reference trajectory.
