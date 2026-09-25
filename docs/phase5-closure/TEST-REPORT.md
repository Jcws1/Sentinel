# Phase 5 closure — test report (candidate 5)

Independent test-runner execution. This report records what ran and what the
evidence shows; it does not interpret beyond the evidence and does not claim
acceptance.

## 1. Header

| Item | Value |
| --- | --- |
| Candidate | candidate 5, frozen 2026-09-24T12:12:57Z |
| HEAD | `f98de4f183b27df947fb914893deb2e688b598b0` (branch `v3`) |
| Candidate digest | `27758cb477e1c32902624d5ad656835b1cdcda0bbcecf79127a106d5e429fff9` (668 non-documentation files) |
| Runner run window | 2026-09-24T12:20:00Z – 2026-09-24T13:06:26Z UTC (≈46.4 min, continuous, no interruption) |
| Identity before == frozen digest | Yes |
| Identity after == frozen digest | Yes |
| Identity before == identity after | Yes (668/668 files, digest unchanged; `candidate.json` byte-identical except the `capturedAt` timestamp) |

## 2. Step summary

| Step | Hard gate(s) | Result | Key counts | Duration | Raw path |
| --- | --- | --- | --- | --- | --- |
| S0 Identity (before) | — | PASS | candidateFiles 668, digest `27758cb4…` matches frozen value, HEAD matches; `git-status-before.txt` 52 lines; `phase0-verification.json` sha256 `02e85037…` recorded | 22.0 s | `test-results/phase5-closure/gate-c5/identity/before.log`, `identity-before/candidate.json`, `git-status-before.txt` |
| S1 Prerequisites | G1 | PASS | all 10 commands exit 0 (verify_phase0, export_contracts --check, check_repository, typecheck, lint, format:check, contracts:check, contracts:foundation:check, build, build:test); `contracts/phase0-verification.json` sha256 `02e85037bb7e051671ed8007fbee718880062d89215fe89f3476ae58a87b2f4b` unchanged before verify_phase0, after verify_phase0, and after full S1 | 55.6 s total | `test-results/phase5-closure/gate-c5/prereq/*.log` |
| S2 Unit (frontend) | G2 | PASS | numTotalTests 579, numPassedTests 579, numFailedTests 0, numPendingTests 0; 75 suites across 50 files; `exactGeometry.test.ts` 1.139 s, `simulation-client.test.ts` 0.035 s | 46.4 s | `test-results/phase5-closure/gate-c5/unit/frontend-unit.json` |
| S3 Integration (backend, canonical) | G2 | PASS | tests 680, failures 0, errors 0, skipped 0; summed durations `test_geometry_exact.py`+`test_geometry_history.py`+`test_defensive_scenario.py` = 16.371 s | 111.9 s | `test-results/phase5-closure/gate-c5/integration/backend-full.junit.xml` |
| S3 extra (backend, `PYTHONUTF8=1`) | — (not gating) | PASS | tests 680, failures 0, errors 0, skipped 0 — identical to canonical; same three-file sum 15.587 s | 104.0 s | `test-results/phase5-closure/gate-c5/integration/backend-full-utf8.junit.xml` |
| S4 System corpus | G6, G4 (golden) | PASS | cases 386, failures 0, requests 357, serverErrors 0, statusCounts {200:220, 400:3, 409:13, 422:121}, portsFree true, 3 database files removed; restart case "prepared command becomes interrupted after process death": durableStateBeforeKill=`pending`, restored=`interrupted` | 27.3 s | `test-results/phase5-closure/gate-c5/system/system_corpus.log`, `test-results/simulation-system/p5c-c5/summary.json`, `cases.json` |
| S5 Browser (complete suite) | G3, M8 | PASS | expected 129, skipped 0, unexpected 0, flaky 0; 0 tests with >1 result attempt; 0 root errors; all statuses `expected`; cleanup database deleted true | 877.4 s (14.62 min) | `test-results/phase5-closure/gate-c5/browser/raw/browser/results.json` |
| S6 Foreground (0 / 10 / 20) | G5 (UI), G7 (UI) | PASS | 3/3 runs exit 0; 9 cases total (7+1+1); errors [] / externalRequests [] on all three; 24/24 foreground checks `taskBrowserPidMatched: true`; all cleanups `servicesStopped: true`, `cleanupOk: true`, database `deleted: true`; one transient `foreground-waiting.json` on fg-20 (see §5 item 1) | 65.3 s / 27.4 s / 139.9 s | `test-results/phase5-closure/gate-c5/foreground/p5c-c5-fg-{0,10,20}/result.json` |
| M1–M2 Concurrency | G8 | PASS (disclosed) | 9 runs (control/local40/sparse10000 × 3); all local40 `withinBudget: true`; all 9 `sequenceContinuous: true`, `missingSequences: []`, `resyncOrSnapshotInWindow: []` | 312.0 s | `test-results/simulation-concurrency/p5c-c5/summary.json` |
| M3 Existing probes | G8 | PASS (disclosed) | 7/7 kinds exit 0; golden/local40/remote40 warm median < 1 s; sparse10000 warm median 6.19 s < 30 s, peak RSS 176.71 MiB < 2 GiB; dense50/100/200 disclosed; `databaseRemoved: true` on all 28 (7×4) runs | 63.6 s total | `test-results/phase5-simulation-compatibility/p5c-c5-{kind}/summary.json` |
| M4 Frontend decode A/B | G5 | PASS | worstDecodeMedianRatio 1.0119 (interactive-default) ≤ budget 1.05; `withinBudget: true`; baseline verified byte-identical to `git show HEAD:frontend/src/contracts/integrity.ts` (sha256 `1a4cc69c…` both sides) | 29.2 s (2 commands) | `test-results/phase5-closure/gate-c5/measure/decode-ab.json` |
| M5 Backend validation A/B | — (secondary/diagnostic budget) | PASS | worstMedianRatio 1.0647 (tactical-fixture) ≤ budget 1.10; `withinBudget: true`; baseline-root verified: 325/325 files match `git archive HEAD` for `backend/app`, `backend/tests`, `contracts`, 0 mismatches after CRLF/LF normalization | 102.2 s | `test-results/phase5-closure/gate-c5/measure/backend-ab.json` |
| M7 Storage limit + §9 body check | — (disclosed measurement) | **PASS (complete)** | Full doubling-then-bisection run, exit 0: largestPersistedDrones 9,687 / 2,283,322 bytes, firstRefusedDrones 9,750, 12 attempts total; §9 largest command body = 45,102 bytes (1.98% of the persisted ceiling); file = 225,167 bytes. Contrast with candidate 4, which crashed INCOMPLETE at the 16,000-drone doubling step (see §7) | 229.7 s | `test-results/phase5-closure/gate-c5/storage/storage_limit.log`, `p5c-c5-storage/attempts.json`, `summary.json`, `cleanup.json` |
| S12 Identity (after) + cleanup | — | PASS | candidateFiles 668, digest `27758cb4…` matches frozen value and identity-before; all 12 listed ports free (8000/5180 untouched); `frontend/test-results/` empty; `git status --porcelain=v1 -uall` byte-identical before/after (52/52 lines) | 24.4 s | `test-results/phase5-closure/gate-c5/identity/after.log`, `identity-after/candidate.json`, `git-status-after.txt` |

