"""Version 1 domain authority, promoted from the reviewed Phase 0 draft.

Frozen Pydantic objects are not deeply immutable. Service/storage boundaries use
canonical JSON bytes and fresh decoded copies; never publish these objects directly.
"""
from datetime import datetime
import json
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator
from pydantic.alias_generators import to_camel


from app.domain.base import Model, Id, UtcInstant, Finite, Sequence, Longitude, Latitude
from app.commands.contracts import InteractiveRun


class Altitude(Model):
    metres: Finite
    reference: Literal["MSL", "ELLIPSOID", "AGL"]
    datum_id: Id | None = None


class Position3D(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude
    altitude: Altitude


class SourceRef(Model):
    id: Id
    kind: Literal["simulation", "sensor", "manual", "import"]
    mode: Literal["simulated", "live", "replay"]
    external_id: str | None = None
    recording_id: Id | None = None


class Provenance(Model):
    source: SourceRef
    effective_at: UtcInstant
    recorded_at: UtcInstant


class Mission(Model):
    id: Id
    name: Annotated[str, Field(min_length=1)]
    domain: Annotated[str, Field(min_length=1)]
    lifecycle: Literal["draft", "active", "completed", "cancelled"]
    created_at: UtcInstant
    updated_at: UtcInstant
    zone_ids: list[Id] = Field(default_factory=list)
    reference_point: Position3D | None = None
    extensions: dict[str, JsonValue] = Field(default_factory=dict)

    @model_validator(mode="after")
    def time_order(self):
        if self.updated_at < self.created_at:
            raise ValueError("mission updatedAt precedes createdAt")
        return self


class Classification(Model):
    scheme: Annotated[str, Field(min_length=1)]
    code: Annotated[str, Field(min_length=1)]
    label: str | None = None


class Entity(Model):
    id: Id
    mission_id: Id
    label: str
    kind: Annotated[str, Field(min_length=1)]
    classification: Classification | None = None
    affiliation: Literal["friendly", "hostile", "neutral", "unknown"]
    condition: Literal["operational", "degraded", "non-operational", "unknown"]
    presence: Literal["present", "unobserved", "removed"]
    provenance: Provenance
    extensions: dict[str, JsonValue] = Field(default_factory=dict)


class Velocity(Model):
    speed_mps: Annotated[Finite, Field(ge=0)]
    heading_true_deg: Annotated[Finite, Field(ge=0, lt=360)]
    vertical_speed_mps: Finite | None = None


class TrackSample(Model):
    timestamp: UtcInstant
    position: Position3D
    velocity: Velocity | None = None
    confidence: Annotated[Finite, Field(ge=0, le=1)] | None = None
    discontinuity: bool = False


class Track(Model):
    id: Id
    mission_id: Id
    entity_id: Id
    source: SourceRef
    state: Literal["tracking", "stale", "ended"]
    latest: TrackSample
    history_series_id: Id
    predicted_series_id: Id | None = None


class Asset(Model):
    id: Id
    mission_id: Id
    entity_id: Id
    availability: Literal["available", "assigned", "unavailable", "unknown"]
    capability_codes: list[str] = Field(default_factory=list)
    task_ids: list[Id] = Field(default_factory=list)
    provenance: Provenance


class Sensor(Model):
    id: Id
    mission_id: Id
    entity_id: Id | None = None
    modality: str
    coverage_zone_ids: list[Id] = Field(default_factory=list)
    status: Literal["available", "unavailable", "unknown"]
    provenance: Provenance


def orientation(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a, b, point):
    return orientation(a, b, point) == 0 and min(a[0], b[0]) <= point[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= point[1] <= max(a[1], b[1])


def intersects(a, b, c, d):
    x, y, z, w = orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)
    return (x * y < 0 and z * w < 0) or any((on_segment(a, b, c), on_segment(a, b, d), on_segment(c, d, a), on_segment(c, d, b)))


def inside(point, ring):
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


class Polygon(Model):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[Longitude, Latitude]]] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_rings(self):
        # Explicit planar longitude/latitude geometry. Global wrapping semantics
        # remain an adapter/provider decision; no implicit shortest-edge wrapping.
        for ring in self.coordinates:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError("polygon rings require at least four positions and closure")
            if len(set(ring[:-1])) != len(ring) - 1:
                raise ValueError("polygon rings must have distinct vertices")
            area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
            if area == 0:
                raise ValueError("polygon ring has zero area")
            edges = list(zip(ring, ring[1:]))
            for i, (a, b) in enumerate(edges):
                c = edges[(i + 1) % len(edges)][1]
                if on_segment(a, b, c) or on_segment(b, c, a):
                    raise ValueError("polygon adjacent edges overlap")
                for j in range(i + 1, len(edges)):
                    if j == i + 1 or (i == 0 and j == len(edges) - 1):
                        continue
                    if intersects(a, b, *edges[j]):
                        raise ValueError("polygon ring intersects itself")
        outer = self.coordinates[0]
        for i, hole in enumerate(self.coordinates[1:], 1):
            if not inside(hole[0], outer):
                raise ValueError("polygon hole lies outside exterior")
            for previous in self.coordinates[:i]:
                if any(intersects(a, b, c, d) for a, b in zip(hole, hole[1:]) for c, d in zip(previous, previous[1:])):
                    raise ValueError("polygon rings intersect or touch")
            for previous in self.coordinates[1:i]:
                if inside(hole[0], previous) or inside(previous[0], hole):
                    raise ValueError("polygon holes overlap")
        return self


