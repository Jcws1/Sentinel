# Phase 5 closure — independent UI/UX critic, round 2 (candidate 5)

| Item | Value |
| --- | --- |
| Reviewer | Independent UI/UX critic, round 2. I did not implement any of this work and did not take part in round 1 |
| Review window | 2026-09-24, 13:16–14:42 UTC, one continuous session. The technical critic worked on the same machine at the same time; I ran no timing measurement |
| Candidate | Candidate 5: HEAD `f98de4f` (branch `v3`) plus uncommitted changes |
| Identity | Start digest `27758cb477e1c32902624d5ad656835b1cdcda0bbcecf79127a106d5e429fff9` (668 files, 13:17:00 UTC) equals the end digest (14:41:02 UTC) and the frozen candidate 5 digest: `test-results/phase5-closure/critic-2-ui/identity-{start,end}/` |
| Bundle served | `frontend/dist-verification-p5c-c5`, read-only, through `vite preview` on port 5431 with a task backend on port 8231 and a disposable database per run. I confirmed the bundle carries candidate 5's new strings (ABORT dialog, "not a readable v1 request", "already recorded", finalized indicators, Video Feed reason) and that the gate's S1 `build:test` wrote it at 12:21:42–47 UTC, after the candidate was frozen and identity-checked |
| Browser | Fresh task-owned headed Edge 153.0.4234.48 per run (CDP `noDefaults`, real focus). Screenshots via CDP `Page.captureScreenshot`. Every non-localhost request was blocked and counted |
| Scripts | `frontend/.cache/p5c-critic-2-ui/` (`lib.mjs`, `part-a…h.mjs`), built on the repository harness (`withIsolatedRuntime`, `launchForegroundBrowser`, `foregroundIdentity`, `simulation-ui.mjs`) |
| Raw evidence | `test-results/phase5-closure/critic-2-ui/`: one directory per run (`c2ui-a` … `c2ui-h`) with `result.json` (steps, observations, requests, foreground checks), `cleanup.json`, service logs and PNGs; plus `foreground-summary.json`, `screenshot-notes.md`, `part-*.std{out,err}.log`, cache listings before and after |

## Verdict

**Overall 8.5 / 10. Every round-1 correction works where it was applied, but three Medium findings remain, so the screens are not yet acceptance-grade.**
Two of the three are gaps left by the H1 and M7 corrections. The findings are 0 Critical, 0 High, 3 Medium and 14 Low.

Round 1's corrections are real and hold under keyboard, outage and restart testing:

- ABORT asks for confirmation.
- Unavailable actions look unavailable and keep keyboard focus.
- Stored results no longer read as fresh.
- Outage text is readable, and errors clear when the same read next succeeds.
- Recorded inspection now shows who reached zero health, and when.
- Tracks and Details say when a recording is finalized.
- Accessible names match the visible labels.

Every workflow in the brief finished in the actual application with native foreground proof: 107 of 107 screenshots PID-matched, zero page errors and zero provider requests.

Three things stop the screens reaching 9:

- **M-1:** The finalized state is appended to the end of a truncating header, and that header is the only finalized cue on the Tactical map. At 1440 px with the pane's own UUID mission IDs, and at 760 and 820 px even with short IDs, it is cut to "· ABOR…" or "· A…".
- **M-2:** An ABORT batch submitted from the editor still finalizes the run with one key press, with no confirmation and no destructive styling. The §9 dataset ships exactly such batches.
- **M-3:** The recorded-command list goes stale. After a submission switches runs it lists another run's commands, and after HOLD or ABORT it leaves out the command just committed.

Each of these can be fixed in a few lines with existing components:

- a constraint tag;
- the existing dialog;
- clearing run-scoped state, as `inspect()` already does.

With these three fixed, and preferably L-1 to L-6 as well, I would expect the Phase 5 screens to reach about 9.0. **Beyond that, the remaining gap to best-in-class is redesign work** (listed separately), not defects.

## What I verified personally, and what I was supplied

**Verified by me (executed, observed and inspected in this review):**

