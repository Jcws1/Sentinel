from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from time import perf_counter
from urllib.request import Request, urlopen
import argparse
import json


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, min(len(ordered) - 1, int(len(ordered) * fraction + 0.999999) - 1))]


def summary(values: list[float]) -> dict[str, float | int]:
    return {
        "samples": len(values),
        "p50_ms": median(values),
        "p95_ms": percentile(values, 0.95),
        "p99_ms": percentile(values, 0.99),
        "max_ms": max(values),
    }


def payload(track: int) -> dict:
    now = datetime.now(timezone.utc)
    history = []
    for index in range(30):
        timestamp = index * 0.5
        history.append({
            "timestamp_s": timestamp,
            "x_m": 500.0 + track * 10.0 - 4.0 * timestamp,
            "y_m": float(track * 5),
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
        "contract_version": "sentinel.behavior-assessment/v1",
        "feature_contract_version": "sentinel.behavior-features/v1",
        "request_id": f"benchmark-{track}-{now.timestamp()}",
        "mission_id": "benchmark",
        "mission_epoch": "epoch-1",
        "track_id": f"track-{track:03d}",
        "track_revision": 30,
        "captured_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=30)).isoformat(),
        "history": history,
        "assets": [{
            "asset_id": "asset-1", "x_m": 0.0, "y_m": 0.0,
            "protected_radius_m": 25.0, "monitoring_radius_m": 750.0,
        }],
    }


def infer(endpoint: str, track: int) -> dict:
    body = json.dumps(payload(track), separators=(",", ":")).encode()
    request = Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    started = perf_counter()
    with urlopen(request, timeout=60) as response:
        result = json.load(response)
    end_to_end = (perf_counter() - started) * 1000
    timing = result["timing_ms"]
    return {
        "feature_ms": float(timing["feature_preparation"]),
        "model_ms": float(timing["model_inference"]),
        "worker_ms": float(timing["worker_total"]),
        "end_to_end_ms": end_to_end,
        "ipc_ms": max(0.0, end_to_end - float(timing["worker_total"])),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:8091/v1/infer")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-concurrency", type=int, default=8)
    args = parser.parse_args()
    results = []
    infer(args.endpoint, -1)
    for tracks in (3, 10, 30, 100):
        started = perf_counter()
        with ThreadPoolExecutor(max_workers=min(args.max_concurrency, tracks)) as pool:
            samples = list(pool.map(lambda track: infer(args.endpoint, track), range(tracks)))
        elapsed = perf_counter() - started
        results.append({
            "tracks": tracks,
            "offered_profile_hz_per_track": 2,
            "required_rate_per_second": tracks * 2,
            "one_update_each_elapsed_s": elapsed,
            "achieved_completion_rate_per_second": tracks / elapsed,
            "meets_2hz_profile": tracks / elapsed >= tracks * 2,
            "feature_preparation": summary([row["feature_ms"] for row in samples]),
            "model_inference": summary([row["model_ms"] for row in samples]),
            "worker_total": summary([row["worker_ms"] for row in samples]),
            "ipc": summary([row["ipc_ms"] for row in samples]),
            "end_to_end": summary([row["end_to_end_ms"] for row in samples]),
        })
    report = {
        "schema": "sentinel.alpha2-benchmark/v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "3.0.0-alpha.2",
        "transport": "loopback HTTP JSON",
        "max_concurrency": args.max_concurrency,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

