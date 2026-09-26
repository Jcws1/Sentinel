# Sentinel Alpha.3 Coordinator

Standalone Rust reference for deterministic temporal coordination assessment.

Implemented in Increment 1:

- Bounded per-track histories
- Mission-epoch and monotonic-revision rejection
- Spatial and altitude candidate-pair gating
- Temporal pair evidence with crossing and data-quality penalties
- Hysteretic relationship edges
- Persistent group IDs and revisions
- Forming, coordinated, merging, splitting and dissolved states
- Coordination lifecycle events and reason codes
- Deterministic unit scenarios

Verification status: integrated into the Sentinel repository as an independent
sibling crate. On 27 September 2026, rustfmt, all five unit tests, doc tests and
Clippy with warnings denied passed using Rust 1.98.1. One formation-clock defect
found by the original stable-formation test was repaired without weakening the
test. See `INTEGRATION_REPORT.md`.

This crate does not issue countermeasure commands. Its outputs are intended for a separate confirmation-gated tasking layer.

Run:

```bash
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

Not yet implemented:

- Frozen-v1 Parquet replay adapter
- Complete split/merge corpus
- Bridge-track-resistant graph clustering
- Motion classifier and Alpha.2 asset-relation adapter
- Per-stage benchmarks and production telemetry
- Integration into the existing Sentinel Rust backend
