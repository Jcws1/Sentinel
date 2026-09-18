"""Frozen D3a contracts; strict historical readers, never enriched in place."""
from app.scenarios.contracts import ScenarioRef
"""Local synthetic control contracts, independent of the Phase 5 boundary."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence, UtcInstant, Finite, Longitude, Latitude
from app.commands.legacy import LegacyReceipt
from app.commands.legacy_movement import LegacyM12Receipt
from app.commands.legacy_d2 import LegacyD2Receipt
from app.commands.legacy_d3 import LegacyD3Receipt
from app.commands.boundary_contracts import BoundaryMutation

LegacyD3aAction = Literal["acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "cancel", "stop", "return-to-script", "boundary-edit"]
LegacyD3aRunState = Literal["ready", "running", "paused", "ended"]
LegacyD3aCode = Literal["OK", "NOT_INTERACTIVE", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "IDENTITY_CONFLICT",
               "INTENT_INVALID", "INTENT_EXPIRED", "OBSOLETE_INTENT", "REFERENCE_MISMATCH", "CONTROL_HELD",
               "CONTROL_REQUIRED", "LEASE_EXPIRED", "RECLAIM_REQUIRED", "INVALID_TRANSITION", "RUN_TERMINAL",
               "INVALID_REQUEST", "NOT_FOUND", "SOURCE_UNHEALTHY", "FRAME_INVALID", "MOVE_EXPIRED",
               "SELECTION_INVALID", "BINDING_CHANGED", "ASSET_BUSY", "POSITION_UNAVAILABLE",
               "UNSUPPORTED_REFERENCE", "OUTSIDE_EXTENT", "ENDPOINT_INVALID", "EXECUTION_TERMINAL",
               "NO_AVAILABLE_ASSETS", "ORDER_SUPERSEDED", "BOUNDARY_CONFLICT"]


class LegacyD3aMoveAnchor(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude


class LegacyD3aMoveAltitude(Model):
    metres: Finite
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class LegacyD3aMovePosition(LegacyD3aMoveAnchor):
    altitude: LegacyD3aMoveAltitude


class LegacyD3aMoveMember(Model):
    asset_id: Id
    entity_id: Id
    executor_id: Id
    source_id: Id
    control_track_id: Id
    grant_id: Id
    binding_revision: Sequence
    busy_revision: Sequence
    origin: LegacyD3aMovePosition
    destination: LegacyD3aMovePosition


class LegacyD3aMoveIntent(Model):
    model_id: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    reviewed_frame_id: Id
    deadline: UtcInstant
    anchor: LegacyD3aMoveAnchor
    members: list[LegacyD3aMoveMember] = Field(min_length=1, max_length=32)


class LegacyD3aMoveRequest(Model):
    command_id: Id
    holder_id: Id
    move: LegacyD3aMoveIntent


class LegacyD3aDirectMoveMember(Model):
    asset_id: Id
    entity_id: Id
    executor_id: Id
    source_id: Id
    control_track_id: Id | None = None
    grant_id: Id
    binding_revision: Sequence


class LegacyD3aDirectMoveIntent(Model):
    model_id: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    reviewed_frame_id: Id
    deadline: UtcInstant
    order: int = Field(ge=1, le=9007199254740991, strict=True)
    anchor: LegacyD3aMoveAnchor
    members: list[LegacyD3aDirectMoveMember] = Field(min_length=1, max_length=32)


class LegacyD3aDirectMoveRequest(Model):
    command_id: Id
    holder_id: Id
    direct: LegacyD3aDirectMoveIntent


class LegacyD3aDirectOrderContext(Model):
    holder_id: Id
    executor_epoch: Id
    grant_id: Id
    grant_revision: Sequence
    order: int = Field(ge=1, le=9007199254740991, strict=True)


class LegacyD3aDirectMemberOutcome(Model):
    asset_id: Id
    entity_id: Id
    outcome: Literal["accepted", "skipped"]
    code: Literal["OK", "UNAVAILABLE", "NO_RESPONSE", "POSITION_UNAVAILABLE", "UNSUPPORTED_REFERENCE", "ORDER_SUPERSEDED"]
    reason: str
    execution_id: Id | None = None

    @model_validator(mode="after")
    def evidence(self):
        if (self.outcome == "accepted") != (self.code == "OK" and self.execution_id is not None):
            raise ValueError("accepted member requires execution evidence")
        if self.outcome == "skipped" and (self.code == "OK" or self.execution_id is not None):
            raise ValueError("skipped member cannot establish execution")
        return self


class LegacyD3aControlMemberOutcome(Model):
    asset_id: Id
    entity_id: Id
    outcome: Literal["accepted", "skipped"]
    code: Literal["OK", "ORDER_SUPERSEDED"]
    reason: str

    @model_validator(mode="after")
    def evidence(self):
        if (self.outcome == "accepted") != (self.code == "OK"):
            raise ValueError("Control outcome and code disagree")
        return self


class LegacyD3aCompletionSample(Model):
    sequence: Sequence
    track_id: Id
    timestamp: UtcInstant
    position: LegacyD3aMovePosition


class LegacyD3aMovementExecution(LegacyD3aMoveMember):
    kind: Literal["move"] = "move"
    id: Id
    command_id: Id
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    grant_revision: Sequence
    reservation_revision: Sequence
    state: Literal["Accepted", "Running", "Suspended", "Completed", "Cancelled", "Failed", "Expired", "Interrupted"]
    revision: Sequence
    accepted_at: UtcInstant
    accepted_sequence: Sequence
    deadline: UtcInstant
    started_at: UtcInstant | None = None
    started_tick: Sequence | None = None
    terminal_sequence: Sequence | None = None
    completion_sample: LegacyD3aCompletionSample | None = None
    travelled_metres: Finite = Field(ge=0)
    remaining_metres: Finite = Field(ge=0)
    speed_mps: Literal[20.0, 43.05555555555556] = 20.0
    reason: str | None = None
    direct_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)

    @model_validator(mode="after")
    def transitions(self):
        terminal = self.state in {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"}
        if terminal != (self.terminal_sequence is not None):
            raise ValueError("terminal execution requires its committed sequence")
        if (self.started_at is None) != (self.started_tick is None):
            raise ValueError("execution start references must be paired")
        if self.state == "Running" and self.started_at is None:
            raise ValueError("Running requires an actual start")
        if (self.state == "Completed") != (self.completion_sample is not None):
            raise ValueError("completion requires a committed sample")
        if self.completion_sample and (self.remaining_metres != 0 or self.completion_sample.position != self.destination or self.completion_sample.track_id != self.control_track_id or self.completion_sample.sequence != self.terminal_sequence):
            raise ValueError("completion sample does not establish arrival")
        return self


class LegacyD3aLease(Model):
    holder_id: Id | None = None
    revision: Sequence
    expires_at: UtcInstant | None = None

    @model_validator(mode="after")
    def paired(self):
        if (self.holder_id is None) != (self.expires_at is None):
            raise ValueError("lease holder and expiry must occur together")
        return self


class LegacyD3aAssetControl(Model):
    mission_id: Id
    asset_id: Id
    entity_id: Id
    executor_id: Id
    control_track_id: Id | None = None
    source_id: Id
    grant_id: Id
    binding_revision: Sequence
    capabilities: list[Literal["move-horizontal"]]
    position_reference: Literal["ELLIPSOID/WGS84"]
    busy_revision: Sequence = 0
    eligible: bool = False
    reason: str
    last_direct_order: LegacyD3aDirectOrderContext | None = None


class LegacyD3aInteractiveRun(Model):
    schema_version: Literal["1.5"] = "1.5"
    mission_id: Id
    run_id: Id
    template_id: Literal["singapore-local-v1", "singapore-local-v2"] = "singapore-local-v2"
    executor_id: Id
    executor_epoch: Id
    source_id: Id
    state: LegacyD3aRunState
    run_revision: Sequence
    grant_id: Id
    grant_revision: Sequence
    capabilities: list[Literal["run-control", "scenario-pair", "boundary-edit"]]
    supported_actions: list[LegacyD3aAction]
    lease: LegacyD3aLease
    tick: Sequence
    last_report_at: UtcInstant | None = None
    controls: list[LegacyD3aAssetControl] = Field(max_length=32)
    movement_model: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    executions: list[LegacyD3aMovementExecution] = Field(default_factory=list, max_length=64)

    @model_validator(mode="after")
    def profile_speed(self):
        from app.commands.kinematics import cruise_speed
        if any(e.speed_mps != cruise_speed(self.template_id) for e in self.executions):
            raise ValueError("execution speed differs from the run profile")
        return self


class LegacyD3aIntent(Model):
    id: Id
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    run_revision: Sequence
    lease_revision: Sequence
    action: LegacyD3aAction
    boundary: BoundaryMutation | None = None
    issued_at: UtcInstant
    expires_at: UtcInstant
    execution_id: Id | None = None
    execution_revision: Sequence | None = None
    members: list[LegacyD3aDirectMoveMember] | None = Field(default=None, min_length=1, max_length=32)
    order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)

    @model_validator(mode="after")
    def target(self):
        if (self.action == "boundary-edit") != (self.boundary is not None):
            raise ValueError("Boundary editing requires its exact versioned mutation")
        selected = self.action in {"stop", "return-to-script"}
        if selected != (self.members is not None and self.order is not None) or (not selected and (self.members is not None or self.order is not None)):
            raise ValueError("Selected control requires exact members and logical order")
        if self.action == "cancel":
            if self.execution_id is None or self.execution_revision is None:
                raise ValueError("cancel intent requires execution revision")
        elif self.execution_id is not None or self.execution_revision is not None:
            raise ValueError("lifecycle intent cannot target execution")
        return self


class LegacyD3aIntentRequest(Model):
    action: LegacyD3aAction
    boundary: BoundaryMutation | None = None
    execution_id: Id | None = None
    members: list[LegacyD3aDirectMoveMember] | None = Field(default=None, min_length=1, max_length=32)
    order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)

    @model_validator(mode="after")
    def selection(self):
        if (self.action == "boundary-edit") != (self.boundary is not None):
            raise ValueError("Boundary editing requires its exact versioned mutation")
        selected = self.action in {"stop", "return-to-script"}
        if selected != (self.members is not None and self.order is not None) or (not selected and (self.members is not None or self.order is not None)):
            raise ValueError("Selected control requires exact members and logical order")
        if self.action != "cancel" and self.execution_id is not None:
            raise ValueError("Only Cancel targets a specific execution")
        return self


class LegacyD3aCommandRequest(Model):
    command_id: Id
    holder_id: Id
    intent: LegacyD3aIntent


class LegacyD3aCreateRunRequest(Model):
    creation_id: Id
    template_id: Id | None = None
    scenario: ScenarioRef | None = None

    @model_validator(mode="after")
    def exactly_one_source(self):
        if (self.template_id is None) == (self.scenario is None):
            raise ValueError("Choose exactly one template or saved scenario revision")
        return self


class LegacyD3aReceipt(Model):
    schema_version: Literal["1.4"] = "1.4"
    request_id: Id
    operation: Literal["create", "acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "move", "cancel", "direct-move", "stop", "return-to-script", "boundary-edit"]
    boundary_revision: Sequence | None = None
    accepted: bool
    code: LegacyD3aCode
    message: str
    recorded_at: UtcInstant
    mission_id: Id | None = None
    run_id: Id | None = None
    recording_id: Id | None = None
    frame_id: Id | None = None
    sequence: Sequence | None = None
    execution_ids: list[Id] = Field(default_factory=list, max_length=32)
    direct_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    member_outcomes: list[LegacyD3aDirectMemberOutcome] = Field(default_factory=list, max_length=32)
    control_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    control_outcomes: list[LegacyD3aControlMemberOutcome] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def result(self):
        if (self.operation == "boundary-edit" and self.accepted) != (self.boundary_revision is not None):
            raise ValueError("Accepted boundary receipt requires committed effective revision")
        if self.accepted != (self.code == "OK"):
            raise ValueError("receipt result and code disagree")
        if self.accepted and any(v is None for v in (self.mission_id, self.run_id, self.recording_id, self.frame_id, self.sequence)):
            raise ValueError("accepted receipt requires committed references")
        if self.operation == "direct-move":
            if self.direct_order is None:
                raise ValueError("direct receipt requires logical order")
            accepted = [o.execution_id for o in self.member_outcomes if o.outcome == "accepted"]
            if len({o.asset_id for o in self.member_outcomes}) != len(self.member_outcomes) or len({o.entity_id for o in self.member_outcomes}) != len(self.member_outcomes):
                raise ValueError("duplicate direct receipt members")
            if accepted != self.execution_ids or self.accepted != bool(accepted):
                raise ValueError("direct receipt member evidence disagrees")
        elif self.direct_order is not None or self.member_outcomes:
            raise ValueError("direct result attached to another operation")
        if self.operation in {"stop", "return-to-script"}:
            if self.control_order is None or self.execution_ids:
                raise ValueError("Selected control requires order, without fabricated executions")
            accepted = [o for o in self.control_outcomes if o.outcome == "accepted"]
            if self.accepted != bool(accepted) or len({o.asset_id for o in self.control_outcomes}) != len(self.control_outcomes) or len({o.entity_id for o in self.control_outcomes}) != len(self.control_outcomes):
                raise ValueError("Selected control receipt evidence disagrees")
        elif self.control_order is not None or self.control_outcomes:
            raise ValueError("Selected control result attached to another operation")
        return self


class LegacyD3aRunRead(Model):
    schema_version: Literal["1.5"] = "1.5"
    server_time: UtcInstant
    frame_id: Id
    sequence: Sequence
    run: LegacyD3aInteractiveRun
    owns_control: bool
    lease_state: Literal["unclaimed", "held", "expired"]


LegacyD3aReceiptRead = LegacyD3aReceipt | LegacyD3Receipt | LegacyD2Receipt | LegacyM12Receipt | LegacyReceipt


class LegacyD3aExecutionRead(Model):
    schema_version: Literal["1.2"] = "1.2"
    mission_id: Id
    frame_id: Id
    sequence: Sequence
    executions: list[LegacyD3aMovementExecution] = Field(max_length=64)


class LegacyD3aDemoEntry(Model):
    schema_version: Literal["1.1"] = "1.1"
    enabled: bool
    template_id: Literal["singapore-local-v2"] = "singapore-local-v2"
    active_mission_id: Id | None = None


class LegacyD3aCommandContracts(Model):
    """Export root; no route accepts this aggregate."""
    intent: LegacyD3aIntent
    command: LegacyD3aCommandRequest
    creation: LegacyD3aCreateRunRequest
    receipt: LegacyD3aReceiptRead
    status: LegacyD3aRunRead
    entry: LegacyD3aDemoEntry
    move: LegacyD3aMoveRequest
    direct_move: LegacyD3aDirectMoveRequest
    executions: LegacyD3aExecutionRead
