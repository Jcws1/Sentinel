# Phase 6 delivery — implemented, acceptance withheld

Command Picture and the reusable Vertical Engagement Profile are implemented.
Acceptance is withheld on independently reproduced combined-Profile frame tails.
The complete display matrix, candidate-22 browser suite and fresh independent
review are finished. Candidate 22 corrects exact audit-identity search, verified
through the original API reproduction and actual production UI. Native functional
checks pass; the fresh critic scores overall acceptance **8.5/10, withheld**.
Evidence is archived with SHA-256 readback, task services/contexts are stopped,
and disposable outputs are removed. Phase 5, external conformance, D7 and configured
Video remain separate. This is not an unqualified completion certificate.

## Available workflows

Load an interactive mission or an ended recording, or choose **Simulation → Inspect
mapped mission** for a supported external run. Open **Command Picture** from the
activity bar or Views. Existing shared selection, filters, Details photographs,
map presentation, docking and camera owners are retained.

| Lens | Operational question answered |
| --- | --- |
| Overview | What is present and current? Affiliation/classification, observed/stale/unlocated values and separate mission/filtered totals. |
| Resources | Which explicitly managed resources are available? Asset availability, condition, control bindings, assignments and retained executions remain distinct; unknown values stay visible. |
| Recorded activity | Which requests, transitions and outcomes were recorded? Searchable stable pages retain original identities and source/recording timestamps at an immutable cutoff. |
| Statistics | What happened in the recorded range? Event/request/outcome buckets, distinct affected identities and selected retained telemetry with explicit denominators and missing counts. |
| Comparison | How do up to four selected entities compare on supplied speed, native altitude or observation age? Bars and raw numeric values retain missing identities and unknown measurements. |
| Vertical profile | How do compatible altitudes relate to horizontal radial distance from a declared fixed origin? Current bounded presentation and optional broken observed history share map selection. |

Open **Vertical Profile** from Views or **Open profile to side** in the card. Mission
or frozen-location reference is the default; an observed selected entity can supply
an explicitly captured fixed reference. The plot is not a terrain cross-section.
Native MSL/ellipsoid groups remain separate; AGL is excluded without authoritative
conversion. Earlier history than a selected-origin capture is excluded.

Audit/statistics ranges use recorded UTC and a captured committed cutoff. **Use
latest cutoff**, then **Read range**, refreshes that snapshot without moving mission
time. Pages contain 50 rows and do not silently truncate; summaries above 20,000
matching rows explicitly say incomplete. Outcome counts preserve NO_EFFECT and
separate interactions from distinct affected identities. This is recorded operational
audit, not a tamper-proof compliance log or real-world effectiveness measurement.

Live Profile-only history reads coalesce at most once per second while retaining
every available sample. Map history demand and paused/ended final frames remain
immediate. The read cutoff and current plot-window end are labelled separately;
expired points continue to be clipped. No recording or simulation cadence changes.

No terrain clearance, coverage, prediction, sensor confidence, aircraft capability
or invented readiness scores are supplied. BLUE affiliation does not imply resource
management or command authority. [METRICS.md](METRICS.md) defines units, denominators,
time basis, unknowns, query bounds and altitude/origin policy.

## Source and regression

HEAD remains `30414540b89508193ea84c4f8e235362ebd61a37`. No commit or push has been
performed. Candidate 22 covers 440 application, contract and dependency files;
its product-inventory SHA-256 is
`3f514062a61b1b4ed98c51ff797e7d8ce9841ab978a47cfa18282fcd26879be7`.
Exactly one product file differs from candidate 20: the bounded audit-search query.
All frontend product files, all 205 contracts and the other 83 backend application
files match candidate 20. All 84 backend files are covered by the new 562-case run.
The candidate-22 source freeze contains 789 files with SHA-256
`8726988bd4254fc5041886f21e636ad3699d815df4e35cf61ad1fbad67404f06`;
later documentation/evidence updates are inventoried separately at delivery.
The verification build additionally exposes test-only inspection hooks. The final
complete browser suite uses the rebuilt production bundle on port 5181 and
verification bundle on 5182; runtime inspection cases use those verification
hooks. It is not a claim that all 126 cases run against identical production bytes.
All 440 product files and 403 paired production/test build files matched before
the candidate-22 run and in final post-run readback; the latter also match candidate
20 exactly. Its test services stopped and task database was deleted. Earlier passes
retain their own source identity.

