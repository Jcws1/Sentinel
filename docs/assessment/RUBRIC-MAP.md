# What to show against the assessor's scorecard

Read from the [organiser's scorecard](https://claude.ai/code/artifact/d3f7c913-4e76-4944-8671-90d24d52747e) on 25 September 2026 Singapore time. The linked page was accessible in the browser. This is an evidence map, not a predicted score.

| What the assessor evaluates | Weight | Evidence to open |
|---|---:|---|
| A repeatable working workflow | 20% | Launch the review build, load a familiar saved plan, validate it and demonstrate the supported workflow. Show recorded results and the application terminal. |
| Handling relevant unfamiliar inputs | 20% | Use the neutral baseline and changed dataset, then let Ajey choose new parameters. Explain the supported JSON schema and missing-observation behaviour. |
| Engineering behind the main capability | 30% | Follow one request through validation, authoritative state, durable recording and shared browser views. Show exact retry and failure tests. |
| Team understanding and ownership | 10% | Use the architecture explanation and code map. Explain trade-offs and your own actual contributions, including how AI tools assisted development. |
| Learning and improvement during the programme | 20% | Show dated engineering changes and their tests; add your own account of demos, feedback and mentor interactions. Repository history alone cannot prove participation. |

The scorecard also allows up to ten bonus points for deployment/integration realism. Its highest bonus descriptor is unspecified in the published page. Local remote control and an inspectable, reproducible run are useful evidence; they do not establish operational deployment.

## Keep the explanation centred on Sentinel's value

Your stated aim is to let one operator manage many units through one workspace. The most relevant implemented engineering is the common mission picture across views, scenario authoring, explicit command ownership, durable execution/observation records and recovery when a response is lost. Explain how those parts support the operator workflow before discussing optional map providers or framework choices.

The current evidence demonstrates software behaviour with synthetic scenarios. A quantified reduction in operator workload, live aircraft integration and field effectiveness require separate evidence.

## An honest iteration trail

| Change | Problem and response | Where to look |
|---|---|---|
| Geometry consistency | Certain valid mixed-scale areas passed one boundary but failed later. Shared exact predicates and independent geometry checks address the inconsistency. | [Phase 5 progress](../phase5-closure/PROGRESS.md), [geometry tests](../../backend/tests/test_geometry_exact.py) |
| Uncertain command recovery | A server can finish work while its reply is lost. The client preserves the original request for reconciliation and exact retry. | [Browser recovery tests](../../frontend/tests/browser/simulation-compatibility.spec.ts) |
| Simulation presentation | Finalized-state wording, editor ABORT confirmation and the selected run's recorded commands were corrected in Claude's candidate 6. | [Phase 5 progress](../phase5-closure/PROGRESS.md), same browser test file |
| Review observability | Application events and request correlation make validation, recording, rejection and retry visible during a live run. | [Logging tests](../../backend/tests/test_observability.py), [development notes](DEVELOPMENT-NOTES.md) |
| Assessment preparation | Test execution found a forbidden fixture dependency and a runner setup error. The evidence retains those attempts and the corresponding corrections. | [Development notes](DEVELOPMENT-NOTES.md), [final results](TEST-RESULTS.md) |

For programme engagement, use events you actually attended and feedback you actually received. The preparation pack cannot supply that personal history.
