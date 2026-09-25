# Phase 5 closure — plan, budgets and acceptance matrix

Started 2026-09-24 00:09:50 UTC on HEAD `f98de4f` (branch `v3`, clean tree). No
imposed deadline. Stop after Phase 5 closure: no commit, push, Phase 6 pacing,
Phase 7 or other roadmap work. Budgets below were written before any closure
measurement ran; they are local engineering goals, not contract limits.

## Decisions governing this task

| Decision | Source |
| --- | --- |
| Geometry is exact on each coordinate's shortest round-trip decimal (Python `repr`, ECMAScript `Number#toString`), one predicate for the external validator, core `Polygon`, frontend decoder and resolver containment. Recorded as a C17 supplement awaiting sign-off. | User, 2026-09-24 (pre-start question) |
| Resolver containment may become exact only if the golden result and every existing fixture/test outcome is unchanged; otherwise stop and ask. | User, 2026-09-24 |
| Read-only scan of operator databases: `backend/data/sentinel.sqlite3` opened immutable/read-only with no copy; `phase3b-review.sqlite3` (+WAL) copied to scratch, scanned, deleted. Counts and IDs only. | User, 2026-09-24 |
| Foreground/measurement blocks run when ready; if the OS foreground PID check fails, pause and ask the user to click the window. | User, 2026-09-24 |
| P5-BATCH: measure and disclose; no architectural change. C01–C23: no behavior change, sign-off table. UI critic: defects fixed, redesign recorded. §9: fixture + backend tests + UI run; replay deferred to Phase 7. | Task prompt / earlier user choices |

## Ordered plan

1. Baseline (complete): git state, inventories, guards, baseline regression, real-API reproduction.
2. Geometry: shared exact modules, wiring, shared vectors, differential tests, historical-ring and operator-database checks, containment check, decode/validation A/B, end-to-end API and browser test.
3. §9 defensive scenario: fixture, backend criteria tests, browser test and foreground run.
4. System corpus (black-box HTTP on real uvicorn), concurrency harness, R2-3 storage measurement, UTF-8 investigation.
5. Freeze candidate; the test-runner agent runs every tier; then measurements on an otherwise idle machine.
6. Critic round (technical + UI/UX), responses, corrections, re-gates; at most three rounds.
7. Documentation, archive with readback, cleanup, preservation proof, delivery.

## Predeclared measurements and budgets

| ID | Measurement | Workload and method | Budget / rule |
| --- | --- | --- | --- |
| M1 | P5-BATCH, ordinary batch | Real uvicorn with opt-in probe runtime; moving Sydney 20v20 (40 units) interactive run; `local40` external batch (80 rows, 2 timestamps) submitted 5 s into a 20 s window; matched control without batch; 3 control/batch pairs, fresh server and database per run | Maximum WebSocket delta arrival gap **≤ 750 ms** in every batch run. Also report publication gaps, 10 ms event-loop heartbeat gaps, renew-command latency, sequence continuity |
| M2 | P5-BATCH, sparse 10k | Same harness with `sparse10000` | Measure and disclose; no budget. Must show zero lost or reordered interactive deltas and no resnapshot |
| M3 | Existing probes | `scripts/performance_simulation.py` kinds `golden`, `local40`, `remote40`, `sparse10000`, `dense50`, `dense100`, `dense200`; 1 cold + 3 repeated, fresh database each | Historical goals: golden/local40/remote40 warm median < 1 s; sparse10000 < 30 s and < 2 GiB incremental memory (harness stops at 120 s / 2 GiB). Dense: disclose. Historical Phase 5 values are cited as historical only |
| M4 | Frontend decode regression | `validateFrame` on every tracked world fixture with zones, baseline decoder (HEAD snapshot) vs candidate, same Node process, alternating rounds | Median new/old ratio **≤ 1.05** across ≥ 30 rounds (no measurable decode regression). `polygonIntegrity` micro-timings are diagnostic |
| M5 | Backend validation | `WorldFrame.model_validate_json` on the same frames, HEAD snapshot vs candidate processes, alternating | Median ratio ≤ 1.10 (secondary, diagnostic budget) |
| M6 | Differential tests | Python: seeds 20260924, 5, 1789 × 400 rings and 400 containment points; TS: same seeds × 400 rings and 4,000 orientation triples; optional long run `SENTINEL_GEOMETRY_ITERATIONS=100000` | Zero disagreements with the exact oracle; each normal-suite file ≤ 10 s |
| M7 | R2-3 browser storage | Largest valid UI batch the Simulation client persists (draft + pending) before refusal, Edge, doubling then bisection | Measure and document; the §9 UI dataset stays ≤ 50% of the measured persisted size |
| M8 | Browser gate | One complete `test:browser` run on the final candidate | 100% expected; 0 skipped, flaky, retried or errored |

