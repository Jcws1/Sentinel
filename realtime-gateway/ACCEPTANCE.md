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

The service remains in-memory. Command acceptance is not durable across restart
and there is no executor/outcome ledger.

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

1. Durable command, receipt and terminal outcome storage across restart.
2. Successor protocol contract with epoch, base/result cursor, heartbeat and
   command preconditions; resolve truthful empty-world sequence zero.
3. Stage-specific ingress→commit→publish timestamps and per-client queue age,
   current depth and overflow/resync ledgers.
4. Heartbeat and WebSocket idle/write deadlines.
5. Slow-reader, lost-response, disconnect, process restart/epoch rotation,
   expected/adverse cloud impairment and 100 Hz burst/drain tests.
6. CPU, memory, socket/task, byte and retention-growth measurements.
7. Sixty-second warm-up plus ten measured minutes, at least five runs, with
   median and worst run retained and no failed-run replacement.
8. TLS, authentication, mission-scoped authorization, rate/connection limits
   and operator audit identity before any cloud exposure.
9. Final NLP → deterministic recommendation → confirmation → Wedgetail API →
   genuine hosted observations → correlated interception outcome acceptance.

