---
title: Repository evidence
status: locally_verified
updated: 2026-09-20
tags: [source, evidence]
---

# Repository evidence

Repository: `C:\Archive\Coding\Sentinel3`. Raw milestone archive: `C:\Archive\Coding\Sentinel3-archive\2026-09-20-d7-details-closure`.

Selected documentation snapshots retain their repository-relative paths under `raw/repository/`. Measurement records are under `raw/measurements/`; the manifest identifies original paths and hashes.

## Main sources

- [Architecture](../../raw/repository/docs/architecture.md), especially lines 3-5, 13-15, and 25-27: authority, shared state, scope, and source-freshness recovery.
- [Demo runbook](../../raw/repository/docs/demo-runbook.md), especially the reproducible 20v20 section: supported actions and the distinction between friendly controlled actors and hostile scripted observations.
- [Milestone measurements](../../raw/repository/docs/d7-details-closure/PERFORMANCE.md), lines 70-99: validation response, sample counts, timing interpretation, and cold/helper caveats; lines 134 onward: recording soak and normalization.
- [Baseline](../../raw/repository/docs/d7-details-closure/BASELINE.md): source identity and test machine. The baseline commit is `6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`; results concern the preserved milestone snapshots, not an assertion about every future checkout.
- [Decisions](../../raw/repository/docs/d7-details-closure/DECISIONS.md): cached exact-revision analysis, refreshed admission checks, and rejected approaches.
- [Verification](../../raw/repository/docs/d7-details-closure/VERIFICATION.md): functional, recovery, storage, validation, and unresolved display gates.
- [Pacing](../../raw/repository/docs/d7-details-closure/PACING.md): compositor stalls, capture conditions, and measurement limitations.
- [Provider ledger](../../raw/repository/docs/d7-details-closure/PROVIDER.md): external request ceiling, consumption, and the budget-stop cause of the incomplete Video capture. Cited by Performance, Pacing and Verification; ingested 20 September 2026 and summarised in [[wiki/sources/Provider budget ledger|Provider budget ledger]].
- [Evidence ledger](../../raw/repository/docs/d7-details-closure/EVIDENCE.md): archived file provenance and source inventories.

## Design input, not delivery evidence

- [Sentinel v3 specification](../../raw/repository/docs/Sentinel_v3.md): the frozen design document, summarised in [[wiki/sources/Sentinel v3 specification|Sentinel v3 specification]]. [docs/README](../../raw/repository/docs/README.md) line 21 classes it a frozen, hash-checked input and states that a planned item is not proof of implementation. Ingested 20 September 2026; dated 10 September 2026.

## Raw evidence readback

- [Validation summary](../../raw/measurements/validation-summary.json), independently checked against [baseline browser result](../../raw/measurements/validation-before-result.json) and [final browser result](../../raw/measurements/validation-final-result.json).
- [Soak summary](../../raw/measurements/soak-summary.json): one baseline and one final long run, with committed-frame normalization.
- Browser timing implementation: [validation.mjs](../../raw/repository/frontend/tests/performance/validation.mjs) and [support.mjs](../../raw/repository/frontend/tests/performance/support.mjs).

See [[wiki/topics/Quantitative results|Quantitative results]] for the computed numbers and [[wiki/topics/Verified scope|Verified scope]] for interpretation. These are existing local records, not new experiments run during abstract preparation.

System: [[wiki/entities/Sentinel|Sentinel]].


## Bundle inventory and provenance

Additional retained bundle members:

- [Repository README](../../raw/repository/README.md) - project entry point at capture.
- [Milestone README](../../raw/repository/docs/d7-details-closure/README.md) - closure scope and gate summary.
- [Compatibility](../../raw/repository/docs/d7-details-closure/COMPATIBILITY.md) - recording/readback and scenario compatibility.
- [Recovery](../../raw/repository/docs/integrated-acceptance/RECOVERY.md) - stale-source, connection, receipt and durable-state boundaries.

Ingested 20 September 2026. This bundle contains documentation, harness source and
archived measurements; original paths and per-file modification timestamps are
in [the manifest](../../raw/manifest.json). Reported ledger tests are not new runs
or a certification of subsequent code. Supporting screenshots/traces not listed
in the manifest are not part of this evidence archive.


## Planning and milestone chronology

[Implementation plan](../../raw/repository/docs/IMPLEMENTATION_PLAN.md), captured
20 September 2026, is now retained as a separate source note:
[[wiki/sources/Implementation plan|Implementation plan]]. Its opening aligns with
the recorded Milestone 1 ledger, but older body status text conflicts with that
opening. Use [[wiki/topics/Delivery roadmap|Delivery roadmap]] for the reconciliation;
do not promote its future acceptance targets or uncaptured linked ledgers to results.
