# Alpha.3 Increment 1 integration report

## Provenance

- Source package: `sentinel-alpha3-coordinator-increment1.zip`
- Verified package SHA-256: `e7b18e29cd27ca8022d7bdc9f099a62b829fd14d63a17f934423a23ec3a0a046`
- Integration target: `codex/alpha2-integration`
- Rust toolchain: `rustc 1.98.1 (48a229cea 2026-09-01)`

The repository has independent Rust crates and no root Cargo workspace. The
coordinator was therefore added as the sibling crate `alpha3-coordinator/`
without restructuring or modifying Alpha.2.

## Compiler-discovered defect

The source compiled, but `stable_formation_becomes_coordinated` failed because
group creation restarted the confirmation clock after edge hysteresis had
already consumed sustained evidence time. The coordinator now derives a new
component's `created_at_ms` from the earliest active edge's
`above_since_ms`. This preserves both edge-entry hysteresis and the configured
group-confirmation meaning; the original test was not relaxed.

## Verification

```text
cargo fmt --manifest-path alpha3-coordinator/Cargo.toml -- --check
PASS

cargo test --manifest-path alpha3-coordinator/Cargo.toml
5 passed; 0 failed; doc tests passed

cargo clippy --manifest-path alpha3-coordinator/Cargo.toml --all-targets -- -D warnings
PASS
```

Passing scenarios:

- stable formation becomes coordinated;
- unrelated crossing does not form a group;
- stale revision and wrong mission epoch are rejected;
- dropout grace preserves and then expires a group;
- replay is deterministic.

## Acceptance boundary

Increment 1 is now a passing standalone build, not a benchmark-qualified
coordinator. It remains read-only and is not connected to interceptor-provider
execution. Split/merge corpus coverage, bridge-track resistance, Frozen-v1
replay, repository boundary serialization and per-stage latency telemetry remain
Increment 2 work.
