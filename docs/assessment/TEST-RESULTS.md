# Technical-review verification results

**Assessment checks: PASS.** These results apply to the frozen working tree identified below. They do not constitute formal Phase 5 acceptance or organiser conformance.

- HEAD: `f98de4f183b27df947fb914893deb2e688b598b0`; branch `v3`, with uncommitted changes.
- Executable/configuration/test/input inventory: **680 files**, SHA-256 `0207f2e9a30614cae0bdcbfe10cd3907305ba06d3c58ffde013258960ee154e5`.
- Verification was performed on 24 September UTC / 25 September Singapore time. The commands, UTC start/end times, duration and exit code for every runner step are retained in its `.meta.json`.
- Environment: Windows 10, Intel i7-10700K, RTX 3060; PowerShell 7.6.5, Python 3.10.11, Node 24.20.0, npm 11.19.0 and Microsoft Edge 153.

## Complete current suites

| Check | Result | Raw evidence |
|---|---:|---|
| Prerequisites: contracts, static checks and builds | 10 / 10 | [Step records](../../test-results/assessment/assessment-ready/functional-status.json) |
| Frontend unit/component tests | 637 / 637 | [Vitest](../../test-results/assessment/assessment-ready/unit/frontend-unit.json) |
| Backend unit/integration tests | 768 passed; 0 failed/errors/skipped | [JUnit](../../test-results/assessment/assessment-ready/backend-recheck/backend-full.junit.xml) |
| Same backend tests in UTF-8 mode | 768 passed; 0 failed/errors/skipped | [JUnit](../../test-results/assessment/assessment-ready/backend-recheck/backend-full-utf8.junit.xml) |
| System HTTP corpus | 387 checks; 357 HTTP requests; 0 failures/5xx | [Summary](../../test-results/simulation-system/assessment-ready/summary.json) |
| Complete browser E2E suite | 132 passed; 0 skipped/flaky/retried/errors | [Playwright](../../test-results/assessment/assessment-ready/browser/raw/browser/results.json) |
| Native foreground workflows (0/10/20) | 26 window-ownership checks matched | [0](../../test-results/assessment/assessment-ready/foreground/assessment-ready-fg-0/result.json), [10](../../test-results/assessment/assessment-ready/foreground/assessment-ready-fg-10/result.json), [20](../../test-results/assessment/assessment-ready/foreground/assessment-ready-fg-20/result.json) |
| Performance and storage | See explicit budgets and diagnostic limitations | [Performance report](PERFORMANCE-AND-LIMITS.md) |

The 768 backend cases include 35 new assessment checks; the 132 browser cases include two new assessment workflows. The pre-addition baseline had 733 backend, 637 frontend and 130 browser passes. The UTF-8 run repeats the same backend cases and is not counted as extra coverage.

All 112 normally discovered test files are mapped in [TEST-CATALOGUE.md](TEST-CATALOGUE.md), with individual results in `test-cases.json`. [TESTING.md](TESTING.md) provides rerun commands and explains specialist tools whose results remain historical. Passing tests is not a code-coverage percentage. Backend runs retained two dependency deprecation warnings.

## Runner correction and retained attempts

The first `assessment-final` attempt failed repository hygiene because the new browser test referenced a documentation fixture. Those unchanged inputs were moved into shared backend test fixtures, without weakening the hygiene check. The corrected product also uses a high-resolution diagnostic clock.

The first backend invocations on `assessment-ready` then encountered a runner-only temporary-directory setup error: 651 passed and 117 setup errors in each encoding mode. The original `integration/` reports and the nonzero `functional-status.json` are preserved. The runner now creates the isolated parent directory and refuses an existing base path. Both complete backend reruns above passed on the same unchanged 680-file source. The other passing suite results did not need to be repeated for this runner correction.

Initial runner SHA-256: `e1f292b7aa47cc320d766a52ec6504c621b86695ee639412f4e9f8e7aadca86f`. Corrected runner and unchanged source check: [provenance](../../test-results/assessment/assessment-ready/source-check-backend-recheck.json). [Development notes](DEVELOPMENT-NOTES.md) retain the earlier exploratory failures too.

## Geometry differential timing

The separate M6 file runs passed with process wall times of **6.816s** (backend) and **3.211s** (frontend), against the inherited 10-second-per-file budget. These repeat cases already included in the full suites and are not added to the distinct-case count. Raw commands/results: [backend](../../test-results/assessment/assessment-ready/geometry/backend-exact-timing.meta.json) and [frontend](../../test-results/assessment/assessment-ready/geometry/frontend-exact-timing.meta.json).

