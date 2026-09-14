"""Version 1 domain authority, promoted from the reviewed Phase 0 draft.

Frozen Pydantic objects are not deeply immutable. Service/storage boundaries use
canonical JSON bytes and fresh decoded copies; never publish these objects directly.
"""
from datetime import datetime
import json
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator
from pydantic.alias_generators import to_camel


def calendar_instant(value: str) -> str:
    datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    return value


Id = Annotated[str, Field(min_length=1, max_length=256, pattern=r"^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$")]
UtcInstant = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"), AfterValidator(calendar_instant)]
Finite = Annotated[float, Field(allow_inf_nan=False)]
Sequence = Annotated[int, Field(ge=0, le=9007199254740991)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True,
                              frozen=True, strict=True, allow_inf_nan=False, revalidate_instances="always")

    @field_validator("extensions", check_fields=False)
    @classmethod
    def finite_json_extensions(cls, value):
        # Pydantic's recursive JsonValue accepts non-finite floats independently
        # of the outer model's allow_inf_nan setting.
        json.dumps(value, allow_nan=False)
        return value


