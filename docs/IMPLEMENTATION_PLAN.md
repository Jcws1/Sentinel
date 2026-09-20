# Sentinel v3 — implementation plan and delivery status

**Bounded follow-up — 20 September 2026: partial D7 performance closure.**
The authorized 60-minute pass removes repeated movement-geometry copies and
unnecessary unrestricted-boundary coordinate work from the shared scheduler.
No recording format, migration, cache, UI, simulation rule or provider change.
Matched default 40-unit/120-action repeated backend validation falls from
4,785.487 to 2,268.648 ms with identical canonical review content. Storage bytes
remain unchanged; display performance and long-duration closure remain open.
The [current verification and independent review](performance-closure/README.md)
govern this follow-up; historical D7 results below remain historical. No later
roadmap phase is authorized by this entry.

**Current delivery — 20 September 2026: D7 integrated acceptance.** The current uncommitted Orchestrator/scenario-location baseline passes 403 frontend tests, 397 backend tests, one complete 117/117 browser run, 43 frozen guards and required static/contract/build checks. D7 corrects ended-recording guidance and version-specific verification without changing simulation rules. Foreground remote 40-unit authoring/recovery and a ten-minute moving 20v20 soak passed. Fresh independent round 2 scores the change **9.0/10** and recommends scoped functional/recovery acceptance. **Performance and unqualified overall acceptance remain withheld:** configured Video pacing is incomplete, frame tails remain uneven and recording growth is substantial. [Delivery and limits](integrated-acceptance/README.md), [version expectations](integrated-acceptance/VERSION-MATRIX.md), [recovery matrix](integrated-acceptance/RECOVERY.md) and [critic](integrated-acceptance/critic-round-2.md) govern this pass. Older stop instructions, panel names and v1 reserve descriptions below are historical. Task services stopped; no commit/push or subsequent roadmap phase was performed. Stop after D7.

**Historical verified delivery — 19 September 2026: D6, rules-based operator decision cards.** Select units, open **Fleet → Suggestions → Review options**, inspect exact affected/unchanged members and exclusions, then explicitly Apply through the existing command owner. Intercept remains the existing 700 m proximity stance; unassigned members keep ordinary movement and no held-reserve queue is added. Keep current orders is a no-op. Sets expire after 15 backend elapsed seconds and revalidate scope/authority/geometry; lost responses retain the exact persisted command identity and proposal audit. **362 backend tests, 365 frontend tests, 43 guards, static/generated/build checks and actual production/configured-provider UI checks pass.** Fresh independent round 2 accepts the corrected final application at **9.2/10**, with no unresolved material/high/critical issue. Package **1.12** adds advisory contracts/optional intent evidence; all existing world/status/receipt/execution/checkpoint/scenario versions and SQLite 4 remain. The latest [D5 Video Feed/overlay baseline](d5/video-overlay/REVIEW.md), restored Fleet/Details and original palette are preserved. [D6 delivery](d6/REVIEW.md), [verification](d6/VERIFICATION.md), [measurements](d6/PERFORMANCE.md) and [independent gate](d6/critic-round2/REVIEW.md) record evidence and limitations. Task services stopped and disposable outputs removed. **Stop after D6 for review; D7 and live LLM integration remain unimplemented.** Earlier dated entries below retain their historical names, versions and stopping points; this delivery and the linked latest decisions govern current behavior.

**Historical D5 refinement — 19 September 2026: cockpit presentation.** The existing simulated cockpit now has distinct dimmed inactive/unavailable states, truthful pose age, compact telemetry/controls and readable provider credits. Configured new cockpits default to Google Photorealistic 3D while explicit choices persist. Ready, Paused, movement Stop, NON-OP, Ended and connection states remain distinct. Real Google/standard rendering, provider retry, recorded inspection, six viewport sizes, production UI and a matched bounded performance comparison passed. A fresh second critic accepts the final source at **9.1/10**, with no unresolved material finding. Fleet/Details, colours, simulation behavior, shared ownership and contracts are unchanged. All owned runtimes stopped and disposable builds/databases removed. [Refinement delivery, evidence and limitations](d5/cockpit-refinement/REVIEW.md) govern these cockpit changes. **Stop after this refinement; D6–D7 remain unimplemented.**

**Historical initial D5 delivery — 19 September 2026: one simulated cockpit.** Select an eligible friendly drone and choose **Simulated cockpit** in Details to open/focus the singleton docked view. It is pinned by default, offers explicit primary-selection following and bounded look/reset, and permanently says **SIMULATED VIEW · no video feed**. Exact mission/run/entity/Track binding, shared bounded motion, supplied supported ellipsoid height, stationary heading and distinct unavailable/stale/disconnected/NON-OP/Ended states remain presentation-only. Configured standard Cesium and Google content, provider recovery, independent cameras, keyboard access and all six requested layouts were operated in the actual UI. The fifth fresh independent critic accepts the final source at **9.14/10**, with no unresolved material/high/critical finding. Verification covers **317 distinct frontend cases**, **336 backend cases**, **26 distinct adjacent browser regressions**, **43 guards**, focused D5 UI suites and required static/generated/build checks. The restored Fleet/Details, Friendly `#7bc8ee`, Settings choices, D4 behavior, package 1.11 and SQLite 4 remain. No new dependency, contract/storage migration, real/video feed or AR was added. [D5 delivery and limitations](d5/REVIEW.md), [decisions](d5/DECISIONS.md), [measured performance](d5/PERFORMANCE.md), [code review](d5/CODE_REVIEW.md) and [final independent review](d5/critic-round5/REVIEW.md) govern this delivery. All task runtimes are stopped and disposable build/database copies removed. **Stop after D5 for user review. D6–D7 remain unimplemented.**

**Preserved baseline — 19 September 2026: requested selective UI revert.** Fleet and Details now use the exact pre-refinement presentation, and map entities use the original affiliation palette, including Friendly `#7bc8ee`. Observed-history controls are removed from Settings; the original Details/map-menu toggle and session-owned 60-second history remain. Other display settings, silhouettes, destination styles and active movement-plan tracers are retained. The D4 behavior baseline, shared renderer/session architecture, contracts and recordings are unchanged. **284 frontend tests, 22 focused browser regressions and required static/generated/build checks pass.** A fresh independent critic passes this bounded revert at **9.3/10**, with seven UI cases and no unresolved material finding. [Current revert evidence](ui-presentation-refinement/partial-revert-2026-09-18/REVIEW.md) and [independent review](ui-presentation-refinement/partial-revert-2026-09-18/critic/REVIEW.md) govern the current presentation. Earlier panel-stability claims describe the superseded redesign. **Stop for user review; D5–D7 remain unimplemented.**

**Historical delivery — 18 September 2026: UI presentation refinement (selectively reverted above).** Compact affiliation-coded Fleet/Details, stable command and telemetry slots, original top-down unit silhouettes and locally persisted map-display settings are implemented. Observed trails and accepted Move/Patrol/pursuit tracers are independent; Conductor previews remain authoring-only. Simulation behavior, versioned profiles, command authority and contract package 1.11 are unchanged. The second fresh independent critic passes at **9.1/10**, with no unresolved material/high/critical finding; 25 visible live-telemetry samples show **0 px panel movement**. Verification includes 336 backend cases, 284 distinct frontend cases across the broad run and documented SDK-timeout recheck, 47 distinct browser regressions, 15 final critic UI cases and required static/generated/build/preservation checks. [Delivery and defaults](ui-presentation-refinement/REVIEW.md), [independent gate](ui-presentation-refinement/critic-round2/REVIEW.md), [code review](ui-presentation-refinement/CODE_REVIEW.md) and [measured performance/limits](ui-presentation-refinement/PERFORMANCE.md) govern this presentation delivery. Earlier dated notes below remain historical. **Stop after this UI refinement for review; cockpit/video/vision cones and D5–D7 remain unimplemented.**

**Historical roadmap activation — 18 September 2026:** the unimplemented M1.3/M1.4 roadmap is replaced by **D1–D7: Authored demo behavior and UI** in [the detailed proposal](DEMO_BEHAVIOR_UI_PLAN.md). Subsequent user requests authorize **D1a, bounded D1b, D2, D3, D3a and D4**. D4 delivers bounded Fleet policies, coordinated local Intercept and persistent simulated outcomes, with Conductor map previews visible only in authoring. **Stop after D4 for review; D5–D7 remain unimplemented.** Preserve completed M1.1/M1.2, Fleet/Details, RTS and compact-demo work. The dated checkpoint notes below describe their original deliveries, not current restrictions. The former operator-declared-only encounter model and prohibitions on bounded scripting, automatic approach and coordination are superseded within this local demo scope. Authority, persistence, recording, recovery and regression obligations remain. [Current D4 evidence](d4/REVIEW.md) records the exact verification and limitations; the [unchanged pre-revision plan](IMPLEMENTATION_PLAN.pre-demo-roadmap-2026-09-17.md) preserves the historical roadmap.

**D4 — Fleet policies and persistent outcomes (18 September, implemented and verified; stop for review):** Fleet selects Hold/Manual, Intercept or named-boundary Patrol. Intercept Apply holds armed; the existing map gesture captures a local 250 m intent area, allocates unique targets and holds excess members as reserves until another operator decision. Versioned toy outcomes commit both losses and all dependent state atomically. Current effective boundaries, manual ordering, Stop/Return and restart disarming remain authoritative. Script intent geometry is authoring-only in both retained maps; recorded actions and normal movement/history remain. [Decisions](d4/CONTRACT_DECISIONS.md), [delivery ledger](d4/REVIEW.md), [code and latency audit](d4/CODE_REVIEW.md) and [operator features](d4/FEATURE_SUMMARY.md) govern this delivery. Package 1.10 coordinates world/stream 1.9, status 1.6, receipt 1.5 and checkpoint 1.6; scenario/review 1.3 and SQLite 4 remain. No new dependency, storage migration, source-specification change or D5 implementation was added.

**D3a — saved missions, Conductor usability and live demo boundaries (18 September, implemented and verified; stop for review):** saved Missions discovery reuses exact-revision Validate/Run; all-entity previews, genuine completion dependencies and atomic batch authoring extend Conductor. Leased run-scoped boundary commands preserve the initial snapshot while changing effective restrictions from each commit. Package **v1.9**, world/stream **1.8**, scenario/review **1.3**, status **1.5**, receipts **1.4**, checkpoint **1.5**; SQLite remains **4**, with no new dependency or structural migration. [Decisions](d3a/CONTRACT_DECISIONS.md), [delivery ledger](d3a/REVIEW.md), [code audit](d3a/CODE_REVIEW.md) and [feature summary](d3a/FEATURE_SUMMARY.md) record verified delivery: **286 backend tests, 254 frontend tests and 108 distinct browser cases** across the broad sweep and corrected affected reruns, including a final **7/7** affected run. Required static/contracts/build checks pass. The [fifth fresh independent gate](d3a/critic-round5/REVIEW.md) passes at **9.10/10**, with all mandatory acceptance accounted for and no unresolved material/high/critical issue. D4 is ready for handoff after separate authorization; stop after D3a for user review.

**D1a — saved Units arrangements and authoritative custom runs (17 September, complete within D1a; stop for user review):** the Units view supports three categories, exact pose editing, explicit friendly observation-only roles, immutable Save/reload, revision conflicts and lost-response reconciliation. Run pins an exact saved revision and reuses ready/acquire/start, live movement and End; quick New demo remains. Current world/stream contracts are **1.5**, separate scenario contracts **1.0**, and SQLite schema **4**; interactive/status **1.3** and command receipts **1.2** remain unchanged. Required checks pass: 224 backend tests, 203 frontend unit tests and 89 distinct browser cases across the broad sweep and corrected affected reruns. Two separate critics operated the UI; final independent review scores **9.00/10**, with all mandatory D1a acceptance satisfied and no unresolved material/high/critical issue. No new application dependency. [Decisions](d1a/CONTRACT_DECISIONS.md), [contract/storage guide](../contracts/sentinel/v1.5/README.md) and [delivery evidence](d1a/REVIEW.md) distinguish verified implementation from later scope. Stop after D1a for review.

**D1b — complete Units authoring and scenario validation (17 September, implemented and reviewed):** targeted Locate, one-map placement ownership/preview/cancellation, explicit-position duplication, keyboard numeric placement, independent Save as new identities and a read-only exact-revision Validate → Run review are implemented. Apply/Discard and reload protection remain; validation errors receive visible focus at narrow layouts. Run reuses authoritative admission and ready/acquire/start. World/stream **1.5**, scenario **1.0**, SQLite **4**, interactive/status **1.3** and receipts **1.2** remain unchanged; additive API/review exports are in contract package **v1.6**. No new dependency or storage migration. Verification: 228 backend tests, 208 frontend units, 94 distinct browser cases across the broad sweep and affected reruns, including a final 43-case affected sweep, plus required static/contracts/build checks. [Decisions](d1b/CONTRACT_DECISIONS.md), [delivery evidence](d1b/REVIEW.md), [feature summary](d1b/FEATURE_SUMMARY.md) and [current API guide](../contracts/sentinel/v1.6/README.md). The [third fresh independent review](d1b/critic-round3/REVIEW.md) passes at **8.98/10**, with all mandatory D1b scenarios satisfied and no unresolved material/high/critical issue. Bounded D1 is ready for D2 handoff after user review; minor narrow-pane scrolling and dense 3D labels remain. Stop after D1b for review.

