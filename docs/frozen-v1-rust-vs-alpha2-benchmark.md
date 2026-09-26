# Frozen-v1 benchmark: Rust coordinator vs Alpha.2

## Result

**Decision: NOT READY.** The Rust path reduces client/coordinator overhead, but it still calls the same Python Alpha.2 model. It is not a native Rust model port and cannot claim the frozen benchmark's Rust model-parity gate. Both paths miss the 30- and 100-track latency gates, while Alpha.2 fails most sealed coordination gates and the sealed motion gate.

The supplied protocol package and the separately supplied 790 MB holdout were verified byte-for-byte with `verify_freeze.py` before evaluation. Candidate artifact/configuration hashes were registered before the sealed score. The sealed split was scored once for the declared configuration.

## What was compared

- **Python Alpha.2 direct:** frozen-derived request batches sent over loopback HTTP/JSON to the registered `3.0.0-alpha.2` worker.
- **Rust coordinator + Alpha.2:** the same batches sent by the Rust client, then subjected to Rust contract, identity, epoch, revision, expiry, model-version and authority validation. The inference engine remains Python Alpha.2.

This measures deployable boundary overhead. It does **not** compare a Python model against a native Rust rewrite of that model, because no such Rust model exists in the current tree.

## Runtime results

Each cell aggregates 20 measured runs from two reverse-order blocks. Each block used three unscored warm-ups. The input histories and assets were deterministically derived from frozen validation Parquet files. Timing includes JSON serialization and the loopback boundary.

| Tracks | Required updates/s | Python p50 / p95 ms | Rust path p50 / p95 ms | Python median rate/s | Rust median rate/s | Frozen latency gate |
|---:|---:|---:|---:|---:|---:|---|
| 3 | 6 | 442.3 / 701.4 | 274.5 / 490.8 | 6.78 | 10.93 | No fixed p95 gate |
| 10 | 20 | 515.2 / 699.5 | 439.3 / 526.6 | 19.41 | 22.76 | No fixed p95 gate |
| 30 | 60 | 868.7 / 1068.5 | 589.2 / 701.5 | 34.53 | 50.92 | **FAIL** for both; requires p95 <=250 ms and 60/s |
| 100 | 200 | 2027.2 / 2336.9 | 1799.4 / 2329.3 | 49.33 | 55.57 | **FAIL** for both; requires p95 <=500 ms and 200/s |

The Rust path's median was 11-38% lower depending on profile, but the 100-track p95 was effectively unchanged. That is consistent with Python feature/model work dominating at scale. The client blocks were run in both orders because a first one-way run showed a strong warm-worker ordering effect.

## Sealed accuracy results

The same Alpha.2 predictions apply to both paths because Rust validates and transports the Alpha.2 result rather than recomputing it.

| Gate | Required | Sealed result | Status |
|---|---:|---:|---|
| Motion macro-F1 | >=0.55 | 0.4583 | **FAIL** |
| Asset-relation macro-F1 | >=0.62 | 0.6319 | PASS |
| Coordination macro-F1 | >=0.60 | 0.2004 | **FAIL** |
| Coordinated recall | >=0.70 | 0.2633 | **FAIL** |
| Splitting recall | >=0.50 | 0.2870 | **FAIL** |
| Merging recall | >=0.50 | 0.0790 | **FAIL** |
| Independent false-positive rate | <=0.05 | 0.5617 | **FAIL** |
| Coordination Brier | <=0.20 | 0.5414 | **FAIL** |

Alpha.2 emitted 1,051,938 sealed rows in 534.8 seconds. It produced no duplicate keys and no missing prediction keys. Validation had shown the same coordination failure pattern (macro-F1 0.2067), so the sealed result is not an isolated reversal.

## Protocol limitations and incomplete gates

- The current holdout scorer does not implement the frozen specification's incident-clustered 2,000-sample confidence intervals, pairwise membership/continuity metrics, or all transition-delay metrics. Those items remain unreported, not silently passed.
- A second full sealed replay was intentionally not scored. Therefore the deterministic replay mismatch gate is not empirically established for the sealed set in this run.
- CPU, peak-RSS, queue-age, coalescing and drop telemetry were not captured per candidate by the current harness. The batch boundary returned every request, but that is not a substitute for production overload telemetry.
- The frozen package explicitly cannot validate countermeasure tasking or real-drone behavior. No tasking-quality claim follows from this result.

## Recommendation

Do not rewrite Alpha.2 into Rust yet. First replace or substantially improve coordination inference and repair motion generalization on development/validation. In parallel, profile the Python feature pipeline: at 100 tracks, model/feature work dominates transport and misses capacity by about 3.6x on the Rust-mediated path. Once accuracy gates pass, either export supported estimators to a native runtime or implement a verified Rust port, then register that new artifact and run frozen-v2 (not reuse this sealed declaration).

Machine-readable results are in `benchmarks/frozen_v1/results/summary.json`; raw local runs and prediction Parquet files are retained under ignored `test-results/frozen-v1/`.
