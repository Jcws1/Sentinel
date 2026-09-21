---
title: Claims and gaps
status: evidence_gaps_open
updated: 2026-09-20
tags: [claims, gaps]
---

# Claims and gaps

| Draft claim or implication | Current evidence boundary | Treatment in report |
|---|---|---|
| Lower cognitive workload or fewer operators needed | No measured user study or operational comparator was found | Describe the design objective; do not present it as a result |
| Autonomous planning and guaranteed interception success | Operator-controlled, simulated command and notional outcome workflows are verified | Describe the implemented supervisory scope |
| Multi-sensor confidence scoring or real sensor fusion | The retained Milestone 1 evidence does not establish operational sensor ingestion or validated detection performance, and the specification itself concedes the view "may remain partly conceptual unless the available data supports it" | Mark as proposed or require separate implementation/test evidence |
| Validated Thales, Wedgetail, Anchor, MAVLink or PX4 integration | The research draft asserts integrations; reviewed milestone evidence does not substantiate them | Obtain dated interface records and joint test results before claiming validation |
| GNSS-denied or network-denied aircraft capability | Software connection-loss and stale-source recovery do not establish aircraft navigation performance | Keep the software/flight distinction explicit |
| Forty controlled interceptors | The verified fixture is twenty friendly controlled plus twenty hostile scripted observation-only entities | State the composition exactly |
| Faster operational decisions | Cached scenario-review response is faster in the local benchmark | Report the exact software metric only |
| Sustained smooth display or complete readiness | Strict display acceptance fails; configured Video evidence is incomplete after its per-run allocation was reached; this does not establish a renderer defect | Retain the open acceptance gates, and state the budget-stop cause |
| Configured Video "failed" or crashed | Exit code 1 and the page-closed error are the expected stop at the 3,500-dispatch allocation (3,516 observed attempts; 484 of the total 4,000 ceiling unused); a separate probe confirmed hidden-render suspension and viewer reuse | Describe incomplete capture evidence; infer neither a defect nor defect-free performance |
| Video loads in 40.4 ms | That is resident-content readiness after a fixed 12,000 ms warmup, with 1,834 attempts already spent | Do not quote as a load time; quote only with its warmup and budget conditions |
| Current prototype matches all specification pages | Not established: [[wiki/sources/Sentinel v3 specification\|Sentinel v3 specification]] lists full multi-window management, saved workspaces, advanced sensor-fusion visualisation, offline deployment and the policy layer as "Later" or deferred | Use current implementation and verification ledgers for delivered claims |
| Specification "Must Work" items are delivered | The external simulation compatibility adapter is a stated Must Work priority but is not evidenced in the milestone material | Treat specification priority as intent; cite verification for delivery |
| Mojave or jungle environments were demonstrated | The specification names Singapore, Mojave and Tropical; the evidence shows Singapore and Sydney only | Describe only Singapore and Sydney; confirm the current demo set |
| Implementation plan is a single current capability inventory | Its 20 September milestone opening conflicts with D4-era body status and a stop-after-D3a ending | Resolve each claim against dated verification; preserve source chronology |
| 200-entity, 5 Hz, 30 FPS and 150 ms targets were demonstrated | Section 11 of the plan labels a combined workload target; the retained measurements use other workloads and clocks | Keep targets separate from measured results |
| Local mutual-loss outcomes prove external simulator conformance | The plan describes a distinct external ACTIVE/health-60 fixture; its original specification/golden is absent here | Ingest the external contract and evidence before assessing conformance |
| Optional in the specification means removed from delivery | The implementation plan retains later replay/pop-out obligations | Track deferred acceptance explicitly rather than silently dropping it |
| External conflict statistics and competitor dependencies | Draft citations and embedded tables were not independently verified here | Verify primary sources before incorporating them into the report |

Sources: [[wiki/sources/Research draft|Research draft]], [[wiki/sources/Repository evidence|Repository evidence]], [[wiki/sources/Provider budget ledger|Provider budget ledger]], [[wiki/sources/Sentinel v3 specification|Sentinel v3 specification]], and [[wiki/topics/Quantitative results|Quantitative results]].

## Gaps opened by the submission draft

Found while ingesting [[wiki/sources/Report draft V2|Report draft V2]] on
20 September 2026. These are requirements the report must satisfy that the vault
currently cannot evidence, rather than claims the draft has wrongly made.