**D2 — boundary authoring and enforced movement rules (17–18 September, implemented and verified; stop for review):** both-map/numeric boundary authoring, typing, protected edits, copies/recovery, exact-revision review and frozen authoritative all-height restrictions are implemented. Contract package **v1.7**, world/stream **1.6** and boundary scenario/review **1.1**; SQLite **4**, status **1.3** and command receipts **1.2** remain. No dependency or table migration. Verification: **242 backend, 215 frontend and 101 final browser cases pass**, plus required static/contracts/build checks. The third fresh independent review passes at **9.08/10**, all mandatory acceptance satisfied and no unresolved material/high/critical issue. Identical-name overlap choices and mottled fallback 3D fills remain minor limitations. All historical evidence, published contracts and source-specification hashes are preserved. [Decisions](d2/CONTRACT_DECISIONS.md), [delivery evidence](d2/REVIEW.md), [code audit](d2/CODE_REVIEW.md), [feature summary](d2/FEATURE_SUMMARY.md), [independent gate](d2/critic-round3/REVIEW.md), [contract guide](../contracts/sentinel/v1.7/README.md). D2 is ready for D3 handoff after user review and separate authorization; D3–D7 remain unimplemented.

**D3 — Conductor and deterministic scenario execution (18 September, implemented and verified; stop for review):** a dockable Conductor supports bounded timed Move authoring, protected numeric/both-map destination editing, exact saved-revision review and immutable copies/runs. One authoritative 200 ms source writer dispatches friendly/hostile/observation-only motion without granting live control. Fleet Stop/Return and live Move establish per-controlled-drone override, skip future actions and permit only future pending actions after Return. Pause, End, reply-loss reconciliation and restart interruption preserve recorded outcomes. Contract package **v1.8**, world/stream **1.7**, scheduled scenario/review **1.2**, interactive/status **1.4**, receipts **1.3**, checkpoint **1.4**; SQLite stays **4**, with no new dependency or table migration. Verification passes **269 backend, 239 frontend and 104 distinct browser cases** across the broad sweep and corrected reruns, including a final **10-case** affected sweep, plus required static/contracts/build checks. [Decisions](d3/CONTRACT_DECISIONS.md), [delivery ledger](d3/REVIEW.md), [code audit](d3/CODE_REVIEW.md), [feature summary](d3/FEATURE_SUMMARY.md) and [contract guide](../contracts/sentinel/v1.8/README.md) record the delivered scope. The first two independent rounds failed on bounded UI issues that were corrected. The [third fresh independent gate](d3/critic-round3/REVIEW.md) passes at **9.1375/10 → 9.14/10**, with all mandatory D3 acceptance satisfied and no unresolved material/high/critical issue. D3 is ready for D4 handoff after user review and separate authorization. Stop after D3 for review; D4–D7 remain unimplemented.

**Historical implementation checkpoints (through 17 September):**

Status: Phase 3B and M1.1 remain complete within their reviewed scopes. M1.2 movement is complete under the specific 15 September user request; required checks pass and the final independent implementation review scores 9.12/10 after two rounds, with no unresolved material, high or critical finding. Stop for user review after M1.2. M1.3–M1.4 and the retained Phase 5 compatibility work remain deferred. [M1.2 implementation evidence](m1.2/REVIEW.md); [historical M1.1 evidence](m1.1/REVIEW.md).
**Focused UI refinement (15 September, complete):** one shared Views/Fleet sidebar and one docked, selection-following Details pane replace persistent map detail cards. Movement and pinned inspectors share the reserved auxiliary workbench stack; global operational notices remain visible with panels closed. This supersedes the older map-summary and no-Fleet-sidebar presentation rules. Required checks pass, with 82 distinct browser cases verified through the full sweep and corrected provider-suite rerun; final independent review scores **9.04/10 after three rounds**, with no unresolved material/high/critical finding. Backend contracts, authority, recording content and M1.3 scope are unchanged. See [layout decisions](fleet-details/DECISIONS.md) and [refinement review with screenshots and exact verification ledger](fleet-details/REVIEW.md). Stop for user review after this UI refinement; do not begin M1.3.

**RTS map/demo refinement (16 September, complete; stop for user review):** the current user request authorizes the [RTS reference plan](RTS_MAP_AND_DEMO_REFINEMENT_PLAN.md), superseding its documentation-only caveat and the prior stop-after-M1.2 instruction only for this refinement. Direct movement in both maps, per-member unavailable skips, atomic per-drone replacement, automatic available-control acquisition/startup, numbered demos and local camera defaults supersede the older staged movement requirements below. One backend authority and shared frontend runtime remain. Current coordinated contracts are world/stream 1.3, interactive/status 1.2, receipts 1.2 and SQLite schema 3; archived schemas and original recordings remain intact. Required checks pass; the delivered version scores **9.04/10 after two rounds with separate independent critics**, with no unresolved material/high/critical finding. [The RTS review](rts-refinement/REVIEW.md) records actual-provider operation, screenshots, exact verification results and limitations. M1.3 and M1.4 remain deferred.

**Compact demo/Details refinement (17 September, complete; stop for user review):** new local demos use `singapore-local-v2` with a persisted 155 km/h horizontal cruise reference; existing v1 runs retain 20 m/s. This supersedes the earlier single 20 m/s demo profile, full-width routine movement strip, map footer and shell footer. One Fleet sidebar and one selection-following Details pane remain, with local Inter typography, concise telemetry, a modest labelled illustration and expandable published/technical data. Pending, failure and connection attention stays in the compact header. Current world/stream contracts advance to 1.4 and interactive/status to 1.3; archived contracts and recorded bytes remain intact, with SQLite schema 3 retained. Required checks pass: 206 backend, 194 frontend unit and 86 browser cases, static/contract checks and builds. Two separate independent critics operated the actual UI; the final delivered version scores **8.88/10**, with no unresolved material/high/critical issue. This does not implement a physical STING flight model or any M1.3 functionality. [Decisions](compact-demo/DECISIONS.md) and [current implementation review](compact-demo/REVIEW.md) record the scoped changes, comparable before/after screenshots, actual-provider evidence, exact test ledger and optional polish limits. M1.3 and later milestones remain deferred.

Originally reviewed: 10 September 2026. Revised: 17 September 2026.

**Implementation note — 2026-09-15:** record the authorized M1.2 movement workflow, actual delivered module paths, coordinated world/stream 1.2 and interactive 1.1 contracts, preserved SQLite schema 2/legacy recordings, passing checks and independent two-round implementation review. This note does not advance M1.3, M1.4 or remaining Phase 4–9 acceptance.

**Revision note — 2026-09-14:** incorporate the reviewed software-only Fleet, movement and operator-declared notional encounter proposal as M1 in §10. Reconcile command/source authority, run creation, paused-clock expiry, atomic outcomes and UI acceptance with the existing architecture. Retain completed-phase evidence and outstanding Phase 4–9 obligations; keep the external Phase 5 contract separate. Neither source specification is changed. Proposal review scored 8.64 then 9.16/10 after correcting paused-run expiry, accepted-work lease semantics and repeatable run creation; those scores assess the proposal, not implemented software or simulation validity.

**Revision note — 2026-09-13:** reconcile the original proposal with the implemented shell, authoritative recording runtime, Phase 3A/3B and approved map-service, regional, attribution and renderer-retention refinements. Current status and evidence are in §10; retained design sketches are explicitly historical. Neither source specification is changed. [Phase 3B review](phase3b/REVIEW.md).

## 1. Basis and recommendation

