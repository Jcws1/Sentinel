# Diagnosis and compatibility boundary

The current baseline's **193 production files match D7's archived final SHA-256
inventory exactly**. The working-tree snapshot, not HEAD alone, is the comparison
source. CPU/GPU/display remain i7-10700K, RTX 3060 driver 32.0.16.1088 and physical
2560×1440 at 144 Hz. Existing application ports were free; foreign listeners were
left alone. Original database artifacts were inventoried without opening them.

## Recording path and storage attribution

`InteractiveService.tick` reads a strict committed world and checkpoint, constructs
a candidate under the mission lock, advances movement/schedule/behavior and
projects execution state. `_commit` opens one repository transaction;
`MissionService.commit_locked` assigns authoritative IDs/times/sequences, validates
the full world and transport delta, and calls `RecordingRepository.commit`.
The repository independently validates continuity and the append-only event tail.
Frame/event/metadata, checkpoint and any receipt commit together before publication.
SQLite remains schema 4, WAL, `synchronous=FULL`, normal 1,000-page autocheckpoint.
Strict historical readers and read-only recorded projections are untouched.

Full canonical frames retain repeated entities, profiles, schedule definitions,
execution geometry and up to 100 recent events. The append-only event journal is
also retained. Checkpoints replace one row, while frames/events remain history.
The separate 10-tick 20v20 profile attributes about 0.35 of 1.03 instrumented
seconds to Pydantic validation, 0.27 s to canonical serialization, and 0.18 s to
repository commit (inclusive costs overlap). SQLite execute time is about 0.06 s.
This does not justify removing defensive validation or changing durability.

The short probe records logical JSON UTF-8 bytes by table, frame/event counts,
database/WAL/SHM allocation, page/freelist counts and final size after normal close.
It never vacuums, alters cadence or runs a manual checkpoint to manufacture a gain.
Final size includes explicitly separate profiling ticks and End; the main matched
delta is measured before that diagnostic work. Cumulative physical write volume
and allocation-by-function are **not measured**. WAL file length is allocated
space, not cumulative writes. Neither short growth nor the historical combined
D7 footprint proves a leak. D7's 757.65 MB combined increase cannot be treated as
permanent database growth without its lifecycle/component breakdown.

## Validation bottleneck and correction

Exact saved-revision resolution and shape/geometry checks precede a deterministic
nominal execution of the same schedule rules, up to 6,200 ticks. The default
40-unit/120-action baseline completes 3,183 dry-run ticks and 127,320 movement
steps. Almost all review CPU time is in that simulation. Recursive copies of
unchanged motion geometry account for 8.064 of 17.215 profiled seconds.

`scheduler.advance` now copies the candidate dictionary without recursively
copying its read-only origin/destination. `kinematics.step` replaces scalar
progress values and returns positions; it does not mutate nested geometry. A
rejected candidate still cannot advance retained motion. Completion samples keep
their explicit deep copy. `zone_rules.blocked` first obtains current restricted
rings and returns immediately when there are none. Restricted geometry, inclusive
edge contact and every movement check still execute when applicable.

No cache, validation bypass, analytical timing approximation or changed simulation
rule was introduced. Boundaries are read on every call. Rules, units, profiles,
dependencies, geometry and revision edits need no invalidation mechanism because
the complete review is recomputed. Existing dirty/unapplied/pending guards and
revision-generation response fences are unchanged. Run still rechecks admission.

## Compatibility proof and measurement limits

The new regression goldens hash the complete canonical nominal execution,
including completion coordinates, altitude, progress, timestamps, action order,
conflict/failure reasons and dependency results. They were generated using the
preserved current baseline for default40, Sydney40, a restricted-path dependency
failure and an explicit-time conflict. Additional tests exercise candidate refusal
and newly activated/removed restrictions in both geometry models.

No stored/wire representation, reader, canonical serializer, hash rule, transaction,
request identity, UI, renderer or provider changes. No migration is needed or run.
Short accelerated backend probes establish per-workload cost; they are not real-time
soaks. Foreground validation reports both automation-action timing and browser
pointerdown-to-review-DOM timing, since locator/click scheduling can add latency.
HTTP response timing separates server/transfer wait from subsequent DOM work;
DOM availability remains a paint-opportunity proxy, not a photodiode measurement.

## Configured Video investigation before any new request

The archived D7 final network ledger records **2,373 Google requests before**
its Video capture and **1,449 during** the interrupted capture, plus 193 standard
provider requests: 4,015 external requests observed, with the guard triggered at
4,001 against 4,000. The provider was visibly ready; waiting for all streaming to
become idle was not a valid completion requirement for a moving camera. This
supports a budget-limited capture, not a demonstrated crash or viewer-recreation
defect. The source retains one role-owned Video viewer, normal SDK memory cache,
maximum screen-space error 6, 256 MiB cache plus 128 MiB overflow, attribution,
and hidden-pane suspension. No quality/cache/provider settings are changed.

A possible final configured check is bounded to **one attempt, 90 seconds total,
4,000 external requests for the whole pass** (including any critic traffic, which
is currently zero). A 3,000-request early-stop threshold reserves headroom for
already-starting requests. No retries or cap resets. It will open only the
supported standalone Video arrangement, confirm visible resident provider content
and simulated overlays, then capture a 12-second compositor window; initial
loading remains separate. The different pane combination is not a matched
before/after comparison with D7's ordinary-3D-plus-Video window. This check only
runs after other performance/test jobs finish; otherwise it remains open.
