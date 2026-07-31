# Sentinel Local LLM Copilot Plan

Status: proposed MVP architecture and evaluation plan  
Scope: offline discovery, clarification, and mission-draft assistance on low-end hardware

## 1. Decision summary

Sentinel should run a small local language model as a **C2 copilot sidecar**, not as part of the edge gateway's operational data path.

The copilot may:

- discover assets, sensors, missions, and local reference material through allow-listed read tools;
- identify missing or contradictory mission details;
- ask concise clarification questions;
- create and revise a structured mission draft;
- request a recommendation from Sentinel's deterministic optimizer;
- explain the optimizer's result and the reasons assets were excluded.

The copilot may not:

- decide whether policy or rules of engagement authorize an action;
- send MAVLink, sensor, simulator, or vehicle commands;
- call task execution or engagement endpoints;
- turn conversational text directly into an executable task;
- treat generated text as authoritative system state;
- continue operating if its requested tool or returned data fails validation.

The core product rule is:

> The LLM conducts the conversation. Deterministic services establish what is true, permitted, feasible, and executable.

## 2. Current Sentinel baseline

Sentinel already provides most of the deterministic foundation:

- Node.js/TypeScript C2, edge, sensor-simulator, and UI services;
- REST and WebSocket APIs;
- canonical drone, track, mission, policy, and recommendation types;
- a deterministic assignment optimizer in `server/missionOptimizer.ts`;
- a scenario database and decision log;
- offline maps and a local-first deployment posture.

The following gaps should be closed before an LLM is connected to tasking:

1. `OperationalObjective` does not yet express time windows, mission duration, authority, source provenance, freshness requirements, geographic constraints, or communications policy.
2. `PolicyDto.rules` stores policy as free-text `expression` strings. The LLM must not interpret these as executable policy. A typed policy evaluator is required.
3. `optimizeAssignments()` currently marks some plans `AUTO_EXECUTE`, and the API immediately dispatches them. Live mode should require explicit operator confirmation. Automatic execution, if retained, should be simulation-only and separately enabled.
4. Current asset types do not consistently expose observation time, gateway receipt time, state age, commandability, ownership, or uncertainty. Discovery answers must distinguish unknown, stale, degraded, and unavailable.
5. Existing execution endpoints must never be present in the LLM tool catalogue.

## 3. Target deployment

```text
Sensors / UAVs / vehicles
          |
          v
Sentinel edge gateway ---- canonical state/events ----> Sentinel C2/API :3001
                                                        |          |
                                                        |          +--> deterministic policy,
                                                        |               feasibility and optimizer
                                                        |
                                                        +--> assistant orchestrator :3002
                                                               |       |
                                                               |       +--> allow-listed C2 tools
                                                               |
                                                               +--> llama-server (loopback only)
                                                                    quantized local model
```

Logical placement is beside C2. The model and edge gateway may share a physical computer for a demonstration, but they remain separate processes with separate resource limits. Stopping the model must not affect telemetry, state fusion, existing missions, or command acknowledgement.

Recommended bindings:

- C2/API: existing `:3001` operator-facing boundary;
- assistant orchestrator: `127.0.0.1:3002` or an internal C2-only interface;
- model server: loopback or a private process socket only;
- no model-server access from the operator LAN, edge producer network, or simulation-truth network.

## 4. Runtime recommendation

Use `llama.cpp`/`llama-server` as the first runtime because it provides:

- CPU and optional GPU inference;
- quantized GGUF model loading;
- a lightweight standalone server;
- an OpenAI-style local HTTP API;
- schema-constrained JSON responses;
- tool/function calling support;
- explicit thread, context, batch, and token controls.

The Sentinel integration should be a small TypeScript service using the existing Node.js stack. Python, CUDA, and a discrete GPU should not be production requirements.

Operational requirements:

- bind only to loopback;
- pin a reviewed runtime version and record its checksum;
- load only an allow-listed, locally provisioned GGUF with a recorded checksum;
- disable any model or adapter download during operation;
- do not enable llama.cpp's remote RPC backend;
- run under an unprivileged account with no access to device credentials;
- cap CPU threads, memory, context length, concurrent requests, and output tokens;
- keep the edge and C2 processes at higher operating-system priority than inference.

`llama.cpp` has published security advisories, including model-parsing and RPC issues. Runtime patching and model provenance are therefore part of the deployment baseline, not optional maintenance.

## 5. Model shortlist

Do not select a model from public benchmark scores alone. Run the Sentinel evaluation set on the actual target computer and choose the smallest model that passes the task gates.

