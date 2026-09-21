# Independent critic review — candidate 18

The candidate-18 review is complete; acceptance remains withheld. This report
continues the severity-ranked findings in `CRITIC-4.md` and `CRITIC-5.md`.
The critic made no product or tracked-test changes. All native work ran with
exclusive CPU/UI ownership, fresh task storage and zero external providers.

Product identity: 439 files, manifest SHA-256
`c2190ad183ef46b442e8ec8eb66f3ae89cc9385322c0f99ea30fff85b300d92d`.
The critic independently rehashed every product file after execution: all match.
The critic's six-file focused run passed **52/52, exit 0**. The implementer's
reported full frontend/static/build results remain supplied evidence, distinct
from those personally executed checks.

## Closed P2 — narrow tooltip values

The compact formatter in `profileSeries.ts` retains original observation context,
renders distance and altitude on separate unit-labelled lines, and leaves raw
backing values and identities untouched. Its precision matches numeric
inspection. The critic read the formatter and independently ran its tests.

`critic-two-pane-control-candidate18-setup-a` completed, exit 0. All six screenshots
were personally inspected. The exact previously failing 260 px pane now shows
the complete source UTC, altitude reference and both numeric lines. The critic
then dragged the real divider: recorded Command Picture width increased from
260 to 514 px, and the wider tooltip was also readable. Unlike candidate 17's
attempt, this widening is demonstrated by measured bounds.

The critic hovered and clicked an actual rendered marker using freshly acquired
pixel coordinates. Shared selection, Tactical and existing photo/Details agreed;
the command-write delta was zero. The same checks and readable narrow/wider
captures succeeded again after the timed control. This closes the reproduced
tooltip defect for the tested layout; arbitrary longer labels were not certified.

## P2 — 60 Hz scheduling produces slower standalone chart motion

Relevant candidate-18 source: `frontend/src/features/analytics/chartMotion.ts`,
the accumulated `1000 / 60` deadline. Actual-clock sampling, bounded queued work,
final/trailing updates and generation/disposal checks remain intact, but the
changed cadence does not satisfy the existing moving-display target.

The critic's independent sampler now starts/stops the bounded verification-only
per-chart capture inside its page sampling interval. It preserves raw motion
callback and ECharts `rendered` timestamps, reports each chart separately, and
rejects overflow. ECharts render callbacks describe canvas rendering, not final
physical presentation; Chrome compositor events remain a separate measurement.
No capture overflow occurred. No map FPS is substituted for chart cadence.

`critic-standalone-candidate18-a` completed both original 30-second windows,
exit 0. Both complete plots were personally inspected. All 40 entities moved,
native foreground continuity passed and no map was visible during these windows.

| Standalone configuration | Compositor FPS | Compositor p95 ms | Compositor p99 ms | >50 ms | Chart rendered events/s | Chart render p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current Profile | 59.122 | 23.517 | 31.084 | 8 | 58.558 | 23.5 |
| Profile with available 120s-range history | 59.384 | 23.975 | 31.540 | 4 | 58.852 | 24.5 |

Motion callback rates were 55.23/54.99 per second. Both rendered and compositor
evidence fail the sustained 60 FPS/p95 ≤16.9 ms target. The history range was
requested as 120 seconds; the recording was younger and the screenshot shows
387 available plotted observations, not a claim that a complete 120 seconds
existed. Hiding the document disposed charts and stopped reads/computations;
restoration worked. Authoritative End and isolated cleanup completed.

## P2 — combined Profile cost remains above budget

`critic-two-pane-control-candidate18-a` retained the exact Sydney 40-unit,
90-source-second warmup, four-ID selection, overlays, cameras, equal map/pane
bounds and four 30-second windows of the earlier controls. All geometry,
visibility, movement, selection and native continuity assertions passed.

| Candidate-18 configuration | Compositor FPS | p95 ms | p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert before | 117.993 | 15.399 | 16.002 | 1 | 243 |
| Two current Profiles | 89.778 | 23.270 | 30.976 | 1 | 284 |
| Two Profiles with 60s history | 76.486 | 30.547 | 45.631 | 8 | 296 |
| Inert after | 115.032 | 15.370 | 16.033 | 2 | 282 |

Current p95 increments are **+7.871/+7.900 ms** against the two controls, above
the unchanged +5 ms allowance. History increments are **+15.148/+15.177 ms**.
Both configurations also exceed the +10 ms p99 allowance against both controls.
The inert long-frame failures remain explicit and do not explain away those
incremental misses.

Direct chart capture exposes a worse motion experience than the whole-workspace
FPS suggests. The two current charts render at **51.26/51.19 events/s**, each
with **36.6 ms p95** intervals. With history, they render at **46.59/46.56 events/s**
with **44.0/43.4 ms p95**. These measurements make the 60 Hz experiment unsuitable
as a performance correction: map presentation masks slower chart motion, while
the incremental budget still fails.

The critic recommends reverting that scheduling experiment while retaining the
verified tooltip correction. A final bounded chart-owned correction may be
reviewed, but cannot receive credit before measurement. Public current-marker
graphics would require real-library and native verification of axis bounds,
interpolated positions, exact identity, source-order changes, tooltip freshness,
history isolation, resize/projection ordering and disposal. Invisible bounds
must never become purported observations, selectable targets or metric counts.
No renderer, recording cadence, source semantics, budgets or retained samples
may be weakened to obtain a pass.

## Resource evidence and cleanup

The control's history was ready in 2,366 ms and retained 301 observations. It made
40 reads over the enclosing 40.743-second counter interval, with 30 inside the
30.594-second trace. Current/inert windows made no history request; one mission
stream remained one. These counter and trace denominators are distinct.

The critic personally inspected the four timed screenshots and all three pointer
captures, in addition to six setup and two standalone screenshots. The control
completed with exit 0, zero providers/page errors and zero capture overflow.
Final hidden state contained zero charts and zero canvases. Authoritative End,
service shutdown and task-database deletion were confirmed for every run. No
CPU profile was added; the diagnosis was already bounded and sufficient.

Exact probes, source manifests, raw traces/timestamps, results, screenshots and
cleanup receipts are retained in the named evidence directories. CPU/UI was
returned before implementation resumed. Execution completion is not performance
acceptance. Final-source UI/matrix/large-workload/browser gates and fresh final
review remain open; Phase 5 and inherited compatibility/display gaps are unchanged.
