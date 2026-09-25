# Phase 5 closure — independent technical critic, round 2

Reviewer: fresh technical critic (did not implement the reviewed work). Review of
**candidate 5**: HEAD `f98de4f183b27df947fb914893deb2e688b598b0` (branch `v3`) plus
uncommitted changes, inventory digest
`27758cb477e1c32902624d5ad656835b1cdcda0bbcecf79127a106d5e429fff9` (668 files).
The digest was identical at start (13:16 UTC) and at end (13:49 UTC), file list and
hashes included (`identity-start/`, `identity-end/`). Raw evidence is under
`test-results/phase5-closure/critic-2-tech/` (called `E/` below); Node scratch is in
`frontend/.cache/p5c-critic-2-tech/`.

## Verdict

**Overall 8.8 / 10. Acceptance-grade is not reached yet: 1 Medium and 5 Low
findings. There are no Critical or High findings.**

The geometry deliverable held against every attack I made with my own oracle
and my own adversarial families: one exact predicate, identical verdicts in the
external validator, core `Polygon`, frontend decoder and resolver containment,
and no 5xx on the real API path. Every round-1 technical correction is in place;
the lifecycle oracle is now independent (I re-ran the mutation). The Medium
finding is about the P5-BATCH limitation that is being put to the user for
acceptance: the measured workloads have one or two timestamps, but the
synchronous completion commits one full frame per timestamp, and frames carry
every entity seen so far. The stated magnitude ("about 5.5 s at 10,000 drones")
and the operational guidance therefore do not bound multi-timestamp batches,
which the contract permits up to 10,000 timestamps.

## Evidence I verified personally (candidate 5)

