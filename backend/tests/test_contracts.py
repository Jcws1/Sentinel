import json
import subprocess
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from app.main import create_app


ROOT = Path(__file__).resolve().parents[2]


def test_generated_contracts_have_no_drift():
    subprocess.run([sys.executable, str(ROOT / "scripts/export_contracts.py"), "--check"], check=True)


def test_schemas_validate_fixture_world_and_snapshot(world):
    directory = ROOT / "contracts/sentinel/v1.7"
    world_schema = json.loads((directory / "world.schema.json").read_text(encoding="utf-8"))
    stream_schema = json.loads((directory / "stream.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(world_schema)
    Draft202012Validator.check_schema(stream_schema)
    Draft202012Validator(world_schema).validate(world)
    Draft202012Validator(stream_schema).validate({"type": "snapshot", "schemaVersion": "1.6", "missionId": world["mission"]["id"],
        "streamEpoch": world["streamEpoch"], "sequence": world["sequence"], "frame": world})
    definitions = create_app().openapi()["components"]["schemas"]
    assert all(name in definitions for name in ("WorldFrame", "SnapshotMessage", "DeltaMessage", "HeartbeatMessage", "ResyncRequiredMessage"))
