from typing import Annotated, Literal
from pydantic import Field
from app.domain.models import (Model, Id, Sequence, UtcInstant, Mission, Entity, Track,
                               Asset, Sensor, Zone, Task, SentinelEvent, WorldFrame)


class EntityChanges(Model):
    upserts: dict[Id, Entity]
    removes: list[Id]


class TrackChanges(Model):
    upserts: dict[Id, Track]
    removes: list[Id]


class AssetChanges(Model):
    upserts: dict[Id, Asset]
    removes: list[Id]


class SensorChanges(Model):
    upserts: dict[Id, Sensor]
    removes: list[Id]


class ZoneChanges(Model):
    upserts: dict[Id, Zone]
    removes: list[Id]


class TaskChanges(Model):
    upserts: dict[Id, Task]
    removes: list[Id]


class WorldChanges(Model):
    mission: Mission
    entities: EntityChanges
    tracks: TrackChanges
    assets: AssetChanges
    sensors: SensorChanges
    zones: ZoneChanges
    tasks: TaskChanges
    events: list[SentinelEvent]


class SnapshotMessage(Model):
    type: Literal["snapshot"]
    schema_version: Literal["1.0"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    frame: WorldFrame


class DeltaMessage(Model):
    type: Literal["delta"]
    schema_version: Literal["1.0"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    previous_sequence: Sequence
    frame_id: Id
    recording_id: Id
    effective_at: UtcInstant
    recorded_at: UtcInstant
    changes: WorldChanges


class HeartbeatMessage(Model):
    type: Literal["heartbeat"]
    schema_version: Literal["1.0"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    server_time: UtcInstant


class ResyncRequiredMessage(Model):
    type: Literal["resync-required"]
    schema_version: Literal["1.0"]
    mission_id: Id
    reason: str


StreamMessage = Annotated[SnapshotMessage | DeltaMessage | HeartbeatMessage | ResyncRequiredMessage, Field(discriminator="type")]