**Overall: every step PASSED, including M7 (storage-limit probe).** Candidate
5's fix (the probe now waits for the page to finish rendering before querying
it) resolved candidate 4's crash: the run went past the 16,000-drone doubling
step that previously timed out after 30 s, continued through bisection, and
produced a complete `summary.json` with a final persisted-size ceiling. All
other steps, including all hard gates within this gate's scope (S0–S6,
M1–M5), also passed, with no failures, retries, or skips anywhere in the run.
See §5 for the one transient anomaly (a brief foreground-wait on fg-20, well
under the 3-minute threshold, not escalated).

## 3. Measurements vs budgets

| ID | Result | Budget | Status |
| --- | --- | --- | --- |
| M1 local40 max arrival gap | run1 239.06 ms, run2 260.28 ms, run3 285.93 ms | ≤ 750 ms each run | PASS (all 3) |
| M2 sparse10000 (disclose) | max arrival gap 5172.62 / 5638.80 / 5629.31 ms; `sequenceContinuous: true`, `missingSequences: []`, `resyncOrSnapshotInWindow: []` on all 3 | no budget; zero loss/reorder/resync required | Disclosed — zero loss/reorder/resync on all 3 runs |
| M3 golden/local40/remote40 warm median | 38.58 ms / 157.97 ms / 166.89 ms | < 1 s | PASS (all 3) |
| M3 sparse10000 warm median / peak RSS | 6.192 s / 176.71 MiB (185,298,944 bytes) | < 30 s and < 2 GiB | PASS |
| M3 dense50/100/200 (disclose) | warm median 319.67 / 1085.45 / 4334.70 ms; peak RSS 72.85 / 90.55 / 107.25 MiB | no budget | Disclosed |
| M4 frontend decode A/B | worst decode median ratio 1.0119 (interactive-default) | ≤ 1.05 | PASS |
| M5 backend validation A/B | worst median ratio 1.0647 (tactical-fixture, tightest margin) | ≤ 1.10 | PASS |
| M6 differential/geometry tests | 0 failures in `test_geometry_exact.py` (98 tests, 3.779 s), `test_geometry_history.py` (1 test, 0.196 s), from S3, and `exactGeometry.test.ts` (1.139 s) from S2; all three ≤ 10 s | zero disagreements; each file ≤ 10 s | PASS |
| M7 browser storage limit (disclose) | largest persisted+sent: 9,687 drones / 2,283,322 bytes; first refused: 9,750 drones; §9 largest command body 45,102 bytes = **1.98%** of the persisted ceiling; whole §9 file 225,167 bytes | measure and document; §9 UI dataset ≤ 50% of largest persisted body | PASS (1.98% ≤ 50%) |
| M8 browser gate | expected 129/129, skipped 0, unexpected 0, flaky 0, 0 multi-attempt tests, from S5 | 100% expected; 0 skipped/flaky/retried/errored | PASS |