**Original planning basis (10 September):** read both source documents completely: `Sentinel_v3.md` (2,115 lines) and `RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md` (525 lines). The former governs product and internal architecture; the latter governs the external simulation boundary. Both source specifications remain byte-for-byte unchanged by the new planning revision; the product-guide integration map is in the [demo proposal §7](DEMO_BEHAVIOR_UI_PLAN.md#7-hackathon-cut-and-integration-with-existing-documents).

The initial 10 September inspection found only the two specifications. The repository now contains a React workbench, FastAPI/Pydantic mission authority, SQLite recordings, generated contracts, both map adapters and regression suites. The later approved regional refinement adapted compatible v2 cartographic assets and styling through the v3 renderer boundary; provenance and setup are in [the regional review](map-refinement/REVIEW.md). Sentinel v2 remains unchanged.

Use a small monorepo with a React/TypeScript/Vite frontend and a Python/FastAPI/Pydantic backend. Keep one backend mission authority and one frontend session runtime. Every view reads a shared presentation frame derived from that authority. MapLibre and Cesium are disposable projections. Implement the simulation boundary on the backend, including its independent resolver, rather than transporting external drone objects into frontend stores.

Use Zustand vanilla stores, direct MapLibre/Cesium APIs, semantic CSS tokens with Tailwind, selected Radix primitives, Lucide and TanStack Table. FlexLayout React 0.10.8 is selected and implemented; its model is the sole docking authority. TanStack Table 8.21.3 supplies the Phase 3B browser. ECharts remains for future analytics (the Phase 0 experiment is isolated). No custom docking engine, Redux, TanStack Query, deck.gl, plugin runtime or generic event bus is needed.

The earlier architectural roadmap retains tabs, splits, basic replay and one operational pop-out as deliverables, even though section 43 of the product specification places some in its optional tier. Tabs/splits and recording foundations are implemented; replay and operational pop-out acceptance remain later work. They are retained obligations, not additional implementation requested by this planning revision.

**Current slice:** D1a, bounded D1b, D2, D3, D3a, D4, its movement/Intercept/unit-profile refinement and this UI presentation refinement are implemented. [Current selective revert](ui-presentation-refinement/partial-revert-2026-09-18/REVIEW.md) records the restored panels/palette, retained display settings and latest verification; [D4 behavior refinement](d4-refinement/REVIEW.md) remains the operational baseline. Stop after this UI refinement for user review. **D5–D7 — cockpit, decision cards and integrated hardening** require subsequent implementation authorization. An actual LLM, advanced swarm behavior and physical vehicle/sensor/effects models remain later work. See [the complete phases](DEMO_BEHAVIOR_UI_PLAN.md).

M1.1/M1.2 and later refinements are implemented, not future scaffolding. The next work extends their actual `backend/app/commands/` and shared frontend runtime boundaries. The old M1.3 single-pair composer is replaced; its atomic outcome and non-operational-state obligations move into D4. M1.4's recovery, recording, UI and workload checks apply throughout and culminate in D7.

The retained Phase 5 is a separate external batch resolver/adapter contract. Its golden `MUTUAL_EFFECT` leaves both drones ACTIVE at health 60; the proposed `demo-mutual-loss-v1` marks participants non-operational solely under a versioned local toy rule. Preserve the external specification, fixtures and unresolved decisions. New interactive behavior is not compatibility or performance conformance evidence.

## 2. Contradictions, gaps, and decisions

### Product and architecture

| Issue | Proposed resolution | Consequence / gate |
| --- | --- | --- |
| “One world” versus isolated replay and multiple windows | One authoritative world lineage; separate immutable live and historical caches. One session presentation cursor selects the frame consumed by all views. Replicas are caches, never competing authorities. | Replay must never overwrite the live cache. |
| Backend owns replay state, but the operator scrubs locally | Backend owns recordings, frames, run lifecycle, and permitted commands. Browser owns playback speed, play/pause, and requested cursor. Distinguish viewing replay from submitting a `REPLAY` simulation command. | Pausing playback does not issue `HOLD`. |
| Track, Entity, and Asset relationship unspecified | Entity is identity; Track is an observation stream associated with that identity; Asset is a managed-resource role. A friendly track is not automatically an owned asset. | Prevent double counting entities that have both roles. |
| Switchable map and simultaneous maps | A map view has a mode; opening another map view creates another view instance sharing the session context. Cameras are per view; selection/time/filters/overlays are session shared. | Switching affects only the initiating pane. |
| MSL/ellipsoid/AGL | Preserve source reference and datum provenance. Convert through an explicit altitude service before Cesium projection. | An unqualified MSL value must not silently become an ellipsoid height. |
| Exact vertical datum absent from external contract | Record `MSL` with unspecified datum. Use a named, disclosed demo geoid assumption for visual conversion; retain original values. | Approval-stage data decision; unknown conversion is visibly approximate, not terrain clearance evidence. |
| Prediction, assignments, sensors, confidence and coverage have no simulation inputs | Load explicitly authored scenario metadata where appropriate; otherwise show unknown/unavailable. | Do not infer tasking, sensor confidence, readiness, or predictions from proximity/team/health. |
| Meaning of Vertical Profile horizontal axis | Use radial horizontal distance from an explicit fixed mission reference point or operator-selected reference entity, with altitude on the vertical axis. | Label origin, units, reference time and altitude datum. This is not a terrain cross-section. |
| Stream ordering, reconnect, deletes, and errors unspecified | Versioned atomic snapshots/deltas with stream epoch, sequence, mission identity, and resnapshot on gaps. | Never merge updates from different missions or historical seek requests. |
| “What Sentinel believed” versus late corrections | Record effective time and recorded time plus monotonic sequence. Hackathon replay follows committed frames and makes correction events visible. | Full bitemporal queries deferred; overlapping historical corrections need deterministic precedence. |
| Performance “modest” versus contract maxima | Separate interactive demo budget from compatibility load tests. | A valid 10,000-drone snapshot can yield 25 million opposing pairs; spatial indexing cannot reduce genuinely dense output. |
| Map/imagery/terrain/building sources unspecified | Configured providers with attribution and a tested failure fallback. Primary urban demo plus Mojave and tropical smoke fixtures. | Accounts, coverage, licenses, network access and vertical data must be checked early. |
| Scheduling semantics of `execute_at` unspecified | Treat as earliest allowed sample time; evaluate submitted batches synchronously under the published operation. | Do not create a wall-clock scenario scheduler by implication. |
| Delivery time, team capacity, target hardware unspecified | Use ordered, acceptance-gated phases rather than invented date estimates. | Adopt provisional UI performance budgets below and validate on the demo laptop. |
| Fleet membership, friendly affiliation and command authority differ | Fleet is a browser mode over explicitly managed Entity/Asset roles. A separate backend grant binds each commandable Asset to an executor and control telemetry Track/source. | The displayed-track selector and affiliation never choose a command destination or establish permission. |
| Interactive movement versus external simulation lifecycle | M1 owns explicit movement/encounter intents and its interactive run controls; Phase 5 retains the submitted batch and lifecycle contract. | No repeated START or hidden HOLD/RESUME loop to impersonate a streaming movement API. Initial integrations use separate missions/runs and one writer per mission. |
| Mutual effect versus non-operational outcome | Preserve the external golden result; D4 proposes a separate versioned toy approach/proximity rule with explicit policy intent. | Deliberately supersedes operator-declared-only pair loss. No probability, physical-effect, sensor or intercept-fidelity claim. |
| Paused effective time versus command expiry | Move/Encounter use reviewed running-frame expiry; lifecycle, control and cancellation use fresh backend-issued intent evidence independent of the paused frame's age. | Start/Resume/Cancel/End must remain usable after a long pause; delayed obsolete requests still reject. |
| Lost browser lease versus accepted execution | Current lease gates new admission. Expiry alone does not revoke an already accepted execution; explicit cancellation/revocation, run state, epoch and applicable deadlines remain authoritative. | Navigation, pane disposal or a lost socket cannot silently cancel accepted work. |

### Submitted simulation contract: preserve text, document interpretation

1. **Fixture prose conflict (§7):** introduction says probabilities 1 and 0; JSON contains one I→I rule with probability 1, and the explanation/golden response show mutual effects. Use the JSON and golden response as the fixture; record the prose inconsistency.
2. **Lifecycle conflict (§8):** aborted `RESUME` is specified as both `RUN_NOT_HELD` and `RUN_TERMINAL`. Propose the more specific `RESUME` row taking precedence, but obtain organiser clarification before claiming exact edge-case conformance. Keep the policy isolated and tested.
3. **Missing transitions:** no-run `HOLD`/`ABORT`, held `START`/`HOLD`, and failed-run transitions lack a complete matrix. Propose 409 for unspecified transitions with a documented provisional code; do not describe those codes as submitted requirements.
4. **Pure function versus stateful service:** the resolver can be pure for a validated batch; lifecycle, idempotency, immutable profiles and recording require a stateful application service. Separate them.
5. **Error envelope cannot always be constructed:** missing/invalid mission ID, command ID or calibration identity makes the required response fields unavailable. Generic null rejection refers to requests; success responses explicitly require null error fields. Propose a separate minimal error envelope when identifiers cannot be recovered, pending clarification; preserve the specified envelope whenever possible. FastAPI's default 422 payload is not contract compatible.
6. **Canonicalisation/first-error order:** only object-key canonicalisation is explicit; input array permutation must leave domain outcomes unchanged, but need not be an identical idempotency payload. Define recursive key ordering, finite number encoding, and prescribed field traversal; sort timestamp keys and inspect arrays in supplied order for validation. Reject duplicate JSON keys before ordinary parsing discards them. Clarify numeric canonicalisation and error-code vocabulary with organisers.
7. **Calibration completeness:** “ordered class pair that can occur” may mean all input classes or only eligible opposing pairs. Proposed interpretation is all actually eligible pairs across the whole request; reject duplicate rules even if unused and allow unused unique rules. Clarify before freezing tests. Validate all supplied fields even on `HOLD`/`ABORT`; evaluate no outcomes for those commands.
8. **Terminal state wording:** §5.3's zero-health rule could turn an already `REMOVED` drone into `DISABLED`; response text also requires unchanged rows for nonparticipants. Preserve input `DISABLED`/`REMOVED` for nonparticipants; apply ACTIVE→DISABLED only to participating active drones reaching zero.
9. **Interaction identity:** external interaction hash excludes command ID, so later commands can collide at the same timestamp/pair. Preserve that external hash; internal event identity also includes run and command. Do not deduplicate solely on the external hash. Delimiter characters are permitted in IDs, so never reuse the specified pipe-joined hashing format for internal compound keys; retain it exactly for external results.
10. **Cross-command time/source/profile rules:** overlaps, backward timestamps, discontinuity after disappearance, source-mode changes and run identity are not fully defined. Propose one run per mission for v1, stable profile identity during that run, last observed output as discontinuity comparison, and revisioned frames for overlaps; seek uses recorded sequence as tie-breaker. Keep these as open compatibility decisions, not extra undocumented validation restrictions.
11. **Global geometry:** polygon interior across the antimeridian/poles and rounding ties are unspecified. Propose documented planar lon/lat polygon containment with inclusive boundary and the exact specified spherical distance for resolution; use non-wrapping synthetic demo areas. Do not substitute Cesium's distance calculations or a different geodesic. Clarify global edge cases rather than silently rejecting otherwise allowed coordinates.
12. **Scale:** 10,000 timestamps × 10,000 drones permits 100 million samples before results. Set interactive demo sizes, but do not invent a lower compatibility maximum. Use a sparse maximum-size fixture and separately measure dense-output limits; full worst-case completion is not established by a sparse test.

These gaps need a small compatibility decision record/organiser clarification, not edits to either specification. Core shell and domain work can proceed after architecture approval while the external edge cases are resolved.

## 3. Repository boundaries and original layout sketch

The tree below is the original architectural sketch, not a scaffold checklist. Actual wire authority is `backend/app/domain/models.py` plus `world/contracts.py`; storage is `recording/sqlite_repository.py`. Layout belongs to `features/workspace/workspaceBridge.ts` and FlexLayout, not a second Zustand layout store. Phase 3B adds `recording/history.py`, `missions/observation_fixture.py`, `world/{entityRows,observedHistory,observedSegments}.ts` and `features/entities/*`. Commands are implemented under `backend/app/commands/`. D1a adds `backend/app/scenarios/{contracts,service}.py`, `api/scenarios.py`, frontend `services/scenarioClient.ts`, `contracts/scenarios.ts`, `world/scenarioDraft.ts` and `features/units/*`. D1b adds `scenarios/review.py`, `features/units/PlacementForm.tsx` and extends those existing owners. D2 adds pure `scenarios/{geometry,boundaries,legacy}.py`, `commands/zone_rules.py`, frontend `world/boundaryGeometry.ts`, Units boundary controls and bounded renderer label layout; it extends the same scenario, command, runtime and renderer owners. Later behavior modules remain proposed. Replay and analytics remain later work. M1's proposed modules and contract migration are listed in §10 rather than represented as existing files in this historical tree.

```text
frontend/
  package.json, package-lock.json, tsconfig.json, vite.config.ts
  index.html, popout.html
  src/
    main.tsx
    app/ App.tsx, runtime.ts, shell/{Shell,ActivityBar,StatusBar}.tsx
    domain/ model.ts, refs.ts, units.ts
    contracts/ generated.ts, decode.ts
    state/ worldStore.ts, sessionStore.ts, workspaceStore.ts
    world/ selectors.ts, presentation.ts, historyCache.ts
    services/ api.ts, worldStream.ts, commandClient.ts, replayClient.ts
    renderers/
      contracts.ts, scene.ts, symbology.ts, camera.ts, altitude.ts
      providers.ts
      maplibre/ MapLibreAdapter.ts, layers.ts
      cesium/ CesiumAdapter.ts, objects.ts
    features/
      workspace/ WorkspaceHost.tsx, viewRegistry.ts, docking.ts
                 flexLayoutBridge.tsx, windowContext.ts
      map/ MapView.tsx, MapModeSwitch.tsx, MapToolbar.tsx
      entity-detail/ EntitySummary.tsx, EntityInspector.tsx
      entity-browser/ EntityTable.tsx
      command-picture/ CommandPicture.tsx, selectors.ts
      vertical-profile/ VerticalProfile.tsx, projection.ts
      timeline/ Timeline.tsx, PlaybackControls.tsx
    modules/counter-uas/ metadata.ts, SimulationControls.tsx,
                         SimulationEventDetails.tsx
    components/ shared/
    styles/ tokens.css, global.css, workspace.css
  tests/ unit/, integration/, e2e/
backend/
  pyproject.toml
  app/
    main.py
    api/ missions.py, stream.py, replay.py, simulation_v1.py
    domain/ models.py, events.py
    missions/ service.py, commands.py
    world/ projector.py, distribution.py
    recording/ repository.py, sqlite_repository.py
    replay/ service.py
    adapters/simulation_v1/ mapping.py, identities.py
    simulation/ schemas.py, parsing.py, validation.py, resolver.py,
                geometry.py, lifecycle.py, canonical.py, service.py
  tests/ domain/, compatibility/, integration/
contracts/
  sentinel/ openapi.json, stream.schema.json
  simulation/ v1.request.schema.json, v1.response.schema.json,
              compatibility-decisions.md, fixtures/
docs/
  Sentinel_v3.md                       # unchanged
  RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md  # unchanged
  IMPLEMENTATION_PLAN.md
  demo-runbook.md                      # later
scripts/ export_contracts.py
```

Keep modules as a few files until complexity warrants folders. Standard npm plus a Python virtual environment is sufficient. Backend Pydantic models export OpenAPI and explicit JSON Schemas; the established `json-schema-to-typescript` generator creates frontend types, and Ajv plus semantic guards validate ingress. Export and generation checks detect drift. Observed history has its own v1 schema. External simulation contracts remain separate. JSON Schema alone cannot enforce polygon validity, lifecycle or cross-sample rules.

The domain types below describe the proposed generated data shape, not a second handwritten copy of Python API types. Frontend-only session/workspace types remain handwritten. Runtime decoding is separate from TypeScript typing; use generated JSON Schema with Ajv at ingress if needed, with reducers also checking identity/order invariants.

Import direction: features → selectors/session actions → domain/contracts. Renderers → scene contracts only. Simulation code stays in backend simulation/adapter and typed counter-UAS presentation metadata. Domain has no imports from React, Zustand, map engines, docking libraries, or external simulation DTOs.

## 4. Original domain sketch and authoritative contracts

**Historical design sketch:** the following types explain the original model, but are not the implemented wire contract. Use [current contract notes](../contracts/sentinel/v1.4/README.md), backend Pydantic models and `frontend/src/contracts/generated.ts` for exact fields/enums/validation. Do not reintroduce handwritten duplicate domain DTOs or the illustrative dock tree below. Session filters/selection/time remain frontend-owned; FlexLayout owns layout.

Omission means unknown/not supplied; zero is a known measurement. Internal IDs are opaque and backend allocated, with stable source mappings. UTC strings use millisecond precision on the wire; epoch milliseconds are derived for charts. Generic domain classifications are namespaced strings, not external drone-class enums.

```ts
type Id = string;
type UtcInstant = string;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Extensions = Record<string, Json>; // namespaced, validated by owning module
type Affiliation = 'friendly' | 'hostile' | 'neutral' | 'unknown';

interface Altitude {
  metres: number;
  reference: 'MSL' | 'ELLIPSOID' | 'AGL';
  datumId?: string; // absence means unspecified; never silently WGS84/geoid
}
interface Position3D {
  longitudeDeg: number;
  latitudeDeg: number;
  altitude: Altitude;
}
interface SourceRef {
  id: Id;
  kind: 'simulation' | 'sensor' | 'manual' | 'import';
  mode: 'simulated' | 'live' | 'replay';
  externalId?: string;
  recordingId?: Id;
}
interface Provenance {
  source: SourceRef;
  effectiveAt: UtcInstant;
  recordedAt: UtcInstant;
}
interface Mission {
  id: Id;
  name: string;
  domain: string; // e.g. counter-uas; not a platform enum
  lifecycle: 'draft' | 'active' | 'completed' | 'cancelled';
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
  zoneIds: Id[];
  referencePoint?: Position3D;
  extensions: Extensions;
}
interface Entity {
  id: Id;
  missionId: Id;
  label: string;
  kind: string; // physical-object, incident, facility, etc.
  classification?: { scheme: string; code: string; label?: string };
  affiliation: Affiliation;
  condition: 'operational' | 'degraded' | 'non-operational' | 'unknown';
  presence: 'present' | 'unobserved' | 'removed';
  provenance: Provenance;
  extensions: Extensions;
}
interface TrackSample {
  timestamp: UtcInstant;
  position: Position3D;
  velocity?: { speedMps: number; headingTrueDeg: number; verticalSpeedMps?: number };
  confidence?: number; // [0,1], only if supplied with provenance
  discontinuity: boolean;
}
interface Track {
  id: Id;
  missionId: Id;
  entityId: Id;
  source: SourceRef;
  state: 'tracking' | 'stale' | 'ended';
  latest: TrackSample;
  historySeriesId: Id;
  predictedSeriesId?: Id;
}
interface Asset {
  id: Id;
  missionId: Id;
  entityId: Id;
  availability: 'available' | 'assigned' | 'unavailable' | 'unknown';
  capabilityCodes: string[];
  taskIds: Id[];
  provenance: Provenance;
}
interface Sensor {
  id: Id;
  missionId: Id;
  entityId?: Id;
  modality: string;
  coverageZoneIds: Id[];
  status: 'available' | 'unavailable' | 'unknown';
  provenance: Provenance;
}
type LonLat = [longitudeDeg: number, latitudeDeg: number];
interface Zone {
  id: Id;
  missionId: Id;
  label: string;
  purpose: string; // simulation-area, restricted, defended, search-area...
  geometry: { type: 'Polygon'; coordinates: LonLat[][] };
  altitudeBand?: { lower: Altitude; upper: Altitude };
  validFrom?: UtcInstant;
  validUntil?: UtcInstant;
  provenance: Provenance;
}
interface Task {
  id: Id;
  missionId: Id;
  type: string;
  status: 'proposed' | 'accepted' | 'active' | 'completed' | 'cancelled';
  assetIds: Id[];
  subjectEntityIds: Id[];
  zoneIds: Id[];
  provenance: Provenance;
}
interface SentinelEvent {
  id: Id;
  missionId: Id;
  sequence: number;
  effectiveAt: UtcInstant;
  recordedAt: UtcInstant;
  type: string; // namespaced; simulation.interaction is module-owned
  severity: 'info' | 'warning' | 'critical';
  entityIds: Id[];
  zoneIds: Id[];
  taskIds: Id[];
  location?: Position3D;
  source: SourceRef;
  detailRef?: Id; // raw audit details fetched on demand
  extensions: Extensions;
}
interface WorldFrame {
  mission: Mission;
  frameId: Id;
  streamEpoch: Id;
  sequence: number;
  effectiveAt: UtcInstant;
  entities: Record<Id, Entity>;
  tracks: Record<Id, Track>;
  assets: Record<Id, Asset>;
  sensors: Record<Id, Sensor>;
  zones: Record<Id, Zone>;
  tasks: Record<Id, Task>;
  recentEvents: SentinelEvent[]; // bounded; event API holds full history
}
```

No duplicate mutable position on Asset or Entity. The implemented displayed-track selector restricts sources, prefers non-ended tracks, then newest observation and stable Track ID; this is deterministic presentation choice, not sensor fusion. Fusion remains deferred. Static entities can have a manually sourced Track. A generic Entity may exist without position and remains available in tables/details without an invented map point. Bounded observed history is source-attributed and read separately from the hot world dictionary; prediction series remain deferred.

`Track.state` describes observation quality, `Entity.condition` physical/functional condition, `Entity.presence` observed presence, and `Asset.availability` resource availability. These concepts must not collapse into one overloaded status. A disabled but observed vehicle can still have an observed track. A removed entity remains inspectable in recording history.

**M1 addition, not implemented:** add explicit Asset control/source bindings and capabilities, correlated command/execution records and typed interactive-run/encounter details. Keep these outside the historical type sketch. Backend models, generated schemas and runtime validators must evolve together; an Asset's availability or friendly affiliation alone is never authorization. A single Entity may have role records, but the Fleet row and group member represent that Entity once; ambiguous control bindings must be resolved explicitly, not arbitrated by the display selector. Current `SelectionState.items` does not establish implemented multi-selection: current picking replaces the primary selection. Group actions, all-member highlighting and condition filtering are new M1 work.

```ts
type ObjectRef = { kind: 'entity' | 'track' | 'asset' | 'zone' | 'event' | 'task'; id: Id };
interface SelectionState {
  missionId: Id;
  items: ObjectRef[];
  primary?: ObjectRef;
  revision: number;
}
type TimeState =
  | { mode: 'live'; followLatest: true }
  | { mode: 'replay'; recordingId: Id; requestedAt: UtcInstant;
      resolvedFrameId?: Id; resolvedAt?: UtcInstant;
      seekGeneration: number; playing: boolean; rate: number };
interface FilterState {
  affiliations: Affiliation[];
  classificationCodes: string[];
  sourceIds: Id[];
  zoneIds: Id[];
  showUnobserved: boolean;
  showRemoved: boolean;
}
interface OverlayState {
  zones: boolean;
  history: boolean;
  predictions: boolean;
  assignments: boolean;
  eventMarkers: boolean;
  historyWindowSeconds: number;
}
interface SessionState {
  id: Id;
  missionId?: Id;
  selection?: SelectionState;
  time: TimeState;
  filters: FilterState;
  overlays: OverlayState;
}
interface CameraIntent {
  focus: Position3D;
  groundSpanM: number;
  headingTrueDeg: number;
  focusEntityId?: Id;
}
type ViewDescriptor =
  | { id: Id; type: 'map'; mode: 'tactical' | '3d'; camera?: CameraIntent }
  | { id: Id; type: 'entity-detail'; entityId: Id }
  | { id: Id; type: 'command-picture' | 'timeline' | 'entity-browser' }
  | { id: Id; type: 'vertical-profile'; originEntityId?: Id };
interface WorkspaceState {
  schemaVersion: 1;
  sessionId: Id;
  activeModule: string;
  activeViewId?: Id;
  views: Record<Id, ViewDescriptor>;
  layout: { engine: 'flexlayout' | 'golden-layout'; version: string; config: Json };
  popouts: Record<Id, { viewId: Id; status: 'opening' | 'open' | 'closed' }>;
}
```

Workspace types are a minimal view registry plus an isolated library layout payload, not another competing layout tree. Docking runtime objects remain outside serializable stores. Selection resolves Track/Asset references to the same Entity for highlighting. An inspector pins entity identity; selection may subsequently change without repurposing its tab. Missing or filtered selections are reported, not silently cleared. A mission switch atomically resets mission-scoped selection, playback, cached frames and old subscriptions; implemented pinned inspectors retain their old identity and show explicit inactive-mission/unavailable context. In M1, switching also discards unsubmitted drafts and stops renewal of the old mission's control lease, but does not cancel accepted backend execution.

Typed counter-UAS metadata lives in `modules/counter-uas`, with backend equivalents owned by the adapter: e.g. namespace `sentinel.simulation.v1` holds class, reported health/status, run ID and audit reference. Core treats it as an opaque extension. Health is neither a universal field nor a readiness formula.

## 5. Exact adapter responsibility

This section governs the **external Phase 5 compatibility adapter**, not M1's interactive executor. Preserve the submitted batch semantics, MSL inputs, profiles and golden results. M1's operator-declared encounter rule does not reuse external health math or redefine `MUTUAL_EFFECT` as loss. Any later bridge needs an explicit source/run coordinator and reviewed sample, altitude and continuation semantics before the external resolver can feed an interactive run.

### Processing path

`external JSON → strict compatibility validation → mission/run service → pure resolver → persisted external response + audit → Sentinel adapter → atomic world frames/events → REST/WS → shared selectors → views`.

The compatibility endpoint accepts and returns the submitted shape unchanged. The normal Sentinel world endpoints expose only internal models. Store original request plus canonical digest, response, command acknowledgement, calibration content/identity and resolved output before publishing. Use SQLite transactions for the hackathon, with one authoritative backend process and serialized per-mission command processing. Never announce success over the stream before recording commits. On retry, return the stored response without duplicating events or frames. A rejected command must not change an existing healthy run to failed merely because the error response says `FAILED`.

### Mapping table

| External input/output | Internal projection |
| --- | --- |
| `mission_id` | Stable mission lookup; preserve external ID in source mapping. Do not derive run lifecycle from Mission.lifecycle. |
| `command_id`, action, issued/execute times | Stored command audit; accepted command event with both times; module run projection and pending/acknowledged UI. |
| `SIMULATED` / `REPLAY` | Source mode `simulated` / `replay`; replay-source imports remain separate from current live operational state. Viewing a recording does not rewrite its original source provenance. |
| `drone_id` | Stable entity and track mapping keyed by structured `(mission, source, external drone ID)`. Preserve label and raw ID; no parsing team from ID text. |
| `team` | RED→hostile, BLUE→friendly, NEUTRAL→neutral, UNKNOWN→unknown, within this adapter only. |
| `class` | Classification `{scheme: 'simulation-v1.drone-class', code: input.class}` and typed module detail. Never use it as a core Entity kind. |
| longitude/latitude/altitude | TrackSample Position3D, WGS84 degrees and `{metres: altitude_m, reference: 'MSL'}`. No conversion of stored source altitude. |
| Input timestamp | Sample/event effective time; ingestion time is separately recorded. Sort by parsed UTC instant. |
| `health`, output `health_after` | Module simulation metadata. Use resolver output after the timestamp, not repeated frontend arithmetic. |
| ACTIVE / DISABLED / REMOVED | Operational / non-operational condition and present / removed presence as appropriate. Observed ACTIVE does not imply asset availability. Missing from a snapshot means unobserved/stale, never removed or zero health. |
| `area` | Zone with purpose `simulation-area`, exact polygon and inclusive MSL band. Do not automatically label it defended or sensor coverage. |
| `resolution` | Backend simulation configuration/audit only. No renderer-side eligibility computation. |
| Calibration/profile/evidence | Immutable simulation audit plus module inspector label. Keep evidence status visible in simulation details; no generic confidence score conversion. |
| `interactions` | One generic namespaced event per interaction, including NO_EFFECT. Entity references replace red/blue fields in the core envelope. Fetch original outcome/effects/draws from typed detail. |
| `interaction_id` | Preserve exact external ID in detail; allocate internal event identity from run/command/external ID tuple. |
| `location_id` | Opaque simulation bin in detail, never a coordinate or zone/entity identity. Optional event point uses the input pair midpoint and remains explicitly derived. |
| `drone_health` | Join against original samples by ID; include every input drone, including out-of-area and unchanged rows. Responses alone lack position/class/team and cannot reconstruct the world. |
| `state_discontinuity` | Correction event and sample break; accept the caller's next supplied snapshot, do not carry prior output health forward silently. |
| `run_status` | Module state running/held/aborted/failed; ABORT finalizes the recording without asserting the whole Mission is cancelled. |

Assets, sensor zones and tasks come from a separate explicit scenario manifest or backend domain data. BLUE drones only become Asset roles when that manifest identifies them as managed resources. This preserves a usable fleet view without pretending the external contract supplies ownership or assignments.

Build each timestamp frame by joining validated input and output; write all simultaneous changes atomically. Store pre-resolution samples in audit and expose the post-resolution frame at the exact timestamp. Retain discontinuities as boundaries. An absent observation can retain its last-known position with a stale indication, but normal present-track counts exclude it. No interpolation through missing/removed/discontinuous periods. `HOLD`/`ABORT` generate command records and lifecycle state updates, no supplied-sample outcomes or invented motion. `RESUME` uses supplied health values. Pure resolution and external hashing, probability, grid and health math stay entirely in simulation service code.

## 6. State, transport and replay boundaries

| Boundary | Owner and contents | Update rule |
| --- | --- | --- |
| Authority | Backend Mission, role records, run state, command journal, events, recordings | Validated commands/source ingestion only; commit then distribute. |
| Client operational cache | `worldStore`: latest live frame, connection metadata; bounded historical cache | Only decoded backend snapshots/deltas and replay responses write here. |
| Client session | `sessionStore`: mission context, selection, time cursor, filters, overlays | Explicit user actions; replay seek never writes to live frame. |
| Shared action runtime (implemented; extended by D1–D7) | One session-owned command draft, pending request identities and reconciliation; authority credentials remain private runtime/session data | UI drafts cannot alter world state. Receipts give request feedback; committed frame projections supply execution/outcome state. No per-pane command owner or lease-renewal timer. |
| Workspace/UI | WorkspaceBridge plus FlexLayout: view registry, active module, dock layout, ephemeral labels and renderer pool | FlexLayout is the only layout authority; renderer resources never enter serialized operational state. |
| Renderer runtime | Adapter instances, GPU objects, camera handles, hover hit results | Local disposable handles; emit intents, never mutate world. |

Implemented REST: `GET /api/missions`, `GET /api/missions/{id}/world`, `GET /api/missions/{id}/events?after=...`, `GET /api/recordings/{id}` and `GET /api/missions/{id}/observed-history?entityId=...&frameId=...&windowSeconds=60`. The last endpoint returns bounded observed samples anchored to an immutable committed frame, not replay playback. The opt-in `POST /api/fixtures/{id}/advance` is a deterministic test interface, not a simulation run or movement command. Interactive creation, lifecycle, direct/reviewed movement, receipt/status and execution reads are implemented in `api/interactive.py`. D1a adds `/api/scenarios` definition/revision/receipt reads and writes plus exact-revision input to the existing run creation endpoint; [contract details](../contracts/sentinel/v1.5/README.md). D1b adds read-only `POST /api/scenarios/validate` for exact-revision review; see [package v1.6](../contracts/sentinel/v1.6/README.md). D2 extends those same scenario/world shapes with immutable boundaries and rule metadata in [package v1.7](../contracts/sentinel/v1.7/README.md); it adds no second creation/command endpoint owner. Policy, scheduled action, assignment and outcome contracts remain proposed in later phases. Frame-at-time lookup, general replay series and `POST /api/compat/simulation/v1/resolve` remain later proposals. The frontend requests actions but does not implement simulation lifecycle rules.

WebSocket `GET /api/missions/{id}/stream` always starts with a complete atomic snapshot, then typed atomic deltas carrying mission, epoch, sequence and predecessor identity. Snapshot capture and queued subscription registration share the mission lock. Bounded queues request resynchronization on overflow; every reconnect resnapshots. There is no resumable backlog. Heartbeats report the last sequence actually sent on that socket. Cache removal remains distinct from Entity.presence=removed; use the generated stream schema for exact fields.

One WebSocket per session runtime, not per pane. Ignore duplicate sequence numbers; an epoch change or sequence gap triggers resnapshot. Display stale/disconnected status and inhibit new Move/Encounter admission until a current verified frame and source are available. Control/lifecycle/cancellation require fresh authoritative intent evidence rather than trusting an old displayed frame. An unknown command outcome is reconciled using the same command ID, not a new request that might repeat effects. On mission change, abort obsolete client reads, discard drafts and guard callbacks by generation; cancelling an HTTP wait is not cancelling an accepted backend command. Tag replay seeks with generations to discard slow obsolete responses.

The shared runtime presentation is the only view-facing world read path. Live and historical frame caches remain separate. Future replay must retain the last complete frame during seeking, continue live ingestion separately and provide Return to live; seeking/playback is not implemented. Phase 3B adds one selected-entity history owner and eight immutable cached results shared across panes. At most one read is in flight; newer frames coalesce. An older compatible result is displayed only with its actual through-time, trimmed to the current window and never beyond presented time. Identity/epoch changes cancel obsolete work.

M1 preserves that presentation boundary: a newer HTTP execution result cannot silently overwrite conditions or positions in an older presented frame. It can report receipt or “awaiting world sync”; frame-keyed projections and frame-anchored detail reads supply operational state. Group selection retains the one primary-entity history owner. Run/command journal events recorded while paused may share effective time but have distinct recorded time/sequence; playback must retain their order. UTC+8 wall time, source simulation time, report-receipt age and replay cursor are separate clocks.

Initially use discrete frame playback for correctness. Later position interpolation may operate in the shared presentation layer using bracketed samples and a common clock; condition, presence, health, events, classifications and assignments always change discretely. No renderer's clock may advance mission time. Do not synthesize predictions from future replay data. Persist initial world state, role metadata, subsequent frames and event references so replay reconstructs more than drone positions. SQLite indexed checkpoints/frames are sufficient; no Kafka or event-sourcing framework.

## 7. Renderer adapters and continuity

The interface sketch below expresses the boundary, not the exact implemented renderer API. Group/destination picking and requested-target projection are implemented; D2 adds typed boundary/edit projections and D3 adds shared scripted destinations/straight intent lines. D4 condition, assignment and outcome projections remain proposed; no command execution or canonical state enters either renderer.

```text
backend → cache → presentation frame + session filters/overlays
                             ↓
                 shared scene/symbology selectors
                    ↙                    ↘
             MapLibreAdapter        CesiumAdapter
                    ↘                    ↙
                  pick/camera intents → session/view actions
```

```ts
interface RendererAdapter {
  mount(host: HTMLElement, emit: (intent: RendererIntent) => void): Promise<void>;
  apply(scene: SceneProjection): void;
  captureCamera(): CameraIntent;
  restoreCamera(intent: CameraIntent): void;
  resize(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
type RendererIntent =
  | { type: 'select'; target?: ObjectRef; additive: boolean }
  | { type: 'camera'; camera: CameraIntent };
// SceneProjection: immutable frame key, display objects with stable refs,
// positions, resolved altitude quality, symbols, paths, zones and relationships.
```

SceneProjection is a derived read model, not another authoritative store. Share visibility, symbology meaning, selection, history window and relationship IDs; adapt only rendering geometry. MapLibre uses batched GeoJSON sources/layers and stable feature IDs instead of one DOM marker per track. Cesium uses keyed objects initially; measure before moving to lower-level primitives. GeoJSON longitude comes first. UI icons are separate from operational affiliation shapes/labels.

Switch transaction: capture neutral camera intent → preserve session state and view ID → suspend/release the previous adapter through the bounded renderer pool → acquire a retained adapter or lazy-create one → apply the latest complete scene/settings before resuming → restore equivalent area. Workspace-tab returns retain their own camera; mode switches transfer geographic intent and preserve private pitch bookmarks. Async generation guards prevent stale attachment. Independent panes have independent cameras. Closed, failed or incomplete viewers are disposed, not retained.

Camera equivalence is operational, not an exact pitch/zoom conversion: preserve focus, ground span, heading, and optionally selected entity. Use a visible-earth intersection for the Cesium focus, falling back to last focus when looking at the sky. Refit span for pane aspect ratio. Retain private per-mode pitch bookmarks where useful; never export Cesium camera objects into domain state. Proposed test tolerance: focus within 5% of viewport ground span and target remains visible for normal demo views.

Altitude conversion: Cesium's geographic conversion expects height above ellipsoid ([official Cartesian3 documentation](https://cesium.com/learn/cesiumjs/ref-doc/Cartesian3.html)). Convert MSL H using a named geoid offset N to ellipsoid h=H+N; AGL needs terrain height plus offset in a known reference. Cache conversions by provider/version and location. Keep unresolved conversions explicitly marked and preserve source MSL values in labels and Vertical Profile. Until a geoid is configured, any h≈H visual fallback must be labeled approximate and is not a completed altitude-fidelity acceptance criterion. Never clamp airborne tracks to terrain. Zone floors/ceilings use the same conversion; missing altitude bands remain surface areas rather than fabricated volumes.

Provider configuration describes imagery/style/terrain/3D Tiles URLs, attribution, token references and vertical model; no provider fields enter Entity. Production Workers/Assets/Widgets/ThirdParty deployment is tested. The approved [retention policy](map-responsiveness/REVIEW.md) supersedes unconditional hidden disposal: at most four slots including pending imports, two hidden instances at most one per projection, 120-second TTL and 512 MiB combined accounted tileset-cache budget. This is not a hard process/GPU memory limit. Hidden work is suspended; oldest hidden entries evict first, close/failure disposes immediately and excess visible capacity is explicit. Pane lifecycle owns resizing and cleanup.

Current environmental choices: local Protomaps/ESA WorldCover vector and Mapterhorn DEM archives with local glyphs/sprites for Tactical; optional MapTiler Cloud; Cesium ion standard imagery/terrain/OSM buildings, or direct Google photorealistic tiles as an alternative base without duplicate ground/buildings. Required logos/dynamic credits stay alongside content; full acknowledgements are under Settings → Credits. [Setup](MAP_SERVICES_SETUP.md), [regional review](map-refinement/REVIEW.md), [attribution](map-attribution/REVIEW.md). Singapore/nearby Southeast Asia presentation bounds are 99°E–105.5°E, 1.5°S–7°N, span 150 m–1,100 km, applied only to Synthetic Tactical and Synthetic Observations. They change neither domain coordinates/eligibility nor source resolution and do not guarantee a tile-request boundary. Alpha/Bravo remain unchanged.

The interactive Singapore template already uses the existing regional presentation boundary; D1 custom scenarios retain it. Existing fixture definitions remain intact. Any small movement-model extent is separately declared and validated; map navigation bounds do not become movement or encounter eligibility rules. Explicit ellipsoid source coordinates avoid an undisclosed MSL conversion in M1, but do not complete Phase 4 geoid/AGL acceptance or make basemap geometry suitable for route clearance.

## 8. Workspace library evaluation

The original comparison below informed the completed Phase 0 spike. FlexLayout React 0.10.8 was selected; see [Phase 0 acceptance](phase0-review.md). Golden Layout is no longer a pending choice. The isolated workspace harness proved tab/split/pop-out feasibility separately from operational state.

| Criterion | FlexLayout React | Golden Layout v2 |
| --- | --- | --- |
| React integration | React-focused component factory; natural fit for existing view components | Framework-neutral; documented virtual component binding requires an integration layer |
| Tabs and splits | Built-in tabsets, movement and splitters | Built-in docking layout; viable alternative |
| Pop-out model | React portals into another same-origin document, sharing the opener runtime | Child-window setup and explicit state propagation |
| State impact | Same session/store can feed the POC without a synchronization protocol | Each runtime needs backend-derived cache and coordinated UI context |
| Main risks | Owner-document handling, background throttling, chart/renderer lifecycle, opener dependency | React binding effort, child bootstrap, reconciliation and close lifecycle |
| Proposed fit | First candidate for hackathon | Fallback if the same acceptance spike demonstrates materially better behavior |

FlexLayout documents a same-origin popout host, shared opener JavaScript and limitations involving document ownership/timers. These support a small shared-runtime proof of concept, but do not establish independent-window resilience. [FlexLayout README](https://github.com/caplin/FlexLayout/blob/master/README.md).

Golden Layout recommends virtual component binding for frameworks. Its pop-outs require application-managed state propagation; EventHub broadcasts user messages and does not solve state ownership. [Framework integration](https://golden-layout.github.io/golden-layout/frameworks/), [pop-out documentation](https://golden-layout.github.io/golden-layout/popouts/).

**Implemented decision:** retain FlexLayout and its single model/bridge ownership. Tab ordering, targeted context menus, Open to Side, pointer/keyboard resize and real simultaneous maps are regression-tested. The operational shell has no pop-out entry point; the harness's counter/chart/window checks do not establish operational map or analytic window readiness. Do not replace this architecture with an independent child runtime by following the alternative proposal below.

First pop-out is Command Picture or Vertical Profile, not Cesium. With FlexLayout, use the same session runtime and backend stream; no BroadcastChannel is needed for that portal. Obtain document/window from the host element and point Radix portal containers, chart resize and keyboard listeners there. If opener closes, the POC session ends; independent restart/multi-monitor restoration is deferred. Popup failure leaves the view docked and gives an actionable message.

If Golden Layout wins, independent child runtimes each derive cache from the backend and need a small parent-coordinated UI channel carrying session/mission ID, revision, selection, cursor and filters. Parent assigns UI revisions, bootstraps child state and prevents echo loops; never broadcast authoritative world writes. This added work is a reason to prefer FlexLayout for this scope, not a reason to misrepresent its pop-out as an independent app.

## 9. UX and analytic contracts

Approved layout: compact logo/name plus mission breadcrumb and right-aligned UTC+8 wall clock, narrow Activity Bar, workspace tabs and compact connection status. Wall time remains distinct from mission/replay time. There is no separate mission strip or redundant pane heading. Tab context menus own Split/Open to Side/Close actions; existing tab close buttons remain. Tactical/3D, Select/Pan/Move/Recenter and Layers remain contextual map tools; D2 adds Draw zone/boundary beside them in authoring context. Monochrome chrome uses neutral selection; saturated color carries domain affiliation. Unimplemented modules remain unavailable. See [chrome refinement](chrome-refinement/REVIEW.md).

The current presentation refinement replaces map entity-summary cards with a single docked **Details** pane that follows explicit primary selection, including unmanaged observations. It reserves map space, retains group selection, and does not reopen on live updates. **Pin inspector** explicitly retains a mission/entity pair in a separate tab. Details groups essential telemetry and current execution above secondary disclosures and copyable technical values. Symbols, destinations, observed trails, attribution and map tools remain on the map.

One collapsible 220 px left sidebar switches between **Views** and **Fleet**. Fleet lists explicitly managed entities once, including unavailable or filtered members; it never changes shared filters or grants authority. Tracks remains the full entity browser. Details and Activity normally share a 300–440 px right tabset (about 340 px). Direct map movement is routine; Activity retains execution-specific cancellation and optional numeric destination entry. The mandatory frozen-review presentation was superseded by RTS, while the legacy reviewed API remains compatible. Below 1180 px navigation collapses first; below 900 px the auxiliary stack docks below the map. Global Simulation, execution access and operational notices remain reachable with contextual panes closed. See the [focused decisions](fleet-details/DECISIONS.md) for widths, information hierarchy and preserved behavior. These explicit user-approved changes supersede the previous persistent-summary and no-sidebar requirements; they do not advance M1.3.


Command Picture initial widgets: (1) present tracks by affiliation/classification, (2) managed resources by explicit availability including unknown, (3) recorded events over a selected time range. Titles state mission/time and whether filtering is applied. Do not label simulation health as fleet readiness or input presence as sensor detection confidence. Global mission totals and filtered counts must be visibly distinguished.

Vertical Profile consumes the same visible tracks and frame, expresses altitude in a common reference, and highlights the shared selection. Radial distance from the declared origin avoids a hidden projection axis; show trajectories with breaks and timestamp tooltips. Exclude or visibly mark positions whose altitude cannot be converted to the chart's chosen reference. Provide it as a reusable view component inside Command Picture and as a workspace tab/split/pop-out, without duplicating computation.

Timeline provides event markers, discrete timestamp selection, play/pause/rate and Return to live. Distinguish playback controls from simulation lifecycle buttons with separate labels and placement. A visible replay banner and pending-command indicator prevent confusion. Avoid a persistent large inspector or a dashboard of individual vehicle cards.

## 10. Phased delivery and remaining work

Dependencies below are incremental. Completed work is distinct from remaining acceptance and future proposals. Earlier reports record the scope/date at which they were written; their old statements that later phases are deferred are superseded by this status register, not erased from evidence.

### Phase 0 — contracts and docking decision

**Complete within bounded acceptance.** [Review and 43 boundary checks](phase0-review.md). FlexLayout selected and isolated window experiment verified. External simulation ambiguities remain explicitly provisional in `contracts/simulation/compatibility-decisions.md`; this was permitted by the phase gate, not full conformance signoff.

- **Files/modules:** `contracts/simulation/compatibility-decisions.md`, initial schemas/fixtures; `docs/demo-runbook.md` prerequisites; temporary `frontend` docking spike; backend domain model draft.
- **Dependencies:** React, TypeScript, Vite; evaluate `flexlayout-react` and `golden-layout` separately, plus ECharts for the plot probe. Remove the losing candidate before the shell lands.
- **Interfaces:** ViewDescriptor, SessionState, layout bridge; simulation edge-case decision table; altitude/provider configuration.
- **Acceptance:** document spike results and select one library; identify primary demo data/provider and hardware; record responses or provisional policy for every ambiguous external case. Preserve both source docs.
- **Depends on:** architecture approval.
- **Risks:** unresolved organiser errors, unavailable imagery/buildings, library/version mismatch. Shell work can continue with recorded open compatibility items, but exact-conformance signoff cannot.

### Phase 1 — application shell and tabs

**Complete, with approved UI refinements.** [Initial acceptance](phase1-review.md), [operator-console treatment](ui-refinement/REVIEW.md), [compact chrome/breadcrumb/context menus](chrome-refinement/REVIEW.md). The header's mission breadcrumb explicitly supersedes the earlier identity/time-only requirement. Tabs, splits, focus and close/reopen are implemented; operational pop-outs and refresh-persistent layout remain deferred.

- **Files/modules:** frontend manifests/config, `main.tsx`, `app/*`, `styles/*`, `features/workspace/*`, `state/workspaceStore.ts`, placeholder peer views.
- **Dependencies:** selected docking library, Zustand, Tailwind/Vite integration, selected Radix menus/tooltips/dialog primitives, Lucide; Vitest, Testing Library, ESLint, Prettier.
- **Interfaces:** view registry, WorkspaceState, open/focus/close commands and pane visibility/resize lifecycle.
- **Acceptance:** desktop shell with keyboard focus, semantic tokens, working tabs and entity inspector placeholder; Activity Bar opens/focuses peers; no page reload navigation. Production build works.
- **Depends on:** Phase 0 docking decision.
- **Risks:** competing library layout/store ownership and inaccessible compact controls. Keep one layout authority in the bridge.

### Phase 2 — shared world, backend authority and recording foundation

**Complete within tested local single-process scope.** [Acceptance matrix, restart and stream evidence](phase2-review.md). Recording-before-source, commit-before-publish, immutable frames, domain/aggregate validation, generated schemas, one session subscription and reconnect/mission isolation are implemented. No backend simulation/lifecycle authority is claimed beyond generic mission state.

- **Files/modules:** backend `domain`, `missions`, `world`, `recording`, `api/missions.py`, `api/stream.py`; frontend contracts/services/stores/presentation; contract export script and generated types.
- **Dependencies:** FastAPI, Pydantic, Uvicorn; standard-library SQLite; pytest/httpx; `json-schema-to-typescript`, Ajv and semantic runtime validation.
- **Interfaces:** WorldFrame, versioned snapshot/delta, stream epoch/sequence, generic events, typed role records, source identities and recording schema.
- **Acceptance:** deterministic backend fixture feeds all placeholder views; atomic update counts agree; duplicate/gap/reconnect/mission-switch tests pass; persisted state survives backend restart. No pane opens another subscription. Recording starts before source frames are processed.
- **Depends on:** Phase 1; Phase 0 domain/transport decisions.
- **Risks:** snapshot-stream race, schema drift, accidental duplicate entity/asset positions, publication before commit.

### Phase 3A — Tactical map foundation

**Complete within its bounded acceptance.** [Phase 3A review](phase3a-review.md), followed by [map services](map-services/REVIEW.md), [regional cartography](map-refinement/REVIEW.md), [retention/recovery](map-responsiveness/REVIEW.md) and [attribution](map-attribution/REVIEW.md). Hosted MapTiler authentication remains unverified; local cartography and labelled grid fallback are verified alternatives.

- **Files/modules:** `renderers/{contracts,scene,symbology,regions}.ts`, `renderers/maplibre/*`, `features/map/*`, local provider configuration/setup, browser regressions.
- **Dependencies:** MapLibre GL JS 6.9.0, PMTiles 4.5.0 and ignored reviewed vector/DEM/glyph/sprite assets; Playwright.
- **Acceptance met:** Track-derived Entity symbols, affiliation shape/text/color, supplied zones; stable picking and shared selection; mission framing/explicit recenter; no automatic refit on ordinary frames/filters; camera continuity, resize, simultaneous panes, stale/backend/provider recovery; one session subscription and bounded lifecycle. Missing positions remain missing. Narrow and keyboard controls verified.
- **Depends on:** Phase 2 authority/presentation.
- **Remaining risks:** authenticated optional hosted style, source coverage/resolution and provider availability. Regional bounds do not constrain domain validity. Heavy mission performance is not established by six-entity fixtures.

### Phase 3B — entity browsing, detail on demand and observed trails

**Complete within bounded acceptance; ready for user review.** [Phase 3B acceptance and evidence](phase3b/REVIEW.md): 91 backend tests, 129 frontend unit tests and 69 complete browser regressions passed; seven workflow checks passed again after the final copy adjustment. Separate critics scored 8.0 then 9.0/10; both blocking history findings were resolved. Final production capture verified local Tactical, ion standard and the configured direct Google base with one stream/one shared history read. This is not full operational production readiness.

- **Files/modules:** backend `recording/history.py`, bounded query in `sqlite_repository.py`, mission history endpoint, `missions/observation_fixture.py`; `contracts/sentinel/v1/observed-history.schema.json` and generated types; frontend `world/{entityRows,observedHistory,observedSegments}.ts`, `features/entities/*`, shared filters, both adapter trail projections and keyed workspace inspectors.
- **Dependencies:** TanStack Table 8.21.3; existing FastAPI/SQLite/Ajv/Radix/map/test stack. No second operational store or per-pane transport.
- **Contracts:** one row per Entity, deterministic displayed Track (source filter first, non-ended preferred, newest observation then stable ID); distinguish visible/mission Entity totals from raw Track totals. Shared selection/search/filters/overlays; pinned inspector identity is the encoded mission/Entity tuple. History is immutable committed data anchored by mission/recording/epoch/frame/sequence/effective time, maximum 300-second query window (UI 60), 1,000 canonical frame instants/2,000 observations. Highest committed sequence wins corrections as known through that frame. No interpolated/predicted observations.
- **Acceptance:** find → select in table/either map → compact summary → pinned Details → observed trail; missing/filtered/unlocated states explicit, supplied zero distinct from unavailable; provenance/units/datum/freshness copyable; role/task associations only when supplied. Shared counts and displayed history agree across renderers/inspector. Trails break at source/series changes, missing/stale observations, datum changes, declared discontinuity, time reversal or gaps over 30 seconds. History is limited to presented time and stale older results disclose their actual through-time. Mission/selection races and slow-read/live-update progress tested; existing cameras/pool/one subscription retained.
- **Depends on:** Phase 2 recordings and Phase 3A plus brought-forward Cesium adapters.
- **Remaining risks/limits:** selected displayed-track trail only, no full-history UI or replay; 60-second/point/frame caps disclosed; older AGL or unsupported datum samples have no invented 3D height; MSL h≈H remains explicitly approximate. Large mission/recording throughput requires later benchmarking.

### Phase 4 — Cesium and Tactical ↔ 3D continuity

**Brought forward and substantially complete; altitude-fidelity and coverage acceptance remain open.** [Foundation](map-services/REVIEW.md), [regional/real-provider verification](map-refinement/REVIEW.md), [warm-switch and failure evidence](map-responsiveness/REVIEW.md). Both adapters consume the same frame/selection/filters/zones and now observed-history subset. Workers/assets production paths, independent pane cameras, mode bookmarks, daylight presentation, local/standard/Google fallback and bounded renderer retention are implemented. No additional Phase 4 library scaffold is required.

**Outstanding:** known-point geoid/datum conversion and vertical accuracy signoff; Mojave/additional regional smoke contexts; authenticated MapTiler and optional Google-through-ion route verification. Direct Google plus ion standard and local Tactical were verified in earlier real-provider reports; this does not establish universal coverage. The reported intermittent five-minute Google failure was not reproduced in the measured twelve-minute sessions and is not claimed fixed. Account-console quota/billing and hard GPU memory remain unverified.

- **Files/modules:** `renderers/cesium/*`, `camera.ts`, `altitude.ts`, `providers.ts`, mode-switch lifecycle, Vite asset deployment configuration.
- **Dependencies:** CesiumJS and configured terrain/imagery/3D Tiles plus named geoid data/service. No extra renderer wrapper by default.
- **Interfaces:** same SceneProjection, camera conversion, altitude conversion with quality metadata, resize/visibility/dispose.
- **Acceptance:** same selected entity, mission, timestamp, filters, zones and history in both modes; switching back retains operational area within proposed tolerance. Test 20 rapid/back-and-forth switches, clean resource disposal and error recovery. Separate Tactical/3D tabs can both render. Urban, Mojave and tropical sample contexts load; primary urban data demonstrates useful physical context. Datum conversion has a known-point test.
- **Depends on:** Phase 3; provider decision from Phase 0.
- **Risks:** WebGL memory, bad base URLs, height-reference mismatch, stale async mounts, missing urban geometry. Unqualified approximate height is not fidelity signoff.

### M1 foundation — implemented; unimplemented remainder superseded

**M1.1, M1.2 and subsequent authorized refinements are complete within their recorded scopes.** Preserve their contracts, authority, movement, recording, Fleet/Details layout, RTS gestures and compact UI/profile changes. The detailed new plan distinguishes verified code, historical proposals and proposed files.

The former M1 baseline, pair-composer workflow, clock/authority discussion and operator-declared-only restriction are retained in the [unchanged historical plan](IMPLEMENTATION_PLAN.pre-demo-roadmap-2026-09-17.md). They are not the active remaining roadmap. D1–D7 explicitly replace its unimplemented scope while carrying forward its safeguards; current RTS decisions continue to take precedence over older staged-movement descriptions.

The completed milestone entries below are historical acceptance records; their file proposals and contemporaneous workflow descriptions must be read with the subsequent refinement records. Do not reimplement their old UI or treat their review scores as scores for the new proposal.

#### M1.1 — authority, contracts and repeatable run entry

**Complete; final independent review 9.14/10 after three rounds, with no unresolved material finding.** New → Acquire → Start → Pause for more than 30 real seconds → Resume → End → New works through the operator UI. Verification: 136 backend and 145 frontend unit tests pass; the full 73-case browser suite passes, followed by all four affected M1 cases on the final receipt-lookup correction. Type, lint, formatting, contract drift and production-build checks pass. Immutable receipts/reconciliation, explicit ownership/reclaim, coordinated world/stream 1.1 and SQLite schema 2 with unchanged legacy reading are exercised. [Contract decisions, screenshots and review evidence](m1.1/REVIEW.md). At that checkpoint movement and encounters remained unavailable, and work stopped for user review. The later M1.2 request is a separate authorization; the M1.1 score does not assess movement.

- **Files/modules:** proposed `backend/app/commands/{contracts,service}.py`, `simulation/interactive/{template,run}.py`, API command/run routes, recording journal/checkpoint migration and tests; existing contract export/generation/runtime decoder; minimal Fleet mode entry and Simulation menu in `frontend/src/features/entities/*` plus `features/fleet/*`.
- **Dependencies:** Phase 2 mission authority/recording and Phase 3B workspace/read models. Existing FastAPI/Pydantic/SQLite/Ajv/Zustand/Radix/TanStack stack; no new infrastructure dependency.
- **Interfaces:** AssetControl, immutable receipt, explicit local grant/lease and intent evidence, run identity/lifecycle, internal version migration. Freeze the precise transition matrix, rejection codes, module projection and lifecycle-intent wire shape before executor/UI work depends on them.
- **Acceptance:** New demo run → Acquire control → Start → Pause over 30 seconds → Resume → End → New demo run works through UI, with prior recording intact and one nonterminal interactive run. Existing fixtures remain unchanged. Duplicate creation/command identity, conflicting payload, lease reclaim, obsolete lifecycle intent, and wrong mission/source/grant/epoch/reference all have deterministic tests. Legacy records remain readable without mutation.
- **Risks:** paused-frame expiry deadlock, ownership confused with affiliation, silent takeover, contract drift, non-idempotent run creation and unintended changes to historical recordings.

#### M1.2 — complete movement workflow

**Complete; final independent review 9.12/10 after two rounds, with no unresolved material finding.** The actual UI supports single/group selection → frozen endpoint review → atomic admission → committed movement in Tactical and Cesium → per-execution cancellation/completion → fresh replacement. A real pause over 30 seconds, navigation/lease-expiry continuation, explicit revocation, recovery, unchanged legacy reading, keyboard/narrow layouts and existing regressions are exercised. Verification: 168 backend, 157 frontend unit and all 77 browser tests pass; all four M1.2 browser cases and the full frontend unit/static/contract/build checks pass again after the disclosure correction. The non-author critic independently exercised the revised production UI with both real providers and checked its committed recording. [Decisions, reproducible evidence, screenshots and critic rounds](m1.2/REVIEW.md). No required M1.2 correction remains. This does not complete M1 or authorize M1.3/M1.4; broader workload/performance certification remains deferred.

- **Delivered files/modules:** `backend/app/commands/kinematics.py`, `movement.py` and existing `service.py` checkpoint integration; `frontend/src/world/movement.ts`, `features/movement/MovementPane.tsx`, existing entity browser/summary/inspectors, shared runtime/command client, scene and both renderer adapters. The earlier `simulation/interactive/` path was a proposal, not the existing architecture. World/stream 1.2 and interactive 1.1 are generated under `contracts/sentinel/v1.2/`; SQLite stays schema 2 with no historical JSON rewrite.
- **Dependencies:** M1.1. Reuse current map SDKs, shared primary history and test tools; no route-planning library or additional state system.
- **Interfaces:** frozen per-member Move intents, displayed-versus-control source disclosure, authoritative per-member execution, neutral requested-target projection, one shared draft.
- **Acceptance:** find → select one/group → preview exact endpoints → submit → observe committed movement/progress/completion and trail in both maps. Friendly-but-uncontrolled cases reject; no silent subset, fabricated altitude, ordinary-frame refit or renderer recreation. Cancellation and partial execution failures remain truthful. Keyboard/narrow panes work and one primary history owner remains.
- **Risks:** mistaking acceptance for arrival, sending to the display source, group selection losing exceptions, expired first delivery, unsupported altitude conversion and browser arrival-time motion.

#### Authorized post-M1.2 refinement — RTS maps and demo operation

The [RTS reference plan](RTS_MAP_AND_DEMO_REFINEMENT_PLAN.md) governs this authorized refinement where earlier M1 requirements conflict. Historical scores apply only to their original deliveries. Direct right-click commands in both maps replace mandatory coordinate review/Tactical-only authoring. Pan allows click selection; Select rectangles include visible managed friendlies, even unavailable members. Direct commands skip unavailable members and atomically supersede accepted members' prior execution from current committed positions, using persisted per-asset ordering. Invalid replacements preserve existing movement; delayed old requests cannot restore older destinations. The legacy reviewed `/moves` API retains its old semantics.

New demo orchestrates create, acquire available ownership and start; ownership conflicts still require attention. Pause/Resume is contextual, End secondary. Local Singapore framing, explicit Overview/Focus selection, finer close zoom, persistent Demo NNN aliases and SGT presentation replace broad default fit, UUID names and routine technical timestamps. Exact values and original recordings remain intact.

Fleet/Details, independent cameras, renderer retention, the primary observed-history owner, one shared runtime/transport and provider attribution/recovery remain. [Backend decisions](rts-refinement/CONTRACT_DECISIONS.md), [client decisions](rts-refinement/CLIENT_DECISIONS.md), [map decisions](rts-refinement/MAP_DECISIONS.md) and [verification/review](rts-refinement/REVIEW.md) record implementation evidence. **Complete for this refinement:** 200 backend tests, 194 frontend units and 84 browser regression cases pass, followed by 30 affected map cases after the surface-pick correction and 15 affected cases after the final wording correction; type, lint, format, contract-drift and production/verification builds pass. Both independent critics operated actual Tactical, standard 3D and Google content, including partial movement, redirection, keyboard/narrow layouts and recovery. The final delivered-source review scores **9.04/10**, with no unresolved material/high/critical finding. Physical-device input feel and broader workload certification are not claimed; the review records one optional low wording suggestion. Stop for user review. M1.3 encounters and M1.4 certification remain deferred.

### Replacement roadmap — D1–D7 authored demo behavior and UI

**D1a, bounded D1b, D2, D3, D3a, D4, its focused behavior refinement and the UI presentation refinement are implemented and reviewed; D5–D7 remain proposed only.** The previous M1.3 and M1.4 are retired as pending milestones. Use the [detailed plan](DEMO_BEHAVIOR_UI_PLAN.md) for operator workflows, concrete existing/proposed module paths, contracts/migrations, bounded defaults, dependencies, risks, acceptance and deferrals. The [D1a review](d1a/REVIEW.md), [D1b review](d1b/REVIEW.md), [D2 review](d2/REVIEW.md), [D3 delivery ledger](d3/REVIEW.md), [D3a evidence](d3a/REVIEW.md), [D4 evidence](d4/REVIEW.md) and [current refinement ledger](d4-refinement/REVIEW.md) record their separate scopes and gates.

| Phase | Deliverable | Incorporates / depends on |
| --- | --- | --- |
| D1 — Scenario definitions and Units composition | Bounded D1a + D1b implemented: three-category authoring, keyboard placement, targeted Locate/duplication, immutable copy/save/reload, exact-revision validation and authoritative Run. Final independent gate passed at 8.98/10; ready for D2 handoff after user review. | Completed M1 authority/movement; D1a and D1b decisions and review gates. |
| D2 — Boundary authoring and enforced movement rules | Implemented and verified: both-map/numeric authoring, immutable boundary revisions and frozen authoritative movement restrictions. Third independent gate 9.08/10, all mandatory acceptance passed; [evidence](d2/REVIEW.md). | D1; preserves RTS gestures and backend movement authority. Patrol execution remains D4. |
| D3 — Conductor and deterministic scenario execution | Implemented: bounded timed source motion, immutable script revisions/runs, simulation-time dispatch and visible per-friendly Move/Stop/Return override. Third independent gate **9.14/10**, all mandatory acceptance passed; [evidence](d3/REVIEW.md). | D1–D2; same writer, lifecycle, recording and command owner. |
| D3a — Saved missions, Conductor usability and live demo boundaries | Implemented and verified: saved Missions discovery, all-plan previews, genuine completion dependencies, atomic batch authoring and leased effective-boundary changes. Fifth independent gate **9.10/10**, mandatory acceptance satisfied; [evidence](d3a/REVIEW.md). | D1–D3; immutable initial snapshots, current effective rules and existing source/command ownership. |
| D4 — Fleet policies, patrol, coordinated interception and persistent outcomes | Implemented and verified: compact Fleet policies, armed map approach, unique targets/held reserves, current-rule Patrol, atomic persistent NON-OP and authoring-only script previews. Third fresh independent gate **9.20/10**; [evidence and limits](d4/REVIEW.md). | Replaces M1.3; retains atomic outcomes, manual override, ordering, persistence, recovery and shared presentation. D5 requires separate authorization. |
| D4 refinement — Smooth movement, RTS Intercept and unit types | Implemented and verified: shared visual interpolation; configurable 700 m proximity acquisition while idle or moving; concurrent unique pursuit and moving unassigned members; retained destinations; five typed affiliation choices. Fourth fresh independent gate **9.16/10**; [current evidence and limits](d4-refinement/REVIEW.md). | Supersedes D4's clicked-area/held-reserve rules for new runs. Retains Patrol, current boundaries, authority, atomic losses, recovery and authoring-only script previews. Historical recordings keep their original interpretation. |
| UI presentation refinement — selective revert on 19 September | Previous Fleet/Details and original entity colours restored; Observed history removed from Settings. Remaining local settings, silhouettes, destination styles and current-plan overlays are retained. Fresh focused independent gate **9.3/10**; [current evidence and limits](ui-presentation-refinement/partial-revert-2026-09-18/REVIEW.md). | D4 refinement remains the behavior baseline. Shared session, authority, interpolation, recording, contracts and authoring-only script previews are preserved. No cockpit, video or vision cones. |
| D5 — One simulated cockpit view | Details camera action, frame-consistent rendered viewpoint, bounded Cesium slot | D1 pose; D4 for loss-state acceptance; AR optional. |
| D6 — Operator decision cards, rules first | Frame-grounded choices and explicit validated Apply | D3–D4; LLM adapter deferred and advisory only. |
| D7 — Integrated demo, migration and recovery acceptance | Full operator sequence, regressions, historical compatibility, fault injection and measured workload | Replaces/expands M1.4; checks also run within each phase. |

**Behavior decisions:** saved definitions and initial run snapshots remain frozen. D3a explicitly permits authorized live boundary commands to append effective rule revisions from their commit onward; restrictions apply to scenario-owned actors, including scripted hostiles and observers, without granting live control. Live friendly commands override future script until explicit Return to script, which never replays broken chains. Named Patrol remains bounded and requires explicit reapplication after geometry changes. New runs use the refinement's Intercept stance: eligible hostiles within a persisted 700 m horizontal radius may be acquired while idle or moving, with one active pursuer per target and concurrent execution. Every eligible selected member receives its ground movement command; unassigned members continue travelling. Pursuit retains unfinished destinations; loss or Manual resumes them; Stop disarms. Current Friendly/Restricted rules still veto prohibited work, and failed/stopped movement is not restarted automatically. Both controlled friendly types may Intercept; affiliation and type never grant command authority. Script preview geometry remains authoring-only, explicitly superseding D3a live previews. All behavior remains local simulation without validated aircraft, sensor, navigation or effects claims.

**Current implementation boundary:** verified D1a + bounded D1b + D2 + D3 + D3a + D4 and its focused behavior and UI presentation refinements. The [latest selective-revert ledger](ui-presentation-refinement/partial-revert-2026-09-18/REVIEW.md) records the **9.3/10** focused independent gate, restored panels/palette, retained settings and current verification. The original UI redesign and its stable-panel measurements remain historical evidence. The unchanged [D4 behavior baseline evidence](d4-refinement/REVIEW.md) records **336 distinct backend cases** (334 full-suite passes followed by 114 affected passes including two new regressions), **274 frontend unit and 33 distinct browser cases**, static/generated/build/hash checks and a fresh fourth independent final gate of **9.16/10**. Package 1.11 coordinates world/stream 1.10, status 1.7, receipt 1.6, execution read 1.3, checkpoint 1.7 and typed scenario/review 1.4; untyped revision identities and SQLite 4 remain unchanged. Source specs and historical evidence are preserved. The single writer composes immutable scripts, effective rules, Fleet policies, frozen unit profiles and persistent demo losses. Both renderers use shared bounded visual interpolation without adding authoritative observations. Source-loop scheduling now compensates processing time instead of always adding a 200 ms sleep; fixed simulation steps and no-catch-up recovery remain. The measured maximum 32-actor/128-action loss workload still takes **219.5 ms p95 processing**, exceeding 200 ms in 14/120 samples; sustained physical-display FPS and D7 workload/storage certification are not claimed. Dense labels, broader altitude/coverage and existing Timeline playback/chooser/fallback-fill limits remain. Five requested affiliation/type combinations are implemented; broader catalogs, live definition/script editing and D5–D7 remain deferred. **Stop after this refinement for review.** The tested frame/condition/outcome and renderer contracts are ready for a separately authorized bounded D5 cockpit; no D5 implementation is included.

### Phase 5 — simulation compatibility end to end

**Deferred. Recommended after the bounded D1–D7 demo in the revised delivery order**, beginning with the retained bounded resolver/adapter slice and explicitly reviewed compatibility policies; this document does not authorise its implementation. The demo roadmap changes delivery order, not this phase's external contract or acceptance obligations. There is no technical requirement to depend on the interactive executor when validating the pure compatibility resolver.

This phase supplies external run controls and outcome integration, not per-drone Move/destination authoring by implication. The local demo outcome is not conformance evidence. The submitted batch contract has no streaming append/tick command or selected-pair mask and requires MSL inputs. Do not emulate interaction streaming with repeated START or hidden HOLD/RESUME loops. Initially evaluate compatibility in separate missions/runs so its adapter cannot overwrite an interactive executor. A later bridge requires an explicit single-writer/source coordinator, run/sample continuation policy, selected-input scope, altitude mapping, profile governance and next-input-state/correction rules. Preserve §7's golden health-60 ACTIVE result and all organiser ambiguities.

- **Files/modules:** backend `simulation/*`, `adapters/simulation_v1/*`, compatibility route, complete contract fixtures/tests; frontend `modules/counter-uas/*` controls/details.
- **Dependencies:** Python stdlib hashing/decimal handling; add a polygon library only if its validated semantics reduce risk. Existing transport and persistence stack suffices.
- **Interfaces:** exact external request/response, resolver, lifecycle service, idempotency registry, profile registry, adapter mapping and typed module details.
- **Acceptance:** published golden result matches; all §10 negative/boundary cases covered; same canonical command returns stored result without duplicate recording; conflicting content gives 409; HOLD/RESUME/ABORT are backend acknowledged. Neutral/unknown/out-of-area rows persist; simultaneous outcomes and discontinuities are correct. No raw external drone schema enters core/frontend world state. Sparse 10,000-drone fixture passes and dense scaling is measured separately.
- **Depends on:** Phase 2 foundation, Phase 0 resolved compatibility decisions; Phase 4 enables visual verification.
- **Risks:** unresolved error semantics, quadratic result size, duplicate JSON keys, numeric ordering/rounding, transaction/idempotency races. Do not claim full compatibility while ambiguities remain unresolved.

### Phase 6 — Command Picture and Vertical Engagement Profile

**Deferred.** Current Command Picture/Vertical Profile are clearly labelled placeholders, not working analytics. Requires truthful supplied aggregates, declared profile origin and a reviewed common altitude-reference policy; no decorative metrics or invented readiness.

M1's Fleet mode is an individual-resource control surface, not Command Picture completion. Later aggregates may use supplied condition, availability and execution/outcome records, with managed/controllable/non-operational denominators kept distinct. A notional loss count is not a real-world effectiveness or readiness metric. M1's ellipsoid-only fixture does not replace common-reference acceptance for mixed external MSL/AGL data.

- **Files/modules:** `command-picture/*`, `vertical-profile/*`, reusable chart host with owner-document lifecycle, domain/module selectors.
- **Dependencies:** Apache ECharts (reuse spike dependency, no second chart library).
- **Interfaces:** frame-keyed aggregates, profile origin and altitude transform, chart click→ObjectRef selection, bounded history query.
- **Acceptance:** three meaningful widgets and the profile read the same frame as maps; chart selection highlights the correct entity everywhere; unknown resource data stays unknown; profile has labeled distance origin, altitude reference and discontinuities. Opens as card, tab and supported side view.
- **Depends on:** Phases 3–5 for the original counter-UAS acceptance; include M1 projections only after their contracts are delivered. Can develop selectors against Phase 2 fixtures while the external adapter is completed. Vertical Profile still requires the reviewed common-altitude policy.
- **Risks:** misleading counts, radial distance mistaken for cross-section, charts recomputing on every camera movement.

### Phase 7 — Timeline and replay

**Deferred.** Durable recordings and bounded observed-history inspection exist; frame seeking, playback/scrubbing, event navigation and complete seek lifecycle remain unimplemented. Phase 3B is not replay acceptance.

Extend future replay acceptance with M1 requests plus D1–D4 pinned scenario snapshots, scheduled action states, manual overrides, policies, assignments/reserves, execution transitions, interactive lifecycle and toy outcomes. Applied D6 recommendations retain their command correlation. Reconstruct from committed frames/journals and preserved model identity; never rerun the executor or encounter handler, dispatch a Move, renew a control lease or feed replay results into the live cache. Interactive Pause freezes source time; playback pause only freezes viewing. Preserve equal-effective-time journal ordering and disclose corrections separately from the external v1 lifecycle.

- **Files/modules:** backend `replay/service.py`, `api/replay.py`; frontend `historyCache.ts`, `replayClient.ts`, `timeline/*`, presentation selector replay branch.
- **Dependencies:** existing SQLite/ECharts/time primitives; no timeline framework.
- **Interfaces:** recording metadata, effective-time frame lookup with sequence tie-breaker, bounded series/event ranges, TimeState and seek-generation token.
- **Acceptance:** scrub and play through the defensive synthetic scenario; all views resolve the same frame; external simulation health/status change at exact timestamps and retain interaction IDs/draws/corrections. Also reconstruct an authored demo movement/engagement run, including request/acceptance/termination and atomic non-operational changes, without replay dispatch. Live updates continue in their own cache; Return to live reaches latest state. Repeated/rapid seeks cannot show stale responses. External HOLD, interactive Pause and playback pause are visibly distinct; finalized ABORT and M1 End recordings reopen after restart.
- **Depends on:** Phase 2 recording, Phase 5 simulation records and Phase 6 shared analytic projections for original acceptance; M1 journals for the added interactive scenario. Recording these events in M1 does not implement this replay UI.
- **Risks:** incomplete initial metadata, live/replay contamination, mixed moments, history memory growth, future-data leakage through prediction.

### Phase 8 — split panes and one pop-out proof of concept

**Partial, brought forward:** working tabs/splits/context menus and simultaneous independent maps are complete. Isolated harness pop-out feasibility is complete. Real analytic pop-out with shared operational context, child resize/focus/close, popup failure and opener-lifetime acceptance remains deferred until those views exist. Do not enable operational pop-outs based solely on the harness.

M1 uses the existing workbench host and does not bring operational pop-outs forward. Any later child view shares the session's command reconciliation and lease owner as well as its world subscription; opening/closing a window cannot acquire another controller or cancel accepted execution.

- **Files/modules:** finish `docking.ts`, layout bridge, `windowContext.ts`, `popout.html`, owner-document chart/control integration, workspace e2e tests.
- **Dependencies:** selected docking library only; browser primitives as required by the selected model.
- **Interfaces:** open-to-side/move/close/pop-out, pane resize/visibility, shared session runtime; child bootstrap/UI revision protocol only if independent runtimes were chosen.
- **Acceptance:** Map + Vertical Profile + Timeline arrangement; simultaneous Tactical/3D; move views without losing context; pop Command Picture/Profile to another window, change selection/replay time and verify agreement. Resize, close and reopen child; blocked popup leaves usable docked view. No duplicate backend commands/subscriptions or leaked renderers. Document opener-lifetime limitation.
- **Depends on:** Phase 1 tab host and Phases 4, 6, 7 real views. Phase 0 already proved basic pop-out feasibility.
- **Risks:** wrong document listeners, hidden-opener throttling, browser popup rules, chart sizing and focus loss. A single working analytic pop-out is sufficient; map detachment is optional.

### Phase 9 — demo hardening and acceptance

**Deferred beyond current regression coverage.** No complete simulation/analytics/replay demo or worst-case throughput certification exists.

Retain the original canonical counter-UAS demonstration and add the authored Units/zones/Conductor/Fleet/engagement/reserve/cockpit/decision workflow and its recovery paths. Neither substitutes for the other. In particular, notional pair loss does not discharge external compatibility, replay, map-fidelity or physical-operations obligations.

- **Files/modules:** Playwright critical-flow tests, backend conformance tests, synthetic scenario/recording fixtures, `docs/demo-runbook.md`, environment/config examples and build checks.
- **Dependencies:** existing test tools only.
- **Interfaces:** canonical demo from product §42, defensive scenario from simulation §9, M1 interactive run/request/outcome contracts and provider failure/reconnect recovery.
- **Acceptance:** clean install/build and complete rehearsed original demo: load → Tactical → select/details → 3D → profile → command aggregates → HOLD acknowledgement → replay → split/pop-out. Also create/run/end/recreate a saved scenario through the UI and verify scripted motion, override, boundaries, coordinated toy outcomes and reserves across lost-response/reconnect/restart paths, retaining inspectable results. Check 1440p/4K, keyboard access, production paths, one lost connection and one failed provider. Publish measured performance and explicit remaining limitations.
- **Depends on:** all deliverable phases.
- **Risks:** network-dependent demo, last-minute scope growth, machine-specific GPU/browser behavior. Keep a deterministic recorded demo and clearly labeled fallback basemap.

## 11. Acceptance budgets and exclusions

Provisional interactive target: 200 entities at 5 authoritative updates/second, 60 seconds of visible history, both maps plus two analytic panes. Aim for at least 30 FPS on the selected demo machine and local selection feedback within 150 ms; record actual numbers rather than asserting them in advance. Cold 3D tile loading is measured separately from warm renderer switching. UI counters need not update at animation frequency, but all display the same committed frame/cursor. Performance failure first triggers batching, bounded history and less expensive symbols, not deck.gl by default.

M1 first verifies a small explicitly authored demo, proposed 5 Hz execution and a ten-minute workflow/recovery session. Measure command receipt latency, committed update lag, frame intervals, network requests and available resource accounting at matching camera/viewport/quality settings. This is neither a measurement already obtained nor proof of the 200-Entity/both-maps/two-analytics budget. Keep the existing selected-history limits and bounded renderer retention; do not improve numbers by silently reducing settled geographic detail.

Compatibility tests include every required case in simulation §10, with special attention to exact radius/boundaries, canonical ordering, duplicate parsed timestamps, health/status invariants, immutable profiles, and lifecycle/idempotency. UI tests cover continuity after switches and reconnect, filter/overlay agreement, stale/missing selections, replay isolation, schema drift and window lifecycle. Use deterministic shared read-model assertions plus focused screenshots; do not rely solely on unstable network tile pixels. Test the final chosen versions and production build on the demo browser.

**New scope revision (proposed):** permit the bounded scenario authoring, timed local source actions, horizontal boundary checks, explicit behavior policies, deterministic target allocation/approach, toy mutual-loss rule, rendered cockpit and rules-based advisory choices in [D1–D7](DEMO_BEHAVIOR_UI_PLAN.md). This deliberately supersedes the old bans on automatic approach/proximity, group allocation and timed scripts for this local demo only. It does not authorize implementation or establish physical validity.

The detailed plan's §7 defines the hackathon cut. Do not build real aircraft dispatch, validated physical/sensor/effects models, pathfinding/clearance, vertical flight, advanced swarm/formation/communications, broad catalogs, cinematic/live-editing tools, autonomous LLM execution, enterprise collaboration, extra rendering/state/docking infrastructure or unlimited cockpit/video views. Preserve the existing provider stack, independent cameras, renderer budgets and all completed UI refinements. The original external compatibility, analytics, replay, altitude fidelity and operational pop-out obligations remain separately deferred; they are not silently discharged by this demo.

## 12. Next-phase prerequisites and unresolved decisions

**Delivery order:** completed Phase 3B/M1.1/M1.2 and Fleet/Details/RTS/compact refinements → implemented D1a/D1b/D2/D3 → review the verified D3a delivery and passing independent gate → D4–D7 slices when implementation is authorized → retained Phase 5 compatibility → remaining analytics, replay, workspace and hardening acceptance. Outstanding Phase 4 map fidelity/coverage can proceed under separate scope; no ordering here declares it complete.

Before later phases, freeze their material choices in [the detailed decision table](DEMO_BEHAVIOR_UI_PLAN.md#2-recommended-decisions-and-explicit-assumptions): affected zone members, explicit engagement intent, manual override, reserve release, geometry limits, AI dependency and cockpit resource bounds. Recommended defaults are concrete enough to build; alternatives that change behavior are identified rather than silently assumed. D1a recorded pre-run authoring, exact version numbers, exclusive custom/template run inputs, revision/idempotency scope and SQLite migration decisions before dependent code; see [D1a decisions](d1a/CONTRACT_DECISIONS.md).

Carry forward M1.1/M1.2 and later decisions: fresh lifecycle/Stop evidence independent of paused frame age, immutable same-ID reconciliation, private credentials, source-bound grants, accepted work independent of current lease/pane lifetime, per-member order fencing, authoritative complete-frame publication, restart interruption, legacy reading and preserved recorded bytes. D3 has extended these to schedule state under its [recorded decisions](d3/CONTRACT_DECISIONS.md); D4 must extend them to assignment/outcome atomicity. Source scripts do not reuse expired future Move requests or infer hostile command authority.

For retained Phase 5 exact-conformance signoff, resolve or explicitly retain provisional policies for organiser errors, aborted RESUME/missing transitions, duplicate keys/numeric canonicalisation, validation order and cross-command correction/run/profile semantics in [the compatibility register](../contracts/simulation/compatibility-decisions.md). Preserve the golden ACTIVE/health-60 fixture. A future bridge needs reviewed sample continuation/selection, MSL mapping and one source coordinator before it may affect an interactive mission; separate runs remain the default.

Phase 4 datum/coverage, meaningful analytics, replay seeking and operational pop-outs remain separately gated. Current MSL h≈H is a disclosed visual approximation. Neither a fixed-height cockpit nor toy proximity establishes terrain clearance, sensor visibility or common-altitude fidelity. The existing broad performance target remains unmeasured; D7 reports its own bounded workload results rather than recycling past scores.

Historical proposal/implementation review records remain at their original paths, and the former M1 plan remains in the unchanged archive. D1a, D1b, D2, D3 and D3a have separate implementation decisions, test results, screenshots and independent review rounds under their respective `docs/` folders; prior scores are not reused. Stop after D3a for user review.
