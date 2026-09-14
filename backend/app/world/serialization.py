"""The immutable boundary is text, never a frozen model's nested dictionaries."""
import json
from datetime import datetime, timezone, timedelta
from time import monotonic
from app.domain.models import Model, WorldFrame, LegacyWorldFrame


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def canonical(value: Model | dict) -> str:
    if isinstance(value, Model):
        value = value.model_dump(mode="json", by_alias=True, exclude_none=True)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def validated_frame(value: Model | dict | str) -> str:
    text = value if isinstance(value, str) else canonical(value)
    return canonical(WorldFrame.model_validate_json(text))


def read_frame(text: str) -> WorldFrame:
    """Validate legacy bytes before adapting only the in-memory representation."""
    value = json.loads(text)
    if value.get("schemaVersion") == "1.0":
        legacy = LegacyWorldFrame.model_validate_json(text)
        value = legacy.model_dump(mode="json", by_alias=True, exclude_none=True)
        value["schemaVersion"] = "1.1"
    return WorldFrame.model_validate_json(canonical(value))


def elapsed_utc_clock():
    """Process UTC anchor plus monotonic elapsed time; NTP changes cannot extend leases."""
    anchor, started = datetime.now(timezone.utc), monotonic()
    return lambda: (anchor + timedelta(seconds=monotonic() - started)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
