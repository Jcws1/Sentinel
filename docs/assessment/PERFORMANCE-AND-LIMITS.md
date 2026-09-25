# Performance and limits for the review

Tested build: **assessment-ready**. These are measurements on this Windows PC (Intel i7-10700K, RTX 3060, Python 3.10.11, Node 24.20.0, Edge 153), with independent suites/builds stopped during timing windows. They are not throughput guarantees, field results or display-FPS certification.

## What you should say

“The ordinary external workload had a worst measured update gap of 300ms, against a 750ms budget. Large batches still pause interactive delivery: approximately 7.0s for the 10,000-row case, 8.9s for 100 timestamps of 40 observations, and 16.2s for 300 timestamps introducing one identity each. This is a known limitation of synchronous recording in the shared process.”

No updates were missing or reordered, and no resnapshot was needed in these measured windows.

A batch can satisfy an input schema and still be unsuitable for concurrent sub-second interaction. Unit count, timestamp count, retained history, geometry and output density all matter.

## Update and control responsiveness

Each kind has three fresh-server runs. A moving Sydney 20v20 mission receives updates while the external request is submitted five seconds into a 20-second window, after ten seconds of warm-up. Control latency includes both the intent request and authoritative command. Console and structured application logging are enabled for the final HTTP runs.

| External workload | Before logging: worst update gap | Final: worst update gap | Final: longest control action |
|---|---:|---:|---:|
| 40 observations × 2 timestamps (80 rows) | 331 ms | 300 ms | 375 ms |
| 10,000 observations × 1 timestamp | 5581 ms | 7011 ms | 7465 ms |
| 40 observations × 100 timestamps (4,000 rows) | 9332 ms | 8895 ms | 9100 ms |
| 300 timestamps, one new identity each (300 rows; growing stored worlds) | 15131 ms | 16222 ms | 16345 ms |

These before/after runs are sequential observations on one machine; the difference is not a controlled statistical estimate of logging overhead. Matched no-batch controls and full per-run samples remain in the raw reports.

Continuity refers to updates actually produced and published. It does not mean the 5Hz source continued normally during a stall: a blocked source produces fewer updates in that wall-clock window. There is no catch-up burst that recreates the missing wall-clock cadence.

The final full-batch transaction is synchronous. Cooperative validation/resolution does not make that commit non-blocking. Effects of pauses beyond about 20 seconds on connection keepalives were not measured. The UI may declare an outcome unknown after its 30-second request timeout; preserve and retry the exact request.

## Backend processing probes

One cold and three repeated runs per input kind. These lower-level service probes use the no-op diagnostic dependency; they exclude HTTP and console/file output. The concurrent HTTP measurements above cover the live application with logging.

| Kind | Rows / timestamps | Cold | Warm median | Largest sampled RSS |
|---|---:|---:|---:|---:|
| golden | 2 / 1 | 43.2 ms | 39.2 ms | 57.4 MiB |
| local40 | 80 / 2 | 163.4 ms | 158.1 ms | 66.4 MiB |
| remote40 | 80 / 2 | 179.1 ms | 187.0 ms | 66.5 MiB |
| sparse10000 | 10000 / 1 | 6070.1 ms | 6215.1 ms | 174.9 MiB |
| dense50 | 50 / 1 | 292.3 ms | 318.6 ms | 78.0 MiB |
| dense100 | 100 / 1 | 1021.2 ms | 1026.4 ms | 89.3 MiB |
| dense200 | 200 / 1 | 4190.1 ms | 4220.4 ms | 104.0 MiB |

The inherited budgets are under one second warm median for golden/local40/remote40, and under 30 seconds plus 2GiB incremental memory for sparse10000. The checks here additionally require total sampled process RSS below 2GiB, a stricter memory bound. Dense cases are diagnostic disclosures. RSS is process memory; this is not a direct measure of physical disk writes or rendered frame rate.

## Geometry comparison

Thirty alternating comparison rounds, twenty iterations each, against the verified HEAD baseline. Tracked-fixture decode worst median ratio: **1.009×** (budget ≤1.05×). Backend validation: **1.060×** (budget ≤1.10×).

