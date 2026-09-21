# Phase 6 — Command Picture and Vertical Engagement Profile

Phase 6 is authorized separately from the unfinished Phase 5 closure. The current
delivery provides six lenses within Command Picture, plus a reusable Vertical
Profile workspace tab and split view. Complete functional regression passes;
overall acceptance is withheld on measured combined-Profile performance.
[DELIVERY.md](DELIVERY.md) records exact gates and source identity. Neither
implementation nor a critic score certifies the deferred Phase 5 obligations.

## Use

Load a live interactive mission, an ended recording, or use Simulation → Inspect
mapped mission for a supported external run. Open **Command Picture** from the
activity bar or Views. Shared entity filters affect current charts and both maps.

| Lens | Question / scope |
| --- | --- |
| Overview | What entities are present? One displayed observation per entity; affiliation, classification and observed/stale/unlocated counts; filtered and mission totals remain distinct. |
| Resources | Which explicitly managed Asset records are available? Availability, condition, control eligibility, assignments and retained executions have separate denominators. BLUE alone gives no authority. |
| Recorded activity | What requests, transitions and outcomes were journaled? Literal search and event/request filtering, stable pages and an immutable recording cutoff. Exact retry identities are retained. |
| Statistics | What was recorded in this range? Event/request/outcome buckets and distinct affected entities. Selected retained telemetry supplies sample-weighted summaries with explicit missing counts. |
| Comparison | How do up to four shared selections compare on supplied speed, native altitude or observation age? Raw bars and numeric values, with unknowns preserved. |
| Vertical profile | Where are compatible native altitudes relative to a declared fixed horizontal origin? Current bounded presentation plus optional retained observed history. |

Open **Vertical Profile** from Views, or **Open profile to side** in the card. Each
profile can choose a native altitude group and a fixed origin captured from an
observed selected entity. Earlier history than that capture is excluded. The
mission/location reference is the default. The vertical axis is never terrain
clearance. Original MSL, ellipsoid and AGL references are not relabelled; AGL and
incompatible datums are excluded because no authoritative geoid/terrain conversion
is configured. Numeric rows support keyboard selection and existing Details.

Audit/statistics initially capture the current committed frame. Change the UTC
recording range and choose **Read range**; choose **Use latest cutoff** to explicitly
capture a newer frame, then read it. This does not seek the mission or change live
viewing time. Pages contain at most 50 rows, and all rows remain reachable. A summary
over more than 20,000 matching rows says it is incomplete; narrow the range for a
complete aggregate. This is recorded operational audit, not a tamper-proof log.

Confidence, coverage, predictive risk, aircraft capability scores and real-world
effectiveness are unavailable. External historical interruption timestamps and
unsubmitted/rejected external requests are not in the existing journal; inspect
Simulation for current recovery status. Pending/accepted/completed labels describe
the authoritative record being shown, not a fabricated merged lifecycle.

## Evidence and policies

- [Baseline and preservation](BASELINE.md)
- [Plan, scope and predeclared budgets](PLAN.md)
- [Metric dictionary and altitude/origin policy](METRICS.md)
- [Deferred Phase 5 closure](PHASE5-DEFERRED.md)
- [Requirements and verification](VERIFICATION.md)
- [Regression investigation](REGRESSION.md)
- [Performance](PERFORMANCE.md)
- [Narrow history-read correction](HISTORY.md)
- [Independent findings and failed attempts](CRITIC-1.md)
- [Independent corrected-source review](CRITIC-2.md)
- [Independent final-source follow-up](CRITIC-3.md)
- [Complete matrix and subsequent independent findings](CRITIC-4.md)
- [Independent tuple, tooltip and combined-performance review](CRITIC-5.md)
- [Independent tooltip correction and rejected cadence experiment](CRITIC-6.md)
- [Independent current-marker native tooltip finding](CRITIC-7.md)
- [Independent final tooltip correction and acceptance review](CRITIC-8.md)
- [Fresh final review and audit-search correction](CRITIC-9.md)
- [Delivery and cleanup](DELIVERY.md)

No replay controls, operational pop-outs, new providers, simulation bridge,
persistence migration or combat rule changes are included.
