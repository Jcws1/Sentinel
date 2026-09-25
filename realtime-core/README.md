# Sentinel real-time core prototype

This isolated prototype benchmarks the proposed keyed single-writer track path.
It is not an application server and does not replace the Python backend.

The runner generates deterministic observations, routes each track to exactly
one partition, updates track state, acknowledges immutable revisions, writes an
append-only binary event stream, creates a canonical final-state hash and emits
latency JSON.

Each partition now has a bounded queue (`--queue-capacity`, default `1024`).
The explicit overload policy for observations is lossless producer
backpressure: when a queue is full, the event is counted and the producer
blocks until capacity is available. The JSON includes queue-full, producer
block, coalescing and drop counters; coalescing and drops remain zero under
this policy. Snapshot and shutdown are control messages delivered reliably via
blocking sends. Commands are not yet modeled by this prototype, so no claim is
made about a future durable command lane.

```powershell
cargo run --release --manifest-path realtime-core/Cargo.toml -- `
  --drones 30 --hz 20 --seconds 60 --partitions 4 `
  --queue-capacity 1024 `
  --output test-results/realtime-core/rust-30-20hz.json
```

The benchmark intentionally excludes HTTP, WebSockets, PostgreSQL, NLP and UI.
Its numbers measure the track-processing slice only. Cloud end-to-end claims
require the later service and browser tests described in the PRD.
