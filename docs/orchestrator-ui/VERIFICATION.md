# Orchestrator verification

20 September 2026. Baseline: clean `83364f6`, including configurable scenario locations. The implementation is complete, but **unconditional delivery acceptance is withheld: 115 of 117 distinct browser cases pass; two existing Intercept cases assert legacy v1 expectations against current v2 runs.** Their semantic assertions remain unchanged pending the user's decision. See [regression investigation](REGRESSION-NOTES.md). The independent final implementation score is **9.1/10**, conditional on this gate; it does not override failed tests.

Current workflow/design: [README](README.md). Baseline/scope: [plan](PLAN.md). Independent reviews: [round 1](critic-round-1.md), [round 2](critic-round-2.md), [implementation responses](REVIEW-RESPONSES.md).

## Method

Author checks use foreground Microsoft Edge **153.0.4234.48**, fresh browser contexts, task-owned SQLite databases and blank-provider configuration. The primary viewport is 1440 × 900 CSS pixels, with 760/820/900 checks. The critic independently verifies visible, focused foreground operation at these widths and approximately 1.0 DPR. A separate disposable persistent context exercises actual browser zoom at 80/100/125%, with Windows DPR changing from 1.75 to approximately 1.4/2.1875. No operator browser profile/storage is used.

Supported APIs seed reusable scenarios, including the Sydney 20 Friendly / 20 Hostile fixture. Rendered controls perform editing, saving, validation, Run, Pause/Resume/End and inspection. Read-only world/renderer diagnostics supplement screenshots. The motion clip samples 42 screenshots over 8.084 seconds: movement evidence, **not display FPS**. This is not a performance overhaul, provider survey or user study.

## Author UI results

Final `orchestrator-acceptance-4` passed with zero page errors and no reported axe violations. Separate `orchestrator-workspace-3` passed with zero page errors. The critic subsequently exercised final source including the last focus/configuration polish.

| Area | Observed result |
| --- | --- |
| Shared authoring | One entry and two tabs share draft, authoring map and lifecycle. Unapplied action edits survive switching. Hidden editor map-picking is disarmed. |
| Location/profiles | Map origin pick/Cancel and numeric Sydney Apply work. Friendly/Hostile use canonical symbols; supported profiles display existing silhouettes. |
| Selection/deletion | Mixed and filtered selections retain/report hidden members. Review includes the full selection. Any scripted actor blocks the entire batch. First-checkbox row displacement is **0 px**. |
| Save uncertainty | Deliberately lost committed response, reload and retry retain the **identical pending body/identity**, reconcile one revision and lock dependent editing. |
| Exact revision/20v20 | Saved revision 2 is validated/launched using controls. **All 40 track positions change**, with all 40 renderer IDs present. Existing profiles/actions are used. |
| Frozen run/lifecycle | Pause freezes the run. Saving a later draft leaves its revision-2 binding/world unchanged. Return, Resume and End work. |
| Restart/inspection | The sole backend is restarted; existing recovery/reclaim works. Ended recording inspection retains its frozen scenario hash. |
| Maps/video/docking | Tactical, ordinary 3D and Video Feed work alongside Orchestrator. Author auxiliary Open to Side was a no-op, **not** docking evidence; the critic performs real drag docking in both directions. |
| Responsive/focus | 760/820/900/1440 px retain reachable controls/keyboard tabs. Broader responsive browser cases pass through 2560/3840 px. Actual 80/100/125% zoom has no horizontal document overflow. |
| Hidden/reopened work | Hidden schedule stays unchanged while ticks advance, then catches up. Eight reopen cycles retain one active Tactical lease and create **zero additional WebSockets**. Keyboard resize changes width 449.482→459.482 px. This is a bounded resource check, not a leak-free guarantee. |

## Observable workflow differences

Counts are explicit pointer/key actions from a loaded editor. Fixture creation is setup; scrolling is not converted into clicks. Raw baseline captures remain unchanged, including unnecessary reselections.

| Task | Baseline | Final result |
| --- | --- | --- |
| Add and rename a unit | Capture 6 actions; direct path 5 without unnecessary row reselection | No click-count improvement claimed. Profile discovery and retained edits are the changes. |
| Units to Conductor | 1 click | 1 internal-tab click; shared context stays visible. |
| Delete all three visible unscripted units | Capture 6 clicks; direct path 5 if first selected row is not reselected, plus scrolling | Critic measured **3 clicks**: Select all shown → Delete selected → Confirm. |
| Delete arbitrary three-unit subset | Individual selection/deletion | Three checkboxes + Delete selected + Confirm: 5 controls in current path; no timed user trial claimed. |
| Checkbox stability | Initial implementation defect moved the list 403 px; not a baseline claim | Critic measured **0 px** row/scroll movement for 0→1→2→1 at all four widths, using original pointer coordinates and Space. |

## Regression and review

- Full frontend: **401 tests / 41 files passed**, versus baseline 391. Ten new focused cases cover layout normalization, selection/edit intent, atomic dependency handling, draft-bound review, locks and pending saves.
- Full backend: **391 passed**. Production backend/simulation/contracts unchanged. Existing dependency deprecation warnings remain.
- Browser: **115 passed / 117 unique cases**, using latest executed result by file/title/project across four bounded runs; skipped/interrupted placeholders excluded. This is **not one passing full-suite run**. The last affected batch passed 52/52. The critic independently recomputed the aggregation. The two unchanged failures are documented in [regression notes](REGRESSION-NOTES.md).
- Passing browser coverage includes boundaries, scripts, lost Run response/exact retry, conflicts/restored drafts, current Intercept/NON-OP, legacy layouts, mission switching/recovery, configured regional maps, retained/hidden renderers, Tactical selection/cameras and docking. Resolved setup failures retain existing behavior/hash assertions.
- TypeScript, ESLint, Prettier, frontend/backend contract guards, foundation/hash checks, repository hygiene and bounded production/verification builds pass. Existing bundle-size warnings remain; renderer limits/quality are unchanged.

