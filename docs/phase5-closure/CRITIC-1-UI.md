# Phase 5 closure — independent UI/UX critic, round 1 (candidate 3)

| Item | Value |
| --- | --- |
| Reviewer | Independent UI/UX critic (round 1). I did not implement any of this work |
| Review window | 2026-09-24, 02:41–09:52 UTC, with two pauses caused by API usage limits (not by the lead). Candidate identity was re-checked after each pause |
| Candidate | Candidate 3, HEAD `f98de4f` plus uncommitted changes |
| Identity | Start digest `80e17cec2dde3cb25900867ef6b95c87224fcc0fe5f466722f166e2290a01719` (`test-results/phase5-closure/critic-1-ui/identity-start/`). It matches the frozen `candidates/c3`. The end digest is in the last section |
| Bundle served | `frontend/dist-verification-p5c-c3`, via `vite preview` on port 5431; task backend on port 8231; a disposable database for each run |
| Browser | Fresh task-owned headed Edge 153.0.4234.48 profile with real focus (CDP `noDefaults`). Screenshots come from CDP `Page.captureScreenshot`. Every non-localhost request was blocked and counted |
| Scripts | `frontend/.cache/p5c-critic-1-ui/` (`lib.mjs`, `part-a…h.mjs`), built on the repository harness (`withIsolatedRuntime`, `launchForegroundBrowser`, `foregroundIdentity`) |
| Raw evidence | `test-results/phase5-closure/critic-1-ui/` contains one directory per run (`c1ui-a`, `a2`, `b`–`h`), each with `result.json`, `cleanup.json`, service logs and PNGs, plus `foreground-summary.json`, `cleanup-summary.json` and `screenshot-notes.md` |

## Verdict

**Overall 7.2 / 10: usable and truthful in its domain labels, recovers correctly, but not acceptance-grade.**
There is **1 High** finding, **8 Medium** findings and 13 Low findings.

Every workflow in the brief finished end to end in the actual application, with native
foreground proof, zero page errors and zero provider requests. That covers the golden
lifecycle, the R3-1 mixed-scale area, the complete spec §9 north sequence, recorded
commands after ABORT, a lost response with exact retry across a reload, a real backend
outage followed by an actual restart, and keyboard-only operation.

The defects are in interaction quality, not in authority behaviour:

- ABORT, an irreversible command, runs on a single key press.
- Disabled controls look the same as enabled ones.
- Keyboard focus is lost after almost every action.
- Stored and historical results read as fresh, current state.
- Some error text is raw and some goes stale.
- Recorded inspection hides the most important §9 outcome: which drones lost health, and when.

All of these can be fixed inside Sentinel's existing components and CSS conventions.
Fixing H1 and M1–M8 would plausibly bring the Phase 5 screens to about 8.8–9.0. The rest
of the gap to best-in-class is redesign work, listed separately and not counted as defects.

## Evidence I verified personally, and evidence I was supplied

**Verified by me (executed and inspected in this review):**

- Candidate identity at the start, and that candidates 1 and 3 differ in exactly
  `backend/app/domain/geometry.py`, `frontend/src/modules/simulation/SimulationPane.tsx` and
  `scripts/performance_simulation_concurrency.py`.
- The served bundle contains candidate 3's recorded-JSON link wrapper and the storage-refusal text.
- Nine headed runs (below), 108 screenshots, each preceded by a PID-matched OS foreground check.
  I opened every PNG I rely on with the image reader. Per-image notes are in `screenshot-notes.md`.
- DOM and computed-style facts for each state (the `observations` in each `result.json`),
  HTTP status codes and bodies of every simulation request, and cleanup of every run.
- Source reading of `SimulationPane.tsx`, `SimulationDetails.tsx`, `client.ts`,
  `simulation.css`, the adapter `projection.py`, the API routes, `App.tsx`, `TracksBrowser.tsx`,
  `EntityFilters.tsx` and `EntityDetails.tsx`. I used it to explain behaviour I had observed,
  never in place of observing it.

**Supplied, not re-verified by me:** `TEST-REPORT.md`, which covers candidate 1 only: the
gate results, the 129/129 browser suite and the 24/24 foreground checks. Also supplied are
the measurements in `PERFORMANCE.md`, the backend §9 and geometry test claims in
`PROGRESS.md` and `TRACEABILITY.md`, and the historical Phase 5 reports. I did not run
timing measurements. None of the supplied results is counted as UI evidence here.

