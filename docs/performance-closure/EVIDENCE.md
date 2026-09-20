# Source and retained evidence

The baseline is the working tree at the start of this pass, over HEAD
`83364f617b3e8842426b0551faa670b5cfd5995a`, including all existing uncommitted D7,
Orchestrator and scenario-location work. Its 193 production files match the D7
final archived production inventory. The baseline snapshot contains 588 source
files and the exact pre-existing diff. No older commit was used as the baseline.

Only two production files change in this pass. Final SHA-256:

| File | SHA-256 |
| --- | --- |
| `backend/app/commands/scheduler.py` | `1b392060ed1729a00cd84c23d3fb54bd6a65ff770f7dc52b5a4d2eafe100dde5` |
| `backend/app/commands/zone_rules.py` | `79b655351b6bd8578e3a58d213a6aaf1b28c54dae9a7f7246e4032ce3a7633b6` |

The critic independently checked all 193 final production hashes. The test-only
subprocess working-directory repair was also inspected and independently run.
Exact final source/test/document hashes are in `source-after-hashes.json` in the
archive; HEAD alone is not the delivery identity.

Archive root:
`C:/Archive/Coding/Sentinel3-archive/2026-09-20-performance-closure/`.

| Archive-relative path | Evidence |
| --- | --- |
| `test-results/performance-closure/source-before/` | Exact uncommitted starting source |
| `test-results/performance-closure/source-before.json` | Starting source sizes and hashes |
| `test-results/performance-closure/databases-before.json` | 437 original database artifacts, size and nanosecond modification time |
| `test-results/performance-closure/baseline-validation/`, `after-validation/` | Cold/repeated raw samples, exact content hashes and separate profiles |
| `test-results/performance-closure/baseline-recording/`, `after-recording/` | Committed workload, retained bytes, SQLite components and profiles |
| `frontend/test-results/performance-closure/baseline-visible-ui/`, `after-visible-ui/` | Matched actual-desktop validation, screenshots and cleanup receipts |
| `frontend/test-results/performance-closure/critic-native-ui-final/` | Independent moving Sydney 40-unit UI, exact review, 760/820/900 layouts, lost Save/Stop responses and recorded inspection screenshots |
| `frontend/test-results/performance-closure/critic/` | Independent source audit, focused test logs and reproduction runner |
| `frontend/test-results/performance-closure/critic-native-ui/` | Retained first UI-runner failure |
| `frontend/test-results/performance/perf-closure-baseline-grid/`, `perf-closure-after-grid/` | Explicitly isolated-desktop diagnostic compositor traces, not foreground acceptance |
| `test-results/performance-closure/backend-full.txt`, `backend-final.txt` | Failed root invocation and complete corrected backend run |
| `test-results/performance-closure/browser-full.txt`, `frontend/test-results/browser/` | Complete browser-run log, machine-readable results and runtime cleanup receipt |
| `source-after/`, `source-after-hashes.json` | Exact delivered source and identity |
| `cleanup-removals.json`, `cleanup-summary.json` | Bounded disposable-output removal, task ports and original-data preservation |
| `manifest.json`, `manifest.sha256` | Per-file SHA-256 and manifest digest; read-back verified |

Raw failed attempts are retained. Operator databases, browser profiles, credentials
and generated builds are excluded. Reusable probes and regression fixtures remain
in the checkout; building and testing do not require this local archive.
