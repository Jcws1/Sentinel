---
title: Verified scope
status: locally_verified
updated: 2026-09-20
tags: [scope, architecture]
---

# Verified scope

Sentinel is a local mission workbench for supervising simulated counter-UAS operations. Here UAS means unmanned aircraft systems. The backend is the authority for world state and commands, persisting state and receipts before publication. Frontend views share one session state and transport. See [[wiki/sources/Repository evidence]].

The operator can inspect assets, issue supported movement, patrol and interception commands, review advisory options, and inspect retained recordings. Tactical, three-dimensional, and rendered viewpoint presentations share mission context. Saved scenarios and timed actions make evaluation conditions inspectable and reproducible.

The verified larger scenario has twenty friendly controlled actors and twenty hostile observation-only scripted actors. This is not evidence of forty controlled interceptors or forty autonomous vehicles deployed in the field. The rendered viewpoint is simulated and is not a live camera feed. Overlays represent known track positions and do not verify detection or line of sight.

Recovery distinguishes a connected transport from fresh source observations. A delayed source retains committed positions and blocks affected positional commands. Exact request identities support uncertain-command recovery. These are software recovery mechanisms, not physical aircraft failsafes established in flight.

Do not equate recordings with interactive replay or scrubbing. External simulation compatibility and later analytical views remain outside the implemented milestone. No human-subject workload comparison or Sentinel aircraft field-trial result was found in the reviewed material. See [[wiki/topics/Claims and gaps]].
