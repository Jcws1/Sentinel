from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from time import perf_counter
import argparse
import json

from benchmark import percentile
from benchmark_batch import infer_batch


def summary(values: list[float]) -> dict[str, float | int]:
    return {
        "samples": len(values),
        "p50_ms": median(values),
        "p95_ms": percentile(values, 0.95),
        "p99_ms": percentile(values, 0.99),
        "max_ms": max(values),
    }


def sharded_round(endpoints: list[str], tracks: int) -> float:
    counts = [tracks // len(endpoints)] * len(endpoints)
    for index in range(tracks % len(endpoints)):
        counts[index] += 1
    started = perf_counter()
    with ThreadPoolExecutor(max_workers=len(endpoints)) as pool:
        futures = [
            pool.submit(infer_batch, endpoint, count)
            for endpoint, count in zip(endpoints, counts)
            if count
        ]
        for future in futures:
            future.result()
    return (perf_counter() - started) * 1000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=20)
    args = parser.parse_args()
    sharded_round(args.endpoint, 3)
    results = []
    for tracks in (3, 10, 30, 100):
        samples = [sharded_round(args.endpoint, tracks) for _ in range(args.rounds)]
        p50 = median(samples)
        rate = tracks / (p50 / 1000)
        results.append({
            "tracks": tracks,
            "workers": len(args.endpoint),
            "rounds": args.rounds,
            "required_rate_per_second": tracks * 2,
            "achieved_completion_rate_per_second_at_median": rate,
            "meets_2hz_profile": rate >= tracks * 2,
            "end_to_end": summary(samples),
        })
    report = {
        "schema": "sentinel.alpha2-sharded-benchmark/v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "3.0.0-alpha.2",
        "transport": f"loopback HTTP JSON; {len(args.endpoint)} stateless process shards",
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
