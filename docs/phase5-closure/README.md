# Phase 5 closure — external simulation compatibility

**Decision: pending.** Critic round 2 scored candidate 5 at 8.8 (technical)
and 8.5 (UI/UX), below the 9.0 bar ([REVIEW-RESPONSES](REVIEW-RESPONSES.md)).
Claude's candidate 6 (`bd24e168…744a5b`) was preserved and verified as the
assessment baseline. The current working tree additionally contains application
diagnostics, review tools and tests; it is the separately frozen
**assessment-ready** source (`0207f2e9…154e5`), not unchanged candidate 6.
Its [current results](../assessment/TEST-RESULTS.md) include 768 backend, 637
frontend, 132 browser and 387 system checks, plus 26 native foreground matches.
The assessment's implementation and UI checks are author-run; critic round 3,
the last allowed independent round, has not been performed. Acceptance still
needs all required final-source gates and both independent critics at 9.0 or
above with no unresolved Critical, High or Medium finding. The candidate-5
gate table below remains historical.
Organiser conformance is **not claimed**: the C01–C23 interpretations remain
local policy awaiting the user's sign-off.

## Accepted, accepted limitations and unclaimed

| Category | Items |
| --- | --- |
| Historical passes on candidate 5 | Every Phase 5 acceptance bullet and every spec §10 negative ([TRACEABILITY](TRACEABILITY.md)); golden result unchanged; P5-GEOMETRY fixed (one exact predicate, three-way parity, no 5xx); spec §9 service criteria and UI run; lifecycle, idempotency and conflicts per spec §8; complete browser suite 129/129; system corpus 386/0/0 |
| Current measured limitations; formal acceptance pending | **P5-BATCH:** with logging, worst update gaps were 7.0 s at 10,000 observations/one timestamp, 8.9 s at 40×100 timestamps and 16.2 s at 300 growing-world timestamps. Ordinary 40×2 timestamps (80 rows) had about 300 ms against 750 ms. Published updates stayed ordered, but the source's normal cadence paused. **UI batch size:** largest tested persisted body 2,283,322 bytes / 9,687 one-timestamp observations in a clean Edge profile; no universal UI or API throughput maximum is established. **§9 replay:** recorded inspection only; Timeline replay deferred to Phase 7. [Current measurements](../assessment/PERFORMANCE-AND-LIMITS.md) |
| Not claimed | Organiser conformance (C01–C23 provisional; [sign-off table](COMPATIBILITY-DECISIONS.md)); global polygon interiors at poles and the dateline (planar policy); throughput at the contract maxima (C23) |

## Hard gates on candidate 5

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 Prerequisites and frozen data | Pass | 10/10 commands exit 0; frozen guards pass; `phase0-verification.json` unchanged |
| G2 Suites | Pass | Backend 680/680 (also 680/680 with `PYTHONUTF8=1`); frontend 579/579 |
| G3 Browser suite | Pass | 129/129 expected; 0 skipped, flaky or retried |
| G4 Golden and traceability | Pass | Golden exact in resolver, service and corpus tests; TRACEABILITY complete |
| G5 P5-GEOMETRY | Pass | R3-1 through the API and UI; shared vectors three-way; differential tests; no tracked or operator ring newly rejected; decode worst ratio 1.012 (≤ 1.05) |
| G6 System corpus | Pass | 386 cases, 0 failures, 0 server errors; lifecycle checked against spec §8 written out |
| G7 §9 scenario | Pass | Service criteria, browser test and foreground run; replay deferred |
| G8 P5-BATCH | Pass | Measured against predeclared budgets; disclosed; no loss or reorder |
| G9 Independent foreground | Pending | Round-2 UI/UX critic with native PID match (round 1: 108/108 on candidate 3) |
| G10 Preservation and cleanup | Pending | Close-out |
| G11 Critics | Pending | Round 2 (round 1: 8.8 and 7.2, all findings answered) |

## What this closure changes

| Area | Change |
| --- | --- |
| P5-GEOMETRY | One exact polygon predicate on each coordinate's shortest round-trip decimal (C17 supplement implemented; conformance sign-off open), shared by the external validator, core `Polygon`, frontend decoder and resolver containment. R3-1 and a newly found decimal-view case no longer return HTTP 500; containment near long edges is exact |
| Spec §9 | Synthetic two-area defensive dataset (START, HOLD with samples, RESUME, ABORT), backend criteria, browser test and foreground flow. Timeline replay deferred to Phase 7 |
| System tier | Black-box HTTP corpus on real uvicorn + built frontend: golden, fixtures, §10 negatives, geometry vectors, lifecycle matrix (spec §8 written out), restart and hard-kill recovery |
| P5-BATCH | Concurrent-source measurement harness; disclosed as a limitation, no architectural change |
| Smaller items | Truthful browser-storage refusal messages (R2-3 measured); UTF-8 portability of the recording-equivalence probe |
| Simulation UI (critic round 1) | ABORT confirmation; focus kept on unavailable actions; stored-result, outage, rejection and unreadable-draft wording; per-timestamp health changes; finalized external missions marked in the header, Tracks and Details; accessible names equal visible labels |

## Record

- [PLAN](PLAN.md) — decisions, ordered plan, predeclared budgets, acceptance matrix
- [BASELINE](BASELINE.md) — starting state and reproductions
- [PROGRESS](PROGRESS.md) — dated milestones and candidates
- [TESTING](TESTING.md) — tiers, commands, ports, pitfalls
- [TEST-REPORT](TEST-REPORT.md) — test-runner results on candidate 5
- [TRACEABILITY](TRACEABILITY.md) — requirement → test → evidence
- [PERFORMANCE](PERFORMANCE.md) — measurements against budgets
- [COMPATIBILITY-DECISIONS](COMPATIBILITY-DECISIONS.md) — C01–C23 sign-off table
- Critic reports ([round 1 technical](CRITIC-1-TECH.md), [round 1 UI/UX](CRITIC-1-UI.md)) and [REVIEW-RESPONSES](REVIEW-RESPONSES.md)

Earlier Phase 5 reports in [phase5-simulation-compatibility](../phase5-simulation-compatibility/README.md)
remain historical evidence about their own source.
