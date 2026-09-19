from typing import Annotated, Literal
from pydantic import Field, model_validator
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


from app.commands.contracts import InteractiveRun


from app.scenarios.contracts import ScenarioBinding
from app.scenarios.boundaries import BoundaryRules
from app.commands.schedule_contracts import ScenarioSchedule
from app.commands.boundary_contracts import LiveBoundaries
from app.commands.behavior_contracts import FleetBehavior
from app.commands.unit_profiles import UnitProfile


class WorldChanges(Model):
    unit_profiles: dict[Id, UnitProfile] = Field(default_factory=dict)
    fleet_behavior: FleetBehavior | None = None
    live_boundaries: LiveBoundaries | None = None
    scenario_schedule: ScenarioSchedule | None = None
    scenario: ScenarioBinding | None = None
    boundary_rules: BoundaryRules | None = None
    interactive: InteractiveRun | None = None
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
    schema_version: Literal["1.10", "1.11"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    frame: WorldFrame

    @model_validator(mode="after")
    def geometry_version(self):
        if self.schema_version != self.frame.schema_version:
            raise ValueError("Snapshot version disagrees with world")
        return self


class DeltaMessage(Model):
    type: Literal["delta"]
    schema_version: Literal["1.10", "1.11"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    previous_sequence: Sequence
    frame_id: Id
    recording_id: Id
    effective_at: UtcInstant
    recorded_at: UtcInstant
    changes: WorldChanges

    @model_validator(mode="after")
    def geometry_version(self):
        from app.scenarios.location import geometry_for
        if self.schema_version != ("1.11" if geometry_for(self.changes) is not None else "1.10"):
            raise ValueError("Delta version disagrees with geometry")
        return self


class HeartbeatMessage(Model):
    type: Literal["heartbeat"]
    schema_version: Literal["1.10", "1.11"]
    mission_id: Id
    stream_epoch: Id
    sequence: Sequence
    server_time: UtcInstant


class ResyncRequiredMessage(Model):
    type: Literal["resync-required"]
    schema_version: Literal["1.10", "1.11"]
    mission_id: Id
    reason: str


StreamMessage = Annotated[SnapshotMessage | DeltaMessage | HeartbeatMessage | ResyncRequiredMessage, Field(discriminator="type")]
