"""Read-only, exact-revision review. This is never an execution authority token."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Finite, Id, UtcInstant
from app.scenarios.contracts import ScenarioRef


class ScenarioCounts(Model):
    total: int = Field(ge=0, le=32)
    friendly: int = Field(ge=0, le=32)
    hostile: int = Field(ge=0, le=32)
    unknown: int = Field(ge=0, le=32)
    controlled: int = Field(ge=0, le=32)
    observation_only: int = Field(ge=0, le=32)

    @model_validator(mode="after")
    def totals(self):
        if self.total != self.friendly + self.hostile + self.unknown or self.total != self.controlled + self.observation_only or self.controlled > self.friendly:
            raise ValueError("Invalid scenario review counts")
        return self


class ScenarioMotionPreset(Model):
    template_id: Literal["singapore-local-v2"]
    model_id: Literal["local-horizontal-v1"]
    speed_mps: Finite = Field(gt=0)


class ScenarioReviewIssue(Model):
    code: Literal["EMPTY_ARRANGEMENT", "DEMO_DISABLED", "ACTIVE_RUN_EXISTS", "UNTYPED_BOUNDARY", "RESTRICTED_OCCUPANT"]
    message: str
    boundary_id: Id | None = None
    unit_id: Id | None = None


class ScenarioReview(Model):
    schema_version: Literal["1.1"] = "1.1"
    reference: ScenarioRef
    name: str
    checked_at: UtcInstant
    boundary_count: int = Field(ge=0, le=16)
    counts: ScenarioCounts
    motion_preset: ScenarioMotionPreset
    issues: list[ScenarioReviewIssue]
    active_mission_id: Id | None = None
    can_run: bool

    @model_validator(mode="after")
    def evidence(self):
        if self.can_run != (not self.issues):
            raise ValueError("Review eligibility and issues disagree")
        return self


class ScenarioReviewContracts(Model):
    request: ScenarioRef
    review: ScenarioReview
