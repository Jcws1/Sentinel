# Affected recovery and workflow verification

All runtime checks own their sole backend writer, disposable database and fresh
browser context. No operator database or browser storage is used.

| Obligation | Evidence |
| --- | --- |
| Exact frame/event/checkpoint/receipt content | Deterministic baseline/current canonical goldens, including default/Sydney forty-unit lifecycle and duplicate/reclaim/End paths |
| Historical and new storage | Mixed TEXT/BLOB, strict historical frame adaptation, format marker 4→5 only in the existing transaction; no rewrite of old rows |
| Corruption and interrupted writes | Bounded decode/hash/length/UTF-8/trailing-stream failures; unsupported marker; subprocess interruption in first and existing transactions; committed history remains recoverable |
| Rollback before publication | Final foreground faults inject receipt-write failure inside the sole writer; world, policies and positions remain unchanged; exact body/identity retry commits once |
| Lost Save and Run | Dedicated browser/Orchestrator regressions; all critics independently operate lost Save; exact pending identities remain in session state |
| Lost Apply | Final Sydney run loses an HTTP reply after actual commit, blocks receipt reads, reloads, proves identical pending bytes, explicitly retries the identical command ID/body, then resolves the pending request |
| Lost Stop | Final faults and critic UI lose a committed response, reload/retry exact identity/body and verify one persisted Stop event |
| Restart, lease and Pause | Final Sydney backend restart changes executor epoch, clears stale proposal cards, recovers paused and requires explicit authority reclaim; final faults hold Pause 31.69 seconds, identical tick/effective time while lease revision renews 1→4 |
| Transport gap and source stall | Sydney WebSocket loss disables Apply and requires explicit refresh; fault probe keeps one connection and receives three heartbeats with no new source frame, freezes positions, disables movement/Suggestions, preserves nonpositional Stop and recovers without reconnect |
| Late authority responses | Two strict-status unit regressions fail on baseline and pass after coalesced refresh; fresh critic holds an old real-UI status response and verifies current authority is obtained before Resume enables |
| Frozen scenario and End | Active-review probes preserve the running revision; Sydney workflow reopens persisted End read-only and starts a new mission without old cards or pending identities |
| Non-default movement | All forty Sydney units move; actual geographic right-click manual movement, Patrol, Stop and Return to script succeed |
| Suggestions and v2 outcomes | Twenty-friendly review, stale refusal after policy changes, explicit Apply, restart/reclaim, existing Intercept and forty persistent NON-OP entities pass; no combat rule changes |

Final foreground runs:

- `d7-details-final-sydney-recovery-attempt3`: ten named workflow cases, no page
  errors, exit 0, native Edge window 10948028, owned ports 5373/8173 released.
- `d7-details-final-faults`: four named fault/lease cases, no page errors, exit 0,
  native Edge window 1448918, owned ports 5401/8201 released.

Both cleanup receipts confirm stopped services and deleted task databases.
The restart run includes a newly created final demo which normal cleanup ends.

Two preliminary Sydney attempts remain in the archive. Attempt 1 blocked receipt
reads only after taking a screenshot; a successful `GET receipts ... 200` in its
backend log shows the application's correct automatic reconciliation cleared the
pending identity before the test tried to retry. The test now blocks that recovery
channel before dropping the response and adds exact pending-byte assertions across
reload. Attempt 2 accidentally selected the production test bundle without the
verification camera hook and stopped at setup. Neither failure is hidden or
treated as a production defect, and no timeout or semantic assertion was relaxed.

Checkpoint semantic validation remains the pre-existing recovery parser/consumer,
not an independently added strict checkpoint-schema validator. See the precise
[storage compatibility boundary](COMPATIBILITY.md).
