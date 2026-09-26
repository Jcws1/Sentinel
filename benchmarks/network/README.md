# Five-client network evaluation harness

This independent harness exercises the boundary specified in
`realtime-core/NETWORK_EVALUATION_PLAN.md`. It does not import or modify the
Rust core. Its live-state modes deliberately share the same client reference model:

- `dry-run` uses a deterministic in-process gateway to validate workload,
  sequencing, five-client isolation, gap recovery, command idempotency and
  evidence generation before a network gateway exists.
- `live` connects to a real HTTP/WebSocket gateway. The endpoint paths are
  configurable because the production routes have not yet been frozen.
- `restart` launches the real gateway twice against the same command database.
  It admits one command and terminal outcome, restarts the process, reconciles
  both records, retries the same semantic command, and verifies changed-content
  conflicts. This is ledger durability evidence, not proof that an external
  executor performs an effect exactly once.

The dry run is a harness self-test, **not network performance evidence**.

## Dependencies

Python 3.11 or newer is required. Live WebSocket mode additionally requires:

```powershell
python -m pip install -r benchmarks/network/requirements.txt
```

No third-party dependency is needed for dry-run or unit tests.

## Short reliability calibration

Build the release gateway, install the live-harness dependencies, then run the
seconds-long calibration matrix:

```powershell
cargo build --release --manifest-path realtime-gateway/Cargo.toml
python -m pip install -r benchmarks/network/requirements.txt
python benchmarks/network/reliability_calibration.py --duration 2
```

The calibration runs 3, 10 and 30 drones at 20 Hz, a 30-drone 100 Hz burst,
five WebSocket clients, a deliberately slow reader, a forced disconnect with
cursor replay, and a command whose HTTP response is deliberately discarded
before durable reconciliation and process restart. It records endpoint and
gateway stage latency, accepted/rejected observations, gateway queue high-water
mark and slow-client disconnects, resyncs/gaps, plus sampled process CPU, RSS,
virtual memory and thread count. Each scenario is retained as its own JSON file.
It has purpose-specific gates: exact offered/accepted counts, at least 80% of
the target delivery rate, HTTP and gateway-stage latency ceilings, queue and
resource evidence, and proof that each requested fault actually happened. A
slow-reader case that does not trigger the server overflow path is reported as
failed, even if every client eventually converges. Likewise, a burst that is
eventually accepted but materially misses its target rate is failed.

This is a smoke/calibration only. It does not replace the required five
ten-minute measured trials, impairment matrix, disk-failure testing, or an
authoritative interceptor outcome test.

## Quick verification

```powershell
python benchmarks/network/network_harness.py dry-run --drones 3 --hz 20 --duration 2
python -m unittest discover -s benchmarks/network/tests -v
```

Evidence is written under
`test-results/realtime-core/network/<run-id>/summary.json`. The summary records
the seed, workload, all five independent state hashes, authoritative hash,
latency percentiles, resynchronizations, detected gaps, command dispositions
and explicit limitations.

Live ingest uses one ordered producer coroutine per drone plus a shared bounded
concurrency semaphore. This preserves `(source_id, track_id)` order while
allowing simultaneous tracks to reach the gateway. Evidence reports intended,
offered, accepted and rejected counts/rates, scheduler lag, and separate RTT
distributions for snapshot, observation and command requests.

## Live gateway

Default routes:

| Operation | Default route |
| --- | --- |
| Atomic snapshot | `GET /v1/snapshot` |
| Observation ingest | `POST /v1/observations` |
| Command admission | `POST /v1/commands` |
| Receipt reconciliation | `GET /v1/commands/{command_id}` |
| Delta stream | `WS /v1/deltas?after_sequence=N` |

Run against an already-started service:

```powershell
python benchmarks/network/network_harness.py live `
  --base-url http://127.0.0.1:8090 `
  --ws-url ws://127.0.0.1:8090/v1/deltas `
  --drones 30 --hz 20 --duration 600
```

Or let the harness start a gateway subprocess and wait for its health route:

```powershell
python benchmarks/network/network_harness.py live `
  --gateway-command "cargo run --release -- serve" `
  --health-path /healthz
```

The harness reads the snapshot cursor from `covers_through` (falling back to
`stream_sequence`) and its epoch from `x-sentinel-epoch` or the response body.
WebSocket deltas use the `sentinel-gateway/v1` envelope: `server_epoch`,
`base_sequence`, `result_sequence`, and an exact `realtime/v1` payload.
The live harness opts into `batch=gzip-v1`, validates the `SDG1` binary prefix,
gzip stream, 1 MiB decompressed-size ceiling and 16-item count ceiling, then
applies every contained envelope sequentially. Batching never changes gap
detection or the snapshot recovery cursor. Gateway batches wait at most 5 ms;
unnegotiated clients and isolated deltas remain compatible JSON text frames. Commands
are similarly wrapped with `expected_epoch` and the target's
`expected_revision`. An exact retry must return `receipt_status: duplicate`;
changed content under the same identity must return HTTP 409. On a gap the
client closes that incremental stream, fetches a snapshot, and reconnects with
`after_sequence=<snapshot cursor>`.

The runner deliberately drops one application-level delta for client 5 by
default. Client 5 must detect the next sequence gap, discard incremental state,
fetch a new snapshot, and converge. The other four clients must remain
continuous. Use `--no-gap-fault` to disable this test.

Percentiles use nearest-rank selection. Same-host receive/apply and HTTP RTT
are valid durations. Cross-host one-way latency is not claimed unless the
gateway supplies a bounded monotonic clock relationship; the evidence records
that limitation.

## Restart recovery

Run the durable command/outcome test with a temporary SQLite database:

```powershell
python benchmarks/network/network_harness.py restart `
  --gateway-command "cargo run --release --manifest-path realtime-gateway/Cargo.toml"
```

Use `--database path/to/commands.db` to retain the evidence database. The
gateway database environment variable defaults to `SENTINEL_COMMAND_DB_PATH` and
can be changed with `--database-env`. A valid run requires:

- the first command to be durably accepted;
- its terminal outcome to be durably recorded;
- reconciliation after a process restart;
- an exact semantic retry to return the original durable receipt despite a new transport epoch;
- changed command and outcome content under existing identities to conflict;
- an exact outcome retry not to create a second logical outcome.
