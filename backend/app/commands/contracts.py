"""Local synthetic control contracts, independent of the Phase 5 boundary."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence, UtcInstant

Action = Literal["acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end"]
RunState = Literal["ready", "running", "paused", "ended"]
Code = Literal["OK", "NOT_INTERACTIVE", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "IDENTITY_CONFLICT",
               "INTENT_INVALID", "INTENT_EXPIRED", "OBSOLETE_INTENT", "REFERENCE_MISMATCH", "CONTROL_HELD",
               "CONTROL_REQUIRED", "LEASE_EXPIRED", "RECLAIM_REQUIRED", "INVALID_TRANSITION", "RUN_TERMINAL",
               "INVALID_REQUEST", "NOT_FOUND"]


class Lease(Model):
    holder_id: Id | None = None
    revision: Sequence
    expires_at: UtcInstant | None = None

    @model_validator(mode="after")
    def paired(self):
        if (self.holder_id is None) != (self.expires_at is None):
            raise ValueError("lease holder and expiry must occur together")
        return self


class AssetControl(Model):
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
    eligible: Literal[False] = False
    reason: str


class InteractiveRun(Model):
    schema_version: Literal["1.0"] = "1.0"
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
    lease: Lease
    tick: Sequence
    last_report_at: UtcInstant | None = None
    controls: list[AssetControl] = Field(max_length=32)


class Intent(Model):
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


class IntentRequest(Model):
    action: Action


class CommandRequest(Model):
    command_id: Id
    holder_id: Id
    intent: Intent


class CreateRunRequest(Model):
    creation_id: Id
    template_id: Id


class Receipt(Model):
    schema_version: Literal["1.0"] = "1.0"
    request_id: Id
    operation: Literal["create", "acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end"]
    accepted: bool
    code: Code
    message: str
    recorded_at: UtcInstant
    mission_id: Id | None = None
    run_id: Id | None = None
    recording_id: Id | None = None
    frame_id: Id | None = None
    sequence: Sequence | None = None

    @model_validator(mode="after")
    def result(self):
        if self.accepted != (self.code == "OK"):
            raise ValueError("receipt result and code disagree")
        if self.accepted and any(v is None for v in (self.mission_id, self.run_id, self.recording_id, self.frame_id, self.sequence)):
            raise ValueError("accepted receipt requires committed references")
        return self


class RunRead(Model):
    schema_version: Literal["1.0"] = "1.0"
    server_time: UtcInstant
    frame_id: Id
    sequence: Sequence
    run: InteractiveRun
    owns_control: bool
    lease_state: Literal["unclaimed", "held", "expired"]


class DemoEntry(Model):
    schema_version: Literal["1.0"] = "1.0"
    enabled: bool
    template_id: Literal["singapore-local-v1"] = "singapore-local-v1"
    active_mission_id: Id | None = None


class CommandContracts(Model):
    """Export root; no route accepts this aggregate."""
    intent: Intent
    command: CommandRequest
    creation: CreateRunRequest
    receipt: Receipt
    status: RunRead
    entry: DemoEntry