| Candidate | Intended role | Why shortlist it | Expected deployment tier |
|---|---|---|---|
| Qwen3 1.7B, 4-bit GGUF | Speed/floor candidate | Apache 2.0, 32K native context, multilingual, model family designed for tool use; use non-thinking mode for routine turns | 8 GB RAM floor, CPU-only |
| Qwen3 4B, 4-bit GGUF | Primary accuracy candidate | Stronger instruction and agent/tool behavior while remaining desktop-sized | 16 GB RAM preferred, CPU-only or partial acceleration |
| Phi-4-mini-instruct 3.8B, 4-bit GGUF | Independent comparison | MIT license, designed for constrained and latency-sensitive settings, documented function-calling format | 16 GB RAM preferred |

Initial recommendation: benchmark **Qwen3 1.7B Q4** and **Qwen3 4B Q4** first, then use Phi-4-mini as the comparison model. Do not fine-tune during the first phase.

The 8 GB and 16 GB tiers are planning envelopes, not performance claims. Final context size, quantization, and concurrency must be chosen from measured peak working-set memory on the target hardware.

## 6. Low-end inference profile

The MVP should deliberately avoid each model's advertised maximum context. Long context increases prompt latency and memory while encouraging the application to dump unfiltered state into the model.

Proposed default profile:

- quantization: Q4_K_M or the closest validated 4-bit equivalent;
- context: 4,096 tokens on the floor profile, 8,192 on the preferred profile;
- maximum generated output: 256 tokens for discovery/questions, 384 for a mission draft;
- temperature: 0 to 0.2;
- parallel requests: 1;
- model mode: non-thinking for normal conversation;
- structured calls: JSON-schema constrained;
- retrieval: compact records and short excerpts only;
- session memory: structured slots plus a rolling summary, not the complete transcript;
- streaming: enabled so the operator sees useful text before completion;
- idle policy: keep the model warm during an active operator session and unload only when measured memory pressure requires it.

Performance techniques, in order:

1. Keep the prompt and returned state small.
2. Cache the static system prompt and tool definitions.
3. Use deterministic database/search tools instead of asking the model to reason over a full snapshot.
4. Limit output length and clarification questions per turn.
5. Tune CPU thread count on the target hardware.
6. Evaluate llama.cpp prompt caching and n-gram speculative decoding only after the baseline is correct.
7. Consider a smaller draft model for speculative decoding only if measurements show a benefit after accounting for extra memory.

## 7. Assistant service boundary

### Proposed API

- `POST /api/v1/assistant/turn` — submit operator text plus conversation identifier;
- `GET /api/v1/assistant/health` — model loaded state, queue depth, memory/latency telemetry, model identity;
- `GET /api/v1/assistant/conversations/:id` — auditable transcript and tool-call record;
- `GET /api/v1/assistant/drafts/:id` — return the structured draft and unresolved fields;
- `POST /api/v1/assistant/drafts/:id/validate` — invoke deterministic schema and policy pre-checks;
- `POST /api/v1/assistant/drafts/:id/request-recommendation` — pass a confirmed draft to the existing deterministic planning layer.

There should be no assistant endpoint that dispatches a vehicle command.

### Initial tool catalogue

Read-only tools:

- `list_assets(filters)`
- `get_asset_state(asset_id)`
- `list_sensors(filters)`
- `get_sensor_coverage(sensor_id, area)`
- `get_mission_context()`
- `get_weather_and_environment(area, time_window)`
- `get_policy_facts(mission_type, area, authority)`
- `search_local_references(query, filters)`
- `get_recommendation_explanation(plan_id)`

Draft-only tools:

- `create_mission_draft(fields)`
- `update_mission_draft(draft_id, patch)`
- `validate_mission_draft(draft_id)`
- `request_assignment_recommendation(draft_id)`

Explicitly prohibited tools:

- simulator or vehicle command methods;
- task confirmation or execution endpoints;
- engagement endpoints;
- policy mutation;
- arbitrary HTTP, filesystem, shell, SQL, or model-download access.

The orchestrator, not the model, implements every tool. It validates parameters, checks the operator session, enforces result size limits, removes unnecessary sensitive fields, and writes an audit entry before returning the result.

## 8. Required data contracts

### `MissionDraft`

Minimum fields:

- `id`, `revision`, `createdBy`, `createdAt`;
- `taskType`, `objective`, `area`, `targetReference` when applicable;
- `earliestStart`, `latestStart`, `deadline`, `duration`;
- `priority`, `requiredCapabilities`, `minimumConfidence`;
- `minimumReservePercent`, `communicationsPolicy`;
- `geographicConstraints`, `protectedAreas`;
- `authorityReference`, `approvalRequired`;
- `sourceUtteranceIds` and field-level provenance;
- `unresolvedFields`, `contradictions`, and `assumptions`;
- `status: DRAFT | READY_FOR_VALIDATION | VALIDATED | REJECTED | SUBMITTED`.

### `ClarificationQuestion`

