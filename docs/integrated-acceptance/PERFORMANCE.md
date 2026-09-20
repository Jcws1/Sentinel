# D7 resource and display evidence

This is an integration measurement, not a new optimisation claim or a matched before/after performance pass. The prior [performance limitations](../reports/performance-stability.md) remain applicable.

## Method and environment

Fresh foreground headed Edge 153.0.4234.48; Windows, i7-10700K (8 cores / 16 logical processors), RTX 3060 driver 32.0.16.1088. Read-only CIM evidence confirms a physical 2560×1440 display at 144 Hz. Main measurements use an emulated 1440×900 CSS viewport at DPR 1. The 760/820/900/2560×1440/3840×2160 layout checks are emulated dimensions; this is not physical 4K certification. The separate real browser zoom check runs at native DPR 1.75 with 80/100/125% zoom, giving DPR 1.4/1.75/2.1875; it establishes functional layout, not FPS at those scales.

Short frame windows use Chromium `Display::FrameDisplayed` trace timestamps. Median/p95/p99 intervals, long stalls and estimated missed144Hz slots are reported separately from RAF diagnostics. The latter alone cannot establish displayed FPS. CPU profiling runs during these windows and adds some overhead. Grid and configured-provider measurements run without competing test/build/UI jobs. Fresh browser-context loading and explicit warmup precede each steady window; this does not imply cold OS/driver caches. Provider readiness is recorded, with visible resident tiles distinguished from fully settled streaming. Credentials and resource query strings are excluded from retained diagnostic output.

Command timings cover the automation-triggered UI action through accepted HTTP receipt, including menu interaction where used; they are not pure server execution time. Source publication age uses same-machine browser arrival versus `recordedAt`. Simulation-clock age also includes intentional Pause/time history and is not a transport-latency substitute. Details response uses pointerdown → matching DOM update → two RAF opportunities, a paint-opportunity proxy rather than a photodiode measurement.

## Ten-minute moving 20v20 soak

`performance/lifecycle.mjs d7-soak`, `PERF_SOAK_SECONDS=600`, grid/globe fallback, ordinary 3D plus Video Feed with simulated overlays, unchanged supported profiles/speeds. Three supported chained routes use ±0.035° longitude destinations inside the same scenario square. There were 20 map/tab transitions before the steady window; hidden 3D rendered-frame counts remained fixed during hiding.

The observed window lasted **611.353 s**, including coarse resource-query overhead. **All 40 positions changed at every one of 20 thirty-second checkpoints.** One WebSocket stayed open with no reconnect. Two Cesium renderers were created and retained, with no repeated recreation. Every sampled document was visible and focused. Camera extent remains operator-owned; actors can leave the ordinary map viewport during their long routes. This workload test is not an assertion that all 40 remain on screen during FPS measurement.

| Metric | After20 transitions | End, collected diagnostic |
| --- | ---: | ---: |
| JavaScript heap |51,701,920B |59,531,496B |
| DOM nodes |3,049 |3,049 |
| JavaScript event listeners |1,257 |1,257 |
| Backend private memory(actual writer) |98,140,160B |107,044,864B |
| Frontend server private memory |130,355,200B |135,835,648B |
| Database/WAL/SHM total |30,442,608B |788,088,304B |
| Received WebSocket messages |132 |3,153 |
| Received payload characters |16,426,648 |487,956,147 |

GC ran before/after the steady window, not during its20 sampling intervals. Uncollected heap fluctuated; collected heap increased **7.83MB**, writer private memory **8.90MB** and frontend-server private memory **5.48MB**. Stable renderer/socket/node/listener counts and bounded sampled trends are positive evidence, not proof of indefinite leak freedom.

The subscription count measured here is the actual shared WebSocket connection. CDP's DOM listener metric is not a census of React/runtime subscribers. Shared runtime ownership and hidden-pane subscription suspension are supported separately by source review, focused tests and the foreground hidden-text/catch-up checks.

The **757.65MB** recording growth is persisted mission history; no recording data was discarded to improve memory figures. This sizable storage rate is an explicit limit for longer sessions. `transport.bytes` in the raw report counts JavaScript payload length: the table therefore calls it characters, not exact UTF-8 or network-wire bytes. The ended task recording/database was removed only after its sole backend stopped; operator recordings were untouched.

Four Details-response samples were 8.6, 9.3, 10.7 and 16.8 ms. End-of-soak action-to-acknowledgement samples: Pause 644.7 ms, Resume 316.8 ms, Stop 20 Friendly 701.5 ms, Return to script 487.9 ms, End 701.4 ms. Pause froze authoritative tracks; Stop froze the 20 Friendly while 20 Hostile continued moving. The sample count is too small for general latency-tail guarantees.

## Representative compositor windows

Grid windows below each last12s, use1440×900/DPR1, and have a visible, focused document. The20v20 sample confirms40 moving tracks;10v10 confirms20. Ordinary3D and Video are fallback grid/globe; Video has simulated overlays enabled and visible. These are short steady windows, not indefinite display guarantees.