## Native foreground evidence

Before every screenshot I rely on, `foregroundIdentity` confirmed that the OS foreground
window's PID belongs to the task Edge process. It uses Win32 `GetForegroundWindow` together
with CDP `SystemInfo.getProcessInfo`. I never used `document.hasFocus()`. Every check passed
on its first attempt, and no run needed a foreground wait.

| Run | Purpose | Screenshots, all PID-matched | Task Edge PID | Provider requests | Page errors | Services stopped, database deleted |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `c1ui-a` | First keyboard attempt. Two steps failed because of my own Tab-direction error; retained | 15/15 | 32924 | 0 | 0 | yes / yes |
| `c1ui-a2` | Keyboard-only workflow, empty, error and busy states, golden lifecycle, recorded commands, mapped mission at 1440 px | 19/19 | 19612 | 0 | 0 | yes / yes |
| `c1ui-b` | R3-1 from a file, the §9 north sequence end to end, widths 760/820/900/1440/1920 | 36/36 | 31444 | 0 | 0 | yes / yes |
| `c1ui-c` | Lost response, reload, exact retry, real outage, actual restart, blocked session | 11/11 | 33764 | 0 | 0 | yes / yes |
| `c1ui-d` | Keyboard pagination, label audit, populated tables at five widths, Details styling | 12/12 | 22980 | 0 | 0 | yes / yes |
| `c1ui-e` | Outage error wording, recovery, storage refusal | 5/5 | 12648 | 0 | 0 | yes / yes |
| `c1ui-f` | Populated tab order, ABORT focus ring, Fleet with an external mission | 2/2 | 38184 | 0 | 0 | yes / yes |
| `c1ui-g` | Select keyboard behaviour, HOLD while HELD, Sydney 40. One step failed on my own selector; retained and redone in `h` | 5/5 | 32468 | 0 | 0 | yes / yes |
| `c1ui-h` | NON-OP filter by keyboard, §9 Tactical map | 3/3 | 15512 | 0 | 0 | yes / yes |
| **Total** | | **108/108** | | **0** | **0** | **9/9** |

Each screenshot's PID, hwnd, window title and check time are listed in `foreground-summary.json`.
Three `failure-*.png` diagnostics were captured without a foreground check when my own harness
steps failed. I do not rely on them.

## Coverage against the brief

| Brief item | Result | Evidence |
| --- | --- | --- |
| Widths 760, 820, 900, 1440 and 1920 | No document-level horizontal overflow at any width. At 760 and 820 px, Details docks below the pane. The 900 px Tracks clipping is L12 | `b20–b22-w*`, `d1x/d2x-w*`, `width-*` observations |
| Keyboard-only operation | Complete. From document start, Tab reaches **Open Simulation** in 10 presses. The pane's Tab order is logical (file → example → editor → Submit → run → Refresh → Inspect → HOLD → ABORT → commands → JSON → timestamp → pagination). The focus ring is visible, and focus moves to the alert on every rejection. Defects: M2 and M8 | `a02`, `a03`, `f01`; `c1ui-a2`/`c1ui-f` tab-order observations |
| Empty, loading and error states | Empty state, 400 invalid JSON, 422 LIVE with path, 422 zero-area and self-intersecting areas, 409 conflict, 409 after ABORT and 502 outage were all exercised. Defects: M4, M5, L1 | `a02–a05b`, `a06`, `a08`, `a12`, `c04–c07`, `e01–e04` |
| R3-1 mixed scale | Loaded through the file input and committed with HTTP 200 and MUTUAL_EFFECT. The mapped area and both entities decode, and Tracks and Details are correct | `b01–b04` |
| §9 sequence | START gives 5 timestamps with 0/0/27/27/19 interactions. The mapped mission has 46 entities, and NON-OP symbols appear on Tactical. HOLD with 46 supplied rows returned `{}` and moved no track, with the effective time advancing to 06:03. RESUME covered 2 timestamps, including B-N-03's correction. After ABORT, HOLD and ABORT are disabled. Recorded START, HOLD and RESUME results, with per-timestamp outcomes, remain inspectable after ABORT. Defects: M6, M7 | `b05–b17`, `g01`, `h01–h03` |
| Lost-response exact retry across reload | The retried body was byte-identical to the original. There is exactly one run, and world sequence is 1. Retry was done by keyboard | `c01–c03`; `c1ui-c` `exactRetry` |
| Recovery after an actual backend restart | I killed the task backend process tree, observed the outage and restarted with `restartBackend()`. The pending command then committed, and recorded inspection worked after the restart | `c05–c09`, `e03`, `e04` |
| Label truthfulness | Correct: MSL, NOTIONAL, the provisional local policy, SIMULATION ONLY, and "BLUE is affiliation only" (FRIENDLY but Unmanaged, Video Feed disabled, Fleet showing "0 managed"). Recorded inspection never claims to be replay, and Timeline says replay is not implemented. Exceptions: M3, M7, L2, L13 | `a07`, `a17`, `b09-*`, `d30`, `f02` |
| Candidate 3 change (the link collision) | Fixed. "Open complete recorded JSON" now sits on its own action row above "Source timestamp" at every width, and it opens the exact stored result | `a07`, `b05`, `b14`, `d2x`; `recordedJsonLink` observation |

