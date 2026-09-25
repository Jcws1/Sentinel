# Real-time checkpoint and replay recovery invariants

Status: prototype source of truth for the `realtime/v1` boundary.

## Durable record

The append log is authoritative. An event is acknowledged as durable only after
its complete framed record is persisted. Each record includes schema version,
stream ID, stream sequence, immutable message ID and payload. A checksum or
length-delimited frame must make torn trailing writes detectable; recovery may
discard only an incomplete trailing frame, never a valid prefix.

A checkpoint is a derived acceleration structure, not a second authority. It is
published atomically after its state bytes, covered log position, schema version
and canonical state hash are durable. The checkpoint's `covers_through` denotes
the inclusive stream sequence reflected in its state.

## Processing invariants

1. A partition has exactly one state writer at a time. Routing of a given
   `track_id` remains stable for the lifetime of a partition epoch.
2. Applying the same observation, delta or command message more than once has
   the same result as applying it once. Deduplication keys survive restart for at
   least the retained replay window.
3. Track revision can only advance. A stale or duplicate revision cannot mutate
   state. A jump is a gap, not permission to silently skip history.
4. Stream sequence is contiguous at the consumer boundary. On observing `n >
   last_applied + 1`, the consumer freezes application of later deltas, reports
   the missing inclusive interval and starts recovery.
5. Commands use a separate durable stream from telemetry. Telemetry snapshot
   recovery cannot invent, repeat, erase or imply a command outcome.
6. A receipt means the command and idempotency disposition are durably recorded.
   Only a terminal outcome means command execution finished.

## Recovery algorithm

On normal restart, load the newest valid checkpoint whose schema is supported,
verify its hash, then replay the log from `covers_through + 1`. If checkpoint
validation fails, try the previous checkpoint. If none validate, replay from the
oldest retained authoritative event.

On a live gap, request replay beginning at `last_applied + 1`. If the whole
interval is retained, apply it in sequence and then release buffered suffix
events. If any required event is outside retention, request a snapshot. Apply a
snapshot only when its hash verifies and `covers_through >= last_applied`; replace
the local projection atomically, then accept only events beginning at
`covers_through + 1`. Duplicate older events are ignored by ID/sequence.

Recovery fails closed when neither a valid checkpoint nor a complete retained
history exists. The consumer exposes a stale/unavailable state and does not
present a partial projection as current.

## Determinism and verification

Canonical hashing sorts tracks by bytewise `track_id`, encodes every required
field with fixed integer widths and ordering, and hashes the schema/version tag
with the state. Implementations must not hash JSON object order or floating-point
rendering.

The release gate is a crash-matrix test at these boundaries: before log append,
during frame append, after append/before state apply, after state apply/before
checkpoint, during checkpoint publication and after checkpoint publication.
Every restart must produce the uninterrupted run's final state hash, per-track
revision and command outcome set. Also test duplicate delivery, out-of-order
delivery, retention loss requiring a snapshot, corrupt newest checkpoint and a
torn final log frame.

