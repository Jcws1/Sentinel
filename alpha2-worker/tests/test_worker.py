from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import tomllib

import joblib
import pytest

from sentinel_v3 import __version__
from sentinel_v3.model import SentinelV3
from sentinel_v3.worker import (
    Alpha2Engine,
    ContractError,
    CONTRACT_VERSION,
    FEATURE_CONTRACT_VERSION,
    MODEL_VERSION,
    validate_request,
)

ROOT = Path(__file__).parents[1]
ARTIFACT = ROOT / "artifacts" / "sentinel_level3_v3_alpha2.joblib"


def request(points: int = 30) -> dict:
    now = datetime.now(timezone.utc)
    history = []
    for index in range(points):
        timestamp = index * 0.5
        history.append({
            "timestamp_s": timestamp,
            "x_m": 200.0 - 4.0 * timestamp,
            "y_m": 10.0,
            "z_m": 80.0,
            "vx_mps": -4.0,
            "vy_mps": 0.0,
            "vz_mps": 0.0,
            "speed_mps": 4.0,
            "heading_deg": 270.0,
            "track_confidence": 0.91,
            "identity_confidence": 0.82,
            "sensor_age_s": 0.12,
        })
    return {
        "contract_version": CONTRACT_VERSION,
        "feature_contract_version": FEATURE_CONTRACT_VERSION,
        "request_id": "request-1",
        "mission_id": "mission-1",
        "mission_epoch": "epoch-1",
        "track_id": "track-1",
        "track_revision": points,
        "captured_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=5)).isoformat(),
        "history": history,
        "assets": [{
            "asset_id": "asset-1",
            "x_m": 0.0,
            "y_m": 0.0,
            "protected_radius_m": 25.0,
            "monitoring_radius_m": 750.0,
        }],
    }


@pytest.fixture(scope="session")
def engine() -> Alpha2Engine:
    return Alpha2Engine.load(ARTIFACT)


def test_artifact_loads_with_canonical_version(engine: Alpha2Engine):
    assert isinstance(engine.model, SentinelV3)
    assert engine.model.version == MODEL_VERSION
    assert len(engine.artifact_sha256) == 64


def test_save_load_equivalence(tmp_path: Path, engine: Alpha2Engine):
    destination = tmp_path / "roundtrip.joblib"
    joblib.dump(engine.model, destination)
    restored = Alpha2Engine.load(destination)
    before = engine.infer(request())
    after = restored.infer(request())
    assert before["motion"] == after["motion"]
    assert before["asset_relations"] == after["asset_relations"]


def test_prediction_schema_and_coordination_is_disabled(engine: Alpha2Engine):
    response = engine.infer(request())
    assert response["contract_version"] == CONTRACT_VERSION
    assert response["feature_contract_version"] == FEATURE_CONTRACT_VERSION
    assert response["model_version"] == MODEL_VERSION
    assert response["authority"] == "non_authoritative_decision_support"
    assert response["motion"]["status"] in {
        "supported", "uncertain", "insufficient_evidence"
    }
    assert len(response["asset_relations"]) == 1
    assert response["coordination"]["status"] == "EXPERIMENTAL_DISABLED"
    assert response["timing_ms"]["worker_total"] >= 0


def test_incomplete_history_is_explicit_not_a_crash(engine: Alpha2Engine):
    response = engine.infer(request(points=1))
    assert response["motion"]["label"]
    assert 0.0 <= response["motion"]["confidence"] <= 1.0


def test_non_monotonic_history_is_rejected():
    payload = request(points=3)
    payload["history"][2]["timestamp_s"] = payload["history"][1]["timestamp_s"]
    with pytest.raises(ContractError, match="strictly increasing"):
        validate_request(payload)


def test_version_is_consistent_across_package_manifest_and_artifact(engine: Alpha2Engine):
    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "artifact-manifest.json").read_text(encoding="utf-8"))
    assert project["project"]["version"] == MODEL_VERSION
    assert manifest["model_version"] == MODEL_VERSION
    assert __version__ == MODEL_VERSION
    assert engine.model.version == MODEL_VERSION


def test_batched_inference_preserves_individual_identities(engine: Alpha2Engine):
    first = request()
    second = request()
    second["request_id"] = "request-2"
    second["track_id"] = "track-2"
    responses = engine.infer_batch([first, second])
    assert [item["request_id"] for item in responses] == ["request-1", "request-2"]
    assert [item["track_id"] for item in responses] == ["track-1", "track-2"]
    assert all(item["timing_ms"]["batch_size"] == 2 for item in responses)


def test_batch_rejects_duplicate_request_identity(engine: Alpha2Engine):
    duplicated = request()
    with pytest.raises(ContractError, match="identities must be unique"):
        engine.infer_batch([duplicated, duplicated])
