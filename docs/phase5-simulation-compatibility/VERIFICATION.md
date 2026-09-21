# Verification and acceptance

**Partial Phase 5 delivery; overall acceptance withheld.** Ordinary fixtures work,
but valid mixed-scale geometry still returns HTTP 500, the full browser gate
failed and independent foreground verification remains incomplete. The resumed
45-minute deadline is 2026-09-20 13:57:32 UTC. No Phase 6, commit or push.

| Final gate | Result |
| --- | --- |
| Complete backend | **534 passed**, two existing warnings, 96.90 s, exit 0; baseline Windows encoding |
| Complete frontend | **435 passed / 43 files**, 77.86 s, one worker, exit 0 |
| Frozen guards | **43 passed** |
| Static/contracts/build | TypeScript, ESLint, Prettier, generated contracts, foundation hashes, backend export, repository and production build passed |
| Complete browser | **97 passed / 24 failed / 121 total**, no skips/retries, exit 1, 15.5 minutes |
| Focused browser after test synchronization fix | **4/4 passed**, 56.6 s, exit 0; does not replace complete-suite gate |
| Fresh final critic focused checks | **96 backend + 21 frontend passed** |

Production inventory SHA-256:
`35ec0033dc225cc82e9019959b77d8c601f30f686f806cb427e11ff207f4e347`
(229 files). HEAD: `30414540b89508193ea84c4f8e235362ebd61a37`.
Current uncommitted work is included; production was frozen before the complete
browser run and final reviews. Later D4 synchronization changes affect tests only.

The first browser failure was a D4 route-release/unroute race: “Route is already
handled”. A running demo remained active during many subsequent failures. The
test now awaits route.continue before unroute, preserving assertions/timeouts.
Every result is retained and recursively audited; this does not prove every later
failure shares that cause. There was insufficient time for another full suite.

Two complete backend attempts under PYTHONUTF8=1 passed 533/534. An unchanged
recording-equivalence fixture uses implicit Path.read_text encoding; its Sydney
middle dot differs from the historical Windows cp1252 interpretation. The exact
pre-Phase-5 snapshot reproduces the UTF-8 failure. No hash/assertion was changed.
The final complete run with baseline PYTHONUTF8=0 passed. Existing UTF-8 test
portability remains open. The first frontend attempt passed 434/435 when an
existing dynamic Cesium import exceeded its five-second limit during competing
checks. The complete single-worker rerun passed without changing limits/retries.
All failed and interrupted attempts remain evidence.

## Foreground and performance

The parent identified and activated the actual native Edge window. Final default
and Sydney 40-unit submission, mapped tracks/details, HOLD/explicit RESUME/ABORT,
old results after ABORT, exact lost-response reload/retry, actual backend restart,
recorded inspection and 760/820/900/1440 layouts passed. Provider requests and page
errors were zero. This is parent verification, not independent critic UI work.

A separate moving Sydney 20v20 probe observed all 40 moving tracks and isolated
external submission. A 10.04-second blank-grid compositor window measured 82.56
FPS, median 13.84 ms, p95 20.90 ms, p99 27.81 ms. The later obsolete End selector
failed; the whole attempt remains failed and cleanup ended the run. The selector
was corrected but complete foreground 10v10/20v20 workflows were not rerun.
This does not establish sustained display acceptance or a long soak.

[PERFORMANCE](PERFORMANCE.md) records all 28 uncontended probes and limitations.
Sparse 10k warm median was 6.55 s, retained DB 22,765,568 bytes, maximum observer
gap 5.67 s. Ordinary 40-unit warm medians were approximately 0.16–0.18 s.
Dense contract maxima and concurrent real-time responsiveness remain unverified.

| Acceptance area | Decision |
| --- | --- |
| Functional | Ordinary batches verified; full acceptance withheld by geometry defect and failed browser gate |
| External conformance | Golden MUTUAL_EFFECT retains both ACTIVE / health 60; numerical defect and organiser ambiguities prevent exact signoff |
| Provisional policy | Implemented/tested as local provisional choices, not organiser-approved |
| Recovery/persistence | Focused transactions, duplicate/lost response, crash/restart, historical storage and ordinary foreground recovery pass |
| Resources | Bounded measurements complete; bulk event-loop pauses and dense maxima remain open |
| UI | Parent external foreground passes; full browser and complete interactive foreground gates open |
| Independent review | Final **8.6/10**, acceptance withheld; actual independent foreground gate incomplete |
| Inherited D7 | Strict display failure and configured Video incompleteness remain open; zero additional requests |

See [review responses](REVIEW-RESPONSE.md) and [evidence](EVIDENCE.md).
