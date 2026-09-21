# Compatibility, recording and recovery boundaries

`POST /api/simulation/v1/commands` accepts the frozen external JSON shape. The
duplicate-aware parser, complete structural/semantic validator and pure resolver
live in `backend/app/simulation`. External drone objects do not become core world
schemas. `adapters/simulation_v1` joins each supplied row to its output health by
timestamp and ID, retaining unchanged, neutral, unknown and out-of-area rows.

The service cooperatively yields during validation and resolution. A per-service
gate serializes external commands, with a per-mission authority lock. It never
yields while the shared SQLite connection has an open transaction. Large
serialization/completion transactions can still block the event loop; measured
limits are reported separately rather than advertised as streaming real time.

After full validation, the preparation transaction records the exact raw input,
numeric-canonical identity, immutable calibration, run checkpoint, writer claim
and command-received event/frame. It commits before evaluation. Only then does
the resolver calculate the batch. Completion atomically commits every supplied
timestamp frame, every interaction (including NO_EFFECT), corrections, response,
response checksum and final run state. Its completion event joins the final
sample instead of adding a duplicate full world; commands with no samples receive
a control frame. Publication and acknowledgement follow their respective commits.

Failure before preparation leaves no accepted command. Failure after preparation
leaves pending/interrupted work and preserves the prior healthy run state. No
candidate sample publishes after a rolled-back completion. On restart pending
commands become interrupted; no hidden reevaluation occurs. The operator retries
the exact request. A completed duplicate returns the stored response before
lifecycle/profile checks. Concurrent identical requests commit once. HTTP peer
cancellation does not cancel a prepared authoritative task. Storage failures
truthfully report possible pending work, rather than claiming nothing committed.

The adapter uses structured hashes for stable mission/source/entity/track IDs.
Internal interaction IDs include run, command, timestamp and both drone IDs;
external pipe-delimited hashes are preserved verbatim even when distinct pairs
collide. Source timestamps remain separate from wall-clock recording timestamps.
Missing observations become stale/unobserved. Backward samples do not borrow
future positions or health. Supplied next-input health remains authoritative and
explicit corrections are recorded. Simultaneous outcomes share an atomic frame.

## Versioning and historical data

Current generated Sentinel package is **v1.15**. Existing wire/world versions and
frozen external v1 schemas/fixtures remain unchanged. New module types have
schemaVersion `1.0` and policyId `sentinel-simulation-v1-local-1`.

SQLite storage becomes user_version **6 only when the first external command is
prepared**. New tables are `mission_writers`, `simulation_runs`,
`simulation_commands` and `simulation_profiles`, with a mission-command index.
The upgrade is additive and transactional, with no rewriting of old rows. Normal
startup of a v5 recording does not install these tables. Historical TEXT and
current bounded SNTLZ v1 BLOB reads remain strict and byte-exact. Payloads above
the existing 16 MiB compression threshold remain TEXT; that is not an API limit.
Old binaries reject v6 rather than silently ignoring ownership. Downgrade is
unsupported: restore a separately preserved pre-upgrade copy, never edit pragma
version or remove ownership tables. All task migrations use disposable copies.

The journal verifies stored request canonical content, policy, metadata and
response checksums; unsupported/corrupt representations fail explicitly. Generic
mission commits and interactive commands cannot mutate a claimed external mission.
The source-owner override is an internal registered-writer path, not an API flag.

## Calibration and reads

NOTIONAL needs no empirical evidence. PUBLIC_PARTIAL and VALIDATED require a
separately stored reviewed artifact in an explicitly configured
`SENTINEL_CALIBRATION_REPORTS` directory. The filename is the full canonical
profile SHA-256 plus `.json`; the strict report includes dataset/hash, methodology,
counts, uncertainty, limits, reviewer and date. The accepted report and its raw
checksum are frozen into the received event. No empirical report is shipped;
integration-test reports are explicitly synthetic. A prose source summary is
not evidence or approval.

Typed run catalog/status, paged command summaries and original input reads are
under `/api/simulation/v1/runs`. Result lookup uses
`/api/simulation/v1/command-result?command_id=...`, preserving opaque IDs including
URL dot segments. The older path alias remains supported. These are Sentinel
module reads, separate from the frozen external request/response shape.