Full per-frame M3/M4/M5 breakdowns and per-run M1/M2 breakdowns are below and
in the referenced JSON files.

### M1/M2 per-run detail (concurrency harness, `p5c-c5`)

All times ms unless noted. "Renew" = the whole control action (intent +
command). Overlap = `renewLatencyOverlappingBatchMs` (count/max).

| Kind | Ord | Arrival max/p99/p95/med | Pub max | EL max | EL>50ms | Renew med/max | RenewIntent max | RenewCmd max | RenewStartGap max | Overlap cnt/max | Deltas recv/pub | SeqCont | Missing | Resync | Batch ms/status | local40 withinBudget |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| control | 1 | 237.62/226.75/220.01/179.19 | 226.63 | 90.94 | 127 | 170.37/196.19 | 83.88 | 170.82 | 1022.79 | 0/— | 126/127 | true | [] | [] | — | — |
| local40 | 1 | 239.06/236.35/220.43/176.07 | 234.09 | 145.90 | 127 | 175.37/343.83 | 121.29 | 285.93 | 1025.20 | 1/343.83 | 126/126 | true | [] | [] | 247.75/200 | **true** |
| sparse10000 | 1 | 5172.62/5172.62/248.36/183.62 | 5219.73 | 5051.88 | 97 | 186.89/5406.81 | 5322.26 | 175.26 | 5407.11 | 2/5406.81 | 92/94 | true | [] | [] | 6316.30/200 | — |
| control | 2 | 249.60/234.17/219.23/179.35 | 233.45 | 99.26 | 127 | 182.04/257.02 | 106.23 | 178.61 | 1020.78 | 0/— | 126/127 | true | [] | [] | — | — |
| local40 | 2 | 260.28/241.82/225.47/179.26 | 231.37 | 141.12 | 127 | 188.98/336.09 | 228.16 | 183.21 | 1017.73 | 1/336.09 | 126/126 | true | [] | [] | 250.09/200 | **true** |
| sparse10000 | 2 | 5638.80/5638.80/246.45/182.33 | 5627.61 | 5529.16 | 92 | 184.68/5957.27 | 5888.99 | 451.22 | 5957.58 | 2/5957.27 | 89/89 | true | [] | [] | 6871.66/200 | — |
| control | 3 | 263.44/248.24/224.74/179.15 | 237.07 | 119.98 | 126 | 168.10/221.66 | 83.33 | 192.03 | 1022.77 | 0/— | 126/126 | true | [] | [] | — | — |
| local40 | 3 | 285.93/283.99/247.98/180.15 | 275.60 | 192.33 | 126 | 185.07/369.08 | 211.35 | 185.46 | 1022.12 | 1/369.08 | 124/125 | true | [] | [] | 307.88/200 | **true** |
| sparse10000 | 3 | 5629.31/5629.31/225.96/182.16 | 5564.87 | 5426.38 | 93 | 164.42/5963.43 | 5882.72 | 193.04 | 5963.72 | 2/5963.43 | 92/91 | true | [] | [] | 6871.90/200 | — |

