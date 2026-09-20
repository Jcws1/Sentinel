# Intercept version expectations

Both original failures were reproduced against the preserved Orchestrator tree before editing. `d4.spec.ts` expected a one-item clicked `targetScope` but received an empty array, and expected one active assignment while both nearby targets legitimately produced two. Baseline frontend/backend suites passed 401/391 cases. The D7 instruction explicitly permits correcting these version-specific browser assumptions without changing simulation behavior.

| Boundary | Historical v1 | Current new-run v2 / coverage |
| --- | --- | --- |
| Rule selection | `local-fleet-v1` retained by versioned state/readers | `commands/behaviors.py::initialize` selects `local-fleet-v2`; browser helper explicitly asserts this and the isolated default 700 m model |
| Destination command | Armed legacy click sends intercept approach; scope/behavior outcomes describe selected-area allocation | `app/runtime.ts::directMove` sends ordinary direct movement in v2; `commands/service.py::direct_move` returns `directOrder`, ordered `memberOutcomes` and movement execution IDs. Browser asserts operation, identity/order, exact accepted/skipped codes and empty legacy fields |
| Acquisition | Clicked 250 m scope, excess members reserve | `commands/rts_behavior.py::prepare` acquires eligible nearby targets independently; browser asserts unique interceptor/target IDs and absence of reserve state |
| Unassigned members | Hold as reserves | Continue their ordinary destinations. Browser observes a Running execution and changing position while the other member pursues |
| Later engagement | Explicit reserve deployment | Existing ordinary Move carries an armed, unassigned actor into range; browser checks the exact later pair and published speed/distance-based admission time |
| Stop/loss | Historical disarm and persistent outcome rules | Current Stop accepted/skipped handling remains asserted; two unique outcomes yield four persistent NON-OP entities with unchanged supplied heights, visible in both projections and after recorded reopening |

The staged current fixture moves only its authored second target/destination from about 668 m to about 957 m from the default origin. This keeps it outside the existing 700 m radius through the first engagement; no production acquisition value or speed changes. Its later acquisition assertion allows the ordinary travel time calculated from published distance/cruise speed, plus the existing five-second assertion allowance. It no longer assumes an out-of-range target is acquired immediately. Final outcome timeout remains bounded at the existing 45 seconds.

The dedicated `backend/tests/test_d4.py` deliberately installs `local-fleet-v1` and 250 m. Its assertions, historical contracts and hash guards are unchanged. `test_d4_refinement.py` continues to cover current semantics. No test was skipped, quarantined or reduced to a broad success assertion.

Initial replacement-test failures were test-author mistakes, retained in raw evidence: the live command status says “moving”, while the receipt feedback says “commanded”; and the staged second target requires travel before entering range. Corrected focused browser run passed both full workflows, including loss/recorded inspection, in 54.1 seconds. Final broader results are recorded separately.
