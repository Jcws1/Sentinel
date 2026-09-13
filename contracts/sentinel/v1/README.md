# Sentinel wire contract v1

Backend authority: `backend/app/domain/models.py` and `backend/app/world/contracts.py`. `openapi.json` describes REST; `stream.schema.json` explicitly describes the server WebSocket union; `world.schema.json` and `mission-list.schema.json` support runtime validation. `fixture.world.json` is an explicitly synthetic, deterministic contract sample. Generated files must not be edited manually.

From repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/export_contracts.py
Set-Location frontend
npm.cmd run contracts:generate
```

Use `--check` on the Python export and `npm.cmd run contracts:check` for drift verification. Generation uses json-schema-to-typescript, retaining the established Phase 0 generator approach and avoiding a separate tool package or a TypeScript downgrade. Runtime checks use Ajv plus aggregate validation; generated types are not validation.

Every socket begins with a complete snapshot. Snapshot creation and registration for subsequent commits share the mission lock. Deltas carry a mission ID, stream epoch, predecessor and sequence; all table changes and appended events form one complete replacement frame. Heartbeats describe the last message sent on that socket. Queue overflow requests resynchronization and closes the stream. Reconnect always resnapshots; there is no claimed resumable backlog in Phase 2.

Frame sequences and event sequences are independent, zero-based, monotonically increasing sequences within a recording. One frame may append several events. A frame records its own identity, recording ID, epoch, effective time and commit time. Epoch and sequence survive a restart of the same database. Source time may differ from wall time, including a future effective time. UTC instants use validated calendar dates and a canonical millisecond `Z` format. Sequence values stay within JavaScript's safe integer range.

The current complete frame contains at most 100 recent events. References in that frame must resolve within the mission. Source adapters must retain identities needed by this window (an Entity can be marked removed); they must not invent geometry or status to retain identity. Historical event rows retain their original committed frame association. Event/frame journals are append-only through the service. None of these choices introduces RED/BLUE, health, drone classes or simulation lifecycle semantics into the domain.

Optional model fields permit omission or null; canonical backend publication omits null. Extension values are JSON only. The backend additionally validates key/ID agreement, membership, references, association symmetry, polygons, altitude bands and temporal ranges. Polygons use explicit planar longitude/latitude rings; global wrapping and altitude conversion are not implemented here.

The frontend runtime is the only session transport owner. It validates unknown data, builds a complete candidate frame privately, validates aggregate integrity and freezes a detached copy before publishing. Duplicate/old messages cannot roll back current state; broken continuity, invalid payloads and failed connections make the prior frame visibly stale until a verified snapshot arrives. Mission changes cancel old work and atomically clear mission-scoped presentation and selection. Historical frames occupy a separate bounded cache and cannot overwrite the live frame. Playback and seeking are deferred.

## Observed history — Phase 3B

`GET /api/missions/{id}/observed-history?entityId=...&frameId=...&windowSeconds=60` returns `ObservedHistory` v1.0 from `backend/app/recording/history.py`. OpenAPI, `observed-history.schema.json` and generated TypeScript describe it. The mission/frame anchor must exist in committed storage (404 otherwise); an identity with no observations returns an empty series. No schema migration or change to WorldFrame/WebSocket payloads is required. The endpoint is read-only and uses the same mission recording.

The inclusive interval is `[throughAt − windowSeconds, throughAt]`, with `windowSeconds` 5–300 (UI 60). Only commits at or before the anchor sequence and effective times in that interval qualify. At each frame-effective instant, the highest committed sequence through the anchor wins; a complete correction replaces that instant's frame, including absence/staleness. Repeated revisions of a `(track ID, full source reference, history series ID, observation timestamp)` use the highest qualifying sequence. Observations retain their winning frame ID/sequence/effective time/recorded time and original TrackSample. Later commits cannot mutate an earlier anchored response. This is the corrected series as known at that committed anchor, not a full bitemporal query API.

Processing orders canonical frames by effective time/sequence and segments by first observation time/track/source. Repeated unchanged samples produce one vertex. Non-present identities, absent/non-tracking observations, source/series changes, altitude reference/datum changes, explicit discontinuity, time reversal and sample gaps over 30 seconds break continuity. No browser arrival time or invented intermediate position is used. The newest 1,000 canonical frame instants and newest 2,000 observations bound the result; truncation is explicit. The frame cap also bounds full checkpoint decoding; large-recording query throughput is not certified.

The session runtime owns one in-flight read and an eight-entry immutable LRU keyed by mission/recording/epoch/frame/entity/window. Same-identity updates coalesce behind the current read so rapid frames cannot starve it. A compatible older result may remain while refreshing, with its exact trail through-time shown and samples trimmed to the current presented window. It must never have a later sequence/time, different mission/recording/epoch, or conflicting equal-sequence frame identity. Mission/selection/epoch/window changes cancel obsolete work; timeout/error is explicit, with bounded retry initiated by the user or backend recovery. Pane opening does not create another history owner or WebSocket.

Map geometry and inspector counts use the same currently displayed Track subset under shared filters; raw mission Track totals remain separate from Entity rows and Asset roles. Historical MSL heights retain their reference and use the already disclosed h≈H visual approximation in Cesium. Unsupported historical AGL/datum segments are omitted rather than assigned precise 3D geometry. Replay playback, seeking, full history browsing and predicted trajectories are not part of this contract.