| Grid workload/panes | Mean presented FPS | Median / p95 / p99 interval(ms) | Maximum(ms) | Publication age median / p95(ms) |
| --- | ---: | --- | ---: | --- |
|10v10 Tactical |139.68 |6.944 /7.051 /13.909 |34.738 |35 /70 |
|10v10 ordinary3D |141.01 |6.944 /7.023 /13.879 |48.612 |33 /76 |
|10v10 ordinary3D + Video |137.77 |6.944 /7.032 /20.832 |55.532 |40 /70 |
|20v20 Tactical |114.71 |6.948 /13.911 /20.832 |41.671 |72 /106 |
|20v20 ordinary3D |138.02 |6.944 /7.029 /20.797 |55.544 |59 /106 |
|20v20 ordinary3D + Video |135.78 |6.944 /7.052 /27.779 |62.478 |61 /108 |

All grid averages exceed100FPS, but several p99 intervals exceed16.7ms and isolated50ms stalls occur. Do not describe these figures as perfectly even pacing or proof that the configured-provider60FPS target is met. Raw compositor counts, estimated missed144Hz slots, RAF/CPU diagnostics and loading state are retained per window. Prior performance limits remain.

| Grid window | Presented events | Estimated missed144Hz slots | Intervals >16.9ms | Stalls >50ms |
| --- | ---: | ---: | ---: | ---: |
|10v10 Tactical |1679 |64 |7 |0 |
|10v10 ordinary3D |1695 |42 |9 |0 |
|10v10 ordinary3D + Video |1657 |105 |21 |1 |
|20v20 Tactical |1379 |363 |25 |0 |
|20v20 ordinary3D |1661 |80 |18 |2 |
|20v20 ordinary3D + Video |1635 |121 |23 |1 |

The missed-slot estimate rounds each presentation interval relative to144Hz; it is not an exact GPU-driver dropped-frame counter. Grid UI action-to-acknowledgement(Pause/Resume/End) was207.9/156.1/153.8ms at10v10 and316.8/167.5/438.0ms at20v20.

## Bounded configured content

The final network-enabled attempt (`perf-d7-configured-complete`) uses the same physical display, viewport, DPR, 20v20 scenario, profiles and 12-second windows. Tactical displays the configured local vector content. Ordinary 3D reports **standard imagery, terrain and buildings ready**. Provider arrangements, credentials, attribution, quality and renderer limits are unchanged.

| Configured workload | Mean presented FPS | Median / p95 / p99 interval (ms) | Maximum (ms) | Publication age median / p95 (ms) |
| --- | ---: | --- | ---: | --- |
| 20v20 Tactical | 94.53 | 6.984 / 20.827 / 27.773 | 34.722 | 69 / 116 |
| 20v20 ordinary 3D | 138.43 | 6.944 / 7.044 / 20.833 | 48.611 | 61 / 99 |
| 20v20 ordinary 3D + Google Video | **No complete sample** | Streaming exceeded request budget during capture | — | — |

Tactical retained 1,136 presented events, an estimated 602 missed144Hz slots and 80 intervals over16.9ms. Ordinary3D retained 1,663 events, 72 estimated missed slots and 20 intervals over16.9ms. Neither completed window had a50ms stall. These short averages do not certify even sustained60FPS.

Google Video **passed the visible-content readiness check**: photorealistic provider ready, resident bytes and visible tiles, with simulated overlay points/labels present. After the explicit12-second warmup, that check took162ms. Moving-provider streaming continued, however, and the budget guard closed the page during the next12-second capture. The4,000-request threshold triggered at4,001;4,015 external requests were observed including already-starting requests. This is a bounded harness stop, not evidence of an application crash. No complete Video frame sample is retained, and no Video FPS is inferred from its RAF activity or earlier grid results.

The preceding network-enabled attempt triggered its1,500-request threshold at1,501, with1,503 external requests observed. Both caps and their failed results are preserved. The first sandboxed attempt instead reported `ERR_NETWORK_ACCESS_DENIED`; its fallback windows are excluded from configured-performance claims. Two intervening local setup failures made **zero external requests**. They exposed a duplicate validation-handshake path in the measurement runner; see [regression notes](REGRESSION-NOTES.md). No additional provider attempts were made after the final cap.

Fresh-context initial setup is separate from steady windows. The final40-unit/120-action scenario took **5.461s from Validate input to the complete review body** and **5.507s to the visible exact-revision review**. Setup through the Tactical warmup took15.899s. These include UI/network/validation work, not just backend execution. The slow initial validation remains an observed responsiveness limit; its time is not hidden in a longer FPS window.

## Independent reproduction and acceptance

Round 1's independent Sydney 40-unit Tactical grid window produced 108.19 mean presented FPS, median 6.952 ms, p95 20.800 ms, p99 27.760 ms and a 62.485 ms maximum. This was a separate diagnostic reproduction, not a matched comparison with the Singapore window. It supports the high average/uneven-tail distinction.

**Performance acceptance remains limited.** Configured Video pacing was not completed under the bounded provider budget; previous configured-Video FPS findings remain unresolved. Physical4K performance and indefinite resource stability were not established. The ten-minute soak and short compositor windows provide a reproducible integration baseline, not blanket60FPS certification or a new optimisation claim. The later production change only corrects ended-recording control explanations; it does not change the running/rendering paths measured by the grid/soak runs.
