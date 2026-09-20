# Current-source baseline

Start: 2026-09-20 07:25:06 UTC. HEAD:
`6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`. The tree was clean. The task preserved
599 source files and inventoried 437 original database artifacts without opening
them. All 193 production files match the prior performance critic's final source
inventory; the previous report's timings still require fresh matched measurement.
No checkout reset or older committed implementation was used as this baseline.

Machine: Intel i7-10700K (8 cores / 16 logical processors), RTX 3060, driver
32.0.16.1088, physical 2560×1440 display at 144 Hz; Edge 153.0.4234.48, Node
24.20.0, Python 3.10.11. Display captures use explicitly launched native-desktop
Edge, fresh contexts, 1440×900 CSS viewport and DPR 1 unless labelled otherwise.
760/820/900 and larger layout emulations do not certify a different physical
display. Existing listeners/processes were inventoried; task ports were free.

## Retained attempts

| Probe | Untouched-source observation |
| --- | --- |
| Historical 5v0 case alone | Pass, test 18.3 s |
| All four group cases (5v1, 5v5, 10v10, 5v0) | 4 pass, 42 s total |
| Default 40/120 backend review | Cold 2486.463 ms; five-repeat median 2337.720 ms |
| Sydney 40-unit backend review | Cold 2063.493 ms; five-repeat median 2091.721 ms |
| Default foreground Validate | Cold pointer→review DOM 2626.3 ms; three-repeat median 2694.2 ms |
| Sydney foreground Validate | Cold 2148.4 ms; three-repeat median 2165.7 ms |
| Active-run complete review/refusal | Default source gaps 2465.5 / 2472.6 ms; Sydney 2190.3 / 2212.3 ms |
| Six Resume samples | Menu automation→visible 279.4–426.2 ms; actual input→receipt body 119–248 ms |
| Sydney forty-unit durable ticks, two 100-tick runs | Medians 77.059 / 78.274 ms |
| Ten-minute moving 20v20 | All 40 moving at each 30 s observation; one active transport; pool ≤4 |
| Whole soak recording, including setup/teardown/fixtures | 3206 frames, 790434789 logical frame bytes; normal-close DB 795824128 bytes, WAL/SHM 0 |

The historical 5v0 destination refusal and 5220.5 ms Resume sample have not been
reproduced by these short checks. They remain adverse evidence with unresolved
attribution. Passing repeats are not a correction or proof of flakiness. The 5v0
test now retains the picked request, response and before/after camera state while
keeping its assertions, geographic rejection and timeouts unchanged.

The first blank-grid pacing attempt completed eight 30 s captures, then failed
its end-overlay assertion as the selected Video subject reversed direction.
The probe used the shorter route and inspected state after collecting a large
trace. Its raw timing remains retained. Subsequent matched captures use the
already supported longer route and inspect the true window end before trace
export; this is a measurement correction, not a renderer fix. High averages in
the first attempt coexisted with >50 ms compositor stalls.

The soak was approximately ten minutes of observed active work plus setup,
resource sampling and teardown. Its whole-run totals are not the old D7
611-second footprint, and a raw combined DB/WAL length is not cumulative writes.
The first live reporter did not hold a multi-query read snapshot; its boundary
deltas are approximate. Normal-closed measurements are coherent. See the
[decision log](DECISIONS.md) for the corrected reporter and normalization.

Native desktop enumeration/accessibility established a task browser window.
Native screenshot capture failed with an unsupported Windows interface; browser
screenshots remain available. No configured provider request was made by these
baseline grid/validation/soak probes. The original failed browser report and
request-budget Video attempt remain in their historical archives.