Foreground measurements use candidate 20's verification build with bounded
diagnostic bridges and render timestamp capture. They are measurements of that
instrumented configuration, not an uninstrumented production or native-DPR display
certificate. The same instrumentation is used in matched closed/open controls;
its presence does not waive the independently reproduced incremental budget miss.
Candidate 22 retains every frontend byte and all source/history/recording code;
its audit-query correction receives separate final-source API/UI verification.
The failed candidate-21 dirty-rectangle experiment is exactly reverted. No fresh
96-window candidate-22 matrix is claimed.

| Gate | Evidence/status |
| --- | --- |
| Complete backend | Candidate 22: 562 passed, exit 0, 90.02 seconds; two existing dependency warnings. |
| Complete frontend | Candidate 22: 486 passed in 49 files, exit 0, 43.39 seconds. |
| Static/schema/foundation | Candidate 22 typecheck, ESLint, formatting, both frontend contract checks, backend export and 43 frozen guards pass; protected verification bytes match. |
| Repository | Candidate 22 and final documentation hygiene checks pass, exit 0, 790 source files. |
| Supplementary whole-tree Git whitespace check | Exit 2: 79 whitespace findings only in `research-brain/raw/repository/README.md`. Its SHA-256 exactly matches the initial Phase 6 baseline; unrelated research is preserved. Full log and attribution retained; this is not reported as a passing whole-tree check. |
| Production/test/verification builds | Candidate 22 all exit 0; 403 production/test files match each other and candidate 20. Existing chunk-size warnings retained. |
| Complete browser, candidate 9 | 125/125, exit 0, 14.7 minutes; all actual results read, zero skips/flaky/retries/root errors. |
| Complete browser, candidate 15 | 125/125, exit 0, 889.413 seconds; implementer and critic independently read all actual results, zero skips/flaky/retries/errors. |
| Complete browser, candidate 20 | 126/126, exit 0, 886.017766 seconds; implementer and critic independently read complete JSON and all actual results, zero skips/flaky/retries/root errors. Product and paired production/test build readback passes. |
| Complete browser, candidate 22 | Final full attempt 8: 126/126, exit 0, 888.195111 seconds. Every actual result passes once, with zero skips/flaky/retries/root errors. All 440 product files and 403 paired production/test files match after the run; its services and task database are cleaned up. |
| Independent checks | Candidate 20 focused 57/57, exit 0. Native tooltip review passes at measured 205/459 px chart widths, including micro-movement and five-frame continuous visibility. Each critic's own complete native UI attempt B passes 35/35 with 42 own screenshots and zero providers/page errors. Fresh candidate-22 API reproduction and 19/19 audit tests pass; its production-build ended-recording UI passes 6/6 with six own screenshots and zero commands/providers/errors. Fresh reviewer verifies all 440 product hashes, reads every final browser result and exit, and confirms own services/browser/databases removed. |
| Actual foreground and performance | All 96 candidate-20 matrix windows execute with valid foreground, zero providers/errors, 40 lifecycle cycles and four confirmed Ends. Ten incremental budgets fail; 39/76 moving windows miss absolute budgets; input p95 is 169.004/153.237 ms in the two 20v20 workloads (150 ms target). Equal-area controls independently reproduce Profile overhead. Large-fixture readiness is within 3,000 ms. |
| Preservation/archive/cleanup | SHA-256 readback before every raw-output removal; all nine explicit disposable directories removed, 20 task ports free. Post-cleanup check retains 437 original database artifacts, three environment hashes, 263 protected hashes, all 721 original source paths and all 440 tested product hashes. Six unrelated research edits remain preserved. |

