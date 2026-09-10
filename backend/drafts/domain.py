"""Phase 0 domain/transport draft only. No service, persistence or simulator.

Pydantic is the wire-shape authority. CamelCase aliases are exported to JSON;
renderer handles and client session/workspace state must never enter this file.
"""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from pydantic.alias_generators import to_camel

Id = Annotated[str, Field(min_length=1)]
UtcInstant = Annotated[str, Field(pattern=r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')]
Finite = Annotated[float, Field(allow_inf_nan=False)]
Sequence = Annotated[int, Field(ge=0, le=9007199254740991)]

class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', alias_generator=to_camel,
                              populate_by_name=True, frozen=True, allow_inf_nan=False)

class Altitude(Model):
    metres: Finite
    reference: Literal['MSL', 'ELLIPSOID', 'AGL']
    datum_id: str | None = None

class Position3D(Model):
    longitude_deg: Annotated[float, Field(ge=-180, le=180)]
    latitude_deg: Annotated[float, Field(ge=-90, le=90)]
    altitude: Altitude

class SourceRef(Model):
    id: Id
    kind: Literal['simulation', 'sensor', 'manual', 'import']
    mode: Literal['simulated', 'live', 'replay']
    external_id: str | None = None
    recording_id: Id | None = None

class Provenance(Model):
    source: SourceRef
    effective_at: UtcInstant
    recorded_at: UtcInstant

class Mission(Model):
    id: Id
    name: str
    domain: str
    lifecycle: Literal['draft', 'active', 'completed', 'cancelled']
    created_at: UtcInstant
    updated_at: UtcInstant
    zone_ids: list[Id] = Field(default_factory=list)
    reference_point: Position3D | None = None
    extensions: dict[str, JsonValue] = Field(default_factory=dict)

class Classification(Model):
    scheme: str
    code: str
    label: str | None = None

class Entity(Model):
    id: Id
    mission_id: Id
    label: str
    kind: str
    classification: Classification | None = None
    affiliation: Literal['friendly', 'hostile', 'neutral', 'unknown']
    condition: Literal['operational', 'degraded', 'non-operational', 'unknown']
    presence: Literal['present', 'unobserved', 'removed']
    provenance: Provenance
    extensions: dict[str, JsonValue] = Field(default_factory=dict)

class Velocity(Model):
    speed_mps: Annotated[float, Field(ge=0)]
    heading_true_deg: Annotated[float, Field(ge=0, lt=360)]
    vertical_speed_mps: Finite | None = None

class TrackSample(Model):
    timestamp: UtcInstant
    position: Position3D
    velocity: Velocity | None = None
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None
    discontinuity: bool = False

class Track(Model):
    id: Id
    mission_id: Id
    entity_id: Id
    source: SourceRef
    state: Literal['tracking', 'stale', 'ended']
    latest: TrackSample
    history_series_id: Id
    predicted_series_id: Id | None = None

class Asset(Model):
    id: Id
    mission_id: Id
    entity_id: Id
    availability: Literal['available', 'assigned', 'unavailable', 'unknown']
    capability_codes: list[str] = Field(default_factory=list)
    task_ids: list[Id] = Field(default_factory=list)
    provenance: Provenance

class Sensor(Model):
    id: Id
    mission_id: Id
    entity_id: Id | None = None
    modality: str
    coverage_zone_ids: list[Id] = Field(default_factory=list)
    status: Literal['available', 'unavailable', 'unknown']
    provenance: Provenance

class Polygon(Model):
    type: Literal['Polygon'] = 'Polygon'
    coordinates: list[list[tuple[Annotated[float, Field(ge=-180, le=180)], Annotated[float, Field(ge=-90, le=90)]]]]

class AltitudeBand(Model):
    lower: Altitude
    upper: Altitude

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

class Task(Model):
    id: Id
    mission_id: Id
    type: str
    status: Literal['proposed', 'accepted', 'active', 'completed', 'cancelled']
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
    severity: Literal['info', 'warning', 'critical']
    entity_ids: list[Id] = Field(default_factory=list)
    zone_ids: list[Id] = Field(default_factory=list)
    task_ids: list[Id] = Field(default_factory=list)
    location: Position3D | None = None
    source: SourceRef
    detail_ref: Id | None = None
    extensions: dict[str, JsonValue] = Field(default_factory=dict)

class WorldFrame(Model):
    schema_version: Literal['0.1-draft'] = '0.1-draft'
    mission: Mission
    frame_id: Id
    stream_epoch: Id
    sequence: Sequence
    effective_at: UtcInstant
    entities: dict[Id, Entity]
    tracks: dict[Id, Track]
    assets: dict[Id, Asset]
    sensors: dict[Id, Sensor]
    zones: dict[Id, Zone]
    tasks: dict[Id, Task]
    recent_events: list[SentinelEvent]

class ReplayFrame(Model):
    recording_id: Id
    requested_at: UtcInstant
    resolved_at: UtcInstant
    frame: WorldFrame
