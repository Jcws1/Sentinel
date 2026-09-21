# Phase 5 independent critic — corrected-source round 3

Review date: 20 September 2026 UTC, begun 13:33. Reviewer: fresh
`/root/phase5_final_fix_review`, which did not implement production changes.
This is an independent source and focused-check review of the corrected query
lookup and numerical geometry paths and adjacent simulation authority paths.

**Recommendation: acceptance remains withheld.** The opaque-command lookup defect
is corrected, and the uniform tiny-polygon and crossing-edge regressions pass.
An independent mixed-scale polygon reproducer still exposes a supported-input
failure. There is no evidence of recording corruption in that failure, but the
claimed complete external-input path is not yet satisfied. Required independent
foreground verification and final full-suite gates also remain separate decisions.

## Personally verified

- Inspected current result routes/client lookup and download paths, backend and
  frontend polygon integrity, external geometry validation/resolution, command
  journal/service, adapter projection, mission writer fencing, startup/shutdown
  recovery and SQLite recording setup. Source hashes for fifteen inspected source
  and test files are retained in `critic3-source-inventory.json`.
- Executed the complete focused simulation resolver and service files: **96
  tests passed**, including exact frozen golden equality, negative fixtures,
  lifecycle cells, six concurrent duplicate submissions, completed retry after
  ABORT, cancellation, preparation/completion rollback, process death before and
  after completion commit, restart, historical version-5 upgrade, source ownership,
  immutable calibration evidence, hash-collision retention and the new URL/geometry
  cases. Two existing Starlette/httpx deprecation warnings were emitted.
- Executed the focused frontend simulation client file: **21 tests passed**,
  including exact pending-body recovery, stale callback protection, query-based
  lookup/download for `.`, `..`, slash, query/hash and percent-containing command
  identities, and uniform tiny/crossing/zero-area geometry cases.
- Independently constructed a mixed-scale simple polygon, compared external and
  core validation, then submitted it through a disposable FastAPI application.
  The API returned **500**, with no journal schema and no mission committed.
  The temporary database was closed and removed by the probe.

Logs are under `test-results/phase5-simulation-compatibility/`:
`critic3-focused-backend.log`, `critic3-focused-frontend.log`,
`critic3-mixed-scale-geometry.log`, `critic3-mixed-scale-api.log` and the source
inventory. These checks used local fixtures and no external provider requests.
No browser, service daemon or benchmark was launched by this reviewer. Performance
tests were deliberately not run alongside the delivery owner's regression load.
Own pytest databases were closed, preserved in
`critic3-disposable-databases.zip`, and removed from their task-only temporary
directory. Archive SHA-256:
`31eab6fd5f7ddc366dd0c3b901052a4414f9d559f6892a9f2556bc1e347a2315`.
`critic3-cleanup.json` records zero launched daemons/contexts and zero external
requests. The delivery owner must include these retained files in the final
external evidence archive.

## Severity-ranked findings

### Critical

None identified in inspected paths. This does not certify untested combinations.

### High

None newly identified. Prior R1 opaque-ID result lookup is closed for the reviewed
source: `backend/app/api/simulation.py:59` exposes the query route, and
`frontend/src/modules/simulation/client.ts:184`, `:384` and `:460` consistently
encode the identity in a query value. The legacy path alias remains available.
Independent backend and frontend regressions passed.

### Medium — R3-1: mixed-scale valid polygons still fail after external validation

- **Locations:** `backend/app/domain/models.py:129` and `:166`;
  matching frontend arithmetic at `frontend/src/contracts/integrity.ts:19` and
  `:54`. The strict external validator accepts the ring at
  `backend/app/simulation/validation.py:106`.
- **Reproduction:** use the golden request with polygon
  `[[0,0],[2e-170,2e-170],[1e-170,0],[1,0],[1,1],[0,1],[0,0]]`, and place the two
  observations at longitude/latitude `0.5,0.5`. This simple, nonzero-area polygon
  has a small local turn and ordinary overall extents. External Decimal validation
  accepts it. Core `Polygon` rejects it as `polygon adjacent edges overlap`.
  The same shape with `1e-100` instead of `1e-170` is accepted by both validators.
  An actual local API POST returns HTTP 500 `Internal Server Error`.
- **Cause:** the global axis-range threshold does not normalize this ring because
  both ranges are 1. The local orientation multiplies tiny differences, underflows
  to zero, and incorrectly treats a vertex inside an edge's bounding rectangle as
  collinear. Global normalization alone cannot protect tiny local features in an
  otherwise ordinary-size polygon.
