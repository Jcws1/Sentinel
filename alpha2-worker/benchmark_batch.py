from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from time import perf_counter
from urllib.request import Request, urlopen
import argparse
import json

from benchmark import payload, percentile


def summary(values: list[float]) -> dict[str, float | int]:
    return {
        "samples": len(values),
        "p50_ms": median(values),
        "p95_ms": percentile(values, 0.95),
        "p99_ms": percentile(values, 0.99),
        "max_ms": max(values),
    }


def infer_batch(endpoint: str, tracks: int) -> dict[str, float]:
    body = json.dumps([payload(index) for index in range(tracks)], separators=(",", ":")).encode()
    request = Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    started = perf_counter()
    with urlopen(request, timeout=120) as response:
        result = json.load(response)
    end_to_end = (perf_counter() - started) * 1000
    if not isinstance(result, list) or len(result) != tracks:
        raise RuntimeError(f"expected {tracks} responses, received {result!r}")
    timing = result[0]["timing_ms"]
    return {
        "feature_ms": float(timing["feature_preparation"]),
        "model_ms": float(timing["model_inference"]),
        "worker_ms": float(timing["worker_total"]),
        "end_to_end_ms": end_to_end,
        "ipc_ms": max(0.0, end_to_end - float(timing["worker_total"])),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:8093/v1/infer-batch")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=5)
    args = parser.parse_args()
    infer_batch(args.endpoint, 3)
    results = []
    for tracks in (3, 10, 30, 100):
        samples = [infer_batch(args.endpoint, tracks) for _ in range(args.rounds)]
        e2e = [sample["end_to_end_ms"] for sample in samples]
        rate = tracks / (median(e2e) / 1000)
        results.append({
            "tracks": tracks,
            "batch_size": tracks,
            "rounds": args.rounds,
            "required_rate_per_second": tracks * 2,
            "achieved_completion_rate_per_second_at_median": rate,
            "meets_2hz_profile": rate >= tracks * 2,
            "feature_preparation": summary([s["feature_ms"] for s in samples]),
            "model_inference": summary([s["model_ms"] for s in samples]),
            "worker_total": summary([s["worker_ms"] for s in samples]),
            "ipc": summary([s["ipc_ms"] for s in samples]),
            "end_to_end": summary(e2e),
        })
    report = {
        "schema": "sentinel.alpha2-batched-benchmark/v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "3.0.0-alpha.2",
        "transport": "loopback HTTP JSON bounded vectorized batch",
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
