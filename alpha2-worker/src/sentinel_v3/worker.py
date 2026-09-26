from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from time import perf_counter_ns
from typing import Any
import json

import joblib
import numpy as np
import pandas as pd

from .features import ROW_KEYS, group_features, relation_features, track_features
from .model import MOTION_FEATURES, RELATION_FEATURES, SentinelV3

CONTRACT_VERSION = "sentinel.behavior-assessment/v1"
FEATURE_CONTRACT_VERSION = "sentinel.behavior-features/v1"
MODEL_VERSION = "3.0.0-alpha.2"
LOW_CONFIDENCE = 0.45
UNCERTAIN_CONFIDENCE = 0.70


class ContractError(ValueError):
    pass


def _required(mapping: dict[str, Any], name: str, expected: type) -> Any:
    value = mapping.get(name)
    if not isinstance(value, expected):
        raise ContractError(f"{name} must be {expected.__name__}")
    return value


def _finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{name} must be numeric")
    result = float(value)
    if not np.isfinite(result):
        raise ContractError(f"{name} must be finite")
    return result


def validate_request(payload: dict[str, Any]) -> None:
    if payload.get("contract_version") != CONTRACT_VERSION:
        raise ContractError("unsupported contract_version")
    if payload.get("feature_contract_version") != FEATURE_CONTRACT_VERSION:
        raise ContractError("unsupported feature_contract_version")
    for name in ("request_id", "mission_id", "mission_epoch", "track_id"):
        if not _required(payload, name, str).strip():
            raise ContractError(f"{name} cannot be empty")
    revision = payload.get("track_revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ContractError("track_revision must be a non-negative integer")
    history = _required(payload, "history", list)
    if not history:
        raise ContractError("history cannot be empty")
    previous = float("-inf")
    for index, row in enumerate(history):
        if not isinstance(row, dict):
            raise ContractError(f"history[{index}] must be an object")
        timestamp = _finite(row.get("timestamp_s"), f"history[{index}].timestamp_s")
        if timestamp <= previous:
            raise ContractError("history timestamps must be strictly increasing")
        previous = timestamp
        for name in (
            "x_m", "y_m", "z_m", "vx_mps", "vy_mps", "vz_mps",
            "speed_mps", "heading_deg", "track_confidence",
            "identity_confidence", "sensor_age_s",
        ):
            value = _finite(row.get(name), f"history[{index}].{name}")
            if name.endswith("confidence") and not 0.0 <= value <= 1.0:
                raise ContractError(f"history[{index}].{name} must be within [0,1]")
            if name == "sensor_age_s" and value < 0:
                raise ContractError(f"history[{index}].sensor_age_s cannot be negative")
    assets = payload.get("assets", [])
    if not isinstance(assets, list):
        raise ContractError("assets must be a list")
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict) or not isinstance(asset.get("asset_id"), str):
            raise ContractError(f"assets[{index}] is invalid")
        for name in ("x_m", "y_m", "protected_radius_m", "monitoring_radius_m"):
            _finite(asset.get(name), f"assets[{index}].{name}")


def _label(label: str, confidence: float) -> tuple[str, str]:
    if confidence < LOW_CONFIDENCE:
        return "INSUFFICIENT_EVIDENCE", "insufficient_evidence"
    if confidence < UNCERTAIN_CONFIDENCE:
        return label, "uncertain"
    return label, "supported"


