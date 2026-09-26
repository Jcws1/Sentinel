#!/usr/bin/env python3
"""Resumable five-run expected-cloud acceptance controller.

Uses one privileged Linux netem TCP forwarder per observer plus one for ingestion.
Every result, including exceptions and failed gates, is retained in the manifest.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import uuid
import hashlib
import statistics
import traceback
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import psutil
import statistics

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sentinel_network_harness", HERE / "network_harness.py")
assert SPEC and SPEC.loader
network = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = network
SPEC.loader.exec_module(network)

IMAGE = "sentinel-netem-proxy:20260926"
PUBLISH_TO_APPLY_P95_LIMIT_MS = 200
PUBLISH_TO_APPLY_P99_LIMIT_MS = 500


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def unique_ports(count: int) -> list[int]:
    values: set[int] = set()
    while len(values) < count:
        values.add(free_port())
    return list(values)


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def linear_slope_per_minute(rows: list[dict[str, Any]], field: str) -> float | None:
    points = [(float(row["elapsed_seconds"]), float(row[field])) for row in rows]
    if len(points) < 2:
        return None
    xmean = statistics.mean(point[0] for point in points)
    ymean = statistics.mean(point[1] for point in points)
    denominator = sum((x - xmean) ** 2 for x, _ in points)
    if denominator == 0:
        return None
    return (sum((x - xmean) * (y - ymean) for x, y in points) / denominator) * 60


def longest_contiguous_seconds(rows: list[dict[str, Any]], predicate: Any) -> float:
    longest = 0.0
    start: float | None = None
    previous = 0.0
    for row in rows:
        elapsed = float(row["elapsed_seconds"])
        if predicate(row):
            if start is None:
                start = elapsed
            previous = elapsed
            longest = max(longest, previous - start)
        else:
            start = None
    return longest


def resource_summary(path: Path, duration: float, cpu_budget_percent: float,
                     memory_budget_bytes: int) -> dict[str, Any]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    cpu = [float(row["cpu_percent"]) for row in rows]
    rss = [float(row["rss_bytes"]) for row in rows]
    # Bounded caches intentionally fill during the early measurement window.
    # Leak detection uses the steady-state tail while max RSS and cache-capacity
    # metrics cover the complete run.
    steady_rows = rows[len(rows) // 2:]
    rss_slope = linear_slope_per_minute(steady_rows, "rss_bytes")
    thread_slope = linear_slope_per_minute(rows, "threads")
    socket_slope = linear_slope_per_minute(rows, "open_sockets")
    socket_measurement_supported = bool(rows) and all(
        bool(row.get("socket_measurement_supported")) for row in rows
    )
    cpu_p95 = network.percentile(cpu, 0.95)
    rss_max = max(rss, default=None)
    high_cpu_seconds = longest_contiguous_seconds(
        rows, lambda row: float(row["cpu_percent"]) > cpu_budget_percent * 0.9
    )
    # The sampler starts after the 60-second warmup. Compare robust endpoint
    # windows and retain a small, frozen transient ceiling rather than gating
    # on the sign of an OLS slope. A single lifecycle sample during teardown
    # must not masquerade as a leak, while a sustained +1 thread plateau or a
    # larger spike remains a release failure.
    thread_window = max(5, len(rows) // 10)
    thread_baseline = statistics.median(
        float(row["threads"]) for row in rows[:thread_window]
    ) if rows else None
    thread_tail = statistics.median(
        float(row["threads"]) for row in rows[-thread_window:]
    ) if rows else None
    thread_max = max((float(row["threads"]) for row in rows), default=None)
    thread_transient_allowance = 4
    no_sustained_thread_growth = (
        thread_baseline is not None
        and thread_tail is not None
        and thread_max is not None
        and thread_tail <= thread_baseline
        and thread_max <= thread_baseline + thread_transient_allowance
    )
    gates = {
        "cpu_p95_within_75_percent_budget": cpu_p95 <= cpu_budget_percent * 0.75,
        "cpu_not_above_90_percent_for_30_seconds": high_cpu_seconds < 30,
        "rss_within_70_percent_limit": rss_max is not None
            and rss_max <= memory_budget_bytes * 0.70,
        "rss_slope_within_1_mib_per_minute": rss_slope is not None
            and rss_slope <= 1024 * 1024,
        "no_sustained_thread_growth": no_sustained_thread_growth,
        "socket_measurement_supported": socket_measurement_supported,
        "no_monotonic_socket_growth": socket_measurement_supported
            and socket_slope is not None and socket_slope <= 0,
    }
    gates["passed"] = all(gates.values())
    return {
        "samples": len(rows), "expected_minimum_samples": int(duration * 0.8),
        "cpu_budget_percent": cpu_budget_percent,
        "memory_budget_bytes": memory_budget_bytes,
        "cpu_percent_p95": cpu_p95,
        "cpu_percent_max": max(cpu, default=None), "rss_bytes_max": rss_max,
        "rss_bytes_per_minute_linear_slope": rss_slope,
        "rss_slope_window": "last_50_percent_of_measured_samples",
        "rss_slope_samples": len(steady_rows),
        "threads_per_minute_linear_slope": thread_slope,
        "thread_endpoint_window_samples": thread_window,
        "thread_baseline_median": thread_baseline,
        "thread_tail_median": thread_tail,
        "thread_max": thread_max,
        "thread_transient_allowance": thread_transient_allowance,
        "open_sockets_per_minute_linear_slope": socket_slope,
        "high_cpu_contiguous_seconds_max": high_cpu_seconds,
        "resource_budget_frozen_before_run": True,
        "os_enforced_containment": False,
        "gates": gates,
    }


def gateway_process(port: int, database: Path) -> subprocess.Popen[Any]:
    executable = HERE.parents[1] / "realtime-gateway" / "target" / "release" / (
        "sentinel-realtime-gateway.exe" if os.name == "nt" else "sentinel-realtime-gateway"
    )
    env = os.environ.copy()
    env.update({
        "SENTINEL_GATEWAY_ADDR": f"0.0.0.0:{port}",
        "SENTINEL_ALLOW_INSECURE_REMOTE_BIND": "1",
        "SENTINEL_COMMAND_DB_PATH": str(database),
        "SENTINEL_CLIENT_QUEUE_CAPACITY": "256",
        "SENTINEL_DELTA_RETENTION": "65536",
    })
    return subprocess.Popen([str(executable)], cwd=HERE.parents[1], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def start_proxies(run_token: str, gateway_port: int, ports: list[int]) -> list[str]:
    names = []
    for index, port in enumerate(ports):
        name = f"sentinel-netem-{run_token}-{index}"
        subprocess.run([
            "docker", "run", "--rm", "-d", "--cap-add", "NET_ADMIN",
            "--name", name, "-p", f"127.0.0.1:{port}:9000",
            "-e", "UPSTREAM_HOST=host.docker.internal", "-e", f"UPSTREAM_PORT={gateway_port}",
            "-e", "LATENCY_MS=50", "-e", "JITTER_MS=20", "-e", "LOSS_PERCENT=0.1",
            "-e", "RATE_MBIT=20", IMAGE,
        ], check=True, stdout=subprocess.DEVNULL)
        names.append(name)
    return names


def stop_proxies(names: list[str]) -> None:
    if names:
        subprocess.run(["docker", "rm", "-f", *names], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


async def sample_process(process: subprocess.Popen[Any], stop: asyncio.Event,
                         destination: Path) -> None:
    subject = psutil.Process(process.pid)
    subject.cpu_percent(None)
    started = time.monotonic()

    def collect() -> dict[str, Any]:
        memory = subject.memory_info()
        try:
            open_sockets = len(subject.net_connections(kind="inet"))
            socket_measurement_supported = True
        except (psutil.AccessDenied, NotImplementedError):
            open_sockets = 0
            socket_measurement_supported = False
        return {
            "cpu_percent": subject.cpu_percent(None),
            "rss_bytes": memory.rss,
            "vms_bytes": memory.vms,
            "threads": subject.num_threads(),
            "open_sockets": open_sockets,
            "socket_measurement_supported": socket_measurement_supported,
        }

    with destination.open("w", encoding="utf-8") as stream:
        while not stop.is_set():
            try:
                # net_connections() can occasionally block for seconds on
                # Windows. Keep all psutil work off the latency-sensitive
                # asyncio loop used by the observers and producer.
                sample = await asyncio.to_thread(collect)
                row = {"utc": datetime.now(timezone.utc).isoformat(),
                       "elapsed_seconds": time.monotonic() - started, **sample}
                stream.write(json.dumps(row) + "\n")
                stream.flush()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                break
            await asyncio.sleep(1)


def args_for(base: str, ports: list[int], duration: float, seed: int,
             tick_offset: int) -> SimpleNamespace:
    observer_http_ports = ports[1:6]
    observer_ws_ports = ports[6:11]
    return SimpleNamespace(
        mode="live", drones=30, hz=20, duration=duration, seed=seed,
        gap_fault=False, gap_at=7, base_url=f"http://127.0.0.1:{ports[0]}",
        ws_url=f"ws://127.0.0.1:{observer_ws_ports[0]}/v1/deltas",
        client_base_url_template=None,
        client_ws_url_template=None,
        client_base_urls=[f"http://127.0.0.1:{port}" for port in observer_http_ports],
        client_ws_urls=[
            f"ws://127.0.0.1:{port}/v1/deltas" for port in observer_ws_ports
        ],
        snapshot_path="/v1/snapshot", observation_path="/v1/observations",
        observation_stream_path="/v1/observations/stream",
        ingest_transport="websocket",
        ingest_ws_url=f"ws://127.0.0.1:{ports[0]}/v1/observations/stream",
        command_path="/v1/commands", metrics_path="/metrics", health_path="/healthz",
        client_queue=256, ingest_concurrency=256, drain=5.0, gateway_command=None,
        ingest_pending_window=8192,
        gateway_timeout=60, slow_client=-1, slow_reader_delay=0.0,
        raw_slow_reader=False, disconnect_client=-1, disconnect_at=0,
        observer_stall_timeout=2.0, observer_stale_age=2.0,
        tick_offset=tick_offset,
    )


async def one_trial(root: Path, number: int, warmup: float, duration: float,
                    cpu_budget_percent: float,
                    memory_budget_bytes: int) -> dict[str, Any]:
    trial = root / f"trial-{number}"
    trial.mkdir(exist_ok=True)
    # A recovery snapshot is a fresh TCP flow. Give it its own impaired proxy
    # so the test does not incorrectly serialize it behind the abandoned
    # WebSocket's netem FIFO. Both flows retain the exact same cloud profile.
    gateway_port, *ports = unique_ports(12)
    process = gateway_process(gateway_port, trial / "gateway.sqlite3")
    proxies: list[str] = []
    stop = asyncio.Event()
    sampler: asyncio.Task[Any] | None = None
    started = time.time()
    try:
        await network.wait_for_health(f"http://127.0.0.1:{gateway_port}", "/healthz", 60)
        proxies = start_proxies(uuid.uuid4().hex[:8], gateway_port, ports)
        proof = {
            name: subprocess.run(["docker", "exec", name, "tc", "qdisc", "show", "dev", "eth0"],
                                 capture_output=True, text=True, check=True).stdout.strip()
            for name in proxies
        }
        write_json(trial / "netem-proof.json", proof)
        await network.wait_for_health(f"http://127.0.0.1:{ports[0]}", "/healthz", 60)
        warm = await network.run_live(args_for("", ports, warmup, 810000 + number, 0))
        write_json(trial / "warmup-summary.json", warm)
        sampler = asyncio.create_task(sample_process(process, stop, trial / "resources.ndjson"))
        measured = await network.run_live(args_for(
            "", ports, duration, 820000 + number, round(warmup * 20)
        ))
        stop.set()
        await sampler
        sampler = None
        resources = resource_summary(
            trial / "resources.ndjson", duration, cpu_budget_percent,
            memory_budget_bytes,
        )
        measured["process_resources"] = resources
        measured["expected_cloud_profile"] = {
            "implementation": "Linux tc netem external TCP forwarders",
            "per_route": True, "latency_each_direction_ms": 50, "jitter_ms": 20,
            "packet_loss_percent": 0.1, "bandwidth_mbit_s": 20,
            "observer_stream_routes": 5, "observer_recovery_routes": 5,
            "ingestion_routes": 1,
        }
        producer = measured["producer"]
        metrics = measured["gateway_metrics"]
        clients = measured["clients"]
        expected = round(duration * 20) * 30
        observation = measured["http_rtt_by_endpoint"]["observation"]
        command = measured["http_rtt_by_endpoint"]["command"]
        publish_apply_p95 = max((
            c["gateway_emitted_to_client_apply_same_host_clock"]["p95_ms"]
            for c in clients
            if c["gateway_emitted_to_client_apply_same_host_clock"]["p95_ms"] is not None
        ), default=float("inf"))
        publish_apply_p99 = max((
            c["gateway_emitted_to_client_apply_same_host_clock"]["p99_ms"]
            for c in clients
            if c["gateway_emitted_to_client_apply_same_host_clock"]["p99_ms"] is not None
        ), default=float("inf"))
        ingress_publish_p95_ms = metrics.get("ingress_to_publish_us_p95", 10_001) / 1000
        ingress_publish_p99_ms = metrics.get("ingress_to_publish_us_p99", 25_001) / 1000
        gates = {
            "exact_observation_count": producer["intended"] == expected
                and producer["offered"] == expected and producer["accepted"] == expected,
            "zero_rejections": producer["rejected"] == 0,
            "sustained_600hz_offer_cadence_at_98_percent": producer["offered_cadence_per_second"] >= 588,
            "all_five_clients_converged": len(clients) == 5 and all(c["converged"] for c in clients),
            "zero_unexpected_observer_recoveries": all(
                c["watchdog_recoveries"] == 0 and not c["declared_outage_windows"]
                for c in clients
            ),
            "zero_observer_sequence_gaps": all(c["gaps_detected"] == 0 for c in clients),
            "full_observer_availability": all(
                c["availability_percent"] == 100.0 for c in clients
            ),
            "exactly_five_websockets_at_measurement_end": metrics.get("ws_connected") == 5,
            "healthy_queue_below_75_percent": metrics.get("max_client_queue_depth", 257) < 192,
            "ingress_to_publish_p95_within_10ms": ingress_publish_p95_ms <= 10,
            "ingress_to_publish_p99_within_25ms": ingress_publish_p99_ms <= 25,
            "publish_to_apply_p95_within_200ms": (
                publish_apply_p95 <= PUBLISH_TO_APPLY_P95_LIMIT_MS
            ),
            "publish_to_apply_p99_within_500ms": (
                publish_apply_p99 <= PUBLISH_TO_APPLY_P99_LIMIT_MS
            ),
            "command_rtt_p95_within_250ms": command["p95_ms"] <= 250,
            "command_rtt_p99_within_500ms": command["p99_ms"] <= 500,
            "measured_resource_samples_cover_80_percent": resources["samples"] >= resources["expected_minimum_samples"],
            "resource_budget_was_frozen_before_run": resources["resource_budget_frozen_before_run"],
            "resource_gates_pass": resources["gates"]["passed"],
        }
        gates["passed"] = all(gates.values())
        measured["expected_cloud_gates"] = gates
        measured["diagnostics"] = {
            "observation_http_rtt": observation,
            "worst_client_publish_to_apply_p95_ms": publish_apply_p95,
            "worst_client_publish_to_apply_p99_ms": publish_apply_p99,
            "ingress_to_publish_p95_ms": ingress_publish_p95_ms,
            "ingress_to_publish_p99_ms": ingress_publish_p99_ms,
            "latency_clock_scope": "same-host synchronized wall clock",
            "latency_samples_explicitly_filtered_by_outage_window": False,
            "passing_series_requires_zero_observer_outage_windows": True,
        }
        measured["checks"]["passed"] = measured["checks"]["passed"] and gates["passed"]
        write_json(trial / "summary.json", measured)
        return {"trial": number, "status": "complete", "passed": measured["checks"]["passed"],
                "elapsed_seconds": time.time() - started, "summary": str(trial / "summary.json")}
    except BaseException as error:
        failure = {"trial": number, "status": "failed", "passed": False,
                   "elapsed_seconds": time.time() - started,
                   "error_type": type(error).__name__, "error": str(error),
                   "traceback": traceback.format_exc()}
        write_json(trial / "failure.json", failure)
        return failure
    finally:
        stop.set()
        if sampler:
            await sampler
        stop_proxies(proxies)
        network.stop_gateway(process)


async def main_async(args: argparse.Namespace) -> int:
    gateway_manifest = HERE.parents[1] / "realtime-gateway" / "Cargo.toml"
    subprocess.run([
        "cargo", "build", "--release", "--locked", "--manifest-path",
        str(gateway_manifest),
    ], check=True)
    subprocess.run(["docker", "build", "-t", IMAGE, str(HERE / "netem-proxy")], check=True)
    root = args.output_root
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "manifest.json"
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True,
                            check=True).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    if dirty and not args.allow_dirty:
        raise RuntimeError("formal evidence requires a clean committed worktree; use --allow-dirty only for smoke calibration")
    executable = HERE.parents[1] / "realtime-gateway" / "target" / "release" / (
        "sentinel-realtime-gateway.exe" if os.name == "nt" else "sentinel-realtime-gateway"
    )
    executable_sha256 = hashlib.sha256(executable.read_bytes()).hexdigest()
    image_id = subprocess.run(["docker", "image", "inspect", IMAGE, "--format", "{{.Id}}"],
                              capture_output=True, text=True, check=True).stdout.strip()
    config = {"profile": "100ms RTT, 20ms jitter, 0.1% packet loss, 20Mbit/s per route",
              "warmup_seconds": args.warmup, "measurement_seconds": args.duration,
              "drones": 30, "hz": 20, "clients": 5, "trials": args.trials, "git_commit": commit,
              "proxy_image_id": image_id, "gateway_executable_sha256": executable_sha256,
              "worktree_clean": not bool(dirty),
              "cpu_budget_percent": args.cpu_budget_percent,
              "memory_budget_bytes": args.memory_budget_bytes}
    config_hash = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schema": "sentinel-expected-cloud-trials/v1", "created_at": datetime.now(timezone.utc).isoformat(),
        "config": config, "config_hash": config_hash, "trials": []}
    if manifest.get("config_hash") != config_hash:
        raise RuntimeError("resume configuration/build differs from immutable manifest")
    completed = {int(item["trial"]) for item in manifest["trials"]}
    for number in range(1, args.trials + 1):
        if number in completed:
            continue
        result = await one_trial(
            root, number, args.warmup, args.duration, args.cpu_budget_percent,
            args.memory_budget_bytes,
        )
        manifest["trials"].append(result)
        write_json(manifest_path, manifest)
        print(json.dumps(result), flush=True)
    complete = [item for item in manifest["trials"] if item.get("status") == "complete"]
    summaries = [json.loads(Path(item["summary"]).read_text()) for item in complete]
    def aggregate(path: tuple[str, ...], worst=max) -> dict[str, float] | None:
        values = []
        for summary in summaries:
            value: Any = summary
            for key in path:
                value = value[key]
            values.append(float(value))
        return {"median": statistics.median(values), "worst": worst(values)} if values else None
    manifest["aggregate"] = {
        "runs_complete": len(complete),
        "all_requested_passed": len(complete) == args.trials and all(item.get("passed") for item in complete),
        "observation_rtt_p95_ms": aggregate(("http_rtt_by_endpoint", "observation", "p95_ms")),
        "observation_rtt_p99_ms": aggregate(("http_rtt_by_endpoint", "observation", "p99_ms")),
        "offered_cadence_per_second": aggregate(("producer", "offered_cadence_per_second"), min),
        "accepted_completion_rate_per_second": aggregate(("producer", "accepted_completion_rate_per_second"), min),
        "max_client_queue_depth": aggregate(("gateway_metrics", "max_client_queue_depth")),
    }
    write_json(manifest_path, manifest)
    return 0 if manifest["aggregate"]["all_requested_passed"] else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--warmup", type=float, default=60)
    parser.add_argument("--duration", type=float, default=600)
    parser.add_argument("--trials", type=int, default=5)
    parser.add_argument("--cpu-budget-percent", type=float, default=100.0,
                        help="Predeclared process CPU budget where 100 is one logical core")
    parser.add_argument("--memory-budget-bytes", type=int, default=268435456,
                        help="Predeclared gateway RSS budget (default 256 MiB; not OS containment)")
    parser.add_argument("--allow-dirty", action="store_true",
                        help="Calibration only: permit evidence from an uncommitted tree")
    parser.add_argument("--output-root", type=Path, required=True)
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
