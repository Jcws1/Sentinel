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
from app.commands.legacy_d3a import LegacyD3aReceipt, LegacyD3aRunRead
from app.commands.behavior_contracts import BehaviorPolicy, BehaviorMemberOutcome
from app.commands.legacy_d4 import LegacyD4Receipt, LegacyD4RunRead
from app.commands.unit_profiles import UnitProfile

Action = Literal["acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "cancel", "stop", "return-to-script", "boundary-edit", "behavior"]
RunState = Literal["ready", "running", "paused", "ended"]
Code = Literal["OK", "NOT_INTERACTIVE", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "IDENTITY_CONFLICT",
               "INTENT_INVALID", "INTENT_EXPIRED", "OBSOLETE_INTENT", "REFERENCE_MISMATCH", "CONTROL_HELD",
               "CONTROL_REQUIRED", "LEASE_EXPIRED", "RECLAIM_REQUIRED", "INVALID_TRANSITION", "RUN_TERMINAL",
               "INVALID_REQUEST", "NOT_FOUND", "SOURCE_UNHEALTHY", "FRAME_INVALID", "MOVE_EXPIRED",
               "SELECTION_INVALID", "BINDING_CHANGED", "ASSET_BUSY", "POSITION_UNAVAILABLE",
               "UNSUPPORTED_REFERENCE", "OUTSIDE_EXTENT", "ENDPOINT_INVALID", "EXECUTION_TERMINAL",
               "NO_AVAILABLE_ASSETS", "ORDER_SUPERSEDED", "BOUNDARY_CONFLICT"]


class MoveAnchor(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude


class MoveAltitude(Model):
    metres: Finite
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class MovePosition(MoveAnchor):
    altitude: MoveAltitude


class MoveMember(Model):
    asset_id: Id
    entity_id: Id
    executor_id: Id
    source_id: Id
    control_track_id: Id
    grant_id: Id
    binding_revision: Sequence
    busy_revision: Sequence
    origin: MovePosition
    destination: MovePosition


class MoveIntent(Model):
    model_id: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    grant_id: Id
    grant_revision: Sequence
    reviewed_frame_id: Id
    deadline: UtcInstant
    anchor: MoveAnchor
    members: list[MoveMember] = Field(min_length=1, max_length=32)


class MoveRequest(Model):
    command_id: Id
    holder_id: Id
    move: MoveIntent
    order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)


class DirectMoveMember(Model):
    asset_id: Id
    entity_id: Id
    executor_id: Id
    source_id: Id
    control_track_id: Id | None = None
    grant_id: Id
    binding_revision: Sequence


class DirectMoveIntent(Model):
    intercept: Literal[True] | None = None
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
    anchor: MoveAnchor
    members: list[DirectMoveMember] = Field(min_length=1, max_length=32)


class DirectMoveRequest(Model):
    command_id: Id
    holder_id: Id
    direct: DirectMoveIntent


class DirectOrderContext(Model):
    holder_id: Id
    executor_epoch: Id
    grant_id: Id
    grant_revision: Sequence
    order: int = Field(ge=1, le=9007199254740991, strict=True)


class DirectMemberOutcome(Model):
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


class ControlMemberOutcome(Model):
    asset_id: Id
    entity_id: Id
    outcome: Literal["accepted", "skipped"]
    code: Literal["OK", "ORDER_SUPERSEDED", "UNAVAILABLE"]
    reason: str

    @model_validator(mode="after")
    def evidence(self):
        if (self.outcome == "accepted") != (self.code == "OK"):
            raise ValueError("Control outcome and code disagree")
        return self


class CompletionSample(Model):
    sequence: Sequence
    track_id: Id
    timestamp: UtcInstant
    position: MovePosition


class MovementExecution(MoveMember):
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
    completion_sample: CompletionSample | None = None
    travelled_metres: Finite = Field(ge=0)
    remaining_metres: Finite = Field(ge=0)
    speed_mps: Finite = Field(default=20.0, gt=0, le=280/3.6)
    suspended_by: Id | None = None
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
    capabilities: list[Literal["move-horizontal", "demo-intercept"]]
    position_reference: Literal["ELLIPSOID/WGS84"]
    busy_revision: Sequence = 0
    eligible: bool = False
    reason: str
    last_direct_order: DirectOrderContext | None = None


class InteractiveRun(Model):
    schema_version: Literal["1.7"] = "1.7"
    mission_id: Id
    run_id: Id
    template_id: Literal["singapore-local-v1", "singapore-local-v2"] = "singapore-local-v2"
    executor_id: Id
    executor_epoch: Id
    source_id: Id
    state: RunState
    run_revision: Sequence
    grant_id: Id
    grant_revision: Sequence
    capabilities: list[Literal["run-control", "scenario-pair", "boundary-edit", "fleet-policy", "demo-outcome"]]
    supported_actions: list[Action]
    lease: Lease
    tick: Sequence
    last_report_at: UtcInstant | None = None
    controls: list[AssetControl] = Field(max_length=32)
    movement_model: Literal["local-horizontal-v1"] = "local-horizontal-v1"
    executions: list[MovementExecution] = Field(default_factory=list, max_length=64)



class SuggestedAction(Model):
    operation: Literal["behavior", "stop", "return-to-script"]
    members: list[DirectMoveMember] = Field(min_length=1, max_length=32)
    policy: BehaviorPolicy | None = None

    @model_validator(mode="after")
    def exact_action(self):
        if (self.operation == "behavior") != (self.policy is not None):
            raise ValueError("Suggested behavior requires its exact policy")
        if len({m.entity_id for m in self.members}) != len(self.members) or len({m.asset_id for m in self.members}) != len(self.members):
            raise ValueError("Suggested members must be unique")
        return self


class RecommendationUnchanged(Model):
    entity_id: Id
    disposition: Literal["unchanged", "excluded"]
    reason: str = Field(min_length=1, max_length=500)


class RecommendationOption(Model):
    id: Id
    title: str = Field(min_length=1, max_length=160)
    explanation: str = Field(min_length=1, max_length=1200)
    consequences: list[str] = Field(max_length=6)
    unchanged_entity_ids: list[Id] = Field(max_length=32)
    unchanged_reasons: list[RecommendationUnchanged] = Field(max_length=32)
    action: SuggestedAction | None = None

    @model_validator(mode="after")
    def explain_unchanged(self):
        if len(self.unchanged_reasons) != len(set(self.unchanged_entity_ids)) or {r.entity_id for r in self.unchanged_reasons} != set(self.unchanged_entity_ids):
            raise ValueError("Every unchanged member requires exactly one option-specific reason")
        return self


class RecommendationMember(Model):
    entity_id: Id
    label: str = Field(max_length=256)
    available: bool
    state: str = Field(max_length=500)
    exclusion: str | None = Field(default=None, max_length=500)


class RecommendationContext(Model):
    schema_version: Literal["1.0"] = "1.0"
    source: Literal["rules"] = "rules"
    mission_id: Id
    run_id: Id
    executor_epoch: Id
    source_id: Id
    input_frame_id: Id
    sequence: Sequence
    created_at: UtcInstant
    expires_at: UtcInstant
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    selected_entity_ids: list[Id] = Field(min_length=1, max_length=32)
    members: list[RecommendationMember] = Field(min_length=1, max_length=32)
    eligible_target_ids: list[Id] = Field(max_length=32)
    assignment_count: int = Field(ge=0, le=32)
    situation: str = Field(max_length=1200)
    unavailable_reason: str | None = Field(default=None, max_length=500)


class RecommendationSet(RecommendationContext):
    id: Id
    options: list[RecommendationOption] = Field(min_length=1, max_length=4)


class RecommendationRef(Model):
    recommendation_id: Id
    option_id: Id


class RecommendationAudit(RecommendationContext):
    recommendation_id: Id
    option: RecommendationOption


class RecommendationRequest(Model):
    entity_ids: list[Id] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def unique_selection(self):
        if len(set(self.entity_ids)) != len(self.entity_ids):
            raise ValueError("Select each entity once")
        return self


class Intent(Model):
    recommendation: RecommendationAudit | None = None
    policy: BehaviorPolicy | None = None
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
    boundary: BoundaryMutation | None = None
    issued_at: UtcInstant
    expires_at: UtcInstant
    execution_id: Id | None = None
    execution_revision: Sequence | None = None
    members: list[DirectMoveMember] | None = Field(default=None, min_length=1, max_length=32)
    order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)

    @model_validator(mode="after")
    def target(self):
        if self.recommendation is not None and self.action not in {"behavior", "stop", "return-to-script"}:
            raise ValueError("Recommendation audit requires an existing selected command")
        if (self.action == "behavior") != (self.policy is not None):
            raise ValueError("Behavior requires its exact policy")
        if (self.action == "boundary-edit") != (self.boundary is not None):
            raise ValueError("Boundary editing requires its exact versioned mutation")
        selected = self.action in {"stop", "return-to-script", "behavior"}
        if selected != (self.members is not None and self.order is not None) or (not selected and (self.members is not None or self.order is not None)):
            raise ValueError("Selected control requires exact members and logical order")
        if self.action == "cancel":
            if self.execution_id is None or self.execution_revision is None:
                raise ValueError("cancel intent requires execution revision")
        elif self.execution_id is not None or self.execution_revision is not None:
            raise ValueError("lifecycle intent cannot target execution")
        return self


