# Documentation

Start with the [repository README](../README.md) for installation and commands.

| Document | Purpose |
|---|---|
| [25 September technical review: start here](assessment/START-HERE.md) | Morning launch, application logs, test results, changed inputs and a plain-language architecture walkthrough |
| [Architecture and codebase blueprint](architecture.md) | Canonical component map, end-to-end flows, contracts/time, persistence, security, performance and decision/review ledger |
| [Demo runbook](demo-runbook.md) | Operator/developer workflow and 20v20 setup |
| [Map setup](MAP_REFINEMENT_SETUP.md) | Local pack, providers and deployment assets |
| [Provider configuration](MAP_SERVICES_SETUP.md) | Existing environment variables and provider boundaries |
| [Testing](../frontend/tests/README.md) | Repeatable checks and measurement tools |
| [Performance results](reports/performance-stability.md) | Measured gains and unresolved acceptance limits |
| [Orchestrator](orchestrator-ui/README.md) | Unified authoring, selection/deletion, workspace compatibility and verification |
| [D7 integrated acceptance](integrated-acceptance/README.md) | Version-correct regressions, foreground demo/recovery, ten-minute workload and independent review |
| [D7 performance closure](performance-closure/README.md) | Bounded validation optimization, matched measurements, recording attribution and remaining acceptance gates |
| [D7 and Details closure](d7-details-closure/README.md) | Milestone 1 lossless storage, responsive review, static reference images and independent verification |
| [Phase 5 simulation compatibility](phase5-simulation-compatibility/README.md) | External batch workflow, deterministic contract, isolated ownership, durable recovery and separate acceptance decisions (historical) |
| [Phase 5 closure](phase5-closure/README.md) | Current Phase 5 status: exact shared polygon geometry, spec §9 scenario, system corpus, concurrent-batch measurements and the C01–C23 sign-off table |
| [Phase 6 Command Picture](phase6-command-picture/README.md) | Current analytics, recorded audit/statistics, entity comparison and native-datum vertical profile; verification and acceptance boundaries |
| [Scenario locations](scenario-location/README.md) | Origin authoring, frozen geometry, compatibility and verification |
| [Current repository cleanup](maintenance/cleanup-2026-09-21.md) | Evidence for unused-declaration removal, safe archival and preserved acceptance boundaries |
| [Current documentation verification](maintenance/documentation-2026-09-21.md) | Cleaned-source identity, onboarding checks, independent documentation review and remaining uncertainties |
| [Earlier repository cleanup](repository-cleanup/REPORT.md) | Historical 19 September organization, attribution and verification |
| [Archive index](ARCHIVE.md) | Historical raw evidence and restoration |

The original [Sentinel specification](Sentinel_v3.md) and [external simulation specification](RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md) are frozen, hash-checked inputs. [Implementation planning](IMPLEMENTATION_PLAN.md) and [demo planning](DEMO_BEHAVIOR_UI_PLAN.md) retain the existing decisions and phase history; a planned item is not proof that it is implemented. Current behavior is established by source, contracts and verification.

Phase and closure reports above are historical evidence at their stated source/date. For example, pre-Phase-6 reports that say analytics are unimplemented remain unchanged; the canonical architecture and Phase 6 delivery explain current implementation and its still-open acceptance. Cleanup and documentation acceptance do not close Phase 6, D7 or configured-Video gates; Phase 5's current status is in the [Phase 5 closure](phase5-closure/README.md).

Track documentation and reusable fixtures. Write raw screenshots, traces, recordings, profiles and test results to ignored `test-results/` directories. Historical reports retain their original findings in the local archive; they do not certify later changes.