Performance, concurrency and foreground measurements never overlap suites or
builds. Every failed or interrupted attempt is retained. A timeout is incomplete,
not a pass or a fail.

## Acceptance matrix (hard gates, final candidate)

| Gate | Requirement | Initial status |
| --- | --- | --- |
| G1 | Prerequisites exit 0; frozen guards pass; frozen spec/contract hashes unchanged | Baseline pass |
| G2 | Complete backend and frontend unit suites 100% | Baseline backend 562/562; frontend 485/486 (pre-existing Cesium import timeout under contention) |
| G3 | One complete browser run 100%, no skip/flaky/retry | Baseline 126/126 (optional run) |
| G4 | Golden unchanged; TRACEABILITY covers every §10 negative and Phase 5 bullet | Open |
| G5 | R3-1 end to end (API + UI); three-way vector parity; differential tests; no tracked ring newly rejected; no decode regression (M4) | Open: R3-1 and a new decimal-view spike return HTTP 500 at baseline |
| G6 | System corpus: zero 5xx; lifecycle/idempotency/conflicts match spec §8 and the matrix | Open |
| G7 | §9 service criteria, UI run; replay explicitly deferred | Open: not implemented |
| G8 | P5-BATCH measured against M1/M2 (and M9, amendment below), disclosed, no interactive loss/reorder | Open |
| G9 | Independent foreground verification with native PID match | Open |
| G10 | Preservation, services stopped, ports free, task databases removed after archive | Open |
| G11 | Each final-round critic ≥ 9.0, no unresolved Critical/High/Medium | Open |

Organiser conformance is not claimed while C01–C23 remain provisional.

## Amendments after critic round 1 (budgets unchanged)

- M1/M2 control latency times the whole operator action (intent plus
  command); candidate 1 timed only the command request.
- M4/M5 also time three diagnostic frames with a 101-position zone. They are
  reported separately; the budgets still cover tracked-fixture frames only.
- The corpus hard kill triggers on the durably pending command, read-only from
  its own database, instead of an HTTP status read.

## Amendments after critic round 2 (declared before measuring; budgets unchanged)

- **M9, P5-BATCH timestamp dimension.** Same harness and method as M1/M2 with
  `steps100x40` (100 one-second timestamps of the same 40 drones, 4,000 rows)
  and `churn300` (300 timestamps adding one drone each, so every frame carries
  all earlier drones), interleaved with matched controls, 3 repeats. Measure
  and disclose; no budget. Must show zero lost or reordered interactive deltas
  and no resnapshot. G8 covers M1, M2 and M9.
- M4/M5 diagnostics gain three 101-position "accordion" zones whose edge boxes
  all overlap (the bounding-box early exit never applies). Each M5 child also
  times resolver containment (100 drones) on the golden area and every
  diagnostic zone. All reported, not budgeted.
- The shared vectors gain polygons with three and four holes, including every
  order of four holes at unit and 1e-300 scale; both suites assert the oracle's
  first violation for each.
- The frozen negative fixtures are pinned by error code and path in the
  resolver test and in the corpus.