## Actual morning-launch rehearsal

The unchanged review launcher served `dist-assessment-ready` on 5240 with the backend on 8040, using another copy of the five saved plans. It printed real application events. The production browser rehearsal submitted baseline/variant/retry/invalid inputs, checked Last known rows, compared the exact retry world and matched all four HTTP trace IDs to saved application events. Both service ports were free after shutdown and the prepared morning database remained byte-unchanged.

[Rehearsal result and screenshots](../../test-results/assessment/rehearsal/final/production-rehearsal.json), [launcher and trace evidence](../../test-results/assessment/rehearsal/final/launcher-evidence.json), [real log excerpt](../../test-results/assessment/rehearsal/final/application-excerpt.jsonl). Rehearsal screenshots are headless production captures; the separate native foreground checks above establish actual desktop window ownership. External provider requests were blocked during rehearsal; configured-provider availability is not certified.

## Preservation and remaining acceptance

The original 437 database artifacts retain their recorded paths, sizes and modification times; this check did not hash their full contents. The two environment files and 11,471 originally protected files remain unchanged by hash/metadata. Original candidate 6 and the assessment source were archived with hash-verified readback. Task-owned builds, copied databases and raw evidence are additive and separately identified.

[Final preservation check](../../test-results/assessment/assessment-ready/preservation-final.json); [frozen source/archive identity](../../test-results/assessment/assessment-ready/assessment-identity.json); [machine-readable verification](../../test-results/assessment/assessment-ready/verification-summary.json).

The user's existing README `<FILL IN>` placeholder and root-level `npm run dev` snippet were preserved. Use the tested launcher in [START-HERE.md](START-HERE.md); direct frontend npm commands from the root require `--prefix frontend`.

Formal Phase 5 independent critic round 3 and the acceptance/sign-off decisions remain pending. Large synchronous batches, display-pacing findings, configured Video and timed replay retain their stated limitations. No commit or push was performed.

## Step timings and exact commands