`providerRequests: 0`; `cleanup[]` shows `portFree: true` and all database
files removed for all 9 runs (control-{1,2,3}, local40-{1,2,3},
sparse10000-{1,2,3}).

### M3 per-kind detail

| Kind | Cold totalMs (ord. 0) | Warm range (3 repeats) | Max eventLoopMaxGapMs | Max sampledPeakRssBytes | afterNormalClose DB bytes | eligibleOutputPairs | inputRows | databaseRemoved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| golden | 45.03 ms | 35.06–39.77 ms (median 38.58) | 44.63 ms | 61,095,936 (58.27 MiB) | 167,936 | 1 | 2 | true (all 4) |
| local40 | 159.13 ms | 155.20–172.57 ms (median 157.97) | 172.40 ms | 70,737,920 (67.46 MiB) | 589,824 | 116 | 80 | true (all 4) |
| remote40 | 160.24 ms | 158.46–171.79 ms (median 166.89) | 171.64 ms | 70,111,232 (66.86 MiB) | 589,824 | 116 | 80 | true (all 4) |
| sparse10000 | 6433.09 ms | 6156.62–6386.13 ms (median 6191.83) | 5500.11 ms | 185,298,944 (176.71 MiB) | 22,765,568 | 0 | 10,000 | true (all 4) |
| dense50 | 302.94 ms | 318.86–330.41 ms (median 319.67) | 330.24 ms | 76,390,400 (72.85 MiB) | 1,732,608–1,736,704 (varies by run) | 625 | 50 | true (all 4) |
| dense100 | 1065.36 ms | 1063.75–1111.63 ms (median 1085.45) | 1085.25 ms | 94,945,280 (90.55 MiB) | 6,291,456–6,311,936 (varies by run) | 2,500 | 100 | true (all 4) |
| dense200 | 4345.63 ms | 4269.34–4381.98 ms (median 4334.70) | 4198.87 ms | 112,463,872 (107.25 MiB) | 24,563,712–24,576,000 (varies by run) | 10,000 | 200 | true (all 4) |

### M4 per-frame detail (budget ≤ 1.05, tracked-fixture frames)

| Frame | decodeMedianRatio | baseline ms | candidate ms | integrityMedianRatio (diagnostic) |
| --- | --- | --- | --- | --- |
| interactive-remote-20v20 | 0.9900 | 1.5075 | 1.5044 | 1.0353 |
| interactive-default | **1.0119** | 0.2537 | 0.2627 | 1.0447 |
| external-golden | 1.0095 | 0.0890 | 0.0910 | 1.0486 |
| external-local40 | 0.9993 | 1.3963 | 1.4071 | 1.0472 |
| external-remote40 | 0.9902 | 1.4051 | 1.3860 | 1.0488 |
| external-s9-north | 0.9923 | 1.4387 | 1.4246 | 1.0272 |
| tactical-fixture | 1.0006 | 0.0852 | 0.0854 | 1.0454 |

**Diagnostic frames (101-position, reported separately, outside budget scope):**

