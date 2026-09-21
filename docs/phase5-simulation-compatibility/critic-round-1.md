# Phase 5 independent critic — round 1

Review date: 2026-09-20 UTC. Reviewer: fresh `/root/phase5_final_critic` agent, which did not implement the production changes. Review began before the later query-result and polygon-normalization corrections. Those corrections require a fresh independent review; this report does not certify them.

**Recommendation: acceptance withheld.** The architecture is coherent and the implementation contains substantial correctness work, but two supported-input defects were identified, and this critic could not complete its required foreground and measurement reproduction. A score is not a substitute for those gates.

## Personally verified scope

I inspected the frozen request schema and relevant specification sections, the provisional decision register and approved supplemental policies, the simulation validator/resolver/journal/service/API, adapter projection, adjacent mission writer/recording boundaries, frontend module contracts/client/pane, and representative service/resolver/client/browser tests. I did not edit production source.

I verified by source inspection that the golden I→I rule is applied in both directions, with pending deltas applied simultaneously: health 100 becomes 60 and status remains ACTIVE. Candidate sorting, exact external hash inputs, all-input health rows, NO_EFFECT retention, external/internal identity separation and the explicit MSL labels are visible in the implementation. This is a source review, not an independently executed golden comparison.

The prepare transaction records the original request and canonical identity before resolution. Completion frames, events, response and run checkpoint share one synchronous transaction, followed by publication. Completed identity lookup precedes later lifecycle rejection. Core mission writer fencing is enforced in the backend; BLUE creates no managed Asset. Interrupted commands retain a retry identity and are not silently re-evaluated on startup. These are sound design choices on inspection.

I launched a fresh task-owned Edge context using the local-only foreground harness. Native Windows enumeration returned one Sentinel Edge window, ID 1054612. The subsequent native get/activate call returned **`Computer Use app approval timed out`** after blocking for several minutes. The harness correctly refused to proceed without its native foreground gate, timed out, and stopped its services and browser context. No external command or required operator flow was exercised by this attempt. A viewport reporting `focused: true` is explicitly insufficient to claim actual foreground verification.

Own failed evidence: `frontend/test-results/phase5-simulation-compatibility/phase5-critic-foreground/{result.json,failure.png,cleanup.json}` and `test-results/phase5-simulation-compatibility/critic-foreground.{stdout,stderr}.log`. The gate marker was written by a chained shell step only after the native timeout, after the harness had already failed. It is invalid evidence of activation and is retained with this explanation. The cleanup record reports `servicesStopped: true`, `cleanupOk: true`, and deletion of only `verification-phase5-critic-foreground-47236.sqlite3`. Zero external requests were recorded.

## Findings

### Critical

None identified in inspected paths. This is not a blanket certification of untested behavior.

### High — R1: legal dot-segment command IDs lose recorded-result access

- Original locations: `frontend/src/modules/simulation/client.ts` recorded-result lookups and `resultUrl` (around lines 184, 384, 460); `backend/app/api/simulation.py` original path-only result route (around line 60).
- Reproduction: submit a valid golden request with `command_id` set to `.` or `..`, then reload and inspect its stored result. Both IDs satisfy the frozen printable-ASCII identifier schema. `encodeURIComponent('.')` and `encodeURIComponent('..')` leave these values as URL path segments, so browser URL normalization removes or traverses the segment before the path route can recover the original ID.
- Impact: the authoritative command can commit, but supported command identities cannot be reliably inspected/reconciled through the intended recorded-result UI. This breaks the end-to-end opaque-identity contract. The existing interactive receipt API already has query-parameter lookup aliases for this exact category.
- Correction: use a query identity for external result lookup, preserve the historical path alias, and test `.`/`..` plus slash/percent-containing IDs through API and frontend URL construction.
- Evidence level: independently established by inspection of the permitted schema, actual URL construction and route shape; not executed before the correction. The implementer reported applying the query route/client correction during this review. Fresh corrected-source review and regression results remain required.

### Medium — R2: nonzero valid polygons can underflow in downstream validation

