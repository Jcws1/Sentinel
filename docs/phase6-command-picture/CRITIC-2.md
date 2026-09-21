# Phase 6 corrected-candidate independent review

Status: **functional review passed on candidate 8; overall acceptance withheld
for the standalone Profile pacing defect, failed complete browser gate and
remaining display/resource matrix**.
No score substitutes for these open gates. This report supplements the preserved
findings and failed attempts in [CRITIC-1.md](CRITIC-1.md).

## Independence and reviewed source

The critic did not implement product code or regression tests. It inspected the
architecture and contracts, ran its own focused checks, operated its own elevated
Edge/task database, captured and personally inspected all 33 screenshots from
`critic-round1-h`, and used an independent sampler. The implementer remained idle
for execution during these foreground measurements. The critic edited only the
explicitly authorized measurement harness and its own ignored probes/reports.

Candidate 8 contains 437 product files. Manifest SHA-256:
`10eeeb027db87e09cd2ef788ddb3c8d7ce1b4cef5b4573ff246e715f328b82cb`.
The critic independently hashed the manifest and compared it with candidate 7:
only `ChartHost.tsx`, `VerticalProfile.tsx`, and the new `chartMotion.ts` differ.
The six product-file hashes captured by the actual `h` run match this manifest.
The backend is unchanged from the independently tested candidate-7 backend.

## Findings, corrections and verification

| Severity | Finding and reproduction | Corrected location | Independent result |
| --- | --- | --- | --- |
| P1, closed | All-AGL data could pass an undefined-datum equality guard and appear on a common axis. | `VerticalProfile.tsx:70`, `:110`; `CommandPicture.tsx:358` | Defined-group checks; focused tests; actual AGL-only Profile exclusion/Comparison Unknown in the retained candidate-4 probe. Native groups remain unchanged in candidate 8. |
| P2, closed | A valid response for a different mission/entity/frame/history anchor could populate telemetry. | `observedHistory.ts:19`; `ObservedTelemetry.tsx:98` | Exact eight-field request-anchor validation, mismatch and late-response checks independently pass. |
| P2, closed | Profile history had no keyboard-accessible numeric observations. | `VerticalProfile.tsx`, historical-points disclosure | Bounded paginated source UTC, distance, native altitude and segment/break table; personally operated at desktop, 760, 820 and 900 px. |
| P2, closed | Document-hidden chart disposal depended on suspended rAF, and history errors hid their cause/recovery. | `ChartHost.tsx:117`; `VerticalProfile.tsx`, history status | Synchronous cleanup, queued-callback rejection and visible Error/Retry. Actual native hidden transition in `h` gives zero charts, zero new history reads and zero projection computations over 1,200 ms. |
| P2, closed for measured live workload | Mature Sydney 40-unit history remained loading beyond the existing five-second UI gate. | `sqlite_repository.py:199`, `:268`, `:284`; `observation_cache.py:60` | Exact committed-byte proof and bounded selected-observation cache preserve validation/rollback/legacy fallback. Personally reproduced the earlier failures; corrected 120s history is ready in 2,642 ms in `h`, with the unchanged gate. Strict cold historical reads remain a documented latency limit. |
| P2, closed | Source filtering changed mission observation denominators. | `projections.ts:29` | Mission totals now use unfiltered source arbitration; filtered counts retain map arbitration. Exact focused assertions pass. |
| P2, closed | Selected removed IDs vanished from Comparison and produced an empty-selection prompt. This finding was raised by the implementer. | `CommandPicture.tsx:321` | First four shared IDs retain order; unavailable IDs have null chart data and explicit Unknown/unavailable rows. All-missing and mixed-order regressions independently pass. |
| P2, open | Profile added about 6.9 ms p95 compositor interval on candidate 7, exceeding the declared +5 ms increment. Candidate 8's strict elapsed-time gate then limited standalone moving Profile below the 60 FPS target. | `ChartHost.tsx:101`, `:105`, `:153`; `chartMotion.ts:4` | Candidate-8 matched Sydney map windows pass incremental p95/p99/age budgets, but independently measured standalone Profile is 53.11 FPS and history 56.46 FPS. The narrow chart scheduler needs correction and fresh review; the full matrix remains open. |
| P2, methodology corrected | Playwright focus emulation invalidated DOM evidence of true hidden state and continuous foreground. | `tests/analytics/foreground-browser.mjs` | Fresh task-owned default context through documented `connectOverCDP({noDefaults:true})`; native two-tab smoke proves hidden/focus changes. Native window sizing now physically contains the requested viewport. Earlier attempts remain qualified, not promoted to passes. |

