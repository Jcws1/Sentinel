# D7 verification index

This verification uses the existing uncommitted Orchestrator and scenario-location implementation. The pre-edit source inventory, exact working-tree patch and final source inventory identify the tested state; a commit identifier alone would not. D7 corrects two ended-recording status guards, test oracles, verification helpers and documentation. Simulation rules and backend authority are unchanged.

## Regression gate

The final complete browser run passed **117/117 in 879.058 seconds**, with zero skipped, unexpected, flaky or retried cases. It includes both corrected v2 workflows. Earlier complete runs each finished 116/117 with a different derived-pitch-only assertion; their failures and precise correction remain in [regression notes](REGRESSION-NOTES.md). The final result is one complete run, not an aggregate of subsets.

Environment: Windows, Node 24.20, Python 3.10.11, Edge 153.0.4234.48; source is the current uncommitted tree over HEAD `83364f6`. The baseline snapshot contains 572 files. Final `source-after-hashes.json` identifies the delivered source; all 320 production/test files in the fresh critic's final inventory still match. Physical hardware, foreground viewport and measurement conditions are recorded separately in the performance report. The complete browser regression is headless functional evidence, not display-FPS evidence.

Commands are run from the indicated directory, using the repository's existing installed dependencies:

| Directory | Command / setup | Evidence |
| --- | --- | --- |
| `frontend` | `npm test` | `frontend-final-2.txt`: 403 tests, 41 files |
| `backend` | `.venv/Scripts/python.exe -m pytest` | `backend-final-2.txt`: 397 passed, two existing dependency deprecation warnings; six new probe-isolation cases |
| `frontend` | `npm run typecheck`; `npm run lint`; `npm run format:check` | `typecheck-final-4.txt`, `lint-final-5.txt`, `format-final-7.txt`: passed |
| repository root | `backend/.venv/Scripts/python.exe scripts/export_contracts.py --check` | Current contract export guard |
| `frontend` | `npm run contracts:check`; `npm run contracts:foundation:check` | Generated current/foundation guards |
| repository root | `backend/.venv/Scripts/python.exe scripts/verify_phase0.py`; `backend/.venv/Scripts/python.exe scripts/check_repository.py` | `foundation-guards-final.txt`: 43 passed; `repository-final.txt`: hygiene passed |
| `frontend` | Set `SENTINEL_TEST_BUILD_SUFFIX=-integrated-acceptance`; `npm run build:test` | Bounded production + verification builds; canonical public assets reused |
| `frontend` | Same suffix; `node tests/support/run-browser.mjs` | `browser-full-3.txt` / `.json`: one complete 117-case pass, exit 0; no retries |

The final application build can be reused while only tests/docs change; its production-source hashes must still match the final source. The configured measurement build is separate and uses the unchanged provider arrangements. It is not retained in the raw archive because generated bundles can embed local provider configuration.

## Foreground operator and recovery checks

All programs use separate task-owned databases, ports and fresh browser contexts. They never attach to an operator session. Reports distinguish actual UI input, direct API/fixture setup, and diagnostic reads.

| Reusable program / run | Personally exercised boundary |
| --- | --- |
| `tests/orchestrator-ui/ui.mjs d7-authoring` | Sydney origin outside old camera bounds; map-pick Cancel, numeric Apply, silhouettes, filtered mixed selection and dependency refusal, exact pending Save across reload, saved r2 Validate/Run with 40 moving, paused frozen geometry, Tactical/3D/Video, backend restart, End and recorded inspection |
| `tests/orchestrator-ui/workspace.mjs d7-workspace-2` | Actual 80/100/125% browser zoom, keyboard tabs, resizing, hidden Conductor suspension/catch-up, eight reopen cycles, one renderer and no extra socket |
| `tests/performance/recovery.mjs d7-recovery-2` | 20v20 Suggestions review, state-change invalidation, explicit Apply, identical lost-response retry, advisory outage, disconnect/reconnect, sole-backend restart, explicit reclaim, persistent NON-OP, recorded inspection and New demo |
| `tests/integrated-acceptance/faults.mjs` | Actual receipt-storage rollback, lost Stop across reload, connected stalled source with genuine heartbeats, recovery without reconnect, 31.5-second Pause and persisted End |
| `tests/performance/lifecycle.mjs d7-soak` | Ten-minute moving 20v20, 20 map/tab transitions, hidden rendering suspension, narrow/desktop/1440p/emulated-4K layouts, Pause/Resume/Stop/Return/End and resource sampling |
| Fresh independent critic's own runner | Sydney 40 moving; origin/dependency refusal, hidden selection, lost Save/Stop across reload, exact r2/hash/altitude, narrow layouts, cameras/reopening, sole-backend restart/reclaim, populated terminal recording and corrected read-only controls |

The [recovery matrix](RECOVERY.md) identifies which additional boundaries are verified by regression tests, rather than claiming they were all fault-injected in a foreground session. [Performance evidence](PERFORMANCE.md) separates compositor measurements, UI acknowledgement timing, source age, resource trends and retained recording data.

## Evidence and limits

Raw logs, screenshots, sampled motion, traces, failed attempts, source inventories and service-cleanup receipts are retained under `C:/Archive/Coding/Sentinel3-archive/2026-09-20-integrated-acceptance/`, with SHA-256 verification. Current reusable tests/fixtures stay in source; historical reports are preserved. Archive `cleanup-summary.json` and `cleanup-removals.json` record disposable outputs; all 32 database cleanup receipts confirm deletion after shutdown. Final read-only checks found all allocated ports free, no new database artifact remaining, all 437 original database stat pairs unchanged and no final critic production/test hash mismatch.

The first configured-provider attempt was blocked by the execution environment: requests to the existing Cesium/Google endpoints returned `net::ERR_NETWORK_ACCESS_DENIED`. Its fallback windows are not configured-provider performance evidence. Subsequent bounded network-enabled checks verified normal Tactical/standard3D content. Google Video passed visible-provider readiness, but continued streaming reached the request cap during capture, leaving no complete Video pacing sample. These failed/capped attempts and the actual successful windows are retained separately; see the performance report.

**Functional and recovery acceptance pass.** Fresh [critic round 2](critic-round-2.md) independently read the complete final gate and recommends scoped acceptance at 9.0/10, after its own 105 frontend / 127 backend cases and foreground workflow. All actionable low findings were resolved; no unresolved material defect was established. This is not a claim that every possible race or application path is defect-free.

**Performance and unqualified overall acceptance remain withheld.** Short grid averages cannot close the previously recorded configured-Video limitation, and the ten-minute soak does not prove indefinite leak freedom or physical 4K/60 FPS. No subsequent roadmap phase was started.
