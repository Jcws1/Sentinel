# Milestone 1 measurements

This ledger is being completed against the immutable current-source baseline at
HEAD `6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`. Historical D7 numbers are not the
baseline for the comparisons below. See [baseline](BASELINE.md), predeclared
[goals and decisions](DECISIONS.md), and the final verification matrix.

## Recording: matched short probes

Each main probe performs 100 durable ticks (20 simulated seconds), one lease
renewal and 101 measured new frames. All entities move; default fixtures have
60/120 actions and Sydney fixtures 40/80 actions. Fixture hashes and all timing
samples are retained. End and normal close occur after the measured loop. The
first A/B pair also executes ten separately profiled ticks, giving 115 final
frames; the reverse-order Sydney pair ends with 105. Do not compare closed totals
across those different counts. No vacuum or explicit checkpoint manufactures a
saving. SQLite remains WAL with FULL synchronous durability.

| Workload | Baseline / final tick median | Baseline / final p95 | Logical B/new frame, both | Stored B/new frame, baseline → final | Closed DB B, baseline → final |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default 10v10 | 39.738 / 35.823 ms | 71.542 / 66.410 ms | 106,413.50 | 106,413.50 → 8,370.78 | 12,644,352 → 1,339,392 |
| Default 20v20 | 83.826 / 68.160 ms | 117.748 / 101.814 ms | 208,707.12 | 208,707.12 → 13,742.50 | 24,559,616 → 2,150,400 |
| Sydney 10v10 | 39.116 / 33.577 ms | 68.154 / 62.647 ms | 100,694.57 | 100,694.57 → 8,732.05 | 12,062,720 → 1,323,008 |
| Sydney 20v20 | 74.814 / 61.927 ms | 109.223 / 98.578 ms | 195,084.28 | 195,084.28 → 14,473.98 | 22,999,040 → 2,297,856 |
| Sydney 20v20, reverse order | 74.786 / 62.849 ms | 106.196 / 97.374 ms | 195,084.28 | 195,084.28 → 14,446.72 | 21,032,960 → 2,134,016 |

Execution order is A1 (baseline all four), B1 (final all four), B2 (final Sydney
40), A2 (baseline Sydney 40). Main-loop wall times in table order are 4.687/4.122,
8.946/7.632, 4.551/3.898, 8.461/7.166 and 8.257/7.223 seconds. Savings are normalized
by committed work, not wall-clock throughput. Sydney40 stored payload is about
1,827 B/entity/simulated second versus 24,629 B baseline. Original exploratory
Sydney baseline medians were 77.059 and 78.274 ms; the independent critic measured
74.421 → 60.916 ms. All are retained. These measurements do not reproduce the
preceding pass's adverse +25% result, and cannot retrospectively identify its cause.

The matched A1/B1 end-state logical frame totals are byte-count identical for
every fixture. Deterministic goldens independently prove exact frame, event,
checkpoint, receipt and revision hashes, not merely equal byte lengths. End-state
WAL and SHM are zero after normal close in every short probe. Unused baseline
pages are 6–16 pages in the profiled cases, far too small to explain the savings;
final freelists are zero. All raw reports retain live DB/WAL/SHM and page counts.
Cumulative filesystem/device write volume and write amplification were **not
measured**. Retained history is intentional growth; this is not proof of a leak.

## Validation: cold and repeated

Backend requests: one cold and five repeated requests per fixture, same full
saved revision and rules. Warm results retain fresh admission and checked-at time.

| Workload | Cold baseline → final | Repeated median baseline → final |
| --- | ---: | ---: |
| Default 10v10 | 1,070.2 → 1,047.8 ms | 1,056.6 → 3.9 ms |
| Default 20v20 | 2,486.5 → 2,453.3 ms | 2,337.7 → 7.6 ms |
| Sydney 10v10 | 1,022.7 → 1,144.3 ms | 1,026.8 → 3.0 ms |
| Sydney 20v20 | 2,063.5 → 2,098.8 ms | 2,091.7 → 5.0 ms |

