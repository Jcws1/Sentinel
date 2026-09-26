import importlib.util
import json
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "expected_cloud_trials.py"
SPEC = importlib.util.spec_from_file_location("expected_cloud_trials", MODULE_PATH)
assert SPEC and SPEC.loader
trials = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = trials
SPEC.loader.exec_module(trials)


def write_rows(path: Path, rows: list[dict[str, float]]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_resource_summary_enforces_frozen_ceiling(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 20.0,
            "rss_bytes": 50_000_000.0,
            "threads": 4.0,
            "open_sockets": 6.0,
            "socket_measurement_supported": True,
        }
        for index in range(10)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 10, 100.0, 268_435_456)

    assert summary["resource_budget_frozen_before_run"] is True
    assert summary["os_enforced_containment"] is False
    assert summary["gates"]["passed"] is True


def test_resource_summary_rejects_sustained_cpu_and_growth(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 95.0,
            "rss_bytes": 50_000_000.0 + index * 2_000_000.0,
            "threads": 4.0 + index,
            "open_sockets": 6.0 + index,
            "socket_measurement_supported": True,
        }
        for index in range(40)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 40, 100.0, 268_435_456)

    assert summary["high_cpu_contiguous_seconds_max"] >= 30
    assert summary["gates"]["passed"] is False
    assert summary["gates"]["rss_slope_within_1_mib_per_minute"] is False
    assert summary["gates"]["no_monotonic_thread_growth"] is False
    assert summary["gates"]["no_monotonic_socket_growth"] is False
