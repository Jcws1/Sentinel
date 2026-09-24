from typing import Literal

from pydantic import Field

from app.domain.base import Id, Model, Sequence, UtcInstant


class AssessmentRequest(Model):
    question: str = Field(min_length=1, max_length=500)
    frame_id: Id


class EvidenceRef(Model):
    kind: Literal["mission", "entity", "track", "asset", "sensor", "task", "event", "zone"]
    id: Id
    claim: str = Field(min_length=1, max_length=500)


class OrientedFinding(Model):
    statement: str = Field(min_length=1, max_length=800)
    confidence: Literal["high", "medium", "low"]
    evidence_ids: list[Id] = Field(min_length=1, max_length=16)


class SituationAssessment(Model):
    schema_version: Literal["1.0"] = "1.0"
    mission_id: Id
    frame_id: Id
    sequence: Sequence
    source_effective_at: UtcInstant
    generated_at: UtcInstant
    model: str = Field(min_length=1, max_length=200)
    latency_ms: int = Field(ge=0)
    summary: str = Field(min_length=1, max_length=1200)
    observations: list[OrientedFinding] = Field(max_length=20)
    orientation: list[OrientedFinding] = Field(max_length=20)
    uncertainties: list[str] = Field(max_length=20)
    attention_items: list[str] = Field(max_length=12)
    evidence: list[EvidenceRef] = Field(max_length=80)
    limitations: list[str] = Field(max_length=12)