Logs are archived under `.cache/orchestrator-ui/`: `frontend-final.txt`, `backend-final.txt`, `browser-aggregate.json` and four referenced JSON/text runs, `typecheck-final.txt`, `lint-final.txt`, `format-delivery.txt`, `contracts-front-delivery.txt`, `foundation-front-delivery.txt`, `contracts-backend.txt`, `foundation-backend.txt`, `build-final-polish.txt` and `repository-delivery.txt`.

Round 1 rejected its source state at **8.0/10**. Two Medium findings were fixed: checkbox selection displaced targets by opening an editor above the list; Validate could leave focus on BODY. Minor range/terminology copy was corrected. Fresh round 2 inspected final/adjacent code and operated its own foreground program: **11 UI cases, 10 frontend and 75 backend tests passed**. It verified exact filtered-deletion payloads, 80-action dependency refusal, stable selection, keyboard focus, drag docking, retry across reload, 40 moving actors, frozen revisions, hidden work and legacy layout/configuration. Back focus and imported metadata were fixed/rechecked before scoring.

Round-2 scores: usability **9.0**, visual consistency **9.0**, frontend correctness **9.2**, compatibility/reliability **9.2**, maintainability **9.0**, overall **9.1/10**. No unresolved material source defect found in its scope. **Delivery remains conditional on two browser expectations.** Its final 193-file inventory has SHA-256 `0bfa1503e6a073c393a204493d4b5a38f93e51f85e867a105b80d59d0a2cf745`; its final-gate addendum confirms these files remain unchanged. No third round is represented as having occurred.

## Evidence index

Raw evidence is local-only, following [the archive convention](../ARCHIVE.md), and not required for builds/tests. Archive: `C:/Archive/Coding/Sentinel3-archive/2026-09-20-orchestrator-ui/`. Links require this local archive.

| Evidence | Link |
| --- | --- |
| Before | [Palette](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-baseline/02-palette.png), [Conductor](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-baseline/04-conductor.png) |
| After | [Orchestrator/profiles](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/01-profile-silhouettes.png), [deletion review](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/02-filtered-deletion-review.png), [40-unit plan](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/03-populated-40.png) |
| Narrow layouts | [760](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/layout-760.png), [820](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/layout-820.png), [900](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/layout-900.png) |
| Moving 20v20 | [Sampled motion clip](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/forty-moving.mp4), [UI report](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/report.json) |
| 3D/Video/recording | [3D + Video](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/05-3d-video.png), [ended inspection](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-acceptance-4/06-recorded-inspection.png) |
| Zoom/hidden/reopening | [Workspace report](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-workspace-3/report.json) |
| Independent UI | [Critic raw results](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-critic2-final-check/critic-ui-report.json), [drag into main](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-critic2-final-check/dragged-into-main-tabset.png), [redocked](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/frontend/test-results/orchestrator-ui/orchestrator-critic2-final-check/redocked.png) |
| Browser aggregation | [117-case result](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/.cache/orchestrator-ui/browser-aggregate.json) |

Reusable runners/fixtures/tests remain under `frontend/tests/`. Intermediate failures and both critics' programs/evidence are retained, not just passing output.

## Limits and cleanup

The two baseline-incompatible assertions remain a delivery gate; no simulation change or weakened legacy assertion is used to pass them. The baseline has no automatic browser workspace-layout persistence: compatibility is verified at supplied-layout boundaries and legacy aliases, without adding a persistence service.

No new FPS, exhaustive leak-free, worldwide-provider or whole-codebase correctness claim is made. Long lists still require scrolling. Critic validation of 40 units/80 actions took 3,587 ms under concurrent regression load; no controlled latency improvement is established. Earlier performance limits remain. Every provider configuration and historical recording variant was not manually replayed.

The archive contains **953 hash-verified files / 55,207,541 bytes**, including baseline/intermediate/final evidence, both critics' raw outputs, logs and a final source/test snapshot. All 953 source/archive pairs matched before duplicate evidence was removed, and every archived hash was checked again afterwards. See [manifest](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/manifest.json) and [cleanup/preservation receipt](../../../Sentinel3-archive/2026-09-20-orchestrator-ui/cleanup-summary.json).

All **28 isolated-runtime cleanup receipts** report deletion of their disposable databases; 19 foreground-runtime receipts also explicitly report services stopped/cleanup successful. Final independent port binding checks confirm task ports 5391/8191, 5393/8193, 5395/8195, 5397/8197 and 8011/5181/5182 are free. Browser contexts are closed. Ten verified task-owned evidence-copy, build, extension and temporary-profile directories were removed: 2,558 disposable files / 194,280,586 bytes. Canonical map assets remain in place.

Final preservation checks found **zero changes to 437 original database artifacts** by size/nanosecond modification time, **zero byte changes to 286 protected backend/contract/specification/public files**, and **zero changes to all 193 critic-reviewed production files**. No new task database artifact remains. Operator databases were not opened. No commit or push was performed.
