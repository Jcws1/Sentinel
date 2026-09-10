# Simulation v1 compatibility decisions — Phase 0

Status: draft integration decisions, 2026-09-10. No organiser answers have been received or sent. The submitted [contract](../../docs/RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md) remains unchanged. The [product specification](../../docs/Sentinel_v3.md) governs Sentinel's internal architecture.

**Confirmed** means explicit submitted text, not organiser approval of our implementation. **Provisional** means a local interpretation that can change. **Open** means organiser clarification is required before claiming exact conformance. Initial JSON Schemas enforce structural requirements only; the fixture manifest identifies checks deferred to semantic validation or the mission service.

## Confirmed boundary requirements

- Exact v1 field names/enums; unknown fields and request nulls rejected. WGS84 coordinates, finite numbers, altitude metres MSL; strict UTC millisecond timestamps. No LIVE source.
- START/RESUME require 1–10,000 timestamps; snapshots contain 0–10,000 drones. HOLD/ABORT allow zero or more timestamps, evaluate none. Do not impose an undocumented timestamp maximum on those commands.
- Entire request validated before any evaluation. Inclusive polygon/band/radius; active, positive-health opposing pairs only. All input drones get health rows, including nonparticipants.
- Specified spherical horizontal distance, simultaneous effects, SHA-256 draws, location bin and deterministic sorting remain inside the simulation implementation. No frontend recomputation.
- Next supplied health is authoritative for that input even when it disagrees with prior output; record discontinuity. Absence does not imply removal.
- HTTP 400 syntax, 422 validation, 409 command conflict; stable idempotency response for identical canonical command. Successful acknowledgements use null error fields.
- Calibration identity is immutable; UNKNOWN class is not a wildcard. Fixtures remain NOTIONAL. VALIDATED requires a separately stored reviewed report.
- Recording precedes evaluation; accepted commands and interactions are append-only events; recorded health/status transitions are discrete and replay never overwrites the live cache.

## Decision register

| ID / source | Confirmed fact / ambiguity | Provisional local policy | Open question / conformance impact |
| --- | --- | --- | --- |
| C01 §7 | Intro says probability 1/0, JSON has one I→I rule at 1; golden response is mutual | Preserve JSON and golden response verbatim as parsed data; both directions apply | Confirm prose typo. No fabricated second rule. |
| C02 §8 | Aborted RESUME matches RUN_NOT_HELD and RUN_TERMINAL | Specific RESUME row wins: 409 RUN_NOT_HELD | Which error takes precedence? Edge-case signoff blocked. |
| C03 §8 | Lifecycle matrix omits multiple cells | Proposed complete matrix below; no implementation yet | Approve missing cells and failed-run recovery semantics. |
| C04 §2/8 | Pure operation also needs persisted run/idempotency state | Pure batch resolver behind transactional mission service | Does organiser call an HTTP service, Python function or TS facade? Proposed route is not normative. |
| C05 §6 | Malformed/missing IDs and profile cannot fill required response envelope | Minimal `{error:{code,path,message}}` only when required identity cannot be recovered; normal envelope otherwise | Approve error envelopes, HTTP 400 body, 409 body and code vocabulary. Do not encode this alternative as confirmed v1 response. |
| C06 §4/6 | Request null ban versus nullable response errors | Ban all request nulls; permit response error nulls exactly as typed | Confirm scope if needed; schema follows explicit response shape. |
| C07 §6 | Canonical JSON encoding not named; array permutation outcome invariance is distinct from idempotency | Recursively sort keys; retain request array order for idempotency; normalize numeric lexical variants to finite JSON numeric values; no whitespace | Is RFC 8785 required? Is reordering drone/rule arrays the same command? Numeric and key-order details remain open. |
| C08 §6 | “First error in deterministic document order” not defined | Traverse fields in §4.1 order, then timestamp instant order and supplied array index; unknown fields lexically after known fields at each object | Specify error path syntax (propose JSON Pointer), precedence and duplicate-key errors. |
| C09 §4.2 | Duplicate parsed timestamp keys may be lost by JSON parser | Duplicate-aware parser before schemas; reject duplicate keys with 400 provisional, including repeated identical timestamp strings | Should duplicate parsed timestamps be 422 instead? JSON syntax itself permits ambiguous duplicate members. |
| C10 §4.3 | Class pairs “that can occur” versus eligibility | Require rules for actually eligible opposing pairs across all samples; reject all duplicate ordered class rules; allow unused unique rules | Must rules cover inactive/out-of-area/nonopposing classes too? HOLD/ABORT fields still validate; whether completeness applies is open. |
| C11 §5.3/6 | Zero-health wording versus already REMOVED nonparticipants | Preserve DISABLED/REMOVED nonparticipants; only active participants transition to DISABLED at zero | Confirm terminal preservation. No universal core health/status. |
| C12 §6 | Interaction hash excludes command/run; pipe separators allowed in IDs | Preserve external hash exactly; internal identity uses structured run/command/external hash tuple | Confirm overlapping command semantics; external collisions cannot be fixed by changing the submitted hash. |
| C13 §4/8 | No run ID, repeated START after terminal is blocked | One run per mission for v1 integration; new mission for new run | Is command ID globally unique or mission-scoped? Propose global registry until clarified. |
| C14 §4/8 | Cross-command backward/overlapping sample time, source changes not specified | Accept otherwise valid inputs, record revision and command; latest recorded sequence resolves equal effective time | Approve correction policy, REPLAY import isolation, and whether changing source mode is allowed. Do not add a rejection rule silently. |
| C15 §4.3 | Profile pair immutable, but changing profile across commands not prohibited | Demo keeps a fixed profile; accept different immutable profile identity per command unless lifecycle clarified otherwise | Is a run required to freeze profile identity? No schema-level restriction invented. |
| C16 §5.3 | Discontinuity after absence/RESUME is undefined | Compare with last observed calculated output within same run; first observation false | Compare immediately previous snapshot only, or last seen output? Can source status/class change independently? |
| C17 §4.2/5 | Polygon interior at poles/date line, degenerate rings unspecified | Nonwrapping simple demo rings; future validator uses documented planar lon/lat containment inclusive of edges | Define global interiors/zero-area validity. Do not reject permitted coordinates solely to simplify demo. |
| C18 §5.2/6 | Draw IEEE-754 division and rounding tie rules | Exact integer division to nearest double; separation nearest millimetre, proposed ties-to-even | Confirm tie rounding and draw edge at 1 due to floating conversion. Schema allows rounded double 1; comparison still `< probability`. |
| C19 §4/8 | execute_at may be scheduling or sample lower bound | Synchronous evaluation; execute_at is lower bound only; HOLD is not UI playback pause | Must service wait until wall time? No scheduler built in Phase 0. |
| C20 §4/6 | Rejected envelope FAILED could imply overwriting existing run | Response failure describes command; rejected transaction leaves prior committed run intact | Confirm no state mutation on validation/conflict errors. |
| C21 §4.2 | drone_id printable ASCII; trim rule specified only for mission/command/area IDs | Permit space-only/padded drone IDs within 1–128 printable ASCII; stricter trim for the other three IDs | Was drone ID trim also intended? Initial schema follows literal text. |
| C22 §4.2 | RFC3339 leap-second handling and invalid calendar dates | Pattern plus date-time format checker; application validator must preserve agreed leap-second semantics | Are leap seconds supported? Do not claim regex alone is calendar validation. |
| C23 §4/10 | Potential 100 million samples / 25 million pairs per dense snapshot | Sparse 10k fixture later, measured dense test separately; no lower compatibility limit | Expected runtime/memory/request envelope at maxima? Phase 0 does not implement load handling. |

