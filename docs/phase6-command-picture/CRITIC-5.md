# Independent critic review — candidate 17

This continues the independent review in `CRITIC-1.md` through `CRITIC-4.md`.
It is not final acceptance. The critic did not implement product code. Execution
was exclusive: the implementer did only lightweight source/documentation work
during the native samples. No test, build or other benchmark competed with them.

## Reviewed identity and focused correctness

Candidate 17 contains 439 product files. Manifest SHA-256:
`cfb7920107d9cca51b748a44e4bd080c0fc7bee030670e1240d98081be4a8de7`.
After the measurements, the critic independently hashed all 439 files and found
zero mismatches. The implementer supplied full frontend/static/build results;
those are distinct from the critic's own six-file **51/51 focused tests, exit 0**.

The critic read the primitive Profile tuple implementation and its real-ECharts
tests, then ran those tests independently. Public named dimensions preserve the
opaque entity ID, original observation/context label, raw distance and altitude,
selection size and affiliation colour. `encode.itemId` and `encode.itemName` have
actual-library coverage; picking resolves the explicitly named `entityId`
dimension, rather than assuming an arbitrary tuple slot. The default tooltip
includes only distance and altitude dimensions. The real-ECharts SVG check
confirms stale/unobserved alpha 0.45, and verifies that explicit series opacity 1
does not multiply it by ECharts' default 0.8. Correction, removal and later motion
patches preserve IDs and metadata. Primitive data avoids per-item option models.

The ineffective candidate-16 extra canvas/dirty-rectangle experiment was removed.
The zero-inclusive signed bars, semantic option reuse and compact axis title
remain. There are no source, recording, history retention or simulation changes.

## P2 — combined Profile performance remains above the declared budget

Relevant candidate-17 path: `frontend/src/features/analytics/VerticalProfile.tsx`
lines 226–232, `onMotion` calls ECharts `setOption` for the current series. The
public tuple representation reduces part of the previous cost, but it does not
remove the measured material incremental defect.

The critic operated native foreground Edge using fresh task storage and blocked
all nonlocal providers. `critic-two-pane-control-candidate17-setup-a` completed,
exit 0, and its five screenshots were personally inspected. The subsequent
`critic-two-pane-control-candidate17-a` used exactly the earlier bounded control:
Sydney 20v20, 90 seconds of source warmup, identical four-ID shared selection,
filters, overlays and fixed-origin 10 km cameras; two inert panes bracket two
current/history Profiles. All four timed windows remained 30 seconds.

Tactical bounds remained 436 × 637.714 CSS px and ordinary 3D remained
260 × 637.714 CSS px. Each supporting pane remained 260 × 637.714 CSS px. Both
maps retained all 40 projected identities inside the required inset, and both
plots were fully visible. Every before/after native focus, geometry, selection
and 40-unit movement assertion passed. Native compositor evidence uses the
configured 1280 × 700 CSS viewport/DPR approximately 1 on the physical display;
it does not certify full-resolution/native-DPR 2560-pixel rendering.

| Candidate-17 configuration | Mean display FPS | p95 ms | p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert panes before | 118.216 | 15.137 | 16.002 | 1 | 270 |
| Two current-only Profiles | 79.711 | 23.999 | 37.273 | 2 | 287 |
| Two Profiles with 60s history | 74.389 | 30.492 | 38.161 | 5 | 297 |
| Inert panes after | 117.020 | 15.191 | 16.019 | 4 | 298 |

Current-only p95 increments are **+8.862/+8.808 ms** against the before/after
brackets, exceeding +5 ms. History increments are **+15.355/+15.301 ms**.
Both also exceed the +10 ms p99 allowance against both controls. The absolute
long-frame budget remains a non-pass even in these inert windows; this does not
erase the demonstrated incremental p95/p99 failure. Mean FPS cannot certify
pacing. This control supports a chart-workspace contribution independently of
map-area or selection changes; it does not assign every tail to one function.