## Findings, ranked by severity

### H1 — ABORT is an irreversible terminal command triggered by a single key press, with no confirmation

- **Location:** `frontend/src/modules/simulation/SimulationPane.tsx:248-254`
  (`onClick={() => void client.control('ABORT')}`). It sits next to HOLD
  (`:241-247`) with the same styling, one Tab stop apart.
- **Reproduction:** select a RUNNING or HELD run, Tab to **ABORT external run** and press Enter.
  The ABORT commits at once and the run becomes terminal. A later START returns 409
  RUN_TERMINAL and a later RESUME returns 409 RUN_NOT_HELD.
- **Evidence:** in `c1ui-a2/result.json`, `abort` shows no dialog and a single Enter, and
  `afterAbort` shows both 409s. Screenshots: `a11-aborted.png`, `a12-after-abort-409.png`, and
  `c1ui-f/f01-abort-focused.png`, where the focus ring is on ABORT one Tab after HOLD.
- **Impact:** one Enter pressed one Tab too far, or one mis-click, permanently finalizes the external
  run. There is no undo, and continuing needs a new mission identity. Sentinel already asks for
  explicit confirmation before destructive actions: the "Replace unsaved arrangement?" alertdialog in
  `MissionControls.tsx` and "Confirm delete N" / "Keep units" in `UnitsPane.tsx`.
- **Correction:** add a two-step confirmation. It should read "ABORT <mission>? Finalizes the recording;
  the run cannot be resumed", offer **Confirm ABORT** and **Keep run**, and put initial focus on the safe
  choice. Also style ABORT as destructive and separate it from HOLD.

### M1 — Disabled controls look exactly like enabled ones

- **Location:** `frontend/src/modules/simulation/simulation.css` has no `:disabled` rule, and
  `styles/index.css:55` only changes the cursor. Other panes already follow a convention:
  `movement.css:170`, `analytics.css:80` and `units.css:169` use opacity 0.45, and
  `cockpit.css:392` uses 0.5.
- **Reproduction:**
  - During a submission, **Submit START** and **Retry exact pending command** both look active (`a06`).
  - After ABORT, HOLD and ABORT look unchanged (`a11`, `b13`, `b21-w*`).
  - "Next interactions" on the last page looks active (`d01`).
  - In a blocked session, "Submit batch" looks active (`c10`).
  - In Details, "Video Feed" for an external FRIENDLY entity looks active (`d30`).
- **Evidence:** in `c1ui-g/result.json`, `disabledStyle` gives disabled and enabled buttons the same
  opacity 1 and colour `rgb(224,225,227)`. `c1ui-a2` `busyState` and `c1ui-d` `detailsVideoStyle` agree.
- **Impact:** operators cannot see which lifecycle actions are available. After ABORT the run still
  looks controllable, and while a request is in flight a Retry control appears to be on offer.
- **Correction:** add `.simulation-pane button:disabled { opacity: .45; cursor: default }`, which matches
  the existing convention. Apply the same rule to the disabled Video Feed, and show the reason as text
  rather than only as a `title`.

### M2 — Keyboard focus falls to the document after most actions, and arrow keys cannot browse recorded runs or commands

