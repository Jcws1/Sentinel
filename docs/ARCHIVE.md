# Local historical archive

The user chose a private GitHub repository with concise reports and reusable inputs in source control. Historical raw evidence and obsolete experiments are preserved outside this checkout:

`../Sentinel3-archive/2026-09-19-repository-cleanup/`

On the cleanup machine this resolves to `C:/Archive/Coding/Sentinel3-archive/2026-09-19-repository-cleanup/`.

| Archive path | Contents |
|---|---|
| `source-before/` | All 637 tracked files from baseline commit `60f6a0b` |
| `historical/docs/` | Original phase/review reports, screenshots, traces, recordings and historical test databases |
| `historical/frontend/tests/` | Original phase-specific capture/review scripts and previous locations of promoted helpers |
| `historical/frontend/experiments/docking/` | Superseded two-library experiment, its manifests, evidence and local dependencies |
| `historical/output/`, `historical/tmp/` | Generated design previews, prompts, demo script and PDF extraction |
| `historical/.cache/performance-stability/` | Source snapshot needed to interpret the original before/after measurements |
| `historical/scripts/` | Single-pass evidence aggregation, snapshot and cleanup scripts |
| `generated-builds/` | Unique generated files from 40 retired build directories |
| `generated-build-manifest.json` | Hashes and retained locations for unique files and identical copies removed |
| `verification/` | Cleanup verification logs, failed/final browser results, screenshots and service/database cleanup receipts |
| `metadata/reference-docs/` | Original local map setup guides retained before updating current instructions |
| `manifest.json`, `metadata/` | Per-file hashes, exact move plan, baseline and promotion mapping |

The initial move preserved and hash-verified **14,456 files / 3,922,418,903 bytes**. All 437 database artifacts outside historical evidence remained in place. Another 184 test database artifacts moved with their evidence and sidecars; all 621 retained their original size and nanosecond modification time.

Build retirement additionally preserved **16,060 unique files / 570,096,151 bytes** here. Only **30,611 byte-identical generated copies / 41,607,526,152 bytes** were deleted; their canonical public assets remain unchanged. The manifest identifies each retained counterpart. Archival moves themselves do not free disk space on the same volume; the duplicate deletion reclaimed about **41.61 GB**.

This archive is local and is not uploaded by Git. The complete original performance report is `historical/docs/performance-stability/REPORT.md`; its critic reports and raw measurements remain beside it. Historical absolute links may still name the original location; resolve their checkout-relative paths below `historical/`. Original documents were not rewritten to imply later acceptance.

Restore an old artifact to a separate scratch checkout when reproducing history. Current builds/tests must not require this archive. The cleanup has not rewritten existing Git commits, so previously committed artifacts remain in repository history.