History readiness was 2,457 ms, and the retained count was 301. Across both
Profiles, the sampled counter interval recorded 136.81 motion and 10.16 full
updates/s current-only, versus 127.56 motion and 11.93 full updates/s with history.
These are update callbacks, not direct measurement of every visible chart paint.
History made 39 requests during its enclosing 40.242-second counter interval;
30 fall within the 30.547-second trace interval. These distinct denominators
remain explicit. Inert/current windows made no history read, and the one mission
stream did not multiply when charts opened.

Two separate ten-second CPU profiles followed every acceptance-length window.
They have profiler overhead and are diagnostic only. Current/history samples
attribute approximately 2,315/2,320 ms inclusive to the chart update loop and
1,631/1,668 ms to a nested ECharts update path; these overlapping times must not
be added. Paint-list work is approximately 425/431 ms. MapLibre `_render` is
approximately 2,827/2,585 ms and Cesium render 1,180/1,061 ms. Raw profiles and
summaries are retained. The results establish remaining chart update cost, not
a complete causal decomposition of each frame tail.

Suggested correction is bounded chart-owned work reduction, retaining source,
samples, geometry, identity, final/trailing actual-time presentation and the
existing pacing budgets. Any cadence change requires standalone Profile painted
cadence evidence: maps' compositor FPS cannot conceal a slower Profile. At a
display cadence near 128 Hz, an accumulated 60 Hz paint target may alternate
two/three display ticks, so its mean alone cannot satisfy p95 ≤16.9 ms.

## P2 — the confined native tooltip clips its numeric values in a supported split

Relevant candidate-17 path: `frontend/src/features/analytics/profileSeries.ts`
line 47 uses the default two-column tooltip for distance/altitude; `ChartHost.tsx`
sets a confined rich-text tooltip. In a 260 px Profile pane (approximately
196 px available chart width), hover the rendered Friendly 01 marker after
filtering to that identity. The tooltip is wider than its canvas: the distance
number clips at the right edge, and the altitude value is entirely outside the
visible region. Entity label, source timestamp and datum remain visible.

The critic reproduced and personally inspected this twice, in
`tuple-rendered-tooltip.png` from both candidate-17 native runs. Numeric
inspection remains an available workaround; the requested readable tooltip is
not satisfied in this supported split. A compact rich-text formatter with
separate unit-labelled numeric lines and bounded precision is a narrow remedy.
It must retain original context, raw backing values and exact selection identity.

An additional screenshot is named `tuple-rendered-tooltip-wider.png`, but closing
the 3D pane gave its width to Tactical rather than Command Picture. The Profile
remained narrow. That screenshot is **not** a successful wider-layout validation
and cannot be used as one. No missing-data inference is needed: the actual
ECharts formatting tests contain both values, while the native screenshot
demonstrates clipping.

## Native picking, evidence and cleanup

After all timing/CPU windows, the critic found an actual marker from canvas pixels,
reacquired its position immediately before hover/click, and recorded coordinates
and timestamps. Clicking selected the exact entity in shared selection, Tactical
and existing photo/Details presentation. The observed command-write delta was
zero. The critic personally viewed the four timed screenshots and all three
pointer captures, in addition to the setup images.

The run completed with process exit 0 and no external-provider attempts or page
errors. This means execution completed, **not** that performance passed. Final
hidden state had zero charts and zero canvases; authoritative End completed,
services stopped, and the task database was deleted. The source identity receipt,
full result, raw traces, CPU pair, screenshots, isolated-storage cleanup and
process exit are retained under the named evidence directories. CPU/UI ownership
was returned before the implementer's next change.

Final-source full browser, full foreground matrix/large-fixture regression and
fresh review are still required after further material changes. The prior
candidate-15 complete 96-window run remains valid historical evidence with its
12 incremental and two input non-passes; it is not certification of candidate 17.
Overall Phase 6 acceptance remains withheld. This does not alter the separately
deferred Phase 5, external-conformance, inherited D7 or configured-Video gates.
