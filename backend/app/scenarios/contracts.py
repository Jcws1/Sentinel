"""D1a authored definitions, independent of operational frames and external simulation."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Finite, Longitude, Latitude, UtcInstant
from app.scenarios.boundaries import BoundaryDefinition


class ScenarioAltitude(Model):
    metres: Finite = Field(ge=0, le=5000)
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class ScenarioPosition(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude
    altitude: ScenarioAltitude


class UnitPlacement(Model):
    id: Id = Field(max_length=64)
    label: str = Field(min_length=1, max_length=64)
    category: Literal["friendly", "hostile", "unknown"]
    command_role: Literal["sentinel", "observation"]
    position: ScenarioPosition
    heading_true_deg: Finite = Field(ge=0, lt=360)

    @model_validator(mode="after")
    def valid_role_and_position(self):
        from app.commands.kinematics import in_extent
        if self.command_role == "sentinel" and self.category != "friendly":
            raise ValueError("Only explicitly friendly placements may request the Sentinel role")
        if not self.label.strip() or not in_extent(self.position.model_dump(by_alias=True)):
            raise ValueError("A named placement within the local ±5 km extent is required")
        return self


class ScenarioContent(Model):
    name: str = Field(min_length=1, max_length=80)
    units: list[UnitPlacement] = Field(max_length=32)
    boundaries: list[BoundaryDefinition] | None = Field(default=None, max_length=16)
    boundary_rule_version: Literal["local-boundary-v1"] | None = None

    @model_validator(mode="after")
    def identities(self):
        if not self.name.strip() or len({u.id for u in self.units}) != len(self.units):
            raise ValueError("Scenario name and unique placement IDs are required")
        if (self.boundaries is None) != (self.boundary_rule_version is None):
            raise ValueError("Boundary content requires its explicit rule version")
        ids = [b.id for b in self.boundaries or []]
        if len(ids) != len(set(ids)) or set(ids) & {u.id for u in self.units}:
            raise ValueError("Boundary and unit identities must be unique")
        return self


class ScenarioRef(Model):
    definition_id: Id
    revision: int = Field(ge=1, le=9007199254740991, strict=True)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ScenarioBinding(ScenarioRef):
    name: str
    entity_ids: dict[Id, Id]


class ScenarioRevision(ScenarioRef):
    schema_version: Literal["1.0", "1.1"] = "1.1"
    created_at: UtcInstant
    content: ScenarioContent

    @model_validator(mode="before")
    @classmethod
    def strict_legacy(cls, value):
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.0":
            from app.scenarios.legacy import ScenarioRevision as LegacyRevision
            LegacyRevision.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        return value

    @model_validator(mode="after")
    def immutable_hash(self):
        if self.schema_version != ("1.1" if self.content.boundaries is not None else "1.0"):
            raise ValueError("Scenario schema and content version disagree")
        if self.schema_version == "1.0":
            from app.scenarios.legacy import ScenarioRevision as LegacyRevision
            LegacyRevision.model_validate(self.model_dump(by_alias=True, exclude_none=True))
        import hashlib
        from app.world.serialization import canonical
        if hashlib.sha256(canonical(self.content).encode()).hexdigest() != self.content_hash:
            raise ValueError("Scenario content does not match its immutable hash")
        return self


class ScenarioWrite(Model):
    request_id: Id
    content: ScenarioContent
    expected_revision: int = Field(ge=0, le=9007199254740991, strict=True)


class ScenarioReceipt(Model):
    schema_version: Literal["1.0", "1.1"] = "1.1"
    request_id: Id
    accepted: bool
    code: Literal["OK", "REVISION_CONFLICT", "NOT_FOUND"]
    message: str
    result: ScenarioRevision | None = None

    @model_validator(mode="before")
    @classmethod
    def strict_legacy(cls, value):
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.0":
            from app.scenarios.legacy import ScenarioReceipt as LegacyReceipt
            LegacyReceipt.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        return value

    @model_validator(mode="after")
    def evidence(self):
        if self.schema_version == "1.0":
            from app.scenarios.legacy import ScenarioReceipt as LegacyReceipt
            LegacyReceipt.model_validate(self.model_dump(by_alias=True, exclude_none=True))
        if self.accepted != (self.code == "OK") or self.accepted != (self.result is not None):
            raise ValueError("Scenario receipt requires immutable revision evidence")
        return self


class ScenarioList(Model):
    schema_version: Literal["1.0", "1.1"] = "1.1"
    scenarios: list[ScenarioRevision]


class ScenarioContracts(Model):
    write: ScenarioWrite
    receipt: ScenarioReceipt
    revision: ScenarioRevision
    catalog: ScenarioList
