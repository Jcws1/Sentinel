# Network boundary and five-client evaluation plan

Status: approved next-slice design; not yet implemented or accepted  
Date: 2026-09-25  
Applies to: isolated Rust real-time vertical slice only

## Why this gate exists

The current benchmark proves deterministic keyed track processing, not a
networked service. At 30 drones x 20 Hz the repeated Rust run processed about
1.53 million measurements/s with tick p99 of 0.130 ms, while the intended live
input is only 600 measurements/s. This is ample core headroom, but it says
nothing about HTTP, WebSocket fan-out, serialization, bounded queues, browser
recovery, command durability, or cloud transit. The earlier full Python/SQLite
application measured 120.02/146.72/185.29 ms p50/p95/p99 per durable tick and is
context, not a network acceptance target or a language-only comparison.

This evaluation must preserve that distinction. Passing it authorizes shadow
traffic through the Rust slice; it does not authorize a complete backend
rewrite and does not certify the final NLP-to-Wedgetail workflow.

## Boundary under evaluation

Use one versioned service boundary with these responsibilities:

| Direction | Transport | Operation | Required behavior |
| --- | --- | --- | --- |
| Client -> service | HTTP | `GET` snapshot | Return one internally consistent state, stream epoch, snapshot sequence, contract version and server timestamp. Support conditional reads where practical. |
| Client -> service | HTTP | `POST` command | Require command/request ID and expected epoch/revision. Return a durable accepted/rejected receipt; retrying identical identity is idempotent and different content under the same identity conflicts. |
| Service -> client | WebSocket | deltas and heartbeat | Server-to-client only. Every delta names epoch, base sequence and resulting sequence. Heartbeats carry current sequence and server time but are not state updates. |
| Client -> service | HTTP after gap | resync | Discard untrusted incremental state, fetch a fresh snapshot, then attach to deltas strictly after its sequence. |

Do not put commands on the WebSocket. Separating durable command/result traffic
from disposable delta fan-out keeps a slow observer from delaying or losing an
accepted command. Use bounded per-client queues. On overflow, epoch mismatch,
malformed data, or a sequence gap, emit/record a resync reason and close the
stream; never silently skip a delta or manufacture continuity.

The initial implementation may use JSON to expose transport costs clearly.
Record payload sizes so a later binary encoding decision is evidence-based.
Contracts must reject unknown major versions and tolerate only explicitly
documented compatible minor additions.

## Sequence and recovery invariants

1. A snapshot is atomic and identifies `(stream_epoch, sequence)`.
2. A delta for the same epoch applies only when `base_sequence` equals the
   client's applied sequence; after application the client sequence must equal
   `sequence`.
3. Duplicate deltas may be ignored only by exact epoch and sequence identity.
4. Epoch change, forward gap, conflicting duplicate, invalid payload, or queue
   overflow forces snapshot resynchronization.
5. Resync completes only when the client has an atomic snapshot and no
   sequence discontinuity between that snapshot and subsequently applied data.
6. No client may display state from two epochs as one continuous world.
7. A command receipt is reconciled by command identity after timeout or
   disconnect; loss of the HTTP response must not cause a new command identity.
8. Slow-client handling must not block track workers, command admission, or the
   other four clients.

The harness must assert these invariants from each client's independent model
and compare every final canonical state hash with the service's authoritative
hash.

## Latency clocks and fields

Use monotonic clocks for durations and UTC wall time only for correlation.
Wall-clock subtraction across hosts is invalid unless clock error has first
been bounded. Every observation/delta should carry correlation fields that let
the harness retain these stages:

| Timestamp | Owner | Meaning |
| --- | --- | --- |
| `source_time` | workload source | Deterministic scenario time; never used alone as physical latency. |
| `ingress_mono` | service | Request/observation accepted at the network boundary. |
| `commit_mono` | service | Authoritative revision and any required durable record committed. |
| `publish_mono` | service | Delta offered to fan-out. |
| `wire_receive_mono` | client | Complete message received. |
| `apply_mono` | client | Validated delta applied to the client's model. |
| `paint_mono` | browser, later gate | Result first presented by the browser. |

Primary service metrics are ingress-to-commit and commit-to-publish. Primary
network metrics are publish-to-receive and HTTP request/receipt round trip.
Receive-to-apply isolates client work. The harness should record clock source,
host, estimated offset/error, run ID, client ID, epoch, sequence, command ID and
payload bytes with each sample. For two-host tests, use a request/response
four-timestamp exchange, retain the minimum-RTT offset estimate and its error
bound, and report cross-host one-way latency only when the bound is small enough
for the claimed percentile. Otherwise report RTT and same-host stage durations.

## Harness topology

