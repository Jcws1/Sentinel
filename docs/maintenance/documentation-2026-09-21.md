# Documentation verification — 21–22 September 2026

Status: documentation, bounded verification, independent review and archive/disposal complete. Documentation accepted at 9.3/10. Final source/readback receipts seal delivery. No application changes, additional cleanup, commit or push.

## Baseline and plan

The completed [cleanup ledger](cleanup-2026-09-21.md), [independent review](cleanup-2026-09-21-critic.md) and archived final inventory were read first. HEAD is `30414540b89508193ea84c4f8e235362ebd61a37`; the actual dirty tree, including untracked Phase 5/6 and unrelated research work, is authoritative. All 788 starting source files match the cleanup final inventory SHA-256 `70ab237d4def683048083aa9ee2ecfcb0252656ac9e66ccadce894d301c0e09f`. Documentation baseline SHA-256: `3231a5a976e7bdaa45f497ca1fcd6661afc9eeb849372230122ce982ff85031e`.

1. Trace current implementation, configuration and reports, preserving known open gates.
2. Rewrite the quick start and canonical architecture; update active index/contradictory links only.
3. Check documented startup/build/contracts in an isolated, provider-free task environment; distinguish unexecuted installation/full-suite commands.
4. Obtain fresh independent documentation review, correct factual gaps, then check final source/preservation and archive evidence.

The unchanged cleaned product/test/contract inventory has 627 files and SHA-256 `a7cfc973e966ba9f1c5ecd408f794bffde56420322320c9b647a7eaf56aecd70`. Historical regression and performance results remain attributed to their own executions. Phase 5, Phase 6, D7 and configured Video acceptance are not reopened or closed by prose changes.

Working evidence is in ignored `test-results/documentation-2026-09-21/`. Final evidence is assigned a new archive at `C:/Archive/Coding/Sentinel3-archive/2026-09-22-project-documentation/`; earlier archives remain unchanged.

## Delivered documents and scope

- [Root README](../../README.md): concise setup, explicit provider-free configuration, start/stop, basic workflows, verification commands and current limits.
- [Canonical architecture](../architecture.md): component/source map, ownership, three sequence/component diagrams, contracts/time/altitude, complete flows, storage/recovery/bounds, renderer/chart lifecycle, security assumptions, measured performance, developer workflow and decision/finding ledger.
- [Documentation index](../README.md): canonical guide and current verification links, with date-scoped historical reports.
- [Backend README](../../backend/README.md): current storage 6/scenario 1.6 wording, external-module ownership and links to the canonical blueprint.
- [Frontend README](../../frontend/README.md): ECharts and canonical setup/architecture links.
- [Archive index](../ARCHIVE.md): append-only evidence location. Historical reports, frozen specifications, contracts and implementation plans are unchanged.

## Checks executed for this update

Verified runtime: Windows, PowerShell 7.6.5, Python 3.10.11, Node 24.20.0, npm 11.19.0. These are tested versions, not broad minimum-version guarantees.

| Check | Result / boundary |
| --- | --- |
| `python -m pip check` in existing backend venv | Exit 0; dependency consistency |
| `pip install --dry-run --no-index -r backend/requirements-dev.txt` | Exit 0; existing pinned dependencies satisfy requirements; no installation performed |
| `npm --prefix frontend ls --depth=0` | Exit 0; installed declared dependency tree |
| Backend `export_contracts.py --check` | Exit 0, 2.599 s |
| `verify_phase0.py` | Exit 0, 0.518 s; structural/frozen foundation guard output retained |
| Frontend `contracts:check` / `contracts:foundation:check` | Both exit 0, 0.876 / 0.614 s |
| `npm --prefix frontend run build -- --outDir dist-documentation-2026-09-21` | Exit 0, 11.965 s, including TypeScript; credential-free/shared-public environment, existing large-chunk warning retained |
| Build comparison | All 403 files / 16,423,608 bytes exactly match cleanup's production output; operator-configured `frontend/dist` was not overwritten |
| Repository hygiene / changed-document whitespace | Exit 0; final recheck retained; no full-tree whitespace claim over unrelated research |
| Actual README frontend environment block in pwsh7.6.5 | Vite `loadEnv` confirms expected provider/style, all three credentials empty and photorealistic asset disabled; no credential values printed |
| Default-address startup smoke, attempt B | Exit 0; exact root `uvicorn --app-dir backend ... --port 8000` and `npm --prefix frontend run dev`, with task-only DB override; API/OpenAPI and frontend proxy available at documented addresses |
| Headless fresh Edge onboarding | Fixture load/WS, Command Picture/Profile, golden external START, mapped world/Details, HOLD/RESUME/ABORT, reload and earlier recorded-result inspection passed; zero provider attempts/page errors |
| Smoke shutdown | Browser context closed, owned process trees stopped, ports8000/5180 free; both task databases deleted through the existing guarded helper after writers stopped |
| Preservation/readback | All627 tested inputs unchanged; all437 original DB artifacts match size/nanosecond-mtime, all3 environment files match hashes/metadata, all857 protected research/public files match hashes |

