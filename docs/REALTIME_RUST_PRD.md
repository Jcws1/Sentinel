# Sentinel real-time Rust backend PRD

Status: implementation source of truth  
Updated: 2026-09-26

## Product outcome

Sentinel receives observations from an independently running simulator or CSV
replay, maintains an authoritative current world model for one scenario, and
supports up to 30 individually tracked drones. Five connected operators receive
a consistent tactical view. Observe/Orient inference is non-authoritative;
simulated countermeasure action requires explicit confirmation and an
independent authority/freshness check immediately before dispatch.

Hosted acceptance must prove the correlated chain:

`observation -> current track -> assessment -> recommendation -> confirmation -> durable command -> simulator dispatch -> authoritative simulated outcome`

## Declared operating envelope

| Dimension | Requirement |
| --- | --- |
| Concurrent scenarios | 1 |
| Tracked drones | validate 3 first; supported maximum 30 |
| Connected operators | 5 |
| Observation cadence | 2 Hz per active track |
| Hot history | bounded rolling history; no full snapshot per tick |
| Retention | per scenario; recordings/checkpoints governed separately |
| Deployment | cloud, single region initially |
| Hosted action scope | simulated providers only |

Observation age is wall-clock time since source capture. Twenty minutes is a
retention choice, not acceptable control freshness. Recommendations use a
seconds-scale TTL and are rejected when mission epoch or track revision advances.

## Architecture

1. **Simulator/source app** owns synthetic target motion and emits versioned
   observations. CSV is a replay source, not the world database.
2. **Rust real-time gateway** validates input, assigns ordering, owns scenario
   epoch/revisions, updates current tracks, publishes deltas and journals
   commands/outcomes.
3. **Assessment batcher** uses a bounded queue and 10–25 ms micro-batches.
4. **Python Alpha.2 workers** vectorize model inference, own no mission state and
   return non-authoritative decision support only.
5. **Recommendation policy** combines evidence, area gates, capabilities and
   resource constraints into Monitor, Respond or Support proposals.
6. **Command path** requires confirmation, rechecks authority, persists an
   idempotent command, leases it and dispatches via a provider adapter.
7. **Simulator provider** supplies authoritative simulated telemetry/outcome.
   Wedgetail submission acceptance is not proof of interception.

## Concurrency and overload

- Partition state by scenario then track ID; one writer owns a track revision.
- Do not use one competing-consumer queue for track state. Use bounded stage
  queues and stable partitioning so one track remains ordered.
- Assessment admission is non-blocking. On overload, supersede/drop assessment
  work and expose metrics; never delay authoritative tracking or safety checks.
- Worker failure or malformed output yields unavailable decision support, not
  loss of track state.
- Commands use durable outbox leases, idempotency and ambiguous-dispatch
  handling. Never blindly retry a possibly dispatched non-idempotent operation.

## Recommendation semantics

- **Monitor:** observation task using current coverage and area gates.
- **Respond:** eligible one-to-one simulated countermeasure assignments.
- **Support:** `RESTORE_VISIBILITY`, `RESTORE_LINK` or `ROTATE_ASSET`, only with
  current evidence and a capable asset.
- Observe/Orient remains distinct from Decide/Act.
- NLP may explain or rank validated options; it may not invent tracks,
  authority, capabilities, geometry or commands.

## Acceptance gates

1. Contract, ordering, TTL, epoch and revision tests pass.
2. 30 tracks at 2 Hz plus five readers survive a sustained soak without state loss.
3. Record p50/p95/p99 latency, depth, drops, CPU and RSS.
4. Overload is bounded; tracking continues when ML is unavailable.
5. Hosted simulation proves recommendation, confirmation, durable dispatch and
   correlated authoritative simulated outcome.
6. Negative tests cover stale confirmation, changed gates, duplicates, provider
   failure and ambiguous outcomes.
7. No real vehicle, weapon or production provider credential is used.

## Current measured status

- Independent Alpha.2 calls failed the target at all fleet sizes.
- Three vectorized stateless workers achieved median 64.90 assessments/s for
  30 tracks against 60/s required, with 773 ms p95 and about 519 MB working set.
- Median capacity passes narrowly. P95 headroom, sustained soak, CPU capture and
  explicit overload testing remain release gates.

## Non-goals

- Real-world interceptor control.
- Treating Wedgetail browser animation as authoritative external outcome.
- Enabling experimental coordination output.
- Replacing deterministic safety/geometry checks with an LLM.
