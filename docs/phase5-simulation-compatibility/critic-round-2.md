# Phase 5 independent critic — corrected-source round 2

Review: 20 September 2026 UTC, 13:21–13:44. Reviewer:
`/root/phase5_corrected_critic`, a fresh agent that implemented no production
changes. **Acceptance is withheld.** Corrected command lookup and ordinary batch
behavior are well supported. A remaining supported-geometry defect, incomplete
independent foreground verification and a failing complete browser attempt prevent
Phase 5 acceptance. Scores below do not override these gates.

## Personally verified evidence

- Read the frozen compatibility register and current policy, duplicate-aware
  validator, resolver, journal, command service, adapter, ownership fence, module
  contracts/client/UI and corrected backend/frontend geometry predicates.
- Ran both complete focused backend simulation files: **95 checks passed** with
  process exit 0, before the additional crossing-edge regression was added. This
  included golden equality, negative input, lifecycle, rollback, actual process
  death, restart, concurrent retries, old recording preservation, calibration and
  opaque query identity tests. Two existing deprecation warnings appeared.
  `critic2-focused.log` is the complete raw result. This is not the final full
  backend gate and is not falsely reported as the later 96-check run.
- Independently reproduced the crossing-edge defect below, reported it, inspected
  the implementer's correction and reran the exact numerical cases on the final
  source. A valid uniform `1e-170` square is accepted with original coordinates
  preserved; the nonzero-area self-crossing `1e-100` ring is rejected.
  `critic2-final-geometry.json` records both results.
- Independently ran four isolated Sydney 40-drone/two-timestamp probes in the
  explicitly reserved uncontended CPU window. There were 80 input/health rows,
  116 eligible output pairs, 3 committed frames and 158 events per run. Cold
  latency was **168.80 ms**; subsequent samples were **165.34, 179.03 and
  157.81 ms**, warm median **165.34 ms**. Final normal-close retained database was
  **589,824 bytes**, or 196,608 bytes/frame and 7,372.8 bytes/input row; WAL/SHM
  were zero after normal close. The first live sample had DB 4,096, WAL 700,432
  and SHM 32,768 bytes. These are different lifecycle measurements, not additive
  retained data or cumulative write-volume claims.
- The independent probe's largest event-loop observer gap was **178.82 ms**.
  This is a 20 ms software heartbeat, not compositor presentation, command-to-
  pixel latency or independent interactive source publication. Peak process
  working-set counters and stage timing are retained in `critic2-remote40/`.
  All four diagnostic databases were closed and removed. This probe reproduced
  the supplied ordinary-batch result; it did not independently rerun sparse/dense
  maxima, so no worst-case extrapolation is justified.

All raw evidence named here is under
`test-results/phase5-simulation-compatibility/` unless a frontend path is stated.
`critic2-source-inventory.json` hashes nine inspected final production paths.

## Foreground attempt and cleanup

I launched my own fresh headed Edge 153.0.4234.48 context, disposable runtime and
database on ports 5405/8205. Native `list_windows` returned its new actual Windows
window, ID 40774874, titled “Sentinel — Operational workspace - Profile 1 -
Microsoft Edge”. Native `get_window`/activation then blocked and was interrupted
to protect the user's deadline. A window title alone does not prove successful
foreground activation. The harness consequently refused its native gate and
executed **no scenario cases**. It retained its own `failure.png` screenshot and
result identifying `Native foreground gate unverified`.

I therefore did **not** personally complete foreground Sydney/lifecycle,
lost-response or recorded-inspection UI verification. These remain open for this
critic; earlier owner's UI evidence is separate supplied evidence. No subsequent
UI input or provider measurement was attempted after interruption.

The helper's `cleanup.json` independently reports services stopped, cleanup
successful and its exact disposable database deleted. Owned service PIDs were
38920/46340, parent 35380. Evidence is under
`frontend/test-results/phase5-simulation-compatibility/phase5-critic2-corrected-ui/`.
External request count and page errors were both zero. No operator browser data
was cleared. Own pytest disposable databases were archived then removed from the
checked task-only directory. `critic2-disposable-databases.zip` SHA-256 is
`500eb33718b5cead32a91ab9ed77d49aa628b54a71ab83f926136c256b65cf7d`.
The delivery owner must retain this evidence in the verified external archive.

## Severity-ranked findings

### Critical

None identified in the inspected paths. This does not certify untested maxima.

### High

No new High finding. The prior opaque-command-ID defect is corrected:
`backend/app/api/simulation.py:59` adds a query lookup; the client inspection,
historical selection and full-result link consistently encode the identifier as a
query value (`frontend/src/modules/simulation/client.ts:184`, `:384`, `:460`).
Existing `.`/`..` and slash/query/hash/percent test cases passed in my backend run.
The old path endpoint is retained as deprecated compatibility, not used by the UI.

### Medium — R2-1: small crossing edges bypassed topology validation — corrected

- **Locations:** `backend/app/domain/models.py:140` and
  `frontend/src/contracts/integrity.ts:26`.