- **Location:**
  - `SimulationPane.tsx:161-175` and `:241-254`: buttons become disabled while busy.
  - `:195-201` and `:266-268`: the selects are `disabled={state.loading}`, and every change fetches.
  - `:396-409`: pagination.
- **Reproduction, keyboard only:**
  1. Press Enter on Submit, HOLD, RESUME, ABORT or "Next interactions" (last page). Afterwards the
     focused element is `<body>`.
  2. Focus **Recorded external command** (closed) and press ArrowDown. The value changes and the select
     disables itself while loading. Focus drops to `<body>`, and further ArrowDown or Home presses do
     nothing. I intended to reach START with Home, but HOLD stayed selected (`a14`). The run select
     behaves the same way (`c1ui-g` `runsArrow`: the select is disabled and focus is on BODY).
- **Evidence:** in `c1ui-a2/result.json`, `startCommitted`, `hold`, `resume` and `abort` all record
  `active` as BODY, and `recordedCommandsArrow` shows five ArrowDown presses with the value stuck on
  HOLD. `c1ui-d` `paginationNext` and `c1ui-g` `runsArrow` show the same. Screenshot: `a14`.
- **Impact:** keyboard and screen-reader users lose their place after every command. Browsing recorded
  runs or commands advances one item and then stops. This conflicts with WCAG 2.4.3 Focus Order and
  3.2.2 On Input: each arrow press triggers a fetch and replaces the displayed outcome.
- **Correction:** do not disable the control that has focus. Use `aria-disabled` and ignore repeat
  activation, or move focus to the status notice after a commit, as the code already does for errors.
  Keep the selects enabled and rely on the existing generation counters to discard stale responses, or
  restore focus once loading ends.

### M3 — Stored and historical results are presented as a fresh commit and as the current run state

- **Location:** `frontend/src/modules/simulation/client.ts:289-297` builds the notice
  `${id}: committed · ${run_status}` for every HTTP 200. `SimulationPane.tsx:328-331` shows the
  response's `run_status` with no context.
- **Reproduction:**
  1. After ABORT, resubmit the identical original START body. The notice reads
     **"CMD-…: committed · RUNNING"** and the outcome reads "… · RUNNING", while the run line reads
     **"ABORTED · ready"** (`a13`).
  2. In recorded inspection after ABORT, choosing START shows "S9-N-START · RUNNING" (`b14`, `b16`),
     with nothing to say that this was the state at the time of that command.
- **Evidence:** `c1ui-a2` `exactRetryAfterAbort` shows HTTP 200 with the stored response
  (`run_status` RUNNING) while the run is ABORTED. Screenshots: `a13`, `b14`, `b16`.
- **Impact:** the pane tells the operator that a terminal run is RUNNING, so the operator could conclude
  it restarted. The backend's idempotent stored response (spec §6) is correct; only the UI wording is wrong.
- **Correction:** when the returned `command_id` is not the run's current `commandId` after refresh, say
  "Already recorded: stored result returned, no new command. Current run state: ABORTED". Label the
  outcome's status "Run state recorded with this command".

### M4 — Operators see technical error text, and the intended outage message is unreachable

- **Location:** `client.ts:251` calls `await response.json()` before checking the status, so a 502
  with an empty body throws a parser error. The message written for this case at `:270-274`
  ("Authority unavailable; outcome may have committed…") is therefore never shown for non-JSON
  responses. `:369`, `:404` and `:458` build errors with `String(error)`, which adds an "Error: " prefix.
- **Reproduction:**
  - Kill the backend and submit: the pane shows **"Failed to execute 'json' on 'Response': Unexpected end of JSON input"** (`c06`, and still in `c07`).
  - Lose the response: the pane shows "Failed to fetch" (`c01`).
  - During the outage, "Load recorded commands" and HOLD show "Error: Recorded commands unavailable." and "Error: Recorded command input unavailable." (`e01`, `e02`).
- **Evidence:** `c1ui-c` `outageSubmit` (HTTP 502, empty body), and `c1ui-e` `commandsDuringOutage` and `holdDuringOutage`.
- **Impact:** in the most consequential state, when the outcome is unknown, the operator is shown a
  JavaScript parser message. Retaining the pending command and offering retry are both correct; the
  explanation is not.
- **Correction:** check `response.ok` and the content type before parsing. Map network failures and 5xx
  responses to "Authority unreachable — outcome unknown. Your exact command is saved; retry when the
  authority is available." Remove the "Error:" prefixes.