The build used `SENTINEL_SHARED_PUBLIC=1` to reuse installed canonical public assets, so it is not a standalone deployment-package validation. Headless UI checks are functional onboarding evidence, not actual foreground or display-performance evidence. No new performance result is claimed.

Fresh registry installation (`npm ci`, online `pip install`), virtualenv creation, template copying over a new environment, provider-pack download, configured providers and a clean-machine deployment were **not executed**. Commands were derived from actual manifests/scripts; installed dependency consistency and isolated startup/build were checked. Existing local environment files were preserved. The README intentionally requires pwsh7.6.5 because empty overrides are not equivalent in Windows PowerShell5.1.

Full backend/frontend/browser suites, standalone lint/format checks and display benchmarks were not rerun for prose. The immediately preceding cleanup's 562/486/126 passes are historical runs whose627 input hashes remain unchanged, not results newly produced by this task. The critic's pytest collection checks discover tests without executing them.

## Preserved unsuccessful attempt

Attempt A started the documented addresses and returned the API but failed its UI probe by trying to select Alpha without opening the Developer fixtures submenu. It exited1; no assertion or timeout was weakened. Its sandboxed task-tree shutdown also failed; the result correctly says `portsFree=false`. A privileged read identified the exact descendants of the task-owned probe; only that verified tree was stopped, then the guarded helper deleted `verification-documentation-20384.sqlite3`. Original result/logs/process-tree evidence remain under `onboarding/`.

Attempt B opens the actual submenu and retains shutdown process status/output. It used a fresh database/context and completed normally. Its original result and screenshots are under `onboarding-b/`; it does not replace or erase attempt A.

## Independent review and corrections

The fresh `/root/documentation_critic` did not author the documentation or alter product code. Its [report](documentation-review-2026-09-21.md) distinguishes personal source/CLI/collection/synthetic-shell checks from supplied build/browser evidence.

Findings corrected during review: an explicit pwsh version for safe empty overrides; receipt-only rejection and in-transaction external mapping in the diagrams; source-vs-recording timestamps on receipts; the actual generic polygon-validation ownership of the inherited Phase5 defect; a broken historical decision link; and clarification that direct Python pins are not a complete transitive lockfile. Final independent disposition and exact scored source are recorded in that report.

Final disposition: **accept documentation, 9.3/10**. All six findings (one Medium and five Low) were corrected; no unresolved documentation finding remains. Scores: factual accuracy 9.4, architectural completeness 9.4, onboarding 9.1, evidence 9.3 and maintainability 9.2. The critic personally checked 226 local targets, 52 unchanged source hashes, 562-test collection (no execution), contract/help commands and the actual README environment block in pwsh. It did not claim its own browser or performance run.

Exact final reviewed README SHA-256: `f576ea8c8dcbd3d70579c34a4cb16c72fbe31cbb321cab61ce2214172be93c44`; architecture: `536d710e033f764e04b153804e45a0dd8897f6cedda2363149548c66798fb3bf`; independent report: `529e8cc2c779d9211575cd6bd17dd000e75f28f060d9a5707c710d72f7764bc3`. `critic-final-readback.json` identifies all five reviewed canonical documents. Closeout receipt additions to this ledger do not change those documents.

## Remaining uncertainties and source identity

The application still has the documented Phase5 geometry/large-batch/provisional-conformance limits, Phase6 combined-Profile pacing failure and inherited D7/configured-Video gaps. This task did not reproduce every historical defect, perform penetration testing, certify other platforms or validate a clean internet installation. Source-backed deployment assumptions and historical measurements are labelled separately in the blueprint.

The archive's `test-results/documentation-2026-09-21/final-source-inventory.json` identifies every final source file. The unchanged tested product identity is `a7cfc973e966ba9f1c5ecd408f794bffde56420322320c9b647a7eaf56aecd70`; final documentation hashes and critic readback are retained separately. The inventory is outside its own source set to avoid a self-referential digest. Final archive/readback and task-output disposal receipts complete delivery.

## Closeout receipts

The new archive's pre-cleanup manifest/readback verified **861 files / 20,498,965 bytes** before disposal, SHA-256 `2c259e1953828217f735fef24b303aec4605901f1d5acd0375caaed9df0e9202`. Both task-owned output roots (`test-results/documentation-2026-09-21` and `frontend/dist-documentation-2026-09-21`) were removed by exact inventoried-file deletion and non-recursive empty-directory removal. Every evidence file was rehashed against its archived copy immediately before deletion. Generated build bytes were excluded from the archive; their complete matched hash inventory is retained.

`cleanup-summary.json`, `final-preservation.json`, `final-source-match.json` and the final manifest/readback in `C:/Archive/Coding/Sentinel3-archive/2026-09-22-project-documentation/` establish final delivery. The current source set contains790 files; only the six active documentation files listed above and two new documentation/review ledger files differ from the cleaned baseline. The original configured build, source/test/contracts, operator data, environment and unrelated research remain preserved. Task services/contexts are stopped and no task database artifact remains. No commit or push was made.
