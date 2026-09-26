"""Measure the Alpha.2 HTTP boundary with the frozen-v1 runtime fixture."""

from __future__ import annotations

import argparse
import json
import platform
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from time import perf_counter
from urllib.request import Request, urlopen


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, min(len(ordered) - 1, int(len(ordered) * q + 0.999999) - 1))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8093/v1/infer-batch")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
    profiles = []
    for tracks in (3, 10, 30, 100):
        samples = []
        for run in range(13):
            now = datetime.now(timezone.utc)
            batch = json.loads(json.dumps(fixture[:tracks]))
            for index, payload in enumerate(batch):
                payload["request_id"] = f"python-{tracks}-{run}-{index}"
                payload["captured_at"] = now.isoformat()
                payload["expires_at"] = (now + timedelta(minutes=5)).isoformat()
            body = json.dumps(batch, separators=(",", ":")).encode()
            started = perf_counter()
            with urlopen(Request(args.endpoint, data=body, headers={"Content-Type": "application/json"}), timeout=120) as response:
                result = json.load(response)
            elapsed_ms = (perf_counter() - started) * 1000
            if not isinstance(result, list) or len(result) != tracks:
                raise RuntimeError(f"invalid response for {tracks} tracks")
            if run >= 3:
                samples.append(elapsed_ms)
        profiles.append(
            {
                "tracks": tracks,
                "required_updates_per_second": tracks * 2,
                "runs_ms": samples,
                "p50_ms": median(samples),
                "p95_ms": percentile(samples, 0.95),
                "p99_ms": percentile(samples, 0.99),
                "max_ms": max(samples),
                "median_completion_rate_per_second": tracks / (median(samples) / 1000),
            }
        )
    report = {
        "schema": "sentinel.frozen-v1-runtime/v1",
        "candidate": "python-alpha2-direct",
        "transport": "loopback HTTP JSON batch",
        "warmups_per_profile": 3,
        "measurement_runs_per_profile": 10,
        "platform": platform.platform(),
        "profiles": profiles,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
