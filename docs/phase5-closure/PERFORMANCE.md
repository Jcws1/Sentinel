# Performance — Phase 5 closure

## Current assessment measurements — 25 September 2026

The separately identified assessment source adds logging after preserved candidate
6. Its [full performance report](../assessment/PERFORMANCE-AND-LIMITS.md) and
[test results](../assessment/TEST-RESULTS.md) govern current measured claims.
With application logging enabled, M1's worst update gap is **300.336 ms** against
750 ms. M2's worst single-timestamp 10k gap is **7,010.825 ms**. M9 measures the
timestamp dimension: **8,894.715 ms** for 40 observations × 100 timestamps and
**16,222.217 ms** for 300 timestamps introducing one identity each. All measured
published updates remained continuous and ordered without resnapshot; normal
source production pauses during the block.

Tracked-fixture M4/M5 worst ratios are 1.009× / 1.060×, within their 1.05× / 1.10×
budgets. Unusual-shape diagnostics include a 10.99× subnormal decode (2.630 ms)
and a 10.79× mixed-scale containment probe (44.169 ms). Largest tested persisted
UI input: 9,687 observations / 2,283,322 bytes in the measured Edge profile.
These measurements do not complete independent critic or organiser sign-off.

## Historical candidate 5 report

The following figures are retained for their original source. In this historical
section, “40-row” refers to the `local40` workload: 40 observations at **two**
timestamps, or **80 input rows**. Its historical numerical results are unchanged.

**Final candidate 5: every predeclared budget is met.** P5-BATCH is disclosed
as an accepted limitation (proposed): ordinary 40-row batches stay well within
the 750 ms budget, and a 10,000-drone batch pauses interactive delivery and
control for about 5.5 s without loss or reorder. Budgets were predeclared in
[PLAN](PLAN.md) before any measurement.

| Item | Value |
| --- | --- |
| Source | Candidate 5: HEAD `f98de4f` plus uncommitted changes, inventory digest `27758cb4…e429fff9` ([TEST-REPORT](TEST-REPORT.md)) |
| When | 2026-09-24 12:49–13:04 UTC, after every suite, build and foreground run of the gate, machine otherwise idle |
| Machine | Windows 10 19045, Intel i7-10700K, RTX 3060, Python 3.10.11, Node 24.20.0, Edge 153 |
| Raw data | `test-results/simulation-concurrency/p5c-c5/`, `test-results/phase5-simulation-compatibility/p5c-c5-*/`, `test-results/phase5-closure/gate-c5/{measure,storage}/` |

## Results against budgets

| ID | Budget | Candidate 5 result | Status |
| --- | --- | --- | --- |
| M1 | 40-row batch: interactive max arrival gap ≤ 750 ms in every run | 239 / 260 / 286 ms (matched controls 238 / 250 / 263 ms) | Pass |
| M2 | Sparse 10k: disclose; no loss, reorder or resync | Max arrival gap 5,173 / 5,639 / 5,629 ms; control actions up to 5,963 ms; sequences continuous, none missing, no resync | Disclosed limitation |
| M3 | golden / local40 / remote40 warm median < 1 s | 38.6 / 158.0 / 166.9 ms | Pass |
| M3 | sparse10000 < 30 s and < 2 GiB | 6.19 s warm median; 176.7 MiB peak | Pass |
| M3 | dense50 / 100 / 200: disclose | 320 / 1,085 / 4,335 ms warm median | Disclosed |
| M4 | Frame decode median ratio ≤ 1.05 (tracked-fixture frames) | Worst 1.012 (7 frames) | Pass |
| M5 | Backend frame validation median ratio ≤ 1.10 (tracked-fixture frames) | Worst 1.065 (tactical fixture) | Pass |
| M6 | Differential tests: zero disagreements; each file ≤ 10 s | 0 disagreements; `test_geometry_exact.py` 3.8 s, `exactGeometry.test.ts` 1.1 s | Pass |
| M7 | Browser storage: measure; §9 UI data ≤ 50% of the limit | 9,687 drones persisted (2,283,322-byte body); first refusal at 9,750. The largest single §9 UI submission is 45,102 bytes (2.0%); the whole two-mission fixture file is 225,167 bytes | Pass, disclosed |
| M8 | Complete browser run 100%, no skip, flaky or retry | 129/129 | Pass |