### M5 — Errors are not cleared after recovery, and the alert mixes in unrelated success text

- **Location:** the success paths of `client.ts` `refresh()` (`:138-167`) and `commands()`
  (`:350-376`) never clear `error`. `SimulationPane.tsx:176-190` renders the error and the last message
  together inside one `role=alert` region.
- **Reproduction:** kill the backend and press **Refresh runs**; the alert reads "Simulation run catalog
  unavailable." Restart the backend. **Refresh runs** now succeeds and the list updates, and
  **Load recorded commands** also succeeds, yet the red alert stays (`e03`, `e04`). During the outage,
  the earlier success line "…: committed · RUNNING" is also drawn in red inside the alert (`c05`).
- **Evidence:** `c1ui-e` `afterRecoveryRefresh` and `afterRecoveryCommands` still show role `alert`
  with the same text after the data loaded. Screenshots: `c05`, `e03`, `e04`.
- **Impact:** the pane says the catalog is unavailable while it displays a catalog it has just loaded,
  so operators cannot tell a current problem from a past one.
- **Correction:** clear an operation's error when that operation next succeeds. Show the error and the
  last success message in separate regions, or give each a timestamp.

### M6 — Recorded inspection does not show per-timestamp health outcomes or corrections

- **Location:** `SimulationPane.tsx:361-394` shows only a count ("N health rows") and the interactions table.
- **Reproduction:**
  - §9 START at `2026-10-01T06:02:00.000Z` shows "46 health rows · 19 interactions". The six drones
    that reach zero health at that timestamp (B-N-02, B-N-04, B-N-05, R-N-04-001, R-N-05-001,
    R-N-05-004) are not named anywhere in the Simulation view (`b06`).
  - RESUME's supplied-health correction for B-N-03 (`state_discontinuity` at 06:03:30) is not shown (`b11`).
  - Details shows the correction notice only when the latest frame carries it, as for Sydney
    BLUE-00001 in `g07`; B-N-03 in `b12` has none. The mapped views show only the latest frame.
- **Evidence:** `c1ui-b` `s9Start.perTimestamp` (disabled lists taken from the recorded response) and
  `s9Resume.discontinuities`. Screenshots: `b06`, `b11`, `b12`, `g07`.
- **Impact:** the central §9 outcome, "who was disabled when, and which supplied health was corrected",
  can only be found by opening raw JSON. Recorded inspection cannot answer "what happened at T+02:00".
- **Correction:** add a "Health changes at this timestamp" table with drone, team, before → after,
  status and discontinuity. Reuse the existing table and pagination pattern, show changed rows by
  default and offer a "show all N rows" toggle.

### M7 — After ABORT, the mapped mission still looks like a live, current picture

- **Location:** no frontend view reads `mission.lifecycle`; the only reader is `world/cockpit.ts`. The
  mission status line in `MissionControls.tsx`, the Observation column in `TracksBrowser.tsx` and the
  Details delivery line are all affected.
- **Reproduction:** after the §9 ABORT, press **Inspect mapped mission**. The header reads "Simulation ·
  SYN-S9-NORTH", all 46 Tracks rows read "Tracking" and Details reads "Delivery · current". Nothing
  says the run is ABORTED or that the recording is finalized (`b17`). The world API reports lifecycle
  `completed`.
- **Evidence:** `b17`; `c1ui-b` `s9AfterAbortHeader`; the code search above.
- **Impact:** once the operator leaves the Simulation pane, a finalized recording is easy to mistake for
  live tracks. This is the distinction between recorded inspection and live state that the brief asks
  about.
- **Correction:** show the external run state, for example "External simulation · ABORTED · recording
  finalized", in the mission status, and add a banner for external missions in Tracks, Details and
  Tactical. For finalized missions, prefer "Last recorded" over "Tracking".

### M8 — Accessible names do not contain the visible labels (WCAG 2.5.3 Label in Name, Level A)

- **Location:** `SimulationPane.tsx`:
  - `:72-74`: visible "Load JSON batch", accessible name "Load simulation JSON batch".
  - `:120-122`: visible "External request JSON", accessible name "External simulation request JSON".
  - `:347-349`: visible "Source timestamp", accessible name "Recorded result timestamp".
  - The run select at `:195` has no visible label.
