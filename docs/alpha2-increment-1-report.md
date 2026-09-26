# Alpha.2 Increment 0/1 report

Date: 2026-09-26  
Branch: `codex/alpha2-integration`  
Base: `6724bfe927156087b834faed01d80888de0d60be`

## Scope and decision

This increment integrates the supplied Sentinel Level 3 Alpha.2 artifact as a
stateless, non-authoritative Python inference worker behind a versioned Rust
contract and freshness gate. It does not implement or claim improved
coordination, group tracking, simulator generation, tasking, or autonomous
action.

The contract slice is runnable and its failure isolation is demonstrated. It
is **not integration-ready at the required 2 Hz per track profile**: the
supplied pandas/scikit-learn per-track prediction path is substantially too
slow. The next engineering decision should evaluate vectorized/batched
inference while preserving one immutable request identity per track. Do not
start the coordination pilot until that decision and a new benchmark are
approved.

## Repository safety

The original `Sentinel-rust-prototype` checkout was left intact with four
pre-existing modified transport-calibration files:

- `benchmarks/network/expected_cloud_trials.py`
- `benchmarks/network/network_harness.py`
- `benchmarks/network/tests/test_expected_cloud_trials.py`
- `realtime-gateway/src/lib.rs`

There were no untracked files. Alpha.2 work was isolated in a new worktree and
branch. Those four files do not appear in this branch's changes.

## Artifact and runtime provenance

The supplied loose requirement `scikit-learn>=1.8` resolved to 1.9.1 and failed
to load the artifact with an inconsistent-version warning followed by
`ModuleNotFoundError: _loss`. The artifact loaded successfully with
scikit-learn 1.8.0 and reports model version `3.0.0-alpha.2`.

Canonical values are now recorded in package metadata, Python constants,
worker health/log/metrics output, the Rust allowlist and the artifact manifest:

- model version: `3.0.0-alpha.2`
- Python: `3.11.*`
- scikit-learn: `1.8.0`
- artifact SHA-256:
  `0002ad0a3be0ebcae8ad9385d2358f1e1395f8b83a920ee380c4cc67fbfa50af`

The complete direct runtime set is pinned in
`alpha2-worker/requirements.lock.txt`. The artifact is trusted project input;
joblib/pickle artifacts must never be loaded from an untrusted source.

## Architecture delivered

- Rust owns epoch, revision, current authority, TTL and model allowlisting.
- Each Python request contains an immutable bounded observation history and
  asset snapshot. Python owns no mission state.
- The worker response is explicitly
  `non_authoritative_decision_support`.
- Rust rejects changed epoch/revision, expired responses, identity mismatch,
  unsupported contract versions and unapproved model versions.
- Worker timeout or outage returns `Unavailable` and does not mutate or block
  authoritative state.
- Alpha.2 coordination is returned only as `EXPERIMENTAL_DISABLED`.
- The worker exposes `/health`, `/metrics` and `/v1/infer`; startup logs include
  model, artifact and contract identity.

## Tests executed

| Suite | Result |
| --- | ---: |
| Supplied Alpha.2 source tests | 3 passed |
| Added Alpha.2 artifact/contract tests | 6 passed |
| Rust coordinator tests | 4 passed |
| Rust strict Clippy (`-D warnings`) | passed |
| Real Rust → Python Alpha.2 HTTP smoke | 1 passed |

Added tests cover artifact loading, save/load prediction equivalence,
prediction schema, incomplete history, non-monotonic input, version
consistency, stale revision, changed epoch, TTL, contract mismatch, model
allowlist, timeout and worker failure isolation.

## Benchmark setup

- Host transport: loopback HTTP JSON.
- Worker: Python 3.11, scikit-learn 1.8.0, supplied Alpha.2 joblib.
- Input: 30 causal observations per track plus one protected asset.
- Fleet sizes: 3, 10, 30 and 100 tracks.
- Offered target: 2 assessment updates per second per track.
- Client concurrency: at most eight simultaneous requests.
- One warm request preceded measurement.
- Percentiles use nearest rank over one simultaneous update per track.
- This is a capacity probe, not a statistically sufficient latency release
  series. Raw machine-readable results are in
  `alpha2-worker/reports/latency-report.json`.

## Actual benchmark results

| Tracks | Required /s | Achieved /s | Feature p95 | Model p95 | IPC p95 | E2E p95 | 2 Hz/track |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 3 | 6 | 2.973 | 470 ms | 550 ms | 16 ms | 1,005 ms | fail |
| 10 | 20 | 1.735 | 1,646 ms | 3,878 ms | 34 ms | 5,427 ms | fail |
| 30 | 60 | 2.648 | 2,492 ms | 2,525 ms | 48 ms | 4,486 ms | fail |
| 100 | 200 | 2.532 | 1,499 ms | 2,972 ms | 29 ms | 4,001 ms | fail |

An isolated single-track sample before concurrency measured approximately
146 ms feature preparation, 155 ms model inference and 307 ms worker total.
The loopback IPC contribution is small relative to feature/model work. Higher
concurrency increases contention rather than approaching the required rate.

## Files added or changed

- `.gitignore` — ignore nested Rust build products.
- `alpha2-worker/` — pinned package, supplied source/model, stateless worker,
  tests, benchmark, artifact manifest and report.
- `behavior-assessment/` — Rust contracts, HTTP worker client, coordinator,
  freshness gate and tests.
- `contracts/behavior-assessment/v1/` — immutable request/response schemas and
  authority semantics.
- this report.

## Remaining blockers

1. Per-track pandas reconstruction and independent model calls fail the
   required throughput at every tested fleet size.
2. The current worker uses a threaded standard-library HTTP server only for the
   isolated trial; production deployment and authentication are not designed.
3. The feature pipeline still recomputes a complete supplied history. Rust
   rolling-feature parity is not yet implemented.
4. The benchmark needs repeated runs, CPU/RSS measurement and a vectorized
   batch candidate before any integration-ready claim.
5. The worker is not wired into the production gateway because capacity failed;
   doing so would expose a known-unfit path without product value.

## Recommended next decision

Approve a narrowly scoped Alpha.2 batching experiment:

1. Rust retains immutable per-track request identities and authority metadata.
2. The transport groups ready requests into a bounded 10–25 ms batch.
3. Python concatenates histories once and calls each model once per batch.
4. Responses remain individually revision/epoch/TTL checked by Rust.
5. Repeat the 3/10/30/100-track benchmark with CPU and RSS.

If batching cannot sustain 60/s for the declared 30-track POC with acceptable
latency, keep Alpha.2 as an on-demand diagnostic rather than a continuous
streaming feature. Coordination Increment 2 remains deliberately unstarted.