## P5-BATCH: interactive source during an external batch (M1, M2)

A moving Sydney 20v20 mission (40 units) runs on real uvicorn with the opt-in
probe runtime (`backend/tests/batch_probe_runtime.py`). The batch is submitted
5 s into a 20 s window. Each run uses a fresh server and database, and each
batch run is paired with a control run without a batch. A control action is
the operator's whole `renew` (intent request plus authoritative command).
Times are milliseconds.

| Run | Arrival gap max / p95 | Publication gap max | Event-loop gap max | Control action median / max | Batch latency | Deltas published / received | Continuous, no resync |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control 1 | 238 / 220 | 227 | 91 | 170 / 196 | — | 127 / 126 | Yes |
| local40 1 | 239 / 220 | 234 | 146 | 175 / 344 | 248 | 126 / 126 | Yes |
| sparse10000 1 | 5,173 / 248 | 5,220 | 5,052 | 187 / 5,407 | 6,316 | 94 / 92 | Yes |
| control 2 | 250 / 219 | 233 | 99 | 182 / 257 | — | 127 / 126 | Yes |
| local40 2 | 260 / 225 | 231 | 141 | 189 / 336 | 250 | 126 / 126 | Yes |
| sparse10000 2 | 5,639 / 246 | 5,628 | 5,529 | 185 / 5,957 | 6,872 | 89 / 89 | Yes |
| control 3 | 263 / 225 | 237 | 120 | 168 / 222 | — | 126 / 126 | Yes |
| local40 3 | 286 / 248 | 276 | 192 | 185 / 369 | 308 | 125 / 124 | Yes |
| sparse10000 3 | 5,629 / 226 | 5,565 | 5,426 | 164 / 5,963 | 6,872 | 91 / 92 | Yes |

- **No loss or reorder.** Across the whole connection, every run's delta
  sequences are consecutive. Deltas published but not received all come after
  the last received sequence: they were published while or after the listener
  closed. The published and received counts use slightly different window
  starts, so one run shows one more received than published.
- **Attribution.** The sparse-10k gaps match the server's own 10 ms event-loop
  heartbeat (5.1–5.5 s) and the probe's completion stall (M3, up to 5.5 s).
  The single synchronous completion transaction blocks the event loop, so
  interactive updates and control actions wait; none are dropped.
- **Control latency.** During the sparse-10k stall a control action takes up
  to 6.0 s, almost all in its first request (the intent). Candidate 1 timed
  only the command request and reported 446 ms; that method was corrected
  before this gate.

