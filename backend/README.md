# Sentinel backend — Phase 2

The backend owns generic Mission, Entity, Track, Asset, Sensor, Zone, Task and Event records. It serves one committed world frame through REST and WebSocket. No simulation resolver, simulation lifecycle commands, renderer, replay playback or provider integration is implemented.

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

Phase 3A adds `fixture-tactical`, labelled **Synthetic Tactical**, without changing Alpha/Bravo. It supplies arbitrary non-operational Singapore-area test points near 103.85° E, 1.35° N; four current affiliations; an entity with no Track; an explicitly stale Track associated with an unobserved entity; and a neutral `test-area` polygon. The polygon makes no defended-area, sensor-coverage or altitude-band claim. No class, confidence, readiness, assignment or simulation outcome is supplied. All positions remain Track-owned.

The guarded fixture advancement endpoint cycles through three canned spatial samples, selected by committed sequence modulo three. The former **Next fixture frame** button has been removed from the normal UI; developer and automated checks use the existing POST endpoint below. Stage 0 has six entities and five Tracks (`F-01`, `H-01`, `N-01`, `U-01`, `No position`, `Last observed`). Stage 1 moves F-01, adds F-02 and expands the test-area polygon: seven entities and six Tracks. Stage 2 removes U-01, retains F-01's identity while removing its Track, and retains F-02: six entities and four Tracks. The next stage restores the baseline sample. Effective timestamps still increase by five seconds per committed frame; the deliberately stale observation stays at its original earlier time. Source events carry sample index/stage with no object references. This fixture is a map data/lifecycle test, not a route, simulation or sensor interpretation. Stored stages survive restart, and mutation remains unavailable when `SENTINEL_FIXTURES` is disabled.

## Read and distribution contracts

| Endpoint | Behavior |
| --- | --- |
| `GET /api/missions` | Versioned mission catalog and fixture-source capability. |
| `GET /api/missions/{id}/world` | Latest complete committed WorldFrame; no-store cache policy. |
| `GET /api/missions/{id}/events?after=-1&limit=100` | Events in independent event-sequence order; limit 1–500. `nextAfter` is the last returned sequence. |
| `GET /api/recordings/{id}` | Recording identity, epoch, establishment time and durable frame/event counts. |
| `WS /api/missions/{id}/stream` | Fresh atomic snapshot on every connection, then atomic deltas and five-second heartbeats. |
| `POST /api/fixtures/{id}/advance` | Opt-in fixture-only `{ "expectedSequence": 0 }`; returns the committed frame, 409 on conflicting sequence, 404 when disabled. |

Wire `schemaVersion` is `1.0`, explicitly required alongside stream message `type`. OpenAPI and explicit JSON Schemas are generated from `app/domain/models.py` and `app/world/contracts.py` into `contracts/sentinel/v1/`; the Phase 0 draft and exports remain historical references. Omitted optional fields and explicit null are permitted by the reviewed core contract; canonical publication omits nulls. The external simulation schema has independent null/identifier/validation rules and remains outside these modules.

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
