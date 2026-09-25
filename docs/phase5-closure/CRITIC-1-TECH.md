# Phase 5 closure — independent technical critic, round 1

Reviewer: fresh technical critic (did not implement the reviewed work). Review of
**candidate 3**: HEAD `f98de4f183b27df947fb914893deb2e688b598b0` (branch `v3`) plus
uncommitted changes, inventory digest
`80e17cec2dde3cb25900867ef6b95c87224fcc0fe5f466722f166e2290a01719` (667 files).
The digest was identical at start and at end (`identity-start/`, `identity-end/`).
Work ran 2026-09-24 02:41–03:08 and 04:42–05:10 UTC. An API usage limit
interrupted it in between. Raw evidence is under
`test-results/phase5-closure/critic-1-tech/` (called `E/` below). Node scratch
scripts are in `frontend/.cache/p5c-critic-1-tech/`.

## Verdict

**Overall 8.8 / 10. Acceptance-grade is not reached yet: 1 Medium and 6 Low
findings. There are no Critical or High findings.**

The main deliverable held up against every attack I made. It is one exact polygon
predicate on shortest round-trip decimals, used by the external validator, core
`Polygon`, frontend decoder and resolver containment. The attacks covered the
number model, three-way parity, the TypeScript float filter at its bound, and the
real HTTP-to-decoder path. The Medium finding is about evidence, not product
behaviour. The lifecycle-conformance tests use the product's own transition table
as their oracle. An in-process mutation of three spec-confirmed §8 cells went
undetected by 674 of 675 backend tests.

Candidate 3 differs from candidate 1 in exactly the three files the lead named.
I confirmed this by diffing `candidates/c{1,2,3}/candidate.json`. I re-ran the
backend, frontend-unit, static-check and system-corpus tiers on candidate 3 myself.
All passed (see below).

## Evidence I verified personally (candidate 3)