The proof cache is process-local and bounded. It hashes exact canonical stored
bytes after full validation and registers proofs only after SQL COMMIT. Outer
transaction proofs are discarded on rollback. A separate short proof lock avoids
writer dependence on the history-decoding lock. Unknown, evicted or changed bytes
use the original strict reader; corruption in unrelated fields is covered by the
focused regressions. No new store, migration, recording cadence or transaction
durability change was introduced.

The chart correction samples the existing presentation at actual paint time,
coalesces only chart work and cancels pending old-projection callbacks on reset or
disposal. It does not modify the world, map renderers, interpolation boundaries or
simulation stepping. The strict 60/s ceiling currently produces about 43–45 motion
updates/s in the measured 144 Hz environment; it is not a claim of 60 chart paints/s.

## Personally verified functional results

`critic-round1-h`: process exit 0, all 28 recorded cases passed, no page errors or
external/provider attempts. Task browser, backend and frontend stopped; task
database cleanup completed. The full result, traces, requests and screenshots
remain under `frontend/test-results/phase6-command-picture/critic-round1-h` pending
the final external archive.

- Sydney 20v20: all 40 units move. Chart numeric keyboard selection agrees with
  Tactical and Details. The supplied drone photograph and model-reference label
  remain present in the actual Fleet Stop screenshot.
- All six lenses operated at desktop and at each of 760, 820 and 900 × 700 px.
  Each narrow case used keyboard lens activation, shared search, audit range
  editing, raw Comparison values or Profile origin/history/numeric controls as
  applicable. No document overflow; readable scrolling was personally inspected.
  Tactical split reopening was separately captured at all three narrow widths.
- Reusable Profile operated in Command Picture and its dedicated side pane;
  fixed mission and selected-position origins were exercised. Native ellipsoid
  labels, historical timestamps and window-start segment labels were visible.
- Actual Fleet Stop was accepted, held Friendly 01, and left the other 39 moving.
  Pause, Resume and End operated. Ended audit used the completed recording cutoff
  and found the `interactive.end` event; analytic inspection emitted zero command
  or intent writes.
- Supported external 40-unit inspection showed native MSL with its unspecified
  source-scoped datum, not an ellipsoid relabel. Resources reported zero managed
  assets despite BLUE/friendly affiliation. Source switching did not confer command
  authority or mix interactive data with the external projection.
- The real hidden document disposed charts and suspended analytic reads/projection
  work; reopening restored the view. This was verified after removing focus
  emulation, rather than inferred from an artificial visibility event.

Personally executed candidate-8 focused frontend checks: **34/34 in four files,
exit 0** (`chartMotion`, `analytics`, `analytics-lifecycle`, `observedHistory`).
Previously executed unchanged backend analytics/history/cache/storage checks:
**53/53, exit 0**, with zero JUnit failures, errors or skips.

The critic independently traversed all 124 records and read every failure in the
candidate-8 `browser-final-3.json`, plus its process exit record: **123/124, exit 1,
zero skipped/flaky/retries**. The only failure is the blocked-Cesium-worker case:
`actions.ts:19` could not click the Tactical developer-fixture menu item because it
remained outside the viewport, exhausting the unchanged 45-second case timeout.
This distinct menu-navigation failure is being investigated; it leaves the full
browser gate open. The 123 passing cases do not substitute for that gate.

## Personally measured candidate-8 windows

Fresh task-owned Edge 153.0.4234.48 on Windows 10, RTX 3060; native physical desktop
2560 × 1440, 1280 × 700 CSS viewport, DPR approximately 1. Native window rectangle
fits the physical display. Before/after Win32 task-PID corroboration and genuinely
unemulated focus/visibility samples passed; zero mid-window focus-loss events.
All three samples were about 30.5 seconds, with no competing test/build/benchmark.
The supplied hardware inventory in [PERFORMANCE.md](PERFORMANCE.md) identifies
an Intel Core i7-10700K (8 cores / 16 logical processors) and 144 Hz display. Native
desktop size and task PID, browser version and GPU were personally corroborated;
the processor model/physical refresh inventory was supplied by the implementer.