[REGRESSION.md](REGRESSION.md) retains every full-browser failed attempt and its
investigation. Required narrow inherited corrections are the existing keyboard
order assertion and asynchronous mission-submenu positioning; no timeout, retry,
frozen fixture, resolver limit or simulation rule was weakened. [HISTORY.md](HISTORY.md)
records the independently tested bounded read-cache correction without a schema,
durability or recording-cadence change.

## Acceptance boundaries and remaining evidence

| Boundary | Current disposition |
| --- | --- |
| Interactive and recorded analytics | Candidate 22 complete backend/frontend/browser/static/build gates and fresh independent search follow-up pass. Broad native UI uses the byte-identical candidate-20 frontend. Quantitative performance acceptance remains separate. |
| Supported external-run visualization | Typed mapped-world inspection, native MSL, recorded NO_EFFECT outcomes and explicit resource ownership pass; this does not certify every external input. |
| Unresolved external compatibility | Mixed-scale valid polygon HTTP 500, large-batch source blocking and provisional interpretations remain deferred Phase 5 work. |
| Inherited display/configured Video | D7 strict pacing and configured Video remain open; no external-provider capture or budget reset is included. |
| Overall Phase 6 acceptance | Withheld, 8.5/10, on independently reproduced combined-Profile performance and recorded input-budget misses. Delivery archive/cleanup is complete; passing functional tests do not erase the material pacing defect. |

Interactive and recorded analytics, supported external visualization and Profile
are assessed separately from unresolved external compatibility. Current-source
probes reproduce valid mixed-scale polygon HTTP 500 and a 5.218-second large-batch
source event-loop gap. These remain deferred Phase 5 work. Its prior 8.6/10 withheld
acceptance is not superseded. Strict D7 pacing and configured Video remain open.

The critic's final candidate-20 own actual foreground checks cover all six views, 760/820/900
layouts, a moving Sydney 40-unit scenario, rendered-chart selection with matching
Tactical/Details photographs, lifecycle commands, ended-recording inspection and
supported external native-MSL visualization. Source-gap freeze/recovery and the
historical numeric-only hover boundary were also checked. The implementer and critic
read all 96 final matrix windows, all raw traces and 192 visibility records. Earlier attempts retain their exact source attribution;
none is relabelled as final-source certification. All task workloads require zero
external provider attempts and fresh task-owned databases/browser contexts.

The fresh reviewer did not implement application code, tracked regression tests or
tracked measurement harnesses. It independently operated the moving Sydney 40-unit
UI and ended recordings, reproduced matched performance, corrected-source search
and focused checks, and inspected its own screenshots. The earlier critic's two
measurement-harness contributions are disclosed in CRITIC-8; CRITIC-9 is the
separate final independent review.

| Final fresh-review dimension | Score /10 |
| --- | ---: |
| Data / analytic correctness | 9.2 |
| Frontend correctness | 9.2 |
| Compatibility / recovery | 9.1 |
| Performance / resource efficiency | 6.0 |
| Maintainability | 9.0 |
| **Overall — acceptance withheld** | **8.5** |

The exact-identity search P2 is resolved. The combined-Profile pacing P2 remains:
the fresh reviewer's same-geometry current-only comparison adds 7.744 ms at p95
and 14.506 ms at p99; with observed history it adds 14.833/29.688 ms against the
initial inert bracket. Both also fail the final bracket. The limits remain +5/+10
ms. Narrow rendering experiments and their failures are retained; the final
unsuccessful dirty-rectangle option was reverted. This is a Phase 6 limitation,
not relabelled inherited D7 failure. The requested 9/10 target is not met.

