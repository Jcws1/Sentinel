# Performance, stability and 20v20 result

The preceding pass implemented useful improvements, but **full acceptance remains on hold**. Three independent rounds ended with **8.2/10, HOLD**. This cleanup does not change or renew that assessment.

Fixes reduced duplicate backend validation/serialization, coalesced MapLibre source work, suspended hidden pane subscriptions, corrected renewal ordering and label-offset jumps, and removed an unused Video geometry-collision query. Existing simulation timing, interpolation, quality, symbols, attribution and authority rules were preserved.

| Matched 10v10 metric | Before | After |
|---|---:|---:|
| Durable backend tick median | 54.75 ms | 37.46 ms |
| Configured Tactical main-task time / 12 s | 11.94 s | 9.41 s |
| Ordinary 3D + loaded Google Video | 45.95 FPS | 47.78 FPS |

Final forty-moving-entity grid windows averaged 125.61–137.94 FPS across 760/820/900 px and emulated 1440p/4K dimensions. Normal configured 3D + Google Video reached **41.38 FPS**, with p95/p99 frame intervals **41.69/48.64 ms**, missing sustained 60 FPS. An independent foreground trace measured 40.84 FPS. Loaded-provider latency tails, intermittent ordinary-3D cold startup and dense ordinary-3D label overlap remain unresolved.

The tested machine had an i7-10700K, RTX 3060, Edge 153 and a physical 2560×1440 144 Hz display. Main traces used DPR 1 and compositor presentation events, not RAF counts. Emulated 4K is not physical 4K certification. Native-DPR functional zoom checks do not establish native-DPR performance. A bounded provider request cap left configured 900/1440p/4K measurements and an additional provider soak unverified.

All forty units moved through the real application. Stop left twenty Hostile units moving while twenty Friendly held. Twenty supported Intercept outcomes produced forty persistent NON-OP entities; lost-response exact-identity retry, reconnection, backend restart, End and recorded inspection passed. Hostile Intercept behavior was not added. The [tracked 20v20 fixture](../../frontend/tests/fixtures/scenario-20v20.json) and [test instructions](../../frontend/tests/README.md) retain reproducibility.

At the end of that pass, 365 backend and 372 frontend tests plus static, contract, hash and build checks passed. Eight historical authoring browser cases stopped at outdated setup and remained unverified; the separate repository cleanup ledger records subsequent setup repairs and reruns. The two-minute resource test retained stable DOM/listener/renderer counts but some heap/private-memory growth, and approximately 125 MiB of intentional recording growth. It does not prove indefinite stability.

Complete methods, per-window results, independent reports and recordings are preserved in [the external archive](../ARCHIVE.md), under `historical/docs/performance-stability/`. Earlier findings and evidence are unchanged.
