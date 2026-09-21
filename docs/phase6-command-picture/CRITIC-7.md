# Independent critic review — candidate 19

Candidate 19 acceptance remains open pending its complete performance and final
regression gates. Initial native setup appeared to expose a tooltip regression;
the follow-up below identifies screenshot-induced pointer relocation and closes
that product suspicion without a source change. Earlier candidate performance
results remain historical evidence. This report extends `CRITIC-6.md`.

Product identity: 440 files, manifest SHA-256
`ea04d99ac376a6d17a60e9797488678dd2e4361a21e30aadf4225f7b755f8307`.
The critic independently executed **56/56 focused checks in seven files, exit 0**.
Full frontend/static/build results supplied by the implementer remain separate
from the critic's personally executed checks. No product or tracked test was
edited by the critic.

## Initial P2 suspicion — resolved as capture interference

Relevant candidate-19 source: `frontend/src/features/analytics/profileLayer.ts`,
lines 62–71 and 128–139. The public graphic hover handlers dispatch `showTip`
against a zero-size backing scatter item. In the actual native canvas browser,
neither the narrow nor widened pane displays the expected tooltip.

Reproduction: run the fresh native Sydney 40-unit setup, open Command Picture
Profile, filter to Friendly 01, acquire its rendered blue marker coordinates,
then hover. The critic's evidence directory is
`frontend/test-results/phase6-command-picture/critic-two-pane-control-candidate19-setup-a`.
`tuple-rendered-tooltip.png` shows a bare marker in a measured 260 px pane;
`tuple-rendered-tooltip-wider.png` shows a bare selected marker after an actual
divider drag widened the pane to 514 px. Both images were personally inspected.

The first hover used freshly measured coordinates `(943.767, 369.355)` and its
capture followed about 154 ms later. A separate fresh direct click at
`(946.370, 369.366)` selected the exact original Friendly 01 identity in shared
selection, both maps and the existing photo/Details panel. The write delta was
zero. The wider hover used freshly acquired `(899.265, 298.951)` coordinates.
The native Win32 foreground PID matched the task browser. Thus selection works,
but the required readable hover inspection regresses; this is not a passing
tooltip test merely because the setup process exits successfully.

Impact: users cannot inspect current rendered values and source context by
hovering the Profile. Accessible numeric inspection remains available. The
SSR layer test replaces `dispatchAction` with a spy and therefore proves the
requested action, not browser tooltip rendering. The correction needs a real
browser assertion/capture for dispatch, value freshness, resize, identity
replacement and disposal. It must preserve exact identity, current sampled
values and the compact unit-labelled formatter. No private ECharts metadata
mutation or weakened hover assertion is justified.

The preceding impact was the initial interpretation of setup A, not a remaining
confirmed product defect. Setup B retained the same failure and exited 1, but
its 25 ms canvas samples proved that both tooltips initially rendered. The light
background reached approximately 21,400 pixels, then vanished immediately after
DOM pointer events jumped from the commanded marker coordinates to an unrelated
fixed native position around `(929, 376)`. This occurred at each Playwright
screenshot. In the wide case the frame identity and full-update count stayed
unchanged across disappearance, which rules out a new full projection as that
instance's cause. Focus, visibility and native foreground PID remained correct.

Fresh setup C changed only the evidence capture to direct CDP
`Page.captureScreenshot`, retaining the same viewport, source, post-capture
pixel assertion, pointer operation and timing policy. It passed, exit 0.
Narrow/wide post-capture light counts were **21,438/21,418** through five/four
authoritative frame identities. The narrow monitor includes one post-hover
zero-light sample at wall time `1789948918616`, between visible samples at
`1789948918589` and `1789948918648`, with frame `3a27f651…` and update count 94.
No pointer movement accompanies it. Its exact duration and cause are unknown;
the sampled upper interval is 59 ms. This is a retained minor transient, not
proof of uninterrupted tooltip paint. The critic initially overstated this as
all post-hover samples remaining visible and corrected that statement after
the implementer identified the zero in the same raw evidence. The wide monitor
has no post-hover zero. No unexpected pointer movement, focus loss, visibility
change or viewport change occurred. The critic personally read the captures:
original entity/source/datum and both unit-labelled numeric lines are readable;
distance and source time advance. Actual selection still agrees with maps and
Details with zero commands. End, zero hidden charts/canvases and cleanup pass.

The native surface PNG is 2240×1225 while the configured CSS viewport remains
1280×700 on this Windows-scaled display. Direct capture avoids Playwright's
preparation/reset interaction; it does not change the rendering configuration.
The initial classification is therefore withdrawn as a product defect. Setups
A/B, their screenshots, failed assertion and instrumentation remain preserved,
alongside C's successful evidence. None is silently relabelled as a pass.

After that native capture investigation, the implementer's new real-canvas
browser regression reproduced a **distinct P2 tooltip ownership/placement
failure**: initial tooltip presence passes, but a 0.25 px pointer move inside
the marker makes the next presence assertion fail on unchanged C19. That result
is supplied evidence until the critic independently repeats the operation;
stationary-hover setup C does not contradict or certify that behavior. A narrow
correction and fresh independent native nudge test are required. No broader
performance change follows from this tooltip finding.

## Personally verified scope and limits

The critic read the layer ownership, interpolation envelope, ChartHost ordering,
tooltip reset and public-API calls. The two invisible axis-envelope points are
not included in observations, aggregates or selection. The ordinary linear
latitude/longitude interpolation bound is conservative, including the retained
180-degree-crossing case. Synchronous projection/resize followed by layer paint
prevents painting new samples through a deliberately deferred old axis model.
Focused real-library checks cover exact opaque identities, reordering/removal,
same-ID mission resets, resize, stale unchanged shapes, disposal and axis bounds.
They do not replace native pointer verification.

