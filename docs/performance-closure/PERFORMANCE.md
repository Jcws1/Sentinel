# Measured results and limits

Matched sources are the exact current uncommitted baseline snapshot and the two
changed backend functions. The same checked-in fixtures, unit profiles and
200 ms simulation step are used. No results below use an older committed build.

## Backend validation

One first review and three repeated reviews per fresh disposable repository.
Fixtures run sequentially in each process; “cold” means first review in that
repository, not a cold machine or new Python interpreter for every fixture.
Each complete canonical review matches its baseline hash after removing only
the randomly generated definition ID. Separate full-plan regression goldens
cover exact completion samples and failure/dependency/conflict states.

| Location / moving entities / actions | First before → after (ms) | Repeated median before → after (ms) |
| --- | ---: | ---: |
| Default / 20 / 60 | 2,399.768 → 1,145.044 | 2,200.643 → 1,130.609 |
| Default / 40 / 120 | 4,759.946 → 2,270.581 | 4,785.487 → 2,268.648 |
| Sydney / 20 / 40 | 1,285.108 → 1,072.316 | 1,288.087 → 1,003.223 |
| Sydney / 40 / 80 | 2,613.977 → 2,101.152 | 2,665.700 → 2,210.759 |

The primary default40 repeated goal (>=30%) is met: **52.6% lower**; its first
review is52.3% lower. Sydney40 improves about17.1% repeated and19.6% first,
below a25% cold improvement. That restricted-boundary workload continues to do
all geometry work. No result cache is involved. A separate instrumented default40
review falls17.215→6.850s and60.89→23.84million calls; instrumentation changes
absolute timing and is excluded from the latency table. Samples are small and
do not establish general p95/p99 validation latency. Original small-sample p95
fields used a floor estimator; the tool now uses nearest rank, and original
samples remain retained. Medians are unaffected.

## Recording: unchanged retained bytes, no storage closure

Each main window has100 durable source ticks,20 simulated seconds, plus one
explicit lease-renewal commit:101 new retained frames. All20/40 tracks moved.
No history, sample, event, receipt, outcome or checkpoint is removed. Each
before/after pair has identical table row counts and logical JSON-byte totals.

| Workload | New frame JSON bytes | Bytes/committed frame | Bytes/entity/simulation-second | Tick median before → after (ms) | Measured wall seconds before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default10v10 | 10,747,763 | 106,413.50 | 26,869.41 | 37.271 → 36.986 | 4.350 → 4.348 |
| Default20v20 | 21,079,419 | 208,707.12 | 26,349.27 | 82.557 → 89.891 | 8.967 → 9.402 |
| Sydney10v10 | 10,170,152 | 100,694.57 | 25,425.38 | 38.083 → 38.563 | 4.395 → 4.483 |
| Sydney20v20 | 19,703,512 | 195,084.28 | 24,629.39 | 73.272 → 91.578 | 8.211 → 9.004 |

The original Sydney40 median worsened25.0%, failing the no->10%-regression goal.
A separate10-tick instrumented run improved1.069→0.973s, so these limited samples
do not establish an attributable CPU regression or improvement in durable ticks.
The planned reverse-order repeat was not completed; the adverse result remains
open, not discarded. Storage efficiency is unchanged and **not accepted**.

| Workload | Baseline end-of-main-window DB / WAL / SHM bytes | Logical page allocation / free-page bytes | Final normal-close database, both sources |
| --- | ---: | ---: | ---: |
| Default10v10 | 10,379,264 / 4,293,072 / 32,768 | 11,350,016 / 36,864 | 12,644,352 |
| Default20v20 | 20,426,752 / 4,400,192 / 32,768 | 22,102,016 / 73,728 | 24,559,616 |
| Sydney10v10 | 10,350,592 / 4,227,152 / 32,768 | 10,862,592 / 32,768 | 12,062,720 |
| Sydney20v20 | 20,733,952 / 4,346,632 / 32,768 | 20,733,952 / 61,440 | 22,999,040 |

These are end-of-main-window allocations; raw results retain matching after components
and initial components separately. Final normal-close size contains115 total
frames:3 setup,101 main-window,10 separate profiling ticks and End. WAL/SHM are0
after close. No manual checkpoint/vacuum or representation change caused the
equal final sizes. JSON bytes are logical retained payload, not allocated pages
or network bytes. Cumulative writes/write amplification were not measured.
Later schedule completions expand state; do not extrapolate these early20s rates
to the historical611s soak. No new ten-minute soak or long-term leak claim.

## Foreground and display evidence

