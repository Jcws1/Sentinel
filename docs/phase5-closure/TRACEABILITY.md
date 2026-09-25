# Traceability — requirement → test → current evidence

Evidence columns cite runner steps in [TEST-REPORT](TEST-REPORT.md) on the named
candidate (S1 prerequisites, S2 frontend unit, S3 backend suite, S4 system
corpus, S5 complete browser suite, S6 foreground workflows, M = measurements).
Step labels are not the hard gates G1–G11 of [PLAN](PLAN.md). Backend test
files are in `backend/tests/`; "corpus" is `scripts/simulation_system_corpus.py`,
whose expectations come from the frozen fixtures, the spec §8 table written out
in the corpus and an independent geometry oracle.
Historical Phase 5 results establish behaviour only for their named source.
The separately frozen [assessment results](../assessment/TEST-RESULTS.md) and
[per-file catalogue](../assessment/TEST-CATALOGUE.md) provide current regression
evidence, including the retained test files referenced below.

**Status key:** Pass = passing on **candidate 5**, HEAD `f98de4f` plus
uncommitted changes, digest `27758cb4…e429fff9`, gate 2026-09-24 12:20–13:06
UTC ([TEST-REPORT](TEST-REPORT.md)). Candidate 6 (`bd24e168…744a5b`) was preserved
and verified as the assessment baseline. The current assessment source
(`0207f2e9…154e5`) additionally has application diagnostics and review tests.
It passes 768 backend, 637 frontend, 132 browser and 387 system checks, with
26 native foreground matches. These are current author-run checks; independent
critic round 3 and the formal decision remain pending. The table's original
candidate-5 labels are retained rather than silently reassigned to the new source.

## Phase 5 acceptance bullets (IMPLEMENTATION_PLAN §10)

| Requirement | Tests | Evidence | Status |
| --- | --- | --- | --- |
| Published golden result matches | `test_simulation_resolver.py::test_frozen_golden_exact`; `test_simulation_service.py::test_golden_commits_complete_joined_world_audit_and_original_body`; corpus "golden exact response" | S3, S4, M3 golden | Pass |
| All §10 negative/boundary cases covered | Table below | S3, S4 | Pass |
| Same canonical command returns the stored result without duplicate recording | `test_retry_returns_exact_stored_response_after_abort_and_numeric_variants`; `test_concurrent_duplicates_have_one_committed_outcome`; `test_defensive_scenario.py::test_hold_resume_abort_idempotency_and_conflicts_follow_section_8`; corpus identical-resend and restart-retry cases | S3, S4 | Pass |
| Conflicting content gives 409 | Same retry test (COMMAND_ID_CONFLICT); corpus fixture conflicts; §9 conflict test; `test_profile_immutable_and_nonnotional_claim_requires_external_artifact` | S3, S4 | Pass |
| HOLD/RESUME/ABORT are backend acknowledged | `test_lifecycle_confirmed_and_provisional_matrix`; §9 lifecycle test; browser simulation tests; foreground workload 0 | S3, S4, S5, S6 | Pass |
| Neutral/unknown/out-of-area rows persist | `test_neutral_unknown_outside_and_terminal_rows_preserved`; §9 `test_neutral_unknown_and_out_of_area_rows_are_unchanged` | S3 | Pass |
| Simultaneous outcomes and discontinuities are correct | `test_simultaneous_effects_and_no_effect_records`; §9 `test_simultaneous_effects_do_not_depend_on_pair_processing_order`; `test_discontinuity_compares_last_seen_output_after_absence`; §9 RESUME correction | S3 | Pass |
| No raw external drone schema in core/frontend world state | `test_golden_commits_complete_joined_world_audit_and_original_body` (generic entities, namespaced detail, no assets); `verify_phase0.py` "no universal simulation fields"; browser mapped-mission decode | S1, S3, S5 | Pass |
| Sparse 10,000-drone fixture passes; dense scaling measured separately | Corpus "10,000-drone maximum-size snapshot" (10,000 health rows); `scripts/performance_simulation.py` sparse10000, dense50/100/200 | S4, M3 | Pass |

