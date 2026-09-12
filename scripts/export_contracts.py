"""Deterministic export of backend-owned Phase 2 contracts (no DB/startup needed)."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import TypeAdapter
from app.domain.models import WorldFrame, MissionList
from app.main import create_app
from app.missions.fixtures import fixture_source, instant
from app.world.contracts import StreamMessage


def exports() -> dict[str, dict]:
    frame, events = fixture_source("fixture-alpha", 0, instant(0))
    events[0].update(id="fixture-event-0", missionId="fixture-alpha", sequence=0, recordedAt=instant(0))
    frame.update(schemaVersion="1.0", frameId="fixture-frame-0", recordingId="fixture-recording-alpha", streamEpoch="fixture-epoch-alpha",
                 sequence=0, recordedAt=instant(0), recentEvents=events)
    frame = WorldFrame.model_validate_json(json.dumps(frame)).model_dump(mode="json", by_alias=True, exclude_none=True)
    def json_schema(schema):
        return {"$schema": "https://json-schema.org/draft/2020-12/schema", **schema}
    return {"openapi.json": create_app().openapi(),
            "world.schema.json": json_schema(WorldFrame.model_json_schema()),
            "stream.schema.json": json_schema(TypeAdapter(StreamMessage).json_schema()),
            "mission-list.schema.json": json_schema(MissionList.model_json_schema()),
            "fixture.world.json": frame}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    output = ROOT / "contracts" / "sentinel" / "v1"
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
    print("Phase 2 contracts match" if options.check else "Phase 2 contracts exported")


if __name__ == "__main__":
    main()
