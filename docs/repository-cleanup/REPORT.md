# Repository organization result

Baseline: clean branch `v3`, commit `60f6a0b`, 637 tracked files (13.61 MiB). The user selected a private GitHub repository and an external local historical archive.

## Organization

Raw historical phase/review evidence, generated previews/PDF extraction, the superseded docking experiment and one-off critic/capture entry points moved to the [local archive](../ARCHIVE.md). All 14,456 moved files were hash-verified before and after the move; a full tracked-source baseline was retained separately. Existing Git history was not rewritten.

Forty obsolete build directories were also retired. Hash comparison against the canonical public assets identified **30,611 identical generated copies / 41,607,526,152 bytes (41.61 GB)** for deletion. Another **16,060 unique generated files / 570,096,151 bytes** were preserved in the archive. One link to the canonical map pack was removed as a link only. The canonical assets were rehashed unchanged. Standard `dist`, `dist-test` and `dist-verification` outputs, installed dependencies and operator data were retained.

Active tools now live in `frontend/tests/{unit,browser,performance,support,fixtures}`. Shared process/UI helpers were promoted from phase-named scripts, along with the geometry fixture, 20v20 scenario, map-data notices and foundation contract generator. Current builds/tests no longer rely on ignored historical documentation. The source-side move map and deletion inventory are recorded in `changes.json`.

The blanket `docs/` ignore was replaced with explicit local/generated-output rules. Current root/backend/frontend/contract documentation now describes v1.13, real runtime ownership and remaining performance limits. New raw runs use ignored `test-results/`; test builds share public map assets instead of repeatedly copying them.

## Code retained deliberately

A conservative static import traversal, including literal dynamic renderer imports, reached every production frontend/backend module. `legacy_*` files remain active versioned readers. Frozen contracts, migrations, developer fixtures, Phase-0 model/specification checks, attribution and current unit/browser coverage remain. No product simulation, rendering, command, timing or preference behavior changed in this pass.

Historical one-off entry points were checked against imports, package scripts, test discovery and build configuration. Their reusable parts were promoted before archiving. The old docking package was not an application dependency, workspace or build input; its foundation generator was the only remaining reproducibility responsibility and was extracted.

## Verification

| Check | Result |
|---|---|
| Backend regression suite | 365 passed; two existing dependency warnings |
| Frontend unit suite | 372 passed in 38 files |
| Static/build checks | TypeScript, ESLint, Prettier, backend export guard, current/foundation frontend contract guards, 43 Phase-0 checks and whitespace check passed |
| Source-only build | Product, verification harness and bounded performance bundles built without local credentials, map pack or historical evidence |
| Shared public preview | Original asset bytes, HEAD, partial/invalid ranges, HTML MIME and traversal isolation checked against the actual preview server |
| Focused browser regressions | 18 distinct cases passed across final runs: 16 together, the corrected long Pause/Stop/Return case separately, and native pop-out/close/redock/reopen separately |
| Headed geometry / capacity | Geometry check passed; all eight 20v20 recovery cases passed, with zero page errors |
| Backend benchmark tool | 1v1, 10v10 and 20v20 processed durable ticks with all 2, 20 and 40 entities moving; temporary databases removed |
| Preservation | All 185 production source files and 173 frozen contract/specification/draft files match baseline hashes; all 621 original database artifacts retain size and nanosecond modification time |

The source-only export reused the existing installed Node/Python dependencies through temporary links. It demonstrates that source inputs are complete; it is not a fresh network install on another machine. Browser discovery found 116 cases; the full browser suite was not rerun. Existing bundle-size warnings remain. Raw logs, failures, final results, screenshots and cleanup receipts are retained in the archive's `verification/` directory.

Browser maintenance repaired stale setup: explicitly select a supported profile after expanding a category, use the current validation control and selected Fleet row text, and assert exact profile IDs/cruise speeds rather than obsolete generic review text. An introduced text-encoding error was corrected before final checks. A final pop-out probe caught missing HTML MIME handling in the new shared-assets preview helper; the same close/redock/reopen regression then passed after the fix. Assertions were retained or made more specific; failed attempts remain in the evidence.

The capacity run exercised real moving entities, lost-response retry with the same identity and payload, advisory state, transport reconnection, sole-backend restart, 20 outcomes / 40 NON-OP entities, End/recorded inspection and new-mission isolation. All task-owned browser contexts/services stopped, demos ended and disposable verification databases were deleted. Backend benchmark medians were 9.08 / 36.13 / 68.98 ms for 1v1 / 10v10 / 20v20; these are tool smoke-test timings, not matched before/after results or displayed FPS.

The previous performance acceptance remains **8.2/10, HOLD**. Loaded Google Video missed 60 FPS; intermittent ordinary-3D cold startup and dense 3D label overlap remain. Repository organization does not resolve or recertify those findings. No new independent critic review was performed for this cleanup, and no bug-free or fresh performance acceptance claim is made.

## Preservation

All 437 database artifacts outside historical evidence remain in place. Another 184 historical test database artifacts moved with their containing evidence and sidecars. Preservation audits found all 621 unchanged in size and nanosecond modification time. Operator databases, local credentials, browser profiles/preferences/pending identities and the canonical map pack were not opened for writes or removed.

The repository hygiene check covers the candidate source tree, required fixtures/notices, local imports, current documentation links and selected credential formats. It is not a full Git-history secret audit. Removing tracked evidence from the current tree does not remove it from previous commits or shrink existing Git history.

The final candidate has 522 source/documentation files, down from 637 tracked baseline files. The disposable source export, dependency links, temporary builds and pytest scratch are removed after archiving verification evidence; the external `cleanup-finalization.json` records that completion.

No commit, push, repository visibility change, new software licence or Git-history rewrite was performed. Review the additions, moves and deletions together when committing; untracked replacements must be included with removal of their old paths.