Build a separate evaluation runner under `benchmarks/`; do not embed benchmark
shortcuts in production handlers.

- One deterministic producer sends 30 tracks at 20 Hz for 10 minutes (360,000
  observations). Retain the existing 3/10/30-drone cases as regression probes
  and add a 30 x 100 Hz burst, explicitly labelled capacity rather than expected
  live load.
- Five independent clients fetch snapshots and maintain their own state from
  one WebSocket each. They must not share a connection, state store, cursor, or
  recovery decision.
- A command driver sends deterministic commands over HTTP, including concurrent
  requests, exact retries after deliberately lost responses, stale revisions,
  duplicate identity with changed content, and receipt reconciliation.
- A fault controller applies latency, jitter, bandwidth limits, disconnects and
  loss outside the service process. On Windows, use a reproducible TCP proxy or
  container/network emulator rather than an undocumented manual network change.
- A resource sampler records service/client CPU, resident memory, open sockets,
  queue depth and age, reconnect/resync counts, bytes, command outcomes and
  producer backpressure at one-second resolution.
- Each run writes immutable configuration, seed, build/commit identity, raw
  samples, summary percentiles, canonical hashes and pass/fail reasons beneath
  `test-results/realtime-core/network/<run-id>/`.

Warm up for 60 seconds, measure for 10 minutes, then allow a bounded drain and
verify final state. Run each acceptance profile at least five times and report
the median run plus worst run; no retry may replace a failed run. Record failed
attempts and environment noise.

## Workload and impairment matrix

| Profile | Input | Network condition | Purpose |
| --- | --- | --- | --- |
| Local control | 30 x 20 Hz, five clients | no added impairment | Isolate service/serialization/fan-out cost. |
| Expected cloud | 30 x 20 Hz, five clients | 100 ms RTT, 20 ms jitter, 0.1% packet loss per direction, 20 Mbit/s/client | Main remote acceptance profile. Loss is applied once to each one-way path; it is not a claim of 0.1% combined round-trip loss. |
| Adverse cloud | 30 x 20 Hz, five clients | 200 ms RTT, 50 ms jitter, 1% packet loss, 5 Mbit/s/client | Verify bounded degradation and recovery, not normal latency. |
| Slow observer | 30 x 20 Hz | four expected-cloud clients; fifth limited to 256 kbit/s and paused reads for 10 s | Prove client isolation and explicit overflow/resync. |
| Gap/restart | 30 x 20 Hz | expected-cloud plus dropped delta, 5 s disconnect, service restart/epoch rotation | Prove snapshot recovery and epoch fencing. |
| Burst | 30 x 100 Hz for 60 s, then 20 Hz | expected-cloud | Establish queue/backpressure behavior; not an overload-policy pass by throughput alone. |
| Command uncertainty | 30 x 20 Hz | expected-cloud; drop selected HTTP responses after admission | Prove identity-based receipt reconciliation and no double execution. |

Apply impairment per client so the slow-observer case cannot accidentally
degrade all traffic. Because WebSocket runs over TCP, packet loss may create
head-of-line stalls rather than application-visible missing messages; inject a
separate application-level dropped-delta fault to exercise sequence-gap logic.

## Pass/fail gates

All mandatory gates must pass in every acceptance run unless a row explicitly
identifies the adverse profile's different expectation.

### Correctness and recovery

- Zero silent sequence gaps, cross-epoch applications, malformed accepted
  frames, duplicated command effects, or canonical final-state mismatches.
- All five clients converge to the authoritative canonical hash after drain.
- A deliberately dropped delta, overflow, disconnect and epoch rotation are
  detected; no affected client applies later deltas until resynchronized.
- Gap detection to resync completion is at most 2 s plus one measured network
  RTT in local/expected-cloud profiles, and at most 5 s plus one RTT in adverse
  cloud. Report outage separately from latency percentiles.
- The four healthy clients remain continuous during the slow-observer fault;
  only the impaired client may overflow/resync.
- Every accepted command has exactly one durable result. Exact retry returns
  the same logical receipt; changed content under reused identity conflicts;
  stale epoch/revision is rejected. Unknown outcome is reconciled without a
  second effect.

### Latency and capacity

- At 30 x 20 Hz with five clients, no observation is discarded by the service
  in local or expected-cloud profiles.
- Local ingress-to-publish: p95 <= 10 ms and p99 <= 25 ms. This is deliberately
  much looser than the measured 0.130 ms core p99 so it detects material costs
  without pretending network/serialization is free.
