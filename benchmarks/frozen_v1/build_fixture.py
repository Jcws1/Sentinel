"""Build a deterministic runtime fixture from frozen-v1 validation inputs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    root = args.dataset / "dataset" / "validation"
    fused = pd.read_parquet(root / "fused_tracks.parquet").sort_values(
        ["scenario_id", "fused_track_id", "timestamp_s"]
    )
    assets = pd.read_parquet(root / "assets.parquet")
    asset_lookup = {
        str(scenario_id): [
            {
                "asset_id": str(row.asset_id),
                "x_m": float(row.x_m),
                "y_m": float(row.y_m),
                "protected_radius_m": float(row.protected_radius_m),
                "monitoring_radius_m": float(row.wider_monitoring_radius_m),
            }
            for row in group.itertuples(index=False)
        ]
        for scenario_id, group in assets.groupby("scenario_id", sort=True)
    }

    requests: list[dict] = []
    groups = fused.groupby(["scenario_id", "fused_track_id"], sort=True)
    for (scenario_id, track_id), group in groups:
        if len(group) < 30:
            continue
        history = []
        for row in group.tail(30).itertuples(index=False):
            history.append(
                {
                    "timestamp_s": float(row.timestamp_s),
                    "x_m": float(row.observed_x_m),
                    "y_m": float(row.observed_y_m),
                    "z_m": float(row.observed_z_m),
                    "vx_mps": float(row.observed_vx_mps),
                    "vy_mps": float(row.observed_vy_mps),
                    "vz_mps": float(row.observed_vz_mps),
                    "speed_mps": float(row.observed_speed_mps),
                    "heading_deg": float(row.observed_heading_deg),
                    "track_confidence": float(row.track_confidence),
                    "identity_confidence": float(row.identity_confidence),
                    "sensor_age_s": float(row.sensor_age_s),
                }
            )
        requests.append(
            {
                "contract_version": "sentinel.behavior-assessment/v1",
                "feature_contract_version": "sentinel.behavior-features/v1",
                "request_id": f"fixture-{len(requests):03d}",
                "mission_id": str(scenario_id),
                "mission_epoch": "frozen-v1",
                "track_id": str(track_id),
                "track_revision": 30,
                "captured_at": "2000-01-01T00:00:00Z",
                "expires_at": "2000-01-01T00:00:30Z",
                "history": history,
                "assets": asset_lookup[str(scenario_id)],
            }
        )
        if len(requests) == 100:
            break
    if len(requests) != 100:
        raise RuntimeError(f"expected 100 eligible tracks, found {len(requests)}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(requests, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(requests)} frozen validation requests to {args.output}")


if __name__ == "__main__":
    main()