Sydney10 cold is +11.9%, missing the predeclared 10% limit in this single cold
sample. It is not discarded or turned into a pass. Other cold observations meet
that bound; every repeated backend result meets the <150 ms goal. A single cold
sample does not establish a distribution.

That adverse result prompted five additional fresh-process cold pairs, with
alternating AB/BA order declared before execution. Baseline cold times are
1,034.7, 1,030.6, 1,073.4, 1,112.2 and 1,014.2 ms; final times are 1,111.0,
1,116.0, 1,047.6, 1,032.2 and 1,040.7 ms. The five-sample median changes
1,034.7 → 1,047.6 ms (+1.25%), inside the unchanged 10% bound. All samples and
their order are retained. This supports the repeated cold median goal while
preserving the first single-sample miss and the limits of a small local study.

Actual-desktop Edge input-to-exact-review DOM, one cold and three warm samples
per 40-unit fixture, identical 1440×900 viewport/DPR1:

| Workload | Cold baseline → final | Warm median baseline → final | Warm change |
| --- | ---: | ---: | ---: |
| Default 40/120 | 2,626.3 → 2,570.5 ms | 2,694.2 → 464.6 ms | −82.8% |
| Sydney 40/80 | 2,148.4 → 2,132.0 ms | 2,165.7 → 170.0 ms | −92.2% |

Final warm samples are 473.9, 464.6 and 458.8 ms default; 170.0, 172.7 and
154.1 ms Sydney. Final request→response-start is 2,320.5 ms default cold /
9.9–11.2 ms warm, 2,035.6 ms Sydney cold / 8.1–9.7 ms warm. Response bodies remain
29,550 and 21,635 bytes, identical to baseline. The remaining interval includes
body transfer, frontend processing and DOM work; it is not all backend execution.
The browser clock runs from actual pointer input to the authoritative ready-heading
DOM mutation; the helper also asserts visibility and exact revision/hash. This is
not compositor paint or input-to-photon proof. The result is never shown complete
before its authoritative response.

Node helper start→visibility assertion is a different measure, including locator
actionability and automation scheduling. Default cold helper time worsened
3,113.3→3,755.5 ms (+20.6%); warm helper median improved 2,970.9→750.8 ms (74.7%).
Sydney helper cold was 2,773.9→2,231.3 ms and warm median 2,319.6→289.8 ms.
Those adverse/default helper results are retained, not substituted for or removed
from the input-based goal. The intermediate pre-refresh implementation measured
default cold/warm 2,678.6/482.4 ms and Sydney 2,271.3/171.5 ms on the browser clock;
its complete samples also remain archived.

| Active 40-unit review | Baseline elapsed / maximum source-arrival gap | Final elapsed / maximum source-arrival gap |
| --- | ---: | ---: |
| Default cached revision | 2,418.5 / 2,465.5 ms | 21.2 / 224.3 ms |
| Default genuinely cold revision | 2,470.9 / 2,472.6 ms | 4,373.0 / 281.6 ms |
| Sydney cached revision | 2,338.2 / 2,190.3 ms | 90.8 / 248.4 ms |
| Sydney genuinely cold revision | 2,179.3 / 2,212.3 ms | 3,515.1 / 257.6 ms |

All forty source positions move and the running revision stays frozen. Cold
active completion is slower because complete nominal analysis shares CPU with
durable live ticks. Its publication gaps now meet the 750 ms goal. The rejected
thread design, critic's 2.29–2.36 s gaps and browser-free contention diagnostics
remain in the archive; see [decision log](DECISIONS.md).

Six final Resume menu-operation→visible-state samples are 174.6, 237.0, 315.5,
279.3, 325.5 and 211.9 ms; baseline six range 279.4–426.2 ms. Those samples did not
reproduce the historical 5.22-second delay. The fresh second critic subsequently
measured a 5,179.6 ms Resume operation after lost Stop/reload/Return to active demo;
request start→response end was only about 75.8 ms. Most of that operation therefore
preceded request dispatch. Two further unchanged-source instrumented attempts
took 387.7 and 399.9 ms and briefly waited for synchronized authority. A dropped
status-refresh defect was independently established by deterministic regression
tests and corrected, but its responsibility for the original outlier is not
conclusively established. See the [decision log](DECISIONS.md).
Detailed browser input,
request/receipt and DOM marks remain in each raw result; menu automation is not
equivalent to backend acknowledgement latency.

