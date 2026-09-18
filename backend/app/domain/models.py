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
from app.commands.legacy_rts import LegacyRtsInteractiveRun
from app.commands.legacy import LegacyInteractiveRun
from app.commands.legacy_movement import LegacyM12InteractiveRun


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


class LegacyInteractiveWorldFrame(LegacyWorldFrame):
    schema_version: Literal["1.1"]
    interactive: LegacyInteractiveRun | None = None

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


class LegacyMovementWorldFrame(LegacyInteractiveWorldFrame):
    schema_version: Literal["1.2"]
    interactive: LegacyM12InteractiveRun | None = None

    @model_validator(mode="after")
    def movement_integrity(self):
        if self.interactive is None:
            return self
        run = self.interactive
        seen = set()
        active_assets = set()
        for execution in run.executions:
            if execution.id in seen or (execution.mission_id, execution.run_id) != (self.mission.id, run.run_id):
                raise ValueError("execution identity mismatch")
            seen.add(execution.id)
            if execution.accepted_sequence > self.sequence or (execution.terminal_sequence is not None and execution.terminal_sequence > self.sequence):
                raise ValueError("execution references future commit")
            if execution.state not in ("Completed", "Cancelled", "Failed", "Expired", "Interrupted"):
                if execution.asset_id in active_assets:
                    raise ValueError("multiple active executions for one Asset")
                active_assets.add(execution.asset_id)
                controls = [c for c in run.controls if c.asset_id == execution.asset_id]
                if len(controls) != 1 or controls[0].busy_revision != execution.reservation_revision:
                    raise ValueError("execution reservation mismatch")
                control = controls[0]
                if any(getattr(control, name) != getattr(execution, name) for name in ("entity_id", "executor_id", "control_track_id", "source_id", "grant_id", "binding_revision")) or execution.executor_epoch != run.executor_epoch or execution.grant_revision != run.grant_revision:
                    raise ValueError("execution control binding mismatch")
            sample = execution.completion_sample
            if sample and sample.sequence == self.sequence:
                track = self.tracks.get(sample.track_id)
                if track is None or canonical_position(track.latest.position) != canonical_position(sample.position) or track.latest.timestamp != sample.timestamp:
                    raise ValueError("completion not backed by this committed sample")
        return self


class LegacyRtsWorldFrame(LegacyMovementWorldFrame):
    schema_version: Literal["1.3"]
    interactive: LegacyRtsInteractiveRun | None = None


from app.commands.legacy_d2 import LegacyD2InteractiveRun


class LegacyCompactWorldFrame(LegacyRtsWorldFrame):
    schema_version: Literal["1.4"]
    interactive: LegacyD2InteractiveRun | None = None


from app.scenarios.contracts import ScenarioBinding

class LegacyScenarioWorldFrame(LegacyCompactWorldFrame):
    schema_version: Literal["1.5"]
    scenario: ScenarioBinding | None = None

    @model_validator(mode="after")
    def scenario_integrity(self):
        if self.scenario:
            ids = list(self.scenario.entity_ids.values())
            if not self.interactive or len(ids) != len(set(ids)) or set(ids) != set(self.entities):
                raise ValueError("Invalid scenario/run entity mapping")
        return self


from app.scenarios.boundaries import BoundaryRules

class LegacyBoundaryWorldFrame(LegacyScenarioWorldFrame):
    schema_version: Literal["1.6"]
    boundary_rules: BoundaryRules | None = None

    @model_validator(mode="after")
    def boundary_integrity(self):
        from app.scenarios.geometry import validate
        if self.boundary_rules is not None:
            if not self.scenario or not self.interactive:
                raise ValueError("Boundary rules require a custom simulation run")
            if set(self.boundary_rules.zones) != set(self.zones):
                raise ValueError("Boundary rules must cover exactly the frozen run zones")
            for zid, kind in self.boundary_rules.zones.items():
                z = self.zones[zid]
                if z.purpose != kind or z.altitude_band or len(z.geometry.coordinates) != 1 or z.provenance.source.id != self.interactive.source_id:
                    raise ValueError("Invalid boundary footprint or source")
                validate(z.geometry.coordinates[0][:-1], kind)
        return self


