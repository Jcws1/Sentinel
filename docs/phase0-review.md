# Phase 0 review

Completed for review, 2026-09-10. Authorisation covered Phase 0 only. Both source specifications and the existing implementation plan are unchanged. No Phase 1 shell, simulator, FastAPI service, operational stores, map renderer or provider subscription has been created.

## Deliverables

| Deliverable | Result / evidence |
| --- | --- |
| Compatibility decisions | [Decision register](../contracts/simulation/compatibility-decisions.md): confirmed boundary requirements, 23 explicit ambiguity/policy items, proposed lifecycle matrix and organiser questions. No organiser answers inferred or messages sent. |
| Initial external schemas/fixtures | [Request schema](../contracts/simulation/v1.request.schema.json), [response schema](../contracts/simulation/v1.response.schema.json), [fixture manifest](../contracts/simulation/fixtures/manifest.json). Published golden input/output retained; representative valid, invalid and deferred-semantic cases. |
| Docking comparison | [Decision report](docking-evaluation.md): **FlexLayout 0.10.8 selected** after testing both candidates in Edge, in development and production builds. Minimal experiment stays isolated. |
| Backend foundation | [Pydantic draft](../backend/drafts/domain.py), generated [world schema](../contracts/sentinel/world.schema.json) and [TypeScript types](../contracts/sentinel/world.generated.d.ts). |
| Client/session/view boundaries | [Interfaces](../contracts/sentinel/session-view.ts) and [ownership notes](../contracts/sentinel/README.md). No backend domain types imported from renderer/UI libraries; simulation fields remain outside core. |
| Demo prerequisites | [Runbook](demo-runbook.md): provider proposals, fallbacks, vertical datum assumption, accounts/costs, observed machine and later hardware gates. |

## Verification

- 43 structural/fixture/domain-boundary checks passed; [machine-readable report](../contracts/phase0-verification.json). This includes unchanged source hashes, published fixture fidelity and backend-to-schema drift checking. It does **not** certify simulation algorithms or semantic validation.
- TypeScript type checking and Vite production build passed. Full ECharts import generated the documented large-chunk warning; no product bundle optimisation attempted.
- FlexLayout passed all 11 recorded browser checks in both development and production: tabs, split/context continuity, ECharts, divider/viewport resize, two native pop-out close/reopen cycles, tab close/reopen, blocked-popup fallback and no captured pageerror events. Console diagnostics and the chart lifecycle correction are documented in the docking report.
- Golden Layout passed 9 checks before its blocked-popup preservation check failed in both environments. Injecting `window.open = () => null` left the chart absent from the visible layout with a caught “Popout blocked” error. Comparison runner exits 1 because of this losing-candidate failure; it is not hidden or relabeled a successful run.
- Screenshots of split layouts, resized pop-outs and Golden's failure were reviewed. [Production evidence](../frontend/experiments/docking/evidence-production/results.json).

## Acceptance assessment

**Phase 0 deliverables and bounded acceptance criteria are met.** The plan permits provisional policies where external answers are unavailable. The selected library meets the exercised scope; the runbook identifies proposed primary providers and hardware assumptions. This is readiness for architectural review, not authorisation to begin Phase 1 and not full simulator/map-provider conformance.

Open before later integration: organiser lifecycle/error/canonicalisation/run/profile decisions; account ownership and plan eligibility/spending cap; final demonstration hardware/monitors/network; actual urban coverage and vertical datum agreement. No immediate user answer was needed to finish the authorised Phase 0 work.

The comparison was a two-view prototype, not exhaustive docking certification. Arbitrary drag docking/reordering, real MapLibre/Cesium resources, high-frequency telemetry, hidden-opener timing, accessibility and physical multi-monitor behavior remain later validation gates. Flex's native child close returns an in-page floating panel, which the future workspace UX must handle deliberately.

Both libraries remain only in the isolated experimental package to preserve reproduction. The future product package should include only FlexLayout. Stop here for review.
