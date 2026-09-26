"""Generate and score one declared Alpha.2 candidate on a frozen split."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from time import perf_counter

import joblib


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--holdout", type=Path, required=True)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--split", choices=("validation", "sealed_test"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    sys.path.insert(0, str(args.holdout / "src"))
    from simulator.scoring import score

    model = joblib.load(args.artifact)
    split_root = args.holdout / "dataset" / args.split
    started = perf_counter()
    predictions = model.predict(split_root)
    inference_s = perf_counter() - started
    args.output.mkdir(parents=True, exist_ok=True)
    predictions_path = args.output / "predictions.parquet"
    predictions.to_parquet(predictions_path, index=False)
    truth = args.holdout / ("sealed_truth" if args.split == "sealed_test" else f"dataset/{args.split}/truth")
    metrics = score(predictions_path, truth, args.output / "score")
    summary = {
        "split": args.split,
        "prediction_rows": len(predictions),
        "inference_seconds": inference_s,
        "motion_macro_f1": metrics["motion"]["macro_f1"],
        "asset_relation_macro_f1": metrics["asset_relation"]["macro_f1"],
        "coordination_macro_f1": metrics["coordination"]["macro_f1"],
        "coordination_brier": metrics["confidence"]["coordination"]["brier_correctness"],
    }
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