class IntentRequest(Model):
    recommendation: RecommendationRef | None = None
    policy: BehaviorPolicy | None = None
    action: Action
    boundary: BoundaryMutation | None = None
    execution_id: Id | None = None
    members: list[DirectMoveMember] | None = Field(default=None, min_length=1, max_length=32)
    order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)

    @model_validator(mode="after")
    def selection(self):
        if self.recommendation is not None and self.action not in {"behavior", "stop", "return-to-script"}:
            raise ValueError("Recommendations only reference selected commands")
        if (self.action == "behavior") != (self.policy is not None):
            raise ValueError("Behavior requires its exact policy")
        if (self.action == "boundary-edit") != (self.boundary is not None):
            raise ValueError("Boundary editing requires its exact versioned mutation")
        selected = self.action in {"stop", "return-to-script", "behavior"}
        if selected != (self.members is not None and self.order is not None) or (not selected and (self.members is not None or self.order is not None)):
            raise ValueError("Selected control requires exact members and logical order")
        if self.action != "cancel" and self.execution_id is not None:
            raise ValueError("Only Cancel targets a specific execution")
        return self


class CommandRequest(Model):
    command_id: Id
    holder_id: Id
    intent: Intent


class CreateRunRequest(Model):
    creation_id: Id
    template_id: Id | None = None
    scenario: ScenarioRef | None = None

    @model_validator(mode="after")
    def exactly_one_source(self):
        if (self.template_id is None) == (self.scenario is None):
            raise ValueError("Choose exactly one template or saved scenario revision")
        return self


