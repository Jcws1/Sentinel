# Alpha.2 bounded batching experiment

Date: 2026-09-26  
Branch: `codex/alpha2-integration`

## Change

The non-authoritative Alpha.2 worker now accepts a bounded array of at most 128
immutable per-track requests. It concatenates histories once and invokes the
motion and relation models once per batch. Rust sends and validates each result
individually, including request identity, mission epoch, track revision, TTL,
contract and model allowlist. A missing or duplicate response is rejected.

This is an experimental transport and capacity slice. It is not wired into the
production gateway and does not enable coordination or autonomous tasking.

## Twenty-round loopback results

The declared operational maximum is 30 tracks at 2 Hz (60 assessments/s).

| Shape | 3 tracks | 10 tracks | 30 tracks | 100 tracks |
| --- | ---: | ---: | ---: | ---: |
| One vectorized worker, achieved/s (median) | 9.19 | 25.17 | 46.99 | 71.85 |
| One worker, E2E p95 | 690 ms | 685 ms | 1,015 ms | 2,579 ms |
| Three process shards, achieved/s (median) | 9.03 | 24.52 | 64.90 | 127.30 |
| Three shards, E2E p95 | 402 ms | 708 ms | 773 ms | 1,085 ms |
| Three shards meet 2 Hz/track | yes | yes | **yes** | no |

Three stateless process shards clear the 30-track median capacity target by
about 8%, but p95 exceeds the 500 ms update interval. This margin is too narrow
for a production claim. The 100-track exploratory case remains out of scope and
fails. Raw results are in `alpha2-worker/reports/`.

The three loaded worker processes used approximately 175 MB, 172 MB and 171 MB
working set after the benchmark (about 519 MB total, excluding their small
launcher processes). CPU utilization was not captured reliably in this trial.

## Decision

Bounded batching is materially better than independent requests and should be
retained. Do not wire it into the production gateway yet. The next gate is a
sustained soak with a real 10–25 ms Rust batch window, queue-depth and deadline
metrics, CPU/RSS capture, and explicit overload shedding. Acceptance should
require 30 tracks at 2 Hz with headroom and a declared p95 deadline, not merely
median throughput.