| Requirement or implication | Evidence boundary | Next source needed |
|---|---|---|
| A before-and-after against 21 June, required by the guidelines | The repository's git history **begins 2026-09-10**; 18 commits, all dated 10-20 September 2026. Nothing in `raw/` records a June state | A dated pre-10-September artefact from outside the repository, or an explicitly labelled alternative starting point |
| A technology readiness level entry and exit, with evidence for the exit claim | **No TRL assessment exists anywhere in this corpus** | A derived assessment with its reasoning labelled, or an explicit statement that none was formally made |
| MOSA compliance, open interfaces, a swappable node | Only versioned **internal** contracts are documented. The repository's `contracts/sentinel/` series through v1.15 is not snapshotted | Ingest the contract series; obtain any external conformance or interchangeability record |
| Cost to serve, compute footprint, what breaks at scale | No cost model of any kind is retained. Provider request counts are explicitly not billing counts | Deployment, licensing, support and provider cost assumptions with a scale model |
| The draft's reference [23], on local map packs and offline fallbacks | `docs/MAP_REFINEMENT_SETUP.md` and `docs/MAP_SERVICES_SETUP.md` exist in the checkout but are **not snapshotted**, so the draft's own citation cannot be checked | Snapshot both map documents |
| The draft's reference [6], on the September development sequence | The cited range `75f428d`..`3041454` is real and spans 17 commits, oldest dated 2026-09-10, consistent with the stated window. The commit contents are not snapshotted | Rests on git history rather than on `raw/`; acceptable if described that way |

See [[wiki/outputs/Report evidence map|Report evidence map]] for these gaps
arranged by report section, alongside the evidence that is available.

The research draft and the specification fail in opposite directions and should not be conflated. The draft asserts capabilities as achieved; the specification prescribes them as intended. Neither is delivery evidence, but the specification is candid about what it defers, so its concessions are usable as corroboration of a gap.

## Highest-value next evidence

Confirm the actual implemented partner interfaces, if any. Design a human-factors comparison with a clear baseline and workload measures. Repeat the local timing benchmark across independent sessions and additional machines before estimating a confidence interval. Resolve display acceptance and qualify hardware-in-the-loop or field testing separately from simulated outcomes. Closing the configured Video gate specifically requires a separately approved provider allocation; the ledger proposes one bounded run of at most 8,000 attempts, and 484 attempts remained under that ledger's ceiling.

This list proposes evidence to obtain; it is not a claim that these tests have been performed or an instruction to launch them automatically.

Systems: [[wiki/entities/Sentinel|Sentinel]], [[wiki/entities/Video|Video]].


## Plan status and next evidence

See [[wiki/sources/Implementation plan|Implementation plan]] for source conflicts
and [[wiki/topics/Delivery roadmap|Delivery roadmap]] for phase-specific evidence
needs. The active parent checkout contains ongoing changes; the historical plan's
Phase 5 deferral does not prove that no later implementation exists. Obtain a new
dated verification package before advancing this wiki's delivered-scope claims.
The absent external specification, golden fixtures and compatibility decisions
are the most direct next sources for the local/external simulation comparison.

## Judging evidence and commercial gaps

The [scorecard](<../../raw/inputs/DVL 3 month track - Judge Scorecard.pdf>), pages
2–8, accepts a C2 simulation as a demonstration format, then independently
assesses capability (40%), mission need (30%) and commercial viability (30%).
It supplies no Sentinel marks. See
[[wiki/topics/Judging evidence map|Judging evidence map]] for the full mapping.

| Claim or implication | Evidence boundary in the reviewed corpus | Next source needed |
|---|---|---|
| Simulation is accepted, therefore Sentinel is field-ready or meets the whole capability criterion | Permitted format does not establish robustness, operability or integration; the retained scripted run is not documented as held out | Scoped demonstration record and evidence for each claimed boundary |
| Named RSAF users or team service experience establish operator demand | Draft framing and self-reported experience are available; target-user contact and validated workflow are not established | Dated operator feedback and task/CONOPS evidence |
| Team, economics and market route are absent from the draft | Team biographies and pilot/incubation intentions are present, but self-reported/prospective; a substantive cost model is missing | Role commitments, scale economics and actual buyer/trial discussions |
| SAF pilot / CapVista support are secured | Draft uses prospective wording; rubric naming MINDEF/SAF does not prove Sentinel traction | Agreement or documented next step with scope, owner and date |
| Local hosting proves no foreign service dependency or MOSA compliance | Draft makes a broad sovereignty claim; provider ledger reports Google/Cesium ion content and external requests; internal contracts do not establish external interchangeability | Dependency inventory, open interface contracts and evidence for the claimed deployment mode |
| Software speed, compression or request limits establish commercial viability | Benchmarks are bounded software results and request counts are explicitly not billing counts | Deployment/support/licensing/provider cost assumptions and scale model |

Original evidence: [research draft](../../raw/inputs/Sentinel_Report_Research_draft.docx),
paragraphs 29, 44–70 and 122–132;
[provider ledger](../../raw/repository/docs/d7-details-closure/PROVIDER.md), lines
43–68; [architecture](../../raw/repository/docs/architecture.md), lines 3–17 and
62. These gaps neither erase the retained evidence nor prove that newer evidence
does not exist outside the vault.
