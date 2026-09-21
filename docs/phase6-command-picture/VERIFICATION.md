# Phase 6 verification map

Historical Phase 5 and D7 results do not certify this source. Final counts, source
identity and acceptance are in DELIVERY.md; every failed attempt is retained in the
evidence archive. No tests are skipped, retried globally or loosened to obtain a pass.

Current complete results: **562 backend and 486 frontend** on candidate 22, exit 0.
All static/schema/foundation/repository checks and all three builds pass. Candidate
22 differs from candidate 20 only in the audit-search product file; the seven new
cases reproduce four failures before correction, and all 19 audit tests then pass.
Every frontend product byte and all 403 production/test outputs match candidate 20.
The final candidate-22 complete browser run passes **126/126** in **888.195111
seconds**, exit 0, with exactly one passed actual result per test and no skips,
flaky results, retries or root errors. Post-run readback matches all 440 product
files and 403 paired production/test outputs; services and task database are gone.
The previous complete browser run is **126/126 on candidate 20** in
886.017766 seconds, exit 0, zero skips/flaky/retries/root errors. The implementer
and critic independently read the full JSON and every actual result.
Candidate 20's 440 product files and all 403 production/test output files match
the tested inventory. Its test services and database were cleaned up. The critic's candidate-15 native
UI passes 33/33, with all 39 own screenshots inspected, zero provider requests/page
errors and complete task cleanup. The complete candidate-15 matrix exposed material
chart overhead; candidate-16 painting changes did not resolve it and were removed.
Candidate 17's independent 51/51 checks and native selection passed, but frame-tail
increments and clipped tooltip values did not. Candidate 18's compact tooltip passed
independent native narrow/wide review, but its 60 Hz experiment failed actual chart
cadence and was reverted. Candidate 19's public ECharts marker layer improves
standalone cadence but retains material combined frame-tail overhead. Candidate 20
corrects within-marker hover using ECharts' non-enterable HTML tooltip. Its fresh
native hover check passes both measured widths; full native UI attempt B passes
35/35, with 42 own screenshots, zero provider requests and page errors. The critic
checks source-gap freeze/recovery, all six lenses and narrow widths, historical
numeric inspection, lifecycle controls, ended recordings and supported external
missions. Attempt A's antialiased historical-line coordinate lookup failure is
retained; only that measurement helper changed before the complete repeat.
Candidate-20 measurements are complete: 96 matrix windows, 40 lifecycle cycles,
four confirmed Ends, valid foreground and zero providers/errors. Ten incremental
budgets, 39/76 applicable absolute budgets and two input-p95 budgets fail. A separate
fresh reviewer completes its own 35/35 broad native UI, matched timing controls,
53 backend/57 frontend focused checks, and final candidate-22 19/19 audit tests
plus 6/6 actual production-UI search checks. It independently reads all 126 final
browser results/exit and verifies every product hash and own cleanup. Its final
overall score is **8.5/10, acceptance withheld**. Passing functional checks do not
override those performance failures; see CRITIC-9.md for precise attribution.

The complete browser suite serves production-equivalent bytes on 5181 and a
separate final-source verification bundle on 5182 for runtime/inspection cases.
Foreground timing uses the latter with bounded diagnostic instrumentation. The
403-file production/test equality proof does not apply to that verification bundle
and is not evidence that every browser case or timing window was uninstrumented.

