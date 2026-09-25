# Initial matched benchmark

Date: 2026-09-25  
Host: local Windows development host  
Build: Rust `--release`; Python current system interpreter  
Scope: deterministic generation, keyed routing, single-writer track updates,
revision acknowledgement, buffered append-only event recording and final
canonical state hashing.

This benchmark does **not** include HTTP, WebSockets, PostgreSQL, spatial
queries, simulation physics, NLP or browser rendering. The generated source
timestamps describe a 60-second scenario, but the runner intentionally executes
as fast as possible to measure processing capacity rather than sleeping in real
time.

## Results

| Drones | Rate/drone | Implementation | Tick median | Tick p95 | Tick p99 | Max | Measurements/s |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 3 | 10 Hz | Rust | 0.0138 ms | 0.0381 ms | 0.1815 ms | 1.1044 ms | 147,242 |
| 3 | 10 Hz | Python | 0.0867 ms | 0.2358 ms | 0.4093 ms | 2.5393 ms | 25,582 |
| 10 | 10 Hz | Rust | 0.0143 ms | 0.0401 ms | 0.1375 ms | 1.1903 ms | 474,759 |
| 10 | 10 Hz | Python | 0.1403 ms | 0.2962 ms | 0.4485 ms | 0.7167 ms | 58,810 |
| 30 | 10 Hz | Rust | 0.0208 ms | 0.0501 ms | 0.2010 ms | 0.8039 ms | 1,082,303 |
| 30 | 10 Hz | Python | 0.2720 ms | 0.5341 ms | 0.7130 ms | 0.7959 ms | 95,663 |
| 30 | 20 Hz | Rust | 0.0210 ms | 0.0675 ms | 0.2003 ms | 1.3832 ms | 1,011,762 |
| 30 | 20 Hz | Python | 0.3530 ms | 0.6893 ms | 0.9565 ms | 1.4579 ms | 74,265 |
| 30 | 100 Hz | Rust | 0.0148 ms | 0.0386 ms | 0.1047 ms | 0.6048 ms | 1,573,295 |
| 30 | 100 Hz | Python | 0.2851 ms | 0.5974 ms | 0.7694 ms | 1.3204 ms | 86,747 |

Every matched pair produced the same final track count, final sequence,
event-log length and canonical state hash. The measured Rust throughput was
approximately 5.8× to 18.1× the Python control depending on the case. Tick
latency speedup varies because channel scheduling and one-second buffered flush
boundaries dominate these very small workloads.

## Comparison with the current application

The earlier exact 30-drone application benchmark measured median 120.02 ms,
p95 146.72 ms and p99 185.29 ms per durable tick. Those numbers are **not** a
language-only comparison: the application also performs simulation, schema
work, complete-state construction and synchronous SQLite persistence.

The isolated results show that keyed track ownership itself has ample capacity.
They do not prove that a Rust service with networking, durable command handling,
checkpoints and cloud deployment will retain these timings.

## Independent repeated evaluation

After the initial run, three independent evaluation agents exercised the same
checked-in runners without changing source code.

| Workload | Rust p50 | Rust p95 | Rust p99 | Rust throughput | Rust/Python throughput ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 drones × 10 Hz, 20 repeats | 0.0104 ms mean | 0.0214 ms mean | 0.0576 ms mean | 258,395/s mean | Not reported |
| 10 drones × 10 Hz, 5 paired repeats | 0.0159 ms | 0.0360 ms | 0.0680 ms | 550,085/s | 9.58× |
| 10 drones × 20 Hz, 5 paired repeats | 0.0142 ms | 0.0312 ms | 0.0888 ms | 604,449/s | 10.22× |
| 30 drones × 10 Hz | 0.0216 ms | 0.0484 ms | 0.1208 ms | 1,180,823/s | 12.06× |
| 30 drones × 20 Hz | 0.0136 ms | 0.0415 ms | 0.1298 ms | 1,527,391/s | 15.34× |
| 30 drones × 100 Hz | 0.0153 ms | 0.0394 ms | 0.1473 ms | 1,457,175/s | 18.82× |

All paired runs matched canonical state hashes and byte-identical event logs.
One 10-drone Rust run showed an operating-system scheduler outlier, but its
maximum tick latency remained below 0.52 ms. The longer 3-drone 6,000-tick run
also retained the same deterministic state rules.

The 100 Hz case is not an overload-policy proof. Channels remain unbounded and
the producer waits for every acknowledgement; queue limits, coalescing,
priority isolation, queue-age alarms and recovery are the next test target.

## Decision

Proceed to the next vertical slice rather than rewriting the complete backend.
The next slice should add:

1. a versioned observation contract;
2. bounded per-partition queues and explicit overload metrics;
3. immutable delta output and snapshot/gap recovery;
4. periodic checkpoints plus a durable command/result lane;
5. HTTP/gRPC or WebSocket service boundaries;
6. the same 3/10/30-drone and five-client cloud-like evaluation.

Only after that slice passes should existing application traffic be shadowed
through the Rust service.