from app.commands.schedule_contracts import ScenarioSchedule
from app.commands.legacy_schedule import ScenarioSchedule as LegacyScenarioSchedule
from app.commands.legacy_d3 import LegacyD3InteractiveRun
from app.commands.boundary_contracts import LiveBoundaries


class LegacyScheduledWorldFrame(LegacyBoundaryWorldFrame):
    schema_version: Literal["1.7"]
    interactive: LegacyD3InteractiveRun | None = None
    scenario_schedule: LegacyScenarioSchedule | None = None

    @model_validator(mode="after")
    def schedule_integrity(self):
        schedule, run = self.scenario_schedule, self.interactive
        if schedule is None:
            return self
        if not run or not self.scenario or (schedule.run_id, schedule.source_id, schedule.executor_epoch) != (run.run_id, run.source_id, run.executor_epoch):
            raise ValueError("Script requires a frozen custom source binding")
        controlled = {c.entity_id for c in run.controls}
        if not set(schedule.manual_overrides) <= controlled:
            raise ValueError("Manual override requires explicit live control")
        manual_active = {e.entity_id for e in run.executions if e.state not in {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"}}
        if not manual_active <= set(schedule.manual_overrides):
            raise ValueError("Live movement must establish Manual override")
        for item in schedule.actions:
            if self.scenario.entity_ids.get(item.action.unit_id) != item.entity_id or item.entity_id not in self.entities:
                raise ValueError("Script actor reference disagrees with the frozen definition")
            track = self.tracks.get(item.track_id)
            if track is None or track.entity_id != item.entity_id or track.source.id != run.source_id or track.source.kind != "simulation" or track.source.mode != "simulated":
                raise ValueError("Script Track requires its exact source binding")
            if item.terminal_sequence is not None and (item.terminal_sequence > self.sequence or item.terminal_tick > run.tick):
                raise ValueError("Script outcome references a future commit")
            if item.consumed_tick is not None and item.consumed_tick > run.tick:
                raise ValueError("Script dispatch references a future tick")
            motion = item.motion
            if motion:
                from app.commands.kinematics import cruise_speed
                if motion.accepted_sequence > self.sequence or motion.accepted_tick > run.tick or motion.speed_mps != (self.unit_profiles[item.entity_id].cruise_mps if getattr(self, "unit_profiles", {}).get(item.entity_id) else cruise_speed(run.template_id)):
                    raise ValueError("Script execution references a future commit or changed profile")
                if motion.started_tick is not None and (motion.started_tick > run.tick or motion.started_tick < motion.accepted_tick):
                    raise ValueError("Script motion start references an invalid tick")
                if motion.origin.altitude != motion.destination.altitude:
                    raise ValueError("Script motion must preserve supplied operational height")
                if item.state in {"Accepted", "Running"} and (item.entity_id in manual_active or motion.destination.longitude_deg != item.action.destination.longitude_deg or motion.destination.latitude_deg != item.action.destination.latitude_deg):
                    raise ValueError("Script execution has conflicting ownership or destination")
                sample = motion.completion_sample
                if sample and sample.sequence == self.sequence and (canonical_position(track.latest.position) != canonical_position(sample.position) or track.latest.timestamp != sample.timestamp):
                    raise ValueError("Script arrival is not backed by this committed sample")
        return self


from app.commands.legacy_d3a import LegacyD3aInteractiveRun
from app.commands.behavior_contracts import FleetBehavior
from app.commands.legacy_d4_behavior import LegacyD4FleetBehavior
from app.commands.legacy_d4 import LegacyD4InteractiveRun
from app.commands.legacy_d3a_schedule import LegacyD3aScenarioSchedule
from app.commands.unit_profiles import UnitProfile, allowed_profile


class LegacyD3aWorldFrame(LegacyScheduledWorldFrame):
    schema_version: Literal["1.8"]
    interactive: LegacyD3aInteractiveRun | None = None
    scenario_schedule: LegacyD3aScenarioSchedule | None = None
    live_boundaries: LiveBoundaries | None = None

    @model_validator(mode="after")
    def boundary_integrity(self):
        from app.scenarios.geometry import validate
        if self.live_boundaries:
            live, run = self.live_boundaries, self.interactive
            if not run or not self.boundary_rules or (live.run_id, live.source_id) != (run.run_id, run.source_id) or live.committed_sequence > self.sequence:
                raise ValueError("Effective live boundaries require committed source-bound run evidence")
        if self.boundary_rules is not None:
            if not self.interactive or (not self.scenario and not self.live_boundaries):
                raise ValueError("Boundary rules require a custom or explicitly edited local demo")
            if set(self.boundary_rules.zones) != set(self.zones):
                raise ValueError("Boundary rules must cover exactly the effective zones")
            for zid, kind in self.boundary_rules.zones.items():
                z = self.zones[zid]
                if z.purpose != kind or z.altitude_band or len(z.geometry.coordinates) != 1 or z.provenance.source.id != self.interactive.source_id:
                    raise ValueError("Invalid boundary footprint or source")
                validate(z.geometry.coordinates[0][:-1], kind)
        return self


class LegacyD4WorldFrame(LegacyD3aWorldFrame):
    schema_version: Literal["1.9"]
    interactive: LegacyD4InteractiveRun | None = None
    fleet_behavior: LegacyD4FleetBehavior | None = None

    @model_validator(mode="after")
    def behavior_integrity(self):
        fleet, run = self.fleet_behavior, self.interactive
        if fleet is None:
            return self
        from app.commands.kinematics import cruise_speed
        if not run or (fleet.run_id, fleet.source_id) != (run.run_id, run.source_id) or fleet.model.speed_mps != cruise_speed(run.template_id):
            raise ValueError("Fleet behavior requires its exact run/source/profile")
        if not {"fleet-policy", "demo-outcome"} <= set(run.capabilities):
            raise ValueError("Fleet source lacks explicit capabilities")
        active = {a.id: a for a in fleet.assignments if a.state == "active"}
        members = {m.asset_id: m for m in fleet.members}
        for member in fleet.members:
            control = next((c for c in run.controls if c.asset_id == member.asset_id), None)
            if not control or control.entity_id != member.entity_id or member.accepted_sequence > self.sequence or member.accepted_tick > run.tick:
                raise ValueError("Invalid behavior member or commit anchor")
            if member.state in {"armed", "patrolling", "pursuing", "reserve"}:
                if (member.executor_epoch, member.grant_revision, member.binding_revision, member.reservation_revision, member.control_track_id) != (run.executor_epoch, run.grant_revision, control.binding_revision, control.busy_revision, control.control_track_id):
                    raise ValueError("Behavior control/reservation changed")
                if self.scenario_schedule and member.entity_id not in self.scenario_schedule.manual_overrides:
                    raise ValueError("Behavior must establish Manual override")
                if any(e.entity_id == member.entity_id and e.state not in {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"} for e in run.executions):
                    raise ValueError("Behavior conflicts with manual movement")
            if member.assignment_id and (member.assignment_id not in active or active[member.assignment_id].asset_id != member.asset_id):
                raise ValueError("Behavior lacks its active assignment")
        for assignment in fleet.assignments:
            if assignment.created_sequence > self.sequence or (assignment.released_sequence is not None and assignment.released_sequence > self.sequence):
                raise ValueError("Assignment references future commit")
            if assignment.state == "active":
                member = members.get(assignment.asset_id)
                target = self.entities.get(assignment.target_id)
                track = self.tracks.get(assignment.target_track_id)
                if not member or member.assignment_id != assignment.id or member.id != assignment.policy_id or member.entity_id != assignment.interceptor_id or assignment.target_id not in member.target_scope or not target or not track or track.entity_id != target.id or track.source.id != run.source_id:
                    raise ValueError("Assignment scope/source disagreement")
        for outcome in fleet.outcomes:
            if (outcome.run_id, outcome.source_id) != (run.run_id, run.source_id) or outcome.committed_sequence > self.sequence or outcome.tick > run.tick or outcome.input_sequence + 1 != outcome.committed_sequence:
                raise ValueError("Outcome references invalid evaluation anchors")
            if [p.affiliation for p in outcome.participants] != ["friendly", "hostile"] or outcome.separation_m > fleet.model.contact_radius_m + fleet.model.tolerance_m + 0.001:
                raise ValueError("Invalid mutual loss participants/contact")
            for participant in outcome.participants:
                entity, track = self.entities.get(participant.entity_id), self.tracks.get(participant.track_id)
                if not entity or entity.condition != "non-operational" or entity.affiliation != participant.affiliation or not track or track.entity_id != entity.id or track.source.id != run.source_id or canonical_position(track.latest.position) != canonical_position(participant.evaluated):
                    raise ValueError("Outcome loss/position is not preserved")
                if participant.before.altitude.metres != participant.proposed.altitude.metres or participant.before.altitude.metres != participant.evaluated.altitude.metres:
                    raise ValueError("Outcome must preserve supplied height")
                if any(a.entity_id == entity.id and a.availability != "unavailable" for a in self.assets.values()):
                    raise ValueError("Lost assets must be unavailable")
        return self



class WorldFrame(LegacyD3aWorldFrame):
    schema_version: Literal["1.10"]
    interactive: InteractiveRun | None = None
    fleet_behavior: FleetBehavior | None = None
    scenario_schedule: ScenarioSchedule | None = None
    unit_profiles: dict[Id, UnitProfile] = Field(default_factory=dict)

    @model_validator(mode="after")
    def unit_profile_integrity(self):
        if any(eid not in self.entities or not allowed_profile(p.id, self.entities[eid].affiliation) for eid,p in self.unit_profiles.items()):
            raise ValueError("Profile must identify a compatible run entity")
        if self.interactive:
            from app.commands.kinematics import cruise_speed
            for e in self.interactive.executions:
                p = self.unit_profiles.get(e.entity_id)
                if e.speed_mps != (p.cruise_mps if p else cruise_speed(self.interactive.template_id)):
                    raise ValueError("Movement speed differs from frozen unit profile")
        return self

    @model_validator(mode="after")
    def behavior_integrity(self):
        fleet, run = self.fleet_behavior, self.interactive
        if fleet is None:
            return self
        from app.commands.kinematics import cruise_speed
        if not run or (fleet.run_id, fleet.source_id) != (run.run_id, run.source_id) or fleet.model.speed_mps != cruise_speed(run.template_id):
            raise ValueError("Fleet behavior requires its exact run/source/profile")
        if not {"fleet-policy", "demo-outcome"} <= set(run.capabilities):
            raise ValueError("Fleet source lacks explicit capabilities")
        active = {a.id: a for a in fleet.assignments if a.state == "active"}
        members = {m.asset_id: m for m in fleet.members}
        for member in fleet.members:
            control = next((c for c in run.controls if c.asset_id == member.asset_id), None)
            if not control or control.entity_id != member.entity_id or member.accepted_sequence > self.sequence or member.accepted_tick > run.tick:
                raise ValueError("Invalid behavior member or commit anchor")
            if member.state in {"armed", "patrolling", "pursuing", "reserve"}:
                if (member.executor_epoch, member.grant_revision, member.binding_revision, member.reservation_revision, member.control_track_id) != (run.executor_epoch, run.grant_revision, control.binding_revision, control.busy_revision, control.control_track_id):
                    raise ValueError("Behavior control/reservation changed")
                if self.scenario_schedule and member.entity_id not in self.scenario_schedule.manual_overrides:
                    raise ValueError("Behavior must establish Manual override")
                if fleet.rule_version == "local-fleet-v1" and any(e.entity_id == member.entity_id and e.state not in {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"} for e in run.executions):
                    raise ValueError("Behavior conflicts with manual movement")
            if fleet.rule_version == "local-fleet-v2":
                work = [e for e in run.executions if e.asset_id == member.asset_id and e.state not in {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"}]
                if member.movement_execution_id:
                    linked = next((e for e in work if e.id == member.movement_execution_id), None)
                    if not linked or member.policy == "patrol" or (linked.entity_id, linked.control_track_id, linked.reservation_revision) != (member.entity_id, member.control_track_id, member.reservation_revision):
                        raise ValueError("Invalid retained movement reservation")
                if work and member.state in {"armed", "pursuing"} and member.movement_execution_id != work[0].id:
                    raise ValueError("Stance must reference its unfinished destination")
            if member.assignment_id and (member.assignment_id not in active or active[member.assignment_id].asset_id != member.asset_id):
                raise ValueError("Behavior lacks its active assignment")
        for e in run.executions:
            if not e.suspended_by:
                continue
            member = members.get(e.asset_id)
            if fleet.rule_version != "local-fleet-v2" or e.state != "Suspended" or not member or member.state != "pursuing" or member.id != e.suspended_by or member.movement_execution_id != e.id:
                raise ValueError("Suspended destination lacks its pursuing owner")
        for assignment in fleet.assignments:
            if assignment.created_sequence > self.sequence or (assignment.released_sequence is not None and assignment.released_sequence > self.sequence):
                raise ValueError("Assignment references future commit")
            if assignment.state == "active":
                member = members.get(assignment.asset_id)
                target = self.entities.get(assignment.target_id)
                track = self.tracks.get(assignment.target_track_id)
                if not member or member.assignment_id != assignment.id or member.id != assignment.policy_id or member.entity_id != assignment.interceptor_id or (fleet.rule_version == "local-fleet-v1" and assignment.target_id not in member.target_scope) or not target or not track or track.entity_id != target.id or track.source.id != run.source_id:
                    raise ValueError("Assignment scope/source disagreement")
        for outcome in fleet.outcomes:
            if (outcome.run_id, outcome.source_id) != (run.run_id, run.source_id) or outcome.committed_sequence > self.sequence or outcome.tick > run.tick or outcome.input_sequence + 1 != outcome.committed_sequence:
                raise ValueError("Outcome references invalid evaluation anchors")
            if [p.affiliation for p in outcome.participants] != ["friendly", "hostile"] or outcome.separation_m > fleet.model.contact_radius_m + fleet.model.tolerance_m + 0.001:
                raise ValueError("Invalid mutual loss participants/contact")
            for participant in outcome.participants:
                entity, track = self.entities.get(participant.entity_id), self.tracks.get(participant.track_id)
                if not entity or entity.condition != "non-operational" or entity.affiliation != participant.affiliation or not track or track.entity_id != entity.id or track.source.id != run.source_id or canonical_position(track.latest.position) != canonical_position(participant.evaluated):
                    raise ValueError("Outcome loss/position is not preserved")
                if participant.before.altitude.metres != participant.proposed.altitude.metres or participant.before.altitude.metres != participant.evaluated.altitude.metres:
                    raise ValueError("Outcome must preserve supplied height")
                if any(a.entity_id == entity.id and a.availability != "unavailable" for a in self.assets.values()):
                    raise ValueError("Lost assets must be unavailable")
        return self


def canonical_position(position):
    return position.model_dump(mode="json", by_alias=True, exclude_none=True)


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