| Step | UTC start | Seconds | Exit | Exact command / complete log |
|---|---|---:|---:|---|
| backend-recheck/backend-full-utf8 | 2026-09-24T17:33:41.217Z | 116.745 | 0 | [command](../../test-results/assessment/assessment-ready/backend-recheck/backend-full-utf8.meta.json) · [log](../../test-results/assessment/assessment-ready/backend-recheck/backend-full-utf8.log) |
| backend-recheck/backend-full | 2026-09-24T17:31:44.533Z | 116.420 | 0 | [command](../../test-results/assessment/assessment-ready/backend-recheck/backend-full.meta.json) · [log](../../test-results/assessment/assessment-ready/backend-recheck/backend-full.log) |
| browser/browser-full | 2026-09-24T17:15:06.840Z | 944.893 | 0 | [command](../../test-results/assessment/assessment-ready/browser/browser-full.meta.json) · [log](../../test-results/assessment/assessment-ready/browser/browser-full.log) |
| foreground/foreground-0 | 2026-09-24T17:37:37.775Z | 39.929 | 0 | [command](../../test-results/assessment/assessment-ready/foreground/foreground-0.meta.json) · [log](../../test-results/assessment/assessment-ready/foreground/foreground-0.log) |
| foreground/foreground-10 | 2026-09-24T17:40:36.336Z | 27.471 | 0 | [command](../../test-results/assessment/assessment-ready/foreground/foreground-10.meta.json) · [log](../../test-results/assessment/assessment-ready/foreground/foreground-10.log) |
| foreground/foreground-20 | 2026-09-24T17:41:42.556Z | 31.178 | 0 | [command](../../test-results/assessment/assessment-ready/foreground/foreground-20.meta.json) · [log](../../test-results/assessment/assessment-ready/foreground/foreground-20.log) |
| geometry/backend-exact-timing | 2026-09-24T17:59:29.661Z | 6.816 | 0 | [command](../../test-results/assessment/assessment-ready/geometry/backend-exact-timing.meta.json) · [log](../../test-results/assessment/assessment-ready/geometry/backend-exact-timing.log) |
| geometry/frontend-exact-timing | 2026-09-24T17:59:36.684Z | 3.211 | 0 | [command](../../test-results/assessment/assessment-ready/geometry/frontend-exact-timing.meta.json) · [log](../../test-results/assessment/assessment-ready/geometry/frontend-exact-timing.log) |
| integration/backend-full-utf8 | 2026-09-24T17:13:08.052Z | 80.719 | 1 | [command](../../test-results/assessment/assessment-ready/integration/backend-full-utf8.meta.json) · [log](../../test-results/assessment/assessment-ready/integration/backend-full-utf8.log) |
| integration/backend-full | 2026-09-24T17:11:46.656Z | 81.143 | 1 | [command](../../test-results/assessment/assessment-ready/integration/backend-full.meta.json) · [log](../../test-results/assessment/assessment-ready/integration/backend-full.log) |
| measure/backend-ab | 2026-09-24T17:55:33.552Z | 193.594 | 0 | [command](../../test-results/assessment/assessment-ready/measure/backend-ab.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/backend-ab.log) |
| measure/concurrency-m1-m2 | 2026-09-24T17:42:53.441Z | 313.241 | 0 | [command](../../test-results/assessment/assessment-ready/measure/concurrency-m1-m2.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/concurrency-m1-m2.log) |
| measure/concurrency-m9 | 2026-09-24T17:48:08.936Z | 322.931 | 0 | [command](../../test-results/assessment/assessment-ready/measure/concurrency-m9.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/concurrency-m9.log) |
| measure/decode-ab | 2026-09-24T17:54:41.559Z | 51.774 | 0 | [command](../../test-results/assessment/assessment-ready/measure/decode-ab.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/decode-ab.log) |
| measure/geometry-frames | 2026-09-24T17:54:36.674Z | 4.641 | 0 | [command](../../test-results/assessment/assessment-ready/measure/geometry-frames.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/geometry-frames.log) |
| measure/probe-dense100 | 2026-09-24T17:54:10.942Z | 6.095 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-dense100.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-dense100.log) |
| measure/probe-dense200 | 2026-09-24T17:54:17.284Z | 19.155 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-dense200.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-dense200.log) |
| measure/probe-dense50 | 2026-09-24T17:54:07.575Z | 3.137 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-dense50.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-dense50.log) |
| measure/probe-golden | 2026-09-24T17:53:32.099Z | 2.076 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-golden.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-golden.log) |
| measure/probe-local40 | 2026-09-24T17:53:34.439Z | 2.590 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-local40.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-local40.log) |
| measure/probe-remote40 | 2026-09-24T17:53:37.290Z | 2.816 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-remote40.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-remote40.log) |
| measure/probe-sparse10000 | 2026-09-24T17:53:40.316Z | 27.029 | 0 | [command](../../test-results/assessment/assessment-ready/measure/probe-sparse10000.meta.json) · [log](../../test-results/assessment/assessment-ready/measure/probe-sparse10000.log) |
| prereq/build-test | 2026-09-24T17:10:56.975Z | 5.241 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/build-test.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/build-test.log) |
| prereq/build | 2026-09-24T17:10:44.365Z | 12.389 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/build.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/build.log) |
| prereq/contracts-backend | 2026-09-24T17:10:17.039Z | 2.433 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/contracts-backend.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/contracts-backend.log) |
| prereq/contracts-check | 2026-09-24T17:10:41.756Z | 1.195 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/contracts-check.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/contracts-check.log) |
| prereq/contracts-foundation-check | 2026-09-24T17:10:43.188Z | 0.973 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/contracts-foundation-check.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/contracts-foundation-check.log) |
| prereq/format-check | 2026-09-24T17:10:35.907Z | 5.601 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/format-check.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/format-check.log) |
| prereq/foundation | 2026-09-24T17:10:16.208Z | 0.594 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/foundation.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/foundation.log) |
| prereq/lint | 2026-09-24T17:10:30.302Z | 5.340 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/lint.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/lint.log) |
| prereq/repository | 2026-09-24T17:10:19.717Z | 1.656 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/repository.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/repository.log) |
| prereq/typecheck | 2026-09-24T17:10:21.623Z | 8.447 | 0 | [command](../../test-results/assessment/assessment-ready/prereq/typecheck.meta.json) · [log](../../test-results/assessment/assessment-ready/prereq/typecheck.log) |
| storage/storage-limit | 2026-09-24T18:00:55.683Z | 22.270 | 0 | [command](../../test-results/assessment/assessment-ready/storage/storage-limit.meta.json) · [log](../../test-results/assessment/assessment-ready/storage/storage-limit.log) |
| system/corpus | 2026-09-24T17:14:33.036Z | 27.425 | 0 | [command](../../test-results/assessment/assessment-ready/system/corpus.meta.json) · [log](../../test-results/assessment/assessment-ready/system/corpus.log) |
| unit/frontend-unit | 2026-09-24T17:11:02.503Z | 43.916 | 0 | [command](../../test-results/assessment/assessment-ready/unit/frontend-unit.meta.json) · [log](../../test-results/assessment/assessment-ready/unit/frontend-unit.log) |