| Check | Result | Evidence |
| --- | --- | --- |
| Complete backend suite (canonical, `PYTHONUTF8` unset) | **675 passed**, 0 failed/errors/skipped, exit 0 (02:48:06–02:49:48 UTC) | `E/logs/backend-full.{log,junit.xml,exit}` |
| Complete frontend unit suite (`--maxWorkers=2`) | **567/567**, 50 files, exit 0 (04:49:13–04:49:56 UTC); `exactGeometry.test.ts` 80, `simulation-client.test.ts` 22 | `E/logs/frontend-unit.{json,log}` |
| typecheck, lint, format:check, contracts:check | All exit 0; format:check now clean (candidate 1's G1 failure is gone) | `E/logs/prereq-*.log` |
| Implementer's system corpus on the candidate-3 build (`dist-test-p5c-c3`, ports 8361/5361) | **386 cases, 0 failures, 0 server errors**, status counts identical to candidate 1, ports freed, database removed | `E/logs/corpus.log`, `test-results/simulation-system/critic1tech/` |
| Python `repr` vs ECMAScript `Number#toString` (Node 24/V8) on 1,523,511 adversarial doubles: random bits, subnormals, lon/lat range, ±3 ulp around every power of two, 17-digit decimals, dyadic ties | **0 value mismatches, 0 digit-count mismatches** | `E/spelling-parity.json`, `E/scratch/gen_doubles.py` |
| pydantic-core JSON parse (`model_validate_json` path) and serialise (`model_dump_json` path), same 1,523,511 doubles | **0 bit mismatches** (pydantic 2.13.5 / core 2.46.5). Historical readers and served frames keep every double | `E/pydantic-roundtrip.json` |
| Differential test against **my own oracle**. It is a different formulation: parametric segment intersection, direction-based adjacent overlap, non-anchored shoelace area, winding-number containment. Seven new adversarial families (decimal-collinear, decimal-exact touches ±1 ulp, 17-digit structures at ±180/±90, subnormal/ordinary mixtures, binary-collinear/decimal-not, 20–100-vertex stars with injected decimal touches, tiny features at 1e-20…1e-320) plus holes (decimal touch on the outer edge, touching holes, nesting, outside, ±1-ulp nudges) | **12,700 rings, 1,270 hole polygons, 57,809 containment points (35,857 inside / 21,952 outside): 0 disagreements** for `ring_violation`, `validate_ring`, core `Polygon.model_validate_json`, `polygon_violation`, `PreparedRing.contains`, `inside_polygon` and the implementer's oracle. The HEAD code gets 1,811 core verdicts, 383 external verdicts and 3,804 containment verdicts wrong on the same inputs | `E/scratch/diff-s{1..4}.summary.json`, `harness_py.py`, `adversarial.py`, `critic_oracle.py` |
| Same cases through the real frontend `polygonIntegrity` (Vite SSR) | **0 validity disagreements**. The first-reported reason differs on 53 zero-area rings (Low L4) | `E/scratch/ts-s{1..4}.json`, `ts-harness.mjs` |
| TypeScript float filter (`ExactPoints.sign`) against the exact decimal sign: 200,000 adversarial triples (ulp structures at 180/90, 17-digit cancellation, mixed subnormal, all-subnormal, binary-scaled, decimal-collinear, overflow at 1.8e308, random magnitudes). In 121,537 of them a naive double evaluation gives a wrong or undefined (overflow) sign | **0 wrong signs, 0 errors**. The filter certified 16,954 and none of the 121,537 hard cases | `E/scratch/ts-sign-11.json`, `triples.py` |
| Filter at its bound: 1,290 walks move a point one ulp at a time until the filter (replicated bit-for-bit in IEEE doubles) first certifies. Minimum certified \|det\|/bound is **1.0000038** | **2,580 triples at and just inside the bound: 0 wrong signs** | `E/ts-walk-7.json`, `E/scratch/walk-7.json` |
| Black-box HTTP on a real uvicorn (port 8361, disposable database): 200 oracle-valid and 200 oracle-invalid adversarial rings. Valid rings place both drones at a point with a known oracle containment | **400/400 correct**: 200 × 200 with the oracle's eligibility (138 inside, 62 outside), 200 × 422 `VALIDATION_ERROR` at `/area/polygon`, **0 × 5xx**. Served zone coordinates equal the input | `E/http/summary.json`, `E/scratch/critic_http.py` |
| The 200 served world frames through the real frontend decoder `validateFrame` | **0 rejections** (true validator → core → storage → transport → decoder path) | `E/http/ts-decode.json`, `ts-decode.mjs` |
| 13 targeted extremes: 101-position decimal-collinear combs, 101-position 17-digit stars at (179.5, 89.5) with a subnormal nudge, 180/5e-324 slivers, a ±180/±90 long diagonal through the origin | Python, external, core and TS verdicts all agree with the oracle | `E/scratch/targeted.py`, `ts-targeted.json` |
| `geometry_legacy.py` is the HEAD code | Only the documented adaptations differ (`self.coordinates` becomes a parameter; `invalid` becomes `legacy_invalid`) | comparison with `git show HEAD:` |
| Traceability names | All 43 test functions cited in TRACEABILITY/COMPATIBILITY-DECISIONS exist | `E/referenced-tests.txt` |
| Reported numbers | M1/M2 per-run values, M3 per-kind values, M4/M5 ratios and corpus counts match the raw files exactly | spot checks against `simulation-concurrency/p5c-c1/`, `phase5-simulation-compatibility/p5c-c1-*/`, `gate-c1/measure/` |
| P5-BATCH raw data (no re-measurement) | See "P5-BATCH" below | `E/batch-audit.json`, `E/scratch/batch_audit.py` |
| Lifecycle-oracle mutation (in-process only, no file edits) | See M1 | `E/mutation/` |

### Supplied, not re-executed by me

- The candidate-1 gate (TEST-REPORT): complete browser 129/129, the foreground
  runs with PID checks, and the M1–M7 measurements. My tiers above re-establish
  backend, unit, static and system results for candidate 3. No complete browser
  run on candidate 3 was available to me.
- The operator-database scan (00:46 UTC; I did not open any operator database).
- The baseline reproductions (R3-1 and the decimal-view spike returning HTTP 500
  at HEAD).
- UI and foreground behaviour, which is the UI/UX critic's scope.

## Findings (severity-ranked)

### Medium

**M1 — Spec §8 lifecycle evidence uses the implementation's own table as its oracle.**
- *Location:* `backend/tests/test_simulation_service.py:96`
  (`expected = TRANSITIONS[prior][action]`) and
  `scripts/simulation_system_corpus.py:37,295`. Both read the same
  `app/simulation/policy.py:12` table that `app/simulation/service.py:108`
  enforces. It is claimed in TRACEABILITY §8 rows ("Matrix; corpus lifecycle"),
  in README ("Black-box HTTP corpus") and in PLAN G6 ("lifecycle … match spec §8
  and the matrix").
- *Reproduction:* `E/scratch/mutant_transitions.py` is a pytest plugin that
  mutates the shared dict in process. It sets running+START to `RUN_BOGUS_CODE`
  (the spec requires `RUN_ALREADY_STARTED`), no-run+RESUME to `RUN_NOT_STARTED`
  (spec: `RUN_NOT_HELD`) and held+ABORT to `RUN_TERMINAL` (spec: ABORTED). Run
  `pytest … -p mutant_transitions`: all 16 matrix cells and both §9 lifecycle
  tests still **pass** (`E/mutation/matrix-with-mutated-table.log`). The complete
  backend suite gives **674 passed, 1 failed**
  (`E/mutation/full-backend-with-mutated-table.log`). The only failure is
  incidental: `test_recorded_command_pages_join_prior_results_after_abort`
  happens to ABORT from HELD. The first two mutations are caught by no backend
  test. The corpus would pass too, because it imports the same table.
- *Impact:* no product defect today. By reading the code I confirmed that the
  current table matches spec §8 plus the C02/C03 local policy. The spec-confirmed
  409 codes, however, have no independent assertion: `RUN_ALREADY_STARTED`
  appears only in `policy.py` and the docs. A regression in the table would pass
  the G6 "system" tier and the unit matrix. The "black-box" description overstates
  the corpus, whose lifecycle expectations are product code.
- *Correction:* write the §8 table as literals in the matrix test and in the
  corpus, and mark the C02/C03 cells as local policy. Keep `TRANSITIONS` only for
  the equality check between product and literal table. Adjust the "black-box"
  wording, or list the sections whose oracle is product code (the lifecycle table
  and the resolver used for the dense-retry expectation).

### Low

**L1 — Operator-database scan: evidence currency and scope.**
- *Location:* `test-results/phase5-closure/operator-db-scan/scan.meta.json`
  (ran 00:46 UTC); PROGRESS 00:45–01:36; TRACEABILITY "P5-GEOMETRY … operator-database scan".
- *Evidence:* the scan used the `geometry.py` of 00:46, which is older than
  candidate 1 (frozen 01:36). Candidate 2 then restructured `geometry.py`
  (candidate diff). The documents cite the scan without saying which source it
  checked. Its scope is polygon validity in frame zones and scenario boundaries
  only. `SimulationService._submit` runs `validate_complete_steps` before the
  idempotency lookup (`service.py:88–95`), and rule coverage depends on
  containment (`resolver.py:64–70`). A stored completed command whose drone
  eligibility changed under exact containment would therefore turn an identical
  retry into 422 (`MISSING_RULE`). The scan did not re-validate stored
  `simulation_commands`.
- *Impact:* low likelihood. My differential runs show that candidate 3 equals an
  exact oracle, and operator polygons are ordinary. The claim is nonetheless
  stated more broadly than its evidence supports.
- *Correction:* re-run the approved read-only scan on the final candidate (about
  18 s). Optionally add old-versus-new `validate_complete_steps` verdict counts
  for stored simulation commands (counts and IDs only). Otherwise label the scan
  as evidence about the 00:46 source.

**L2 — Worst-case cost of the exact predicate is not characterised; validation repeats per frame.**
- *Location:* `app/missions/service.py:106` validates every committed frame
  (`WorldFrame.model_validate_json`); `app/recording/sqlite_repository.py:226`
  validates every read. In the frontend, `world/reduce.ts:105` →
  `contracts/decode.ts:280` validates every reduced frame. The M4/M5 frames
  contain only 4–6-position zones.
- *Evidence* (operation counts, not timings; `E/opcount.json`): golden ring = 12
  Python orientations and 4 TS signs. A legal 101-position ring = about 10,000
  orientations per validation. A subnormal-scale 101-position ring sends 9,801 of
  9,800 TS signs to BigInt. A 101-position ring mixing 180 and 1e-300 takes 17,502
  Python orientations on **1,054-bit** integers, and 16,458 of its 17,302 TS signs
  fall back to BigInt.
- *Impact:* "no measurable decode regression" is shown only for small rings. A
  batch with many timestamps and a large pathological area repeats this work per
  frame inside the synchronous completion transaction (P5-BATCH class). The size
  of that cost is unmeasured; I ran no timings, as the brief required.
- *Correction:* add a 101-position mixed-exponent zone frame to the final M4/M5
  diagnostics and state the scope of the budget. Consider memoising validated
  zone geometry by content (backend commit and read, frontend reduce).

**L3 — §9 test design leaves three criteria weaker than their names.**
- *Location:* `backend/tests/test_defensive_scenario.py:75,90,140`.
- *Evidence:* (a) "identical results across two clean runs" runs both runs in
  one pytest process, so a hash-seed-dependent order could not be detected. The
  resolver sorts, so there is no current defect. (b) The VERTEX pair is excluded
  by radius (250.001 m), so its absence says nothing about whether a polygon
  vertex is inside. Vertex inclusion rests on containment vectors outside §9.
  (c) The pair-order test never asserts that the reversed candidate order took
  effect.
- *Correction:* run the second clean run in a subprocess with a different
  `PYTHONHASHSEED`. Add an in-radius pair at a polygon vertex. Assert that the
  reversed run's raw interaction order differs.

**L4 — Frontend and backend report different first violations for zero-area rings.**
- *Location:* `frontend/src/contracts/integrity.ts:49–65` checks zero area after
  the edge loop; `backend/app/domain/geometry.py:120–124` checks it first.
- *Evidence:* 53 of 12,700 rings are invalid in both, but the TS decoder reports
  "adjacent edges overlap" (41) or "intersects itself" (12) where the backend
  reports zero area (`E/scratch/ts-s*.json`). Validity parity is intact.
- *Correction:* move the `zeroArea` invariant before the edge loop, or document
  that parity covers verdicts, not reasons.

**L5 — Unretained or inaccurate evidence statements.**
- PERFORMANCE/PROGRESS micro-timings ("21.1 → 17.2 µs; HEAD 14.3 µs", "long
  rings are faster than legacy") have no retained raw data that I could find.
- "The §9 UI body is 217,571 bytes" is the whole two-mission fixture file. The
  largest single UI submission is 43,705 bytes (pretty-printed START), so the
  ratio holds with more margin.
- "172 MB" peak memory is 172 MiB (180,666,368 bytes).
- TESTING lists `test_geometry_history.py` as "pure logic, no I/O", but it reads
  tracked files.
- The `defensive_scenario.py` docstring says "small squares"; the areas are
  pentagons.
- *Correction:* retain or remove the micro-timings and fix the wording.

**L6 — The quota refusal text can misattribute the cause for small control commands.**
- *Location:* `frontend/src/modules/simulation/client.ts:103–107` used at `:458`.
  A HOLD or ABORT control persists `{draft, pending}`.
- *Evidence:* if the saved draft is within a small control body of the storage
  quota (drafts of up to about 3.8 MB were saved in the M7 attempts), the operator
  reads "this request is too large … Submit a smaller batch" for a tiny control.
  "It has not been sent" remains true. Inferred from reading the code, not
  reproduced.
- *Correction:* for controls, say that the saved draft fills browser storage, or
  persist control bodies without the draft.

### Informational (no action required)

- Parity rests on V8 following ECMAScript's closest-then-even digit choice, which
  the spec gives only as a recommendation. It is verified here for Node 24's V8,
  the engine family Edge uses. A different JS engine would need the same
  spelling check.
- `candidate_steps` builds a new `PreparedRing` per timestamp and per pass, so
  the ring is parsed twice per timestamp. This is cheap for ordinary rings and
  relevant only together with L2.
- The concurrency client builds and serialises the 10k body on its own event
  loop and threads. That adds client-side delay around submission, well below the
  5 s server stall. The server-side publication tap is the right primary signal.

## Attacks that did not break the candidate

- **Exactness and the number model:** mixed exponents, subnormals down to
  5e-324, 1,054-bit exponent spreads, ±180/±90 at one-ulp spacing, 17-digit
  spellings, decimal-collinear versus binary-collinear triples in both
  directions, decimal-exact touches and ±1-ulp gaps, holes touching or nested at
  decimal points. No disagreement with an independent oracle in any validator.
  The docstring claims hold: decimal order equals double order (strict
  monotonicity), so bounding-box, closure and distinctness on doubles are exact;
  ≤15-digit inputs are the written value.
- **Float-filter soundness:** I re-derived the bound. Shewchuk's
  (3+16ε)ε·(|l|+|r|) term covers evaluation error. The spelling term covers
  |D(x)−x| ≤ |x|·2⁻⁵³ (or 2⁻¹⁰⁷⁵ for subnormals) through first- and
  second-order products. `SAFETY` absorbs bound-computation rounding and
  `UNDERFLOW` absorbs gradual-underflow absolute error. NaN or ∞ at any step makes
  both comparisons false and forces BigInt. The empirical checks at ratio
  1.0000038 found no counterexample. The `zeroArea` summation bound
  ((n+1)ε·Σ|tᵢ|) is conservative.
- **Resolver containment:** it is exact and inclusive on edges and vertices, uses
  the half-open ray rule at vertex heights, and agrees with a winding-number
  oracle at 57,809 points and over HTTP. Golden, fixtures and the corpus are
  unchanged on candidate 3.
- **End-to-end:** R3-1 and the decimal spike return 200 (backend tests on
  candidate 3). No valid adversarial ring produced a 5xx. Served frames decode in
  the frontend. Coordinates survive pydantic serialisation and parsing bit for bit.
- **Persistence and recovery:** no transaction, journal or retry code changed.
  Rollback, process-death, restart and exact-retry tests pass on candidate 3, as
  does the corpus hard kill after preparation (restart section).
- **Historical readers:** `geometry_legacy.py` is the HEAD code; the tracked-data
  history test passes on candidate 3.

## Assessment against the brief

1. **Exactness:** strong. See above and L4.
2. **Three-way parity:** verdict parity holds on every vector I built and on the
   true served-frame path. Reason parity does not (L4).
3. **Historical compatibility:** tracked data is re-verified on candidate 3. The
   operator scan is supplied evidence about an earlier source with a narrower
   scope (L1).
4. **§9, corpus and lifecycle:** every §9 criterion has a test. Three are weaker
   than named (L3). Replay is deferred to Phase 7 as approved and is honestly
   labelled. The corpus covers every §10 item (fixtures plus self-intersection,
   duplicate rule, duplicate timestamp, radius and edge, band endpoints, empty
   snapshot, 10k snapshot) and all 16 lifecycle cells, but it checks lifecycle
   against the product table (M1).
5. **P5-BATCH:** the method is sound and the attribution holds. Across the whole
   connection, sequences are continuous in all 9 candidate-1 runs. Every
   unreceived delta was published after the last received sequence, between
   −3.8 ms (in flight) and +776 ms. In each sparse run the 5.1–5.4 s event-loop
   stall lies inside the batch request window, 1.27–1.44 s after send, and the
   worst arrival gap coincides with it (`E/batch-audit.json`). The candidate-1
   renew-latency flaw is correctly disclosed: the renew command sends paused
   6.55–6.69 s while the reported maximum was 446 ms. The candidate-3 harness
   times intent plus command, and the smoke data confirms 218.7 ms and 5,943.7 ms.
   Only the final gate provides corrected measurements; the documents say so.
6. **Documents:** statuses are honestly "pending" and TEST-REPORT is labelled
   candidate 1. The numbers I checked match raw data. There are overstatements in
   M1 ("black-box") and L1, and the inaccuracies listed in L5.
7. **Other:** the UTF-8 probe change is test-only and correct for the frozen
   fingerprints. The quota message is truthful about "not sent" (L6 is a narrow
   attribution issue). Maintainability is good: one Python module, a documented
   TS mirror and clear docstrings.

## Scores

| Dimension | Score | Basis |
| --- | ---: | --- |
| External-contract correctness | 9.2 | R3-1 and decimal-view cases fixed end to end; golden and all §10 cases unchanged; no 5xx found; C01–C23 behaviour unchanged. Lifecycle conformance is correct by inspection but not independently tested (M1) |
| Numerical robustness | 9.4 | Exact predicate; sound float filter verified at its bound; 1.5 M-double spelling parity; lossless pydantic round trip. Worst-case cost uncharacterised (L2) |
| Persistence/recovery | 9.1 | Unchanged transactional code; all fault, restart and hard-kill tests pass on candidate 3. Retry and containment interaction not scanned (L1) |
| Test methodology/evidence | 8.3 | Strong differential design, shared vectors and system tier. Tautological lifecycle oracle (M1); weaker §9 checks (L3); evidence currency and retention gaps (L1, L5); formal gate still on candidate 1 |
| Maintainability | 8.8 | Clear shared module and mirror; reason-order drift between implementations (L4); per-timestamp ring re-preparation |
| **Overall** | **8.8** | Product quality is near acceptance-grade. M1 must be closed and the final gate run on the last candidate before 9+ is justified |

## Housekeeping receipts

- **Ports:** only 8361 (my HTTP check and the corpus) and 5361 (corpus) were
  used. Both were free before and after. I never touched 8000/5180,
  8011/5181/5182 or 5431/8231.
- **Databases:** my HTTP database was removed with its WAL and SHM
  (`E/http/summary.json`). The corpus database was removed by the script. The 92
  SQLite files from my pytest runs were deleted (`E/cleanup-pytest*.txt`). The
  mutation-run temporary directories were deleted. No operator database was
  opened.
- **Processes:** a local scratch process of mine (`boundary_walk.py` v2, an
  unbounded step-doubling loop) was stopped by me (PIDs 35008 and 39364).
  Its completed v1 output is the `walk-7.json` used above. No other process was
  started or stopped.
- **Outside `E/`:** the corpus wrote
  `test-results/simulation-system/critic1tech/`. Vite `createServer` left empty
  `deps_temp_*` directories in ignored `frontend/node_modules/.vite`; the
  implementer's harness does the same, so I left them. No product, test,
  fixture, script, configuration or other document was edited. The candidate
  digest was unchanged at the end.
