# Your technical review: practical runbook

Your slot is 25 September 2026, 10:00am Singapore time. Allow 30–45 minutes beforehand to launch, check screen sharing and rehearse your opening.

## Start Sentinel and its printed application logs

Open PowerShell in `C:\Archive\Coding\Sentinel3` and run:

```powershell
& .\backend\.venv\Scripts\python.exe scripts/review_session.py start --open
```

Wait for **READY**. The browser opens at **http://127.0.0.1:5240**. Keep that PowerShell window visible beside the browser. It prints application events as you use Sentinel. This is the window to show Ajey when he asks for logs.

The review uses its own database with copied saved scenario revisions. New review runs are stored there. Historical operator recordings are still in the original database; they are not part of this saved-plan copy. The copy report lists exactly what was copied.

Use a second PowerShell window for dataset or test commands while the launcher stays running in the first window.

The copied catalogue contains these latest saved revisions. All five passed the
API's Validate checks on the rehearsal copy; that does not mean every authored
scenario was played through to completion during this preparation.

| Saved plan | Revision | Units |
|---|---:|---:|
| Base | 2 | 3 |
| Testing_2 | 1 | 36 |
| 5v5 | 9 | 12 |
| Demo Scenario 1 | 8 | 10 |
| Base | 2 | 40 |

There are two different plans named Base. Check the unit count when selecting
one. End the current interactive run before starting another saved plan.

To stop, first End any active interactive demo in Sentinel. Then press **Ctrl+C** in the PowerShell window. Restart with the same command. Do not launch the command twice while the first copy is running.

If a port is occupied, the launcher explains the conflict and stops. Close the previous review launcher first. It does not terminate another application to make room.

## The review sequence (60–90 minutes)

| Time | Show | What to say |
|---|---|---|
| First 5 minutes | Working UI and a prepared scenario | Give the short opening in ARCHITECTURE-AND-QA.md. State that this is a synthetic software demonstration. |
| Next 10–15 minutes | Save, validate, run and inspect a familiar scenario | Show the operator workflow you know. Keep the application log window visible. |
| Next 5–10 minutes | Architecture diagram and 3–4 code locations | Explain one backend, recorded state, shared browser views and exact retries. |
| Next 15–25 minutes | Give Ajey remote control; try his changes | Let him choose input variations or edit a supported JSON request. Use the steps below. |
| Next 10 minutes | Tests and evidence | Open TESTING.md, show a meaningful test, run the short verification command and inspect its result. |
| Remaining time | Technical questions and limitations | Use the Q&A and performance notes. If uncertain, follow the code and tests together. |

## Show application logs

Keep the launcher terminal visible while performing actions. Useful event names are:

| Event | Meaning |
|---|---|
| `scenario.receipt` / `scenario.reviewed` | A save returned a receipt / saved scenario checks finished. Read `accepted` and any issue codes. |
| `command.receipt` | The backend returned an interactive command receipt. Acceptance does not imply movement is already complete. |
| `simulation.validated` | The complete external batch passed validation; counts show rows and timestamps. |
| `simulation.prepared` | The request was durably recorded for processing; its result is still pending. |
| `simulation.recorded` | The external result was successfully committed. |
| `simulation.retry_returned` | An exact repeated request returned its stored result. |
| `request.rejected` | A request failed a supported check; `code` identifies the reason. |
| `source.delayed` | The normal 200ms source loop ran late. A large batch can cause this. |
| `stream.connected` / `stream.disconnected` | A browser mission stream opened with a snapshot / closed. |

Each line includes UTC time and severity. Related HTTP work shares a `trace_id`. The response also carries `X-Sentinel-Trace`, visible in browser Developer Tools → Network → response headers. This is local request correlation and operation timing, not a deployed distributed tracing service.

The launcher's **Saved logs** path contains human-readable `backend.log` plus structured `application-*.jsonl` files. JSONL means one JSON object per line. Structured files rotate at 5MiB with three backups per application instance; a fresh launch creates a new session folder. Old session folders remain until you deliberately remove them.

Application events select identifiers, status codes, counts and timings. Their fields omit control credentials, request bodies and exception messages. `backend.log` also contains server startup/shutdown messages. Logs are diagnostic evidence; the database's receipts and recordings remain authoritative.

## Show the metrics bonus

Open **http://127.0.0.1:5240/api/diagnostics/metrics** in another browser tab, then refresh after an action. Show `simulation.recorded`, `simulation.retry_returned` and the timings under `durations_ms`. `max` means the largest measured duration since this backend started; it is not a guaranteed latency or a percentile.

