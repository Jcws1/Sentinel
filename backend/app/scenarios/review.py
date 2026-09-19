"""Read-only, exact-revision review. This is never an execution authority token."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Finite, Id, UtcInstant
from app.scenarios.contracts import ScenarioRef
from app.commands.unit_profiles import UnitProfile
from app.domain.capacity import MAX_SCENARIO_UNITS


class ScenarioCounts(Model):
    total: int = Field(ge=0, le=MAX_SCENARIO_UNITS)
    friendly: int = Field(ge=0, le=MAX_SCENARIO_UNITS)
    hostile: int = Field(ge=0, le=MAX_SCENARIO_UNITS)
    unknown: int = Field(ge=0, le=MAX_SCENARIO_UNITS)
    controlled: int = Field(ge=0, le=32)
    observation_only: int = Field(ge=0, le=MAX_SCENARIO_UNITS)

    @model_validator(mode="after")
    def totals(self):
        if self.total != self.friendly + self.hostile + self.unknown or self.total != self.controlled + self.observation_only or self.controlled > self.friendly:
            raise ValueError("Invalid scenario review counts")
        return self


class ScenarioMotionPreset(Model):
    template_id: Literal["singapore-local-v2"]
    model_id: Literal["local-horizontal-v1"]
    speed_mps: Finite = Field(gt=0)
    unit_profiles: dict[Id, UnitProfile] = Field(default_factory=dict)


class ScenarioReviewIssue(Model):
    code: Literal["EMPTY_ARRANGEMENT", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "UNTYPED_BOUNDARY", "RESTRICTED_OCCUPANT", "SCRIPT_PATH_BLOCKED", "SCRIPT_TIMING_INVALID"]
    message: str
    boundary_id: Id | None = None
    unit_id: Id | None = None
    action_id: Id | None = None


class ScriptTimingReview(Model):
    action_id: Id
    estimated_start_ms: int | None = Field(default=None, ge=0)
    estimated_end_ms: int | None = Field(default=None, ge=0)
    after_action_id: Id | None = None
    delay_ms: int | None = Field(default=None, ge=0)
    nominal_state: str


class ScenarioReview(Model):
    schema_version: Literal["1.4", "1.5"] = "1.4"
    reference: ScenarioRef
    name: str
    checked_at: UtcInstant
    boundary_count: int = Field(ge=0, le=16)
    action_count: int = Field(ge=0, le=128)
    script_duration_ms: int = Field(ge=0, le=600000, multiple_of=200)
    timings: list[ScriptTimingReview] = Field(default_factory=list, max_length=128)
    counts: ScenarioCounts
    motion_preset: ScenarioMotionPreset
    issues: list[ScenarioReviewIssue]
    active_mission_id: Id | None = None
    can_run: bool

    @model_validator(mode="after")
    def evidence(self):
        if self.schema_version == "1.4" and self.counts.total > 32:
            raise ValueError("Expanded capacity requires scenario review 1.5")
        if self.can_run != (not self.issues):
            raise ValueError("Review eligibility and issues disagree")
        return self


class ScenarioReviewContracts(Model):
    request: ScenarioRef
    review: ScenarioReview
