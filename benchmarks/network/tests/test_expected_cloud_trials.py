import importlib.util
import asyncio
import json
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).parents[1] / "expected_cloud_trials.py"
SPEC = importlib.util.spec_from_file_location("expected_cloud_trials", MODULE_PATH)
assert SPEC and SPEC.loader
trials = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = trials
SPEC.loader.exec_module(trials)


def write_rows(path: Path, rows: list[dict[str, float]]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_args_allocate_two_independently_impaired_lanes_per_logical_operator() -> None:
    ports = list(range(20_000, 20_016))

    args = trials.args_for("", ports, 600, 820_001, 1_200)

    assert args.observer_lanes == 2
    assert len(args.client_base_urls) == 5
    assert len(args.observer_lane_ws_urls) == 5
    assert all(len(lanes) == 2 for lanes in args.observer_lane_ws_urls)
    assert len({url for lanes in args.observer_lane_ws_urls for url in lanes}) == 10
    assert args.client_ws_urls == [lanes[0] for lanes in args.observer_lane_ws_urls]
    assert args.observer_reorder_count == 256
    assert args.observer_reorder_distance == 1024
    assert args.observer_reorder_age == 3.0


def test_args_reject_wrong_route_count() -> None:
    try:
        trials.args_for("", list(range(15)), 1, 1, 0)
    except ValueError as error:
        assert "exactly 16 impaired route ports" in str(error)
    else:
        raise AssertionError("an incomplete redundant route allocation was accepted")


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
    assert summary["gates"]["no_sustained_thread_growth"] is False
    assert summary["gates"]["no_monotonic_socket_growth"] is False


def test_resource_summary_allows_one_bounded_teardown_thread_transient(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 20.0,
            "rss_bytes": 50_000_000.0,
            "threads": 6.0 if index == 99 else 4.0,
            "open_sockets": 6.0,
            "socket_measurement_supported": True,
        }
        for index in range(100)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 100, 100.0, 268_435_456)

    assert summary["thread_baseline_median"] == 4.0
    assert summary["thread_tail_median"] == 4.0
    assert summary["thread_max"] == 6.0
    assert summary["gates"]["no_sustained_thread_growth"] is True


def test_resource_summary_rejects_sustained_tail_thread_growth(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 20.0,
            "rss_bytes": 50_000_000.0,
            "threads": 5.0 if index >= 90 else 4.0,
            "open_sockets": 6.0,
            "socket_measurement_supported": True,
        }
        for index in range(100)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 100, 100.0, 268_435_456)

    assert summary["thread_baseline_median"] == 4.0
    assert summary["thread_tail_median"] == 5.0
    assert summary["gates"]["no_sustained_thread_growth"] is False


def test_resource_summary_rejects_thread_spike_beyond_frozen_allowance(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 20.0,
            "rss_bytes": 50_000_000.0,
            "threads": 9.0 if index == 50 else 4.0,
            "open_sockets": 6.0,
            "socket_measurement_supported": True,
        }
        for index in range(100)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 100, 100.0, 268_435_456)

    assert summary["thread_transient_allowance"] == 4
    assert summary["gates"]["no_sustained_thread_growth"] is False


def test_resource_summary_uses_only_actual_socket_observations(tmp_path: Path) -> None:
    path = tmp_path / "resources.ndjson"
    rows = [
        {
            "elapsed_seconds": float(index),
            "cpu_percent": 20.0,
            "rss_bytes": 50_000_000.0,
            "threads": 4.0,
            "socket_sampled": index in (0, 30, 60),
            **({
                "open_sockets": 6.0,
                "socket_measurement_supported": True,
            } if index in (0, 30, 60) else {}),
        }
        for index in range(61)
    ]
    write_rows(path, rows)

    summary = trials.resource_summary(path, 61, 100.0, 268_435_456)

    assert summary["socket_samples"] == 3
    assert summary["open_sockets_per_minute_linear_slope"] == 0.0
    assert summary["gates"]["socket_measurement_supported"] is True
    assert summary["gates"]["no_monotonic_socket_growth"] is True


def test_resource_summary_ignores_connection_establishment_but_rejects_socket_leak(
    tmp_path: Path,
) -> None:
    path = tmp_path / "resources.ndjson"
    stable = [1.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0, 7.0]

    def rows_for(sockets: list[float]) -> list[dict[str, object]]:
        return [
            {
                "elapsed_seconds": float(index * 30),
                "cpu_percent": 20.0,
                "rss_bytes": 50_000_000.0,
                "threads": 4.0,
                "socket_sampled": True,
                "open_sockets": value,
                "socket_measurement_supported": True,
            }
            for index, value in enumerate(sockets)
        ]

    write_rows(path, rows_for(stable))
    summary = trials.resource_summary(path, 270, 100.0, 268_435_456)
    assert summary["socket_baseline_median"] == 7.0
    assert summary["socket_tail_median"] == 7.0
    assert summary["gates"]["no_monotonic_socket_growth"] is True

    write_rows(path, rows_for(stable[:-3] + [8.0, 9.0, 10.0]))
    leaked = trials.resource_summary(path, 270, 100.0, 268_435_456)
    assert leaked["socket_tail_median"] == 9.0
    assert leaked["gates"]["no_monotonic_socket_growth"] is False


def test_sampler_uses_absolute_cadence_despite_slow_socket_scan(
    tmp_path: Path, monkeypatch: object
) -> None:
    first_socket_sample_finished = threading.Event()

    class FakeProcess:
        def cpu_percent(self, _interval: object) -> float:
            return 10.0

        def memory_info(self) -> SimpleNamespace:
            return SimpleNamespace(rss=1_000, vms=2_000)

        def num_threads(self) -> int:
            return 4

        def net_connections(self, *, kind: str) -> list[object]:
            assert kind == "inet"
            time.sleep(0.04)
            first_socket_sample_finished.set()
            return []

    monkeypatch.setattr(trials.psutil, "Process", lambda _pid: FakeProcess())
    monkeypatch.setattr(trials, "RESOURCE_SAMPLE_INTERVAL_SECONDS", 0.02)
    monkeypatch.setattr(trials, "SOCKET_SAMPLE_INTERVAL_SECONDS", 0.10)
    destination = tmp_path / "resources.ndjson"

    async def run() -> None:
        stop = asyncio.Event()
        task = asyncio.create_task(
            trials.sample_process(SimpleNamespace(pid=123), stop, destination)
        )
        await asyncio.to_thread(first_socket_sample_finished.wait, 2.0)
        await asyncio.sleep(0.24)
        stop.set()
        await task

    asyncio.run(run())
    rows = [json.loads(line) for line in destination.read_text().splitlines()]

    assert len(rows) >= 8
    socket_samples = sum(bool(row["socket_sampled"]) for row in rows)
    assert socket_samples >= 2
    assert socket_samples < len(rows)
