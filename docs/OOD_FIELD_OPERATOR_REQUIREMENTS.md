# Sentinel Observe–Orient–Decide Requirements

Status: MVP implementation baseline  
Scope: local Sentinel host, canonical edge-gateway data, advisory AI, operator-controlled Act

## 1. Decision boundary

Sentinel implements the first three stages of OODA as a decision-support loop:

1. **Observe** retrieves and presents the canonical C2 picture with source, freshness and uncertainty.
2. **Orient** relates observations to mission intent, constraints and deterministic eligibility results.
3. **Decide** presents valid courses of action and their evidence for operator selection.
4. **Act** remains outside AI authority. Only the existing authenticated operator workflow may validate, confirm and dispatch tasking.

The LLM never receives Gazebo truth, raw sensor or MAVLink access, command credentials, policy-mutation tools or an execution endpoint.

## 2. Public benchmark findings

| Benchmark | Publicly observable design lesson | Sentinel requirement |
|---|---|---|
| Maven Smart System | Combines diverse sensor data, algorithmic analysis and chain-of-command workflow; public Army guidance still describes user confirmation and cross-source validation. | Preserve human review, evidence and uncertainty. Never treat model output as authoritative observation or authorization. |
| Maven AMPS integration | Importing aviation mission files removed manual transcription and its associated workload and error opportunities. | Prefer structured adapters and one-click transitions over asking operators to retype information into chat. |
| CPCE | Uses a common geospatial solution, common data services and a consistent environment to reduce stove-pipes and training burden. | Keep AI embedded in the existing COP, use canonical objects, and avoid a separate AI-owned picture. |
| TAK / WebTAK | Map-first situational awareness supports overlays, chat, imagery and shared tactical data across devices; disconnected deployments can retain basic local data exchange. | Keep the map visible, make AI secondary to the COP, and provide explicit stale/offline states. |
| NATO FMN / CWIX | Interoperability is governed and validated; information must reach the right person in the right format and systems require conformance testing. | Preserve identity, timestamps, provenance and releasability placeholders; validate contracts independently of the model. |
| Lattice public C2 workflow | Presents decision points rather than raw noise and separates shared understanding, decision support and action. | Surface material changes and blockers, not continuous prose; keep Act as a distinct controlled transition. |

Primary public sources:

- U.S. Army, *Commander and Staff Guide to Data Literacy*: https://api.army.mil/e2/c/downloads/2025/04/18/6ff620cd/25-10-944-cdr-and-staff-guide-to-data-literacy-apr-25-public.pdf
- U.S. Department of Defense, Maven decision-support overview: https://www.defense.gov/News/News-Stories/Article/Article/3892427/defense-leaders-combine-top-down-guidance-with-frontline-expertise-to-develop-c/
- U.S. Army, AMPS-to-Maven integration: https://www.army.mil/article/286151/tf_cardinal_innovates_with_maven
- U.S. Army, CPCE overview: https://www.army.mil/article/168119/command_post_computing_environment
- TAK Product Center products: https://tak.gov/products
- TAK disconnected-use case: https://tak.gov/solutions/emergency
- NATO Federated Mission Networking: https://www.act.nato.int/activities/federated-mission-networking/
- NATO Federated Interoperability / CWIX: https://www.act.nato.int/activities/federated-interoperability/
- Anduril public Lattice C2 workflow: https://www.anduril.com/lattice/command-and-control

Commercial descriptions are treated as product claims, not proof of operational performance.

## 3. Responsibility matrix

| Capability | Deterministic Sentinel service | Local LLM | Operator |
|---|---:|---:|---:|
| Ingest and normalize device data | Responsible | No access | — |
| Fuse observations into canonical tracks | Responsible | No access | Reviews |
| Calculate freshness and eligibility | Responsible | Explains supplied result | Reviews |
| Retrieve relevant canonical objects | Responsible | Requests through bounded orchestrator | May request |
| Summarize and clarify | Supplies evidence packet | Responsible | Reviews |
| Extract mission fields | Validates explicit evidence | Proposes only | Confirms |
| Evaluate ROE / authority | Future deterministic evaluator | Must not authorize | Responsible |
| Rank eligible assets | Deterministic optimizer | Explains result | Selects |
| Dispatch tasking | Authenticated command workflow | Prohibited | Responsible |