| Frame | decodeMedianRatio | baseline ms | candidate ms | integrityMedianRatio |
| --- | --- | --- | --- | --- |
| diagnostic-ordinary-101 | 0.9168 | 0.2174 | 0.1997 | 0.7912 |
| diagnostic-mixed-exponent-101 | 0.9077 | 0.2268 | 0.2070 | 0.7907 |
| diagnostic-subnormal-101 | 1.8828 | 0.2365 | 0.4549 | 2.6012 |

Baseline `frontend/.cache/p5c-bench/integrity.baseline.ts` verified
byte-identical to `git show HEAD:frontend/src/contracts/integrity.ts` before
use (sha256 `1a4cc69c629d5fcc45e02a350f7df23dd7f203191ce71d48e50c9d08769fc5e1`
both sides).

### M5 per-frame detail (budget ≤ 1.10, tracked-fixture frames)

| Frame | medianRatio | ratioP90 | baseline ms | candidate ms |
| --- | --- | --- | --- | --- |
| interactive-remote-20v20 | 1.0020 | 1.1337 | 3.7669 | 3.7514 |
| interactive-default | 1.0342 | 1.0887 | 0.7355 | 0.7535 |
| external-golden | 1.0301 | 1.1152 | 0.2103 | 0.2152 |
| external-local40 | 1.0167 | 1.1144 | 3.7501 | 3.7938 |
| external-remote40 | 1.0133 | 1.0738 | 3.1894 | 3.2157 |
| external-s9-north | 1.0049 | 1.0513 | 3.9333 | 3.9220 |
| tactical-fixture | **1.0647** | 1.1370 | 0.1757 | 0.1861 |

**Diagnostic frames (101-position, reported separately, outside budget scope):**

| Frame | medianRatio | ratioP90 | baseline ms | candidate ms |
| --- | --- | --- | --- | --- |
| diagnostic-ordinary-101 | 0.2733 | 0.2862 | 13.2121 | 3.6100 |
| diagnostic-mixed-exponent-101 | 0.4142 | 0.4368 | 13.1879 | 5.5187 |
| diagnostic-subnormal-101 | 0.3001 | 0.3166 | 13.2359 | 3.9793 |

Baseline root `.cache/p5c-baseline-src` verified: 325/325 files across
`backend/app`, `backend/tests`, `contracts` match `git archive HEAD`, same
file list, 0 content mismatches once CRLF/LF line endings are normalized
(comparison done via a byte-level diff with `\r\n`→`\n` normalization on both
sides; baseline-src carries CRLF, git blobs are LF — cosmetic only).

### M7 detail (complete)

`attempts.json` — full doubling-then-bisection sequence:

| Drones | bodyBytes | draftStoredChars | draftSaved | persistedAndSent |
| --- | --- | --- | --- | --- |
| 1,000 | 236,063 | 270,230 | true | true |
| 2,000 | 471,790 | 539,957 | true | true |
| 4,000 | 943,083 | 1,079,250 | true | true |
| 8,000 | 1,885,830 | 2,157,997 | true | true |
| 16,000 | 3,771,165 | 4,315,332 | true | **false** (browser storage full, refused) |
| 12,000 | 2,828,598 | 3,236,765 | true | false |
| 10,000 | — | — | true | false |
| 9,000 | — | — | true | true |
| 9,500 | — | — | true | true |
| 9,750 | — | — | true | false |
| 9,625 | — | — | true | true |
| 9,687 | — | — | true | true |

`summary.json`: `largestPersistedDrones: 9687`, `largestPersistedBodyBytes:
2,283,322`, `firstRefusedDrones: 9750`, `attempts: 12`. `cleanup.json`:
`servicesStopped: true`, `cleanupOk: true`, database `deleted: true`; ports
8225/5425 confirmed free immediately afterward. Unlike candidate 4, the
16,000-drone attempt this time returned a normal refusal
(`persistedAndSent: false`, "Browser storage is full…") instead of a 30 s
`locator.isEnabled` timeout, and the harness proceeded through bisection to
completion.