class Receipt(Model):
    movement_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    behavior_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    behavior_outcomes: list[BehaviorMemberOutcome] = Field(default_factory=list, max_length=32)
    target_scope: list[Id] = Field(default_factory=list, max_length=32)
    schema_version: Literal["1.6"] = "1.6"
    request_id: Id
    operation: Literal["create", "acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end", "move", "cancel", "direct-move", "stop", "return-to-script", "boundary-edit", "behavior", "intercept-approach"]
    boundary_revision: Sequence | None = None
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
    direct_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    member_outcomes: list[DirectMemberOutcome] = Field(default_factory=list, max_length=32)
    control_order: int | None = Field(default=None, ge=1, le=9007199254740991, strict=True)
    control_outcomes: list[ControlMemberOutcome] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def result(self):
        if self.movement_order is not None and self.operation != "move":
            raise ValueError("Reviewed movement order attached to another operation")
        if self.operation in {"behavior", "intercept-approach"}:
            if self.behavior_order is None or self.execution_ids:
                raise ValueError("Behavior receipt requires order without fabricated movement")
            accepted = [o for o in self.behavior_outcomes if o.outcome == "accepted"]
            if self.accepted != bool(accepted) or len({o.asset_id for o in self.behavior_outcomes}) != len(self.behavior_outcomes) or len({o.entity_id for o in self.behavior_outcomes}) != len(self.behavior_outcomes):
                raise ValueError("Behavior receipt evidence disagrees")
        elif self.behavior_order is not None or self.behavior_outcomes or self.target_scope:
            raise ValueError("Behavior result attached to another operation")
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


class RunRead(Model):
    unit_profiles: dict[Id, UnitProfile] = Field(default_factory=dict)
    schema_version: Literal["1.7"] = "1.7"
    server_time: UtcInstant
    frame_id: Id
    sequence: Sequence
    run: InteractiveRun
    owns_control: bool
    lease_state: Literal["unclaimed", "held", "expired"]


ReceiptRead = Receipt | LegacyD4Receipt | LegacyD3aReceipt | LegacyD3Receipt | LegacyD2Receipt | LegacyM12Receipt | LegacyReceipt


class ExecutionRead(Model):
    schema_version: Literal["1.3"] = "1.3"
    mission_id: Id
    frame_id: Id
    sequence: Sequence
    executions: list[MovementExecution] = Field(max_length=64)


class DemoEntry(Model):
    schema_version: Literal["1.1"] = "1.1"
    enabled: bool
    template_id: Literal["singapore-local-v2"] = "singapore-local-v2"
    active_mission_id: Id | None = None


class CommandContracts(Model):
    """Export root; no route accepts this aggregate."""
    intent: Intent
    command: CommandRequest
    creation: CreateRunRequest
    receipt: ReceiptRead
    status: RunRead
    legacy_d4_status: LegacyD4RunRead
    legacy_d3a_status: LegacyD3aRunRead
    entry: DemoEntry
    move: MoveRequest
    direct_move: DirectMoveRequest
    executions: ExecutionRead
    recommendation_request: RecommendationRequest
    recommendations: RecommendationSet
