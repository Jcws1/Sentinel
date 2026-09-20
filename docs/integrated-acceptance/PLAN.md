# D7 integrated acceptance plan

20 September 2026. This pass starts from the current uncommitted Orchestrator tree, not a clean historical checkout. The pre-edit snapshot contains 572 tracked/unignored files and the exact existing diff. All 437 original database/WAL/SHM artifacts are inventoried by size and nanosecond modification time without opening them. Operator ports 8000/5180 and selected test ports were free at preflight.

## Baseline and decisions

Current code uses `local-fleet-v2` for new runs, with configured proximity acquisition (700 m default). Legacy `local-fleet-v1` readers/tests preserve clicked-area scope and held reserves. The two remaining `d4.spec.ts` workflows mix those versions. The user's D7 instruction explicitly authorises equally substantive version-correct test expectations, while retaining legacy guards. Verify/reproduce before editing; do not change simulation rules to fit obsolete tests.

Orchestrator and scenario geometry are already present and must be preserved. The roadmap's older narrative contains superseded reserves, panel names and stopping points. Current source, versioned contracts and latest decisions govern this pass. Previous reported 401 frontend/391 backend results and 115/117 aggregated browser results are historical evidence; rerun against this tree.

## Work and acceptance matrix

| Gate | Work and evidence |
| --- | --- |
| Version-correct browser coverage | Reproduce both failures; assert v2 explicitly, precise receipts/member outcomes, uniqueness, ordinary movement for unassigned members, Stop and persistent losses. Retain unchanged v1 backend tests. |
| End-to-end authoring | Default/remote origins, Units/Conductor draft ownership, selection/deletion dependencies, Save/Validate exact revision/Run, boundaries/routes and frozen geometry. |
| Commands and Suggestions | Existing movement, Patrol, Intercept, stale proposal refusal, explicit Apply, exact identity on lost response/retry, no premature authoritative display. |
| Recovery | Save/Run/Apply/Stop uncertainty, reload, conflicts, socket gaps/outage, stalled source, late old-mission callbacks, >30 s Pause, revoke/reclaim/lease, restart, End and transaction rollback. Map each case to actual UI and/or meaningful isolated regression evidence. |
| UI/resource integration | Foreground Edge, narrow/desktop/1440p/emulated-4K, keyboard/zoom/docking/cameras, 20 transitions, hidden work, Video Feed and repeated reopening. |
| Bounded measurements | Ten-minute moving 20v20 soak, committed movement, memory/transport/recording growth; compositor frame intervals, command latency/state age under named grid and bounded configured-provider workloads. Separate cold and steady state. |
| Regression | Complete frontend/backend/static/contract/hash/build checks; one complete final browser suite, not only accumulated passing subsets. |
| Independent review | Fresh critic inspects final code/tests and personally operates isolated UI. Up to three review/fix rounds. Preserve adverse evidence and separate functional/recovery/performance acceptance. |

Reuse existing isolated-runtime, renderer measurement, authoring and fault-injection helpers. Use bounded build suffix `-integrated-acceptance`, canonical public/map assets, fresh contexts and one backend per task database. Do not run competing foreground programs during measurements. Own only explicitly allocated ports/directories; stop and clean up each runtime.

Raw output is temporarily ignored under `.cache/integrated-acceptance` and `frontend/test-results/`; final SHA-256 archive is outside the checkout under `C:/Archive/Coding/Sentinel3-archive/`. Keep reusable tests/fixtures and concise reports in source. No commit/push, new combat semantics, provider arrangement, live LLM or unrelated redesign.
