# Sentinel hosted countermeasure simulation

This Rust/Axum service is an isolated, simulation-only acceptance surface. It
demonstrates a current simulated track, a non-authoritative Respond
recommendation, explicit operator confirmation, safety-gate validation,
provider dispatch, contact telemetry and an authoritative **simulated** outcome.

It never connects to real vehicles or weapons. The provider is
`LocalSimulatorAdapter`; SQLite records the confirmed command and outcome. A
stale world revision returns HTTP 409.

```powershell
$env:SENTINEL_DEMO_ADDR='127.0.0.1:8096'
cargo run --manifest-path countermeasure-demo/Cargo.toml
```

