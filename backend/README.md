# RTS demo authority and horizontal movement

Enable `SENTINEL_DEMO=1`; `SENTINEL_FIXTURES=1` independently enables the Alpha/Bravo/Tactical/Observations and Blank grid fixtures. Run one Uvicorn process/worker per SQLite database. The local source remains fixed-step 5 Hz. New `singapore-local-v2` demos use 155 km/h (43.05555555555556 m/s) horizontal movement, the midpoint of STING’s published cruise range. Existing/explicit v1 runs retain 20 m/s. Executions retain their persisted speed; published altitude, climb, endurance, range and equipment are reference data rather than simulated capabilities. M1.3 encounters remain deferred.

```powershell
$env:SENTINEL_FIXTURES = '1'
$env:SENTINEL_DEMO = '1'
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The frontend New demo action orchestrates create, available ownership and Start. It does not bypass server exclusion. Pause suspends movement, Resume continues it, and End retains the recording while terminalizing unfinished work. Lease expiry/navigation alone do not cancel accepted execution; explicit revocation does. Restart restores committed positions, interrupts unfinished execution, creates a new executor epoch and starts paused.

`POST /api/interactive/{missionId}/direct-moves` captures explicit bindings, a stored running-frame anchor, the original admission/start deadline, horizontal destination and per-session logical order. The existing mission lock validates global context and every binding, skips unavailable members, computes available-only group offsets from committed positions, validates endpoints and atomically supersedes/replaces accepted members. Invalid replacements do not cancel previous work. Persisted per-asset ordering prevents delayed old commands from taking over. Immutable receipts retain exact per-member outcomes; current execution and completion samples remain separate. The legacy reviewed `/moves` endpoint preserves its all-or-none M1.2 semantics.

Current [world/stream 1.4 contracts](../contracts/sentinel/v1.4/README.md), interactive/status 1.3, execution read 1.2, demo entry 1.1, receipt 1.2 and SQLite schema 3 are coordinated. [Compact-demo decisions](../docs/compact-demo/DECISIONS.md) document the profile and in-memory migration; historical contract directories remain frozen. Schema 3 adds persistent transactional Demo NNN aliases, including existing runs, without rewriting original recording JSON. Archived contracts and legacy receipt/world readers remain strict. [Contract decisions](../docs/rts-refinement/CONTRACT_DECISIONS.md), [review](../docs/rts-refinement/REVIEW.md), [backend verification](../docs/rts-refinement/BACKEND_VERIFICATION.md).

The foundation notes below retain their original phase context. The current interactive policies above supersede older no-controls/no-migration statements only for the explicitly local demonstration; the separate external Phase 5 contract is unchanged.

# Sentinel backend â€” authority, recording and observed history

The backend owns generic Mission, Entity, Track, Asset, Sensor, Zone, Task and Event records. It serves one committed world frame through REST/WebSocket and bounded observed history from those same durable recordings. No simulation resolver, simulation lifecycle commands, replay playback or provider integration is implemented in the backend.

## Run locally

From the repository root, PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
$env:SENTINEL_FIXTURES = '1'
$env:SENTINEL_DB_PATH = "$PWD/backend/data/sentinel.sqlite3"
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Use **one worker and one authority process per database**. Development frontend requests proxy `/api` to `http://127.0.0.1:8000`. The default database path is `backend/data/sentinel.sqlite3`; `SENTINEL_DB_PATH` can override it. Data persists over restart. Fixtures seed only with `SENTINEL_FIXTURES=1`, and seeding is idempotent. Without this option a new database has no missions; an existing database remains readable and the catalog advertises `fixtureAdvanceEnabled: false`.

The original foundation fixtures are `fixture-alpha` and `fixture-bravo`, labelled Synthetic Alpha and Synthetic Bravo. Their effective timestamps, observations, counts and source events are deterministic for a given sample index. Backend-generated recording/frame/event UUIDs and recorded wall times deliberately vary across clean runs. The fixture makes no claims about confidence, readiness, assignments, detection or real operational conditions. One managed resource is explicitly authored with availability `unknown`. Advance is a demo source control, guarded by `expectedSequence`, rather than an operational command.

**Blank grid** (`fixture-blank-grid`) is available under **Missions → Developer fixtures**. It supplies an empty, read-only frame: no entities, Tracks, assets, sensors, zones, tasks or source events. Tactical uses its existing dark geographic grid even when a basemap is configured. Pan, zoom and Recenter remain available; switching to another mission restores its configured basemap without changing saved settings. The reference point only supplies the initial Singapore-area map framing. This fixture does not start a demo or create an editable scenario. It seeds once on backend startup with fixtures enabled, stays unchanged unless explicitly advanced, and remains empty after advancement. Existing fixtures are unchanged.