| Check | Result | Evidence |
| --- | --- | --- |
| Candidate identity | Start and end digest `27758cb4…`, 668 files, identical file hashes; equals `candidates/c5/candidate.json`. c4→c5 differs only in `SimulationPane.tsx`, the browser spec and `storage-limit.mjs`, so the candidate-4 operator scan ran on candidate 5's backend and geometry code | `E/identity-{start,end}/`, candidate-diff check |
| Complete backend suite (canonical) | **680/680**, 0 failures/errors/skips (13:33–13:35 UTC) | `E/logs/backend-full.{log,junit.xml}` |
| Focused frontend unit files | `exactGeometry.test.ts` 83 and `simulation-client.test.ts` 31: **114/114** | `E/logs/frontend-focused.log` |
| System corpus on the gate's `dist-test-p5c-c5` (ports 8361/5361) | **386 cases, 0 failures, 0 server errors**, status counts equal to the gate; hard kill saw `pending` and restored `interrupted`; ports freed, database removed | `E/logs/corpus.log`, `test-results/simulation-system/critic2tech/` |
| Lifecycle-oracle mutation (round-1 plugin, in process, no file edits) | The three mutated §8 cells and the equality test now **fail**. I also checked the literal tables in the test and corpus against spec §8 and the register's matrix cell by cell | `E/mutation/matrix-with-mutated-table.log` |
| **My own oracle** (`E/scratch/c2_oracle.py`, different from both earlier oracles: `Fraction(repr(x))` parsing, non-anchored shoelace, reversal-by-dot-product adjacency, Cramer crossing plus exact squared-distance contact, winding-number containment) and **five new adversarial families** (binary ulp lattices at ±180/±90/128/64, `k·2⁻¹⁰⁷⁴` subnormal grids whose decimal view is not linear in k, exact decimal lines with 0–2-ulp nudges in "M" shapes, 5–40-vertex 17-digit stars at ulp-scale radii, per-coordinate mixed exponents) | 16,500 rings, 82,690 containment points, 3,305 hole polygons, 29,903 orientation triples, 13,450 segment pairs: **0 verdict mismatches** for `ring_violation`, `validate_ring`, core `Polygon.model_validate_json`, `polygon_violation`, `PreparedRing.contains`, `inside_polygon`, `orientation`, `segments_touch`, TS `polygonIntegrity`, `ExactPoints.sign`/`touch`. Reason-level: see L1 | `E/geometry-summary.json`, `E/scratch/{c2_gen,c2_eval_py}.py`, `c2-ts.mjs` |
| Zero-area attack (exact decimal area 0 with non-zero binary area, and binary-symmetric bowties/collinear chains the decimal view distorts) | 20,689 rings (11,966 zero-area): **0 mismatches** in Python (three validators) and TS | `E/scratch/zero_area.py`, `zero-{py,ts}-s21.json` |
| Multi-hole family (2–6 holes, nesting/touching/disjoint, unit, near-180, 1e-200 and 5e-324 frames) | 3,000 polygons: Python = oracle; TS validity identical; **TS first reason differs in 21** (L1) | `E/scratch/c2_holes.py`, `holes-{py,ts}-s11.json` |
| TS float filter at its bound: all six coordinates a few thousand ulps above 2⁰, 2¹, 2⁶, 2⁷, 2⁻²⁰, 2⁻⁵⁰⁰, 2⁻¹⁰²¹, 2³⁰⁰, 2¹⁰⁰⁰ with spelling errors near ±½ ulp (the largest the bound allows), bit-exact Python replica | 192,451 triples, 34,598 with a wrong naive double sign: **0 certified wrong**; the largest wrong-sign \|det\|/bound is **0.653**; minimum certified ratio 1.008 | `E/scratch/filter_attack2.py`, `filter2-s8.json` |
| Same construction through the real `ExactPoints.sign` | 60,000 triples (11,727 wrong double signs, 47,267 filter-certified, overflow cases included): **0 mismatches** | `E/scratch/filter-ts-s9.json` |
| Containment with mixed point types (JSON ints, -0.0, subnormals, cross-vertex grid points, exact decimal edge points) | 23,310 points on 2,030 rings: **0 mismatches** | `E/scratch/contain-attack.json` |
| End-to-end API (in-process app, task-owned database, deleted): 250 valid adversarial rings (50 per family) with both golden drones at a point of known oracle containment; 100 invalid rings | 250 × 200 with interaction count = oracle (155 inside, 95 outside), served zone unchanged; 100 × 422 `VALIDATION_ERROR` at `/area/polygon`; **0 × 5xx** | `E/api/api-summary.json` |
| The 250 served frames through the real `validateFrame` | **0 rejections** | `E/api/ts-decode.json` |
| Python `repr` vs V8 `String()` (Node 24.20.0), independent sample: random bits, ±3 ulps around every power of two, subnormals, 100,000 16-digit near-ties, lon/lat 15–17 digits | 343,038 doubles, **0 value mismatches** | `E/spelling-parity.json` |
| P5-BATCH raw data audit (candidate 5, no re-measurement) | Whole-connection delta sequences continuous in all 9 runs; unreceived deltas all after the last received one; in each sparse run the worst arrival gap lies inside the batch request window, 1.14–1.23 s after send; numbers equal PERFORMANCE/TEST-REPORT | `E/batch-audit-c5.json` |
| Gate raw files | Unit 579/579, backend 680/680 twice, corpus 386/0/0, browser 129 expected (6 Simulation tests passed once each), foreground 24/24 PID matches, M4/M5 ratios: all equal to TEST-REPORT | spot checks of `gate-c5/` |
| Traceability | All 70 test functions cited in TRACEABILITY, COMPATIBILITY-DECISIONS, REVIEW-RESPONSES and TESTING exist | name check |
| Frozen negative fixtures | Current code and path of all 13 invalid fixtures are the intended ones (L4 is about assertions, not behaviour) | command in L4 |

### Supplied, not re-executed by me

- The complete browser suite (129/129) and foreground runs (24/24 PID matches):
  I read their raw results only. UI behaviour is the UI critic's scope.
- M1–M7 measurements (no timing by me, as required); prerequisites and the full
  frontend unit suite (I re-ran only the two geometry/client files).
- The operator-database scans (I read their outputs; I opened no operator database).
- The baseline HTTP 500 reproductions at HEAD.

## Findings (severity-ranked)

### Medium

