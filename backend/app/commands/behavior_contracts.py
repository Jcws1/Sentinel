"""Bounded local-demo behavior and evidence, separate from core task/vehicle models."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence, UtcInstant, Finite, Longitude, Latitude


class BehaviorAltitude(Model):
    metres: Finite
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class BehaviorPosition(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude
    altitude: BehaviorAltitude


class BehaviorPolicy(Model):
    kind: Literal["hold", "intercept", "patrol"]
    boundary_id: Id | None = None
    reviewed_frame_id: Id | None = None
    deadline: UtcInstant | None = None

    @model_validator(mode="after")
    def patrol_evidence(self):
        values = (self.boundary_id, self.reviewed_frame_id, self.deadline)
        if self.kind == "patrol":
            if any(v is None for v in values):
                raise ValueError("Patrol requires a named boundary and positional evidence")
        elif any(v is not None for v in values):
            raise ValueError("Only Patrol carries geometry and positional evidence")
        return self


class EngagementModel(Model):
    rule_version: Literal["demo-mutual-loss-v1"] = "demo-mutual-loss-v1"
    movement_model: Literal["local-horizontal-v1", "local-horizontal-v2"] = "local-horizontal-v1"
    contact_algorithm: Literal["relative-swept-sphere-v1"] = "relative-swept-sphere-v1"
    allocation_rule: Literal["distance-target-asset-v1"] = "distance-target-asset-v1"
    patrol_rule: Literal["convex-centroid-inset-v1"] = "convex-centroid-inset-v1"
    step_ms: Literal[200] = 200
    acquisition_radius_m: Finite = Field(default=700.0, ge=25, le=5000)
    contact_radius_m: Literal[25.0] = 25.0
    tolerance_m: Literal[0.001] = 0.001
    patrol_inset_fraction: Literal[0.1] = 0.1
    speed_mps: Literal[20.0, 43.05555555555556]


BehaviorPhase = Literal["hold", "armed", "patrolling", "pursuing", "reserve", "blocked", "interrupted", "unavailable"]


class BehaviorMemberOutcome(Model):
    asset_id: Id
    entity_id: Id
    outcome: Literal["accepted", "skipped"]
    code: Literal["OK", "UNAVAILABLE", "NO_RESPONSE", "POSITION_UNAVAILABLE", "UNSUPPORTED_REFERENCE", "ORDER_SUPERSEDED"]
    reason: str
    state: BehaviorPhase | None = None
    assignment_id: Id | None = None

    @model_validator(mode="after")
    def evidence(self):
        if (self.outcome == "accepted") != (self.code == "OK" and self.state is not None):
            raise ValueError("Behavior outcome requires its accepted state")
        if self.outcome == "skipped" and (self.code == "OK" or self.state is not None or self.assignment_id is not None):
            raise ValueError("Skipped members cannot establish a policy")
        return self


class PatrolRoute(Model):
    boundary_id: Id
    geometry_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    loop: list[BehaviorPosition] = Field(min_length=3, max_length=32)
    waypoint: int = Field(ge=0, le=31, strict=True)
    entered: bool = False
    completed_loops: Sequence = 0
    visited_waypoints: Sequence = 0

    @model_validator(mode="after")
    def valid_index(self):
        if self.waypoint >= len(self.loop):
            raise ValueError("Patrol waypoint outside its frozen loop")
        return self


class BehaviorState(Model):
    id: Id
    command_id: Id
    asset_id: Id
    entity_id: Id
    control_track_id: Id | None = None
    executor_epoch: Id
    grant_revision: Sequence
    binding_revision: Sequence
    reservation_revision: Sequence
    order: int = Field(ge=1, le=9007199254740991, strict=True)
    policy: Literal["hold", "intercept", "patrol"]
    state: BehaviorPhase
    reason: str
    accepted_sequence: Sequence
    accepted_tick: Sequence
    deadline: UtcInstant | None = None
    started_tick: Sequence | None = None
    assignment_id: Id | None = None
    movement_execution_id: Id | None = None
    target_scope: list[Id] = Field(default_factory=list, max_length=32)
    patrol: PatrolRoute | None = None

    @model_validator(mode="after")
    def state_evidence(self):
        if (self.state == "pursuing") != (self.assignment_id is not None):
            raise ValueError("Pursuit requires one active assignment")
        if self.state in {"armed", "pursuing", "reserve"} and self.policy != "intercept":
            raise ValueError("Intercept state requires Intercept policy")
        if self.state == "patrolling" and (self.policy != "patrol" or self.patrol is None):
            raise ValueError("Patrol requires a frozen validated route")
        if (self.state == "patrolling" and (self.control_track_id is None or self.deadline is None)) or (self.state == "pursuing" and self.control_track_id is None):
            raise ValueError("Positional behavior requires a track and first-start deadline")
        if len(self.target_scope) != len(set(self.target_scope)):
            raise ValueError("Duplicate accepted target scope")
        return self


class InterceptAssignment(Model):
    id: Id
    policy_id: Id
    command_id: Id
    asset_id: Id
    interceptor_id: Id
    target_id: Id
    target_track_id: Id
    created_sequence: Sequence
    state: Literal["active", "released"] = "active"
    released_sequence: Sequence | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def release_evidence(self):
        if (self.state == "released") != (self.released_sequence is not None and self.reason is not None):
            raise ValueError("Assignment release requires committed evidence")
        return self


class EngagementParticipant(Model):
    entity_id: Id
    track_id: Id
    affiliation: Literal["friendly", "hostile"]
    before: BehaviorPosition
    proposed: BehaviorPosition
    evaluated: BehaviorPosition
    before_condition: Literal["operational"] = "operational"
    after_condition: Literal["non-operational"] = "non-operational"


class DemoOutcome(Model):
    id: Id
    rule_version: Literal["demo-mutual-loss-v1"] = "demo-mutual-loss-v1"
    assignment_id: Id
    policy_id: Id
    command_id: Id
    run_id: Id
    source_id: Id
    executor_epoch: Id
    input_frame_id: Id
    input_sequence: Sequence
    committed_sequence: Sequence
    tick: Sequence
    fraction: Finite = Field(ge=0, le=1)
    separation_m: Finite = Field(ge=0)
    participants: list[EngagementParticipant] = Field(min_length=2, max_length=2)


class FleetBehavior(Model):
    rule_version: Literal["local-fleet-v1", "local-fleet-v2"] = "local-fleet-v2"
    run_id: Id
    source_id: Id
    model: EngagementModel
    members: list[BehaviorState] = Field(default_factory=list, max_length=32)
    assignments: list[InterceptAssignment] = Field(default_factory=list, max_length=64)
    outcomes: list[DemoOutcome] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def unique_members_and_pairs(self):
        if self.rule_version == "local-fleet-v1":
            if self.model.acquisition_radius_m != 250 or any(m.movement_execution_id or (m.state == "pursuing" and not m.deadline) for m in self.members):
                raise ValueError("Legacy fleet requires its original scope/deadline semantics")
        elif any(m.target_scope or m.state == "reserve" for m in self.members):
            raise ValueError("Proximity stance cannot carry frozen scope or held reserves")
        if len({m.asset_id for m in self.members}) != len(self.members) or len({m.entity_id for m in self.members}) != len(self.members):
            raise ValueError("Duplicate behavior members")
        if len({m.id for m in self.members}) != len(self.members):
            raise ValueError("Duplicate policy identities")
        if len({a.id for a in self.assignments}) != len(self.assignments):
            raise ValueError("Duplicate assignment identities")
        active = [a for a in self.assignments if a.state == "active"]
        if len({a.interceptor_id for a in active}) != len(active) or len({a.target_id for a in active}) != len(active):
            raise ValueError("One active interceptor per target")
        if len({o.id for o in self.outcomes}) != len(self.outcomes):
            raise ValueError("Duplicate outcome identities")
        consumed = [p.entity_id for o in self.outcomes for p in o.participants]
        if len(consumed) != len(set(consumed)):
            raise ValueError("Outcome participants may be consumed only once")
        return self