- missing or conflicting field;
- concise question;
- reason the answer is required;
- allowable answer form;
- whether the field blocks recommendation or only reduces confidence.

### `AssistantToolAudit`

- conversation and turn IDs;
- operator/session identity;
- model and prompt-template versions;
- requested tool and validated arguments;
- returned record identifiers and state timestamps;
- latency, token counts, and outcome;
- created draft revision, if any;
- no hidden chain-of-thought storage.

### Typed policy result

The LLM should receive a compact result such as:

```json
{
  "decision": "ALLOWED_WITH_APPROVAL",
  "policyVersion": "policy-2026-07-31.3",
  "reasons": ["operator confirmation required"],
  "requiredApprovals": ["mission_commander"],
  "constraints": [{ "kind": "NO_GO_AREA", "areaId": "hospital-zone" }]
}
```

It must not receive a vague instruction to interpret free-text ROE.

## 9. Conversation strategy

Every turn should follow a bounded state machine:

1. Classify the turn as discovery, draft creation, draft revision, clarification answer, or explanation.
2. Load the current structured conversation state.
3. Select at most one or two allow-listed tools.
4. Validate tool arguments using JSON Schema.
5. Execute the tools outside the model.
6. Update the structured draft or missing-field list.
7. Answer concisely and ask the single highest-value blocking question.

The assistant should never ask for information Sentinel already knows with sufficient freshness. It should explicitly say when an answer depends on stale or unavailable data.

For local document discovery, begin with SQLite FTS5 or another deterministic keyword index over approved documents. Add a small embedding model only if evaluation demonstrates that keyword retrieval misses necessary evidence. This avoids running two models on the floor hardware profile.

## 10. Accuracy and latency evaluation

Create a versioned, offline evaluation pack before selecting the production model.

### Dataset

- 120 gold mission-intake conversations across observation, search, relay, escort, resupply, and medical/logistics scenarios;
- incomplete, contradictory, and ambiguous requests;
- fresh, stale, degraded, disconnected, and unknown asset states;
- multilingual and shorthand operator phrasing relevant to the demo;
- prompt-injection attempts contained in retrieved documents and sensor text;
- requests for unavailable or prohibited tools;
- deterministic expected drafts, clarification questions, tool calls, and explanations.

Use simulated or fictional operational data for development and testing.

### Hard acceptance gates

- 100% syntactically valid schema-constrained tool calls and mission drafts;
- 0 unauthorized tool calls accepted by the orchestrator;
- 0 direct execution or policy-mutation paths exposed to the model;
- at least 95% required-field extraction accuracy;
- at least 95% recall for blocking missing or contradictory fields;
- at least 95% correct tool selection on the gold set;
- 100% preservation of source timestamps and stale/unknown labels in explanations;
- deterministic validator produces the same outcome with the model enabled or disabled;
- every saved draft and tool call is auditable and attributable.

### Performance gates

Measure on the actual low-end target with C2, edge, UI, and simulator running:

- warm time-to-first-token p95 at or below 2 seconds;
- normal discovery/clarification turn p95 at or below 6 seconds;
- structured mission draft p95 at or below 8 seconds;
- no dropped edge observations or missed command acknowledgements while inference is active;
- assistant memory stays inside the selected 8 GB or 16 GB deployment envelope;
- model startup at or below 20 seconds from local storage;
- graceful `assistant unavailable` behavior if the model is stopped or resource-limited.

Quality gates take precedence over latency. If the 1.7B model misses the quality threshold, move to 4B rather than weakening validation or letting the model infer policy.

## 11. Implementation sequence

### Phase 0 — safety and contracts

1. Define the target low-end hardware profile.
2. Convert policy rules from free text to a typed deterministic representation.
3. Add freshness, commandability, authority, and provenance to asset/mission contracts.
4. Require operator confirmation for all live assignment plans; isolate any simulation-only auto-execution.
5. Create the gold assistant evaluation pack.

### Phase 1 — local inference spike

1. Package a pinned llama-server binary for the target OS.
2. Benchmark Qwen3 1.7B Q4 and Qwen3 4B Q4 using the same prompts and context limits.
3. Add Phi-4-mini Q4 if neither candidate clearly meets both quality and speed goals.
4. Record tokens/second, prompt-processing rate, TTFT, peak working set, startup time, and evaluation accuracy.
5. Select one model and preserve the benchmark report with model/runtime checksums.

### Phase 2 — advisory copilot

1. Add the TypeScript assistant orchestrator and health endpoint.
2. Implement read-only discovery tools and compact result schemas.
3. Implement conversation state, audit records, and structured clarifications.
4. Integrate the UI without any draft or task mutation.

### Phase 3 — mission drafting

