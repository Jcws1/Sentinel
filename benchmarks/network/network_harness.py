#!/usr/bin/env python3
"""Independent five-client reference-model and network evaluation harness."""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import math
import os
import secrets
import shlex
import socket
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator


CLIENT_COUNT = 5
PROTOCOL = "realtime/v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_hash(tracks: dict[str, dict[str, Any]]) -> str:
    ordered = [{"track_id": key, **tracks[key]} for key in sorted(tracks)]
    raw = json.dumps(ordered, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def latency_summary(values: list[float]) -> dict[str, float | int | None]:
    return {
        "samples": len(values),
        "p50_ms": percentile(values, 0.50),
        "p95_ms": percentile(values, 0.95),
        "p99_ms": percentile(values, 0.99),
        "max_ms": max(values) if values else None,
    }


@dataclass
class ClientModel:
    client_id: str
    epoch: str = ""
    sequence: int = 0
    tracks: dict[str, dict[str, Any]] = field(default_factory=dict)
    receive_apply_ms: list[float] = field(default_factory=list)
    gaps: int = 0
    resyncs: int = 0
    duplicates: int = 0
    dropped_for_fault: int = 0
    forced_disconnects: int = 0

    def install_snapshot(self, snapshot: dict[str, Any]) -> None:
        self.epoch = snapshot["stream_epoch"]
        self.sequence = int(snapshot.get("covers_through", snapshot["sequence"]))
        self.tracks = {
            item["track_id"]: {k: v for k, v in item.items() if k != "track_id"}
            for item in snapshot["tracks"]
        }
        self.resyncs += 1

    def apply_delta(self, delta: dict[str, Any]) -> str:
        started = time.perf_counter_ns()
        if delta["stream_epoch"] != self.epoch:
            self.gaps += 1
            return "resync"
        resulting = int(delta["sequence"])
        base = int(delta["base_sequence"])
        if resulting <= self.sequence:
            self.duplicates += 1
            return "duplicate"
        if base != self.sequence or resulting != base + 1:
            self.gaps += 1
            return "resync"
        update = delta["track"]
        self.tracks[update["track_id"]] = {
            k: v for k, v in update.items() if k != "track_id"
        }
        self.sequence = resulting
        self.receive_apply_ms.append((time.perf_counter_ns() - started) / 1e6)
        return "applied"


def observation(track_index: int, tick: int, seed: int, source_time_ms: int) -> dict[str, Any]:
    # Integer coordinates keep replay and hashes deterministic across languages.
    return {
        "schema_version": PROTOCOL,
        "message_type": "observation",
        "message_id": f"msg-{seed}-{tick:08d}-{track_index:03d}",
        "stream_id": "harness-sensor",
        "stream_sequence": tick * 30 + track_index + 1,
        "emitted_at": "2026-09-25T00:00:00Z",
        "correlation": {"correlation_id": f"run-{seed}"},
        "observation_id": f"obs-{seed}-{tick:08d}-{track_index:03d}",
        "track_id": f"DRONE-{track_index + 1:02d}",
        "source_id": "harness-sensor",
        "source_sequence": tick + 1,
        "source_time": "2026-09-25T00:00:00Z",
        "position": {
            "x_mm": track_index * 100_000 + tick * 101,
            "y_mm": track_index * 50_000 + tick * 53,
            "z_mm": 80_000 + (track_index % 3) * 10_000,
        },
        "velocity": {"x_mm_s": 2020, "y_mm_s": 1060, "z_mm_s": 0},
    }


def parse_snapshot(body: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
    """Normalize the strict domain snapshot plus gateway recovery metadata."""
    headers = {k.lower(): v for k, v in (headers or {}).items()}
    epoch = body.get("server_epoch") or headers.get("x-sentinel-epoch")
    if not epoch:
        raise ValueError("snapshot has no server epoch in body or x-sentinel-epoch")
    covers = body.get("covers_through", body.get("stream_sequence"))
    if covers is None:
        raise ValueError("snapshot has no covers_through or stream_sequence")
    return {
        **body,
        "stream_epoch": str(epoch),
        "sequence": int(covers),
        "covers_through": int(covers),
    }


def parse_gateway_message(message: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    """Translate sentinel-gateway/v1 transport messages for the client model."""
    kind = message.get("message_type")
    if kind == "gateway_hello":
        return "hello", None
    if kind == "gateway_resync_required":
        return "resync", None
    if message.get("transport_version") != "sentinel-gateway/v1":
        raise ValueError("unknown gateway transport version")
    payload = message.get("payload")
    if not isinstance(payload, dict) or payload.get("message_type") != "track_delta":
        raise ValueError("gateway envelope lacks a track_delta payload")
    base = message.get("base_sequence")
    result = message.get("result_sequence")
    epoch = message.get("server_epoch")
    if base is None or result is None or not epoch:
        raise ValueError("gateway envelope lacks epoch/base/result")
    return "delta", {
        "stream_epoch": str(epoch),
        "base_sequence": int(base),
        "sequence": int(result),
        "track": payload["track"],
    }


def gateway_command_request(command: dict[str, Any], epoch: str, revision: int) -> dict[str, Any]:
    return {
        "transport_version": "sentinel-gateway/v1",
        "expected_epoch": epoch,
        "expected_revision": revision,
        "command": command,
    }


def command_fixture(epoch: str, revision: int, suffix: str = "restart-1") -> dict[str, Any]:
    """Build one stable semantic command while transport preconditions may change."""
    command = {
        "schema_version": PROTOCOL,
        "message_type": "command",
        "message_id": f"harness-command-message-{suffix}",
        "stream_id": "harness-operator",
        "stream_sequence": 1,
        "emitted_at": "2026-09-25T00:00:00Z",
        "correlation": {"correlation_id": f"harness-command-{suffix}"},
        "command_id": f"harness-command-{suffix}",
        "idempotency_key": f"harness-command-{suffix}",
        "command_name": "hold",
        "target_id": "DRONE-01",
        "parameters": {},
    }
    return gateway_command_request(command, epoch, revision)


def outcome_fixture(command: dict[str, Any], suffix: str = "restart-1") -> dict[str, Any]:
    inner = command["command"]
    return {
        "outcome_id": f"harness-outcome-{suffix}",
        "status": "succeeded",
        "emitted_at": "2026-09-25T00:00:01Z",
        "correlation": {
            "correlation_id": inner["correlation"]["correlation_id"],
            "causation_id": inner["message_id"],
        },
        "details": {"logical_effect_count": 1},
    }


class DryGateway:
    """Deterministic oracle used only to verify the harness itself."""

    def __init__(self) -> None:
        self.epoch = "dry-epoch-1"
        self.sequence = 0
        self.tracks: dict[str, dict[str, Any]] = {}
        self.subscribers: list[asyncio.Queue[dict[str, Any]]] = []
        self.commands: dict[str, tuple[str, dict[str, Any]]] = {}

    async def snapshot(self) -> dict[str, Any]:
        return {
            "schema_version": PROTOCOL,
            "stream_epoch": self.epoch,
            "sequence": self.sequence,
            "covers_through": self.sequence,
            "tracks": [{"track_id": k, **self.tracks[k]} for k in sorted(self.tracks)],
        }

    async def ingest(self, obs: dict[str, Any]) -> None:
        base = self.sequence
        self.sequence += 1
        state = {
            "revision": obs["source_sequence"],
            "position": obs["position"],
            "velocity": obs["velocity"],
            "source_time": obs["source_time"],
        }
        self.tracks[obs["track_id"]] = state
        delta = {
            "schema_version": PROTOCOL,
            "stream_epoch": self.epoch,
            "base_sequence": base,
            "sequence": self.sequence,
            "track": {"track_id": obs["track_id"], **state},
        }
        for queue in self.subscribers:
            await queue.put(delta.copy())

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.subscribers.append(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self.subscribers.remove(queue)

    async def command(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        command = payload.get("command", payload)
        identity = command["command_id"]
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        if identity in self.commands:
            original_digest, receipt = self.commands[identity]
            if digest != original_digest:
                return 409, {"disposition": "conflict", "command_id": identity}
            return 200, {**receipt, "disposition": "duplicate"}
        receipt = {"command_id": identity, "disposition": "accepted", "effect_count": 1}
        self.commands[identity] = (digest, receipt)
        return 202, receipt


async def http_json(
    method: str, url: str, payload: dict[str, Any] | None = None
) -> tuple[int, dict[str, Any], float, dict[str, str]]:
    encoded = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=encoded, method=method)
    request.add_header("Accept", "application/json")
    if encoded is not None:
        request.add_header("Content-Type", "application/json")
    started = time.perf_counter_ns()

    def execute() -> tuple[int, dict[str, Any], dict[str, str]]:
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else {}, dict(response.headers.items())
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                body = {"error": raw.decode(errors="replace") or error.reason}
            return error.code, body, dict(error.headers.items())

    status, body, headers = await asyncio.to_thread(execute)
    return status, body, (time.perf_counter_ns() - started) / 1e6, headers


async def run_dry(args: argparse.Namespace) -> dict[str, Any]:
    gateway = DryGateway()
    clients = [ClientModel(f"client-{i + 1}") for i in range(CLIENT_COUNT)]
    for client in clients:
        client.install_snapshot(await gateway.snapshot())

    stop = asyncio.Event()

    async def consume(client: ClientModel, index: int) -> None:
        async for delta in gateway.subscribe():
            if stop.is_set():
                return
            # Application-level gap, distinct from TCP loss.
            if args.gap_fault and index == 4 and delta["sequence"] == args.gap_at:
                client.dropped_for_fault += 1
                continue
            if client.apply_delta(delta) == "resync":
                client.install_snapshot(await gateway.snapshot())

    consumers = [asyncio.create_task(consume(client, i)) for i, client in enumerate(clients)]
    await asyncio.sleep(0)  # Ensure all subscriptions exist before producing.
    ticks = max(1, round(args.duration * args.hz))
    producer_started = time.perf_counter_ns()
    for tick in range(ticks):
        source_time_ms = round(tick * 1000 / args.hz)
        for drone in range(args.drones):
            await gateway.ingest(observation(drone, tick, args.seed, source_time_ms))
    expected_sequence = ticks * args.drones
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and any(c.sequence < expected_sequence for c in clients):
        await asyncio.sleep(0.001)
    elapsed_ms = (time.perf_counter_ns() - producer_started) / 1e6

    command = {
        "schema_version": PROTOCOL,
        "message_type": "command",
        "message_id": "harness-command-message-1",
        "stream_id": "harness-operator",
        "stream_sequence": 1,
        "emitted_at": "2026-09-25T00:00:00Z",
        "correlation": {"correlation_id": "harness-command-1"},
        "command_id": "harness-command-1",
        "idempotency_key": "harness-command-1",
        "command_name": "hold",
        "target_id": "DRONE-01",
        "parameters": {"expected_epoch": gateway.epoch, "expected_revision": gateway.sequence},
    }
    request = gateway_command_request(command, gateway.epoch, gateway.sequence)
    first = await gateway.command(request)
    retry = await gateway.command(request.copy())
    conflict_payload = {**command, "command_name": "intercept"}
    conflict = await gateway.command(gateway_command_request(conflict_payload, gateway.epoch, gateway.sequence))

    stop.set()
    for task in consumers:
        task.cancel()
    await asyncio.gather(*consumers, return_exceptions=True)
    return build_summary(args, "dry-run", gateway.tracks, clients, elapsed_ms, [first, retry, conflict], [])


async def run_live(args: argparse.Namespace) -> dict[str, Any]:
    try:
        import aiohttp  # type: ignore
        import websockets  # type: ignore
    except ImportError as error:
        raise SystemExit("live mode requires: python -m pip install -r benchmarks/network/requirements.txt") from error

    snapshot_url = args.base_url.rstrip("/") + args.snapshot_path
    observation_url = args.base_url.rstrip("/") + args.observation_path
    command_url = args.base_url.rstrip("/") + args.command_path
    metrics_url = args.base_url.rstrip("/") + args.metrics_path
    clients = [ClientModel(f"client-{i + 1}") for i in range(CLIENT_COUNT)]
    endpoint_rtts: dict[str, list[float]] = {"snapshot": [], "observation": [], "command": []}
    stop = asyncio.Event()

    async def raw_no_read_client(index: int) -> None:
        """Handshake at the transport layer and then stop reading entirely."""
        parsed = urllib.parse.urlsplit(
            f"{args.ws_url}?after_sequence={clients[index].sequence}"
        )
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80
        path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        reader, writer = await asyncio.open_connection(host, port)
        sock = writer.get_extra_info("socket")
        if sock is not None:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        writer.write(request.encode("ascii"))
        await writer.drain()
        response = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
        if not response.startswith(b"HTTP/1.1 101"):
            raise RuntimeError(f"raw slow-reader handshake failed: {response[:120]!r}")
        headers = {}
        for line in response.decode("latin-1").split("\r\n")[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                headers[name.strip().lower()] = value.strip()
        expected_accept = base64.b64encode(
            hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
            ).digest()
        ).decode("ascii")
        if headers.get("sec-websocket-accept") != expected_accept:
            raise RuntimeError("raw slow-reader handshake accept value is invalid")
        # asyncio otherwise keeps draining the kernel buffer into StreamReader.
        # Pausing the transport makes this a genuine no-read peer.
        writer.transport.pause_reading()
        try:
            await stop.wait()
        finally:
            writer.transport.resume_reading()
            writer.close()
            await writer.wait_closed()

    async def resync(client: ClientModel) -> None:
        status, body, rtt, headers = await http_json("GET", snapshot_url)
        endpoint_rtts["snapshot"].append(rtt)
        if status != 200:
            raise RuntimeError(f"snapshot failed: HTTP {status}: {body}")
        client.install_snapshot(parse_snapshot(body, headers))

    for client in clients:
        await resync(client)

    async def consume(client: ClientModel, index: int) -> None:
        while not stop.is_set():
            url = f"{args.ws_url}?after_sequence={client.sequence}"
            reconnect = False
            async with websockets.connect(url, max_queue=args.client_queue) as socket:
                async for raw in socket:
                    if stop.is_set():
                        return
                    kind, delta = parse_gateway_message(json.loads(raw))
                    if kind == "hello":
                        continue
                    if kind == "resync":
                        reconnect = True
                        break
                    assert delta is not None
                    if index == args.disconnect_client and (
                        args.disconnect_at > 0 and delta["sequence"] >= args.disconnect_at
                    ):
                        client.forced_disconnects += 1
                        # A one-shot transport interruption. Reconnection uses the
                        # last applied cursor and therefore exercises retained replay.
                        args.disconnect_at = 0
                        reconnect = False
                        break
                    if index == args.slow_client and args.slow_reader_delay > 0:
                        await asyncio.sleep(args.slow_reader_delay)
                    if args.gap_fault and index == 4 and delta["sequence"] == args.gap_at:
                        client.dropped_for_fault += 1
                        continue
                    if client.apply_delta(delta) == "resync":
                        reconnect = True
                        break
            if reconnect and not stop.is_set():
                await resync(client)

    raw_slow = bool(getattr(args, "raw_slow_reader", False))
    consumers = [
        asyncio.create_task(
            raw_no_read_client(i)
            if raw_slow and i == args.slow_client
            else consume(client, i)
        )
        for i, client in enumerate(clients)
    ]
    await asyncio.sleep(0.1)
    ticks = max(1, round(args.duration * args.hz))
    producer_started = time.perf_counter_ns()
    semaphore = asyncio.Semaphore(args.ingest_concurrency)
    scheduling_lag_ms: list[float] = []
    accepted = 0
    rejected = 0

    # urllib opens a fresh connection and allocates a worker thread per request;
    # that measured the Python driver rather than the gateway above ~1.7k/s.
    # A single pooled aiohttp session keeps the semantic contract unchanged:
    # one ordered HTTP request per track observation, with no batching.
    timeout = aiohttp.ClientTimeout(total=10)
    connector = aiohttp.TCPConnector(
        limit=max(args.ingest_concurrency, args.drones),
        limit_per_host=max(args.ingest_concurrency, args.drones),
        force_close=False,
    )
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        async def produce_track_pooled(drone: int) -> None:
            nonlocal accepted, rejected
            for tick in range(ticks):
                target = producer_started + round(tick * 1e9 / args.hz)
                delay = (target - time.perf_counter_ns()) / 1e9
                if delay > 0:
                    await asyncio.sleep(delay)
                async with semaphore:
                    scheduling_lag_ms.append(
                        max(0.0, (time.perf_counter_ns() - target) / 1e6)
                    )
                    started = time.perf_counter_ns()
                    async with session.post(
                        observation_url,
                        json=observation(
                            drone, tick, args.seed, round(tick * 1000 / args.hz)
                        ),
                        headers={"Accept": "application/json"},
                    ) as response:
                        raw = await response.read()
                        status = response.status
                        try:
                            body = json.loads(raw) if raw else {}
                        except json.JSONDecodeError:
                            body = {"error": raw.decode(errors="replace")}
                    endpoint_rtts["observation"].append(
                        (time.perf_counter_ns() - started) / 1e6
                    )
                if status in (200, 202, 204):
                    accepted += 1
                else:
                    rejected += 1
                    raise RuntimeError(
                        f"observation rejected: HTTP {status}: {body}"
                    )

        await asyncio.gather(
            *(produce_track_pooled(drone) for drone in range(args.drones))
        )
    elapsed_ms = (time.perf_counter_ns() - producer_started) / 1e6
    intended = ticks * args.drones
    producer_stats = {
        "intended": intended,
        "offered": accepted + rejected,
        "accepted": accepted,
        "rejected": rejected,
        "offered_rate_per_second": (accepted + rejected) / (elapsed_ms / 1000),
        "accepted_rate_per_second": accepted / (elapsed_ms / 1000),
        "target_rate_per_second": args.drones * args.hz,
        "scheduling_lag": latency_summary(scheduling_lag_ms),
        "configured_concurrency_limit": args.ingest_concurrency,
        "per_track_source_order_preserved": True,
    }

    command = {
        "schema_version": PROTOCOL,
        "message_type": "command",
        "message_id": "harness-command-message-1",
        "stream_id": "harness-operator",
        "stream_sequence": 1,
        "emitted_at": "2026-09-25T00:00:00Z",
        "correlation": {"correlation_id": "harness-command-1"},
        "command_id": "harness-command-1",
        "idempotency_key": "harness-command-1",
        "command_name": "hold",
        "target_id": "DRONE-01",
        "parameters": {
            "expected_epoch": clients[0].epoch,
            "expected_revision": clients[0].sequence,
        },
    }
    target_revision = authoritative_revision = next(
        (
            int(state.get("revision", 0))
            for track_id, state in clients[0].tracks.items()
            if track_id == "DRONE-01"
        ),
        0,
    )
    accepted_request = gateway_command_request(command, clients[0].epoch, target_revision)
    conflict_request = gateway_command_request(
        {**command, "command_name": "intercept"}, clients[0].epoch, target_revision
    )
    command_results: list[tuple[int, dict[str, Any]]] = []
    for payload in (accepted_request, accepted_request.copy(), conflict_request):
        status, body, rtt, _ = await http_json("POST", command_url, payload)
        endpoint_rtts["command"].append(rtt)
        command_results.append((status, body))

    await asyncio.sleep(args.drain)
    status, authority, rtt, headers = await http_json("GET", snapshot_url)
    endpoint_rtts["snapshot"].append(rtt)
    if status != 200:
        raise RuntimeError(f"final snapshot failed: HTTP {status}")
    authority = parse_snapshot(authority, headers)
    authoritative_tracks = {
        item["track_id"]: {k: v for k, v in item.items() if k != "track_id"}
        for item in authority["tracks"]
    }
    for client in clients:
        if client.sequence != int(authority.get("covers_through", authority["sequence"])):
            await resync(client)
    metrics_status, gateway_metrics, metrics_rtt, _ = await http_json("GET", metrics_url)
    if metrics_status != 200:
        raise RuntimeError(f"metrics failed: HTTP {metrics_status}: {gateway_metrics}")
    endpoint_rtts["metrics"] = [metrics_rtt]
    stop.set()
    for task in consumers:
        task.cancel()
    await asyncio.gather(*consumers, return_exceptions=True)
    summary = build_summary(
        args,
        "live",
        authoritative_tracks,
        clients,
        elapsed_ms,
        command_results,
        endpoint_rtts,
        producer_stats,
    )
    summary["gateway_metrics"] = gateway_metrics
    summary["run"]["slow_reader_delay_seconds"] = args.slow_reader_delay
    summary["run"]["raw_slow_reader"] = bool(
        getattr(args, "raw_slow_reader", False)
    )
    summary["run"]["disconnect_client"] = args.disconnect_client
    summary["run"]["forced_disconnects"] = sum(c.forced_disconnects for c in clients)
    return summary


def build_summary(
    args: argparse.Namespace,
    mode: str,
    authoritative_tracks: dict[str, dict[str, Any]],
    clients: list[ClientModel],
    elapsed_ms: float,
    command_results: list[tuple[int, dict[str, Any]]],
    endpoint_rtts: dict[str, list[float]] | list[float],
    producer_stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    authority_hash = canonical_hash(authoritative_tracks)
    models = []
    for client in clients:
        models.append(
            {
                "client_id": client.client_id,
                "sequence": client.sequence,
                "canonical_hash": canonical_hash(client.tracks),
                "converged": canonical_hash(client.tracks) == authority_hash,
                "gaps_detected": client.gaps,
                "resyncs": client.resyncs,
                "duplicates": client.duplicates,
                "fault_drops": client.dropped_for_fault,
                "forced_disconnects": client.forced_disconnects,
                "receive_to_apply": latency_summary(client.receive_apply_ms),
            }
        )
    dispositions = [body.get("receipt_status", body.get("disposition")) for _, body in command_results]
    command_ok = (
        len(command_results) == 3
        and command_results[0][0] in (200, 202)
        and dispositions[0] == "accepted"
        and command_results[1][0] in (200, 202)
        and dispositions[1] in ("accepted", "duplicate")
        and (command_results[2][0] == 409 or dispositions[2] == "conflict")
    )
    gap_ok = not args.gap_fault or (
        models[4]["fault_drops"] == 1
        and models[4]["gaps_detected"] >= 1
        and models[4]["resyncs"] >= 2
        and all(model["gaps_detected"] == 0 for model in models[:4])
    )
    passed = all(model["converged"] for model in models) and command_ok and gap_ok
    return {
        "schema": "sentinel-network-evidence/v1",
        "created_at": utc_now(),
        "mode": mode,
        "is_network_performance_evidence": mode == "live",
        "run": {
            "seed": args.seed,
            "drones": args.drones,
            "hz_per_drone": args.hz,
            "duration_seconds": args.duration,
            "observations": max(1, round(args.duration * args.hz)) * args.drones,
            "producer_elapsed_ms": elapsed_ms,
            "five_independent_clients": True,
            "gap_fault": args.gap_fault,
        },
        "authoritative_hash": authority_hash,
        "clients": models,
        "http_rtt_by_endpoint": {
            name: latency_summary(samples)
            for name, samples in (
                endpoint_rtts.items()
                if isinstance(endpoint_rtts, dict)
                else {"combined_legacy": endpoint_rtts}.items()
            )
        },
        "producer": producer_stats
        or {
            "intended": max(1, round(args.duration * args.hz)) * args.drones,
            "offered": max(1, round(args.duration * args.hz)) * args.drones,
            "accepted": max(1, round(args.duration * args.hz)) * args.drones,
            "rejected": 0,
            "note": "in-process dry-run; not network performance evidence",
        },
        "commands": [
            {"http_status": status, "receipt": body} for status, body in command_results
        ],
        "checks": {
            "all_clients_converged": all(model["converged"] for model in models),
            "healthy_clients_continuous": all(model["gaps_detected"] == 0 for model in models[:4]),
            "fault_client_recovered": gap_ok,
            "command_idempotency_and_conflict": command_ok,
            "passed": passed,
        },
        "limitations": [
            "dry-run validates the harness and is not network performance evidence"
            if mode == "dry-run"
            else "cross-host one-way latency is not claimed without a bounded clock-offset estimate",
            "resource sampling and external network impairment remain separate acceptance steps",
            "successful command admission does not prove NLP correctness or Wedgetail execution",
        ],
    }


async def wait_for_health(base_url: str, path: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            status, _, _, _ = await http_json("GET", base_url.rstrip("/") + path)
            if status == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        await asyncio.sleep(0.25)
    raise RuntimeError("gateway did not become healthy before timeout")


def start_gateway(command: str, database: Path, database_env: str) -> subprocess.Popen[Any]:
    env = os.environ.copy()
    env[database_env] = str(database.resolve())
    return subprocess.Popen(shlex.split(command), cwd=os.getcwd(), env=env)


def stop_gateway(process: subprocess.Popen[Any]) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def receipt_status(body: dict[str, Any]) -> str | None:
    receipt = body.get("receipt") if isinstance(body.get("receipt"), dict) else body
    return receipt.get("receipt_status", receipt.get("disposition"))


def outcome_from_reconciliation(body: dict[str, Any]) -> dict[str, Any] | None:
    value = body.get("outcome")
    return value if isinstance(value, dict) else None


def outcome_matches_request(recovered: dict[str, Any] | None, request: dict[str, Any]) -> bool:
    if recovered is None:
        return False
    return all(recovered.get(key) == value for key, value in request.items())


async def run_restart(args: argparse.Namespace) -> dict[str, Any]:
    """Prove command and outcome identity survives a real process restart."""
    if not args.gateway_command:
        raise SystemExit("restart mode requires --gateway-command")
    database = args.database or Path(tempfile.mkdtemp(prefix="sentinel-restart-")) / "commands.db"
    command_url = args.base_url.rstrip("/") + args.command_path
    observation_url = args.base_url.rstrip("/") + args.observation_path
    snapshot_url = args.base_url.rstrip("/") + args.snapshot_path
    command_id = "harness-command-restart-1"
    reconcile_url = f"{command_url}/{command_id}"
    outcome_url = f"{reconcile_url}{args.outcome_suffix}"
    process: subprocess.Popen[Any] | None = None
    started_at = time.perf_counter_ns()
    try:
        process = start_gateway(args.gateway_command, database, args.database_env)
        await wait_for_health(args.base_url, args.health_path, args.gateway_timeout)
        status, snapshot, _, headers = await http_json("GET", snapshot_url)
        if status != 200:
            raise RuntimeError(f"initial snapshot failed: HTTP {status}: {snapshot}")
        parsed = parse_snapshot(snapshot, headers)
        status, body, _, _ = await http_json(
            "POST", observation_url, observation(0, 0, args.seed, 0)
        )
        if status not in (200, 202, 204):
            raise RuntimeError(f"setup observation failed: HTTP {status}: {body}")
        request = command_fixture(parsed["stream_epoch"], 1)
        first_status, first_body, first_rtt, _ = await http_json("POST", command_url, request)
        outcome = outcome_fixture(request)
        outcome_status, outcome_body, outcome_rtt, _ = await http_json("POST", outcome_url, outcome)
        stop_gateway(process)
        process = None

        process = start_gateway(args.gateway_command, database, args.database_env)
        await wait_for_health(args.base_url, args.health_path, args.gateway_timeout)
        status, new_snapshot, _, new_headers = await http_json("GET", snapshot_url)
        if status != 200:
            raise RuntimeError(f"post-restart snapshot failed: HTTP {status}: {new_snapshot}")
        restarted = parse_snapshot(new_snapshot, new_headers)
        # The semantic command and identity are exact. Only transport fencing is
        # refreshed because a process restart deliberately creates a new epoch.
        retry = gateway_command_request(request["command"], restarted["stream_epoch"], 0)
        retry_status, retry_body, retry_rtt, _ = await http_json("POST", command_url, retry)
        reconcile_status, reconcile_body, reconcile_rtt, _ = await http_json("GET", reconcile_url)
        conflict = json.loads(json.dumps(retry))
        conflict["command"]["command_name"] = "intercept"
        conflict_status, conflict_body, conflict_rtt, _ = await http_json("POST", command_url, conflict)
        duplicate_outcome_status, duplicate_outcome_body, duplicate_outcome_rtt, _ = await http_json(
            "POST", outcome_url, outcome
        )
        changed_outcome = json.loads(json.dumps(outcome))
        changed_outcome["status"] = "failed"
        changed_outcome_status, changed_outcome_body, changed_outcome_rtt, _ = await http_json(
            "POST", outcome_url, changed_outcome
        )
    finally:
        if process is not None:
            stop_gateway(process)

    recovered_outcome = outcome_from_reconciliation(reconcile_body)
    checks = {
        "initial_command_durably_accepted": first_status in (200, 202)
        and receipt_status(first_body) == "accepted",
        "terminal_outcome_durably_recorded": outcome_status in (200, 201, 202),
        "semantic_retry_reconciles_after_restart": retry_status in (200, 202)
        and receipt_status(retry_body) in ("accepted", "duplicate")
        and retry_body.get("message_id") == first_body.get("message_id"),
        "receipt_reconciles_after_restart": reconcile_status == 200,
        "terminal_outcome_reconciles_after_restart": outcome_matches_request(
            recovered_outcome, outcome
        ),
        "changed_command_conflicts": conflict_status == 409,
        "exact_outcome_retry_has_no_duplicate_effect": duplicate_outcome_status in (200, 201, 202),
        "changed_outcome_conflicts": changed_outcome_status == 409,
    }
    checks["passed"] = all(checks.values())
    return {
        "schema": "sentinel-command-restart-evidence/v1",
        "created_at": utc_now(),
        "database": str(database),
        "elapsed_ms": (time.perf_counter_ns() - started_at) / 1e6,
        "before_restart_epoch": parsed["stream_epoch"],
        "after_restart_epoch": restarted["stream_epoch"],
        "http_rtt_ms": {
            "admit": first_rtt,
            "record_outcome": outcome_rtt,
            "retry_after_restart": retry_rtt,
            "reconcile_after_restart": reconcile_rtt,
            "changed_command_conflict": conflict_rtt,
            "duplicate_outcome": duplicate_outcome_rtt,
            "changed_outcome_conflict": changed_outcome_rtt,
        },
        "responses": {
            "admit": {"http_status": first_status, "body": first_body},
            "outcome": {"http_status": outcome_status, "body": outcome_body},
            "retry": {"http_status": retry_status, "body": retry_body},
            "reconcile": {"http_status": reconcile_status, "body": reconcile_body},
            "changed_command": {"http_status": conflict_status, "body": conflict_body},
            "duplicate_outcome": {
                "http_status": duplicate_outcome_status, "body": duplicate_outcome_body
            },
            "changed_outcome": {"http_status": changed_outcome_status, "body": changed_outcome_body},
        },
        "checks": checks,
        "limitations": [
            "this proves gateway ledger durability and identity semantics, not external executor exactly-once delivery",
            "the process is terminated after acknowledged commits; this does not inject a kill between SQLite commit and HTTP response",
            "this does not prove NLP correctness or hosted Wedgetail interception",
        ],
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="mode", required=True)
    for name in ("dry-run", "live"):
        item = sub.add_parser(name)
        item.add_argument("--drones", type=int, choices=(3, 10, 30), default=3)
        item.add_argument("--hz", type=int, default=20)
        item.add_argument("--duration", type=float, default=2)
        item.add_argument("--seed", type=int, default=20260925)
        item.add_argument("--gap-at", type=int, default=7)
        item.add_argument("--no-gap-fault", dest="gap_fault", action="store_false")
        item.add_argument("--output-root", type=Path, default=Path("test-results/realtime-core/network"))
        item.set_defaults(gap_fault=True)
    live = sub.choices["live"]
    live.add_argument("--base-url", default="http://127.0.0.1:8090")
    live.add_argument("--ws-url", default="ws://127.0.0.1:8090/v1/deltas")
    live.add_argument("--snapshot-path", default="/v1/snapshot")
    live.add_argument("--observation-path", default="/v1/observations")
    live.add_argument("--command-path", default="/v1/commands")
    live.add_argument("--health-path", default="/healthz")
    live.add_argument("--metrics-path", default="/metrics")
    live.add_argument("--gateway-command")
    live.add_argument("--gateway-timeout", type=float, default=30)
    live.add_argument("--client-queue", type=int, default=256)
    live.add_argument("--ingest-concurrency", type=int, default=64)
    live.add_argument("--drain", type=float, default=2)
    live.add_argument("--slow-client", type=int, default=-1,
                      help="zero-based client index to delay while reading")
    live.add_argument("--slow-reader-delay", type=float, default=0.0)
    live.add_argument("--raw-slow-reader", action="store_true")
    live.add_argument("--disconnect-client", type=int, default=-1,
                      help="zero-based client index to disconnect once")
    live.add_argument("--disconnect-at", type=int, default=0)
    restart = sub.add_parser("restart")
    restart.add_argument("--base-url", default="http://127.0.0.1:8090")
    restart.add_argument("--snapshot-path", default="/v1/snapshot")
    restart.add_argument("--observation-path", default="/v1/observations")
    restart.add_argument("--command-path", default="/v1/commands")
    restart.add_argument("--outcome-suffix", default="/outcome")
    restart.add_argument("--health-path", default="/healthz")
    restart.add_argument("--gateway-command", required=True)
    restart.add_argument("--gateway-timeout", type=float, default=30)
    restart.add_argument("--database", type=Path)
    restart.add_argument("--database-env", default="SENTINEL_COMMAND_DB_PATH")
    restart.add_argument("--seed", type=int, default=20260925)
    restart.add_argument("--output-root", type=Path, default=Path("test-results/realtime-core/network"))
    return result


async def async_main(args: argparse.Namespace) -> int:
    process: subprocess.Popen[Any] | None = None
    try:
        if args.mode == "live" and args.gateway_command:
            process = subprocess.Popen(shlex.split(args.gateway_command), cwd=os.getcwd())
            await wait_for_health(args.base_url, args.health_path, args.gateway_timeout)
        if args.mode == "dry-run":
            summary = await run_dry(args)
        elif args.mode == "live":
            summary = await run_live(args)
        else:
            summary = await run_restart(args)
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    workload = f"-{args.drones}d-{args.hz}hz" if args.mode != "restart" else ""
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{args.mode}{workload}-{uuid.uuid4().hex[:8]}"
    output = args.output_root / run_id
    output.mkdir(parents=True, exist_ok=False)
    target = output / "summary.json"
    target.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": summary["checks"]["passed"], "evidence": str(target)}, indent=2))
    return 0 if summary["checks"]["passed"] else 1


def main() -> int:
    args = parser().parse_args()
    if args.mode != "restart" and (args.hz <= 0 or args.duration <= 0):
        raise SystemExit("--hz and --duration must be positive")
    return asyncio.run(async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