| Requirement | Relevant verification |
| --- | --- |
| Exact current counts, filtered versus mission totals | `frontend/tests/unit/analytics.test.ts`; `tests/browser/analytics.spec.ts` |
| Explicit resources and unknowns; BLUE is not management | Projection unit checks and external browser case |
| Audit retries, ordering, same-time outcomes, immutable cutoff | `backend/tests/test_analytics.py`, including actual external NO_EFFECT pairs and equal-clock receipts |
| Original literal audit identities and encoding | Real create/acquire/retry/audit endpoint cases for quoted, backslash, Unicode, percent and underscore IDs; historical UTF-8/ASCII JSON, raw-JSON search, exact stored bytes and zero audit writes. ASCII case folding is explicit. |
| No writes/new store/migration | Audit read-only test, original schema version and total_changes remain unchanged; existing compatibility/backend suites |
| Native MSL/ellipsoid groups; AGL exclusion | Projection and component tests, all-AGL current/history/comparison regression, external MSL browser case |
| Historical exclusion counts and shared range labels | Component tests distinguish a 15s plot from a shared 60s read, count mixed MSL/AGL/ellipsoid and captured/missing-origin exclusions, exclude older points from the denominator and retain original references; critic split-pane UI checks use different ranges |
| Origin changes and no future reference in history | Projection fixed-origin/capture-floor tests; foreground selected-origin flow |
| Corrections, source gaps and trajectory breaks | Existing `observedHistory.test.ts`, `observedProgress.test.ts`, backend history tests; Profile retains original segments and splits datum/origin exclusions |
| Full history validation, reusable reads and memory bounds | `backend/tests/test_observation_cache.py`: legacy/current bytes, unrelated-field corruption, compressed checksums, mutable aliases, concurrent callers, entry/byte eviction; existing cutoff/restart tests |
| Historical numeric access | Component historical timestamp/break table check plus foreground critic inspection |
| Shared selection, Details and source isolation | Browser analytics flows; critic's Sydney moving 40-unit map/Details selection and external switch |
| Late callbacks and response identity | Audit generation/timeout tests; eight full-anchor telemetry rejection tests; existing bounded history owner tests |
| Profile history refresh policy | `observedHistory.test.ts`: every retained sample, latest-anchor coalescing, immediate map/final-frame demand, filter identity, hidden timer cleanup and in-flight upgrades; final foreground map/Pause/End checks |
| Hidden cleanup, reopening, resizing | Chart-host unit test with suspended rAF, actual document background/dock cycles, resource measurements |
| Bounded chart motion and final position | `chartMotion.test.ts`: 144/120/60 Hz displays, accumulated deadlines, skipped stalls, duplicate notification suppression, actual trailing clock, quiescence and generation cancellation; host integration covers hidden/superseded work and callback-only refresh |
| Compact chart data and truthful bars | Real ECharts signed-bar zero/ratio/null checks; `profileSeries.test.ts` inspects actual IDs, callbacks, formatted tooltip measurements/source metadata, rendered 0.45 stale alpha and removal/motion patches; component memo tests retain current frame labels |
| Actual tooltip rendering | `analytics.spec.ts` locates actual marker pixels and checks visible tooltip text/bounds, micro-movement, click-through selection, corrected-frame reinspection, resize and removal. The new check failed on candidate 19 and passes candidate 20. Native setup a/b capture-induced pointer movement and the distinct projection-boundary blank remain documented in `CRITIC-7.md`; final HTML-tooltip native review is separate. |
| Mission submenu after asynchronous catalogue growth | `chrome.spec.ts`: 18 real saved scenarios held until fixture submenu opens; full-viewport hit test and normal pointer selection after release; before/after geometric reproduction retained |
| Ended recording inspection without dispatch | Foreground ended audit, browser assertion permits only read-only audit POST after loading fixture |
| Narrow layout and keyboard | Browser 760/820/900 px workflow; foreground captures at those widths |
| Fleet, Orchestrator, movement, Pause/Resume/Stop/End | Existing complete browser suite plus independent actual foreground control checks |
| No external providers | Route interception records every attempted provider hostname; zero is required |
| Frontend/backend/static/contracts/foundation/build | Complete canonical suites, typecheck, ESLint, formatting, schema generation checks, frozen hash guards, repository check and production build |
| Final browser gate | One complete serial suite against final production/verification bundles, full machine-readable result and wrapper exit status examined |

The browser harness uses fresh Edge contexts and task-owned isolated databases,
checks port ownership, and reports service/database cleanup. Operator browser
storage, recordings and databases are never used. Narrow viewport settings are
layout evidence; foreground compositor windows separately record the physical
desktop identity, browser PID, sample durations and pacing tails.
