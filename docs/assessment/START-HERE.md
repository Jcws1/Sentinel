# Sentinel3 — your technical review guide

**Ajey Gore · 25 September 2026 · 10:00am Singapore time**

The review build, application logs, test evidence and changed-input examples are prepared. Read this page first, then spend about ten minutes with [the architecture explanation and Q&A](ARCHITECTURE-AND-QA.md). You do not need to memorise the codebase.

## What was achieved

| You needed | What is ready |
|---|---|
| Logs you can show live | The launcher prints real validation, recording, command, retry and rejection events. It also saves log files. |
| Evidence of testing | **768 backend unit/integration tests, 637 frontend unit/component tests, 132 browser E2E tests and 387 system checks passed.** Existing tests are included. Results, commands and failed attempts are documented. |
| Metrics and traces | A local metrics page shows counts and timings. Request IDs connect browser requests to their log lines. |
| Different evaluator inputs | Reproducible neutral examples with a 2km northward shift, jitter, a time shift and 10% missing observations; also an invalid-input example. |
| A reliable launch | One command starts the verified build and logs using a separate database. All **five copied saved plans validate successfully**. |
| An understandable explanation | A short opening, architecture diagram, trade-offs, code links and likely questions are prepared. |

The production rehearsal exercised the changed data, Last known observations, exact retry and invalid-input rejection. The original recordings and configuration were preserved; new review runs will go into the separate review database. No commit or push was made. Full evidence is in [TEST-RESULTS.md](TEST-RESULTS.md).

## Before the meeting

Aim to start around **9:15am**, leaving time to check remote control and practise your familiar scenario.

1. Open PowerShell and run:

   ```powershell
   Set-Location C:\Archive\Coding\Sentinel3
   & .\backend\.venv\Scripts\python.exe scripts/review_session.py start --open
   ```

2. Wait for **READY**. Sentinel is at **http://127.0.0.1:5240**. Keep the PowerShell window open beside it: **that is your live application-log display**. Edge is the tested browser.
3. Load your familiar saved scenario, Validate, then rehearse its normal workflow. **Demo Scenario 1** is present as revision 8 with ten units. End an active interactive run before starting another one.
4. Read your [90-second opening](ARCHITECTURE-AND-QA.md#your-opening-about-90-seconds). Check that Ajey can use your remote-control setup.

The services were stopped after verification. Start them with the command above on review morning. Do not reinstall dependencies or change the build just to prepare for the call.

## What to show Ajey

| When he asks about… | Show this |
|---|---|
| The working system | Your familiar scenario first. Explain what the operator does and what the software records. |
| Architecture | [The diagram, decisions and code map](ARCHITECTURE-AND-QA.md). Follow one request from browser → backend checks → database → displayed update. |
| Logs | The running PowerShell terminal. Show `simulation.prepared`, then `simulation.recorded`; acceptance and completion are different stages. |
| Tests | [Results](TEST-RESULTS.md), [how to run them](TESTING.md), and [all 112 test files](TEST-CATALOGUE.md). Open a test and explain its expected result before running it. |
| His own data | [The dataset walkthrough](DEMO-RUNBOOK.md#let-ajey-try-a-different-dataset). He can choose new parameters or supply JSON matching the supported schema. Arbitrary CSV formats are not automatically supported. |
| Metrics or tracing | Open **http://127.0.0.1:5240/api/diagnostics/metrics**. Use the [log/metrics instructions](DEMO-RUNBOOK.md#show-application-logs) to connect an action to its request ID. |
| Improvements over time | [The rubric and iteration map](RUBRIC-MAP.md), plus your own actual demos and mentor feedback. |

For a short live test run, use a **second PowerShell window**, in the same repository folder:

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest -c backend/pyproject.toml backend/tests/test_observability.py backend/tests/test_assessment_data.py backend/tests/test_review_session.py -p no:cacheprovider
```

These 35 checks use temporary data. The complete browser suite takes about 16 minutes, so its saved report is more practical during the meeting.

## The limits to say plainly

- **This is a simulation/development prototype.** The evidence does not establish real aircraft integration, field effectiveness or a measured reduction in operator workload.
- **Large batches can pause interaction.** Worst measured update gaps were about **7.0, 8.9 and 16.2 seconds** across the larger workloads. The ordinary small workload stayed within its 750ms budget. [Details and exact workloads](PERFORMANCE-AND-LIMITS.md).
- **Inputs and storage have an operating envelope.** Timestamp count and retained state matter, not just unit count. Missing observations become Last known; an exact retry returns the stored result. Use a new run ID for a fresh independent dataset experiment.
- **Some work remains open:** timed replay, display-pacing/configured-Video findings, organiser sign-off and the remaining independent Phase 5 critic review. Do not describe Phase 5 as formally closed.

If you are unsure of an implementation detail, say so and follow its code and test together. Being clear about what you know and what the evidence proves is more useful than guessing.

For the complete 60–90 minute sequence, recovery steps and saved-plan list, open [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).
