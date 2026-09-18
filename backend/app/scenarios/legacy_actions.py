"""Bounded immutable script definitions, with no operator-control capability."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Longitude, Latitude


class ScriptDestination(Model):
    longitude_deg: Longitude
    latitude_deg: Latitude

    @model_validator(mode="after")
    def supported_extent(self):
        from app.commands.kinematics import in_extent
        if not in_extent(self.model_dump(by_alias=True)):
            raise ValueError("Script destination must be within the local ±5 km extent")
        return self


class ScheduledAction(Model):
    id: Id = Field(max_length=64)
    unit_id: Id = Field(max_length=64)
    kind: Literal["move"] = "move"
    offset_ms: int = Field(ge=0, le=600000, multiple_of=200, strict=True)
    ordinal: int = Field(ge=0, le=127, strict=True)
    destination: ScriptDestination