- Candidate identity at the start and at the end, and the provenance of the served bundle (strings, and the gate's `build:test` log).
- Eight headed runs with 107 screenshots. Each screenshot was preceded by a PID-matched OS foreground check. I opened every PNG I rely on with the image reader, and the per-image notes are in `screenshot-notes.md`.
- DOM, computed-style, focus and ARIA facts for each state (the `observations` in each `result.json`), the HTTP status of every simulation request, the world API lifecycle and sequence where cited, and the cleanup of every run.
- Source reading of `SimulationPane.tsx`, `client.ts`, `simulation.css`, `SimulationDetails.tsx`, `MissionControls.tsx`, `TracksBrowser.tsx`, `EntityDetails.tsx`, `cockpit.ts`, `externalRun.ts`, `App.tsx`, `mission.css`, `index.css` and `EntityFilters.tsx`. I used it to explain behaviour I had observed, never in place of observing it.
- Read-only cross-checks of retained raw data against the documents:
  - the storage probe's `summary.json` and `attempts.json` (9,687 drones persisted, first refusal at 9,750);
  - the concurrency `summary.json` (local40 maximum arrival gaps of 239, 260 and 286 ms).

**Supplied, not re-verified by me:**

- `TEST-REPORT.md` for candidate 5: backend 680, frontend 579, browser 129/129, corpus 386/0/0, foreground 24/24, and M1–M8.
- `PERFORMANCE.md` beyond the two raw files named above.
- The operator-database scan. I did not open any operator database.
- The backend §9 criteria tests and the geometry exactness claims, beyond what I saw through the UI: R3-1 committed with MUTUAL_EFFECT, and the mapped zone decoded with its exact coordinates.
- The historical Phase 5 reports.

None of the supplied results counts as UI evidence here.

## Native foreground evidence

Before every screenshot I rely on, `foregroundIdentity` required the OS foreground window's PID to belong to the task Edge. It uses Win32 `GetForegroundWindow`, CDP `SystemInfo.getProcessInfo`, and a window title starting with "Sentinel". I never used `document.hasFocus()`.

Two checks had to retry before the PID matched: `d01` after 36 attempts (56.8 s) and `h01` after 21 attempts (32.5 s). The harness took no screenshot until the match, and I asked for no user action. Three `failure-*.png` diagnostics were captured without a check when my own harness steps failed. I do not rely on them.

| Run | Purpose | Task Edge PID | Screenshots, all PID-matched | Check times (UTC) | Provider requests | Page errors | Services stopped, database deleted |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| `c2ui-a` | Keyboard-only workflow, empty, error and busy states, golden lifecycle, ABORT dialog, recorded commands, mapped mission | 34988 | 20/20 | 13:24:11–13:24:46 | 0 | 0 | yes / yes |
| `c2ui-b` | R3-1 from a file; §9 north end to end; widths 760/820/900/1440/1920; south ABORT from the editor | 43952 | 42/42 | 13:28:51–13:30:14 | 0 | 0 | yes / yes |
| `c2ui-c` | Lost response, reload, exact retry, actual outage, restart, unreadable session. Two of my steps failed on my own sequencing (retained); both were redone in `d` and `e` | 38860 | 10/10 | 13:30:51–13:31:42 | 0 | 0 | yes / yes |
| `c2ui-d` | Keyboard pagination, draft refusal, alert focus zoom, outage, restart with a keyboard retry, Fleet, UUID header zoom | 43684 | 11/11 | 13:38:31–13:39:21 | 0 | 0 | yes / yes |
| `c2ui-e` | M5 recovery after an actual restart, loading lines, stale command list, example over draft, HOLD storage refusal, Timeline, retry focus | 44976 | 12/12 | 13:53:27–13:53:55 | 0 | 0 | yes / yes |
| `c2ui-f` | Sydney 40, Tracks and Details by keyboard, Simulation at 820 px. The filter step failed on my selector (retained) and was redone in `g` and `h` | 39532 | 4/4 | 14:01:23–14:01:58 | 0 | 0 | yes / yes |
| `c2ui-g` | §9 finalized Tactical (zoomed), Submit ABORT by keyboard | 39808 | 6/6 | 14:06:14–14:06:28 | 0 | 0 | yes / yes |
| `c2ui-h` | Filters › Condition › NON-OP by keyboard | 40200 | 2/2 | 14:09:09–14:09:10 | 0 | 0 | yes / yes |
| **Total** | | | **107/107** | | **0** | **0** | **8/8** |

Each screenshot's PID, hwnd, window title, attempt count and check time is in `foreground-summary.json`. The screenshot index is in the appendix. **The independent native-foreground verification (G9) is therefore complete on candidate 5.** That is separate from the G11 score.

## Coverage against the brief

| Brief item | Result | Evidence |
| --- | --- | --- |
| Widths 760, 820, 900, 1440 and 1920 | No document-level horizontal overflow at any width. Defects: the header truncates the finalized state at 760 and 820 px (M-1); the pane scrolls horizontally at 900 px with Details docked (L-9); Tracks clips altitude at 900 px (L-11) | `b21`–`b24` at each width, `f06`; observations `w*-header`, `w*-pane` |
| Keyboard-only operation | Complete. See the details below this table. Defects: L-1, L-2, L-3 | `a02`–`a20`; `c2ui-a` observations `tabToOpenSimulation`, `emptyPaneTabOrder`, `abortDialog`, `runPickerArrows`, `recordedCommandsArrows` |
| Empty, loading and error states | Empty prompt; a readable-draft notice for non-v1 drafts; 400 INVALID_JSON; 422 LIVE with code and path; 422 zero-area citing the local policy; 409 COMMAND_ID_CONFLICT, RUN_NOT_HELD (C02) and RUN_TERMINAL; loading lines; 502 outage; unreadable session. Defects: L-5, L-7, L-10, L-12 | `a03`–`a09`, `a15`, `c04`–`c06`, `c13`, `e01`–`e05` |
| R3-1 mixed-scale area | Loaded through "Load JSON batch" and committed with HTTP 200 and MUTUAL_EFFECT. The world zone is exactly `[[0,0],[2e-170,2e-170],[1e-170,0],[1,0],[1,1],[0,1],[0,0]]`, and Tracks and Details decoded both entities | `b01`–`b04`; `r31World` |
| §9 sequence | See the §9 details below this table. Defects: M-1, M-2, M-3 | `b05`–`b20`, `g01`–`g06`, `h02` |
| Lost-response exact retry across reload | The server answered 200, and the browser saw a failure: "The authority is unreachable. Outcome unknown. Your exact command is saved; retry it when the authority is available." After reload the pending body equals the original (`pendingEqualsRaw`). The keyboard retry sent a byte-identical body (`identical: true`), giving one run and world sequence 1. Defect: L-1 (focus after retry) | `c01`–`c03`; `exactRetry`, `exactRetryWorld` |
| Recovery after an actual backend restart | I killed my backend's process tree and observed the outage. Submit read "Authority unavailable (HTTP 502); outcome unknown …" and kept the pending command. After `restartBackend()` a keyboard Retry committed with HTTP 200 (`d07`), and reads recovered (`d08`, `e03`) | `c04`–`c08`, `d06`–`d08`, `e01`–`e03` |
| Label truthfulness | Correct throughout:<br>• "m MSL" in Tracks, "MSL · datum unspecified" in Details, "altitude MSL" in the draft identity.<br>• BLUE shows as FRIENDLY but "Unmanaged", with Video Feed dimmed and the visible reason "Affiliation grants no view or control". Fleet reads "0 managed · 0 available" (`d09`).<br>• NOTIONAL in the draft, the run line and Details.<br>• "Local provisional policy: sentinel-simulation-v1-local-1. Exact external signoff remains separate."<br>• Recorded inspection never claims replay, and Timeline says "Event history and replay are not implemented." (`e11`).<br>• Finalized missions are correct in Tracks and Details.<br>Exceptions: M-1 (header), L-5, L-7 | `a20`, `b04`, `b08`, `b20`, `d09`, `e11`, `f03` |

**Keyboard path in detail.**

- From document start, 10 Tabs reach "Open Simulation", and its tooltip reads "Submit and inspect external batches". Enter opens the view with focus on the Simulation tab.
- Pane order: Load JSON batch → Load notional example → External request JSON → Submit (dimmed while unavailable) → Recorded run → Refresh runs → the run controls.
- Focus stays on Submit, HOLD and ABORT after each command. Rejections move focus to the alert.
- Arrow keys browse the run and command pickers without losing focus (five presses each).
- The ABORT dialog opens with Enter, with focus on Keep run. Tab cycles inside the dialog, and Escape or Keep run returns focus to ABORT without changing the run. Enter on Keep run, or Space on Confirm ABORT, works.
- The Tracks row opens Details with Enter, and Filters › Condition › NON-OP can be set by keyboard.

**§9 north sequence in detail.**

- **START:** HTTP 200 RUNNING. Interactions per timestamp: 0, 0, 28, 28, 20. Six drones reached zero at 06:02, and each is named in "Health changes" (`b06`).
- **Mapped mission:** 48 entities. Tactical shows the pentagon area, the apex and vertex placements, NON-OP symbols and the outside drones (`b07`). Details for B-N-02 shows NON-OP, health 45 → 0 and DISABLED (`b08`).
- **HOLD with 48 supplied rows:** `{}` and HELD; "This control evaluated no timestamps"; world sequence 5 → 7 with no track moved (`b09`).
- **RESUME:** B-N-03 carries the supplied correction (`b11`).
- **ABORT:** through the dialog (`b12`, `b13`).
- **Recorded START, HOLD and RESUME after ABORT:** all inspectable, per timestamp (`b14`–`b17`).
- **Finalized mapped mission:** Tracks and Details are correct (`b20`). The header is correct at 1440 px for this short ID but truncated at 760 and 820 px (M-1).
- **South ABORT batch from the editor:** committed on one Enter (M-2).

## Round-1 findings: re-verification on candidate 5

A disposition is not evidence. Each "Fixed" item below was operated by me.

| ID | Disposition claimed | My verification | Evidence |
| --- | --- | --- | --- |
| H1 single-press ABORT | Fixed | **Verified for the ABORT button.** It opens an alertdialog with the title "ABORT \<mission\>?" and the text "ABORT finalizes this run's recording. The run cannot be held or resumed afterwards; continuing needs a new mission ID. Recorded results stay inspectable." Keep run is focused first, and focus rings are visible on both buttons. Tab is trapped in the dialog. Escape and Keep run change nothing and return focus to ABORT. The button uses the destructive colour and sits apart from HOLD. Enter on the unavailable ABORT sends nothing. **Residual path:** Submit of an ABORT batch (M-2) | `a12`–`a14`, `b12`; `abortDialog`, `abortKeepRun`, `unavailableAfterAbort`; `g05`, `g06` |
| M1 disabled look | Fixed | **Verified.** Unavailable buttons are `aria-disabled` with opacity 0.45. The textarea and file control dim while locked, and so does the Details Video Feed | `a07`, `a14`, `c06`; `busyState`, `abortConfirmed` controls |
| M2 focus and picker browsing | Fixed | **Verified** for Submit, HOLD, ABORT, the ABORT dialog return and pagination. The run and command pickers keep focus through five arrow, Home and End presses, and every press changes the shown result. **Residuals:** focus falls to the page after a successful Retry (L-1), and a focused pager can scroll out of view (L-2) | `a08`, `a10`, `a11`, `a17`, `d02`; `runPickerArrows`, `recordedCommandsArrows` |
| M3 stored results read as fresh | Fixed | **Verified.** "a70d…: already recorded. The stored START result was returned; no new command was created. Current run state: ABORTED." The outcome reads "run state recorded with this command: RUNNING" | `a16`; `exactRetryAfterAbort` |
| M4 raw error text | Fixed | **Verified for submissions.** A lost response gives "The authority is unreachable. Outcome unknown. Your exact command is saved; retry it when the authority is available." A 502 gives "Authority unavailable (HTTP 502); outcome unknown. …". There are no "Error:" prefixes or parser text. Read failures during the outage are plain ("Simulation run catalog unavailable.") but do not say the authority is down; see L-7 | `c01`, `c04`–`c06` |
| M5 stale errors and mixed regions | Fixed | **Verified.** The alert and the status line are separate regions. A catalog error clears on the next successful Refresh runs (`e03`). As scoped, it stays after a different read succeeds (`e02`) | `c04`, `e01`–`e03` |
| M6 per-timestamp health | Fixed | **Verified.** At 06:02 the pane shows "Health changes: 19 of 48 drones · 6 reached zero health · 0 supplied corrections." It lists B-N-02, B-N-04, B-N-05, R-N-04-001, R-N-05-001 and R-N-05-004 as DISABLED, with a "Show all 48 health rows" toggle and pagination. The B-N-03 correction reads "Yes: supplied health differs from the last recorded output" | `b06`, `b11`, `b15`–`b17`, `d01` |
| M7 finalized mission looked live | Fixed | **Verified in Tracks** ("RECORDING FINALIZED · ABORTED", "Last recorded"), **in Details** ("Delivery · recording finalized (ABORTED)"), in the run line and in the mission menu. **Not reliable in the header**, which is the only cue on the Tactical map (M-1) | `a20`, `b19`, `b20`; `a19`, `d10`, `d11`, `b21-w760` |
| M8 accessible names | Fixed | **Verified by ARIA snapshot and exact-name locators.** The controls are button "Load JSON batch", textbox "External request JSON", combobox "Recorded run", combobox "Recorded command" and combobox "Source timestamp (UTC)" | `emptyAria`, `outcomeAria`; my scripts use the exact names |
| L1 silent loading | Fixed | **Verified.** "Loading recorded run…" and "Loading recorded command result…" appear, and the chosen item stays shown. The run section disappears while loading (L-10) | `e04`, `e05` |
| L2 "View only" tooltip | Fixed | **Verified.** The tooltip reads "Submit and inspect external batches" | `a02` |
| L3 "1 supplied timestamps" | Fixed | **Verified** for timestamps. A sibling defect remains: "1 interactions" (L-6) | `a08`, `b09` |
| L4 draft identity, action in notices | Fixed in part | **Verified** the "Draft to submit" heading and notices that name the action ("HOLD committed · HELD"). Keeping "Submit RESUME" after ABORT is **justified**: drafts are not bound to runs, and the rejection shows RUN_TERMINAL | `a11`, `a15`, `b13` |
| L5 error codes | Fixed | **Verified.** For example: "RUN_TERMINAL: Command is not allowed in the current run state (at /command/action)" | `a15` |
| L6 HOLD while HELD | Fixed | **Verified.** The button reads "HOLD again (recorded no-op)" | `a11`, `b09` |
| L7 no condition cue in Tracks | Not changed | **Justified as shared** (Tracks column set). I confirmed that Filters › Condition › NON-OP works by keyboard: 8 of 48 in §9 at 06:02. Details shows NON-OP. Kept as a redesign recommendation | `h01`, `h02`, `b08` |
| L8 co-located symbols | Not changed | **Justified as shared renderer.** In §9 it is more visible: a selected entity's ring sits on a symbol labelled with another drone (`b18`, `b22-w900`). Kept as a recommendation | `a19`, `b07`, `b18` |
| L9 UTC and wall-clock times | Fixed in part | **Verified** the picker label "Source timestamp (UTC)". The timestamp disposition (sign-off needed) is **justified**. Its visible effect remains: "1,603,467.9 s before frame" (L-13) | `a20` |
| L10 unreadable session | Not changed | **Partly justified.** A discard needs a durability decision, but the message could still tell the operator what to do (L-12) | `c13` |
| L11 visual polish | Not changed | Redesign; the observations are unchanged | `a03`, `b24-w1920` |
| L12 Tracks altitude at 900 px | Not changed | Still present (L-11). MSL stays readable in Details | `b21-w900` |
| L13 Video Feed reason | Fixed | **Verified.** The reason is visible: "Video Feed is not available for external simulation entities. Affiliation grants no view or control." | `a20`, `b04`, `f03` |
| Lead: unreadable draft shown as empty | Fixed | **Verified.** "This draft is not a readable v1 request (invalid JSON or outside the v1 schema), so its identity cannot be shown. It can still be submitted: …" | `a04`, `a05` |

## Findings, ranked by severity

### M-1 — A finalized mission's state is cut off in the header, which is the only finalized cue on the Tactical map

- **Location:**
  - `frontend/src/features/mission/MissionControls.tsx:44-49` appends the state to the end of the name (`` `${name} · ABORTED · recording finalized` ``).
  - `frontend/src/styles/mission.css:18-27` sets `.mission-picker` to `max-width: 420px`, and `:36-40` sets `.mission-name` to `text-overflow: ellipsis`.
  - Screen: Tactical Map after "Inspect mapped mission".
- **Reproduction:**
  1. Load notional example → Submit START → ABORT external run → Confirm ABORT → Inspect mapped mission, at 1440 px. The header reads "Simulation · TEST-97ce25eb-7fc1-4c8c-bb86-05029805ccf2 · ABOR…" (`a19`).
  2. With a `UI-golden-<uuid>` mission it reads "… · A…". The element's scrollWidth is 533 px against a clientWidth of 395 px (`d10`, and zoomed ×3 in `d11`).
  3. Even the short §9 ID truncates at 760 px ("… · SYN-S9-NORTH · ABOR…") and at 820 px ("… · ABORTED · recor…") (`b21-w760`, `b22-w760`, `b21-w820`).
  4. Nothing on the map itself marks the mission finalized (`a19`, `b18`, `b22-*`, `g01`).
- **Evidence:** `c2ui-a/a19`; `c2ui-d/d10`, `d11` and observation `uuidHeader`; `c2ui-b/b21-w760`, `b22-w760` and `b21-w820`, with observations `w760-header`/`w820-header` (`truncated: true`).
- **Impact:**
  - "Inspect mapped mission" lands on the Tactical map. For ordinary IDs, the pane's own example uses `TEST-<uuid>` and the contract allows 128 characters.
  - At the narrow widths the brief requires, the finalized state is hidden behind the ellipsis. A finalized recording can then read as a current picture: the round-1 M7 hazard, in the one view that has no other cue.
  - The full name exists only as a hover `title` and in the screen-reader-only status.
  - The code comment's own goal ("a finalized external recording must never read as current") is not met there.
- **Correction:**
  - Show the state where it cannot truncate. One option is a non-truncating constraint tag beside the mission picker, reusing the Tracks tag "RECORDING FINALIZED · ABORTED". Another is to put the state before the ID.
  - Preferably, also add the same tag to the map's chip row next to "LOCAL GRID".
  - Keep the full name in the `title`.

### M-2 — Submitting an ABORT batch from the editor finalizes the run on one key press, with no confirmation or destructive styling

- **Location:** `frontend/src/modules/simulation/SimulationPane.tsx:298-304`. "Submit \<action\>" calls `client.submit()` for any action. The confirmation at `:389-435` guards only the "ABORT external run" button.
- **Reproduction:**
  1. Submit §9 south START (`S9-S-START`).
  2. Paste `S9-S-ABORT`, the dataset's own T+04:00 ABORT, into "External request JSON". The identity reads "S9-S-ABORT · ABORT".
  3. Press Tab once to reach "Submit ABORT", which has ordinary styling (`g05`), and press Enter.
  4. The run is final at once ("S9-S-ABORT: ABORT committed · ABORTED"). No dialog appears (`dialogs: 0`).
- **Evidence:** `c2ui-g/g05`, `g06` and observation `editorAbortKeyboard` (`tab: 1, dialogs: 0, status: 200`); `c2ui-b/b25`, `b26` and `southAbortSubmit`.
- **Impact:**
  - The same irreversible terminal action that H1 guarded is still one keystroke away, on the path the §9 sequence uses. The dataset ships ABORT batches for both areas.
  - Submit is the control operators press for every command. Loading the wrong file from a folder of START, HOLD, RESUME and ABORT batches, then pressing Submit, finalizes the run, and continuing needs a new mission ID.
  - Two paths to the same terminal outcome behave inconsistently.
- **Correction:** When the draft's action is ABORT, route Submit through the same alertdialog ("ABORT \<mission\>? …", with **Keep run** focused first) and give the button the destructive style.

### M-3 — The recorded-command list goes stale: after a submission switches runs it lists another run's commands, and after HOLD or ABORT it leaves out the new command

- **Location:**
  - `frontend/src/modules/simulation/client.ts:349-379`: a successful `submit()` sets `selected: current` but keeps `commands` and `commandsAfter`. By contrast, `inspect()` clears them at `:207-217`.
  - `control()` (`:506-559`) goes through `submit(true)` and never refreshes a loaded list.
  - `SimulationPane.tsx:443-494` renders `state.commands` under the selected run.
- **Reproduction:**
  1. With run A selected, press Load recorded commands. The picker lists A's "START · CMD-26c7… · completed".
  2. Submit a START for mission B. B becomes the selected run and the outcome shows B's START (CMD-f190…). The "Recorded command" picker still lists run A's START (`e06`).
  3. Choose that entry. The alert shows "Recorded command identity mismatch." (`e07`).
  4. Now load B's list and press HOLD. The picker still lists only START and shows "Select committed command". The new HOLD appears only after Load recorded commands is pressed again (`e08`).
- **Evidence:** `c2ui-e/e06`, `e07` and `e08`; observations `afterSwitch`, `staleOptions`, `afterStalePick` and `commandsAroundHold`.
- **Impact:**
  - Recorded inspection presents another run's command identity as belonging to the selected run.
  - After HOLD or ABORT, the run's command history silently leaves out the command just committed.
  - The identity check prevents a wrong outcome from being shown. The operator still sees a wrong or incomplete history and an internal-sounding error.
  - This is likely in the two-area §9 workflow: START north, load its commands, then START south.
- **Correction:**
  - When `submit()` changes `selected` to another run, clear `commands`, `commandsAfter` and the command selection, as `inspect()` already does.
  - After a committed command for the selected run, reload a loaded list, or at least label it "out of date — reload".

### Low

| ID | Finding | Location | Evidence | Correction |
| --- | --- | --- | --- | --- |
| L-1 | After a keyboard "Retry exact pending command" commits, focus falls to the page: the button unmounts. The next Tab lands on "Recorded run" | `SimulationPane.tsx:305-312` | `c03` (`exactRetry.active` BODY), `d07`, `e12` (`retryFocus`) | Move focus to the status message (`tabIndex -1`) or to Submit when the pending command resolves |
| L-2 | "Next health rows" on a shorter last page leaves the focused button 817 px above the viewport. The table shrinks and the pane keeps its scroll position (WCAG 2.4.11) | `SimulationPane.tsx:127-141` | `d01`; `healthPaging.afterNext` (rect y -817, `inViewport: false`) | Reserve the table height, or scroll the pager into view (`block: 'nearest'`) after a page change |
| L-3 | The focus outline of the alert covers its first character ("NVALID_JSON"): the global `outline-offset: -3px` meets the unpadded alert | `styles/index.css:58-63`, `simulation.css:70-72` | `a04`, `a05`, `a09`, `d05` (zoomed ×3) | Pad the alert, or use a positive outline offset for it |
| L-4 | "Load notional example" replaces a hand-edited draft (here a RESUME) without asking. The controlled textarea keeps no undo history | `SimulationPane.tsx:229-250` | `e09`; `exampleOverDraft` (replaced, no dialog) | Confirm when the draft has been edited, using the existing "Replace …?" dialog pattern |
| L-5 | Every rejection shows "Prior committed run remains unchanged.", even when no run exists. The gate's own storage-probe attempts show the same text | `client.ts:319-320` | `a04`, `a05`; `gate-c5/storage/p5c-c5-storage/attempts.json` | Say "No run was created or changed." when the mission has no run |
| L-6 | "2 health rows · 1 interactions": the L3 pluralisation fix missed interactions | `SimulationPane.tsx:545-547` | `a08`, `a18` | Pluralise as in L3 |
| L-7 | HOLD or ABORT during an outage reads "Recorded command input unavailable." It does not say the command was **not sent** or that the authority is unavailable. Behind the proxy, a 502 is not classed as "unreachable" | `client.ts:46-52`, `:122-128`, `:524-525` | `c05`; `outageHold` (input GET 502) | For example: "HOLD not sent: the authority is unavailable (HTTP 502). Try again when it is available." |
| L-8 | The file control keeps a stale file name. It shows "r3-1.json" after §9 drafts were pasted, and "neutral-26000.json" after that file was refused while the editor kept another draft. The draft refusal also omits the practical limit and the HTTP-API alternative that the submission refusal gives | `SimulationPane.tsx:206-228`; `client.ts:411-417` | `b09`, `b13`, `d03`, `d06` | Reset the input after reading or refusing; add size guidance to the draft refusal |
| L-9 | At 900 px with Details docked, the Simulation pane scrolls horizontally. The "Recorded run" picker (476 px) is wider than the pane (466 px), and its label wraps above it | `simulation.css:19-25`, `:48-55` | `b24-w900`; `w900-pane` (466/493) | Let the label flex item shrink (`min-width: 0`, select `width: 100%`) |
| L-10 | While a run loads, the whole run section (state, HOLD, ABORT and commands) disappears and returns. Arrow browsing makes it flicker | `client.ts:207-217`; `SimulationPane.tsx:359-360` | `e04` | Keep the section, marked as loading, or reserve its height |
| L-11 | Round-1 L12, unchanged: Tracks clips "Altitude / ref" at 900 px ("Altitu", "340 ı") on the external mission | Shared `TracksBrowser` | `b21-w900` | As round 1 (column priority or minimum width) |
| L-12 | Round-1 L10, unchanged: an unreadable saved session is a dead end with no guidance | `client.ts:104-111` | `c13` | Without deciding on discard, name the storage key and a safe next step in the message |
| L-13 | Round-1 L9 remainder: after a UI HOLD or ABORT on a mission with past samples, Details shows "1,603,467.9 s before frame" | Shared Details freshness | `a20` | Format long lags as days and hours. The timestamp policy itself rightly awaits sign-off |
| L-14 | Status-document accuracy, detailed in the next section | `README.md:110`; `TEST-REPORT.md:302-306`; `architecture.md:346` | Next section | As listed |

## Status documents

- **The closure README separates the three categories clearly.**
  - "Passed on the final source".
  - "Accepted limitations (proposed, for the user's confirmation)": P5-BATCH, the UI batch size limit and §9 replay.
  - "Not claimed": organiser conformance, global polygon interiors and throughput at the contract maxima.

  The hard-gate table correctly leaves G9–G11 pending. Its numbers match the supplied raw data I cross-checked.
- **The following are consistent with the closure and with each other:**
  - the IMPLEMENTATION_PLAN top entry and its Phase 5 status paragraph;
  - the architecture §5 and §11 rows (P5-GEOMETRY closed on candidate 5, P5-BATCH a proposed accepted limitation, P5-CONFORMANCE open);
  - the docs index;
  - the historical README pointer;
  - the Phase 5 section of `frontend/tests/README.md`.
- **L-14 details:**
  - (a) README "Current limits" names P5-BATCH and the unsigned C01–C23 but not the accepted UI batch-size limit (about 9,700 drones in browser storage; larger batches use the HTTP API).
  - (b) TEST-REPORT §6 calls `dist-verification-p5c-c5` "pre-existing … not built by this runner", but the runner's own S1 `build:test` log shows it built that directory (`gate-c5/prereq/frontend_build_test.log`, 19 output lines, 12:21:42–47 UTC). The fact helps provenance, but the sentence is wrong.
  - (c) `architecture.md:346` lacks a comma between the "pacing" and "Phase 5 measurements" links.

## Redesign recommendations (not counted as defects)

1. Compose, Run control and Recorded outcomes as separate zones. Give Submit a primary style, and give ABORT a place in a run header rather than at the far right. At 1920 px ABORT sits about 1,100 px from HOLD (`b24-w1920`).
2. A command timeline (START → HOLD → RESUME → ABORT) with status chips, updated automatically, in place of the command picker.
3. For supplied-health corrections, show "last recorded 15 → supplied 100" (B-N-03), not only "Yes: supplied health differs …".
4. Link health and interaction rows to Tracks, Details and the map.
5. A Condition column or NON-OP suffix in Tracks (L7). Cluster badges or stacked labels for co-located symbols (L8), which matter more in §9, where a selection ring sits on a symbol labelled with another drone.
6. A persistent mission-state band on the Tactical map for external missions, covering both a recorded batch in progress and a finalized recording.
7. Show "Next 100 commands" only once a list reaches 100. Today it is a permanent dimmed tab stop.
8. Timeline replay (Phase 7, deferred by decision). Resolve the "Simulation" naming collision between the header menu and the module.

## Scores

| Dimension | Score / 10 | Basis |
| --- | ---: | --- |
| Functionality | 8.5 | Every required flow works end to end, including R3-1, the complete §9 sequence, recorded inspection with health changes, exact retry and restart recovery. Against that: M-3 (stale command list) and M-2 (unguarded terminal path) |
| Clarity and labelling | 8.4 | Domain labels are truthful. Stored-result, outage and rejection wording now reads well, finalized indicators appear in Tracks and Details, and the Video Feed reason is shown. Against that: M-1, L-5, L-6 and L-7 |
| Accessibility and keyboard | 8.8 | The keyboard path is complete, focus is kept after commands, the dialog manages focus properly, names match the labels and the disabled state is perceivable. Against that: L-1, L-2 and L-3 |
| Appearance | 7.8 | Consistent with Sentinel's tokens, with destructive and disabled distinctions added. Still a flat column of text buttons with weak hierarchy, plus the 900 px pane overflow (L-9) and the round-1 polish items (redesign) |
| Robustness and recovery | 8.8 | Byte-exact retry across reload, recovery after an actual restart, truthful storage refusals, errors that clear on recovery, zero page errors and zero provider requests. Against that: M-3 and L-7 |
| **Overall** | **8.5** | **Not acceptance-grade while M-1, M-2 and M-3 remain. Each has a small correction inside existing components; with them fixed, the remaining gap to best-in-class is redesign** |

## Cleanup and identity

- I created eight disposable databases, one per run, as `frontend/.cache/verification-c2ui-{a…h}-<pid>.sqlite3`. The harness deleted each one after its services stopped: every `cleanup.json` shows `servicesStopped: true`, `cleanupOk: true` and `deleted: true`.
- The `.cache` listing before and after my review differs only by my own scratch directory `p5c-critic-2-ui/` and the technical critic's `p5c-critic-2-tech/`, and no `verification-c2ui-*` file remains (`cache-listing-{before,after}.txt`). I opened no other database.
- I started services only through `withIsolatedRuntime` on ports 5431 and 8231. Backend kills targeted only the backend process tree my own harness had started (`taskkill /T` on `pids[0]`). Nothing was listening on 5431 or 8231 afterwards, and no Playwright Edge or task process remained.
- I changed no product code, tests, fixtures, configuration, scripts or documentation, apart from this report. My scratch scripts are in the ignored `frontend/.cache/p5c-critic-2-ui/`. I made no commits and no git state changes.
- **End identity (14:41:02 UTC):** candidate digest `27758cb477e1c32902624d5ad656835b1cdcda0bbcecf79127a106d5e429fff9`, 668 files, HEAD `f98de4f183b27df947fb914893deb2e688b598b0`. This equals the start digest and frozen candidate 5, so the reviewed candidate did not change during the review.

## Appendix: screenshot index (all under `test-results/phase5-closure/critic-2-ui/`)

| Run | Edge PID | PID-matched | Screenshots |
| --- | ---: | ---: | --- |
| `c2ui-a` | 34988 | 20/20 | a01 initial · a02 activity tooltip · a03 empty · a04 400 · a05 422 LIVE · a06 422 bow-tie · a07 busy · a08 START · a09 409 · a10 run picker · a11 HELD · a12 dialog (Keep run) · a13 dialog (Confirm) · a14 ABORTED · a15 RUN_TERMINAL · a16 stored result · a17 command picker · a18 all health rows · a19 Tactical after ABORT · a20 Tracks and Details after ABORT |
| `c2ui-b` | 43952 | 42/42 | b01–b04 R3-1 · b05–b06 §9 START · b07–b08 §9 mapped (running) · b09–b10 HOLD · b11 RESUME · b12–b13 ABORT · b14–b17 recorded after ABORT · b18–b20 finalized mission · b21–b24 at 760/820/900/1440/1920 · b25–b26 south ABORT from the editor |
| `c2ui-c` | 38860 | 10/10 | c01 lost response · c02 after reload · c03 exact retry · c04–c07 outage · c08 restarted · c11 draft during pending lock · c13 unreadable session |
| `c2ui-d` | 43684 | 11/11 | d01–d02 pagination · d03 draft refusal · d04 HOLD (probe inconclusive, not relied on) · d05 alert zoom · d06 picker during outage · d07 keyboard retry after restart · d08 reads after restart · d09 Fleet · d10 UUID header · d11 header zoom |
| `c2ui-e` | 44976 | 12/12 | e01–e03 M5 recovery · e04–e05 loading lines · e06–e07 stale command picker · e08 list after HOLD · e09 example over draft · e10 HOLD storage refusal · e11 Timeline · e12 focus after retry |
| `c2ui-f` | 39532 | 4/4 | f01 Sydney Tactical · f02 Tracks and Details by keyboard · f03 Details outcome · f06 820 px HOLD focus |
| `c2ui-g` | 39808 | 6/6 | g01 §9 finalized Tactical · g02 zoom · g03–g04 filter attempt (NON-OP not reached by my key sequence; redone in `h`) · g05 Submit ABORT focused · g06 editor ABORT committed |
| `c2ui-h` | 40200 | 2/2 | h01 Condition submenu by keyboard · h02 Tracks filtered to NON-OP |
