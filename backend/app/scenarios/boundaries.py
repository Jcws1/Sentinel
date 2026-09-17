from typing import Literal
from pydantic import Field, model_validator, field_validator
from app.domain.base import Model, Id, Longitude, Latitude
from app.scenarios.geometry import validate

BoundaryType = Literal["untyped", "annotation", "friendly", "patrol", "restricted"]


class BoundaryDefinition(Model):
    id: Id = Field(max_length=64)
    name: str = Field(min_length=1, max_length=64)
    type: BoundaryType
    vertices: list[tuple[Longitude, Latitude]] = Field(min_length=3, max_length=32)

    @field_validator('vertices', mode='before')
    @classmethod
    def json_pairs(cls, value):
        # JSON coordinates are arrays; preserve strict scalar validation.
        return [tuple(v) if isinstance(v, list) else v for v in value] if isinstance(value, list) else value

    @model_validator(mode="after")
    def geometry(self):
        if not self.name.strip():
            raise ValueError("Name the boundary.")
        validate(self.vertices, self.type)
        return self


class BoundaryRules(Model):
    rule_version: Literal["local-boundary-v1"] = "local-boundary-v1"
    zones: dict[Id, Literal["annotation", "friendly", "patrol", "restricted"]] = Field(max_length=16)
