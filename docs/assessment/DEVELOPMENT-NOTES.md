# Assessment preparation: retained development history

This is a development record, not the final pass/fail summary. Use TEST-RESULTS.md for the final frozen build.

## Preserved starting point

All 668 files in Claude's candidate 6 matched its frozen hashes. One additional local Claude settings file changed the whole inventory count to 669; it was preserved. The original candidate was copied into a source archive and read back against its hashes before changes.

The baseline completed the standard suites, real-HTTP corpus, native foreground workflows, concurrency/timestamp probes, geometry comparisons and browser-storage probe. Its measured large-batch pauses were retained as limitations. The original candidate-5 report remains historical evidence.

## Focused development checks

- The neutral dataset draft initially used an invalid unused calibration value. Validation caught it; the draft was corrected to a contract-valid zero-probability rule. Neutral observations produce no eligible interactions. The initial failure is retained under `test-results/assessment/staged-data/`.
- All 35 new backend checks passed on their first focused pytest run. The JUnit report is `test-results/assessment/logging-and-inputs-dev1.junit.xml`.
- Both new browser cases passed in the focused run. Raw reports and application logs are retained under `test-results/assessment/development/`.
- The combined browser walkthrough took about 29 seconds across three editor submissions plus mapped inspection. Its own timeout was set to 60 seconds before freezing the next candidate; the default timeout and all existing tests were unchanged. This is a correctness test, not a latency budget.
- A direct PowerShell-to-Git-Bash recorder invocation failed to find shell utilities before executing any tests. That invocation supplied no test evidence. The established Python gate runner successfully recorded the canonical commands.

## Findings in the first full assessment attempt

The `assessment-final` attempt was frozen with identity `8740b63f01f7e417945450c3d6e5765666bdd930331d9d5ab0fffaa9dcadb88f`, including its review inputs. Its repository hygiene check rejected the new browser test's dependency on JSON in the documentation directory. Functional test success cannot override this failed prerequisite. Its raw results remain under `test-results/assessment/assessment-final/`.

The correction moves the same byte-verified datasets into shared backend test fixtures and points the browser test there. No hygiene rule is weakened and no test assertion is removed.

The launcher smoke check successfully started the UI/backend and printed application logs using an isolated copy of the saved plans. Short diagnostic operations exposed another issue: Python 3.10's `GetTickCount64` monotonic clock on this PC has 15.625ms resolution, so short durations could appear as zero. The final diagnostics use `QueryPerformanceCounter` through `time.perf_counter()` (reported resolution 0.1µs). The existing asyncio simulation scheduling clock and cadence remain unchanged. Clock resolution is not a claim of end-to-end measurement accuracy.

The final assessment candidate is frozen and checked again after those corrections. Formal Phase 5 independent critic acceptance, organiser conformance sign-off, prior display-pacing findings and deferred replay are separate outstanding work.

## Test-runner setup failure on the corrected source

The first `assessment-ready` backend invocations used new isolated pytest temporary paths, but the runner had not created their parent directory. Both encoding modes reported 651 passes and 117 setup errors (`FileNotFoundError`); those 117 test bodies did not run. This is a failed verification attempt, not 768 passes and not evidence of 117 product defects.

The correction creates the runner-owned parent directory while still refusing to reuse an existing pytest base directory. Both complete backend reruns finished successfully: **768 passed in each encoding mode**, with separate retained logs under `assessment-ready/backend-recheck/`. The product source and test assertions remained unchanged. Successful prerequisite, frontend, system and browser results on that exact source are combined with the corrected backend reruns in [the final results](TEST-RESULTS.md). The failed attempts remain available.

## Final documentation check

The first delivery-report helper stopped while decoding Git output with the
Windows default encoding. It had also unnecessarily overridden Git's line-ending
configuration. That attempt is retained under `assessment-ready/delivery-checks/`;
it establishes no whitespace-check result. The corrected helper preserves raw
output bytes and uses the repository's normal `git diff --check` configuration.
It writes separate results under `delivery-checks-2/`. No product or test source
changed for this reporting correction.
