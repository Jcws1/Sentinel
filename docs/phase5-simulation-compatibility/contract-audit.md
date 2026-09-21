# Phase 5 pre-implementation contract audit

This preserves the original, independent, read-only contract audit by
`/root/phase5_contract_audit`. It is an early source audit, not a review or
acceptance of the final Phase 5 implementation. No application services,
operator databases or providers were used. The audit made no source edits.
Only small, in-memory Python standard-library probes were run.

References and line numbers below identify the source as examined during that
initial audit; subsequent implementation may move or change those lines. This
report was saved later at the parent agent's request without inspecting the
current implementation.

## Interpretation status at preservation

**Confirmed requirement** means explicit frozen specification text, not organiser
approval. **Existing provisional policy** means a local interpretation from the
compatibility decision register. **Audit observation/recommendation** is the
auditor's engineering analysis and does not change the frozen contract.

The original audit identified three local choices that were not settled by the
register. The parent subsequently reported the user's approval of:

| Topic | Newly approved provisional local policy | Remaining qualification |
| --- | --- | --- |
| Leap seconds | Reject leap-second timestamps. | This is a local policy; organiser-confirmed RFC3339 edge-case conformance remains open. |
| Zero-area polygons | Reject zero-area polygons. | Genuine zero area must be distinguished from floating-point cancellation on a nonzero polygon. |
| HOLD/ABORT completeness | Fully validate supplied structure and fields without evaluating rule coverage. | Do not evaluate supplied outcomes. The policy does not waive other request validation. |

These approvals resolve the local implementation choices raised in the original
audit. They do not constitute organiser answers or retrospective verification of
the implementation. The within-command interaction-hash collision described
below remains an engineering observation, with a recommended internal identity
disambiguation that preserves the published external hash.

## Original policy observations

- **Leap seconds:** C22 did not choose semantics: “preserve agreed leap-second
  semantics” referred to an agreement that did not exist. Frozen specification
  line 145 requires RFC3339 UTC milliseconds, while the then-current
  `UtcInstant` rejected second 60 through `datetime.strptime`
  ([base.py](../../backend/app/domain/base.py), lines 15–22). History repeated
  that parser and clients used `Date.parse`. Leap-second support could not be
  claimed merely from the timestamp regex.
- **Degenerate rings:** C17 left zero-area validity open. The then-current core
  geometry rejected zero area and repeated vertices
  ([models.py](../../backend/app/domain/models.py), lines 154–175). Inheriting
  core restrictions accidentally would not settle the external policy.
- **HOLD/ABORT rule completeness:** C10 explicitly left applicability of rule
  completeness open, although all supplied fields must validate. It did not
  definitively settle an otherwise valid HOLD containing an eligible pair
  without its class rule.
- **Within-command hash collision:** C12 addressed overlapping commands, but its
  structured `(run, command, external_hash)` internal key did not distinguish
  every pair allowed by the external ID grammar. Preserve the published hash;
  include the structured timestamp/red/blue tuple in internal event identity.

These were narrower unresolved choices than C02/C03/C07/C09, which already had
concrete provisional local policies. See the unchanged
[compatibility decision register](../../contracts/simulation/compatibility-decisions.md),
especially C10 and C17–C23.

## Source-proven integration hazards

The following are observations about the starting source, not findings against
the final Phase 5 implementation.

1. **Internal interaction identity can lose valid pairs.** In a stdlib-only
   probe, `(red="a", blue="b|c")` and `(red="a|b", blue="c")`, with mission `M`
   and timestamp `2026-09-06T00:00:01.000Z`, produced the same external hash:
   `6fd13bcfd0c726cf3df685150b47bdc294c2c7949498cb3d0737192d64f30304`.
   Both outputs and events must survive. At audit time,
   `MissionService.commit_locked` overwrote supplied event IDs with UUIDs
   ([service.py](../../backend/app/missions/service.py), lines 89–90), so a
   deliberate identity path was needed for command-scoped deterministic IDs.

2. **Do not yield inside the shared SQLite transaction.** There was one
   connection; `commit()` joined an existing transaction, and the `RLock` was
   reentrant on the event-loop thread
   ([sqlite_repository.py](../../backend/app/recording/sqlite_repository.py),
   lines 213–245 and 248–257). Another mission coroutine could otherwise join
   the unfinished transaction. Recommended boundary: commit durable request,
   pending identity and recording establishment before pure evaluation; finish
   receipt/run/world/events under a correctly serialized writer boundary;
   publish afterward. A per-mission asyncio lock alone does not serialize the
   shared database connection across missions.

3. **Backward imports can leak future observations or fail adaptation.** C14
   permits otherwise-valid backward times. Core frame validation rejected
   `track.latest.timestamp > frame.effectiveAt`
   ([models.py](../../backend/app/domain/models.py), lines 278–281). Copying
   the last frame and marking an absent future track stale is insufficient.
   Reconstruct applicable as-of observations, or retain the entity without a
   future track; never fabricate an earlier timestamp.

4. **The starting geometry check had cancellation risk.** A simple rectangle
   spanning `1e-9` degrees at `(103, 1)` produced absolute-coordinate shoelace
   `0.0`, while translated shoelace was `2.0000074363894432e-18`. The then-current
   zero-area check therefore rejected a genuinely nonzero permitted ring
   ([models.py](../../backend/app/domain/models.py), lines 163–165). Do not
   carry that false rejection into the external adapter. If shared validation
   changes, preserve and test historical-reader behavior deliberately.

5. **Existing canonical JSON did not implement C07 numeric normalization.**
   `canonical()` sorted keys but left `1`, `1.0` and `-0.0` distinct
   ([serialization.py](../../backend/app/world/serialization.py), lines 12–15).
   The probe confirmed distinct encodings for those parsed variants. Use an
   external-specific, versioned normalization policy; preserve request array
   order for idempotency, independently sort outputs, and retain the original
   request as well as its canonical identity.

