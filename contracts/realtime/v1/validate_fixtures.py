"""Validate v1 JSONL fixtures. Requires the development dependency `jsonschema`."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
schema = json.loads((ROOT / "realtime.schema.json").read_text(encoding="utf-8"))
validator = Draft202012Validator(schema, format_checker=FormatChecker())


def records(name: str):
    for number, line in enumerate((ROOT / "fixtures" / name).read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            yield number, json.loads(line)


valid_count = 0
for line, record in records("valid.jsonl"):
    errors = list(validator.iter_errors(record))
    if errors:
        raise SystemExit(f"valid.jsonl:{line}: {errors[0].message}")
    if record["message_type"] == "gap" and record["missing_from"] > record["missing_through"]:
        raise SystemExit(f"valid.jsonl:{line}: gap interval is reversed")
    if record["message_type"] == "snapshot":
        track_ids = [track["track_id"] for track in record["tracks"]]
        if len(track_ids) != len(set(track_ids)):
            raise SystemExit(f"valid.jsonl:{line}: duplicate snapshot track_id")
        if record["covers_through"] > record["stream_sequence"]:
            raise SystemExit(f"valid.jsonl:{line}: snapshot covers future sequence")
    valid_count += 1

invalid_count = 0
for line, record in records("invalid.jsonl"):
    if not list(validator.iter_errors(record)):
        raise SystemExit(f"invalid.jsonl:{line}: unexpectedly valid")
    invalid_count += 1

print(f"validated {valid_count} valid and {invalid_count} invalid realtime/v1 fixtures")
