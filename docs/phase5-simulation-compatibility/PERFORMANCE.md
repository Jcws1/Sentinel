# Resource and foreground measurements

Predeclared workloads/budgets are in [PLAN](PLAN.md). All provider requests are
disabled. Sparse and bounded dense measurements are distinct. Cold samples are
reported separately from three repeated samples; normal-close database size is
separated from live DB/WAL/SHM and decoded logical retained bytes.

The first Phase5 candidate sparse10k run, before removal of a redundant completion
world, took10.30–10.92s across four samples, retained42,151,936bytes after normal
close and exhibited9.36–9.88s event-loop gaps. These are initial Phase5 candidate
measurements, not the pre-Phase5 D7 baseline. The matched final results follow.

## Final isolated service probes

All seven workloads completed four runs (one process-cold, three repeated with a
fresh database per run). Every child exited 0 and removed its database. Timings
include validation, durable preparation, resolution and completion. Each workload
uses its own process; repeated samples benefit from imports/allocator warmth, not
a stored-response idempotency shortcut. Memory is the parent-sampled process peak,
not just Python allocations. No diagnostic GC is used.

| Workload | Input rows / timestamps | Output pairs | Cold ms | Repeated median ms (range) | Max event-loop gap ms | Peak RSS MB | Closed DB bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Golden | 2 / 1 | 1 | 48.91 | 39.97 (39.79–40.70) | 48.61 | 59.68 | 167,936 |
| Default 40 | 80 / 2 | 116 | 197.18 | 183.97 (176.76–215.14) | 214.98 | 68.57 | 589,824 |
| Sydney 40 | 80 / 2 | 116 | 173.33 | 163.02 (160.31–171.57) | 172.79 | 69.41 | 589,824 |
| Sparse 10,000 | 10,000 / 1 | 0 | 6,456.63 | 6,549.26 (6,428.12–6,586.90) | 5,669.62 | 544.98 | 22,765,568 |
| Dense 50 | 50 / 1 | 625 | 328.43 | 358.54 (338.26–362.99) | 362.81 | 83.85 | 1,728,512 |
| Dense 100 | 100 / 1 | 2,500 | 1,084.71 | 1,076.92 (1,059.50–1,080.55) | 1,084.20 | 129.40 | 6,295,552 |
| Dense 200 | 200 / 1 | 10,000 | 4,402.91 | 4,327.58 (4,295.06–4,341.29) | 4,221.18 | 320.41 | 24,563,712 |

The ordinary golden/40-row workloads meet the <1s repeated service goal; sparse
10k meets 30s/2GiB diagnostic goals. The bulk completion transaction still causes
multi-second gaps. Those are measured limitations of a batch integration,
not a responsive concurrent-streaming guarantee. Dense 25 million pairs/snapshot
and 100 million input rows were not attempted or certified. Outputs are not capped.
Browser localStorage quota can refuse large UI batches before submission; the
external endpoint retains the contract input limits and exact response shape.

## Matched initial-candidate comparison and storage attribution

The four before/after sparse 10k request SHA-256 values and exact external response
SHA-256 values match. Both retain 10,000 input health rows, one authoritative sample
and two audit events. Joining the completion event to that sample removes one
redundant control-world copy (3→2 total frames), without dropping a source sample,
changing cadence, weakening durability or changing the frozen output.

Repeated median latency falls 10,432.92→6,549.26ms (37.2%). Normal-close retained
size falls 42,151,936→22,765,568 bytes (46.0%), or 4,215.19→2,276.56 bytes/input row.
Decoded logical frame content falls 38,744,353→19,374,045 bytes because the duplicate
world is absent. This is a Phase 5 candidate optimization, not a new D7 baseline
claim. There is no simulated-duration rate for a one-snapshot batch.

| Workload | Frames / events | Closed bytes/frame | Closed bytes/input row | Live DB / WAL / SHM bytes |
| --- | ---: | ---: | ---: | --- |
| Golden | 2 / 3 | 83,968 | 83,968 | 4,096 / 267,832 / 32,768 |
| Default 40 / Sydney 40 | 3 / 158 | 196,608 | 7,372.8 | 4,096 / 700,432 / 32,768 |
| Sparse 10k | 2 / 2 | 11,382,784 | 2,276.56 | 22,765,568 / 23,072,032 / 65,536 |
| Dense 50 | 2 / 627 | 864,256 | 34,570.24 | 4,096 / 1,845,792 / 32,768 |
| Dense 100 | 2 / 2,502 | 3,147,776 | 62,955.52 | 6,295,552 / 6,439,592 / 32,768 |
| Dense 200 | 2 / 10,002 | 12,281,856 | 122,818.56 | 24,563,712 / 24,814,792 / 65,536 |

All final WAL/SHM sizes are 0 after normal close. Figures include SQLite's fixed
schema/page allocation, journal, raw/canonical request, response and run data;
they are not just compressed frame sizes. Snapshot wall durations are in the
latency table; 40-unit cases supply two observations 1s apart (80 rows), not continuous
motion sampling. Physical cumulative writes/write amplification are not measured.
No VACUUM or altered checkpoint lifecycle is used to claim the gain.

The second critic independently repeated Sydney 40 (four samples 158–179ms,
116 pairs, 589,824 retained bytes). This reproduces the ordinary batch result within
normal machine variance. Complete raw stage timings, hashes, memory counters,
page counts and component sizes are retained in the external evidence archive.

The foreground environment is an i7-10700K (8cores/16threads), RTX3060 driver
32.0.16.1088, Edge153.0.4234.48. Physical display metadata reports2560×1440 at144Hz.
Browser viewport1440×900 and DPR≈1 are layout settings, not physical1440p evidence.
Native Windows window enumeration/activation establishes the actual desktop
browser; screenshots are captured from that browser. Native accessibility capture
is not claimed. UI/display measurements have no competing task tests/builds.

Initial resumed Sydney20v20 probe: all40 tracks moving and isolated from an
external40 submission;23 arrivals over4.91s, maximum gap303.289ms, input-to-visible
submission helper2315.356ms (includes opening/filling/submitting/review).
A subsequent10.041s Tactical grid window recorded829 compositor presentations,
82.56FPS, median13.842ms/p9520.899ms/p9927.814ms/max41.634ms, zero>50ms stalls and
four conservatively estimated missed60Hz frames. This short diagnostic does not
establish sustained display acceptance. The harness then failed because it asked
for the obsolete exact menu label `End`; the visible item is `End demo`. Its
failure, screenshot, raw intervals and successful service/database cleanup remain.

No configured-content or Video measurement is attempted in this phase. No request
budget is reset. Maximum-size dense combinations, cumulative device writes and
long-duration stability remain unverified unless explicitly measured below.
