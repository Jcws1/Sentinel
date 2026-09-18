import json
from pathlib import Path

import pytest


@pytest.fixture
def world():
    return json.loads((Path(__file__).resolve().parents[2] / "contracts/sentinel/v1.11/fixture.world.json").read_text(encoding="utf-8"))