- **Evidence:** `c1ui-d/result.json` `labelAudit` gives `nameContainsVisible: false` for all three.
- **Impact:** speech-input users cannot operate the workflow's main inputs by the names they can see, and
  screen-reader users hear names that differ from the screen.
- **Correction:** make each accessible name contain its visible text, or drop `aria-label` and rely on
  the wrapping `<label>`. Give the run select a visible label ("Recorded run"). The role names used by
  the tests will need to change to match.

### Low

| ID | Finding | Evidence | Correction |
| --- | --- | --- | --- |
| L1 | Loading is silent. While a run is being inspected, the select resets to "Select a recorded run" and the run section disappears. Submission shows text only | `c04`; `c1ui-c` `inspectLoading` | Keep the selection on screen and add "Loading recorded run…" with role `status` |
| L2 | The Activity Bar tooltip reads "Simulation · View only", although this module submits authoritative commands | `b20-*`; `App.tsx:326` | Use a truthful subtitle such as "Submit and inspect external batches" |
| L3 | "1 supplied timestamps" | `SimulationPane.tsx:149`; `a07`, `b10` | Pluralize correctly |
| L4 | The draft identity has no label and sits directly above the result notice. After HOLD or ABORT it still shows the previous draft ("… · START", with "Submit START" above "…: committed · HELD"), and after ABORT "Submit RESUME" stays enabled and would return 409 | `a09`, `a11` | Head it "Draft to submit" and name the committed action in the notice |
| L5 | Rejections omit the error code. RUN_TERMINAL and RUN_NOT_HELD both display "Command is not allowed in the current run state /command/action" | `a12`; `client.ts:266` | Show the code and a plain-language state, with the path labelled |
| L6 | HOLD is still offered while the run is HELD, and pressing it records a new command | `g04`; `c1ui-g` `holdWhileHeld` (C03 allows this as a recorded no-op) | Disable HOLD when HELD, or relabel it as a recorded no-op |
| L7 | Tracks rows for zero-health drones read "Tracking", with no condition cue. NON-OP is visible only in Details, on the map, or through Filters → Condition, which works by keyboard | `b09`, `b17`, `h02`, `h03` | Add a Condition column or a NON-OP suffix |
| L8 | Co-located external drones show a single symbol and label, with no count. Golden shows only BLUE-001; R3-1 shows only RED-001. This is shared renderer behaviour | `a15`, `b03` | Add a cluster badge or stacked labels |
| L9 | The Simulation pane shows raw UTC ISO times while every other view shows SGT. HOLD and ABORT use the wall-clock `execute_at` (`client.ts:437`), so the frame jumps to today and Details shows "1,565,483 s before frame" | `a16`, `a17`, `b05` | Label times as UTC and show SGT beside them; format long lags as days and hours |
| L10 | An unreadable saved session is a dead end: everything is locked and there is no in-product way forward | `c10` | Offer "Copy saved session" and a confirmed "Discard saved session" |
| L11 | Polish: "Load notional example" floats mid-height beside the two-line file control; Submit looks like every other text button; at 1920 px most of the pane is empty | `b01`, `b20-w1920` | Align the action row and give the primary action its own style |
| L12 | At 900 px, Tracks clips "Altitude / ref" mid-value ("0 m MS") in this shared component, so MSL is visible only after scrolling | `b22-w900` | Give priority to columns or set a minimum width |
| L13 | The disabled Video Feed on an external FRIENDLY entity gives the reason "Only friendly simulated drones support a Video Feed." Its header shows the entity as FRIENDLY, and it is a simulated class I drone, so the reason contradicts what the operator sees. The true reason is that the external entities are `kind: aircraft` with class codes, which the `drone()` check in `src/world/cockpit.ts:79-87` does not recognise. The reason is also only in a `title` attribute | `d30`; `c1ui-d` `detailsVideoStyle`; `src/world/cockpit.ts:106-107` | State the actual reason, for example "External simulation entities have no simulated camera; affiliation grants no view or control", and show it as visible text |

## Verified as working well

- **Truthful domain labels throughout.** These appear:
  - "SIMULATION ONLY".
  - NOTIONAL in the draft identity, the run line and Details.
  - "altitude MSL" in the identity, "m MSL" in Tracks and "MSL · datum unspecified" in Details.
  - "Local provisional policy: sentinel-simulation-v1-local-1. Exact external signoff remains
    separate."
  - "Module-specific simulated health … no terrain-clearance inference".
  - The zero-area rejection cites the local policy by name.
