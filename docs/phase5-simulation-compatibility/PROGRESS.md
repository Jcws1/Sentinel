# Work ledger

Start: 2026-09-20 10:52:24 UTC. No imposed deadline. No commit/push.

At approximately one hour, implementation and the first complete unit gates are
in place; roughly 50% of the checklist remains (verification/review/documentation,
not an elapsed-time forecast). Hourly updates are attached to this task.

- Baseline: 438 backend, 414 frontend, 43 frozen guards.
- Pure resolver and durable command service: 82 focused checks pass.
- First full candidate: 520 backend checks pass in 97.45 s; 429 frontend checks
  pass in 42.61 s. Later command-inspection additions require final revalidation.
- Typecheck first found an optional extensions access and then a missing browser
  helper declaration; both corrected. Lint first found two explicit JS globals.
- First browser collection failed because a test imported a browser/Ajv module
  into Node. The test now reads the published storage key directly.
- Next focused browser attempt: 2/3 passed. Non-default 40-unit lifecycle and
  760/820/900/desktop layout/focus passed. A recovery notice was masked by its
  connection error; the UI now shows both. Failed log/JSON/context retained.
- Initial sparse 10k: four completions 10.30–10.92 s, with 9.36–9.88 s event-loop
  gaps and 42,151,936 bytes after normal close. These are **initial Phase 5
  candidate** results, not the D7 baseline. Profiling identified an unnecessary
  duplicate completion frame. Completion now joins the final sample, preserving
  every input timestamp and audit event. Remeasurement remains pending.
- Provider requests: zero. No display acceptance claimed.

Unrelated changes under `research-brain/` arrived after baseline and are preserved.
They are excluded from Phase 5 change attribution.

## Interruption at approximately 12:08 UTC

Computer Use reported a physical Escape cancellation while identifying the new
foreground verification browser. UI work stopped. The task-owned Node process
1652 and its service/browser descendants were stopped; ports 5405/8205 were
confirmed free. Its isolated database was finalized and deleted, with cleanup
metrics retained under `test-results/phase5-simulation-compatibility`.

Before the interruption, the first foreground attempt reached default/Sydney
40-row lifecycle, lost-response exact retry, actual backend restart and recorded
inspection, plus 760/820/900/1440 screenshots. Its interactive follow-on failed
waiting for scenario validation; this is a failed attempt, not a complete UI pass.
Its raw database/sidecars and screenshots were preserved before cleanup. The
harness now attaches both concurrent promises and separates fresh-context
interactive checks, but this harness correction has not been rerun.

Latest focused service gate: 42 passing. Earlier focused resolver gate: 47 passing.
Latest focused browser gate: 3/3 passing (prior to final helper additions).
The full candidate totals above precede subsequent changes and do not certify the
current source. Remaining work includes final resource remeasurement, successful
foreground interactive checks, complete regression/static/browser gates, fresh
independent critic review, final documentation and external verified archiving.
No Phase 5 acceptance is declared. No commit or push occurred.

## Resumed deadline closure

Resumed 13:12:32 UTC; deadline 13:57:32 UTC. Production frozen before final browser run. Final units 534 backend /435 frontend /43 guards; static/build pass. Complete browser 97 passed, 24 failed; focused D4 synchronization correction plus three external cases 4/4 passed. Parent external foreground passed; mixed-scale geometry, bulk pauses, independent foreground and inherited D7 gaps remain open. Final critic 8.6/10. Partial delivery; no commit/push.