**M1 — The proposed P5-BATCH limitation is characterised only for one- and
two-timestamp batches; completion work grows with timestamps × accumulated
entities, which was never measured or disclosed.**
- *Location:* `backend/app/simulation/service.py:159–186` (`_complete`: one
  `repository.transaction()`, a `commit_locked` per timestamp, no `await`);
  `backend/app/missions/service.py:84–116` (per commit: load and parse the latest
  frame twice, build, canonicalise, `WorldFrame.model_validate_json`,
  re-canonicalise, diff); `backend/app/adapters/simulation_v1/projection.py:71–80`
  (every earlier entity is carried into each frame as `unobserved`). Workloads:
  `backend/tests/simulation_fixtures.py:9–40` (golden 1 timestamp, local40/remote40
  2, sparse10000 and dense 1). Claims: README.md:110, closure README.md:15,
  PERFORMANCE.md:4–6 and 66–76 (guidance), architecture.md:230 and :404,
  IMPLEMENTATION_PLAN.md:12–16.
- *Reproduction (operation counts, no timing):*
  `PYTHONPATH="backend;backend/tests;E/scratch" backend/.venv/Scripts/python.exe E/scratch/frame_work.py <db-dir> E/frame-work.json`.
  The same 300 input rows produce, inside the one synchronous completion:

  | Shape (timestamps × drones) | Frames | Entity records in frames | Frame JSON |
  | --- | ---: | ---: | ---: |
  | 1 × 300 | 2 | 300 | 0.57 MB |
  | 300 × 1, same drone | 301 | 300 | 1.44 MB |
  | 30 × 10, new drones each time | 31 | 4,650 | 9.0 MB |
  | 300 × 1, new drone each time | 301 | 45,150 | 87.5 MB |

- *Impact:* "about 5.5 s at 10,000 drones" and "submit batches above about 50
  drones per timestamp, or thousands of rows, when …" do not bound the pause for
  multi-timestamp batches. The register confirms START/RESUME may carry up to
  10,000 timestamps ("Do not impose an undocumented timestamp maximum"), and
  REPLAY imports are naturally multi-timestamp. With changing identities the work
  is quadratic in timestamps. As an inference only (I ran no timing): at the
  measured sparse10000 rate (≈5.5 s for one ≈19 MB, 10,000-entity frame), the
  300-row "300 × 1 new drone" batch would block for tens of seconds, and a 1 Hz,
  1-hour, 40-drone REPLAY for minutes. The user is asked to accept a limitation
  whose stated magnitude can be understated by one or two orders.
- *Correction (no architectural change needed):* state in README, the closure
  README, PERFORMANCE, architecture §5/§11 and the C23 row that the pause grows
  with the number of timestamps and with the entities each frame carries, and
  that only 1–2-timestamp batches were measured. Restate the guidance in those
  terms. Preferably measure one multi-timestamp shape with the existing
  concurrency harness (for example 100 × 40, same drones) so the accepted
  magnitude is measured.

### Low