- **BLUE never grants control.** Every entity is "Unmanaged", Video Feed is disabled (its reason
  text is misleading; see L13), and Fleet reads "0 managed · 0 available · No explicitly managed
  assets" (`f02`).
- **Recovery.** Pending-body protection across reload, exact byte-identical retry, one outcome,
  recovery after an actual restart, and a truthful, actionable refusal when browser storage is full (`e05`).
- **Keyboard path.** Every step can be done from the keyboard. Focus moves to the alert on every
  rejection, and the focus ring is clearly visible in the pane.
- **§9 boundaries are visible.** The map shows `B-N-EDGE` and `R-N-EDGE` at 250 m, the floor and
  ceiling pairs at 0 m, and NON-OP strike-through symbols with a NON-OP label.
- **Candidate 3's single UI change is correct at every width.**

## Redesign recommendations (not counted as defects)

1. Split the pane into three zones: **Compose** (file, example, editor, draft identity, primary Submit),
   **Run control** (run header with a state badge, HOLD, RESUME preparation, and ABORT styled as
   destructive) and **Recorded outcomes**. Use two columns at 1440 px and above.
2. Replace the command select with a command timeline (START → HOLD → RESUME → ABORT) that carries
   status chips and inspects on click.
3. Add a "Prepare RESUME" helper. It would clone the recorded input with a new command ID and the
   RESUME action and still require the operator to supply samples, so the hand edits carry less risk.
4. Add outcome summary chips for each timestamp (counts by outcome type, the number disabled, and
   corrections).
5. Link interaction rows to the mapped entities, so that selecting a row selects them in Tracks,
   Details and the map.
6. Add a JSON editor with highlighting and local schema lint, with paths shown before submission. The
   authority still judges the request.
7. Build Timeline replay (Phase 7, deferred by decision) so the map can show each recorded timestamp.
8. Resolve the "Simulation" naming collision: the header menu is the interactive demo, the module is
   external batches, and there is also the "SIMULATION ONLY" tag.

## Scores

| Dimension | Score / 10 | Basis |
| --- | ---: | --- |
| Functionality | 8.0 | Every required flow completed. The gap is M6, plus M3, where the function is right but the presentation is wrong |
| Clarity and labelling | 7.0 | Strong domain truthfulness, undermined by M3, M4, M5, M7, L2, L4, L5 and L13 |
| Accessibility and keyboard | 6.5 | Complete keyboard path, visible focus, focus moves to the alert. Against that: M2, M8, and M1 (disabled state not perceivable) |
| Appearance | 6.5 | Consistent with Sentinel's tokens, but a flat column of text buttons with no primary, destructive or disabled distinction (M1, L11) |
| Robustness and recovery | 8.0 | Exact retry, actual restart, storage refusal, and zero page errors or provider requests. Against that: M4, M5, L10 |
| **Overall** | **7.2** | **Usable, but not acceptance-grade. H1 and M1–M8 must be resolved; all can be done inside existing components** |

## Cleanup and identity

- I created nine disposable databases, one per run, named
  `frontend/.cache/verification-c1ui-{a,a2,b,c,d,e,f,g,h}-<pid>.sqlite3`. The harness deleted each
  one after its services had stopped (`cleanup-summary.json`, `foreground-summary.json`), and none
  remains under `frontend/.cache`. I opened no other database.
- I started services only through `withIsolatedRuntime` on ports 5431 and 8231, and every run stopped
  them. Ports 5431 and 8231 were free after the last run.
- I did not change product code, tests, fixtures, configuration, scripts or documentation, apart from
  this report. My scratch scripts are under the ignored `frontend/.cache/p5c-critic-1-ui/`. I made no
  commits and no git state changes.
- **End identity (09:52:03 UTC):** candidate digest
  `80e17cec2dde3cb25900867ef6b95c87224fcc0fe5f466722f166e2290a01719`, 667 files, HEAD
  `f98de4f183b27df947fb914893deb2e688b598b0`. This equals the start digest and the frozen
  `candidates/c3` digest (`test-results/phase5-closure/critic-1-ui/identity-end/`), so the reviewed
  candidate did not change during the review.
