# Requirement-to-test matrix

The frozen specification and fixtures are not modified. C01–C23 in the historical
compatibility register remain either confirmed explicit requirements or local
provisional interpretations. [DECISIONS](DECISIONS.md) records the three supplemental
policies explicitly approved by the user. Organiser questions remain unresolved.

| Requirement / boundary | Reusable evidence | Interpretation |
| --- | --- | --- |
| Exact golden MUTUAL_EFFECT, both ACTIVE/60; repeatability | `test_simulation_resolver.py::test_frozen_golden_exact`; service golden test | Confirmed, unchanged fixture |
| Entire input before evaluation; unknown/null/nonfinite/type/calendar validation | Resolver frozen-invalid/parser tests; service validation-before-recording test | Explicit validation; C08/C09 order/status provisional |
| Duplicate JSON keys, IDs, timestamps and class rules | Parser, frozen-invalid and resolver semantic tests | Duplicate-key HTTP400 is C09 policy |
| Key/numeric canonicalization versus array-order identity | Resolver numeric and order tests; service completed-retry/conflict tests | C07 local canonical encoding, not RFC8785 certification |
| Polygon closure/intersection, inclusive edges/bands/radii, tiny rings | Resolver boundary tests, service tiny-adapter test, frontend integrity tests | C17 planar longitude/latitude; zero-area rejected |
| Exact hashes/draws/location/separation, simultaneous health, NO_EFFECT | Resolver effects/rounding/hash-collision/index-vs-bruteforce tests | Explicit formulas; C18 floating/tie policy |
| Terminal/unchanged rows, empty snapshots, missing/overlapping observations | Resolver and service discontinuity/missing/backward tests | C11/C14/C16 terminal/last-seen policies |
| START/HOLD/RESUME/ABORT and completed retry after later transition | All16 lifecycle cells and completed-retry service tests | Explicit cells separated from C02/C03 missing cells |
| Immutable profiles, truthful evidence | Profile-conflict and reviewed-artifact service tests | C15 permits distinct immutable profile per command |
| Durable received/completed boundaries, rollback-before-publication | Preparation/completion rollback and actual subprocess-death tests | No acknowledgement before required commit |
| Concurrent retries, lost HTTP responses, restart reconciliation | Service concurrent/cancellation/process-death; client exact-pending tests; browser case | One completed result, exact saved body |
| External/interactive ownership, MSL and no BLUE asset inference | Service fence/join tests; foreground default/Sydney40 workflows | Separate missions; disclosed visual datum fallback |
| Historical v5 bytes and v6 additive upgrade | Disposable migration, historical readers and codec suite | No operator DB writer/migration |
| Opaque command IDs and recorded result after ABORT | Query-ID tests, client lookup tests, paged-command service/browser tests | Full identity retained, no URL normalization loss |
| UI selection generations/storage failure/double-submit | `simulation-client.test.ts`; three browser compatibility cases | No stale old-run callback or lost pending identity |
| Sparse10k and bounded dense50/100/200 | `scripts/performance_simulation.py`, synthetic fixture factory | Diagnostic budgets, not dense worst-case certification |
| Existing interactive10v10/20v20, narrow layouts, photos, recovery | Complete final browser suite and actual foreground probes | Existing semantics unchanged; final gate results separate |

Test names and complete machine results are archived with the source inventory.
Passing sparse10k does not certify 25million dense pairs or100million input rows.
The maximum cross-product remains an explicit resource-verification gap, without
silently lowering contract limits or truncating output.
