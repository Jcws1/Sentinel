# Review responses

Every critic finding and its disposition. **Fixed** items are in the next
candidate and are re-verified by the final gate and the next critic round.
Nothing in a critic report was edited; scores stand as written.

## Round 1 (candidate 3)

Technical critic: [CRITIC-1-TECH](CRITIC-1-TECH.md), **8.8/10** (1 Medium,
6 Low). UI/UX critic: [CRITIC-1-UI](CRITIC-1-UI.md), **7.2/10** (1 High,
8 Medium, 13 Low). Corrections form candidate 4; candidate 5 adds the two items at the end.

### Technical findings

| ID | Finding | Disposition | Change and evidence |
| --- | --- | --- | --- |
| M1 | Lifecycle tests and the corpus took their expectations from the product's own transition table | **Fixed** | `test_simulation_service.py` now writes the spec §8 cells (C) and the register's provisional C02/C03 cells (P) as literals, and a separate test checks that `policy.TRANSITIONS` equals them. The corpus carries its own literal table and no longer imports product policy; its docstring names the one case that uses product code as a reference (the dense hard-kill retry is compared with the resolver's result, because it tests recovery). Re-running the critic's own mutation plugin now fails all three mutated cells and the equality test (`test-results/phase5-closure/lead-checks/mutation/`) |
| L1 | Operator-database scan ran on the 00:46 geometry code and covered polygon validity only | **Fixed** | The approved read-only scan is re-run on candidate 4, whose backend and geometry files are hash-identical to candidates 5 and 6, into a new directory; the 00:46 results stay as their own evidence. It now also compares HEAD's external ring verdict and per-drone containment with the candidate's for every stored simulation command, and runs the candidate's complete validation (including rule coverage) on each stored request. Counts and command IDs only |
| L2 | Worst-case cost of the exact predicate on 101-position rings not characterised | **Fixed** (completed in round 2) | An exact bounding-box early exit now skips orientation work for segment pairs with disjoint boxes, in both `geometry.py` and `exactGeometry.ts` (decimal order equals double order, so the test is exact). New direct segment-contact tests compare both with the oracles on degenerate small-integer quadruples, including boxes that only touch. M4 and M5 now also time three 101-position zones (ordinary, mixed-exponent, subnormal-scale) against HEAD; they are reported separately and are outside the budget, which covers tracked fixtures. Those stars are the early exit's best case: it helps only when edge boxes are disjoint, so round 2 adds box-dense accordion zones (round 2, L2). Memoising validated zones was not added: it would make the predeclared A/B measure cache hits |
| L3 | Three §9 tests weaker than their names | **Fixed** | (a) The second clean run now runs in separate processes with `PYTHONHASHSEED` 0 and 20260924. (b) The §9 dataset gains an in-radius pair on a polygon vertex (`R-/B-{N,S}-APEX`, 200 m apart), asserted as a pair. (c) The pair-order test asserts that the reversed run's raw interaction order is exactly reversed, on timestamps with at least two pairs |
| L4 | Frontend and backend report different first violations for zero-area rings | **Fixed** | `integrity.ts` now checks in the backend's order (closure, distinct vertices, zero area, then edges). The shared vectors and the randomized TypeScript tests now assert the same first-violation reason as the backend and the oracle, not only validity |
| L5 | Unretained or inaccurate statements | **Fixed** | Unretained micro-timings removed from PERFORMANCE (the final gate's diagnostic frames replace them); the §9 UI size now states the largest single submission; memory labelled MiB; TESTING no longer calls `test_geometry_history.py` I/O-free; the generator docstring says pentagons |
| L6 | Quota refusal could blame a small HOLD/ABORT for being "too large" | **Fixed** | A refused control now says the saved draft leaves no room to protect the command, and that it was not sent; unit test added |
| Info | ECMAScript digit choice is closest-then-even by recommendation | Recorded | Added to the C17 row of the sign-off table: parity is verified for Node 24/V8 (Edge's engine family); another engine needs the same spelling check |
| Info | `PreparedRing` is rebuilt per timestamp and pass | Not changed | Cheap for ordinary rings; the early exit above bounds the pathological case |
| Info | The concurrency client serialises the 10k body on its own loop | Not changed | Below the server stall; the server-side publication tap is the primary signal |

### UI/UX findings

| ID | Finding | Disposition | Change |
| --- | --- | --- | --- |
| H1 | ABORT, a terminal command, ran on a single key press | **Fixed** | ABORT opens an alertdialog (the existing Radix pattern of "Replace unsaved arrangement?"): "ABORT <mission>? … cannot be held or resumed afterwards …", with **Keep run** focused first and **Confirm ABORT**; Escape or Keep run changes nothing and returns focus to ABORT. ABORT uses the destructive colour and sits apart from HOLD |
| M1 | Disabled controls looked enabled | **Fixed** | Unavailable controls use the existing 0.45-opacity convention (buttons, selects, editor, file control). Details' disabled Video Feed does too |
| M2 | Focus fell to the page after actions; pickers stopped after one arrow step | **Fixed** | Unavailable actions stay focusable (`aria-disabled`, the `DecisionSuggestions` precedent) and ignore activation, so focus stays on the control used. The run and command pickers stay enabled while loading; a newer choice supersedes the in-flight one (generation guards) and the chosen item stays shown. Focus returns to ABORT after the dialog |
| M3 | Stored results read as fresh commits and current state | **Fixed** | When the returned command is not the run's current command, the notice says "already recorded … no new command was created. Current run state: ABORTED". The outcome reads "run state recorded with this command: RUNNING" |
| M4 | Raw parser and fetch errors shown; outage text unreachable | **Fixed** | Network failures, timeouts, empty or unreadable bodies and 5xx now read "… outcome unknown. Your exact command is saved; retry it when the authority is available." (with the HTTP status for 5xx). No "Error:" prefixes |
| M5 | Errors stayed after recovery; success text drawn red in the alert | **Fixed** | A read failure clears when the same read next succeeds, and only then. The alert and the status line are separate regions |
| M6 | Recorded inspection hid per-timestamp health outcomes | **Fixed** | "Health changes" per timestamp: changed rows by default (drone, before → after, status, supplied correction), a "show all N health rows" toggle, pagination, and counts of drones that reached zero health and of supplied corrections |
| M7 | After ABORT the mapped mission looked live | **Fixed** | A finalized external mission reads "… · ABORTED · recording finalized" in the mission name (header, status line, mission menu; the presented frame's lifecycle wins over a stale catalog entry). Tracks shows "RECORDING FINALIZED · ABORTED" and "Last recorded" instead of "Tracking"; Details shows "Delivery · recording finalized (ABORTED)"; the run line adds "recording finalized". Interactive missions are unchanged |
| M8 | Accessible names differed from visible labels | **Fixed** | Names now equal the visible text: "Load JSON batch", "External request JSON", "Source timestamp (UTC)"; the pickers have visible labels "Recorded run" and "Recorded command". Tests use the new names |
| L1 | Silent loading | **Fixed** | "Loading recorded run…" and "Loading recorded command result…" status lines; the choice stays shown |
| L2 | Activity Bar called Simulation "View only" | **Fixed** | "Submit and inspect external batches" |
| L3 | "1 supplied timestamps" | **Fixed** | Pluralised |
| L4 | Draft identity unlabelled; notices omitted the action | **Fixed in part** | "Draft to submit" heading; notices name the action ("…: HOLD committed · HELD"). A draft is not bound to a run, so Submit stays available after ABORT; the authority's rejection now shows its code (L5) |
| L5 | Rejections omitted the error code | **Fixed** | "RUN_TERMINAL: … (at /command/action)" |
| L6 | HOLD offered while HELD | **Fixed** | Relabelled "HOLD again (recorded no-op)"; the C03 behaviour is unchanged |
| L7 | Tracks rows lack a condition cue for zero-health drones | Not changed | Shared Tracks column set, outside Phase 5; condition is available through Filters, Details and the map. Recorded as a recommendation |
| L8 | Co-located drones show one symbol | Not changed | Shared renderer behaviour; redesign recommendation |
| L9 | Raw UTC times; wall-clock control timestamps; long lag in seconds | **Fixed in part** | The timestamp picker is labelled UTC. Control commands keep `issued_at`/`execute_at` = now: changing them would change submitted command content (C14/C19), which needs sign-off. Shared Details lag formatting unchanged |
| L10 | Unreadable saved session is a dead end | Not changed | Preserving unreadable browser data and blocking is deliberate (unit test "preserves corrupt storage without overwriting it"); an in-product discard needs a durability decision. Recorded as a recommendation |
| L11 | Visual polish: alignment, primary Submit, empty space at 1920 px | Not changed | Visual redesign; ABORT's destructive style is the only styling change |
| L12 | Tracks clips "Altitude / ref" at 900 px | Not changed | Shared Tracks column sizing outside Phase 5; MSL remains in Details and on scroll |
| L13 | Video Feed reason contradicted the FRIENDLY header | **Fixed** | External entities now give "Video Feed is not available for external simulation entities. Affiliation grants no view or control." as visible text (and as the button description). Eligibility is unchanged: external entities were never eligible |
| Redesign list | Eight recommendations | Recorded | Not built (task rule: no redesign) |

### Found by the lead while correcting

| Item | Disposition |
| --- | --- |
| Storage probe race (candidate 4 gate, M7 INCOMPLETE) | The probe queried the Submit button 30 s after a 16,000-drone draft registered, while the page was still rendering it. Candidate 1 and candidate 4 builds behave alike (33 s and 36 s until that draft registers), so this was never a product regression. Candidate 5 waits for the page to finish rendering before querying (no timeout changed); the gate re-measures |
| Unreadable draft shown as empty | A draft that is invalid JSON or outside the v1 schema showed the empty-state prompt "Load a batch or example". Candidate 5 says the draft is not a readable v1 request and that the authority will report the first error; asserted in the rejection browser test |
| Corpus hard-kill race | On a dev run the corpus killed the backend after the dense batch had committed. An HTTP status read in the ~0.1 s cooperative window reached the harness only after the ~4 s synchronous completion. Killing the Windows venv launcher itself ends the interpreter in about 0.12 s (checked). The kill now triggers on the durably pending command in the harness's own disposable database (read-only); assertions stay on HTTP. Three dev runs: pending → interrupted. The failed run is retained (`test-results/phase5-closure/dev/presanity-c4/corpus.*`) |

## Round 2 (candidate 5)

Technical critic: [CRITIC-2-TECH](CRITIC-2-TECH.md), **8.8/10** (1 Medium,
5 Low). UI/UX critic: [CRITIC-2-UI](CRITIC-2-UI.md), **8.5/10** (3 Medium,
14 Low); its native-foreground verification passed (107/107 PID matches).
Corrections form candidate 6; the complete final gate and fresh round-3 critics
review it.

### Technical findings

| ID | Finding | Disposition | Change and evidence |
| --- | --- | --- | --- |
| M1 | The P5-BATCH limitation was measured only on one- and two-timestamp batches, although completion writes one frame per timestamp and each frame carries every drone seen so far | **Fixed (measured and disclosed)** | Predeclared M9 (PLAN, amendments after round 2) runs the same concurrency harness with `steps100x40` and `churn300` against matched controls. README, the closure README, PERFORMANCE, architecture §5/§11 and the C23 row now say the pause grows with timestamps and with the drones each frame carries, with the measured values. No architectural change (user decision) |
| L1 | For polygons with three or more holes, the frontend reported a different first violation (validity always agreed) | **Fixed** | `integrity.ts` checks every contact with earlier rings before any hole overlap, as `geometry.py` and the oracle do. The shared vectors gain the critic's polygon, three more multi-hole cases and every order of four holes at unit and 1e-300 scale (59 polygons; the generator fails unless several depend on the check order). The superseded order fails 9 of them; the critic's 3,000-polygon family now shows 0 differences (`test-results/phase5-closure/lead-checks/r2/`) |
| L2 | The 101-position diagnostic zones were the early exit's best case; large-area containment had no A/B | **Fixed** | M4/M5 diagnostics gain three accordion zones whose edge boxes all overlap; each M5 child also times resolver containment for 100 drones on the golden area and every diagnostic zone. Reported, not budgeted. PERFORMANCE, architecture §11 and the round-1 L2 response now say the early exit helps only when edge boxes are disjoint |
| L3 | The C17 row did not disclose that the exact predicate rejects some mixed-exponent rings the old code accepted | **Fixed (disclosed)** | C17 row and closure README: genuinely self-intersecting mixed-exponent rings that HEAD's inexact arithmetic accepted are now rejected; a HEAD-era recording or completed command with such an area would fail strict reads and identical retries after the upgrade; the tracked data and both operator databases hold none |
| L4 | Frozen negative fixtures were asserted by status and code only | **Fixed** | The resolver test and the corpus each carry a literal (code, path) per fixture, written from the one field each fixture changes (C08 for the band and timestamp cases); a separate check requires every manifest negative to be pinned |
| L5 | Documentation inaccuracies | **Fixed** | "40-row" is now 80-row (40 drones × 2 timestamps); scan provenance names candidate 4 and its identical backend; one C17 wording ("approved by the user for implementation, recorded for sign-off"); P5-GEOMETRY's status follows the closure decision; PROGRESS polygon counts; the §9 restart-test comment; the runner's M7 table shows every recorded size |
| Info | The stored-result message infers a replay from a catalog refresh; the lead's note said 30 changed files | Recorded | Concurrent operators on one external run are outside this single-operator workbench; the closure README says so. 28 non-documentation files is correct |

The critic's second pytest session let pytest's default retention remove
`pytest-164`, the gate's temporary directory (not cited evidence).

### UI/UX findings

| ID | Finding | Disposition | Change and evidence |
| --- | --- | --- | --- |
| M-1 | The finalized state was appended to a truncating header name, the only finalized cue on the Tactical map | **Fixed** | The header shows the state as its own non-shrinking tag, "RECORDING FINALIZED · ABORTED", beside the mission picker; only the name truncates. The map's status row carries the same tag. The picker's title and screen-reader description keep the full name with the state. The browser test checks the tag whole and unclipped at 1440 and 760 px, the title and the map tag; the foreground run captures both widths |
| M-2 | Submitting an ABORT batch from the editor finalized the run on one key press | **Fixed** | "Submit ABORT" uses the destructive style and opens the same alertdialog as the ABORT control ("ABORT &lt;mission&gt;?", Keep run focused first). Escape or Keep run sends nothing and returns focus to Submit. New browser test with the §9 south ABORT batch under fresh identities |
| M-3 | The recorded-command list went stale after a submission switched runs, and missed commands just committed | **Fixed** | A submission that selects another run clears the loaded list; a command committed for the selected run reloads the loaded page. Two unit tests; the browser test shows the north list gaining HOLD without a reload and disappearing when the south START selects the south run |
| L-1 | Focus fell to the page after a Retry committed | **Fixed** | Focus moves to Submit when the pending command resolves and would otherwise be on the page |
| L-2 | A focused pager could scroll out of view on a shorter last page | **Fixed** | After a page change, a focused pager button is scrolled into view (health rows and interactions) |
| L-3 | The alert's focus outline covered its first character | **Fixed** | The focused alert's outline sits 2 px outside it |
| L-4 | "Load notional example" replaced an edited draft without asking | **Fixed** | It asks "Replace the edited draft?" (Keep draft / Replace draft) when the draft differs from the last loaded file or example |
| L-5 | Every rejection said "Prior committed run remains unchanged", even with no run | **Fixed** | Rejections now say "No run was created or changed.", which holds for every rejection: the service raises them before any run is prepared |
| L-6 | "1 interactions" | **Fixed** | Rows and interactions are pluralised |
| L-7 | HOLD/ABORT during an outage did not say the command was not sent; a 502 was not classed as an outage | **Fixed** | "HOLD not sent. The authority is unavailable (HTTP 502). Try again when it is available." (or "… is unreachable …" without a response); failed reads name the HTTP status and, for server errors, that the authority is down. Unit tests |
| L-8 | Stale file name; the draft refusal gave no size guidance | **Fixed** | The file control resets after each read; the draft refusal points batches too large for browser storage to the HTTP API |
| L-9 | The pane scrolled sideways at 900 px with Details docked | **Fixed** | Labelled pickers wrap and shrink with the pane |
| L-10 | The run section disappeared while another run loaded | **Fixed in part** | The loading line reserves about the run block's height, so browsing runs no longer makes the pane jump. The previous run's controls are deliberately not kept while another run loads |
| L-11 | Tracks clips "Altitude / ref" at 900 px | Not changed | Shared Tracks column sizing for every mission; MSL stays in Details |
| L-12 | An unreadable saved session gave no next step | **Fixed** | The message names the storage entry and a safe next step (copy it, remove it, reload); nothing is discarded automatically. Unit test |
| L-13 | "1,603,467.9 s before frame" | **Fixed** | Ages of an hour or more read as hours and minutes or days and hours ("18 d 13 h before frame"); shorter ages are unchanged. Unit test |
| L-14 | Status documents: README omitted the UI batch-size limit; TEST-REPORT build provenance; architecture link comma | **Fixed** | README "Current limits" names the UI batch-size limit; the comma is restored; the candidate 6 runner states which builds it made |
| Redesign list | Eight recommendations | Recorded | Not built (task rule: no redesign) |