Phase 3A adds `fixture-tactical`, labelled **Synthetic Tactical**, without changing Alpha/Bravo. It supplies arbitrary non-operational Singapore-area test points near 103.85Â° E, 1.35Â° N; four current affiliations; an entity with no Track; an explicitly stale Track associated with an unobserved entity; and a neutral `test-area` polygon. The polygon makes no defended-area, sensor-coverage or altitude-band claim. No class, confidence, readiness, assignment or simulation outcome is supplied. All positions remain Track-owned.

The guarded fixture advancement endpoint cycles through three canned spatial samples, selected by committed sequence modulo three. The former **Next fixture frame** button has been removed from the normal UI; developer and automated checks use the existing POST endpoint below. Stage 0 has six entities and five Tracks (`F-01`, `H-01`, `N-01`, `U-01`, `No position`, `Last observed`). Stage 1 moves F-01, adds F-02 and expands the test-area polygon: seven entities and six Tracks. Stage 2 removes U-01, retains F-01's identity while removing its Track, and retains F-02: six entities and four Tracks. The next stage restores the baseline sample. Effective timestamps still increase by five seconds per committed frame; the deliberately stale observation stays at its original earlier time. Source events carry sample index/stage with no object references. This fixture is a map data/lifecycle test, not a route, simulation or sensor interpretation. Stored stages survive restart, and mutation remains unavailable when `SENTINEL_FIXTURES` is disabled.

## Read and distribution contracts

Phase 3B adds **Synthetic Observations** (`fixture-observations`) as a separate opt-in fixture. Seeding commits eight frames at five-second effective intervals; F-01 has eight authored positions in three segments, a declared discontinuity and a source change. An ended alternate Track verifies deterministic source filtering without adding an Entity row. Six Entities, six Tracks and one explicitly supplied Asset role include missing speed, known zero speed, no-position and stale cases. The Asset's availability is unknown; its single fixture task is explicitly proposed. None is a simulated operational outcome. An explicit next commit removes F-01's Tracks; the following removes U-01's identity. Subsequent frames restore supplied rows. Existing fixtures remain unchanged.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/missions` | Versioned mission catalog and fixture-source capability. |
| `GET /api/missions/{id}/world` | Latest complete committed WorldFrame; no-store cache policy. |
| `GET /api/missions/{id}/events?after=-1&limit=100` | Events in independent event-sequence order; limit 1â€“500. `nextAfter` is the last returned sequence. |
| `GET /api/missions/{id}/observed-history?entityId=...&frameId=...&windowSeconds=60` | Observed Track samples as known at a committed frame. Window 5â€“300 seconds; 1,000 canonical frame instants / 2,000 points maximum, explicit truncation. No interpolation or replay playback. |
| `GET /api/recordings/{id}` | Recording identity, epoch, establishment time and durable frame/event counts. |
| `WS /api/missions/{id}/stream` | Fresh atomic snapshot on every connection, then atomic deltas and five-second heartbeats. |
| `POST /api/fixtures/{id}/advance` | Opt-in fixture-only `{ "expectedSequence": 0 }`; returns the committed frame, 409 on conflicting sequence, 404 when disabled. |

Wire `schemaVersion` is `1.0`, explicitly required alongside stream message `type`. OpenAPI and explicit JSON Schemas are generated from `app/domain/models.py` and `app/world/contracts.py` into `contracts/sentinel/v1/`; the Phase 0 draft and exports remain historical references. Omitted optional fields and explicit null are permitted by the reviewed core contract; canonical publication omits nulls. The external simulation schema has independent null/identifier/validation rules and remains outside these modules.

