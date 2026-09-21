"""Typed Sentinel module projections; the frozen external JSON is separate."""
from typing import Annotated, Literal
from pydantic import Field
from app.domain.base import Model, Id, UtcInstant, Sequence


class CalibrationIdentity(Model):
    profile_id: str
    version: str
    evidence_status: Literal["NOTIONAL", "PUBLIC_PARTIAL", "VALIDATED"]


class SimulationProjection(Model):
    schema_version: Literal["1.0"] = "1.0"
    policy_id: Literal["sentinel-simulation-v1-local-1"] = "sentinel-simulation-v1-local-1"
    external_mission_id: str
    run_id: Id
    state: Literal["RUNNING", "HELD", "ABORTED", "FAILED"] | None = None
    phase: Literal["processing", "interrupted", "ready"]
    command_id: str
    source_mode: Literal["SIMULATED", "REPLAY"]
    calibration: CalibrationIdentity


class SimulationRunStatus(SimulationProjection):
    mission_id: Id
    received_at: UtcInstant
    completed_at: UtcInstant | None = None


class SimulationEntityDetail(Model):
    schema_version: Literal["1.0"] = "1.0"
    drone_id: str
    drone_class: Literal["I", "II", "III", "UNKNOWN"]
    input_health: int = Field(ge=0, le=100)
    health: int = Field(ge=0, le=100)
    reported_status: Literal["ACTIVE", "DISABLED", "REMOVED"]
    state_discontinuity: bool
    command_id: str
    run_id: Id
    calibration: CalibrationIdentity


class StoredRun(SimulationRunStatus):
    last_health: dict[str, Annotated[int, Field(ge=0, le=100)]] = Field(default_factory=dict)
    pending_command_id: str | None = None
    last_request: dict = Field(default_factory=dict)


class SimulationCommandSummary(Model):
    sequence: Sequence
    command_id: str
    action: Literal["START", "HOLD", "RESUME", "ABORT"]
    state: Literal["pending", "interrupted", "completed"]
    received_at: UtcInstant
    completed_at: UtcInstant | None = None


class SimulationModuleContracts(Model):
    run: SimulationRunStatus
    projection: SimulationProjection
    entity_detail: SimulationEntityDetail
    command: SimulationCommandSummary