**L1 — The frontend reports a different first violation from the backend for
polygons with three or more holes; the "Fixed" reason-parity claim is broader
than its tests.**
- *Location:* `frontend/src/contracts/integrity.ts:78–95` interleaves, per earlier
  ring, the touch check and the overlap check; `backend/app/domain/geometry.py:169–177`
  checks all touches first, then overlaps. Claimed at integrity.ts:22–26 ("so both
  report the same first violation") and REVIEW-RESPONSES L4.
- *Reproduction:* `E/repro/three-holes.json` (outer 0–10 square; hole 1 (1,1)–(4,4);
  hole 2 (4.5,1)–(6,2); hole 3 (0.5,0.5)–(4.5,4.5), which encloses hole 1 and
  touches hole 2). Backend `polygon_violation`, core `Polygon` and the product
  oracle: `rings-intersect`. Frontend: "Polygon holes overlap"
  (`E/repro/three-holes-{python,ts}.log`). In my multi-hole family it happens in
  21 of 3,000 polygons; validity always agrees.
- *Impact:* diagnostic text only (external areas are single rings; zones come
  from the core). The shared polygon vectors have at most two holes, so no test
  covers the divergence.
- *Correction:* run every touch check against earlier rings before the overlap
  checks in `integrity.ts`, and add this polygon to `polygon-vectors.v1.json`; or
  limit the parity claim to single rings and two holes.

**L2 — The "worst case" diagnostic frames are the best case for the new
bounding-box early exit; worst-case cost remains uncharacterised.**
- *Location:* `scripts/performance_geometry.py:36–48` (regular 100-point stars);
  PERFORMANCE.md:111–112 ("characterise the worst case") and :127–128 ("large
  ordinary and mixed-exponent zones now validate faster than HEAD");
  architecture.md:390 ("keeps large rings cheap"); REVIEW-RESPONSES L2 "Fixed".
- *Reproduction (counts, not timings):* `E/scratch/opcount.py` and
  `frontend/.cache/p5c-critic-2-tech/c2-opcount.mjs` → `E/opcount-{py,ts}.json`.
  Diagnostic stars: 616 exact orientations (Python) and 416 signs (TS). A valid
  101-position rotated "accordion" whose edge boxes all overlap: **9,832** and
  **9,633** (16× and 23×). Its mixed-exponent variant works on 2,006-bit products;
  its 1e-300-scale variant sends **9,634** TS signs to BigInt against 417 for the
  diagnostic star (whose decode already measured 1.88× HEAD).
- *Impact:* per-frame validation on commit, read and decode for box-dense large
  zones stays at the pre-early-exit level. HEAD's ~13 ms per 101-position zone is
  not a ceiling for big-integer cases. This adds to M1 for batches with many
  frames. Resolver containment on large areas (exact, per drone and edge) also has
  no A/B: all M3 areas have 4 vertices.
- *Correction:* reword the three statements (the early exit helps when edge boxes
  are disjoint), add an accordion frame to the M4/M5 diagnostics, or memoise
  validated zone geometry by content.

**L3 — The compatibility statement does not say that the exact predicate
tightens validity for a class of rings HEAD accepted.**
- *Location:* COMPATIBILITY-DECISIONS C17 row; closure README G5 ("no tracked or
  operator ring newly rejected" is accurate but scoped).
- *Reproduction:* `E/scratch/legacy_flip.py` → `E/legacy-flip.json`. Of 800
  mixed-exponent adversarial rings, 9 accepted by HEAD's external validator are
  rejected by the candidate; 6 of them HEAD's core also accepted, for example
  `[[1e-300, 3.9999999999999996e-308], [-1e-16, 1.999999997e-315], [2e-100, 2e-323], [4.0, -4e-300], [-3e-16, -4e-16], [1e-300, 3.9999999999999996e-308]]`.
  Both exact oracles show a real self-intersection that HEAD's inexact
  arithmetic missed.
- *Impact:* a recording or completed command made at HEAD with such an area would,
  after the upgrade, fail strict frame reads and identical retries, because
  validation precedes the idempotency lookup (`service.py:88–100`). The approved
  scans show no such data on this machine (0 verdict changes; no
  `simulation_commands` table), so there is no current impact. The residual
  direction is undisclosed to the person signing C17.
- *Correction:* add one sentence to the C17 row and the closure README: the change
  tightens validity for inexactly accepted mixed-exponent rings, and it is verified
  absent from tracked and operator data only.

**L4 — The frozen §10 negative fixtures are asserted by status and code only,
never by error path.**
- *Location:* `backend/tests/test_simulation_resolver.py:38–41` (status 422 only;
  pre-existing) and `scripts/simulation_system_corpus.py:224–227` (status and code,
  path `None`).
- *Reproduction:* I listed the product's code and path for all 13 fixtures (for
  example `invalid-live` → `/command/source_mode`, `invalid-coordinate` →
  `…/0/latitude_deg`, `unclosed-ring` → `/area/polygon`). All are the intended
  ones today, but a regression that rejects a fixture for another reason would
  pass both tiers. TRACEABILITY cites both for §10 coverage.
- *Correction:* pin each fixture's expected path in the test and the corpus,
  written as literals like the new lifecycle table.

**L5 — Documentation inaccuracies (current-status and closure documents).**
- "40-row batches" is used for `local40`, which is **80 rows** (40 drones × 2
  timestamps; `inputRows: 80` in the raw data): closure README:15,
  IMPLEMENTATION_PLAN:14, architecture:230 and :404, PERFORMANCE:4 and :20.
  PLAN and PERFORMANCE:66 say 80 rows correctly.
- REVIEW-RESPONSES L1 says the scan was "re-run on the final candidate". It ran
  on candidate 4; I confirmed that its backend and geometry files are
  hash-identical to candidate 5, so say that.
- C17 is called "user-approved" (closure README, COMPATIBILITY-DECISIONS) and
  "awaiting sign-off" (IMPLEMENTATION_PLAN, architecture) for the same supplement.
  Say "approved for implementation, recorded for sign-off" in one wording.
  Architecture:403 marks P5-GEOMETRY **Closed** while the closure decision is
  pending.
- PROGRESS reports the identical per-database scan results (21 + 1 distinct
  polygons) as "22" at 00:45 and "21" for candidate 4.
- `test_defensive_scenario.py:257` says "a fresh process reopens the recording";
  it is a new app instance in the same process.
- TEST-REPORT's M7 table shows "—" for sizes that `attempts.json` records (for
  example 10,000 drones = 2,357,125 bytes).

### Informational (no action required)

- `client.ts:359–376` infers "already recorded … no new command was created"
  from a catalog refresh. If another client commits to the same run between this
  commit and the refresh, a fresh commit would be reported as a replay. This
  needs concurrent operators on one external run; the backend gives no replay
  signal, so the heuristic is reasonable.
- The lead's note says candidate 5 differs from candidate 3 in 30 files; the
  non-documentation inventories differ in 28.

## Re-review of every round-1 "Fixed" claim

| Round-1 item | Verified on candidate 5 | Status |
| --- | --- | --- |
| M1 lifecycle oracle | Literal §8/C02/C03 tables in the test and the corpus match spec §8 and the register cell by cell; `test_product_transition_table_matches_the_written_matrix` exists; the mutation fails 3 cells plus the equality test; the corpus imports no policy code | Fixed |
| L1 operator scan | Tool compares HEAD vs candidate verdicts for zones, scenario boundaries and stored commands (none present); ran on candidate 4, whose backend is identical to candidate 5 | Fixed (wording, L5) |
| L2 worst-case cost | Early exit exact in both languages (order-preserving decimal view; I checked -0/0 and touching boxes); direct contact tests exist; diagnostics reported separately. The diagnostics are the early exit's best case | Partly fixed (L2) |
| L3 §9 tests | (a) separate processes with `PYTHONHASHSEED` 0 and 20260924; (b) APEX pair at polygon vertex (-130.0, -44.86), 200 m, asserted; (c) exact reversal asserted and `reversed_timestamps > 0` | Fixed |
| L4 reason order | Single rings: 37,189 rings with identical reasons in TS and Python. Polygons with ≥3 holes diverge | Fixed for rings; not for ≥3 holes (L1) |
| L5 statements | Micro-timings now labelled unretained (PROGRESS) and absent from PERFORMANCE; §9 largest single body 45,102 bytes; MiB; TESTING and docstring corrected | Fixed |
| L6 quota text | `refusal(error, control)` names the saved draft for HOLD/ABORT; unit test passes | Fixed |

## Attacks that did not break the candidate

- **Exactness:** mixed exponents down to 5e-324; `k·2⁻¹⁰⁷⁴` grids whose decimal
  spellings (5e-324, 1e-323, 1.5e-323, …, 4.4e-323) distort binary geometry; ulp
  lattices at ±180/±90; decimal-exact collinearity with 0–2-ulp nudges; 17-digit
  stars at ulp radii; zero-area in one view only; holes that touch, nest or cross
  at decimal points. No disagreement with my oracle in any validator.
- **Float filter:** re-derived the bound (Shewchuk term, per-coordinate
  ≤ |x|·2⁻⁵³ spelling term with a subnormal floor that covers 2 × 2⁻¹⁰⁷⁵, SAFETY for
  bound rounding, UNDERFLOW for gradual underflow; NaN/∞ fall back). Under
  maximally aligned spelling errors a wrong double sign never exceeds 0.653 of the
  bound. `zeroArea`'s summation term ((n+1)ε·Σ|tᵢ|) covers recursive summation.
- **Bounding-box early exit:** 13,450 segment pairs with touching boxes, collinear
  overlaps and shared endpoints at 0, ±180, 1e-300 and subnormal scales: exact in
  both languages. Degenerate segments are unreachable (duplicates are rejected
  first) and are covered by the product's own contact tests.
- **Resolver containment:** exact and inclusive on edges and vertices, half-open at
  vertex heights; agrees with a winding-number oracle on 106,000 points and over
  the API.
- **Persistence and recovery:** no transaction, journal or retry code changed; the
  backend fault/restart tests and the corpus hard kill (pending → interrupted →
  exact retry) pass on candidate 5.
- **P5-BATCH attribution** for the measured shapes: sound; see M1 for scope.

## Assessment against the brief

1. **Exactness:** strong, verified independently at scale.
2. **Parity:** verdict parity complete on every case; reason parity broken only
   for ≥3 holes (L1). Resolver containment matches an exact inclusive oracle.
3. **Historical compatibility:** tracked-data test passes; the candidate-4 scan
   applies to candidate 5 and shows no change. The tightening direction is
   undisclosed (L3).
4. **§9, corpus, lifecycle:** every §9 criterion has a genuine test (replay at
   recorded-inspection level, honestly deferred). The corpus covers every §10
   item and all 16 lifecycle cells from its own literal table; the lifecycle
   matrix is now independent of the product. Negative fixtures are not
   path-pinned (L4).
5. **P5-BATCH:** method and attribution sound for 1–2-timestamp batches; not
   representative of multi-timestamp batches (M1).
6. **Documents:** numbers match raw data; current and historical evidence are
   labelled; accepted, accepted-limitation and unclaimed items are clearly
   separated in the closure README. Overstatements: M1, L2, L5.
7. **Other:** `client.ts` error handling is truthful (unknown-outcome paths keep
   the pending body; rejections show code and path; quota refusals name their
   cause). The UTF-8 probe change is test-only and keeps frozen fingerprints.
   Code quality is good: one compact module, a documented TS twin, clear
   docstrings.

## Scores

| Dimension | Score | Basis |
| --- | ---: | --- |
| External-contract correctness | 9.3 | No contract defect found: golden, fixtures, §10, independent lifecycle table, no 5xx over 350 adversarial API requests. Negative fixtures not path-pinned (L4) |
| Numerical robustness | 9.5 | Exact predicate unbroken by new families; filter bound sound with margin; spelling parity re-verified. Worst-case cost uncharacterised (L2) |
| Persistence/recovery | 9.0 | Unchanged transactional code; kill/restart/retry verified. Tightening risk for HEAD-era data undisclosed (L3); completion-stall scope (M1) |
| Test methodology/evidence | 8.2 | Strong differential design and system tier, lifecycle oracle fixed. P5-BATCH workloads unrepresentative (M1); best-case "worst case" (L2); ≥3-hole parity untested (L1); doc inaccuracies (L5) |
| Maintainability | 8.8 | Clear shared module and TS twin; order drift between the twins (L1); per-timestamp `PreparedRing` rebuild |
| **Overall** | **8.8** | Product quality is at acceptance level for geometry. M1 must be closed (disclose or measure the timestamp dimension) before 9+ is justified; the Lows are small corrections |

## Housekeeping receipts

- **Ports:** only 8361 and 5361 (corpus), both free before and after. I never used
  8000/5180, 8011/5181/5182, 5431/8231 or any foreground port. No headed browser.
- **Databases:** corpus database removed by the script; my API-path and
  frame-count databases were deleted by my scripts (`api-db/`, `frames-db/` gone).
  I deleted the 36 SQLite files created by my two pytest sessions
  (`%TEMP%/pytest-of-User/pytest-166`, `-167`; list in
  `E/cleanup-pytest-databases.txt`). Pytest's default retention (three sessions)
  removed the oldest temporary directory, `pytest-164` (the gate's 12:24 UTC run,
  not cited evidence), when my second session started. No operator database was
  opened.
- **Processes:** every process I started exited; no other process was touched.
- **Outside `E/`:** the corpus wrote `test-results/simulation-system/critic2tech/`.
  Vite SSR harness runs create `deps_temp_*` directories in ignored
  `frontend/node_modules/.vite`, as the implementer's and round-1 harnesses do; I
  left them, because a concurrent reviewer may create them too. No product, test,
  fixture, script, configuration or other document was edited. The candidate
  digest was unchanged at the end.
