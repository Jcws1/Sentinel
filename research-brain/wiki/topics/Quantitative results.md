---
title: Quantitative results
status: locally_verified
updated: 2026-09-20
tags: [results, validation, limitations]
---

# Quantitative results

## Selected abstract result

Median repeated scenario-validation response improved from **2694.2 ms to 464.6 ms**, a calculated **82.7556% reduction**, rounded to **82.8%**. This is a comparison of Sentinel's preceding implementation with its final Milestone 1 implementation, not a comparison with another product.

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

Source: [[wiki/sources/Repository evidence]], especially its raw validation records and performance ledger. The abstract reports rounded seconds and the same bounded interpretation.

## Additional verified storage result

The matched baseline and final moving 20v20 soaks reduced stored frame payload from 246548.59 to 16767.04 bytes per committed frame, **93.20%**. There was one approximately 610-second run per implementation; baseline committed 3206 frames and final committed 3268. Twenty movement checkpoints per run are observations within that run, not twenty independent trials. No confidence interval is established.

Short deterministic probes and independent critic runs corroborate lossless recording. The normalized quantity is retained frame payload, not network traffic, memory use, cumulative physical writes, or operational benefit. Closed totals include setup and teardown. This result is suitable for the report's efficiency discussion, but the validation result is more directly related to the operator's review workflow.

## Adverse and unresolved evidence

Strict display acceptance passed only three of ten final feature-complete windows. The maximum documented final combined 20v20 three-dimensional plus Video stall was 208.288 ms. Configured Video lacks a complete qualifying compositor window within its request budget. Overall performance acceptance remains withheld. High mean frame rates cannot override these failures.

The reports also retain isolated adverse cold-validation, helper-timing, and recovery observations. See the complete ledgers before making broad responsiveness or robustness claims. The available results do not quantify workload reduction or real-world mission effectiveness.