These refine the plan: profile freezing is a demo choice (C15), not an invented cross-command validation rule; duplicate-key HTTP classification remains open (C09).

## Proposed lifecycle matrix

Idempotency lookup precedes transitions: an already completed identical request returns its stored response even after ABORT. C = explicit requirement, P = provisional missing/conflicting cell.

| Prior state | START | HOLD | RESUME | ABORT |
| --- | --- | --- | --- | --- |
| none | SUCCEEDED/RUNNING (C) | 409 RUN_NOT_STARTED (P) | 409 RUN_NOT_HELD (C) | 409 RUN_NOT_STARTED (P) |
| running | 409 RUN_ALREADY_STARTED (C) | SUCCEEDED/HELD (C) | 409 RUN_NOT_HELD (P) | SUCCEEDED/ABORTED (C) |
| held | 409 RUN_ALREADY_STARTED (P) | SUCCEEDED/HELD (P, no-op command still recorded) | SUCCEEDED/RUNNING (C) | SUCCEEDED/ABORTED (C) |
| aborted | 409 RUN_TERMINAL (C) | 409 RUN_TERMINAL (C) | 409 RUN_NOT_HELD (P, conflicting C02) | 409 RUN_TERMINAL (C) |
| failed | 409 RUN_TERMINAL (P) | 409 RUN_TERMINAL (P) | 409 RUN_TERMINAL (P) | 409 RUN_TERMINAL (P) |

## Schema and fixture scope

`v1.request.schema.json` and `v1.response.schema.json` use JSON Schema 2020-12. All declared objects disallow extra properties. No simulation server, resolver or API is implemented. The schemas deliberately do not pretend to validate closure/self-intersection, duplicate IDs, relational altitude bounds, timestamp ordering, profile governance, rule completeness, array sorting, hashes, draws, result arithmetic, idempotency or run lifecycle. Standard JSON also cannot encode NaN/infinity; a strict parser is still required. Explicit success/error response envelope inconsistencies are only partially structurally constrained.

`fixtures/manifest.json` distinguishes schema-valid, schema-invalid, semantic-invalid and parser-invalid cases; schema-valid does not mean a command is executable in any prior run state. Golden input/output are extracted from §7 without changing values. No expected result for a new interaction has been synthesized by a Phase 0 resolver. `scripts/verify_phase0.py` checks schemas, fixtures and the unchanged source hashes.

## Adapter contract retained

Join request samples and response health rows by timestamp and drone ID: response alone is insufficient. Map source IDs to stable Entity/Track IDs; RED/BLUE map to affiliation only inside the adapter. Preserve MSL reference and original provenance. Store health/class/effects/draws in namespaced simulation detail; missing observation is stale/unobserved, not removal. Assets require an explicit managed-resource manifest, not BLUE membership. Events preserve external interaction ID and command-scoped internal identity. Authoritative world and replay frames are published only after committed recording. No renderer or client lifecycle logic is authorised here.

## Questions to forward when organiser contact is available

Prioritise C02–C05 (lifecycle/error envelope/invocation), C07–C10 (canonical validation/rules), and C13–C16 (run/revision/profile semantics). Then settle global geometry, rounding, leap seconds and performance. These are documented questions, not messages sent to organisers and not blockers to the other Phase 0 prototypes.