Observed-history response models additionally live in `app/recording/history.py`. Their explicit JSON Schema and runtime checks preserve frame/source/Track/series/time identity, correction precedence and discontinuity boundaries. See [the wire contract](../contracts/sentinel/v1/README.md#observed-history--phase-3b) for exact anchor, ordering and bounded-query semantics. Historical reads run in FastAPI's worker thread with a locked SQLite query and decode bounded checkpoints outside that lock. This reuses the existing journal without a new persistence schema.

URL-encode identifiers as a complete path parameter when constructing requests. Mission and recording read routes preserve encoded slashes through path converters because ASGI decodes `%2F` before routing; IDs remain generic domain values rather than being silently restricted to URL slugs.

Each stream begins with a snapshot captured while registering its bounded queue under the same per-mission lock used for commits. A concurrent commit therefore appears in either that snapshot or a subsequent delta. A connection uses the sequence it has actually sent in heartbeat messages, avoiding a heartbeat overtaking a pending delta. Disconnect removes its subscription. Slow consumers receive `resync-required` and are disconnected; timed-out sends terminate the stream. Reconnect always takes a new snapshot. There is no resumable backlog in this phase: this deliberate simplification resolves duplicate/out-of-order/gap continuity through client resnapshot instead of speculative merging.

The service retains no mutable authoritative world cache. SQLite's latest frame is the authority; REST reads and returned commit results decode fresh copies. Subscribers receive immutable canonical JSON text. Frozen Pydantic instances alone would not protect nested dictionaries/lists, so models supplied through internal ports are serialized and validated again before commit.

## Authority and recording policy

`recording/sqlite_repository.py` durably establishes recording identity, mission metadata, epoch and establishment time **before** `missions/service.py` invokes a source builder. Each committed frame transaction atomically writes mission metadata, the complete frame and all appended events. SQLite uses WAL, foreign keys and `synchronous=FULL`; publication happens only after successful COMMIT. A failed transaction publishes nothing. Failed first-source processing can leave an established zero-frame recording, which is an intentional audit state. SQLite failures return an explicit HTTP 503 without reporting an uncommitted update as successful.

Frame sequence and event sequence are separate monotonic safe integers, starting at zero. A frame may append multiple events; `recentEvents` contains the last 100 journal entries and the bounded events endpoint exposes older records. Frame identity, effective time, recorded time, sequence and stream epoch are persisted. Restart preserves epoch and sequencing, restores the exact last canonical frame and does not reseed over committed data. Effective time can move backward for a source correction and may be later than recorded wall time for a synthetic/imported scenario. Recorded time comes from the authority clock, clamped to the preceding commit if the system clock regresses.

A complete frame is an effective-time view: each current Track observation timestamp must be at or before `frame.effectiveAt`. Future predictions must eventually use their separate declared series. A late correction must supply a complete consistent frame at its corrected effective time. The recorded-order recent-event journal may contain entries with later effective times; no false global effective-time ordering is imposed on that journal. Replay lookup/playback policy remains Phase 7.

Boundary validation rejects invalid calendar timestamps, coercive/non-finite measurements, unsafe sequences, extra fields, ID-key mismatches, cross-mission membership, dangling/duplicate references, disagreeing bidirectional Asset/Task associations, invalid polygon rings/holes, inconsistent altitude references/datums/bands, reversed mission/zone time ranges, duplicate event identity or sequence, and non-finite nested JSON extension values. Every appended event is checked, including entries outside the 100-event presentation window.

Hard deletion of an object still referenced by a role, task or recent event is rejected. Preserve an Entity identity with `presence: removed` or `unobserved` when references still need it. Events older than the presentation window remain in their immutable original recorded frame and journal. Event references and complete checkpoints preserve history after a later unreferenced cache deletion. Track remains the sole current position owner; Asset and Entity do not copy coordinates. Source external IDs preserve raw strings independently of internal ID restrictions.

Polygon validation uses explicit planar longitude/latitude rings, exterior plus holes, either winding direction. It checks closure, distinct vertices, nonzero area, intersections, overlapping adjacent edges, hole containment and ring contact. It does not guess antimeridian/pole wrapping semantics or convert altitude datums. The separately recorded organiser compatibility questions and provider/datum decisions remain open for later adapter/renderer phases.

## Verification

From the repository root:

```powershell
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
backend/.venv/Scripts/python.exe -m compileall -q backend/app
```

To regenerate backend schemas: `backend/.venv/Scripts/python.exe scripts/export_contracts.py`. Then run the frontend's contract generator; its drift check compares generated TypeScript against the exported schemas. Runtime schema validation imports the canonical exports directly, avoiding a second schema copy.

The backend tests cover strict domain validation, recording-before-processing, initial subscription races in both task orders, immutability, failed-transaction rollback/no publication, independent event sequencing, bounded recent history, mission isolation, optimistic fixture conflicts, slow-consumer resnapshot, reconnect, heartbeat and subscription disposal, API failure visibility, durable restart and exported-schema drift.

Two dependency deprecation warnings currently originate from Starlette's TestClient using its supported-but-deprecated httpx/AnyIO aliases. They do not occur in the application server. They are reported by pytest and are not suppressed.

This is a local, single-process hackathon foundation. It has no authentication/authorization, distributed writers, database migrations beyond schema version 1, recording retention/compaction, resumable delta backlog or throughput certification. Full checkpoints trade storage for straightforward recovery and immutable replay foundations. SQLite calls are short synchronous operations; representative high-rate/large-state ingestion requires later measurement before changing the write model. Visual review and this bounded test suite do not establish operational production readiness.
