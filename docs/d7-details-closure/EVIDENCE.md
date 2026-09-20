# Evidence, source identity and cleanup

The external archive for this milestone is
`C:/Archive/Coding/Sentinel3-archive/2026-09-20-d7-details-closure`.
It preserves checkout-relative raw paths, the immutable baseline and final source,
working-tree diff, all successful and failed attempts, screenshots, CPU profiles,
compositor event data, storage reports and independent review probes.

`manifest.json` records each retained file's SHA-256 and byte length;
`manifest.sha256` records the manifest digest. `readback-verification.json`
records the post-copy readback audit. Generated bundles, dependencies, browser
profiles, credentials and databases are excluded. Current application/tests do
not depend on the archive. Restore old probes to a separate disposable checkout.

| Evidence | Archive-relative location |
| --- | --- |
| Baseline HEAD/diff, 599-file source, 437 original DB artifact metadata, four original references | `test-results/d7-details-closure/` and `source-before/` beneath it |
| Final complete checks and individual logs | `test-results/d7-details-closure/final-checks.json` |
| Final complete browser machine result and wrapper cleanup | `frontend/test-results/browser/` |
| Earlier browser attempts preserved before final run | `test-results/d7-details-closure/pre-final-browser/` |
| Matched recording profiles and cold-validation probes | `test-results/d7-details-closure/`, including all controlled A/B orders |
| Actual input/helper/request/DOM validation summary | `test-results/d7-details-closure/validation-summary.json` |
| Ten-minute before/after measurements and normal-close reports | `frontend/test-results/performance/d7-details-baseline-soak/` and `d7-details-final-soak/` |
| Normalized soak summary | `test-results/d7-details-closure/soak-summary.json` |
| Matched baseline, intermediate and final pane traces | `frontend/test-results/performance/perf-d7-details-*-grid*/` |
| Configured Video budget stop and actual provider screenshot | `frontend/test-results/performance/perf-d7-details-configured-video/` |
| Final Details screenshots and workflow result | `frontend/test-results/performance/d7-details-final-details/` |
| Final Sydney recovery, including retained failed attempts | `frontend/test-results/performance/d7-details-final-sydney-recovery*/` |
| Final source-stall/rollback/long-Pause faults | `frontend/test-results/integrated-acceptance/d7-details-final-faults/` |
| Critics' own source inventories, measurements, UI captures and checks | `test-results/d7-details-closure/critic-round-*/` and their task-prefixed frontend result folders |
| Final source snapshot | `source-after/` and `source-after.json` |
| Final preservation and cleanup audits | `test-results/d7-details-closure/final-preservation.json` and task cleanup reports |

The starting HEAD remains `6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`.
The final critic's 198-file production inventory has SHA-256
`1f6db1a50aa45d9f16f5e7930fc6ec0389408c67f1805a8061443002d71f11cf`.
Tests and documentation may be newer than that production inventory; the complete
archive inventory identifies them individually. No commit or push is performed.

Preservation checks compare original database size/nanosecond modification time
without opening the files, reference-image hashes, protected source/contract/fixture
hashes, all reviewed production hashes and baseline-file presence. Credential
contents are not dumped or claimed to have a baseline hash. Task runtimes use
fresh contexts and never write operator credentials, preferences, drafts or
pending identities. Runtime cleanup receipts prove their own listeners stopped
and their own databases were deleted; the final audit also checks for unexpected
new database artifacts.

Disposable output removal occurs only after archive readback. Every recursive
removal target is resolved and verified inside the repository and against an
explicit task-owned path list. Existing `.cache` roots, operator data, unrelated
fixtures and canonical public map assets are never broadly removed.

## Completed archival and cleanup

The initial full archive passed SHA-256 readback before any output removal:
2,289 files, 1,371,692,585 bytes, including 631 final source files. Its manifest
and readback receipt are retained unchanged under `verification-before-cleanup/`.
The final root manifest/readback is refreshed afterward to include the cleanup
records, post-cleanup preservation result and final documentation.

Cleanup completed at **10:26:41 UTC on 20 September 2026**. It removed 3,834
explicitly owned generated/evidence-working files (1,425,707,929 bytes); all 21
allocated service ports had zero listeners. Every listed removal target was
subsequently checked absent. Task browser contexts and disposable databases had
already closed/deleted through their runtime teardown; the final native-window
audit contains no Sentinel task window. No operator process was stopped.

The post-cleanup audit at **10:27:14 UTC** confirms all 437 original database
artifacts retain their recorded sizes and nanosecond modification times, all four
supplied reference hashes match, all 241 protected-file hashes match, and all 198
reviewed production hashes match. All 599 baseline files remain present, HEAD is
unchanged, and no new database artifacts remain in the audited directories.
Database metadata checks are not byte-for-byte database hash verification.

Final receipts are `cleanup-summary.json`, `cleanup-progress.json`,
`test-results/d7-details-closure/final-preservation.json`, `manifest.sha256` and
`readback-verification.json` at the archive root/paths above. Reusable tests,
fixtures, application assets and source remain in the checkout. No commit or push
was made, and no Phase 5 or Phase 6 work was begun.
