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

1. Executor claim/lease/attempt state and an idempotent external adapter so two
   executors cannot perform the same recovered command.
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
10. Final NLP → deterministic recommendation → confirmation → Wedgetail API →
   genuine hosted observations → correlated interception outcome acceptance.