@dataclass
class Alpha2Engine:
    model: SentinelV3
    artifact_sha256: str

    @classmethod
    def load(cls, artifact: Path) -> "Alpha2Engine":
        digest = sha256(artifact.read_bytes()).hexdigest()
        loaded = joblib.load(artifact)
        if not isinstance(loaded, SentinelV3):
            raise RuntimeError("artifact is not a SentinelV3 model")
        if loaded.version != MODEL_VERSION:
            raise RuntimeError(
                f"artifact model version {loaded.version!r} is not {MODEL_VERSION!r}"
            )
        return cls(loaded, digest)

    def infer(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.infer_batch([payload])[0]

    def infer_batch(self, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Evaluate a bounded set of immutable per-track requests vectorially."""
        if not payloads:
            raise ContractError("batch cannot be empty")
        if len(payloads) > 128:
            raise ContractError("batch exceeds 128 requests")
        for payload in payloads:
            validate_request(payload)
        identities = [
            (p["request_id"], p["mission_id"], p["mission_epoch"], p["track_id"], p["track_revision"])
            for p in payloads
        ]
        if len(set(identities)) != len(identities):
            raise ContractError("batch request identities must be unique")
        started = perf_counter_ns()
        raw_parts = []
        for payload in payloads:
            part = pd.DataFrame(payload["history"]).rename(columns={
            "x_m": "observed_x_m", "y_m": "observed_y_m", "z_m": "observed_z_m",
            "vx_mps": "observed_vx_mps", "vy_mps": "observed_vy_mps",
            "vz_mps": "observed_vz_mps", "speed_mps": "observed_speed_mps",
            "heading_deg": "observed_heading_deg",
            })
            part["scenario_id"] = payload["mission_id"]
            part["fused_track_id"] = payload["track_id"]
            raw_parts.append(part)
        raw = pd.concat(raw_parts, ignore_index=True)
        features_started = perf_counter_ns()
        track = track_features(raw)
        feature_ms = (perf_counter_ns() - features_started) / 1e6
        latest = track.groupby(
            ["scenario_id", "fused_track_id"], sort=False, observed=True
        ).tail(1).reset_index(drop=True)
        model_started = perf_counter_ns()
        motion_probabilities = self.model.motion_model.predict_proba(latest[MOTION_FEATURES])
        irregular_index = list(self.model.motion_model.classes_).index("irregular")
        relation_by_track: dict[tuple[str, str], list[dict[str, Any]]] = {}
        asset_parts = []
        template_rows = []
        for payload in payloads:
            if not payload.get("assets"):
                continue
            assets = pd.DataFrame(payload["assets"]).rename(
                columns={"monitoring_radius_m": "wider_monitoring_radius_m"}
            )
            assets["scenario_id"] = payload["mission_id"]
            asset_parts.append(assets)
            latest_timestamp = float(payload["history"][-1]["timestamp_s"])
            template_rows.extend({
                "scenario_id": payload["mission_id"],
                "timestamp_s": latest_timestamp,
                "fused_track_id": payload["track_id"],
                "asset_id": asset["asset_id"],
            } for asset in payload["assets"])
        if template_rows:
            assets = pd.concat(asset_parts, ignore_index=True).drop_duplicates(
                ["scenario_id", "asset_id"]
            )
            template = pd.DataFrame(template_rows)
            relation = relation_features(track, template, assets)
            probabilities = self.model.relation_model.predict_proba(relation[RELATION_FEATURES])
            for row_index, row in relation.reset_index(drop=True).iterrows():
                values = probabilities[row_index]
                relation_index = int(np.argmax(values))
                label = str(self.model.relation_model.classes_[relation_index])
                approach_index = list(self.model.relation_model.classes_).index("approaching")
                if values[approach_index] >= self.model.approaching_threshold:
                    label = "approaching"
                confidence = float(np.max(values) * row.quality)
                visible_label, status = _label(label, confidence)
                relation_by_track.setdefault(
                    (str(row.scenario_id), str(row.fused_track_id)), []
                ).append({
                    "asset_id": str(row.asset_id),
                    "relation": visible_label,
                    "raw_relation": label,
                    "confidence": confidence,
                    "status": status,
                    "estimated_eta_s": (
                        float(row.eta_point_s) if label == "approaching" else None
                    ),
                })
        model_ms = (perf_counter_ns() - model_started) / 1e6
        total_ms = (perf_counter_ns() - started) / 1e6
        produced_at = datetime.now(timezone.utc).isoformat()
        responses = []
        latest_lookup = {
            (str(row.scenario_id), str(row.fused_track_id)): index
            for index, row in latest.iterrows()
        }
        for payload in payloads:
            mission_id = payload["mission_id"]
            track_id = payload["track_id"]
            latest_index = latest_lookup[(mission_id, track_id)]
            values = motion_probabilities[latest_index]
            motion_index = int(np.argmax(values))
            raw_motion = str(self.model.motion_model.classes_[motion_index])
            motion = raw_motion
            if values[irregular_index] >= self.model.irregular_threshold:
                motion = "irregular"
            confidence = float(np.max(values) * latest.quality.iloc[latest_index])
            motion, motion_status = _label(motion, confidence)
            responses.append({
            "contract_version": CONTRACT_VERSION,
            "feature_contract_version": FEATURE_CONTRACT_VERSION,
            "request_id": payload["request_id"],
            "mission_id": mission_id,
            "mission_epoch": payload["mission_epoch"],
            "track_id": track_id,
            "track_revision": payload["track_revision"],
            "captured_at": payload["captured_at"],
            "expires_at": payload["expires_at"],
            "produced_at": produced_at,
            "model_version": MODEL_VERSION,
            "artifact_sha256": self.artifact_sha256,
            "authority": "non_authoritative_decision_support",
            "motion": {
                "label": motion,
                "raw_label": raw_motion,
                "confidence": confidence,
                "status": motion_status,
            },
            "asset_relations": relation_by_track.get((mission_id, track_id), []),
            "coordination": {
                "status": "EXPERIMENTAL_DISABLED",
                "reason_codes": ["ALPHA2_COORDINATION_NOT_INTEGRATION_READY"],
            },
            "timing_ms": {
                "feature_preparation": feature_ms,
                "model_inference": model_ms,
                "worker_total": total_ms,
                "batch_size": len(payloads),
            },
            })
        return responses


def response_json(engine: Alpha2Engine, body: bytes) -> bytes:
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ContractError("request body must be an object")
        response = engine.infer(payload)
        return json.dumps(response, separators=(",", ":"), allow_nan=False).encode()
    except (ContractError, json.JSONDecodeError) as error:
        return json.dumps({
            "contract_version": CONTRACT_VERSION,
            "error": "invalid_request",
            "detail": str(error),
        }, separators=(",", ":")).encode()


def batch_response_json(engine: Alpha2Engine, body: bytes) -> bytes:
    try:
        payload = json.loads(body)
        if not isinstance(payload, list):
            raise ContractError("batch request body must be an array")
        responses = engine.infer_batch(payload)
        return json.dumps(responses, separators=(",", ":"), allow_nan=False).encode()
    except (ContractError, json.JSONDecodeError) as error:
        return json.dumps({
            "contract_version": CONTRACT_VERSION,
            "error": "invalid_request",
            "detail": str(error),
        }, separators=(",", ":")).encode()