§9 fixture (`frontend/tests/fixtures/simulation/defensive-s9.json`, 225,167
bytes on disk): 8 commands across 2 missions (`north`, `south`). Largest
single command body, serialized exactly as the UI helper submits it
(`JSON.stringify(body, null, 2)`, UTF-8 byte length via Node — matching
`submitSimulation()` in `frontend/tests/support/simulation-ui.mjs:28`):

| Mission | command_id | action | Bytes |
| --- | --- | --- | --- |
| south | S9-S-START | START | **45,102** |
| north | S9-N-START | START | 45,098 |
| south | S9-S-RESUME | RESUME | 25,053 |
| north | S9-N-RESUME | RESUME | 25,050 |
| south | S9-S-HOLD | HOLD | 13,260 |
| north | S9-N-HOLD | HOLD | 13,258 |
| north | S9-N-ABORT | ABORT | 1,580 |
| south | S9-S-ABORT | ABORT | 1,580 |

Largest body = 45,102 bytes against the largest persisted ceiling
(2,283,322 bytes) = **1.9753%**, well under the ≤ 50% rule.

## 4. Command ledger

All commands ran from repository root unless `cwd` says otherwise. Every row
is sourced from its `*.meta.json`. No secret values are recorded (none were
needed). Start times are UTC time-of-day on 2026-09-24.

| Label | Command (argv, `env` overrides shown as passed) | cwd | Start UTC | Duration (s) | Exit |
| --- | --- | --- | --- | --- | --- |
| identity before | `backend/.venv/Scripts/python.exe test-results/phase5-closure/tools/inventory.py test-results/phase5-closure/gate-c5/identity-before` | . | 12:20:00.056 | 22.019 | 0 |
| verify_phase0 | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/verify_phase0.py` | . | 12:20:58.003 | 0.618 | 0 |
| export_contracts_check | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/export_contracts.py --check` | . | 12:20:58.908 | 2.427 | 0 |
| check_repository | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/check_repository.py` | . | 12:21:01.607 | 1.602 | 0 |
| typecheck | `npm --prefix frontend run typecheck` | . | 12:21:03.463 | 8.196 | 0 |
| lint | `npm --prefix frontend run lint` | . | 12:21:11.904 | 5.731 | 0 |
| format_check | `npm --prefix frontend run format:check` | . | 12:21:17.913 | 6.169 | 0 |
| contracts_check | `npm --prefix frontend run contracts:check` | . | 12:21:24.342 | 1.366 | 0 |
| contracts_foundation_check | `npm --prefix frontend run contracts:foundation:check` | . | 12:21:26.002 | 3.119 | 0 |
| frontend_build | `npm --prefix frontend run build -- --outDir dist-p5c-c5` | . | 12:21:29.378 | 12.994 | 0 |
| frontend_build_test | `env SENTINEL_TEST_BUILD_SUFFIX=-p5c-c5 npm --prefix frontend run build:test` | . | 12:21:42.676 | 5.093 | 0 |
| frontend_unit | `npm --prefix frontend test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=…/gate-c5/unit/frontend-unit.json` | . | 12:21:56.261 | 46.397 | 0 |
| backend_full | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests -p no:cacheprovider --junitxml=…/backend-full.junit.xml` | . | 12:22:52.228 | 111.856 | 0 |
| backend_full_utf8 | same, plus `env PYTHONUTF8=1`, `--junitxml=…/backend-full-utf8.junit.xml` | . | 12:24:47.761 | 104.024 | 0 |
| system_corpus | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/simulation_system_corpus.py p5c-c5 --build dist-test-p5c-c5` | . | 12:26:54.864 | 27.270 | 0 |
| test_browser | `env SENTINEL_TEST_BUILD_SUFFIX=-p5c-c5 npm --prefix frontend run test:browser` | . | 12:27:37.046 | 877.368 | 0 |
| fg_0 | `env PHASE5_BUILD=dist-verification-p5c-c5 PHASE5_EVIDENCE_ROOT=../test-results/phase5-closure/gate-c5/foreground PHASE5_FOREGROUND_WAIT_MS=900000 node tests/simulation-ui/foreground.mjs p5c-c5-fg-0 0` | frontend | 12:43:39.058 | 65.274 | 0 |
| fg_10 | same, tag `p5c-c5-fg-10`, arg `10` | frontend | 12:45:04.169 | 27.440 | 0 |
| fg_20 | same, tag `p5c-c5-fg-20`, arg `20` | frontend | 12:45:55.062 | 139.925 | 0 |
| concurrency | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/performance_simulation_concurrency.py p5c-c5 --repeats 3` | . | 12:49:07.397 | 311.998 | 0 |
| perf_golden | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/performance_simulation.py p5c-c5-golden --kind golden` | . | 12:55:06.986 | 2.075 | 0 |
| perf_local40 | same, `p5c-c5-local40 --kind local40` | . | 12:55:09.284 | 2.599 | 0 |
| perf_remote40 | same, `p5c-c5-remote40 --kind remote40` | . | 12:55:12.162 | 2.599 | 0 |
| perf_sparse10000 | same, `p5c-c5-sparse10000 --kind sparse10000` | . | 12:55:15.027 | 27.338 | 0 |
| perf_dense50 | same, `p5c-c5-dense50 --kind dense50` | . | 12:55:42.587 | 3.238 | 0 |
| perf_dense100 | same, `p5c-c5-dense100 --kind dense100` | . | 12:55:46.062 | 6.304 | 0 |
| perf_dense200 | same, `p5c-c5-dense200 --kind dense200` | . | 12:55:52.593 | 19.488 | 0 |
| geometry_frames | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/performance_geometry.py frames …/gate-c5/measure/frames.json` | . | 12:56:36.926 | 4.626 | 0 |
| decode_ab | `node tests/performance/decode-integrity.mjs ../…/frames.json .cache/p5c-bench/integrity.baseline.ts ../…/decode-ab.json 30 20` | frontend | 12:56:44.810 | 24.596 | 0 |
| backend_ab | `env PYTHONDONTWRITEBYTECODE=1 backend/.venv/Scripts/python.exe scripts/performance_geometry.py backend …/frames.json --baseline-root .cache/p5c-baseline-src --rounds 30 --iterations 20 --out …/backend-ab.json` | . | 12:57:42.210 | 102.247 | 0 |
| storage_limit | `env PHASE5_BUILD=dist-verification-p5c-c5 PHASE5_EVIDENCE_ROOT=../test-results/phase5-closure/gate-c5/storage node tests/simulation-ui/storage-limit.mjs p5c-c5-storage` | frontend | 12:59:41.326 | 229.740 | 0 |
| identity after | `backend/.venv/Scripts/python.exe test-results/phase5-closure/tools/inventory.py test-results/phase5-closure/gate-c5/identity-after` | . | 13:06:01.683 | 24.422 | 0 |

