"""The immutable boundary is text, never a frozen model's nested dictionaries."""
import json
from datetime import datetime, timezone
from app.domain.models import Model, WorldFrame


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def canonical(value: Model | dict) -> str:
    if isinstance(value, Model):
        value = value.model_dump(mode="json", by_alias=True, exclude_none=True)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def validated_frame(value: Model | dict | str) -> str:
    text = value if isinstance(value, str) else canonical(value)
    return canonical(WorldFrame.model_validate_json(text))