| Configuration | Compositor FPS | p95 / p99 ms | >50 ms | Recording-age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tactical, analytics closed | 90.45 | 20.833 / 27.762 | 0 | 265 | 0 |
| Tactical + Profile, history off | 89.61 | 20.853 / 27.797 | 1 | 240 | 45.1 |
| Tactical + Profile, history 120s | 88.07 | 20.866 / 27.827 | 3 | 266 | 42.5 |

Incremental p95 is +0.020/+0.033 ms, p99 +0.035/+0.065 ms, and recording-age p95
−25/+1 ms. These bounded increments pass the declared budgets. The closed baseline
already misses the strict 16.9 ms p95 target; open windows also contain long-tail
intervals. No sustained 60 FPS/strict D7 pass is claimed from these averages.
Standalone moving Profile must remain a moving-presentation test: map-driven
compositor FPS cannot certify its own chart cadence.

Opening a docked analytic pane also reduces the map's drawing area. These normal
closed/open increments therefore describe the operational workspace change, not
isolated ECharts cost. The matrix records map bounds. A proposed supplementary
static Credits side-pane control is not yet verified: the retained attempts below
exposed navigation/selection setup mistakes. It supplies no matched-area result.

### Standalone moving-profile non-pass

`critic-standalone-candidate8-d` completed both 30-second windows with process exit
0, zero errors/provider attempts, valid native foreground before/after checks,
true visibility/focus throughout and zero mid-window losses. Both had **zero
visible maps and all 40 Sydney units moving**. The process `passed` flag means the
probe executed, not that the performance budgets passed. The critic personally
inspected both screenshots and the complete result/cleanup records.

| Configuration | Seconds | FPS | p95 / p99 ms | >50 ms | Age p95 ms | Motion updates/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Profile alone | 30.425 | 53.114 | 20.958 / 27.836 | 1 | 259 | 47.297 |
| Profile + 120s history alone | 30.448 | 56.458 | 21.009 / 34.736 | 3 | 268 | 47.458 |

Both fail the retained mean 60 FPS target. The history case also exceeds the
33.4 ms p99 threshold. History became ready in 1,467 ms under the unchanged
five-second UI gate. The scheduler's minimum 16.667 ms spacing quantizes a 144 Hz
rAF stream to roughly every third callback; this is a chart scheduling issue,
not an inherited map-renderer failure. Suggested correction: use accumulated
deadlines without catch-up bursts, sample the actual callback time, and preserve
generation cancellation/trailing-sample guarantees. The implementer proposes a
90 Hz chart target to leave headroom for the unchanged 60 FPS acceptance target;
at 144 Hz, a 60 Hz deadline necessarily includes 20.83 ms slots. This choice must
pass both standalone cadence and incremental map-workspace budgets. New focused tests,
standalone measurements and independent review are required.

Earlier small-probe attempts are preserved: the first timed only a valid baseline
before failing to find a nonexistent Credits Views option; `-b` reached a Credits
sample with Tactical hidden and failed exact map-bounds equality; `-c` rejected
the still-unselected map before timing the control. Their errors were harness
setup mistakes. The static `-b` sample is not a moving-map performance result.
Every attempt stopped its task services and deleted only its disposable database.

The candidate-7 large synthetic run showed useful 10,000-entity/10,000-event
analytics and sub-3,000 ms readiness, but it preceded the native-focus correction
and candidate-8 chart update. The final-source large check must be repeated.

## Open acceptance gates and scope boundaries

Still open: correction and final passing complete browser gate; correction and
fresh standalone moving Profile checks; the unchanged-duration 96-window
default/Sydney 10v10/20v20 matrix,
including each lens with each map and both maps; matched closed-state post-GC
cycle resources, subscriptions/queries, input latency and final large fixture.
The matrix harness now captures initial heap after closing both analytic panes,
with the same selection/viewport as the final closed state, to avoid masking
retained memory by comparing open before versus closed after.

Final category scores and overall acceptance remain pending these gates. No
remaining analytic-data or interaction defect was personally reproduced on
candidate 8; its standalone chart pacing remains a material defect. This does
not certify Phase 5 closure, external conformance, inherited D7 pacing or configured
Video. The mixed-scale polygon HTTP 500, large external source blocking, provisional
compatibility interpretations and prior Phase 5 acceptance decision remain separate.
Sensor confidence, coverage, prediction, terrain clearance and engagement feasibility
remain unavailable; notional simulation results are not real-world effectiveness.
