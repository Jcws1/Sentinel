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
from decimal import Decimal
from pathlib import Path

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


def _orientation(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on(a, b, p):
    return _orientation(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def _intersects(a, b, c, d):
    x, y, z, w = _orientation(a, b, c), _orientation(a, b, d), _orientation(c, d, a), _orientation(c, d, b)
    return (x * y < 0 and z * w < 0) or any((_on(a, b, c), _on(a, b, d), _on(c, d, a), _on(c, d, b)))


def validate_ring(ring, path):
    # Decimal conversion of accepted numeric values avoids absolute-coordinate
    # cancellation when a valid small ring is far from the numeric origin.
    points = [tuple(Decimal(str(v)) for v in point) for point in ring]
    if points[0] != points[-1]:
        invalid(path, "Polygon must be closed")
    if len(set(points[:-1])) != len(points) - 1:
        invalid(path, "Polygon vertices must be distinct except for closure")
    anchor = points[0]
    if sum(_orientation(anchor, a, b) for a, b in zip(points, points[1:])) == 0:
        invalid(path, "Zero-area polygon is unsupported by " + POLICY_ID)
    edges = list(zip(points, points[1:]))
    for i, (a, b) in enumerate(edges):
        c = edges[(i + 1) % len(edges)][1]
        if _on(a, b, c) or _on(b, c, a):
            invalid(path, "Polygon adjacent edges overlap")
        for j in range(i + 1, len(edges)):
            if j == i + 1 or (i == 0 and j == len(edges) - 1):
                continue
            if _intersects(a, b, *edges[j]):
                invalid(path, "Polygon must not self-intersect")


def inside_polygon(drone, ring):
    point = (drone["longitude_deg"], drone["latitude_deg"])
    # Decimal edge classification is reserved for exact/near-edge candidates;
    # ordinary crossing uses translated arithmetic. No geographic tolerance widens
    # eligibility, and dateline wrapping is not inferred by the planar policy.
    inside = False
    for a, b in zip(ring, ring[1:]):
        cross = _orientation(a, b, point)
        if abs(cross) <= 1e-12:
            da, db, dp = (tuple(Decimal(str(v)) for v in item) for item in (a, b, point))
            if _on(da, db, dp):
                return True
        if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (point[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0]) + a[0]:
            inside = not inside
    return inside


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
