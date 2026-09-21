---
title: Quantitative results
status: locally_verified
updated: 2026-09-20
tags: [results, validation, limitations]
---

# Quantitative results

## Selected abstract result

The revised abstract uses the simulated twenty-versus-twenty coordination demonstration: twenty friendly controlled units, twenty hostile scripted tracks, and twenty recorded model-defined interception outcomes. A retained independent scenario run confirms forty unique participants, twenty distinct assignment IDs, and forty non-operational entities under the mutual-loss rule. This is a demonstrated software workflow and capacity, not a success-rate estimate, sensor-detection result, or field trial. See [[wiki/sources/Fleet coordination evidence|Fleet coordination evidence]].

No verified detection-to-tasking or aircraft-deployment interval was identified. Five-member command latency samples from a no-hostile movement case cannot establish the time to respond to five hostiles. The rewrite deliberately makes no instantaneous-deployment claim.

## Previous abstract headline retained for the report

Median repeated scenario-validation response improved from **2694.2 ms to 464.6 ms**, a calculated **82.7555% reduction**, rounded to **82.8%**. This is a comparison of Sentinel's preceding implementation with its final Milestone 1 implementation, not a comparison with another product.

| Condition | Baseline | Final |
|---|---:|---:|
| First cold request | 2626.3 ms | 2570.5 ms |
| Repeated request 1 | 2585.0 ms | 473.9 ms |
| Repeated request 2 | 2977.4 ms | 464.6 ms |
| Repeated request 3 | 2694.2 ms | 458.8 ms |
| Repeated median | 2694.2 ms | 464.6 ms |
| Observed repeated range | 2585.0-2977.4 ms | 458.8-473.9 ms |

There are **three successive warm requests per implementation**, after one cold-context request, within one browser context per fixture. They are not independent users, deployments, randomized trials, or field experiments. No confidence interval was reported or inferred. The sample range describes observed variability only.

The default Singapore fixture contains forty simulated entities (twenty friendly controlled and twenty hostile scripted) and 120 scheduled actions. The browser ran locally on an Intel i7-10700K / RTX 3060 machine, Edge 153.0.4234.48, a 1440 by 900 CSS-pixel viewport and device-pixel ratio 1, on a physical 2560 by 1440, 144 Hz display.

The clock is actual browser pointer input to the authoritative Ready-to-run heading mutation. Separate assertions check visibility and the exact saved revision/content hash. This is not physical input-to-photon latency, server-only processing, operator decision time, or interception effectiveness.

The final warm path caches complete nominal analysis for the same saved scenario while refreshing admission information. The large reduction does not apply to initial validation. The final observed first cold request was 2570.5 ms. The default scenario was chosen for relevance, not to maximise the percentage: Sydney's repeated reduction was larger, but applies to a different workload.

Source: [[wiki/sources/Repository evidence|Repository evidence]], especially its raw validation records and performance ledger. The earlier abstract used this benchmark; the revised abstract prioritises the operational scenario. The timing result remains valid within its documented conditions.

## Additional verified storage result

The matched baseline and final moving 20v20 soaks reduced stored frame payload from 246548.59 to 16767.04 bytes per committed frame, **93.20%**. There was one approximately 610-second run per implementation; baseline committed 3206 frames and final committed 3268. Twenty movement checkpoints per run are observations within that run, not twenty independent trials. No confidence interval is established.

Short deterministic probes and independent critic runs corroborate lossless recording. The normalized quantity is retained frame payload, not network traffic, memory use, cumulative physical writes, or operational benefit. Closed totals include setup and teardown. This result and the validation benchmark remain suitable for the report's performance discussion.

## Adverse and unresolved evidence

Strict display acceptance passed only three of ten final feature-complete windows. The maximum documented final combined 20v20 three-dimensional plus Video stall was 208.288 ms. Overall performance acceptance remains withheld. High mean frame rates cannot override these failures.

Configured Video lacks a complete qualifying compositor window. The [[wiki/sources/Provider budget ledger|Provider budget ledger]] reports the cause: the run reached its **3,500-request dispatch allocation**, with **3,516 attempts observed** including concurrent blocked attempts. The overall ceiling was **4,000**, leaving **484** unused. This was a budget stop, not evidence of a renderer defect. The cap closed the page during the intended 30-second capture, so no compositor window was retained and the hidden/reopen checks were never reached. The resulting exit code 1 is the expected budget-stop outcome. Describe incomplete capture evidence awaiting a separately approved run. It establishes neither configured Video performance nor absence of defects; the separate strict display failures remain adverse evidence.

Two figures from that ledger are easy to misquote and must not enter the report unqualified. The **40.4 ms** resident-content readiness is measured after a fixed 12,000 ms warmup with 1,834 attempts already spent, and is not a Video load time. The request counts are browser and CDP observations, not provider billing; 2,755 of 3,462 responses came from browser cache, and repeated paths do not demonstrate repeated downloads.

The reports also retain isolated adverse cold-validation, helper-timing, and recovery observations. See the complete ledgers before making broad responsiveness or robustness claims. The available results do not quantify workload reduction or real-world mission effectiveness.


## Direct evidence

[Validation summary](../../raw/measurements/validation-summary.json),
[baseline result](../../raw/measurements/validation-before-result.json),
[final result](../../raw/measurements/validation-final-result.json),
[soak summary](../../raw/measurements/soak-summary.json), and
[performance methods](../../raw/repository/docs/d7-details-closure/PERFORMANCE.md),
lines 70-99 and 134-175. Storage used the same local machine; software versions
appear in [baseline](../../raw/repository/docs/d7-details-closure/BASELINE.md),
lines 9-13. Reported display acceptance is in
[verification](../../raw/repository/docs/d7-details-closure/VERIFICATION.md),
lines 14-15; underlying compositor traces are outside this vault.

Related: [[wiki/entities/Sentinel|Sentinel]], [[wiki/entities/Video|Video]].


## Planned targets and historical measurements

The [implementation plan](../../raw/repository/docs/IMPLEMENTATION_PLAN.md),
lines 753-763, proposes a combined target of 200 entities, five authoritative
updates per second, 60 seconds of visible history, both maps plus two analytic
panes, at least 30 FPS and selection feedback within 150 ms. These are targets,
not results. The forty-entity experiments and scenario-validation response metric
neither establish nor directly fail that different workload and interaction.

The same plan's historical follow-up (lines 18-27) reports backend-only repeated
validation changing from 4785.487 to 2268.648 ms. Those historical numbers are
not the browser pointer-to-review measurements above and are not a second sample
of the final cache benchmark. The underlying follow-up package is not captured
here; keep that result attributed to the plan.

Its opening also reports 92.72% less closed database size per frame, a different
quantity from 93.20% less stored frame payload. Both refer to matched moving-20v20
soaks; neither is a universal disk-write or network reduction. The retained
[soak summary](../../raw/measurements/soak-summary.json) preserves both quantities.
See [[wiki/topics/Delivery roadmap|Delivery roadmap]].

## What these numbers contribute to judging

The [scorecard](<../../raw/inputs/DVL 3 month track - Judge Scorecard.pdf>), pages
2–3 and 6–8, distinguishes demonstrated capability from software scale economics.
The local timing/storage results above support their named workloads; they do
not measure operator demand, staffing savings, deployment cost or commercial
viability. Provider request counts are explicitly not billing counts
([provider ledger](../../raw/repository/docs/d7-details-closure/PROVIDER.md),
lines 62–68). No judge score or estimated weighted score is derived from them.
See [[wiki/topics/Judging evidence map|Judging evidence map]].
