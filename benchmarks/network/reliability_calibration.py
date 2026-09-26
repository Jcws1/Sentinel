#!/usr/bin/env python3
"""Short, reproducible reliability calibration for the Rust realtime gateway.

This is deliberately a pre-acceptance smoke. It runs seconds, not the required
five ten-minute trials, and retains every result (including failures).
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
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import psutil


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sentinel_network_harness", HERE / "network_harness.py")
assert SPEC and SPEC.loader
network = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = network
SPEC.loader.exec_module(network)


class ProcessSampler:
    def __init__(self, pid: int) -> None:
        self.process = psutil.Process(pid)
        self.samples: list[dict[str, float]] = []
        self.stop = asyncio.Event()

    async def run(self) -> None:
        self.process.cpu_percent(None)
        while not self.stop.is_set():
            try:
                memory = self.process.memory_info()
                self.samples.append({
                    "monotonic_seconds": time.monotonic(),
                    "cpu_percent": self.process.cpu_percent(None),
                    "rss_bytes": float(memory.rss),
                    "vms_bytes": float(memory.vms),
                    "threads": float(self.process.num_threads()),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                break
            await asyncio.sleep(0.1)

    def summary(self) -> dict[str, Any]:
        def values(key: str) -> list[float]:
            return [item[key] for item in self.samples]
        return {
            "samples": len(self.samples),
            "cpu_percent": percentile_summary(values("cpu_percent")),
            "rss_bytes_max": max(values("rss_bytes"), default=None),
            "vms_bytes_max": max(values("vms_bytes"), default=None),
            "threads_max": max(values("threads"), default=None),
            "sampling_interval_seconds": 0.1,
        }


def percentile_summary(values: list[float]) -> dict[str, float | int | None]:
    """Percentiles for dimensionless/resource values; never label them as ms."""
    return {
        "samples": len(values),
        "p50": network.percentile(values, 0.50),
        "p95": network.percentile(values, 0.95),
        "p99": network.percentile(values, 0.99),
        "max": max(values) if values else None,
    }


def evaluate_scenario(summary: dict[str, Any], spec: dict[str, Any]) -> dict[str, bool]:
    """Purpose-specific smoke gates; absence of the requested fault is failure."""
    producer = summary.get("producer", {})
    gateway = summary.get("gateway_metrics", {})
    clients = summary.get("clients", [])
    resources = summary.get("process_resources", {})
    intended = int(producer.get("intended", 0))
    accepted = int(producer.get("accepted", 0))
    target_rate = float(producer.get("target_rate_per_second", 0))
    achieved_rate = float(producer.get("accepted_rate_per_second", 0))
    rate_ratio = achieved_rate / target_rate if target_rate else 0.0
    observation_p99 = summary.get("http_rtt_by_endpoint", {}).get("observation", {}).get("p99_ms")
    commit_p99_us = gateway.get("observation_latency_us_p99")
    queue_high_water = gateway.get("max_client_queue_depth")
    checks = {
        "all_offered_and_accepted": intended > 0 and accepted == intended
        and int(producer.get("rejected", -1)) == 0,
        "achieved_rate_at_least_80_percent": rate_ratio >= float(spec.get("min_rate_ratio", 0.8)),
        "observation_http_p99_within_100ms": observation_p99 is not None
        and float(observation_p99) <= float(spec.get("max_observation_p99_ms", 100)),
        "gateway_commit_p99_within_5ms": commit_p99_us is not None
        and int(commit_p99_us) <= int(spec.get("max_commit_p99_us", 5_000)),
        "queue_high_water_within_capacity": queue_high_water is not None
        and int(queue_high_water) >= 0
        and int(queue_high_water) <= int(spec.get("queue_capacity", 256)),
        "resource_samples_present": int(resources.get("samples", 0)) > 0,
        "all_clients_converged": len(clients) == 5 and all(c.get("converged") for c in clients),
    }
    required_fault = spec.get("required_fault")
    if required_fault == "disconnect":
        checks["forced_disconnect_occurred_once"] = (
            int(summary.get("run", {}).get("forced_disconnects", 0)) == 1
        )
    elif required_fault == "slow_reader_overflow":
        slow_index = int(spec["slow_client"])
        checks["server_slow_reader_overflow_occurred"] = (
            int(gateway.get("slow_client_disconnects", 0)) >= 1
        )
        checks["slow_reader_isolated_from_healthy_clients"] = all(
            client.get("converged") and int(client.get("gaps_detected", 0)) == 0
            for index, client in enumerate(clients) if index != slow_index and index != 4
        )
    if spec.get("gap_fault", True):
        checks["application_gap_fault_occurred_and_recovered"] = (
            len(clients) == 5 and int(clients[4].get("fault_drops", 0)) == 1
            and int(clients[4].get("gaps_detected", 0)) >= 1
            and clients[4].get("converged") is True
        )
    return checks


def gateway_process(port: int, database: Path, queue_capacity: int) -> subprocess.Popen[Any]:
    env = os.environ.copy()
    env.update({
        "SENTINEL_GATEWAY_ADDR": f"127.0.0.1:{port}",
        "SENTINEL_COMMAND_DB_PATH": str(database),
        "SENTINEL_CLIENT_QUEUE_CAPACITY": str(queue_capacity),
        "SENTINEL_DELTA_RETENTION": "4096",
    })
    executable = HERE.parents[1] / "realtime-gateway" / "target" / "release" / (
        "sentinel-realtime-gateway.exe" if os.name == "nt" else "sentinel-realtime-gateway"
    )
    if not executable.exists():
        raise RuntimeError(
            "release gateway binary is missing; run `cargo build --release "
            "--manifest-path realtime-gateway/Cargo.toml` first"
        )
    return subprocess.Popen(
        [str(executable)],
        cwd=HERE.parents[1], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


async def run_scenario(root: Path, port: int, spec: dict[str, Any]) -> dict[str, Any]:
    database = root / f"{spec['name']}.sqlite3"
    process = gateway_process(port, database, int(spec.get("queue_capacity", 256)))
    base_url = f"http://127.0.0.1:{port}"
    try:
        await network.wait_for_health(base_url, "/healthz", 60)
        sampler = ProcessSampler(process.pid)
        sampling = asyncio.create_task(sampler.run())
        args = SimpleNamespace(
            mode="live", drones=spec["drones"], hz=spec["hz"], duration=spec["duration"],
            seed=spec["seed"], gap_fault=spec.get("gap_fault", True), gap_at=7,
            base_url=base_url, ws_url=f"ws://127.0.0.1:{port}/v1/deltas",
            snapshot_path="/v1/snapshot", observation_path="/v1/observations",
            command_path="/v1/commands", metrics_path="/metrics", health_path="/healthz",
            client_queue=int(spec.get("client_queue", 256)), ingest_concurrency=64,
            drain=float(spec.get("drain", 2)), gateway_command=None, gateway_timeout=60,
            slow_client=int(spec.get("slow_client", -1)),
            slow_reader_delay=float(spec.get("slow_reader_delay", 0)),
            disconnect_client=int(spec.get("disconnect_client", -1)),
            disconnect_at=int(spec.get("disconnect_at", 0)),
        )
        try:
            summary = await network.run_live(args)
        finally:
            sampler.stop.set()
            await sampling
        summary["scenario"] = spec["name"]
        summary["process_resources"] = sampler.summary()
        summary["calibration_profile"] = "short-smoke-not-acceptance"
        summary["purpose_checks"] = evaluate_scenario(summary, spec)
        summary["checks"]["passed"] = (
            summary["checks"]["passed"] and all(summary["purpose_checks"].values())
        )
        return summary
    finally:
        network.stop_gateway(process)


async def lost_response(root: Path, port: int) -> dict[str, Any]:
    """Send a valid command then discard its response and reconcile by identity."""
    database = root / "lost-response.sqlite3"
    process = gateway_process(port, database, 256)
    base = f"http://127.0.0.1:{port}"
    command_id = "harness-command-lost-response"
    try:
        await network.wait_for_health(base, "/healthz", 60)
        status, snapshot, _, headers = await network.http_json("GET", base + "/v1/snapshot")
        parsed = network.parse_snapshot(snapshot, headers)
        status, body, _, _ = await network.http_json(
            "POST", base + "/v1/observations", network.observation(0, 0, 9191, 0)
        )
        if status not in (200, 202, 204):
            raise RuntimeError(f"setup observation rejected: {status} {body}")
        payload = network.command_fixture(parsed["stream_epoch"], 1, "lost-response")
        raw_body = json.dumps(payload, separators=(",", ":")).encode()
        request = (
            f"POST /v1/commands HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
            f"Content-Type: application/json\r\nContent-Length: {len(raw_body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode() + raw_body
        sock = socket.create_connection(("127.0.0.1", port), timeout=5)
        sock.sendall(request)
        # Give the loopback server a bounded opportunity to durably commit while
        # deliberately never reading the response bytes. This models a response
        # lost after admission, not a request lost before delivery.
        await asyncio.sleep(0.05)
        sock.shutdown(socket.SHUT_RDWR)
        sock.close()  # response intentionally discarded
        reconcile_status = 404
        reconcile: dict[str, Any] = {}
        for _ in range(50):
            reconcile_status, reconcile, _, _ = await network.http_json(
                "GET", base + f"/v1/commands/{command_id}"
            )
            if reconcile_status == 200:
                break
            await asyncio.sleep(0.02)
        network.stop_gateway(process)
        process = gateway_process(port, database, 256)
        await network.wait_for_health(base, "/healthz", 60)
        status, restarted_snapshot, _, restarted_headers = await network.http_json(
            "GET", base + "/v1/snapshot"
        )
        restarted = network.parse_snapshot(restarted_snapshot, restarted_headers)
        retry_payload = network.gateway_command_request(
            payload["command"], restarted["stream_epoch"], 0
        )
        retry_status, retry, _, _ = await network.http_json(
            "POST", base + "/v1/commands", retry_payload
        )
        post_status, post, _, _ = await network.http_json(
            "GET", base + f"/v1/commands/{command_id}"
        )
        passed = (
            reconcile_status == 200 and retry_status in (200, 202)
            and network.receipt_status(retry) in ("accepted", "duplicate") and post_status == 200
        )
        return {
            "schema": "sentinel-reliability-evidence/v1",
            "scenario": "durable-receipt-after-lost-response",
            "response_intentionally_discarded": True, "reconcile_before_restart": reconcile,
            "exact_retry_after_restart": retry, "reconcile_after_restart": post,
            "checks": {"durable_reconciliation": reconcile_status == 200,
                       "exact_retry_recovers_existing_receipt": (
                           retry_status == 200 and network.receipt_status(retry) in ("accepted", "duplicate")
                       ),
                       "survives_restart": post_status == 200,
                       "passed": passed},
            "external_effect_exactly_once_proven": False,
            "claim_boundary": (
                "Proves durable command receipt reconciliation only. It does not prove "
                "an external provider effect occurred exactly once."
            ),
        }
    finally:
        if process.poll() is None:
            network.stop_gateway(process)


async def main_async(args: argparse.Namespace) -> int:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    root = args.output_root / run_id
    root.mkdir(parents=True)
    duration = args.duration
    scenarios = [
        {"name": "steady-3", "drones": 3, "hz": 20, "duration": duration, "seed": 3003},
        {"name": "steady-10", "drones": 10, "hz": 20, "duration": duration, "seed": 3010},
        {"name": "steady-30", "drones": 30, "hz": 20, "duration": duration, "seed": 3030},
        {"name": "burst-30x100", "drones": 30, "hz": 100, "duration": max(1, duration / 2), "seed": 3100},
        {"name": "slow-reader", "drones": 30, "hz": 100, "duration": max(1, duration),
         "seed": 3200, "queue_capacity": 8, "client_queue": 1,
         "slow_client": 3, "slow_reader_delay": 0.1, "drain": 3,
         "required_fault": "slow_reader_overflow"},
        {"name": "disconnect-resync", "drones": 30, "hz": 20, "duration": duration,
         "seed": 3300, "disconnect_client": 2, "disconnect_at": 20,
         "required_fault": "disconnect"},
    ]
    results: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios):
        result = await run_scenario(root, args.port + index, scenario)
        (root / f"{scenario['name']}.json").write_text(json.dumps(result, indent=2) + "\n")
        results.append(result)
    loss = await lost_response(root, args.port + len(scenarios))
    (root / "durable-receipt-after-lost-response.json").write_text(
        json.dumps(loss, indent=2) + "\n"
    )
    results.append(loss)
    aggregate = {
        "schema": "sentinel-reliability-calibration/v1", "created_at": network.utc_now(),
        "calibration_only": True, "required_acceptance_not_run": "five 10-minute trials",
        "scenario_count": len(results),
        "passed": all(item["checks"]["passed"] for item in results),
        "results": [
            {
                "scenario": item["scenario"],
                "passed": item["checks"]["passed"],
                "accepted_rate_per_second": item.get("producer", {}).get(
                    "accepted_rate_per_second"
                ),
                "target_rate_per_second": item.get("producer", {}).get(
                    "target_rate_per_second"
                ),
                "failed_purpose_checks": [
                    name for name, passed in item.get("purpose_checks", {}).items()
                    if not passed
                ],
            }
            for item in results
        ],
    }
    (root / "summary.json").write_text(json.dumps(aggregate, indent=2) + "\n")
    print(json.dumps({"passed": aggregate["passed"], "evidence": str(root / "summary.json")}, indent=2))
    return 0 if aggregate["passed"] else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=2.0)
    parser.add_argument("--port", type=int, default=18190)
    parser.add_argument("--output-root", type=Path,
                        default=Path("test-results/realtime-core/reliability"))
    args = parser.parse_args()
    if args.duration <= 0:
        parser.error("--duration must be positive")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