For those same six Resume samples, final menu-item input→request dispatch is
15.8–40.1 ms; request start→response headers is 64.1–191.2 ms (includes backend,
local transport and scheduling).
Input→visible running state is 93.9–219.7 ms, and input→the probe's parsed-body
observation is 116–252 ms. Baseline ranges are 14.7–38.3, 71.6–187.4,
103.7–210.6 and 119–248 ms respectively; its separately measured network body
completion added 0.50–0.75 ms. Parsed-body observation includes Node
automation delay; a committed WebSocket update can reach the UI before that
observation. No server-only processing duration is inferred from network timing.

## Matched ten-minute moving 20v20 soaks

Actual-desktop baseline and final-source runs use the same default 40-unit fixture,
pane setup, viewport/DPR and twenty 30-second observations. Measured loop wall
durations are 610.548 and 610.386 seconds including sampling overhead. All forty
entities moved at every checkpoint. Closed totals include seed/setup/teardown;
the final run committed 62 more frames, so per-frame results are essential.

| Measure | Baseline | Final |
| --- | ---: | ---: |
| Whole-run committed frames | 3,206 | 3,268 |
| Logical frame payload | 790,434,789 B | 808,527,221 B |
| Stored frame payload | 790,434,789 B | 54,794,700 B |
| Logical B/frame | 246,548.59 | 247,407.35 |
| Stored B/frame | 246,548.59 | 16,767.04 |
| Normally closed DB | 795,824,128 B | 59,052,032 B |
| Closed DB B/frame | 248,229.61 | 18,069.78 |
| Normally closed WAL / SHM | 0 / 0 B | 0 / 0 B |
| Allocated / unused pages | 194,293 / 38 | 14,417 / 2 |
| Transport in measured loop | 470,576,549 B / 3,016 messages | 477,646,003 B / 3,046 messages |
| Uncollected JS heap range | 66.09–106.90 MB | 64.46–112.54 MB |
| Diagnostic-GC heap, pre-loop → final | 52.06→59.49 MB | 51.99→59.14 MB |
| Diagnostic-GC listener count, pre-loop → final | 1,257→1,291 | 1,259→1,259 |

Stored frame bytes per frame fall **93.20%**, closed DB bytes per frame **92.72%**.
Closed total DB is 92.58% smaller despite more committed work. Equal wall time
does not imply identical simulation work: first/last observed source ticks are
282/3,088 baseline and 300/3,133 final. Exact 20-simulated-second comparisons are
the short probes above, not these real-time closed totals.

Live DB/WAL/SHM components at the first and last observations are
26,001,408/4,408,432/32,768→782,106,624/5,038,792/32,768 B baseline and
2,424,832/4,185,952/32,768→56,795,136/4,247,752/32,768 B final. The baseline live
reporter used multiple reads without a shared transaction, so live boundary
deltas are approximate. Final SQL counts use a read-only snapshot; filesystem
stats are still separate instants. A later read-only reporter can recreate an
empty SHM file: that is distinct from the zero-WAL/SHM normal-close observation.

Both runs maintain one active WebSocket, at most two renderers (limit four),
twenty reopenings and a suspended hidden 3D render count. Pause, Resume, Stop all
twenty friendlies, continued hostile movement, Return to script and End pass.
Helper latencies baseline→final: Pause 659→525 ms; Resume 376→363 ms; Stop
845→583 ms; Return to script 1,380→528 ms; **End 993→2,968 ms**. End is an adverse
end-to-end helper sample without an input timestamp, not a measured backend-only
regression. Diagnostic GC is explicitly separate from natural heap observations.
Ten minutes supports bounded stability, not a lifetime leak-free claim. Both
runtimes stopped and deleted their disposable databases.

See [pacing](PACING.md), [provider accounting](PROVIDER.md), and
[verification decisions](VERIFICATION.md). No high average FPS overrides a
long-stall failure.
