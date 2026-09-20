# Display measurement method and retained candidates

All captures use actual-desktop headed Microsoft Edge 153.0.4234.48 on the
i7-10700K / RTX 3060 machine, physical 2560×1440 at 144 Hz. The measured default
viewport is 1440×900 CSS pixels, DPR 1. CSS 760/820/900 and larger emulated layouts
are layout evidence, not different physical displays. Native window enumeration
corroborates each task browser; browser screenshots show its actual content.
No task build, test suite or competing benchmark runs during these captures.

The unchanged threshold is mean >=60 FPS, compositor p95 <=16.9 ms, p99 <=33.4 ms
and zero intervals >50 ms over each 30-second window. Mean >=100 FPS is a stretch
target. One passing window is bounded evidence, not sustained-session proof.

The default current-source baseline and candidates use identical saved 10v10 and
20v20 plans, all entities moving, normal profiles/speeds, ±0.035° routes, pane
sequence, viewport/DPR and scripted camera/look controls. The Video overlay is
checked at both ends before exporting traces. The separate no-overlay windows
are diagnostic isolation only and cannot qualify a feature-complete pass.

## Interim matched candidate, before the final refresh correction

Each cell lists mean FPS / compositor p95 / p99 / maximum interval in milliseconds
and the number of intervals >50 ms. These results are retained even after final
source verification; they are not selected from repeated runs for a passing score.

| Workload and panes | Untouched current baseline | Candidate before refresh fix |
| --- | --- | --- |
| 10v10 Tactical | 139.55 / 7.072 / 13.913 / 41.636; 0 | 139.51 / 7.071 / 13.905 / 48.609; 0 |
| 10v10 ordinary 3D | 141.14 / 7.012 / 13.872 / 48.557; 0 | 141.35 / 7.014 / 13.876 / 48.621; 0 |
| 10v10 3D + Video | 139.78 / 6.996 / 13.922 / 41.684; 0 | 140.45 / 6.987 / 13.893 / 41.670; 0 |
| 10v10 Tactical + Video | 139.75 / 6.995 / 13.896 / 131.898; 2 | 141.11 / 6.996 / 13.898 / 41.656; 0 |
| 10v10 Video | 138.42 / 6.988 / 20.796 / 69.417; 1 | 139.61 / 6.987 / 13.917 / 76.399; 1 |
| 20v20 Tactical | 116.88 / 13.926 / 20.851 / 48.648; 0 | 118.78 / 13.917 / 20.842 / 48.654; 0 |
| 20v20 ordinary 3D | 135.92 / 6.993 / 27.723 / 83.340; 7 | 138.32 / 7.000 / 13.994 / 55.547; 1 |
| 20v20 3D + Video | 131.10 / 7.009 / 34.692 / 173.613; 10 | 131.39 / 13.805 / 27.775 / 180.521; 10 |
| 20v20 Tactical + Video | 133.29 / 13.893 / 20.854 / 124.984; 2 | 133.36 / 13.894 / 20.851 / 124.884; 3 |
| 20v20 Video | 133.72 / 6.995 / 34.710 / 62.551; 11 | 134.21 / 6.990 / 27.776 / 118.052; 8 |

Both runners exit 0, confirm 20/40 moving tracks, no page errors and zero provider
requests. That functional runner result does **not** mean the pacing thresholds
pass. In particular, several 20v20 combinations miss the strict stall criterion.
The final refresh-corrected source receives the complete matched pane run below.
The candidate table remains evidence, including its more favorable observations.

## Final reviewed source

All twelve final windows (ten feature-complete and two diagnostic) finished with
visible/focused DOM, native actual-desktop window 5378320, 30.0008–30.0100 second
browser windows, no page errors and zero provider requests. The runner confirms
twenty/forty moving tracks and accepts Pause/Resume/End. It exits 0 and its cleanup
receipt confirms stopped services and a deleted disposable database.

| Workload / visible panes | Mean FPS | Median ms | p95 ms | p99 ms | Maximum ms | >50 ms | Estimated missed 144 Hz slots | Strict pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10v10 Tactical | 137.18 | 6.945 | 13.881 | 13.908 | 55.549 | 1 | 327 | No |
| 10v10 ordinary 3D | 142.14 | 6.944 | 6.979 | 13.868 | 41.656 | 0 | 78 | Yes |
| 10v10 3D + Video | 139.35 | 6.944 | 6.983 | 13.925 | 69.420 | 3 | 187 | No |
| 10v10 Tactical + Video | 139.98 | 6.944 | 6.990 | 13.901 | 48.608 | 0 | 208 | Yes |
| 10v10 Video | 134.89 | 6.944 | 6.984 | 27.748 | 180.519 | 6 | 336 | No |
| 20v20 Tactical | 112.30 | 6.951 | 13.924 | 27.728 | 48.614 | 0 | 1,013 | Yes |
| 20v20 ordinary 3D | 136.35 | 6.944 | 6.988 | 20.808 | 90.314 | 11 | 260 | No |
| 20v20 3D + Video | 129.19 | 6.945 | 7.051 | 34.700 | 208.288 | 17 | 503 | No |
| 20v20 Tactical + Video | 127.93 | 6.945 | 13.906 | 20.870 | 166.665 | 9 | 769 | No |
| 20v20 Video | 131.22 | 6.945 | 7.026 | 34.715 | 166.681 | 17 | 463 | No |

