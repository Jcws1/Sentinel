"""Archived M1.2 contracts for strict historical decoding only."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence, UtcInstant, Finite, Longitude, Latitude
from app.commands.legacy import LegacyReceipt

Action = Literal["acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "cancel"]
RunState = Literal["ready", "running", "paused", "ended"]
Code = Literal["OK", "NOT_INTERACTIVE", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "IDENTITY_CONFLICT",
               "INTENT_INVALID", "INTENT_EXPIRED", "OBSOLETE_INTENT", "REFERENCE_MISMATCH", "CONTROL_HELD",
               "CONTROL_REQUIRED", "LEASE_EXPIRED", "RECLAIM_REQUIRED", "INVALID_TRANSITION", "RUN_TERMINAL",
               "INVALID_REQUEST", "NOT_FOUND", "SOURCE_UNHEALTHY", "FRAME_INVALID", "MOVE_EXPIRED",
               "SELECTION_INVALID", "BINDING_CHANGED", "ASSET_BUSY", "POSITION_UNAVAILABLE",
               "UNSUPPORTED_REFERENCE", "OUTSIDE_EXTENT", "ENDPOINT_INVALID", "EXECUTION_TERMINAL"]


class LegacyM12MoveAnchor(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude


class LegacyM12MoveAltitude(Model):
    metres: Finite
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class LegacyM12MovePosition(LegacyM12MoveAnchor):
    altitude: LegacyM12MoveAltitude


class LegacyM12MoveMember(Model):
    asset_id: Id
    entity_id: Id
    executor_id: Id
    source_id: Id
    control_track_id: Id
    grant_id: Id
    binding_revision: Sequence
    busy_revision: Sequence
    origin: LegacyM12MovePosition
    destination: LegacyM12MovePosition


class LegacyM12MoveIntent(Model):
    model_id: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    reviewed_frame_id: Id
    deadline: UtcInstant
    anchor: LegacyM12MoveAnchor
    members: list[LegacyM12MoveMember] = Field(min_length=1, max_length=32)


class LegacyM12MoveRequest(Model):
    command_id: Id
    holder_id: Id
    move: LegacyM12MoveIntent


class LegacyM12CompletionSample(Model):
    sequence: Sequence
    track_id: Id
    timestamp: UtcInstant
    position: LegacyM12MovePosition


class LegacyM12MovementExecution(LegacyM12MoveMember):
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
    completion_sample: LegacyM12CompletionSample | None = None
    travelled_metres: Finite = Field(ge=0)
    remaining_metres: Finite = Field(ge=0)
    speed_mps: Literal[20.0] = 20.0
    reason: str | None = None

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


class LegacyM12Lease(Model):
    holder_id: Id | None = None
    revision: Sequence
    expires_at: UtcInstant | None = None

    @model_validator(mode="after")
    def paired(self):
        if (self.holder_id is None) != (self.expires_at is None):
            raise ValueError("lease holder and expiry must occur together")
        return self


class LegacyM12AssetControl(Model):
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


class LegacyM12InteractiveRun(Model):
    schema_version: Literal["1.1"] = "1.1"
    mission_id: Id
    run_id: Id
    template_id: Literal["singapore-local-v1"] = "singapore-local-v1"
    executor_id: Id
    executor_epoch: Id
    source_id: Id
    state: RunState
    run_revision: Sequence
    grant_id: Id
    grant_revision: Sequence
    capabilities: list[Literal["run-control", "scenario-pair"]]
    supported_actions: list[Action]
    lease: LegacyM12Lease
    tick: Sequence
    last_report_at: UtcInstant | None = None
    controls: list[LegacyM12AssetControl] = Field(max_length=32)
    movement_model: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    executions: list[LegacyM12MovementExecution] = Field(default_factory=list, max_length=64)


class LegacyM12Intent(Model):
    id: Id
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    run_revision: Sequence
    lease_revision: Sequence
    action: Action
    issued_at: UtcInstant
    expires_at: UtcInstant
    execution_id: Id | None = None
    execution_revision: Sequence | None = None

    @model_validator(mode="after")
    def target(self):
        if self.action == "cancel":
            if self.execution_id is None or self.execution_revision is None:
                raise ValueError("cancel intent requires execution revision")
        elif self.execution_id is not None or self.execution_revision is not None:
            raise ValueError("lifecycle intent cannot target execution")
        return self


class LegacyM12IntentRequest(Model):
    action: Action
    execution_id: Id | None = None


class LegacyM12CommandRequest(Model):
    command_id: Id
    holder_id: Id
    intent: LegacyM12Intent


class LegacyM12CreateRunRequest(Model):
    creation_id: Id
    template_id: Id


class LegacyM12Receipt(Model):
    schema_version: Literal["1.1"] = "1.1"
    request_id: Id
    operation: Literal["create", "acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "move", "cancel"]
    accepted: bool
    code: Code
    message: str
    recorded_at: UtcInstant
    mission_id: Id | None = None
    run_id: Id | None = None
    recording_id: Id | None = None
    frame_id: Id | None = None
    sequence: Sequence | None = None
    execution_ids: list[Id] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def result(self):
        if self.accepted != (self.code == "OK"):
            raise ValueError("receipt result and code disagree")
        if self.accepted and any(v is None for v in (self.mission_id, self.run_id, self.recording_id, self.frame_id, self.sequence)):
            raise ValueError("accepted receipt requires committed references")
        return self


class LegacyM12RunRead(Model):
    schema_version: Literal["1.1"] = "1.1"
    server_time: UtcInstant
    frame_id: Id
    sequence: Sequence
    run: LegacyM12InteractiveRun
    owns_control: bool
    lease_state: Literal["unclaimed", "held", "expired"]


ReceiptRead = LegacyM12Receipt | LegacyReceipt


class LegacyM12ExecutionRead(Model):
    schema_version: Literal["1.0"] = "1.0"
    mission_id: Id
    frame_id: Id
    sequence: Sequence
    executions: list[LegacyM12MovementExecution] = Field(max_length=64)


class LegacyM12DemoEntry(Model):
    schema_version: Literal["1.0"] = "1.0"
    enabled: bool
    template_id: Literal["singapore-local-v1"] = "singapore-local-v1"
    active_mission_id: Id | None = None


class LegacyM12CommandContracts(Model):
    """Export root; no route accepts this aggregate."""
    intent: LegacyM12Intent
    command: LegacyM12CommandRequest
    creation: LegacyM12CreateRunRequest
    receipt: ReceiptRead
    status: LegacyM12RunRead
    entry: LegacyM12DemoEntry
    move: LegacyM12MoveRequest
    executions: LegacyM12ExecutionRead