- Original locations: `backend/app/simulation/validation.py:106`, `backend/app/domain/models.py` Polygon validation (around line 156), and `frontend/src/contracts/integrity.ts` polygon validation (around line 50).
- Reproduction: replace a golden area's polygon with `[[0,0],[1e-170,0],[1e-170,1e-170],[0,1e-170],[0,0]]` and place observations inside it (or use an empty snapshot). Decimal external validation sees nonzero area. The original downstream double-precision orientation/area arithmetic multiplies `1e-170 * 1e-170`, underflowing to zero, and rejects the projection. Translated coordinates alone do not prevent this.
- Impact: an otherwise supported finite nonzero polygon passes external validation but cannot complete the adapter/core path; the failure is not an ordinary authoritative 422 validation result. Preparation should roll back, but exact valid-input compatibility is still broken.
- Correction: use consistently robust finite geometry validation across external/backend/frontend boundaries, retain original coordinates, and add an end-to-end tiny-polygon regression. Do not silently impose a new minimum area.
- Evidence level: source and numerical-arithmetic analysis, not a completed executable reproduction. The implementer reported applying positive affine normalization plus a boundary regression. Fresh corrected-source review must check topology/boundaries as well as this single example.

### Low — R3: bulk completion responsiveness remains a material measurement limit

- Locations: `backend/app/simulation/service.py:_complete`, `backend/app/missions/service.py:commit_locked` and full-world serialization/validation in the recording repository.
- The resolver cooperatively yields, but completion synchronously constructs, validates, serializes and records all authoritative samples inside a shared SQLite transaction. That preserves atomicity but can stall every source sharing the event loop. Supplied initial sparse-10k evidence reports approximately 9.36–9.88 seconds of event-loop gaps before the redundant final frame was removed.
- This is a limitation requiring final measured disclosure, not a claim that the declared ordinary-40 workload budget necessarily fails. A sparse maximum-size success does not establish dense maxima or interactive source responsiveness during bulk ingestion. Do not describe cooperative resolution as making the entire command nonblocking.
- Recommended disposition: publish final before/after stage, memory, logical/stored bytes and event-loop/source-gap measurements with exact workload counts; leave unsupported dense maxima and any failed responsiveness criteria open. Avoid an unverified concurrency rewrite to meet the deadline.

## Methodology and compatibility challenge

The initial sparse result is an initial Phase 5 candidate, not the D7 baseline. Removing a duplicate completion world is lossless only if every authoritative sample and all command/interaction events remain committed; the revised join of the completion event to the final sample appears consistent with that requirement on inspection. Final measurement must use identical samples and distinguish database, WAL/SHM, final normal-close size and logical content. A falling combined live footprint alone is not storage-efficiency proof.

The approved leap-second, zero-area and HOLD/ABORT coverage policies remain explicitly local and provisional. C02/C03 lifecycle ambiguity, canonicalization, geometry interpretation, invocation/error envelopes, profile/run rules and external performance maxima continue to prevent unqualified organiser-conformance signoff. Nothing reviewed justifies relabelling NOTIONAL calibration as empirical evidence or MSL display approximation as altitude-fidelity acceptance.

Historical test totals and the implementer's foreground/performance results were supplied evidence. I did not independently rerun those checks. The required independent measurement and actual foreground non-default/lost-response/recorded-inspection checks remain open for this round because of the native tool failure and the new deadline. No provider budget was consumed.

## Scores and acceptance

These are provisional scores for inspected source and evidence quality, not final verified implementation scores:

| Category | Score / 10 | Basis |
| --- | ---: | --- |
| External-contract correctness | 8.0 | Strong deterministic resolver; supported identity/numerical boundaries required corrections; external ambiguities remain. |
| Backend/persistence | 8.7 | Coherent durable prepare/completion boundary, idempotency and fencing; independent runtime reproduction incomplete. |
| Frontend | 8.0 | Protected exact pending body, stale-response guards and module ownership; original result URL defect and own UI gate incomplete. |
| Compatibility/recovery | 8.3 | Explicit schema6/lossless codec reuse and preserved historical readers; final fresh verification still needed. |
| Performance/resource efficiency | 7.0 | Cooperative analysis and sparse indexing are useful; bulk synchronous commit stalls and final measurements unresolved at this review. |
| Maintainability | 8.5 | Module boundaries and centralized policies are clear; geometry consistency and opaque-identity patterns needed tighter reuse. |
| **Overall** | **8.1** | **Do not accept on this review alone.** |

The two code findings were communicated immediately. A different fresh critic must review the corrected source and complete the outstanding independent checks; this critic did not independently validate the fixes. Final full regression/browser gates, complete evidence/source identity and cleanup/preservation audit remain the delivery owner's responsibility.