class AltitudeBand(Model):
    lower: Altitude
    upper: Altitude

    @model_validator(mode="after")
    def consistent(self):
        if (self.lower.reference, self.lower.datum_id) != (self.upper.reference, self.upper.datum_id):
            raise ValueError("altitude band requires the same reference and datum")
        if self.lower.metres > self.upper.metres:
            raise ValueError("altitude band lower exceeds upper")
        return self


class Zone(Model):
    id: Id
    mission_id: Id
    label: str
    purpose: str
    geometry: Polygon
    altitude_band: AltitudeBand | None = None
    valid_from: UtcInstant | None = None
    valid_until: UtcInstant | None = None
    provenance: Provenance

    @model_validator(mode="after")
    def time_order(self):
        if self.valid_from and self.valid_until and self.valid_from > self.valid_until:
            raise ValueError("zone validFrom exceeds validUntil")
        return self


class Task(Model):
    id: Id
    mission_id: Id
    type: str
    status: Literal["proposed", "accepted", "active", "completed", "cancelled"]
    asset_ids: list[Id] = Field(default_factory=list)
    subject_entity_ids: list[Id] = Field(default_factory=list)
    zone_ids: list[Id] = Field(default_factory=list)
    provenance: Provenance


class SentinelEvent(Model):
    id: Id
    mission_id: Id
    sequence: Sequence
    effective_at: UtcInstant
    recorded_at: UtcInstant
    type: str
    severity: Literal["info", "warning", "critical"]
    entity_ids: list[Id] = Field(default_factory=list)
    zone_ids: list[Id] = Field(default_factory=list)
    task_ids: list[Id] = Field(default_factory=list)
    location: Position3D | None = None
    source: SourceRef
    detail_ref: Id | None = None
    extensions: dict[str, JsonValue] = Field(default_factory=dict)