1. Add `MissionDraft` storage and revision history.
2. Allow only draft creation and updates from the assistant.
3. Add deterministic validation and recommendation requests.
4. Require the operator to review a field-level diff before submission.

### Phase 4 — hardening

1. Exercise model failure, timeout, malformed output, stale state, prompt injection, and resource exhaustion.
2. Verify C2 and edge behavior while the model is killed, restarted, or intentionally CPU-throttled.
3. Add signed offline update bundles for runtime, model, prompts, policies, and indexes.
4. Repeat the full evaluation after every model, prompt, tool, or policy change.

## 12. Reference Sentinel host

The planning and acceptance baseline is a lower-spec 2025 ASUS Zenbook 14 OLED rather than a workstation:

| Component | Reference configuration |
|---|---|
| Model | ASUS Zenbook 14 OLED UX3405CA |
| Operating system | Windows 11 24H2 or later |
| Processor | Intel Core Ultra 5 225H |
| CPU topology | 14 cores / 14 threads: 4 performance, 8 efficient, 2 low-power efficient |
| CPU frequency | Up to 4.9 GHz |
| Memory | 16 GB soldered LPDDR5X, dual channel |
| Graphics | Integrated Intel Arc 130T; no discrete GPU assumed |
| NPU | Intel AI Boost, up to 13 INT8 TOPS |
| Storage | 512 GB PCIe 4.0 NVMe SSD |
| Power envelope | Thin-laptop thermal envelope; sustained inference must be measured on AC and battery |

This is a **single-host deployment**. The edge gateway, Sentinel C2/operator software, assistant orchestrator, local model runtime, offline database, and operator-facing API all run on this Zenbook. Phones, tablets, and other laptops are thin clients and do not run the model.

The initial acceptance baseline is CPU-only llama.cpp using AVX2. The integrated GPU and NPU are optional later optimizations; Sentinel must not depend on model-specific NPU conversion or a discrete GPU.

### Reference-host process budget

Priority order:

1. edge ingestion, normalization, source health, and command acknowledgement;
2. Sentinel C2 state, policy, optimizer, audit, and operator API;
3. operator UI and offline map services;
4. assistant orchestrator and local LLM;
5. document indexing and other background maintenance.

Initial LLM limits:

- one inference request at a time;
- Qwen3 1.7B Q4 with a 4K context as the guaranteed floor profile;
- Qwen3 4B Q4 with a 4K context as the preferred quality profile if the full-stack benchmark passes;
- no more than 384 generated tokens per turn;
- start with four inference threads, then benchmark four, six, and eight without changing edge/C2 priority;
- low process priority and cancellation/backpressure when C2 health degrades;
- no inference while the machine is thermally throttled enough to violate edge or UI latency gates;
- keep at least 15% system memory available during the full-stack workload;
- reserve at least 25 GB of SSD space for Windows updates, logs, audit retention, and safe rollback; model bundles should remain a small, fixed allow-list.

### Field and simulation profiles

**Field profile:** edge, C2, UI/API, offline maps, assistant, and model run on the Zenbook. The 4B model is the target if it passes the quality and latency gates.

**Integrated demo profile:** if Gazebo/PX4 SITL and the sensor simulator also run on the same Zenbook, begin with the 1.7B model. The 4B model is allowed only if the full stack shows no dropped observations, missed acknowledgements, UI stalls, or memory pressure.

The assistant remains optional in both profiles. Sentinel must shed or stop LLM inference before reducing operational service quality.

### Remaining product inputs

Hardware is now fixed for planning. The remaining inputs are:

- languages required for the MVP;
- acceptable maximum response time during field use;
- whether Gazebo/PX4 SITL must run on the same Zenbook during the demonstration;
- expected number and size of approved local documents;
- expected number of simultaneous operator devices.

## 13. Primary references

- [llama.cpp HTTP server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [llama.cpp speculative decoding](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md)
- [llama.cpp security advisories](https://github.com/ggml-org/llama.cpp/security)
- [GGUF format](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)
- [Qwen3 1.7B model card](https://huggingface.co/Qwen/Qwen3-1.7B)
- [Qwen3 4B model card](https://huggingface.co/Qwen/Qwen3-4B)
- [Qwen function-calling guidance](https://qwen.readthedocs.io/en/stable/framework/function_call.html)
- [Phi-4-mini-instruct model card](https://huggingface.co/microsoft/Phi-4-mini-instruct)
- [ASUS Zenbook 14 OLED UX3405CA specifications](https://www.asus.com/in/laptops/for-home/zenbook/asus-zenbook-14-oled-ux3405/shop-ux3405ca/)
- [Intel Core Ultra 5 225H specifications](https://www.intel.com/content/www/us/en/products/sku/241749/intel-core-ultra-5-processor-225h-18m-cache-up-to-4-90-ghz/specifications.html)
