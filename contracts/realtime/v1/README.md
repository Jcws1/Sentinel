# Real-time protocol v1

This package is the versioned prototype boundary for the Rust real-time slice.
It is intentionally independent of `realtime-core/src/main.rs`.

`realtime.schema.json` describes eight messages: observation, track delta, gap,
snapshot request, snapshot, command, command receipt and command outcome. Every
message carries a protocol version, immutable message ID, per-stream sequence,
emission time and correlation context. Integer millimetres preserve the current
prototype's deterministic state representation.

## Compatibility policy

- Producers MUST emit `schema_version: realtime/v1`; consumers MUST reject an
  unknown major version rather than interpreting it as v1.
- Within v1, required fields and enum meanings do not change. Additive optional
  fields require a new schema publication and consumer rollout first. The v1
  schema currently rejects unknown fields to expose accidental drift early.
- IDs are opaque and comparison is case-sensitive. `message_id`,
  `observation_id` and `command_id` never change after assignment.
- `stream_sequence` is strictly increasing within one `stream_id`; it is not a
  global order across streams. Track `revision` is strictly increasing per
  track. Source sequence is scoped to `(source_id, track_id)`.
- `correlation_id` joins one logical interaction. `causation_id` names the
  immediate triggering observation, message or command. `trace_id` is optional
  propagation metadata and must not be used for correctness.
- A command producer retries with the same `command_id` and `idempotency_key`.
  A receiver returns `duplicate` with the original disposition and never
  executes the command twice. A receipt acknowledges durable admission only;
  an outcome reports terminal execution.

## Acceptance check

From the repository root:

```powershell
python contracts/realtime/v1/validate_fixtures.py
```

The check validates all eight positive examples and verifies that wrong-version,
invalid-gap and non-idempotent command examples are rejected. JSON Schema
validation uses the backend development dependency `jsonschema`.

Cross-field and runtime acceptance rules not representable in JSON Schema are:

1. `missing_from <= missing_through`.
2. Snapshot track IDs are unique and deterministically sorted before hashing.
3. `covers_through <= stream_sequence`; deltas resume at
   `covers_through + 1` after applying a snapshot.
4. Receipt and outcome `command_id` values resolve to the command named by their
   causation chain and retain its correlation ID.
5. Replaying a retained interval or applying a checkpoint plus its suffix yields
   the same canonical state hash as uninterrupted processing.

