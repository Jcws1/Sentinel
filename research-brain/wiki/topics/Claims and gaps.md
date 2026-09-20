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
| Multi-sensor confidence scoring or real sensor fusion | The current milestone does not establish operational sensor ingestion or validated detection performance | Mark as proposed or require separate implementation/test evidence |
| Validated Thales, Wedgetail, Anchor, MAVLink or PX4 integration | The research draft asserts integrations; reviewed current evidence does not substantiate them | Obtain dated interface records and joint test results before claiming validation |
| GNSS-denied or network-denied aircraft capability | Software connection-loss and stale-source recovery do not establish aircraft navigation performance | Keep the software/flight distinction explicit |
| Forty controlled interceptors | The verified fixture is twenty friendly controlled plus twenty hostile scripted observation-only entities | State the composition exactly |
| Faster operational decisions | Cached scenario-review response is faster in the local benchmark | Report the exact software metric only |
| Sustained smooth display or complete readiness | Strict display acceptance fails; configured Video evidence is incomplete | Retain the open acceptance gates |
| Current prototype matches all specification pages | `Sentinel_v3.md` and implementation plans include deferred features | Use current implementation and verification ledgers for delivered claims |
| External conflict statistics and competitor dependencies | Draft citations and embedded tables were not independently verified here | Verify primary sources before incorporating them into the report |

Sources: [[wiki/sources/Research draft]], [[wiki/sources/Repository evidence]], and [[wiki/topics/Quantitative results]].

## Highest-value next evidence

Confirm the actual implemented partner interfaces, if any. Design a human-factors comparison with a clear baseline and workload measures. Repeat the local timing benchmark across independent sessions and additional machines before estimating a confidence interval. Resolve display acceptance and qualify hardware-in-the-loop or field testing separately from simulated outcomes.

This list proposes evidence to obtain; it is not a claim that these tests have been performed or an instruction to launch them automatically.