**Accepted limitation (proposed).** Batches of ordinary size (80 rows over two
timestamps) stay well within 750 ms. Large batches pause interactive delivery
and control for roughly their completion stall. Without a concurrent mission,
the probe's worst event-loop gap is 330 ms (dense50), 1.09 s (dense100),
4.20 s (dense200) and 5.50 s (sparse10000). Adding about 250 ms of interactive
cadence (the controls' largest gaps), dense-50-sized batches should stay within
750 ms, and dense-100-sized batches and larger will not. This is an inference
from M3, not a concurrent measurement. Operational guidance: submit batches
above about 50 drones per timestamp, or thousands of rows, when no live mission
needs sub-second updates, or accept the pause. Updates arrive late but are not
lost.

## Existing probes (M3)

`scripts/performance_simulation.py`, one cold and three repeated runs per kind,
fresh database per run, every database removed.

| Kind | Cold ms | Warm range ms | Max event-loop gap ms | Peak memory MiB | Closed DB bytes | Output pairs |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| golden | 45 | 35–40 | 45 | 58 | 167,936 | 1 |
| local40 | 159 | 155–173 | 172 | 67 | 589,824 | 116 |
| remote40 | 160 | 158–172 | 172 | 67 | 589,824 | 116 |
| sparse10000 | 6,433 | 6,157–6,386 | 5,500 | 177 | 22,765,568 | 0 |
| dense50 | 303 | 319–330 | 330 | 73 | 1,732,608–1,736,704 | 625 |
| dense100 | 1,065 | 1,064–1,112 | 1,085 | 91 | 6,291,456–6,311,936 | 2,500 |
| dense200 | 4,346 | 4,269–4,382 | 4,199 | 107 | 24,563,712–24,576,000 | 10,000 |

Peak memory is the probe process's own sampled working set
(`sampledPeakRssBytes`). The parent-side value in `supervision.json` (about
3.9 MB) samples the Windows virtual-environment launcher, not the interpreter,
so it is not used; the probe's in-process 120 s / 2 GiB guard still applies.
Timings vary between runs of unchanged code: candidate 4's gate measured
local40 at 245 ms and dense200 at 4,936 ms warm median, candidate 1's and
candidate 5's at 158–165 ms and 4,114–4,335 ms. Every run is within budget.
Historical Phase 5 values (2026-09-20, source `30414540` with a dirty tree) are
in [phase5-simulation-compatibility/PERFORMANCE.md](../phase5-simulation-compatibility/PERFORMANCE.md);
they describe that source only and are not compared here.

## Decode and validation A/B (M4, M5)

Both compare HEAD's code with the candidate's on the same frames in alternating
rounds, 30 rounds × 20 iterations. M4 runs `validateFrame` in one Node process,
against a byte-verified copy of HEAD's `integrity.ts`. M5 runs
`WorldFrame.model_validate_json` in separate Python processes, against a
verified `git archive` of HEAD. The budgets cover the seven tracked-fixture
frames (zones of 4–6 positions); three diagnostic frames with a 101-position
zone characterise the worst case and are reported separately.

| Frame | M4 decode ratio | M5 validation ratio |
| --- | ---: | ---: |
| interactive-remote-20v20 | 0.990 | 1.002 |
| interactive-default | 1.012 | 1.034 |
| external-golden | 1.009 | 1.030 |
| external-local40 | 0.999 | 1.017 |
| external-remote40 | 0.990 | 1.013 |
| external-s9-north | 0.992 | 1.005 |
| tactical-fixture | 1.001 | 1.065 |
| *diagnostic: ordinary 101 positions* | *0.917* | *0.273* |
| *diagnostic: mixed exponents, 101 positions* | *0.908* | *0.414* |
| *diagnostic: subnormal scale, 101 positions* | *1.883* | *0.300* |

With the exact bounding-box early exit, large ordinary and mixed-exponent zones
now validate faster than HEAD in both languages; HEAD's backend check costs
about 13 ms per 101-position zone. The subnormal-scale zone is the frontend's
worst case: its signs fall back to BigInt, so decoding that frame takes 0.45 ms
against HEAD's 0.24 ms. Every frame revalidates its zones in both the backend
and the frontend, as at HEAD.

## Browser storage (M7, R2-3)

Edge with a fresh profile; doubling then bisection over valid UI batches (12
attempts). The client stores both the draft and the exact pending copy before
sending. It persisted and sent a 9,687-drone batch (2,283,322-byte body) and
refused 9,750 drones with a genuine `QuotaExceededError`, reported as a
readable refusal without sending. This is the practical UI limit on this
browser profile, distinct from the contract maxima; larger batches use the
HTTP API. Durable pending persistence is unchanged. Candidate 4's gate run of
the probe stopped at 16,000 drones: it queried the page while a multi-megabyte
draft was still rendering. The probe now waits for rendering to finish, and a
lead diagnostic confirmed that both the candidate 1 and candidate 4 builds take
about as long to register that draft (33 s and 36 s).
