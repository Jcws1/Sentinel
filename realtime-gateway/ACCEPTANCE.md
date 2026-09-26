# Gateway evaluation ledger

Status: localhost calibration passed; full network acceptance not yet passed  
Date: 2026-09-25

## Implemented boundary

- HTTP health, snapshot, observation ingest, command admission and receipt reconciliation.
- Server-to-client WebSocket deltas with a versioned `sentinel-gateway/v1` envelope.
- Atomic snapshot cursor plus retained suffix replay through `after_sequence`.
- Bounded per-client queues and explicit resync/close for slow or invalid cursors.
- Observation identity/content conflict protection.
- Command identity/idempotency conflict protection and epoch/revision preconditions.
- Localhost-only binding unless an explicit insecure remote-development override is set.
- 64 KiB HTTP body cap, five-second HTTP handler timeout and bounded latency samples.

Track state remains in memory. Command admission and terminal outcomes now use
a versioned SQLite journal with WAL, `synchronous=FULL`, foreign-key checks,
busy timeout and startup integrity checking. Pending command payloads are
recoverable from an outbox after restart. The outbox does not yet provide an
executor claim/lease protocol.

## Independently reviewed smoke

Workload: 3 drones × 5 Hz × 2 seconds, five independent WebSocket clients.

- 30 observations accepted.
- All five clients converged to the authoritative hash and sequence 30.
- Clients 1–4 observed no gap.
- Client 5 deliberately dropped one delta, detected the gap, fetched a snapshot,
  reconnected after the snapshot cursor and converged.
- Command flow produced accepted → exact duplicate → changed-content conflict.
- Aggregate HTTP RTT: p50 3.23 ms, p95 17.38 ms, p99 73.63 ms.
- Client receive-to-apply p99 ranged from 0.0149 to 0.0410 ms.

This is accepted only as a non-durable localhost network smoke.

## 30-drone short calibration

Workload: 30 drones × 20 Hz × 10 seconds, five independent clients, one ordered
producer coroutine per drone and a shared bounded ingest semaphore.

| Measure | Result |
| --- | ---: |
| Intended / offered / accepted | 6,000 / 6,000 / 6,000 |
| Rejected | 0 |
| Offered/accepted rate | 599.725 observations/s |
| Scheduler lag p50 / p95 / p99 / max | 9.037 / 18.315 / 26.877 / 45.401 ms |
| Observation HTTP RTT p50 / p95 / p99 | 31.031 / 47.528 / 58.272 ms |
| Snapshot HTTP RTT p50 / p95 | 15.700 / 32.580 ms |
| Command HTTP RTT p50 / p95 | 12.470 / 14.643 ms |

All five clients converged. The four healthy clients had zero gaps; the
deliberately affected client detected and recovered its injected gap. Command
idempotency/conflict behavior passed.

This is a short localhost calibration, not the approved 10-minute, five-run,
cloud-impairment acceptance matrix.

## Remaining release gates

### Durable restart checkpoint

A real two-process run used the same SQLite journal across a graceful gateway
restart. The gateway epoch rotated while the command identity remained stable.

| Operation | RTT |
| --- | ---: |
| Initial durable command admission | 2.633 ms |
| Terminal-outcome recording | 13.457 ms |
| Exact command retry after restart | 1.528 ms |
| Receipt/outcome reconciliation after restart | 1.313 ms |
| Changed command conflict | 24.581 ms |
| Exact outcome retry | 14.965 ms |
| Changed outcome conflict | 15.322 ms |

The original receipt and terminal outcome survived restart. Exact retries
returned the original logical records; changed command or outcome content
returned conflict. Pending command payloads are retained in the outbox and a
terminal outcome atomically removes the command from pending state.

This passes graceful restart admission/outcome recovery. It does not test a
process kill precisely between SQLite commit and HTTP response, database
corruption/disk-full handling, or downstream exactly-once execution.

## Remaining release gates

### Executor fencing checkpoint

The outbox now supports atomic claim, opaque fencing token, expiry, renewal,
release/retry scheduling, attempt counting and lease-bound completion. Five
real race/restart runs passed:

- exactly one of two workers claimed the command;
- expiry permitted a new worker to reclaim it with a new token and incremented
  attempt count;