Unusual 101-position shapes and containment probes are explicitly outside those tracked-fixture budgets. Their costs still need disclosure:

| Diagnostic | Decode median / ratio to HEAD | Backend validation or containment median / ratio |
|---|---:|---:|
| containment:diagnostic-accordion-mixed-exponent-101 | — | 44.169 ms / 10.79× |
| containment:diagnostic-accordion-ordinary-101 | — | 8.346 ms / 1.96× |
| containment:diagnostic-accordion-subnormal-101 | — | 9.336 ms / 0.06× |
| containment:diagnostic-mixed-exponent-101 | — | 34.797 ms / 9.97× |
| containment:diagnostic-ordinary-101 | — | 6.809 ms / 1.91× |
| containment:diagnostic-subnormal-101 | — | 7.865 ms / 0.06× |
| containment:golden-area | — | 0.606 ms / 3.06× |
| diagnostic-accordion-mixed-exponent-101 | 0.325 ms / 1.43× | 33.739 ms / 2.60× |
| diagnostic-accordion-ordinary-101 | 0.320 ms / 1.44× | 9.047 ms / 0.69× |
| diagnostic-accordion-subnormal-101 | 2.630 ms / 10.99× | 9.986 ms / 0.76× |
| diagnostic-mixed-exponent-101 | 0.211 ms / 0.93× | 5.530 ms / 0.42× |
| diagnostic-ordinary-101 | 0.210 ms / 0.93× | 3.669 ms / 0.28× |
| diagnostic-subnormal-101 | 0.451 ms / 1.88× | 3.997 ms / 0.30× |

A large ratio on a very small baseline can still be a small absolute duration. Conversely, repeated containment cost can matter during a batch. The exact geometry change addresses consistency/correctness, not universal speed improvement.

## Browser storage and input size

The largest tested persisted request was **9,687 observations** in one timestamp, with a **2,283,322-byte body**. The first tested refusal was 9,750. This is a sampled boundary for a clean Edge profile, this JSON formatting and these IDs—not an exact portable maximum. The client preserves both a draft and its pending body before sending.

The inherited §9 largest single command is 45,126 bytes, 2.0% of the tested body size, below its 50% budget. As an additional size check, the largest prepared review input file is 64,390 bytes (2.8%). Browser quota, existing local storage, long identifiers and additional timestamps can change the limit. The backend contract maxima are not UI storage guarantees.

## Limits that remain open

- One local backend/SQLite authority; no deployed multi-user authentication or demonstrated horizontal scale.
- Interactive authoring: 40 units, at most 32 controlled. External input capacity is a different dimension.
- Large-batch pauses, unusual-shape costs, growing recordings and expensive cold history reads.
- Existing Profiles pacing, strict display and configured Video findings remain open; Video is a simulated viewpoint.
- Timed replay is deferred. The external `REPLAY` source label does not implement a playback timeline.
- The inherited Tracks altitude clipping at 900px and some loading-layout movement were not redesigned for this review.
- Organiser C01–C23 interpretations and the remaining Phase 5 independent critic/acceptance process are pending.

## Raw evidence and commands

- [Budget calculations](../../test-results/assessment/assessment-ready/performance-verdict.json)
- [Ordinary/large concurrent batches](../../test-results/simulation-concurrency/assessment-ready/summary.json)
- [Timestamp dimension](../../test-results/simulation-concurrency/assessment-ready-ts/summary.json)
- [Decode comparison](../../test-results/assessment/assessment-ready/measure/decode-ab.json) and [backend comparison](../../test-results/assessment/assessment-ready/measure/backend-ab.json)
- [Browser storage samples](../../test-results/assessment/assessment-ready/storage/assessment-ready-storage/summary.json)
- Seven probe directories: `test-results/phase5-simulation-compatibility/assessment-ready-<kind>/`.
- Exact commands, timestamps and exit codes are retained in each stage’s `.meta.json` files. Rerun instructions are in [TESTING.md](TESTING.md) and [the inherited measurement guide](../phase5-closure/TESTING.md).