## 5. Failures and anomalies

1. **Transient foreground-wait on fg-20 (not a candidate issue, resolved
   without escalation).** During the fg_20 run, `foreground-waiting.json`
   appeared in `p5c-c5-fg-20/` at 12:45:58.420Z with reason "Task browser is
   not OS foreground (hwnd 460616, PID match false)". It was observed present
   on one poll and cleared by the next (≈60–100 s later, well under the 3-min
   threshold in the runner instructions), after which the run completed
   normally (exit 0, `completed` timestamp 12:48:13.602Z, all 2 foreground
   checks for that run `taskBrowserPidMatched: true`). The run was not killed
   and no timeout was changed. This accounts for fg_20's longer duration
   (139.9 s) versus fg_0/fg_10 (65.3 s / 27.4 s).

2. **M7 storage-limit probe is now COMPLETE (exit 0), where candidate 4's was
   INCOMPLETE.** Candidate 4 crashed with a 30 s `locator.isEnabled` timeout
   waiting for the Submit button while the page rendered a 16,000-drone
   draft, before any doubling attempt beyond 8,000 could be confirmed and
   before `summary.json` could be written. Candidate 5's fix (the probe waits
   for the page to finish rendering before querying it) let the 16,000-drone
   attempt return a normal, fast refusal (`persistedAndSent: false`,
   "Browser storage is full…") instead of timing out, and the harness
   proceeded through bisection (16,000 → 12,000 → 10,000 → 9,000 → 9,500 →
   9,750 → 9,625 → 9,687) to a final ceiling: `largestPersistedDrones: 9687`
   (2,283,322 bytes), `firstRefusedDrones: 9750`. `cleanup.json` shows
   `servicesStopped: true`, `cleanupOk: true`, database `deleted: true`;
   ports 8225/5425 confirmed free immediately afterward. This let the §9
   ≤ 50% rule be checked against a real ceiling for the first time (result:
   1.98%, see §3 M7 detail), where candidate 4 could only report the
   fixture's own numbers with no computable percentage.