- the old token was rejected with `409 lease_not_current`;
- only the current token created the terminal outcome;
- exact completion retry returned the existing outcome;
- terminal commands could not be reclaimed; and
- the outcome survived gateway restart.

Across the five runs, median terminal completion RTT was 16.04 ms and the
maximum observed was 27.30 ms. One independent rerun measured a 3.56 ms current
completion and 2.40 ms reconciliation after restart.

This establishes exclusive local claims and fenced local completion. Delivery
remains **at least once**, not exactly once: a worker may complete the external
effect and crash before recording the outcome. Exactly-once Wedgetail effects
require the external API to honor a stable idempotency key or offer an
authoritative reconciliation query.

### Provider execution and reconciliation checkpoint

The provider-neutral execution slice now durably binds the complete provider
command envelope at admission, records a fenced dispatch attempt before send,
and separates definite pre-dispatch failure, explicit rejection, accepted
submission, and ambiguous external outcome. Accepted submissions persist the
provider's external operation ID and acceptance time and remain
`awaiting_reconciliation`; they are not treated as successful interceptions.

Reconciliation has its own durable claim and fencing token. Providers with a
verified status/outcome contract can reach authoritative success or failure.
Providers without such a contract become `manual_unverifiable`. This is the
required Wedgetail result because its public sandbox exposes target injection
and browser-local visuals, but no authoritative operation lookup or intercept
outcome. An interrupted send becomes non-reclaimable unknown state unless the
provider's verified native idempotency contract permits a safe retry.

The SQLite v3→v4 migration is transactional and preservation-tested. Current
verification is 22/22 gateway tests plus 15/15 provider tests, strict release
Clippy, formatting and diff checks. All provider tests are offline fixtures;
this is not evidence of a live external call.

Concrete transport follow-on: the Rust provider layer now includes a
reqwest/rustls HTTPS transport with normalized origin allowlisting, pinned
global DNS results, redirects and ambient proxies disabled, one absolute
deadline, bounded responses, strict header policy and response secret-echo
rejection. The opt-in Wedgetail contract harness is network-free by default and
requires three explicit live acknowledgements plus `WEDGETAIL_API_KEY`; it can
send exactly one target and has no retry or batch path. Provider verification is
now 23/23 tests and the harness is 6/6.

Live Wedgetail contract checkpoint (2026-09-26): the harness obtained the
sandbox-only testing credential published in the official API documentation
without persisting or printing it and submitted exactly one target. Wedgetail
returned HTTP 200 in 641 ms with `status: ok` and an exact echo of the submitted
fields. Sanitized evidence is stored under
`test-results/wedgetail-contract/20260926T100035/evidence.json` and records
`secret_recorded: false`. This proves authenticated target-submission and
broadcast acceptance only. It does not prove authoritative interception because
the public API still exposes no operation-status or terminal-outcome endpoint.

## Remaining release gates

1. Add a concrete secret-aware HTTPS transport and run approved live contract
   tests. Wedgetail ambiguity remains manual/non-retryable; other providers may
   retry only when their verified native idempotency contract permits it. Add
   maximum attempts and a governed exponential retry schedule.
2. Crash injection immediately before/after SQLite commit and before the HTTP
   response, plus corruption, read-only and disk-full tests.
3. Successor protocol contract with epoch, base/result cursor, heartbeat and
   command preconditions; resolve truthful empty-world sequence zero.
4. Stage-specific ingress→commit→publish timestamps and per-client queue age,
   current depth and overflow/resync ledgers.
5. Heartbeat and WebSocket idle/write deadlines.
6. Slow-reader, lost-response, disconnect, process restart/epoch rotation,
   expected/adverse cloud impairment and 100 Hz burst/drain tests.
7. CPU, memory, socket/task, byte and retention-growth measurements.
8. Sixty-second warm-up plus ten measured minutes, at least five runs, with
   median and worst run retained and no failed-run replacement.
9. TLS, authentication, mission-scoped authorization, rate/connection limits
   and operator audit identity before any cloud exposure.
10. Final NLP → deterministic recommendation → confirmation → selected provider
   → correlated authoritative interception outcome acceptance. Wedgetail can
   satisfy submission and visual-demo evidence only; the full authoritative
   gate requires the local simulator or another verified provider.