## Spec §10 required negative tests

Every frozen negative fixture is asserted with its expected error code and
JSON Pointer path, in `test_frozen_invalid_fixtures` and in the corpus;
`test_every_frozen_invalid_fixture_has_a_pinned_error` requires every manifest
negative to be pinned.

| §10 case | Tests | Status |
| --- | --- | --- |
| Malformed JSON | `test_strict_parser` (INVALID_JSON 400); `malformed.request.txt` via corpus | Pass |
| Unknown field | `invalid-unknown-field` fixture (`test_frozen_invalid_fixtures`, corpus) | Pass |
| `LIVE` source | `invalid-live` fixture; §9 `test_no_dispatch_no_managed_assets_and_no_live_source`; browser rejection test | Pass |
| Unclosed or self-intersecting polygon | `unclosed-ring` fixture; `test_polygon_invalidity`; shared vectors (`test_geometry_exact.py`, `exactGeometry.test.ts`); corpus self-intersecting case | Pass |
| Invalid coordinate | `invalid-coordinate` fixture | Pass |
| Duplicate drone ID | `duplicate-drone-id` fixture | Pass |
| Active drone at zero health | `invalid-active-zero` fixture; `test_health_is_finite_positive_integer_for_active` | Pass |
| Missing or duplicate calibration rule | `missing-rule` fixture (MISSING_RULE); corpus duplicate rule | Pass |
| Probability outside [0,1] | `invalid-probability` fixture | Pass |
| Positive health delta | `invalid-positive-delta` fixture | Pass |
| Timestamp before `execute_at` | `before-execute` fixture | Pass |
| Duplicate parsed timestamp | `test_strict_parser` duplicate keys; corpus duplicate timestamp (400 DUPLICATE_KEY, C09) | Pass |
| Command ID conflict | Retry test; corpus; §9 lifecycle test | Pass |
| Invalid lifecycle transition | Lifecycle matrix test (16 cells, spec §8 cells and C02/C03 cells written out, plus a product-table equality test); corpus lifecycle (16 cells, own literal table); §9 after-ABORT cases | Pass |
| Exact-radius pair | `test_exact_radius_and_just_outside_use_unrounded_distance`; §9 EDGE pair (250.0 m); corpus | Pass |
| Just-outside-radius pair | Same test; §9 VERTEX pair (250.001 m); corpus | Pass |
| Polygon-edge point | `test_polygon_and_altitude_boundaries_are_inclusive`; containment vectors; §9 slanted-edge point; corpus | Pass |
| Altitude-band endpoints | Same test; §9 FLOOR/CEIL pairs; corpus minimum/maximum/above-band | Pass |
| Empty snapshot | `empty-snapshot` fixture (corpus, re-identified); empty sample in discontinuity test | Pass |
| 10,000-drone maximum-size snapshot | Corpus; M3 sparse10000 | Pass |

## Spec §8 lifecycle and observable behavior

| Requirement | Tests | Status |
| --- | --- | --- |
| No run + START → SUCCEEDED/RUNNING after validating the entire request | Lifecycle matrix; `test_complete_validation_precedes_any_recording_or_resolution` | Pass |
| Running + HOLD → HELD, no timestamps evaluated | Matrix; §9 HOLD with supplied samples returns `{}` | Pass |
| Held + RESUME → evaluates supplied timestamps, RUNNING | Matrix; §9 RESUME | Pass |
| Running/held + ABORT → ABORTED, recording finalized | Matrix; §9 ABORT; world lifecycle `completed` | Pass |
| Running + START → 409 RUN_ALREADY_STARTED; no run/aborted + RESUME → 409 RUN_NOT_HELD; aborted + mutating → 409 RUN_TERMINAL (C02 precedence for RESUME) | Matrix (literal spec §8 expectations, independent of `policy.py`); corpus lifecycle (own literal table); §9 after-ABORT | Pass |
| Service owns transitions; recording precedes evaluation | `test_prepare_rollback_includes_schema_marker_and_publishes_nothing`; `test_completion_rollback_keeps_prepared_recording_and_exact_retry`; `test_actual_process_death_before_or_after_completion_commit`; corpus hard-kill recovery | Pass |
| Accepted commands and every interaction are append-only events; timestamps become frames | §9 `test_recorded_inspection_retains_ids_draws_transitions_and_order_after_restart` | Pass |
| Replay applies changes discretely and never feeds the live store | **Deferred to Phase 7** (no Timeline replay built); recorded inspection only | Deferred |

