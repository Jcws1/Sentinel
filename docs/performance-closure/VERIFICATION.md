# Verification ledger

Production changes are limited to `backend/app/commands/scheduler.py` and
`backend/app/commands/zone_rules.py`. The unchanged frontend production source
was built with the task suffix`-performance-closure`; exact inventories identify
the before/final source. No operator writer, browser profile or credentials used.

## Current checks

| Check | Result |
| --- | --- |
| Production and verification build | Passed; usual large-bundle warning retained |
| TypeScript / lint / format | Passed |
| Backend schema / frontend generated / foundation contracts | Passed |
| Frozen source guards | Passed,43 guards |
| Repository documentation/hygiene | Passed after adding the linked index; original broken-link result retained |
| Frontend unit | Passed:403 tests across41 files |
| Backend unit/regression | Final complete run **404 passed**,2 existing dependency warnings,73.54s; first399/5 import failure retained |
| One complete browser suite | **Failed: 116 passed / 1 failed**, 0 skipped, 0 flaky, 881.786s; final production code, no retries or timeout changes |
| Independent review | **8.8/10**; 148 focused backend cases plus 6 independent probe cases and actual foreground UI/recovery passed; its full-browser condition is not satisfied |

The required commands are the root README's canonical checks. Raw command logs
and exit/duration ledger are under `test-results/performance-closure`; final
browser JSON/cleanup receipts are under `frontend/test-results/browser` before
external archival. No subset is substituted for a complete browser-suite pass.

## Affected compatibility and recovery

New complete-plan hash goldens cover default40, Sydney40, restricted-path failure
with dependent skips, and explicit-time conflict. Candidate rejection preserves
old motion and Track position; boundary activation/removal and inclusive edge
contact remain live in both geometry models. These complement existing current
v2 and dedicated legacy-v1 regressions; historical contracts/guards are untouched.

The complete backend/browser gate covers exact saved-revision ownership,
dirty/unapplied edits, pending Save/Run/Apply/Stop identities, duplicates,
rollback-before-publication, strict old readers, checkpoint/restart, lease/reclaim,
long Pause, movement/script/Patrol/v2 Intercept/NON-OP, Suggestions stale refusal,
source gaps/late callbacks, frozen geometry and persisted End. Coverage belongs
to those tests, not a claim that every case was manually fault-injected anew.

The critic personally exercised supported non-default Sydney40, Save response
loss/reload/exact retry, Stop response loss/exact retry, all40 source positions
moving, keyboard/narrow760/820/900 layouts, Pause/Resume/End and populated recorded
inspection. Its first runner attempt failed to reopen Orchestrator after reload;
raw failure remains. Correcting only that navigation produced the final pass.

## Retained limitations and failed attempts

- Initial sandbox headed-browser traces were isolated-desktop diagnostics;
  visible/focused DOM was insufficient proof of actual foreground rendering.
- Native capture/activation blocked on app approval and timed out. Actual visible
  launches and the independent run used browser screenshots/native enumeration;
  no successful native screenshot is claimed.
- Original recording timing includes a25% Sydney40 median regression. No
  after-the-fact exclusion or reverse-order repeat replaces it.
- Old short-sample p95 estimator was corrected on independent review. Original
  samples/derived outputs are retained; comparisons use measured medians.
- Sydney first-review improvements remain below25%. No new long soak,
  configured Video, complete actual-foreground pane/FPS matrix or4K gate.
- The canonical root-directory backend invocation exposed5 existing fault-probe
  subprocess import failures (`No module named app`), before their intended
  isolation checks. Both subprocess calls now explicitly use the backend working
  directory, preserving all assertions and the20s timeout. The failed399/5 run
  remains evidence; the complete corrected rerun passed all 404 tests.

## Final complete browser failure

The complete run started at 06:21:46.103 UTC and took 881.786 seconds.
`d4-refinement.spec.ts:402`, **5v0 actual group movement, unique concurrent pursuit
and Stop**, failed at line 452 after switching to ordinary 3D. `groundMove` at
line 105 expected an accepted receipt but received `accepted: false` with
`Destination outside the supported area.` The other 116 cases passed. The
failure is not classified as flaky or attributed to the optimization without
further evidence. No assertions, destination rules or timeouts were weakened.

Raw `results.json`, the complete log and Playwright error-context snapshot are
retained in the archive. The run exited 1, its services stopped, and its isolated
database cleanup receipt confirms deletion. No subset rerun replaces this failed
complete gate. The timebox precludes a verified correction plus a new full suite.

Earlier progress messages inspected only passing log tails and missed this
already-recorded failure; the final report and acceptance matrix use the actual
complete result. Functional delivery acceptance is withheld. Named recovery
checks passed, but their delivery acceptance remains conditional on this gate.

Final cleanup and SHA-256 read-back verification are in the external archive's
`cleanup-summary.json`, `cleanup-removals.json` and manifest. See [evidence](EVIDENCE.md).
