# Sentinel realtime gateway prototype

An isolated network vertical slice for the checked-in `contracts/realtime/v1`
semantics. It is deliberately in-memory and does not integrate NLP, Wedgetail,
the scenario service, or `realtime-core`.

```powershell
cargo run --manifest-path realtime-gateway/Cargo.toml
```

The process refuses a non-loopback bind by default. The escape hatch
`SENTINEL_ALLOW_INSECURE_REMOTE_BIND=1` exists only for an explicitly isolated
prototype environment; it does not add authentication or TLS.

Endpoints:

- `GET /healthz`
- `GET /metrics` (JSON counters and ingest latency percentiles)
- `GET /v1/snapshot`
- `POST /v1/observations`
- `POST /v1/commands`
- `GET /v1/commands/{command_id}`
- `GET /v1/deltas?after_sequence=N` (WebSocket)

Every HTTP response participating in recovery includes `x-sentinel-epoch`.
The WebSocket boundary is explicitly versioned as `sentinel-gateway/v1`. It
begins with a `gateway_hello` transport message and then wraps each exact v1
`track_delta` payload in an envelope containing `server_epoch`,
`base_sequence`, and `result_sequence`. These fields are deliberately not
claimed to be part of the checked-in realtime/v1 domain contract. A
client whose bounded outbound queue fills receives a best-effort
`gateway_resync_required` message, is disconnected, and must fetch a snapshot.
The gateway retains a bounded suffix (4,096 deltas by default). Connecting with
the snapshot's `x-sentinel-cursor` as `after_sequence` registers the subscriber
and captures the retained suffix atomically. If that cursor has fallen outside
retention, the socket reports `retained_suffix_unavailable` and closes rather
than silently skipping state.
The two gateway transport messages intentionally sit outside the strict v1
domain-message schema.

Commands are posted in a `sentinel-gateway/v1` wrapper containing
`expected_epoch`, `expected_revision`, and the strict realtime/v1 `command`.
Stale preconditions are rejected before admission. Command admission is
idempotent in-process: a retry using the same key and same
semantic command returns `duplicate`; reusing the key for different content is
`409 Conflict`, as is reusing a command ID under another idempotency key. It is
not yet durable across restart, so an `accepted` receipt
must not yet be interpreted as production-grade durable admission.

Observation IDs are likewise idempotent only for byte-equivalent canonical
content; changing content under the same ID returns `409 Conflict`. Request
bodies are capped at 64 KiB, handlers have a five-second prototype timeout,
WebSocket queues and retained suffixes are bounded, and latency samples retain
only the newest 100,000 values.

## Contract follow-up

The checked-in realtime/v1 schema has no stream epoch, delta base/result
cursor, heartbeat, or command `expected_epoch`/`expected_revision`. The gateway
therefore supplies recovery metadata in its separately versioned transport
envelope and HTTP headers; it does not add unknown fields to strict v1 domain
messages. Before production, publish a successor contract containing those
concepts and define heartbeat/liveness semantics. Also note that realtime/v1
requires snapshot sequences to start at 1, while a truthful empty-world cursor
is 0; an empty prototype snapshot consequently documents the real cursor but
does not validate against the current strict schema. This must be corrected in
the successor contract.