- **Impact:** a finite valid input permitted by the frozen contract cannot complete
  the external-to-core path. Independent inspection confirmed rollback: no mission
  or simulation journal remains, so this reproduction does not corrupt prior data
  or publish an incomplete result. It nevertheless prevents full geometry and
  end-to-end compatibility acceptance.
- **Recommended correction:** use robust local orientation predicates with a
  consistent backend/frontend fallback for ambiguous underflow/cancellation, and
  add this mixed-scale end-to-end case alongside the uniform tiny-polygon test.
  Preserve original coordinates; do not impose a new minimum feature size or
  mislabel a valid input as a validation error. A material fix requires fresh
  independent review and appropriate final regression gates. If that cannot fit
  the user's deadline, retain this explicit open defect.

### Low — R3-2: single-writer bulk completion remains a disclosed responsiveness limit

`backend/app/simulation/service.py:159` correctly keeps completion response,
checkpoint and every sample/event in one synchronous transaction. The same design
blocks the event loop during large world construction/serialization/commit. The
supplied final sparse-10k measurement reports a maximum 5,669.62 ms observer gap;
dense-200 reports 4,221.18 ms. Cooperative validation/resolution does not eliminate
this boundary. This reviewer did not independently reproduce those timings.

Keep the limitation explicit; do not extrapolate the ordinary 40-unit timings to
maximum dense inputs or concurrent interactive responsiveness. Do not weaken
atomicity or discard retained samples to improve a headline timing.

## Correctness and methodology assessment

The prepare transaction precedes evaluation, retains original raw input and
canonical retry identity, and publishes only after commit. Completion stores all
samples, all interaction events including NO_EFFECT, response and run checkpoint
before acknowledgement/publication. The focused fault tests substantiate those
boundaries. Identical completed requests return stored results before applying
later lifecycle restrictions. External mission ownership is enforced in the
backend, not merely by disabled controls. BLUE affiliation creates no managed
asset. MSL labels and source-mode separation remain explicit.

The queried identifier correction is narrow and coherent. The geometry correction
was also narrow, but testing one uniformly tiny polygon was insufficient: mixed
scales expose a remaining error. The passing 96/21 focused tests are meaningful
evidence, not proof of every finite numeric boundary.

The supplied sparse before/after comparison labels its baseline as an initial
Phase 5 candidate, preserves matching request/response hashes and distinguishes
logical content, DB/WAL/SHM and normal-close retained bytes. The removed world was
a redundant completion copy, while the sample and completion audit event remain.
This is an appropriate attribution on inspected source and supplied records;
this reviewer did not rerun the benchmark or independently audit every raw sample.

## Supplied evidence and unverified gates

The delivery owner supplied full-suite status, resource tables, prior foreground
screenshots and the second critic's ordinary-batch measurement. They are not this
reviewer's personally executed evidence. This review did not operate an actual
foreground UI, capture screenshots or reproduce display/provider behavior. The
prior native activation/approval failures cannot be reclassified as successful
foreground verification. Final complete browser/regression results, source match,
archive integrity and preservation/cleanup audit remain the delivery owner's gates.

Approved leap-second, zero-area and HOLD/ABORT rule-coverage policies remain
explicitly provisional local policy. Unresolved organiser questions separately
prevent unqualified exact external-conformance signoff even after local defects
are corrected. D7 strict display acceptance and configured Video pacing remain
inherited open gates; this reviewer used zero provider requests.

## Scores and recommendation

Scores assess inspected source and personally executed focused checks, with
verification limitations reflected. They do not replace acceptance criteria.

| Category | Score / 10 | Basis |
| --- | ---: | --- |
| External-contract correctness | 8.2 | Golden and negative coverage passed; mixed-scale valid geometry still fails; external policy remains provisional. |
| Backend/persistence | 9.0 | Strong durable boundaries, exact retries, ownership and independently passing fault/restart tests. |
| Frontend | 8.8 | Corrected opaque identity, durable pending state and 21 passing checks; own foreground verification absent and geometry parity incomplete. |
| Compatibility/recovery | 9.0 | Historical storage and crash/retry tests pass; no evidence of loss or weakened durability. |
| Performance/resource efficiency | 7.8 | Supplied ordinary/sparse results useful; large synchronous completion stalls and dense maxima remain unverified. |
| Maintainability | 8.6 | Clear module boundaries and centralized policy; duplicated geometry logic needs robust shared semantics. |
| **Overall** | **8.6** | **Do not declare Phase 5 fully accepted on this source/review.** |

The query-lookup finding is resolved. Uniform tiny geometry and crossing-edge fixes
are verified for their tests. R3-1 remains a material supported-input defect until
corrected and independently reviewed. Functional/recovery acceptance may be scoped
to verified ordinary workloads; full numerical compatibility, independent actual
foreground operation and any unfinished final gates remain open.
