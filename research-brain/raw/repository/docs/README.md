# Documentation

Start with the [repository README](../README.md) for installation and commands.

| Document | Purpose |
|---|---|
| [Architecture](architecture.md) | Current ownership and compatibility boundaries |
| [Demo runbook](demo-runbook.md) | Operator/developer workflow and 20v20 setup |
| [Map setup](MAP_REFINEMENT_SETUP.md) | Local pack, providers and deployment assets |
| [Provider configuration](MAP_SERVICES_SETUP.md) | Existing environment variables and provider boundaries |
| [Testing](../frontend/tests/README.md) | Repeatable checks and measurement tools |
| [Performance results](reports/performance-stability.md) | Measured gains and unresolved acceptance limits |
| [Orchestrator](orchestrator-ui/README.md) | Unified authoring, selection/deletion, workspace compatibility and verification |
| [D7 integrated acceptance](integrated-acceptance/README.md) | Version-correct regressions, foreground demo/recovery, ten-minute workload and independent review |
| [D7 performance closure](performance-closure/README.md) | Bounded validation optimization, matched measurements, recording attribution and remaining acceptance gates |
| [D7 and Details closure](d7-details-closure/README.md) | Milestone 1 lossless storage, responsive review, static reference images and independent verification |
| [Scenario locations](scenario-location/README.md) | Origin authoring, frozen geometry, compatibility and verification |
| [Repository cleanup](repository-cleanup/REPORT.md) | Archive, attribution and verification of this organization pass |
| [Archive index](ARCHIVE.md) | Historical raw evidence and restoration |

The original [Sentinel specification](Sentinel_v3.md) and [external simulation specification](RED_TEAM_DRONE_ATTACK_SIMULATION_SPEC.md) are frozen, hash-checked inputs. [Implementation planning](IMPLEMENTATION_PLAN.md) and [demo planning](DEMO_BEHAVIOR_UI_PLAN.md) retain the existing decisions and phase history; a planned item is not proof that it is implemented. Current behavior is established by source, contracts and verification.

Track documentation and reusable fixtures. Write raw screenshots, traces, recordings, profiles and test results to ignored `test-results/` directories. Historical reports retain their original findings in the local archive; they do not certify later changes.