- Expected-cloud publish-to-client-apply: p95 <= 200 ms and p99 <= 500 ms,
  subject to the retained clock-error bound. These ceilings were frozen before
  the five-run release series from preserved 90 s and 180 s calibration runs
  under the declared profile. A 50 ms one-way delay with 20 ms jitter and 0.1%
  packet loss produced worst-of-five p95 values of 121.849--167.504 ms and p99
  values of 259.062--361.443 ms. The wider p99 explicitly budgets TCP loss
  recovery rather than pretending the jitter-only distribution bounds the
  tail. Latency samples are not post-filtered around outages; instead a release
  run must have zero observer outage windows and 100% measured availability.
  The earlier 120/180 ms gates and their failures remain in preserved evidence
  and git history rather than being rewritten.
- Command HTTP RTT in expected cloud: p95 <= 250 ms and p99 <= 500 ms for an
  already warm service, excluding deliberately dropped responses.
- Healthy-client queue age p99 <= 250 ms and queue use remains below 75% of its
  configured bound in local/expected-cloud steady state. Any saturation must be
  visible as a metric and explicit resync, never unbounded growth.
- After the 100 Hz burst, queues return below 25% within 5 s of the 20 Hz rate
  resuming, or affected clients are explicitly resynchronized within the same
  bound. The service must remain responsive to snapshot and command requests.

The adverse-cloud run passes on correctness, isolation, bounded storage and
recovery; it is reported against the latency gates but does not fail solely for
exceeding expected-cloud latency.

### Stability and resource bounds

- No crash, deadlock, unbounded queue, socket leak, task leak, or monotonic
  post-warm-up memory growth across the 10-minute window.
- The Windows/Docker-Desktop acceptance host uses predeclared observational
  budgets of one logical core (100 process-CPU percentage points) and 256 MiB
  RSS. These are pass/fail budgets, not OS-enforced container limits; evidence
  must say so. CPU p95 must remain at or below 75% of that budget, CPU may not
  exceed 90% for 30 continuous seconds, RSS must remain below 70% of the
  budget, and post-warm-up RSS slope must remain at or below 1 MiB/min. A
  deployment release must repeat this calibration with actual platform limits.
- Five clients create exactly five mission WebSockets. Reconnects create no
  permanently retained old connection or subscription.
- The producer's intended 600 observations/s is sustained for the full measured
  window, and input/command priority remains isolated from fan-out backpressure.

## Execution order

1. Freeze the versioned snapshot, delta, heartbeat, command and receipt
   contracts, including size limits and compatibility policy.
2. Implement bounded fan-out and metrics; unit/property test the sequence and
   idempotency invariants before networking.
3. Add HTTP snapshot/command and read-only WebSocket endpoints.
4. Build the independent five-client reference-model harness and local control.
5. Add deterministic gap, lost-response, restart and slow-reader faults.
6. Freeze calibrated resource ceilings, then run the full impairment matrix.
7. Have an independent evaluator rerun the checked-in harness without changing
   workloads, thresholds, timeout values or production source.
8. Publish raw evidence and a decision record. Only a complete pass permits
   shadowing existing application traffic through this boundary.

## Relationship to final NLP/Wedgetail acceptance

This gate ends at a durable command receipt and correctly presented remote
state. It does not prove that natural-language intent is correctly interpreted,
that a recommendation is authorized, or that an interceptor provider executed
anything.

The later mandatory end-to-end acceptance chain remains:

`operator text -> NLP interpretation with cited evidence and uncertainty ->`
`explicit operator confirmation/authorization -> durable Sentinel command ID ->`
`selected provider request -> correlated provider telemetry/status -> ordered`
`Sentinel deltas/resync -> visible and recorded authoritative terminal outcome`

That run must preserve one correlation identity across every available stage,
retain original provider request/response evidence with secrets redacted, and
prove that retries do not duplicate the external effect. A provider with a
verified status/outcome contract remains authority for its interception
outcome. The deterministic local-simulator provider may satisfy this gate with
its authoritative correlated lifecycle. The public Wedgetail sandbox cannot:
its API proves target-submission acceptance and its viewer supplies visual,
browser-local evidence only, with no authoritative operation-status or outcome
endpoint. Fabricated telemetry or a UI-only animation cannot satisfy the gate.
NLP and provider latency must be itemized separately from the network slice
measured here.

## Evidence checklist

- Exact commit/build, host specifications, dependency locks and clock method.
- Contract fixtures and compatibility results.
- Workload seed, observation count and command schedule.
- Impairment proxy version/configuration and proof that each profile was active.
- Per-client sequence/resync ledger and canonical hashes.
- Raw latency samples and percentile method, including excluded fault windows.
- Queue depth/age, CPU, memory, sockets, bytes and reconnect time series.
- Durable command/receipt audit showing retry and uncertainty outcomes.
- Every failed attempt, environmental anomaly and scope limitation.
- Independent rerun report and explicit pass/fail decision per gate.
