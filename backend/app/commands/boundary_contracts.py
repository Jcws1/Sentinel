"""Versioned live demo geometry. No entity-control authority is implied."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence
from app.scenarios.boundaries import BoundaryDefinition


class BoundaryMutation(Model):
    expected_revision: Sequence
    operation: Literal["upsert", "delete"]
    boundary_id: Id
    definition: BoundaryDefinition | None = None

    @model_validator(mode="after")
    def payload(self):
        if (self.operation == "upsert") != (self.definition is not None):
            raise ValueError("Upsert requires geometry; Delete cannot carry geometry")
        if self.definition and self.definition.type == "untyped":
            raise ValueError("Choose a type or annotation-only before live Apply")
        return self


class LiveBoundaries(Model):
    rule_version: Literal["local-boundary-v1"] = "local-boundary-v1"
    run_id: Id
    source_id: Id
    revision: Sequence = Field(ge=1)
    last_command_id: Id
    committed_sequence: Sequence

