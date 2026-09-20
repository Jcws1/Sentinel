# Milestone 1 verification

This ledger separates functional, recovery, storage, display and Details gates.
The complete final browser JSON and wrapper exit were read, not inferred from a
passing subset or log tail. Archive/cleanup status is finalized in [EVIDENCE](EVIDENCE.md).

| Gate | Evidence | Final decision |
| --- | --- | --- |
| Functional regression | Final production: 414 frontend tests in 42 files; 438 backend tests; complete 118/118 browser suite, zero failures/skips/flakes/retries/global errors, wrapper exit 0. Required static/contracts/guards/build/repository checks pass. | Accept within Milestone 1 scope |
| Recovery | Exact canonical baseline goldens, strict historical/current readers, malformed envelopes, interrupted transactions and rollback-before-publication tests; final foreground Sydney forty-unit and fault workflows and complete browser suite pass. | Accept affected recovery boundaries |
| Recording efficiency | Matched default/Sydney 10v10/20v20 probes, independent reproduction and both ten-minute soaks; stored bytes/frame −93.20%, closed DB bytes/frame −92.72%. | Accept for measured workloads; cumulative physical writes not measured |
| Validation | Cold/warm exact-revision measurements; cooperative cold analysis preserves source publication; cache invalidation/coalescing/cancellation and complete regressions pass. | Accept measured responsiveness; retain first cold-sample miss and adverse helper timing |
| Resume | Round 2 reproduced 5,179.6 ms before receipt, mostly before dispatch; two instrumented repeats were fast. Two deterministic dropped-read regressions fail before the coalesced-refresh correction; all 22 affected tests pass after it. Fresh critic independently reproduces corrected real-UI read coalescing; six final Resume helper samples 175–325 ms. | Demonstrated race corrected; original outlier attribution remains uncertain |
| Display | Complete matched actual-desktop grid captures; 3/10 final feature-complete windows pass. Several >50 ms stalls, up to 208.288 ms in final 20v20 3D+Video. | Fail strict acceptance; no display-improvement claim |
| Configured Video | Actual Google content/overlays/attribution captured. Budget stop at 3,516 of 4,000 observed attempts, 3,500 through dispatch gate; no complete compositor window, hidden/reopen not reached. | Open; no further provider attempt this pass |
| Details UI | Final source and all three critics verify both supplied photos, explicit mapping, fallback/failure, pin/follow, keyboard, recorded inspection and 760/820/900 layouts; dedicated case and complete browser suite pass. | Accept within tested layouts/workflows |
| Independent review | Round 1: 8.6; round 2: 8.8; fresh final round 3: 9.1/10, independent 40 backend/30 frontend tests and actual Sydney40 UI. | Final production correction accepted; remaining delivery/performance gates still apply |
| Evidence and cleanup | External SHA-256 readback passed before removal; 3,834 task-owned files removed, all 21 allocated ports free. Post-cleanup audit: all 437 original DB artifacts, four references, 241 protected files and 198 reviewed production hashes match, all 599 baseline files remain, no new DB artifacts. | Accept within the documented metadata/hash audit scope; receipts in EVIDENCE |

## Failed attempts retained

- Historical complete browser suite: 116 passed, one 5v0 3D destination refusal.
  Untouched current-source standalone and group reruns pass; the historic cause
  remains unproven. Additional destination/receipt/camera diagnostics preserve
  the existing assertions and supported-area rejection.
- Early full backend run: one raw-TEXT assertion failed after lossless BLOB
  storage; the assertion now decodes through the strict repository codec and
  still compares authoritative content. The failure and later 437-pass report
  are retained.
- First Details browser fixture assigned a profile unsupported by current
  affiliation rules. The fixture was corrected without changing production
  eligibility or weakening assertions; the next complete Details case passed.
- Initial CPU-thread validation candidate still blocked publication under real
  load. Round 1 independently reproduced it. The implementation was replaced by
  bounded cooperative nominal-analysis slices and sent to a fresh critic.
- Initial long pacing probe completed several windows then failed because its
  overlay observation occurred after trace export and a route turn. The matched
  probe now inspects the measured endpoint before exporting and uses a longer
  unchanged-speed route. All original results remain retained.
- Critic native accessibility inspection hung; that attempt hit its diagnostic
  checkpoint and cleaned up. Actual-desktop native window enumeration and
  Playwright UI screenshots are retained instead; no native accessibility-tree
  result is claimed.
- Final Sydney recovery attempt 1 allowed correct background receipt lookup to
  resolve the deliberately lost Apply response before the test blocked lookup.
  The request/response log proves this race in fault setup. Blocking lookup first
  and asserting exact pending bytes across reload fixes the test; no timeout or
  assertion was weakened. Attempt 2 selected the wrong bundle and lacked its
  camera test hook. Attempt 3 passes the complete workflow. See [recovery](RECOVERY.md).
- Final configured Video attempt stopped at its dispatch cap before retaining
  a complete compositor window. The content screenshot and every request count
  are retained; no post-cap retry or passing Video FPS claim is made.

See [performance evidence](PERFORMANCE.md), [compatibility](COMPATIBILITY.md),
[critic response](REVIEW-RESPONSE.md) and [provider ledger](PROVIDER.md).

## Completed final-source checks

The complete automated check batch ran 09:16:58–09:19:42 UTC on 20 September
2026. `final-checks.json` retains every command exit and elapsed duration.

| Check | Result |
| --- | --- |
| Complete backend pytest | 438 passed; 85.13 s; two dependency deprecation warnings |
| Complete frontend Vitest | 414 passed across 42 files; 38.29 s |
| Backend contract export check | Pass |
| Frozen Phase 0 guards | 43 passed; no frozen specification changes |
| TypeScript / ESLint / Prettier | All pass |
| Generated current and foundation contracts | Both pass |
| Isolated production and verification test bundles | Pass |
| Production typecheck/build | Pass |
| Repository hygiene | Pass; 626 candidate source files at that checkpoint |
| Complete final Playwright suite | 118 passed; 0 failed/skipped/flaky/retried; no global errors; 867.577 s test duration; wrapper exit 0 |

Raw commands/logs and the final reviewed production inventory are retained in the
external evidence package. Documentation written afterward receives a final
repository check; production changes would invalidate this gate and require a
new affected check batch and independent review.

The complete browser run started 10:05:22.952 UTC on 20 September 2026; its
wrapper ran 10:05:20.874–10:19:51.467 UTC (870.594 s including setup/teardown).
`browser-result-audit.json` recursively enumerates every result and checks exactly
one passing attempt per case. The historical 5v0 case and new Details case both
pass. The first postprocessing console listing encountered a Windows cp1252 arrow
encoding error; switching that audit's stdout to UTF-8 allowed the same unchanged
machine result to be fully inspected. This did not rerun or alter the suite.

The final production inventory remains identical to the fresh third critic's
198-file review. Final documentation/harness checks and preservation results are
retained. **Overall acceptance is withheld: partial performance closure.**

The documentation-complete repository check covers 631 candidate files. External
archive readback precedes all task-output removal; cleanup completed 10:26:41 UTC
and the post-cleanup preservation audit passed at 10:27:14 UTC. The final source
snapshot and refreshed SHA-256 manifest retain these delivery records. See
[evidence and cleanup](EVIDENCE.md) for exact scope and receipts.