6. **Generic errors were not compatibility envelopes.** Default validation
   emitted `{code,message}`, while storage errors stated “no change was
   committed” ([main.py](../../backend/app/main.py), lines 76–88). A durable
   pending command may already exist after a later completion failure. Use
   compatibility-specific truthful errors and reconciliation while preserving
   existing interactive responses.

## Requirement and regression checklist

This checklist combines frozen requirements, explicitly identified existing
local policies and engineering recommendations. Passing it must be established
by final implementation evidence, not inferred from this audit.

| Area | Basis | Checks and implementation direction |
| --- | --- | --- |
| Parsing and validation | Frozen §§4, 6, 10; C08/C09 | Duplicate-aware parsing before object materialization; reject null/nonfinite values and booleans masquerading as numbers; validate calendar dates; follow the C08 first-error order and sort unknown keys after known keys. Validate the entire request before resolution. Define deterministic handling of invalid timestamp keys that cannot be instant-sorted. |
| Numeric identity | Existing provisional C07/C21 | Equivalent object-key order and numeric lexical variants retry identically. Array permutations preserve domain results but remain different same-ID request bodies under C07. Do not normalize opaque strings or trim permitted padded/space-only drone IDs. |
| Resolver | Frozen §§5–7 | Match golden health 60/ACTIVE, draws, ordering and interaction IDs. Effects are RED→BLUE then BLUE→RED. Use unrounded distance for eligibility and three-decimal output only. Apply the grid epsilon only to its specified formula. |
| Geometry | Frozen §§4–5; C17/C18; audit recommendation | Test edge/vertex/band/radius equality and just-outside cases, tiny/near-collinear rings, self-touch/intersection and all permitted coordinate extrema. Use the specified spherical radius 6,371,008.8 m, not an ellipsoidal library distance. Bound haversine floating intermediates appropriately. Preserve the specified arithmetic longitude midpoint even across ±180; do not substitute a short-arc midpoint. |
| Draw edge | Existing provisional C18 | `(2**64-1)/2**64` rounds to 1.0 as a double. C18 and the response schema allow this edge; `< probability` still governs. Do not silently clamp the draw below one or special-case probability one. |
| Health and history | Frozen §5.3/§6; C11/C16 | Test simultaneous multi-pair accumulation without early disabling during pair iteration; unchanged neutral/unknown/out-of-area rows; input DISABLED/REMOVED preservation; absence as unobserved rather than zero health; explicit correction after absence/RESUME using C16 last observed output. |
| Lifecycle and idempotency | Frozen §§6/8; provisional lifecycle matrix/C13/C20 | Test every matrix cell, completed identical retry before transition checks including after ABORT, global external command registry, concurrent duplicates and conflicts. A rejected command must leave the prior healthy run intact; a profile conflict must not poison it. |
| Durable boundaries | Frozen §8; implementation plan §5; audit recommendation | Prove recording and pending request are committed before resolver entry. Inject crashes before/after pending, during resolution, during completion, and after commit before HTTP/publication. Exact retries yield one result with no duplicate frame/event. Define interrupted-command recovery explicitly. |
| Profiles | Frozen §§4.2/4.3/11; C10/C15 | Immutable identity/content; duplicate ordered rule rejection even when unused; eligible completeness under the applicable policy; allow unused unique rules and different immutable profile identities across commands. PUBLIC_PARTIAL as well as VALIDATED requires the frozen calibration artifact described in §11; source-summary prose is not evidence. No registry was present in the audited starting implementation. |
| Adapter | Implementation plan §5 mapping | Join every input row to its health output; use stable structured identities and explicit affiliation/class mapping; do not infer Asset status from BLUE. Preserve one event per eligible interaction including NO_EFFECT; full details remain queryable beyond the 100-entry recentEvents window. Preserve source MSL and ingestion time separately. |
| Ownership | Phase 5 separate-run boundary; audit recommendation | Map/namespace external missions so external IDs cannot address fixture or interactive missions. Verify generic source ports, fixture advance, interactive commands/status and startup recovery cannot mutate adapter-owned runs. The audited interactive tick selected only active_interactive; generic commit_source had no owner identity. |
| Publication and UI | Implementation plan §§5–6 | Validate messages before completion commit, distribute afterward. Shared schemas/deltas/decoders carry module projection. Use one command owner, generation guards and exact pending bodies across reload. Preserve labeled MSL approximation; the existing Video path requires ellipsoid height and must remain truthfully unavailable when unsupported. |
| Scale | Frozen §4.2/§10; C23 | Run sparse 10,000 drones and separately bounded dense cases, for example 100/250/500/1,000 drones. Report eligible pairs and output records, not just drones. Dense 10,000 permits 25 million pairs; START/RESUME maxima permit 100 million input rows. Do not truncate output or add an undocumented HOLD/ABORT timestamp cap. Test resource interruption without corrupting run state. |

## Additional boundaries to preserve

The storage codec's 16 MiB bound governs optional compressed payloads; larger
valid payloads fall back to TEXT
([storage_codec.py](../../backend/app/recording/storage_codec.py), lines 22–27).
It must not become a new external input/output limit by accident.

The adapter requirements are particularly explicit in
[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md), lines 424 and 430–452:
retain original request plus canonical identity, immutable profile audit,
response and command acknowledgement; join input/output to form authoritative
frames; commit before publication; keep role ownership explicit; preserve
discontinuities and source altitude.

No existing provisional policy authorizes changing the published golden result,
external hashing, recording fidelity, health arithmetic or durability. Final
implementation tests, foreground UI evidence and a fresh independent critic
remain separate gates.