These timings describe backend handling. They do not include the whole network round trip or the browser's rendering time.

Metrics reset on backend restart. This endpoint is read-only and deliberately separate from the versioned mission API. It is served by the same process, so it can also be delayed while that process is blocked.

## Let Ajey try a different dataset

The Simulation pane accepts the documented external JSON contract. It does not accept arbitrary CSV/spreadsheet formats automatically. It processes a supplied batch and exposes its recorded results; timed playback through those timestamps is separate, deferred work. For the prepared example:

1. Open `backend/tests/fixtures/assessment/baseline.json` in a text editor. Copy all of it.
2. In Sentinel, open **Simulation**, paste into **External request JSON**, and select **Submit START**. Wait for the committed result.
3. Repeat with `variant.json`. This moves the observations and area approximately 2km north, shifts timestamps by 60 seconds, adds up to 5m jitter on each horizontal axis, and removes 24 of 240 observations with a fixed random seed.
4. Select **Inspect mapped mission**, then open **Tracks**. All 40 identities remain. Five final observations are missing: OBS-010, OBS-023, OBS-030, OBS-033 and OBS-037. Look for **Last known** in the Observation column. Their last measurements remain stale/unobserved instead of becoming invented positions or removals.
5. Repeat the identical variant request. Show `simulation.retry_returned` and the existing result. The tests verify that this does not add another recording frame.
6. Submit `invalid.json`. Its latitude of 91 is invalid. Show the UI error and `request.rejected`; no new recorded run should appear. ERROR/WARNING lines are expected for this deliberately rejected operation; the HTTP status is 422 and the application remains available.

All supplied observations in these review datasets are neutral. Their purpose is ingestion, validation, gap handling and repeatability. They do not demonstrate sensor accuracy or physical effects.

Reference captures from the production rehearsal: [Tracks showing Last known](../../test-results/assessment/rehearsal/final/02-variant-tracks.png) and [the rejected invalid latitude](../../test-results/assessment/rehearsal/final/03-rejection.png).

To copy a complete input without selecting a long file manually, use the second PowerShell window:

```powershell
Get-Content backend/tests/fixtures/assessment/variant.json -Raw | Set-Clipboard
```

Then click the **External request JSON** editor in Sentinel, press **Ctrl+A**, then **Ctrl+V**. Substitute `baseline.json` or `invalid.json` for those steps.

For an assessor-chosen variation, run this from the repository root, then paste the generated `variant.json`:

```powershell
& .\backend\.venv\Scripts\python.exe scripts/assessment_data.py --output test-results/assessment/reviewer-input-1 --seed 42 --drop-rate 0.2 --north-m 3000 --east-m 500 --jitter-m 10 --time-shift-s 120 --run-id ajey1
```

Use a **new output folder** for each set. The generator refuses to overwrite earlier inputs. Its `manifest.json` records parameters, hashes and the exact omitted observations. Changed parameters produce new mission/command identities. Use a new `--run-id` to perform another independent run of otherwise identical input.

This small review generator supports 1–40 units and 2–20 timestamps. It preserves the first snapshot so later missing observations can be inspected. These are the generator's demonstration bounds, not new limits imposed on Sentinel's external API.

If Ajey edits JSON manually, use new mission and command IDs for an independent experiment. Reusing a command ID with different content is deliberately rejected. A timeout or lost response requires retrying the **exact original request**, not editing the pending body.

## Recovery during the meeting

- **Page or stream problem:** refresh the page and reconnect. The initial snapshot comes from recorded state.
- **Outcome unknown after submission:** use **Retry exact pending command**. Do not create a different command merely because the first reply was lost.
- **Large batch pauses the UI:** wait for the measured work to finish. Explain the synchronous commit limitation. Use the small prepared dataset for normal live interaction.
- **Backend stopped:** restart the review launcher. Re-open the page, inspect recorded runs, and retry an interrupted external command with its original body if necessary.
- **Map provider unavailable:** use the local map mode already configured on this machine. Ordinary verification blocks external providers; it does not certify an internet provider's availability.
- **Unexpected test failure:** keep its output. Explain which behaviour failed; do not substitute a historical pass as though it came from the current run.

## If rebuilding becomes necessary

Do this before the meeting, with the review launcher stopped:

```powershell
npm --prefix frontend run build -- --outDir dist-assessment-ready
```

This changes the review build and invalidates its earlier build identity. Rerun the relevant verification after source changes. There is no root-level `package.json`, so the correct root command includes `--prefix frontend`.

The existing dependencies are installed. Do not reinstall or update them on review morning unless a specific failure requires it.