## Spec §9 pass criteria

| Criterion | Tests | Status |
| --- | --- | --- |
| Identical results across two clean runs | `test_identical_results_across_two_clean_runs` (second run in separate processes, `PYTHONHASHSEED` 0 and 20260924) | Pass |
| No pair duplicated within a timestamp | `test_no_pair_duplicated_within_a_timestamp`; larger-variant test | Pass |
| Boundary distance and polygon cases inclusive | `test_boundary_distance_polygon_and_band_cases_are_inclusive` (exact-radius pair on a slanted edge, pair on a polygon vertex 200 m apart, band floor and ceiling, 250.001 m exclusion) | Pass |
| Input array order does not affect results | `test_input_array_order_does_not_affect_results`; larger variant | Pass |
| Simultaneous effects independent of pair order | `test_simultaneous_effects_do_not_depend_on_pair_processing_order` (asserts the processing order really reversed) | Pass |
| Neutral/unknown and out-of-area rows unchanged | `test_neutral_unknown_and_out_of_area_rows_are_unchanged` | Pass |
| No real dispatch, no live source | `test_no_dispatch_no_managed_assets_and_no_live_source` | Pass |
| HOLD/RESUME/ABORT, idempotency, conflict per §8 | `test_hold_resume_abort_idempotency_and_conflicts_follow_section_8` | Pass |
| Replay shows the same IDs, draws, transitions and ordering | Recorded-inspection level: `test_recorded_inspection_retains_ids_draws_transitions_and_order_after_restart`; Timeline replay **deferred to Phase 7** | Pass / Deferred |
| UI run | Browser test "spec section 9 defensive sequence" (ABORT confirmation, finalized mission tag in the header at 1440 and 760 px and on the map, per-timestamp health changes, RESUME correction); browser test "spec section 9 editor ABORT asks first" (the dataset's ABORT batch is confirmed like the ABORT control; recorded commands follow the selected run); foreground workload 0 §9 flow | Pass |

## Open items from the closure brief

| Item | Tests / evidence | Status |
| --- | --- | --- |
| P5-GEOMETRY | Shared vectors (three-way; first-violation parity including every order of four holes), differential tests (Python and TS), `test_geometry_history.py`, operator-database scan, `test_externally_valid_exact_geometry_completes_mapped_world_path`, browser R3-1/spike tests, corpus geometry groups, M4/M5 | Pass |
| Complete browser gate | S5 on the final candidate | Pass |
| Independent foreground verification | S6 (lead harness) and the round-3 UI/UX critic with native PID match on the final candidate (round 2: 107/107 on candidate 5) | Pending round-3 UI critic |
| P5-BATCH | M1/M2, M9 timestamp dimension and M3 probes: [current assessment measurements](../assessment/PERFORMANCE-AND-LIMITS.md); historical figures in [PERFORMANCE](PERFORMANCE.md) | Measured; known limitation; formal acceptance pending |
| P5-CONFORMANCE | [COMPATIBILITY-DECISIONS](COMPATIBILITY-DECISIONS.md) sign-off table | Awaiting user sign-off; conformance unclaimed |
| §9 defensive scenario | §9 rows above | Pass |
| R2-3 storage limit | M7 storage probe (9,687 drones persisted); `simulation-client.test.ts` quota and control-refusal regressions | Measured and documented |
| UTF-8 portability | `test_recording_equivalence.py` passes with and without `PYTHONUTF8=1` (probe states the historical cp1252 decoding; no fixture/hash/assertion change) | Pass |
