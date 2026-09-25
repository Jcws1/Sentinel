"""Duplicate-aware parser and deterministic, cooperative structural validation.

The checked-in frozen schema supplies structural rules. The walker implements
its bounded vocabulary explicitly; semantic rules are checked in document order.
No timestamp is resolved until the entire iterator completes successfully.
"""
import hashlib
import json
import math
import re
from datetime import datetime
from pathlib import Path

from app.domain import geometry
from app.simulation.policy import POLICY_ID

SCHEMA = json.loads((Path(__file__).resolve().parents[3] / "contracts/simulation/v1.request.schema.json").read_text(encoding="utf-8"))
TIMESTAMP = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$")


class SimulationError(Exception):
    def __init__(self, code, path, message, status=422):
        super().__init__(message)
        self.code, self.path, self.message, self.status = code, path, message, status


def pointer(path):
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in path)


def invalid(path, message, code="VALIDATION_ERROR"):
    raise SimulationError(code, pointer(path), message)


class _Pairs(list):
    pass


def parse_request(raw: str | bytes):
    def nonfinite(_):
        raise ValueError("Non-JSON numeric constant")

    def materialize(value, path):
        if isinstance(value, _Pairs):
            result = {}
            for key, child in value:
                if key in result:
                    raise SimulationError("DUPLICATE_KEY", pointer((*path, key)), "Duplicate JSON member", 400)
                result[key] = materialize(child, (*path, key))
            return result
        if isinstance(value, list):
            return [materialize(child, (*path, index)) for index, child in enumerate(value)]
        return value

    try:
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        return materialize(json.loads(text, object_pairs_hook=_Pairs, parse_constant=nonfinite), ())
    except SimulationError:
        raise
    except (ValueError, UnicodeError, RecursionError, TypeError):
        raise SimulationError("INVALID_JSON", "", "Request must be unambiguous UTF-8 JSON", 400) from None


