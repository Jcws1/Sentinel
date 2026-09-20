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

## Scenario-location implementation evidence

The separate `../Sentinel3-archive/2026-09-19-scenario-location/` archive retains **244 hash-verified files / 23,647,334 bytes** from the configurable-location implementation: baseline inventories, final and intermediate test logs, screenshots, sampled motion clips, all three independent reviewers' raw evidence and task-service cleanup receipts. It preserves checkout-relative paths under `frontend/test-results/scenario-location/`, `.cache/scenario-location/` and `test-results/scenario-location/`.

Its `manifest.json` records each retained file's size and SHA-256. `cleanup-summary.json` records the removed disposable builds/caches, released ports and final preservation checks. The 437 original database artifacts and 189 protected historical source/contract files remained unchanged; all 198 production files still match the final critic's reviewed inventory. This is separate from the earlier repository-cleanup archive above.

Current [feature documentation](scenario-location/README.md), [verification index](scenario-location/VERIFICATION.md), tests and reusable fixtures remain in source control. Raw evidence is local-only; current builds/tests do not require the archive. Restore an archived one-off runner to a separate scratch checkout if reproducing its historical run.

## Orchestrator implementation evidence

`../Sentinel3-archive/2026-09-20-orchestrator-ui/` retains **953 hash-verified files / 55,207,541 bytes**: before/after UI captures, sampled 20v20 motion, both independent critics' raw observations, successful and failed regression logs, baseline inventories and the final source/test snapshot. Raw evidence keeps its checkout-relative paths; reviewed implementation/test files are under `source-after/`. `manifest.json` records each retained size/SHA-256.

`cleanup-summary.json` and `cleanup-removals.json` document ten removed task-owned build/evidence-copy/browser-profile directories, released test ports, 28 database cleanup receipts and unchanged original state: 437 database artifacts, 286 protected source/contract/public files and all 193 files in the final critic production inventory. No canonical map assets were copied into the source snapshot or removed. Current [workflow documentation](orchestrator-ui/README.md), [verification](orchestrator-ui/VERIFICATION.md), tests and reusable fixtures remain in the repository.

The 9.1/10 scoped critic score is conditional: 115/117 distinct browser cases pass; two existing v1/v2 Intercept expectation conflicts remain. Their semantic assertions are preserved pending a user decision. The archive retains the failures and their investigation; it is not evidence of an all-passing browser suite. No commit or push was made.

## D7 integrated acceptance evidence

`../Sentinel3-archive/2026-09-20-integrated-acceptance/` retains the D7 baseline/current source inventories, exact pre-existing diff, final and failed regression logs, foreground screenshots and motion, controlled recovery faults, ten-minute moving 20v20 soak, compositor traces and both independent critics' raw evidence. Paths retain their checkout-relative form; final source is under `source-after/`. `manifest.json` records every retained size and SHA-256. Generated builds, provider credentials, browser profiles and databases are excluded.

`cleanup-removals.json` and `cleanup-summary.json` record disposal only after archive verification. The archive retains 32 successful task-database cleanup receipts; final checks found no new database artifact, all allocated ports free, all 437 original database artifacts unchanged by size/mtime and all 195 protected historical/contract files byte-identical. The final critic's 320 production/test hashes match delivery. Only two of 193 baseline production files changed, correcting ended-recording control explanations; no original file was removed.

Current [D7 delivery](integrated-acceptance/README.md), [verification](integrated-acceptance/VERIFICATION.md), [recovery matrix](integrated-acceptance/RECOVERY.md), [performance evidence](integrated-acceptance/PERFORMANCE.md) and [critic round 2](integrated-acceptance/critic-round-2.md) remain in source. The final gate is 403 frontend, 397 backend and one complete 117/117 browser run, with 43 frozen guards and static/contracts/build checks. The fresh critic scores the change 9.0/10 with scoped functional/recovery acceptance. Performance and unqualified overall acceptance remain withheld: configured Video capture exceeded the bounded provider budget, frame tails remain uneven and ten-minute recording growth was 757.65 MB. Earlier Orchestrator failures above remain historical evidence; D7's explicit v2 correction does not rewrite that earlier report.

## Bounded D7 performance follow-up

`../Sentinel3-archive/2026-09-20-performance-closure/` retains the exact uncommitted baseline snapshot, original diff and data inventory, matched validation/recording probes, profiles, browser screenshots, compositor traces, independent critic evidence, and successful and failed regression attempts. Current source is under `source-after/`; raw paths preserve their checkout-relative form. `manifest.json` records file sizes and SHA-256 hashes, with its own digest in `manifest.sha256`.

`cleanup-summary.json` records the final task-service, disposable-output and original-data checks. Databases, browser profiles, credentials and generated builds are excluded from the archive. Current [partial closure](performance-closure/README.md), [measurements](performance-closure/PERFORMANCE.md), [verification](performance-closure/VERIFICATION.md), [independent critic](performance-closure/CRITIC.md) and reusable tests remain in source. The 8.8/10 review supports the narrow optimization conditionally on the final regression gate; it does not establish storage efficiency, configured Video, sustained display acceptance or a new ten-minute soak. Historical reports remain unchanged.

## Milestone 1 D7 and Details closure

`../Sentinel3-archive/2026-09-20-d7-details-closure/` retains the current-source
baseline, final source, matched storage/validation probes, both ten-minute moving
20v20 soaks, all pane compositor windows, the configured Video budget-stop result,
Details/reference screenshots, complete regression reports and all three critics'
independent evidence. Failed candidates and test attempts remain included.
Generated builds, dependencies, credentials, browser profiles and databases are
excluded. Raw paths retain their checkout-relative form; final source is under
`source-after/`.

`manifest.json`, `manifest.sha256` and `readback-verification.json` provide per-file
SHA-256/size records, the manifest digest and verified readback totals.
`cleanup-summary.json` records explicit task-owned removal targets and service
checks. `test-results/d7-details-closure/final-preservation.json` compares the 437
original database artifacts without opening them, original image hashes,
protected historical/contract/fixture files and all 198 final reviewed production
files. The reviewed production inventory digest is
`1f6db1a50aa45d9f16f5e7930fc6ec0389408c67f1805a8061443002d71f11cf`.

The current [delivery](d7-details-closure/README.md), [verification](d7-details-closure/VERIFICATION.md),
[measurements](d7-details-closure/PERFORMANCE.md), [pacing](d7-details-closure/PACING.md),
[compatibility](d7-details-closure/COMPATIBILITY.md), [Details screenshots](d7-details-closure/DETAILS.md)
and [final critic](d7-details-closure/critic-round-3.md) remain in source.
The 9.1/10 review does not override failed display thresholds or the incomplete
configured Video window. Storage efficiency is demonstrated without discarding
history; overall performance closure remains partial. No commit, push or later
roadmap phase is included.