Actual-desktop matched validation uses the same production frontend build,
1440×900 CSS/DPR1, fresh contexts and exactly the same saved fixtures. Native
window enumeration confirmed the elevated-launch Edge window. One first-context
sample and three repeated samples were collected on each source with no tests,
builds or other benchmark running. Screenshots and visible/focused browser state
are retained; an after-run native-window query occurred after cleanup and is not
claimed as a second native capture.

| Actual-desktop validation | First pointerdown → review DOM before → after(ms) | Repeated median before → after(ms) | Repeated automation-action → visible review before → after(ms) |
| --- | ---: | ---: | ---: |
| Default40 /120 actions |5,248.1 →2,766.5 |4,992.0 →2,569.0 |5,291.4 →2,846.9 |
| Sydney40 /80 actions |2,767.6 →2,177.6 |2,828.4 →2,136.3 |2,956.2 →2,255.7 |

Default repeated input-to-DOM improves48.5%; the automation-visible measure
improves46.2%, meeting the25% goal. Sydney's repeated input-to-DOM improves24.5%
and first-context21.3%, below25%; disclose that limit. HTTP request-to-response
headers dominate: default repeated before4,708–4,950ms versus after2,303–2,333ms.
Transfer lasts under1ms in representative local samples; response-end-to-review
DOM remains about232–297ms before and234–266ms after. This residual includes
frontend decoding/processing and rendering and is not individually attributed.
Server-only timings come from the separate backend probe; HTTP wait also includes
proxy/network dispatch. Exact review revision/hash and complete authoritative body
are checked before any sample is accepted. Review never becomes complete early.

The fresh critic independently measured Sydney40 input-to-two-RAF review at
2,302.3ms first and2,247.0/2,263.7ms repeated. Its own actual foreground12s Tactical
window presented120.60FPS,median/p95/p99=6.948/13.922/20.854ms,max34.751ms and no
>50ms stalls. This single window meets the bounded thresholds; it does not close
configured-provider or sustained display acceptance. See [critic](CRITIC.md).

The critic also confirmed a pre-existing limitation: requesting validation while
a run is active still performs synchronous analysis before reporting the active
run. A2,244.6ms refused review coincided with a2,162.9ms source-message gap.
Its UI/menu action-to-receipt samples were Pause317.8ms, Resume5,220.5ms and
End459.7ms. The Resume sample has no server-only breakdown and is not attributed
to a production cause. Both limitations remain disclosed, not hidden by averages.

Initial headed grid/UI programs ran on an isolated Windows desktop. Their DOM
reported visible/focused and emitted compositor timestamps, but native window
inspection could not see them. **These are diagnostic comparisons, not actual
foreground display acceptance.** They are retained, including adverse tails.
Actual-desktop UI launches use the authorized unsandboxed runner and are verified
by native window enumeration. The native screenshot/activation tool subsequently
blocked on app approval and timed out; its gap is not reported as a successful
capture. The independent critic uses its own visible browser and screenshots.

| Isolated-desktop diagnostic,12s per window | Before → after average FPS | Before → after p95/p99(ms) | After maximum(ms) |
| --- | ---: | --- | ---: |
|10v10 Tactical |141.01 →140.18 |7.04/13.90 →7.04/13.90 |55.55 |
|10v10 ordinary3D |142.10 →141.52 |7.05/13.74 →7.04/13.83 |34.70 |
|10v10 ordinary3D+Video fallback |141.34 →140.43 |7.05/13.90 →7.05/13.90 |34.72 |
|20v20 Tactical |114.56 →126.69 |13.92/20.82 →13.89/20.74 |27.75 |
|20v20 ordinary3D |138.68 →137.11 |7.04/20.80 →7.01/20.83 |76.38 |
|20v20 ordinary3D+Video fallback |137.86 →138.10 |7.05/20.84 →7.05/20.84 |83.32 |

Physical machine: i7-10700K,RTX3060,2560×1440/144Hz,Edge153.0.4234.48.
All these browser viewports are1440×900 CSS/DPR1, not physical4K or native-DPR
certification. Raw results include compositor median/p95/p99, missed144Hz-slot
estimates, >16.9ms intervals, >50ms stalls, source publication age, command
acknowledgement, heap/DOM counts and CPU traces. RAF counts are not substituted
for compositor presentation. One sample per configuration and no fixed source
tick alignment limit attribution; high averages do not establish smoothness.
The predeclared no->50ms-stall criterion is not met in several diagnostics.

Configured Video: **no new provider requests or pacing run** in this pass.
Historical request-cap diagnosis is in [DIAGNOSIS](DIAGNOSIS.md). The proposed
single bounded standalone-Video check was deferred to protect final regression
and cleanup time after the native-tool timeout. Current provider total is0.
No budget reset, credential change, cache change or quality reduction occurred.
Configured combinations, actual foreground matched FPS, physical4K, sustained
60FPS and long-duration resources remain open.