Native current marker selection and narrower/wider rendering were personally
verified. Native historical-line hover has not been verified and is not claimed
from its formatter or line-event configuration. Source-gap, Pause/End, complete
UI, standalone, matched control, large workload, 96-window matrix and final
browser checks still require final-source completion.

## Retention and cleanup

The setup's `result.json` says `passed: true` because tooltip visual inspection
is manual; this report records the actual UI non-pass explicitly. All screenshots,
coordinates, source/probe copies and process receipts are retained. It recorded
zero provider requests/page errors, zero final charts/canvases, authoritative
End and an empty active entry. Services stopped and the task database was deleted.
The critic returned exclusive CPU/UI ownership before correction began. No
operator database, recording, preference, credential or unrelated work changed.

## Candidate-19 standalone measurements

`critic-standalone-candidate19-a` completed, exit 0, with two original 30-second
windows and direct per-chart motion/rendered capture. Both complete plots were
personally inspected. All 40 entities moved; no map was visible. Native focus
and visibility continuity passed, with zero provider requests/page errors or
capture overflow.

| Configuration | Compositor FPS | p95 ms | p99 ms | >50 ms | Chart rendered events/s | Chart rendered p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current Profile alone | 108.444 | 15.525 | 23.538 | 7 | 113.360 | 15.6 |
| Profile with available 120s-range history | 106.517 | 15.542 | 30.597 | 5 | 112.776 | 15.6 |

Motion callbacks were 107.861/105.977 per second. These sustained-rate and p95
results remove the representative 60 Hz experiment's regression; **the absolute
zero-long-frame gate still fails**. Chart-render callbacks themselves include
four/one intervals over 50 ms. Compositor delivery and canvas render callbacks
remain distinct measurements; neither hides the other's tails.

History became ready in 1,455 ms. The recording was younger than the requested
120-second range, and the captured view shows 408 available observations rather
than claiming a complete 120 seconds existed. Hidden state retained zero charts,
zero motion subscribers, zero history reads and zero additional projections;
restoration passed. Authoritative End, service shutdown and disposable database
deletion were confirmed. The matched multi-pane control and full final matrix
remain separate gates.

## P2 — matched two-Profile workspace still exceeds incremental budgets

The remaining performance finding is material and belongs to Phase 6. Relevant
ownership points are `VerticalProfile.tsx:274`, `ChartHost.tsx:248`,
`profileLayer.ts:146` and `chartMotion.ts:14`. Those identify the chart update
path, not an unproven attribution to one particular function. The critic did
not run an additional CPU profile or propose a broader renderer/persistence
redesign. The public-circle correction improves standalone behavior but does
not close the combined-workspace gate.

Reproduction: `critic-two-pane-control-candidate19-a`, Sydney moving 20v20,
90.4 source seconds of warmup, fixed 10 km camera, Tactical plus ordinary 3D,
the same four selected identities, filters/overlays and equal map/pane bounds.
The two analytic positions alternate between Settings/Credits and Profiles.
All four original 30-second windows completed, exit 0, without competing load.

| Configuration | Compositor FPS | p95 ms | p99 ms | >50 ms | Publication-age p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inert before | 118.394 | 15.118 | 15.947 | 1 | 242 |
| Two current Profiles | 93.553 | 23.013 | 30.950 | 1 | 275 |
| Two Profiles with 60s history | 93.656 | 23.528 | 38.532 | 3 | 297 |
| Inert after | 115.879 | 15.441 | 21.608 | 1 | 306 |

Current p95 increments are **+7.895/+7.572 ms**, and history increments are
**+8.410/+8.087 ms**, against the two controls. All exceed the unchanged +5 ms
budget. History p99 increments are **+22.585/+16.924 ms**, exceeding +10 ms
against both. Current p99 exceeds the first control by +15.003 ms but is within
the second at +9.342 ms; neither bracket is discarded. Publication-age increments
remain within +100 ms. The controls' own long frames are retained and do not
explain away the independently measured incremental failures.

The two current charts render at **81.45/81.31 events/s**, with p95 intervals
**32.5/32.0 ms** and **18/14** intervals over 50 ms. With history the rates are
**80.58/80.34**, p95 **32.2/32.0 ms**, and **23/26** intervals over 50 ms. Direct
motion callback p95 is 33.0 ms for current and 39.3 ms for history. Thus the
workspace mean exceeding 60 FPS cannot certify smooth chart motion. Acceptance
must remain withheld for this gate even if the remaining regression suites pass.

All 40 entities moved in every window. Every focus, visibility, camera, pane,
selection and overlay assertion passed. The critic personally inspected all
four timed screenshots and three subsequent pointer images; complete plots and
maps are visible, and current tooltip values/selection remain usable. History
became ready in 2,348 ms. The history window made 42 reads across its enclosing
43.404-second counter interval, with 31 inside the 30.601-second trace; these
denominators are not interchangeable. One mission stream stayed one; zero
providers/page errors/capture overflows occurred. Final hidden charts/canvases
were zero, authoritative End cleared the slot, and cleanup stopped services and
deleted the task database. Every one of the **440 product hashes** was personally
read back and matched the frozen candidate after execution. Raw traces, source
copies, screenshots, summary and source-readback receipts remain retained.

The critic returned CPU/UI ownership for the final static/browser checks.
Complete final-source native UI, the 96-window matrix and large fixture remain
required, even while this performance finding stays open. Phase 5 closure,
external compatibility and inherited configured-Video/D7 gaps remain separate.