- **Reproduction before correction:** validate
  `[[0,0],[3e-100,3e-100],[0,3e-100],[2e-100,0],[0,0]]` as a core Polygon.
  It is self-intersecting with nonzero signed area. The core accepted it while the
  external Decimal validator correctly rejected it.
- **Cause/impact:** multiplication of opposite orientation values underflowed to
  signed zero. The uniform-scale normalization threshold did not cover this
  magnitude. The corrected core could admit an invalid world polygon despite its
  declared topology guards; the external endpoint itself was protected by its
  earlier validator for this exact case.
- **Correction:** compare signs directly rather than multiplying orientation
  values. Implementer changed both backend and frontend and added the regression.
  I read the final predicates and reproduced rejection, alongside preservation
  of the valid `1e-170` square. **This exact finding is closed.**

### Medium — R2-2: remaining mixed-scale valid geometry failure — open, supplied reproduction

Fresh round-3 reviewer independently demonstrated a valid mixed-scale polygon
accepted by external validation but rejected by the core adapter with HTTP 500:
`[[0,0],[2e-170,2e-170],[1e-170,0],[1,0],[1,1],[0,1],[0,0]]`.
Place the golden pair at `[0.5,0.5]`. See
[round 3](critic-round-3.md) for its personally verified API reproduction, exact
line references and rollback evidence. I inspected its cause in
`backend/app/domain/models.py:129`/`:166` and matching frontend logic: global
normalization does not protect a tiny local turn inside ordinary overall extents.

This is a material permitted-input failure, even though the demonstrated prepare
transaction rolled back safely. Robust local orientation predicates with parity
across backend/frontend and exact-coordinate retention are the recommended
correction. Do not invent a minimum feature size or turn this valid input into a
validation rejection. It cannot be marked resolved by the passing uniform-scale
tests. It was not independently rerun by this reviewer and remains open.

### Low — R2-3: practical browser pending-storage limit needs an explicit boundary

`frontend/src/modules/simulation/client.ts:109` persists both the authoring draft
and exact pending request to localStorage before sending. This correctly refuses
quota failures without losing identities, but large valid batches can exceed
browser quota. Document the minimum UI workflow's practical storage limit
separately from backend contract maxima; do not claim 10,000-drone UI verification
from the service benchmark. No supported backend limit was reduced in inspected
source. This is a documentation/resource limitation, not an instruction to weaken
durable pending persistence.

## Assessment and supplied evidence

Preparation commits original input, canonical identity, profile and run ownership
before evaluation. Completion retains all authoritative samples and interaction
events, response and checkpoint in one transaction before acknowledgement or
publication. Completed retries precede later lifecycle restrictions. The inspected
code and my fault/restart checks support these boundaries; no cadence reduction,
NO_EFFECT filtering, hash substitution or durability weakening was found.

The adapter keeps external missions separate, preserves MSL and ingestion/source
times, creates no asset from BLUE affiliation, and stores module health separately
from generic readiness. Photo identity is not inferred from class/profile/name.
Approved provisional policy remains explicitly versioned and unconfirmed by the
organiser. Exact external signoff remains a separate unresolved decision.

The owner's initial-versus-final sparse comparison is an initial Phase 5 candidate
comparison, not a baseline D7 implementation comparison. The final-sample completion
event replaces a redundant full-world copy without dropping a sample/event. I
inspected that source attribution and the supplied totals but did not independently
rerun that before/after comparison. Supplied sparse/dense observer gaps of several
seconds remain a serious disclosed bulk responsiveness limit; average throughput
and passing 40-unit probes cannot establish continuous real-time responsiveness.

At report time the owner supplied final 435 frontend and 534 backend passes, but
the complete browser attempt was failing and had not finished. These are supplied
results, not my executions. The final complete browser gate, archive readback,
preservation audit and source-to-final-test match remain delivery-owner obligations.
Inherited D7 display/Video gaps are not addressed or passed here. Provider requests
for this critic were zero.

## Scores and recommendation

| Category | Score / 10 | Reason |
| --- | ---: | --- |
| External-contract correctness | 8.2 | Golden/negative behavior strong; permitted mixed-scale geometry remains broken and interpretations remain provisional. |
| Backend/persistence | 9.1 | Durable atomic boundaries, exact retries and independent fault/restart coverage. |
| Frontend | 8.4 | Coherent module and identity correction; own foreground workflow incomplete and complete browser gate failing. |
| Compatibility/recovery | 9.0 | Versioned strict boundaries, ownership, historical storage and recovery checks substantiate ordinary cases. |
| Performance/resource efficiency | 7.8 | Independently fast ordinary 40-unit batches; multi-second bulk event-loop stalls and dense maxima remain limited. |
| Maintainability | 8.5 | Clear service/module separation; duplicated numerical predicates and deadline-constrained edge coverage need further work. |
| **Overall** | **8.5** | **Acceptance withheld.** |

The successful ordinary-workload and affected recovery evidence is useful and may
be reported with its scope. Full local simulation compatibility, independent actual
foreground verification and complete browser acceptance remain open. Do not declare
Phase 5 fully accepted, and do not use these scores as a substitute for those gates.
