"""D1a authored definitions, independent of operational frames and external simulation."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Finite, Longitude, Latitude, UtcInstant
from app.scenarios.boundaries import BoundaryDefinition
from app.scenarios.actions import ScheduledAction, validate_chain
from app.domain.capacity import MAX_SCENARIO_UNITS, MAX_CONTROLLED_UNITS


class ScenarioAltitude(Model):
    metres: Finite = Field(ge=0, le=5000)
    reference: Literal["ELLIPSOID"] = "ELLIPSOID"
    datum_id: Literal["WGS84"] = "WGS84"


class ScenarioPosition(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude
    altitude: ScenarioAltitude


from app.commands.unit_profiles import UnitProfileId, allowed_profile


class UnitPlacement(Model):
    profile_id: UnitProfileId | None = None
    id: Id = Field(max_length=64)
    label: str = Field(min_length=1, max_length=64)
    category: Literal["friendly", "hostile", "unknown"]
    command_role: Literal["sentinel", "observation"]
    position: ScenarioPosition
    heading_true_deg: Finite = Field(ge=0, lt=360)

    @model_validator(mode="after")
    def valid_role_and_position(self):
        from app.commands.kinematics import in_extent
        if not allowed_profile(self.profile_id, self.category):
            raise ValueError("Unit profile is not available for this affiliation")
        if self.command_role == "sentinel" and self.category != "friendly":
            raise ValueError("Only explicitly friendly placements may request the Sentinel role")
        if not self.label.strip() or not in_extent(self.position.model_dump(by_alias=True)):
            raise ValueError("A named placement within the local ±5 km extent is required")
        return self


class ScenarioContent(Model):
    name: str = Field(min_length=1, max_length=80)
    units: list[UnitPlacement] = Field(max_length=MAX_SCENARIO_UNITS)
    boundaries: list[BoundaryDefinition] | None = Field(default=None, max_length=16)
    boundary_rule_version: Literal["local-boundary-v1"] | None = None

    actions: list[ScheduledAction] | None = Field(default=None, max_length=128)
    schedule_rule_version: Literal["local-schedule-v1", "local-schedule-v2"] | None = None

    @model_validator(mode="after")
    def identities(self):
        if sum(u.command_role == "sentinel" for u in self.units) > MAX_CONTROLLED_UNITS:
            raise ValueError("At most 32 Sentinel-controlled units are supported")
        if not self.name.strip() or len({u.id for u in self.units}) != len(self.units):
            raise ValueError("Scenario name and unique placement IDs are required")
        if (self.boundaries is None) != (self.boundary_rule_version is None):
            raise ValueError("Boundary content requires its explicit rule version")
        ids = [b.id for b in self.boundaries or []]
        if len(ids) != len(set(ids)) or set(ids) & {u.id for u in self.units}:
            raise ValueError("Boundary and unit identities must be unique")
        if (self.actions is None) != (self.schedule_rule_version is None):
            raise ValueError("Script content requires its explicit rule version")
        units = {u.id: u for u in self.units}
        actions = self.actions or []
        action_ids = [a.id for a in actions]
        actor_ticks = [(a.unit_id, a.offset_ms) for a in actions if a.offset_ms is not None]
        if len(action_ids) != len(set(action_ids)) or set(action_ids) & (set(ids) | set(units)):
            raise ValueError("Action identities must be unique across the definition")
        if len(actor_ticks) != len(set(actor_ticks)):
            raise ValueError("An actor may start only one movement at each 200 ms tick")
        if any(a.unit_id not in units or units[a.unit_id].category == "unknown" for a in actions):
            raise ValueError("Script actions require a placed friendly or hostile actor; Unknown remains stationary")
        validate_chain(actions, self.schedule_rule_version)
        return self


def content_version(content):
    if len(content.units) > 32:
        return "1.5"
    return "1.4" if any(u.profile_id for u in content.units) else "1.3" if content.schedule_rule_version == "local-schedule-v2" else "1.2" if content.actions is not None else "1.1" if content.boundaries is not None else "1.0"


class ScenarioRef(Model):
    definition_id: Id
    revision: int = Field(ge=1, le=9007199254740991, strict=True)
    content_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ScenarioBinding(ScenarioRef):
    name: str
    entity_ids: dict[Id, Id]


class ScenarioRevision(ScenarioRef):
    schema_version: Literal["1.0", "1.1", "1.2", "1.3", "1.4", "1.5"] = "1.5"
    created_at: UtcInstant
    content: ScenarioContent

    @model_validator(mode="before")
    @classmethod
    def strict_legacy(cls, value):
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.3":
            from app.scenarios.legacy_d3a import LegacyD3aScenarioRevision
            LegacyD3aScenarioRevision.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.2":
            from app.scenarios.legacy_scheduled import ScenarioRevision as LegacyScheduled
            LegacyScheduled.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.0":
            from app.scenarios.legacy import ScenarioRevision as LegacyRevision
            LegacyRevision.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.1":
            from app.scenarios.legacy_boundaries import ScenarioRevision as LegacyBoundary
            LegacyBoundary.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        return value

    @model_validator(mode="after")
    def immutable_hash(self):
        if self.schema_version != content_version(self.content):
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
    schema_version: Literal["1.0", "1.1", "1.2", "1.3", "1.4", "1.5"] = "1.5"
    request_id: Id
    accepted: bool
    code: Literal["OK", "REVISION_CONFLICT", "NOT_FOUND"]
    message: str
    result: ScenarioRevision | None = None

    @model_validator(mode="before")
    @classmethod
    def strict_legacy(cls, value):
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.3":
            from app.scenarios.legacy_d3a import LegacyD3aScenarioReceipt
            LegacyD3aScenarioReceipt.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.2":
            from app.scenarios.legacy_scheduled import ScenarioReceipt as LegacyScheduled
            LegacyScheduled.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.0":
            from app.scenarios.legacy import ScenarioReceipt as LegacyReceipt
            LegacyReceipt.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        if isinstance(value, dict) and value.get("schemaVersion", value.get("schema_version")) == "1.1":
            from app.scenarios.legacy_boundaries import ScenarioReceipt as LegacyBoundary
            LegacyBoundary.model_validate({k:v.model_dump(by_alias=True,exclude_none=True) if isinstance(v,Model) else v for k,v in value.items()})
        return value

    @model_validator(mode="after")
    def evidence(self):
        if self.schema_version == "1.0":
            from app.scenarios.legacy import ScenarioReceipt as LegacyReceipt
            LegacyReceipt.model_validate(self.model_dump(by_alias=True, exclude_none=True))
        if self.accepted != (self.code == "OK") or self.accepted != (self.result is not None):
            raise ValueError("Scenario receipt requires immutable revision evidence")
        if self.schema_version != "1.5" and self.result is not None and self.result.schema_version == "1.5":
            raise ValueError("Expanded capacity requires scenario envelope 1.5")
        return self


class ScenarioList(Model):
    schema_version: Literal["1.0", "1.1", "1.2", "1.3", "1.4", "1.5"] = "1.5"
    scenarios: list[ScenarioRevision]

    @model_validator(mode="after")
    def capacity_version(self):
        # Archived catalogs permit mixed earlier revision versions, but none can
        # contain the newly introduced 1.5 revision with expanded unit capacity.
        if self.schema_version != "1.5" and any(s.schema_version == "1.5" for s in self.scenarios):
            raise ValueError("Expanded capacity requires scenario envelope 1.5")
        return self


class ScenarioContracts(Model):
    write: ScenarioWrite
    receipt: ScenarioReceipt
    revision: ScenarioRevision
    catalog: ScenarioList
