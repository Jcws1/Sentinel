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
    offset_ms: int | None = Field(default=None, ge=0, le=600000, multiple_of=200, strict=True)
    after_action_id: Id | None = Field(default=None, max_length=64)
    delay_ms: int | None = Field(default=None, ge=0, le=600000, multiple_of=200, strict=True)
    ordinal: int = Field(ge=0, le=127, strict=True)
    destination: ScriptDestination

    @model_validator(mode="after")
    def timing(self):
        absolute = self.offset_ms is not None
        dependent = self.after_action_id is not None and self.delay_ms is not None
        if absolute == dependent or (absolute and (self.after_action_id is not None or self.delay_ms is not None)):
            raise ValueError("Choose an absolute start or previous movement plus delay")
        return self


def validate_chain(actions, rule_version):
    by_id = {a.id: a for a in actions}
    successors = set()
    for action in actions:
        if action.after_action_id is None:
            continue
        if rule_version != "local-schedule-v2":
            raise ValueError("Completion dependencies require local-schedule-v2")
        predecessor = by_id.get(action.after_action_id)
        if predecessor is None or predecessor.unit_id != action.unit_id:
            raise ValueError("Previous movement must be an existing action for the same actor")
        if predecessor.id in successors:
            raise ValueError("A movement may have only one completion-dependent successor")
        successors.add(predecessor.id)
        seen = {action.id}
        current = predecessor
        while current is not None:
            if current.id in seen:
                raise ValueError("Movement dependencies cannot contain a cycle")
            seen.add(current.id)
            current = by_id.get(current.after_action_id)