class LegacyWorldFrame(Model):
    schema_version: Literal["1.0"]
    mission: Mission
    frame_id: Id
    recording_id: Id
    stream_epoch: Id
    sequence: Sequence
    effective_at: UtcInstant
    recorded_at: UtcInstant
    entities: dict[Id, Entity]
    tracks: dict[Id, Track]
    assets: dict[Id, Asset]
    sensors: dict[Id, Sensor]
    zones: dict[Id, Zone]
    tasks: dict[Id, Task]
    recent_events: list[SentinelEvent] = Field(max_length=100)

    @model_validator(mode="after")
    def integrity(self):
        def refs(ids, table, label):
            if len(ids) != len(set(ids)):
                raise ValueError(f"duplicate {label} references")
            if any(identifier not in table for identifier in ids):
                raise ValueError(f"unresolved {label} reference")

        for name in ("entities", "tracks", "assets", "sensors", "zones", "tasks"):
            for key, item in getattr(self, name).items():
                if key != item.id or item.mission_id != self.mission.id:
                    raise ValueError(f"{name} key/ID or mission mismatch")
        refs(self.mission.zone_ids, self.zones, "mission zone")
        for track in self.tracks.values():
            refs([track.entity_id], self.entities, "track entity")
            if track.latest.timestamp > self.effective_at:
                raise ValueError("track observation timestamp exceeds complete frame effectiveAt")
        for asset in self.assets.values():
            refs([asset.entity_id], self.entities, "asset entity")
            refs(asset.task_ids, self.tasks, "asset task")
        for sensor in self.sensors.values():
            refs([sensor.entity_id] if sensor.entity_id else [], self.entities, "sensor entity")
            refs(sensor.coverage_zone_ids, self.zones, "sensor zone")
        for task in self.tasks.values():
            refs(task.asset_ids, self.assets, "task asset")
            refs(task.subject_entity_ids, self.entities, "task entity")
            refs(task.zone_ids, self.zones, "task zone")
        for asset in self.assets.values():
            if any(asset.id not in self.tasks[tid].asset_ids for tid in asset.task_ids):
                raise ValueError("asset/task associations must agree in both directions")
        for task in self.tasks.values():
            if any(task.id not in self.assets[aid].task_ids for aid in task.asset_ids):
                raise ValueError("task/asset associations must agree in both directions")
        ids, sequences = set(), []
        for event in self.recent_events:
            if event.mission_id != self.mission.id or event.id in ids:
                raise ValueError("event mission mismatch or duplicate ID")
            ids.add(event.id)
            sequences.append(event.sequence)
            refs(event.entity_ids, self.entities, "event entity")
            refs(event.zone_ids, self.zones, "event zone")
            refs(event.task_ids, self.tasks, "event task")
        if any(a >= b for a, b in zip(sequences, sequences[1:])):
            raise ValueError("event sequences must be strictly increasing")
        return self


class WorldFrame(LegacyWorldFrame):
    schema_version: Literal["1.1"]
    interactive: InteractiveRun | None = None

    @model_validator(mode="after")
    def interactive_integrity(self):
        run = self.interactive
        if run is None:
            return self
        if run.mission_id != self.mission.id:
            raise ValueError("interactive mission mismatch")
        seen = set()
        for control in run.controls:
            asset = self.assets.get(control.asset_id)
            track = self.tracks.get(control.control_track_id) if control.control_track_id else None
            if control.asset_id in seen or asset is None or asset.entity_id != control.entity_id:
                raise ValueError("invalid or duplicate control Asset binding")
            seen.add(control.asset_id)
            if (control.mission_id, control.executor_id, control.source_id, control.grant_id) != (run.mission_id, run.executor_id, run.source_id, run.grant_id):
                raise ValueError("control authority mismatch")
            if control.control_track_id and (track is None or track.entity_id != control.entity_id or track.source.id != run.source_id or track.source.kind != "simulation" or track.source.mode != "simulated"):
                raise ValueError("control Track/source binding mismatch")
        if run.last_report_at and run.last_report_at > self.recorded_at:
            raise ValueError("source report is newer than the frame")
        return self


class MissionList(Model):
    schema_version: Literal["1.0"]
    missions: list[Mission]
    fixture_advance_enabled: bool = False


class EventList(Model):
    schema_version: Literal["1.0"]
    mission_id: Id
    events: list[SentinelEvent]
    next_after: Sequence | None = None


class RecordingMetadata(Model):
    schema_version: Literal["1.0"]
    id: Id
    mission_id: Id
    stream_epoch: Id
    established_at: UtcInstant
    latest_sequence: Sequence | None = None
    frame_count: Sequence
    event_count: Sequence


class AdvanceFixtureRequest(Model):
    model_config = ConfigDict(validate_by_name=False)
    expected_sequence: Sequence