Baseline medians in the same row order are 6.945, 6.944, 6.944, 6.945, 6.944,
6.949, 6.944, 6.945, 6.945 and 6.944 ms; estimated missed slots are 213, 104,
185, 206, 212, 857, 260, 449, 534 and 387. The matched baseline mean/p95/p99/max
and stall counts are in the preceding table. **Three of ten final feature-complete
windows pass**, versus four baseline and five intermediate. This is not a display
performance improvement claim. In particular, final Tactical20 average is lower
than baseline (116.88→112.30 FPS) and several final tail intervals are worse.

The diagnostic 3D+Video windows with overlays disabled have final mean/p95/p99/max
137.65/6.978/13.926/229.136 ms at 10v10 (five >50 ms) and
135.09/6.988/20.855/187.513 ms at 20v20 (ten >50 ms). These are excluded from
acceptance; features were enabled in every feature-complete row. Stalls persisting
without overlays do not exonerate all overlay work or identify a GPU defect.

| 20v20 pane window | Recorded-at→arrival age median / p95 / p99 / max | Maximum source-arrival gap |
| --- | --- | ---: |
| Tactical | 57 / 128 / 150 / 178 ms | 275.2 ms |
| Ordinary 3D | 57.5 / 108 / 146 / 173 ms | 282.5 ms |
| 3D + Video | 61 / 119 / 240 / 270 ms | 421.1 ms |
| Tactical + Video | 80 / 172 / 280 / 292 ms | 365.6 ms |
| Video | 71 / 132 / 190 / 193 ms | 372.2 ms |

There are 149–153 source arrivals per final window. Final 10v10 age p95 ranges
52–120 ms, p99 64–219 ms; maximum arrival gap ranges 234.7–395.8 ms. The raw
summary preserves every count, percentile, simulation-clock age and arrival.
Post-window command helper→accepted-response times are Pause/Resume/End
233.6/180.4/290.5 ms at 10v10 and 528.0/307.1/521.0 ms at 20v20. These include
menu automation and are not backend-only timing or input-to-photon measurements.
Separate actual-pointer/dispatch/receipt/DOM measurements are in [PERFORMANCE](PERFORMANCE.md).

Publication freshness must not imply simulation/wall-clock synchronization. In
pane order Tactical, 3D, 3D+Video, Tactical+Video, Video, baseline simulation-clock
age medians are 4.119, 4.964, 5.929, 8.690 and 10.343 seconds; final medians are
3.564, 4.201, 5.186, 7.411 and 8.823 seconds. Final maxima reach 9.204 seconds
(baseline 11.015). This is wall arrival minus effective simulation timestamp,
including the preserved fixed-step/no-catch-up behavior and earlier lifecycle
timing. It is distinct from the 57–80 ms median publication ages above. The
sequence is fixed-order with one main window per configuration; it cannot isolate
the refresh correction as the cause of worse final pacing or estimate a stable
distribution across repeated sessions.

Clipped CPU profiles show substantial MapLibre and Cesium work, but do not tie
the longest compositor gaps to a single correctable JS function. For the 208.288
ms combined20 gap, self samples associate 138.427 ms with idle, 55.103 ms with
native program work, and about 1–2 ms each with several JS/DOM functions. The
largest rAF interval anywhere in that window is only 62.4 ms. The final Video20
166.681 ms compositor gap similarly has 113.743 ms idle / 40.710 ms program while
the entire window's rAF maximum is 14.3 ms. These associations leave GPU, compositor,
driver and OS scheduling unresolved; they do not justify blaming backend
serialization, React, GC or a specific renderer function. No speculative renderer
rewrite, visual reduction or source-cadence change was made to obtain a pass.

## Interpretation and limitations

`Display::FrameDisplayed` events within the CDP before/after timestamps supply
compositor intervals. rAF intervals are recorded separately and do not substitute
for presentation. Estimated missed 144 Hz slots sum rounded excess intervals;
they are not exact driver drop counts or measured input-to-photon latency.

CPU profiles start before tracing and finish after trace collection. Attribution
must clip CPU samples to the same before/after timestamp window; whole-profile
totals include setup/export and overstate measured-window work. The initial
unfiltered diagnostic summary is explicitly retained as such. Sampling, tracing
and configured-request interception add unquantified overhead, used consistently
for each matched pair. Main-thread native/idle samples cannot establish a GPU,
driver, compositor or operating-system cause.

Recorded-at-to-arrival source age is a local wall-clock difference. Arrival gaps,
simulation-clock age, command/request/receipt timestamps and pointer-to-two-rAF
response are separate measurements. They must not be relabelled as authoritative
observation age, backend-only execution, or physical input latency.

Source/renderer ownership, visual quality, overlays, cadence and camera semantics
are unchanged. A speculative renderer rewrite is not justified by averages or
one unidentified compositor stall. Strict display acceptance remains open.

Configured provider evidence, when available, is a bounded final configuration
check rather than a matched configured before/after comparison. Its shared
request/time limits and consumption are governed by [the provider ledger](PROVIDER.md).