See [VERIFICATION.md](VERIFICATION.md), [PERFORMANCE.md](PERFORMANCE.md),
[CRITIC-8.md](CRITIC-8.md), [CRITIC-9.md](CRITIC-9.md),
[CRITIC-RESPONSES.md](CRITIC-RESPONSES.md) and
[PHASE5-DEFERRED.md](PHASE5-DEFERRED.md). Raw screenshots, successful/failed results,
traces and source inventories are archived outside the checkout. No Phase 7 or
subsequent phase was started; no commit or push was performed.

## Archive and cleanup receipts

The archive is `C:/Archive/Coding/Sentinel3-archive/2026-09-20-phase6-command-picture/`.
Its initial **6,760 files / 1,030,199,777 bytes** all passed SHA-256/size readback
before cleanup. Every copied final source file also matched its source inventory.
The pre-cleanup manifest digest is
`c35b1e8e076ca4c7a89c40faf1ad14d02be17432c37b9317f972060b538ba426`.
The final manifest additionally covers cleanup/preservation receipts and final
documentation. It keeps that original manifest/readback and source inventories.

- [Final manifest and file hashes](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/manifest.json)
- [Complete final readback](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/readback-verification.json)
- [Preserved pre-cleanup readback](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/pre-cleanup-readback-verification.json)
- [Resolved cleanup targets and free task ports](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/cleanup-summary.json)
- [Final preservation and exact product/source readback](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/test-results/phase6-command-picture/final-preservation.json)
- [Final full source inventory](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/test-results/phase6-command-picture/final-source.json)
- [Final complete browser JSON](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/browser-final-8.json)
- [Fresh independent product/browser/cleanup readback](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/test-results/phase6-command-picture/final9-c22-readback.json)

Only verified task evidence directories and four named generated builds were
removed, after resolved-path, baseline-artifact and reparse-point guards. All raw
files matched their archived hashes before any deletion. No process was killed
by final cleanup; the responsible harnesses had already stopped their own services
and browser contexts. No operator database was opened by preservation checks.
The final database-artifact scan finds exactly the original 437 files, with no new
or missing artifacts. Original database size/mtime, credentials and protected
photos/specifications/fixtures/reports remain unchanged. All six separately
identified unrelated research changes remain in the checkout. Dependencies and
reusable source/tests/fixtures remain installed and available.

CRITIC-9 was signed before the parent-owned archive step; the receipts above close
that delivery item without changing its performance finding or attributing archive
execution to the critic. Databases, credentials, browser profiles, dependencies and
generated builds are excluded from the evidence archive. Rebuild using the normal
documented commands to run the application; no task server remains running.

## Actual foreground screenshots

These are unedited captures from task-owned foreground Edge sessions on the
physical 2560×1440 display. CSS viewport/DPR overrides and Windows display scaling
are recorded in the raw evidence; the image dimensions do not certify native-DPR
or full-display performance. Candidate 20 and candidate 22 have identical frontend
product/build bytes. Captures from each retain their original source attribution.

| Capture | Evidence |
| --- | --- |
| Overview, moving Sydney 40-unit mission | [Actual Overview](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-overview.png) |
| Explicit managed resources | [Actual Resources](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-resources.png) |
| Recorded statistics | [Actual Statistics](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-statistics.png) |
| Selected entity comparison | [Actual Comparison](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-comparison.png) |
| Current Profile tooltip and matching map identity | [Actual Profile](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-two-pane-control-candidate20-setup-a/tuple-rendered-tooltip-wider.png) |
| Final production audit, original quoted request ID in an ended recording | [Fresh critic's final search](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/final9-search-ui-candidate22-b/quoted-original.png) |
| Supported external native MSL | [Actual external inspection](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-external-native-msl.png) |
| 760 px layout | [Actual narrow Overview](../../../Sentinel3-archive/2026-09-20-phase6-command-picture/frontend/test-results/phase6-command-picture/critic-ui-candidate20-b/critic-width-760-overview.png) |

All six lenses at 760/820/900 px, split/reopen, history, source-gap, lifecycle,
selection/Details and the fresh critic's independently repeated captures remain
in their complete raw directories. The table is a representative index, not a
replacement for full results or quantitative measurements.
