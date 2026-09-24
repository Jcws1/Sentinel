# Observe / Orient copilot

This branch ports the safe parts of the Qwen/Ollama assistant introduced at
`4fdbff5` and hardened at `7ea6069` into the current Sentinel v3 authority.
It does not port the obsolete application shell or the recommendation-to-task
staging path from `d00f362`.

## Boundary

The endpoint assesses one exact, current, committed `WorldFrame`. The server
constructs the model context; the browser cannot supply its own C2 state.
Labels and extension data are excluded because external text is untrusted.
Every material finding must cite an ID present in the frame, and the server
rejects output containing unknown evidence. The result is read-only and has no
command, recommendation-apply, shell, filesystem, sensor, or Wedgetail tool.

Configure the backend only:

```text
SENTINEL_INFERENCE_BASE_URL=https://api.groq.com/openai/v1
SENTINEL_INFERENCE_API_KEY=<backend secret>
SENTINEL_INFERENCE_MODEL=qwen/qwen3.8-27b
SENTINEL_INFERENCE_TIMEOUT_SECONDS=5
```

Never put the inference key in a `VITE_*` variable. In the cloud boundary the
POST remains operator-authenticated; an anonymous static frontend must not be
allowed to spend an inference account directly.

The isolated frontend deployment must set `VITE_SENTINEL_PRIVATE_DEMO=1` so
the access key is collected at runtime and retained only in page memory. This
flag is branch-specific and does not alter the existing public demo deployment.

## Latency target

Five seconds is a service objective, not a guarantee available from a shared
inference API. The implementation limits context, caps output at 900 tokens,
disables Qwen reasoning, uses strict structured output, and enforces a five
second provider timeout. Record client-observed p50, p95, p99, timeout, and 429
rates with the real Render region before calling the objective met.

For the initial trial, Groq's hosted Qwen endpoint is the best fit: it currently
documents roughly 450 tokens/second and strict JSON-schema output. The model is
preview, however, so production requires a pinned fallback or a contractual
endpoint. Cerebras is extremely fast, but its public Qwen offerings have had
deprecations; Qwen variants are now principally a dedicated-endpoint choice.
Fireworks or Together remain reasonable OpenAI-compatible fallbacks, but must
be benchmarked from the actual deployment because advertised token throughput
does not include network, queueing, or prompt-prefill latency.

## Observe / Orient coverage and remaining gaps

Implemented now:

- authoritative source/frame identity and freshness;
- bounded entity, track, asset, sensor, task, and event context;
- facts separated from interpretation;
- uncertainty, limitations, confidence, and evidence IDs;
- stale-frame rejection and no automatic Decide/Act transition;
- structured-output and server-side Pydantic validation;
- prompt-injection reduction by excluding free-form external metadata.

Still required before operational evaluation:

- compare multiple frames so changes, rates, novelty, and contradictions are
  computed deterministically rather than inferred from one snapshot;
- sensor coverage, collection gaps, source reliability, and cross-source
  corroboration;
- mission objectives, commander's intent, constraints, doctrine, and operator
  assumptions as separately governed, versioned context;
- explicit competing hypotheses and disconfirming evidence;
- geospatial relationships to protected areas and boundaries;
- calibrated confidence based on source quality rather than model prose;
- assessment audit persistence, retention/redaction rules, caching and quotas;
- model/provider failover and evaluation gates for unsupported claims;
- a human acknowledgement workflow before any future Decide-stage proposal.

Orientation is not merely summarisation. It is analysis and synthesis through
context, experience, assumptions, and biases. Sentinel therefore labels the
output as an assessment, exposes uncertainty and evidence, and does not present
the model as mission authority.