## 4. Conversation states and intents

The application owns conversation state. The model does not decide which workflow exists.

Supported intents:

- `OBSERVE_AVAILABLE_ASSETS`
- `OBSERVE_STATUS`
- `EXPLAIN_BOUNDARY`
- `START_OR_UPDATE_DRAFT`
- `AMBIGUOUS_VALUE`
- `ACKNOWLEDGEMENT`
- `UNKNOWN`

Guard rules:

- Observe, Explain, Acknowledgement and Unknown intents cannot mutate a draft.
- A short standalone place or value is ambiguous until the operator confirms its field.
- Filler such as “uh”, “okay” and “sure” never supplies a field or authority.
- Schema tokens, empty output and malformed model output are replaced by a safe deterministic recovery message.
- Ready drafts are not repeatedly announced in response to unrelated questions.

## 5. Evidence contract

Every consequential answer should eventually expose:

```ts
interface OodEvidence {
  stage: 'OBSERVE' | 'ORIENT' | 'DECIDE'
  source: 'SENTINEL_C2_CANONICAL_SNAPSHOT' | 'DETERMINISTIC_OPTIMIZER'
  retrievedAt: string
  facts: Array<{
    label: string
    value: string | number
    objectId?: string
    confidence?: number
    ageMs?: number
  }>
  limitations: string[]
}
```

The MVP returns `stage`, canonical retrieval time and typed suggested actions. Object-level evidence expansion is the next increment.

## 6. Suggested-action catalogue

Suggestions are selected by deterministic state. The designer owns stable action identifiers and eligibility rules; the model may not invent executable actions.

Conversation suggestions send explicit text through the guarded router. Application actions call typed endpoints directly.

| State | Eligible examples |
|---|---|
| No draft | View available aircraft; Draft area observation; Explain AI boundaries |
| Ambiguous place | Use `<place>` as mission area; Search assets relevant to `<place>`; Cancel |
| Draft incomplete | Supply the highest-value missing field; Review draft; Cancel draft |
| Ready | Review draft; Validate draft; Change mission details |
| Validated | Request best match; Explain constraints; Edit draft |

## 7. Degraded and offline behaviour

- Canonical data age is always visible.
- The assistant states when it has only a current snapshot and cannot answer historical-delta questions.
- Loss of Ollama disables language generation but must not disable the map, validation or deterministic recommendations.
- Loss of Gazebo has no effect on assistant availability when canonical C2 data is otherwise present.
- Loss of the C2 service prevents new Observe answers and clearly marks cached information; no fabricated fallback answer is allowed.
- No suggestion may bypass authentication, validation or operator approval.

## 8. MVP usability and accuracy gates

Evaluation is scenario-based rather than based only on fluent prose:

1. An availability question returns canonical assets without creating a draft.
2. “Canberra” is treated as ambiguous and requires confirmation before mutation.
3. “uh”, “okay” and “sure” do not change a draft revision.
4. “Is this a fallback?” explains the boundary without changing a draft.
5. No response exposes JSON keys such as `operatorMessage` or raw model output.
6. Each response offers no more than four relevant next actions.
7. Observe answers identify the canonical snapshot and its retrieval time.
8. A recommendation remains deterministic, non-executable and operator-approval locked.
9. The UI remains usable at a 1280×720 field-laptop viewport.
10. Every guarded behaviour is covered by an automated transcript test.

## 9. Delivery sequence

1. Deterministic intent router, Observe availability answer and contextual pills.
2. Field-level provenance and explicit field confirmation.
3. “What changed?” backed by bounded canonical event history.
4. Orient evidence cards for conflicts, stale information and mission blockers.
5. Decide comparison packets connected to the existing deterministic optimizer.
6. Field evaluation measuring time-to-correct-answer, correction rate, ignored alerts, interaction count and operator confidence.