3. **M5 tightest margin.** `tactical-fixture` at medianRatio 1.0647 is the
   closest of the seven M5 tracked-fixture frames to the 1.10 budget (next
   closest: `external-golden` at 1.0301). Still within budget; noted for
   visibility since it is the smallest frame by absolute time (0.176 ms
   baseline), where process/measurement noise has the largest relative
   effect. The same frame is also close to M4's tightest margin territory,
   though `interactive-default` was the actual M4 worst this run (1.0119).

4. **M2/M3 sparse10000 deltasReceived vs. deltasPublished differ within the
   20 s measurement window** (e.g. run 1: 92 received vs. 94 published).
   `sequenceContinuous: true`, `missingSequences: []`, and
   `resyncOrSnapshotInWindow: []` hold on every sparse10000 run, so no loss,
   reorder, or resync is indicated; the raw counts are disclosed here as
   read from `summary.json` without further interpretation.

5. **No other timeouts, retries, or skipped steps.** Every command in §4 ran
   exactly once, to completion, with its recorded exit code taken as final.
   No command was retried, no timeout was changed, and no step was skipped.
   The full run (S0–S12) completed in one continuous ≈46.4-minute window with
   no runner-side interruption.

## 6. Environment notes

| Tool | Version (as used) |
| --- | --- |
| OS | Windows 10 Home 10.0.19045 |
| Python (`backend/.venv/Scripts/python.exe`) | 3.10.11 |
| Node | v24.20.0 |
| npm | 11.19.0 |
| Edge (from Playwright/foreground results) | 153.0.4234.48 |
| `PYTHONUTF8` | Unset for all canonical runs; the one explicit `PYTHONUTF8=1` backend rerun (S3 extra) is recorded separately in §2/§4 and produced identical results (680/680, 0/0/0) |
| Neutral overrides used throughout | `PYTHONDONTWRITEBYTECODE=1`, pytest `-p no:cacheprovider` |

Builds used throughout: `frontend/dist-p5c-c5` (plain build, S1),
`frontend/dist-test-p5c-c5` (from `build:test`, used by S4), and the
pre-existing `frontend/dist-verification-p5c-c5` (used read-only by S6/M7,
not built by this runner). The operator's configured `frontend/dist` was
never built or touched.

`frontend/test-results/browser` and `frontend/test-results/playwright`
(created by the S5 run) were copied to
`test-results/phase5-closure/gate-c5/browser/raw/`, verified with `diff -r`
(identical), then removed from `frontend/test-results/`, which was confirmed
empty at S12.

## 7. Earlier attempts

- Candidate 1's gate report: [`test-results/phase5-closure/gate-c1/TEST-REPORT.md`](../../test-results/phase5-closure/gate-c1/TEST-REPORT.md) — every gate passed except one G1 prerequisite command (`format:check`, CRLF issue in a documentation file, `frontend/tests/README.md`); candidate 5's S1 `format_check` passed cleanly (see §2, §4).
- Candidate 4's gate report: [`test-results/phase5-closure/gate-c4/TEST-REPORT.md`](../../test-results/phase5-closure/gate-c4/TEST-REPORT.md) — everything passed except M7 (storage-limit probe), INCOMPLETE: it crashed on a 30 s Submit-button timeout at the 16,000-drone doubling step before establishing a final ceiling; candidate 5's M7 completed fully (see §2, §3, §5 item 2).
