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
- `GET /v1/observations/stream` (full-duplex WebSocket ingest)
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
client may explicitly negotiate `?batch=gzip-v1`; only then may a burst be
carried as an `SDG1`-prefixed binary WebSocket frame containing gzip-compressed
JSON `delta_batch`. Its `items` are unchanged envelopes in stream order. The
format is directly decodable by browser `DecompressionStream("gzip")` after
removing the four-byte prefix. Clients that omit the capability continue to
receive only singleton JSON text deltas. Batches are bounded to
16 deltas or 5 ms, whichever comes first; an isolated delta retains its
original single-envelope representation. Decompressed JSON is capped at 1 MiB
and oversized batches fall back to ordered singleton frames. This reduces framing and packet-loss
head-of-line amplification without dropping or coalescing state. Heartbeats
remain independent and the operator still owns one WebSocket. `/metrics`
reports batch counts plus compressed and uncompressed byte totals in addition
to `deltas_published`. A client whose bounded outbound queue fills receives a best-effort
`gateway_resync_required` message, is disconnected, and must fetch a snapshot.
The gateway retains a bounded suffix (4,096 deltas by default). Connecting with
the snapshot's `x-sentinel-cursor` as `after_sequence` registers the subscriber
and captures the retained suffix atomically. If that cursor has fallen outside
retention, the socket reports `retained_suffix_unavailable` and closes rather
than silently skipping state.
The two gateway transport messages intentionally sit outside the strict v1
domain-message schema.

High-rate sources should use `/v1/observations/stream`. A connection is bound
to the `source_id` of its first valid observation and accepts text or binary
JSON using the unchanged strict `realtime/v1` observation shape. The sender
may pipeline messages without waiting for replies. The gateway emits one
ordered `observation_ack` for every message, correlated by `message_id`,
`observation_id`, and `correlation_id`, with the resulting global delta cursor
or a stable rejection reason. Existing idempotency and monotonic
`source_sequence` checks are shared with the HTTP endpoint. A bounded
acknowledgement queue prevents a non-reading producer from consuming unbounded
memory; overflow disconnects only that stream and increments
`observation_stream_backpressure_disconnects`. Overflow aborts the socket
writer immediately instead of waiting behind the non-reading peer. Individual
writes have a five-second deadline, Ping frames receive Pong replies, and a
stream with no inbound frame for 15 minutes is closed (comfortably beyond the
ten-minute qualification run while still bounding abandoned tasks). This is ordered WebSocket/TCP
transport, so packet loss can still cause head-of-line delay; later production
qualification may compare QUIC streams where that matters.

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

Retries are finite: the fifth durable executor claim is the final attempt. A
retry/release after that claim, or expiry followed by the next claim sweep,
moves the command to durable `terminal` state with
`last_error=maximum_attempts_exhausted` (the prototype's dead-letter
disposition), and it cannot be claimed again. Backoff remains worker-selected
(bounded to 24 hours), so exponential
backoff and jitter are not yet gateway-enforced. Other prototype limitations
include executor authentication, per-command lease policy, and any external
Wedgetail idempotency guarantee. SQLite serialises journal writes; the protocol
has not yet been qualified for multiple hosts sharing storage.

Observation IDs are idempotent only for byte-equivalent canonical content;
changing content under the same retained ID returns `409 Conflict`. The
in-memory observation idempotency window is count-bounded to 100,000 accepted
observations by default (about 167 seconds at the 30 x 20 Hz design rate).
`observation_idempotency_entries`, `..._capacity`, and `..._evictions` expose
that policy on `/metrics`. A retry older than this window is not promised
idempotent and will normally be rejected by the monotonic source-sequence
fence. Production senders must therefore resolve uncertain admission within
the advertised window; extending it requires durable storage, not an
unbounded map.

The retained representation shares each observation ID between its lookup and
FIFO indexes, stores SHA-256 digests as 32 raw bytes, and omits derivable delta
constants and message IDs. Duplicate replies reconstruct the same
`track_delta`; these storage details do not shorten the 100,000-observation
retry horizon.

The finite horizon has two deliberate consequences. An exact retry after its
ID has been evicted is rejected as `source_sequence_not_increasing` while the
source/track sequence fence remains present. Conversely, reusing that evicted
observation ID with a later valid source sequence cannot be detected because
the old fingerprint is no longer retained. Producers must therefore keep IDs
globally unique and reconcile uncertain sends before eviction; durable
historical ID-reuse detection is outside this in-memory prototype contract.

Scenario state enforces the agreed 30-track maximum. Source/track sequence
identities are separately limited to 120 (four sources per maximum-size
scenario) so adversarial source IDs cannot grow the ordering map without
bound. New identities over either limit receive `429` with
`track_capacity_exceeded` or `source_track_identity_capacity_exceeded`;
existing admitted tracks continue updating. `/metrics` exposes both current
cardinalities, configured limits, and rejection counters. Scenario rollover
requires a fresh gateway epoch in this prototype; production lifecycle APIs
must explicitly retire state rather than silently evicting a live track.

Request bodies are capped at 64 KiB, handlers have a five-second prototype
timeout, WebSocket queues and retained suffixes are bounded, and gateway
latency samples retain only the newest 100,000 values. The reliability harness
also uses fixed-memory deterministic reservoirs (16,384 values per latency
series) and a bounded 32,768-entry ingress timestamp window. Evidence reports
both total and retained sample counts plus timestamp evictions, so long-run
percentiles are identified as sampled rather than silently presented as exact.

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
