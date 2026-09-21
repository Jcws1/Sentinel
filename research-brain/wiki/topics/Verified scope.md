---
title: Verified scope
status: locally_verified
updated: 2026-09-20
tags: [scope, architecture]
---

# Verified scope

Sentinel is a local mission workbench for supervising simulated counter-UAS operations. Here UAS means unmanned aircraft systems. The backend is the authority for world state and commands, persisting state and receipts before publication. Frontend views share one session state and transport. See [[wiki/sources/Repository evidence|Repository evidence]].

That authority split is not incidental. It is architecture invariant 5 of the [[wiki/sources/Sentinel v3 specification|Sentinel v3 specification]], paired with invariant 13, that the browser visualises and requests actions but must not become authoritative for mission logic. The specification is design intent only, but here the intent and the verified implementation agree, which is what makes the split reportable as a decision rather than an accident.

The operator can inspect assets, issue supported movement, patrol and interception commands, review advisory options, and inspect retained recordings. Tactical, three-dimensional, and rendered viewpoint presentations share mission context. Saved scenarios and timed actions make evaluation conditions inspectable and reproducible.

The verified larger scenario has twenty friendly controlled actors and twenty hostile observation-only scripted actors. This is not evidence of forty controlled interceptors or forty autonomous vehicles deployed in the field. The rendered viewpoint is simulated and is not a live camera feed. Overlays represent known track positions and do not verify detection or line of sight.

The provider ledger reports that in one bounded run the configured Video viewpoint visibly displayed third-party photorealistic map content with provider attribution, alongside moving simulated-unit labels, in a normal docked canvas with all forty tracks active. That confirms the viewpoint renders real provider imagery; it remains simulated map data, not sensor or camera observation, and the run ended at its request ceiling before a complete capture. See [[wiki/sources/Provider budget ledger|Provider budget ledger]].

Recovery distinguishes a connected transport from fresh source observations. A delayed source retains committed positions and blocks affected positional commands. Exact request identities support uncertain-command recovery. These are software recovery mechanisms, not physical aircraft failsafes established in flight.

Do not equate recordings with interactive replay or scrubbing. The retained Milestone 1 evidence does not establish external simulation
compatibility or later analytical views as delivered. This describes that reviewed
milestone, not the current unverified checkout. The [[wiki/sources/Sentinel v3 specification|Sentinel v3 specification]] agrees on both points from the design side: it places timeline scrubbing in "longer term" work and lists replay scrubbing only among items that should work if time permits, so the original specification alone does not establish delivery of scrubbing. The implementation plan separately retains replay as a later obligation, as recorded below. It does, however, list the external simulation adapter as a "Must Work" priority, which the milestone material does not evidence as delivered. No human-subject workload comparison or Sentinel aircraft field-trial result was found in the reviewed material. See [[wiki/topics/Claims and gaps|Claims and gaps]].


## Evidence and navigation

Authority/views: [architecture](../../raw/repository/docs/architecture.md), lines
3-17. Recovery: [recovery ledger](../../raw/repository/docs/integrated-acceptance/RECOVERY.md),
connected-stalled-source and persisted-recording rows. Provider capture:
[provider ledger](../../raw/repository/docs/d7-details-closure/PROVIDER.md), lines
41-84. These are historical records, not a new application run.

Related: [[wiki/entities/Sentinel|Sentinel]], [[wiki/entities/Video|Video]].


## Implementation-plan cross-check

The [implementation plan](../../raw/repository/docs/IMPLEMENTATION_PLAN.md),
lines 3-16, corroborates the documented Milestone 1 boundary; its older body
status statements conflict with that opening. Scope here continues to follow
the retained verification records, not whichever plan paragraph says "current".

Sections 1 and 10 retain replay, operational pop-outs and other later acceptance
obligations, including some optional items from the original specification.
Their absence from the verified milestone is an outstanding delivery boundary,
not proof that they were removed from the project. The plan's external batch
adapter is separate from the local executor and is not established by toy outcomes.
See [[wiki/topics/Delivery roadmap|Delivery roadmap]].

## Scope in the judging rubric

The [judge scorecard](<../../raw/inputs/DVL 3 month track - Judge Scorecard.pdf>),
page 2, expressly permits a simulation result for a C2 agent. This supports using
the retained simulation as one form of demonstration; it adds no new Sentinel
capability or field validation. The historical 20v20 fixture is scripted and is
not documented as held out. Open interfaces, robustness and operability remain
separate considerations. See
[[wiki/topics/Judging evidence map|Judging evidence map]].