def canonical_external(value):
    """C07: normalize numeric values; preserve arrays and opaque strings exactly."""
    def normalized(item):
        if isinstance(item, float):
            if not math.isfinite(item):
                raise SimulationError("INVALID_NUMBER", "", "Numbers must be finite")
            return int(item) if item.is_integer() else item
        if isinstance(item, list):
            return [normalized(child) for child in item]
        if isinstance(item, dict):
            return {key: normalized(child) for key, child in item.items()}
        return item
    return json.dumps(normalized(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def content_digest(value):
    return hashlib.sha256(canonical_external(value).encode("utf-8")).hexdigest()


def timestamp(value, path):
    if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
        invalid(path, "Use an exact UTC timestamp with millisecond precision")
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        invalid(path, "Invalid calendar timestamp; leap seconds are unsupported by " + POLICY_ID)
    return value


RING_MESSAGES = {
    geometry.UNCLOSED: "Polygon must be closed",
    geometry.DUPLICATE: "Polygon vertices must be distinct except for closure",
    geometry.ZERO_AREA: "Zero-area polygon is unsupported by " + POLICY_ID,
    geometry.ADJACENT_OVERLAP: "Polygon adjacent edges overlap",
    geometry.SELF_INTERSECTION: "Polygon must not self-intersect",
}


def validate_ring(ring, path):
    # C17: exact topology on each coordinate's shortest round-trip decimal -- the
    # same predicate as the core Polygon and frontend decoder, so every accepted
    # ring completes the mapped-world path. No tolerance or minimum feature size.
    problem = geometry.ring_violation(ring)
    if problem:
        invalid(path, RING_MESSAGES[problem])


def inside_polygon(drone, ring):
    """Inclusive planar containment (C17), exact on decimal spellings.

    ``ring`` is the external closed ring or a PreparedRing reused per request.
    No geographic tolerance widens eligibility, and dateline wrapping is not
    inferred by the planar policy.
    """
    prepared = ring if isinstance(ring, geometry.PreparedRing) else geometry.PreparedRing(ring)
    return prepared.contains(drone["longitude_deg"], drone["latitude_deg"])


def validate_steps(request):
    seen = {}
    rules = set()

    def semantic(value, path, parent):
        if path in (("command", "issued_at"), ("command", "execute_at")):
            timestamp(value, path)
        elif path == ("area", "polygon"):
            validate_ring(value, path)
        elif path == ("area", "max_altitude_m") and value < request["area"]["min_altitude_m"]:
            invalid(path, "Maximum altitude precedes minimum altitude")
        elif len(path) == 4 and path[:2] == ("calibration_profile", "rules") and path[-1] == "subject_class":
            pair = (parent["actor_class"], value)
            if pair in rules:
                invalid(path[:-1], "Duplicate ordered class rule")
            rules.add(pair)
        elif len(path) == 4 and path[0] == "samples_by_timestamp":
            if path[-1] == "drone_id":
                ids = seen.setdefault(path[1], set())
                if value in ids:
                    invalid(path, "Duplicate drone ID within snapshot")
                ids.add(value)
            elif path[-1] == "health":
                status = parent.get("status")
                if status == "ACTIVE" and value <= 0:
                    invalid(path, "ACTIVE requires positive health")
                if isinstance(status, str) and status in {"DISABLED", "REMOVED"} and value != 0:
                    invalid(path, "DISABLED and REMOVED require zero health")

    def walk(value, schema, path=(), parent=None):
        yield None
        if "$ref" in schema:
            schema = SCHEMA["$defs"][schema["$ref"].rsplit("/", 1)[-1]]
        kind = schema.get("type")
        valid_type = {
            "object": isinstance(value, dict), "array": isinstance(value, list),
            "string": isinstance(value, str),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "integer": isinstance(value, (int, float)) and not isinstance(value, bool) and (not isinstance(value, float) or value.is_integer()),
        }
        if value is None or (kind and not valid_type[kind]):
            invalid(path, "Value does not match the required type")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if isinstance(value, float) and not math.isfinite(value):
                invalid(path, "Numbers must be finite")
            if "minimum" in schema and value < schema["minimum"] or "maximum" in schema and value > schema["maximum"]:
                invalid(path, "Number is outside the permitted range")
        if "const" in schema and value != schema["const"] or "enum" in schema and value not in schema["enum"]:
            invalid(path, "Value is not supported by simulation v1")
        if isinstance(value, str):
            try:
                value.encode("utf-8")
            except UnicodeError:
                invalid(path, "String must be valid Unicode encodable as UTF-8")
            if len(value) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", math.inf):
                invalid(path, "String length is outside the permitted range")
            if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
                invalid(path, "String does not match the required format")
        if isinstance(value, dict):
            if path == ("samples_by_timestamp",):
                if request["command"]["action"] in {"START", "RESUME"} and not 1 <= len(value) <= 10_000:
                    invalid(path, "START/RESUME require 1–10,000 timestamps")
            properties = schema.get("properties", {})
            for key, child_schema in properties.items():
                if key not in value:
                    if key in schema.get("required", ()):
                        invalid((*path, key), "Required field is missing")
                    continue
                yield from walk(value[key], child_schema, (*path, key), value)
            for key in sorted(set(value) - set(properties)):
                extra = schema.get("additionalProperties", False)
                if extra is False:
                    invalid((*path, key), "Unknown field is not allowed")
                if path == ("samples_by_timestamp",):
                    timestamp(key, (*path, key))
                    if key < request["command"]["execute_at"]:
                        invalid((*path, key), "Timestamp precedes execute_at")
                yield from walk(value[key], extra, (*path, key), value)
        if isinstance(value, list):
            if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", math.inf):
                invalid(path, "Array length is outside the permitted range")
            prefix = schema.get("prefixItems", [])
            for index, child in enumerate(value):
                child_schema = prefix[index] if index < len(prefix) else schema.get("items", False)
                if child_schema is False:
                    invalid((*path, index), "Additional array items are not allowed")
                yield from walk(child, child_schema, (*path, index), value)
        semantic(value, path, parent)

    yield from walk(request, SCHEMA)
    return request


def validate_request(request):
    for _ in validate_steps(request):
        pass
    return request
