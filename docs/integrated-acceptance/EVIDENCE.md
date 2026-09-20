# D7 retained evidence

Local archive: `C:/Archive/Coding/Sentinel3-archive/2026-09-20-integrated-acceptance/`. Its `manifest.json` records retained sizes and SHA-256 values. Paths below are relative to that archive; current builds do not depend on it. Raw output includes adverse results and runner corrections, not just successful screenshots.

| Evidence | Retained path |
| --- | --- |
| Exact pre-D7 tree, diff and hashes | `.cache/integrated-acceptance/source-before/`, `baseline-tracked.patch`, `baseline-hashes.json` |
| Final source/test snapshot and hashes | `source-after/`, `source-after-hashes.json` |
| Original database and protected-source preservation | `.cache/integrated-acceptance/original-databases.json`, `preservation-current.json` |
| Regression/build/static/contract logs | `.cache/integrated-acceptance/` |
| Both obsolete Intercept failures and substantive replacements | `.cache/integrated-acceptance/d4-baseline*`, `d4-v2-*`; tracked version matrix |
| Failed complete browser runs | `.cache/integrated-acceptance/browser-full-1*`, `browser-full-2*` |
| Complete final browser results and screenshots | `frontend/test-results/browser/`; final full-run log in `.cache/integrated-acceptance/` |
| Foreground Sydney authoring/40 moving | `frontend/test-results/orchestrator-ui/d7-authoring/report.json` |
| Actual zoom/keyboard/docking/hidden workspace | `frontend/test-results/orchestrator-ui/d7-workspace-2/report.json` |
| Suggestions, lost Apply, restart, NON-OP and New demo | `frontend/test-results/performance/d7-recovery-2/result.json` |
| Receipt rollback, lost Stop, genuine stalled source and long Pause | `frontend/test-results/integrated-acceptance/d7-faults-final-2/result.json` |
| Ten-minute moving 20v20/resource samples | `frontend/test-results/performance/d7-soak/result.json` |
| Grid compositor windows | `frontend/test-results/performance/perf-d7-grid/` |
| Network-blocked provider attempt (fallback only) | `frontend/test-results/performance/perf-d7-configured/` |
| Configured Tactical/standard3D windows; capped Video capture | `frontend/test-results/performance/perf-d7-configured-complete/` |
| Earlier request-cap / zero-provider setup failures | `frontend/test-results/performance/perf-d7-configured-network/`, `perf-d7-configured-final/`, `perf-d7-configured-final-2/` |
| Independent round 1 UI/recovery | `frontend/test-results/integrated-acceptance/d7-critic-round1-ui-5/` |
| Round 1 independent frame trace | `frontend/test-results/integrated-acceptance/d7-critic-round1-ui-2/critic-frame-events.json` |
| Round 1 fully rendered recorded inspection | `frontend/test-results/integrated-acceptance/d7-critic-recorded/` |
| Fresh round 2 independent UI, recovery and recorded controls | `frontend/test-results/integrated-acceptance/d7-critic-round2-ui/` |
| Round 2 independent source hashes, 105/127 test logs and preservation audit | `frontend/test-results/integrated-acceptance/d7-critic-round2-audit/` |

## Selected visual evidence

- [Sydney 40-unit movement clip](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/orchestrator-ui/d7-authoring/forty-moving.mp4). Sampled motion proves visible movement; its capture rate does not measure display FPS.
- [Populated Orchestrator](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/orchestrator-ui/d7-authoring/03-populated-40.png), [760 px layout](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/orchestrator-ui/d7-authoring/layout-760.png), [ordinary 3D and Video](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/orchestrator-ui/d7-authoring/05-3d-video.png).
- [Connected source-stall feedback](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/integrated-acceptance/d7-faults-final-2/02-connected-source-stall.png).
- [Critic's independently populated recorded Sydney mission](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/integrated-acceptance/d7-critic-recorded/recorded-sydney40-rendered.png). This precedes the ended-control explanation correction; the second critic verifies its final presentation.
- [Fresh critic's final read-only recording](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/integrated-acceptance/d7-critic-round2-ui/07-recorded-read-only.png) and [760 px layout](../../../Sentinel3-archive/2026-09-20-integrated-acceptance/frontend/test-results/integrated-acceptance/d7-critic-round2-ui/03-width-760.png).

The raw reports include per-runtime `preflight.json` and `cleanup.json`, with distinct database paths, owned process IDs, successful service shutdown and task database disposal. No operator database, browser profile or provider credential is an archive input. Disposable generated builds are omitted; their logs and source hashes are retained.
