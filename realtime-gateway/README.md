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
- `GET /v1/outbox/commands` (diagnostic list of currently eligible, unleased work)
- `POST /v1/outbox/claim`
- `POST /v1/outbox/commands/{command_id}/renew`
- `POST /v1/outbox/commands/{command_id}/release`
- `POST /v1/outbox/commands/{command_id}/retry`
- `GET /v1/commands/{command_id}`
- `POST /v1/commands/{command_id}/outcome` (requires the current lease)
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
idempotent and durable across restart: a retry using the same key and same
semantic command returns `duplicate`; reusing the key for different content is
`409 Conflict`, as is reusing a command ID under another idempotency key. The
SQLite WAL journal uses `synchronous=FULL` and is committed before an accepted
receipt is returned. This is durable admission for the single-host prototype,
not yet a claim of production-grade multi-host durability.

Pending commands are executed through a durable claim/lease protocol. Claiming
atomically assigns an opaque fencing token, expiry, worker ID, and increments a
persisted attempt count. Only that worker/token pair can renew, release, defer,
or complete the command while the lease remains unexpired. Expiry permits a new
worker to reclaim with a new token; the old token is then fenced. Completion
atomically records the terminal outcome and clears the active claim. Times are
persisted as UTC Unix milliseconds and therefore rely on a sufficiently
synchronised host clock. A backwards wall-clock jump can delay reclaim and a
forward jump can expire work early; production deployment needs clock-health
monitoring and conservative lease durations.

Prototype limitations: there is no maximum-attempt/dead-letter policy,
exponential backoff, jitter, executor authentication, per-command lease policy,
or external Wedgetail idempotency guarantee. SQLite serialises journal writes;
the protocol has not yet been qualified for multiple hosts sharing storage.

Observation IDs are likewise idempotent only for byte-equivalent canonical
content; changing content under the same ID returns `409 Conflict`. Request
bodies are capped at 64 KiB, handlers have a five-second prototype timeout,
WebSocket queues and retained suffixes are bounded, and latency samples retain
only the newest 100,000 values.

## Reliability-run resource sampling

`tools/sample_process_resources.py` is an external, standard-library-only
sampler for Windows and Linux. It records process CPU, resident/private memory,
and a copy of `/metrics` on the same monotonic schedule. Keeping this outside
the gateway avoids changing the hot path while the overload harness is being
calibrated.

Build first and launch the executable directly so the measured PID is the
gateway rather than Cargo:

```powershell
cargo build --release --manifest-path realtime-gateway/Cargo.toml
python realtime-gateway/tools/sample_process_resources.py `
  --output test-results/reliability/resources.ndjson `
  --summary test-results/reliability/resources-summary.json `
  --duration-s 600 --interval-ms 250 `
  --command realtime-gateway/target/release/sentinel-realtime-gateway.exe
```

Alternatively, attach with `--pid <gateway-pid>`. The NDJSON stream is bounded
by `--max-samples` (100,000 by default). CPU percentage uses the conventional
single-core scale, where 100 means one logical processor was fully occupied.
The summary contains p95/maximum memory and CPU, the final gateway counters,
metrics-fetch failures, and an explicit stop reason. Set `--metrics-url ""`
when sampling a process without a gateway endpoint.

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
