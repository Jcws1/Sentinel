"""Deterministic export of backend-owned Current contracts (no DB/startup needed)."""
import argparse
import json
import sys
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import TypeAdapter
from app.domain.models import WorldFrame, MissionList
from app.main import create_app
from app.missions.fixtures import fixture_source, instant
from app.world.contracts import StreamMessage
from app.recording.history import ObservedHistory
from app.commands.contracts import CommandContracts
from app.commands.template import new_template


def exports() -> dict[str, dict]:
    frame, events = fixture_source("fixture-alpha", 0, instant(0))
    events[0].update(id="fixture-event-0", missionId="fixture-alpha", sequence=0, recordedAt=instant(0))
    frame.update(schemaVersion="1.4", frameId="fixture-frame-0", recordingId="fixture-recording-alpha", streamEpoch="fixture-epoch-alpha",
                 sequence=0, recordedAt=instant(0), recentEvents=events)
    frame = WorldFrame.model_validate_json(json.dumps(frame)).model_dump(mode="json", by_alias=True, exclude_none=True)
    with patch('app.commands.template.uuid4', side_effect=[UUID(int=i) for i in range(1, 5)]):
        _, demo = new_template(instant(0))
    demo.update(schemaVersion="1.4", frameId="demo-frame-0", recordingId="demo-recording", streamEpoch="demo-stream", sequence=0, recordedAt=instant(0), recentEvents=[])
    demo = WorldFrame.model_validate_json(json.dumps(demo)).model_dump(mode="json", by_alias=True, exclude_none=True)
    def json_schema(schema):
        return {"$schema": "https://json-schema.org/draft/2020-12/schema", **schema}
    return {"openapi.json": create_app().openapi(),
            "world.schema.json": json_schema(WorldFrame.model_json_schema()),
            "stream.schema.json": json_schema(TypeAdapter(StreamMessage).json_schema()),
            "mission-list.schema.json": json_schema(MissionList.model_json_schema()),
            "interactive.schema.json": json_schema(CommandContracts.model_json_schema()),
            "observed-history.schema.json": json_schema(ObservedHistory.model_json_schema()),
            "fixture.world.json": frame, "demo.world.json": demo}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    output = ROOT / "contracts" / "sentinel" / "v1.4"
    failures = []
    for name, value in exports().items():
        text = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n"
        path = output / name
        if options.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                failures.append(name)
        else:
            output.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
    if failures:
        raise SystemExit("Contract drift: " + ", ".join(failures))
    print("Current contracts match" if options.check else "Current contracts exported")


if __name__ == "__main__":
    main()
