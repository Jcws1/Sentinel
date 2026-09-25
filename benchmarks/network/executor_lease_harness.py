#!/usr/bin/env python3
"""Black-box acceptance harness for durable executor leases and completion fencing."""

from __future__ import annotations

import argparse
import asyncio
import json
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import network_harness as net


def claim_body(worker_id: str, lease_ms: int) -> dict[str, Any]:
    return {"worker_id": worker_id, "lease_duration_ms": lease_ms}


def completion_body(command_request: dict[str, Any], claim: dict[str, Any]) -> dict[str, Any]:
    outcome = net.outcome_fixture(command_request, "lease-1")
    return {**outcome, "worker_id": claim["worker_id"], "lease_token": claim["lease_token"]}


def claimed(responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in responses if item["http_status"] == 200 and item["body"].get("claim")]


def evaluate(
    race: list[dict[str, Any]],
    reclaimed: dict[str, Any],
    stale: dict[str, Any],
    complete: dict[str, Any],
    duplicate: dict[str, Any],
    reconcile: dict[str, Any],
    post_restart: dict[str, Any],
    empty_claim: dict[str, Any],
) -> dict[str, bool]:
    winners = claimed(race)
    first = winners[0]["body"]["claim"] if len(winners) == 1 else {}
    second = reclaimed.get("body", {}).get("claim", {})
    outcome = reconcile.get("body", {}).get("outcome")
    restarted_outcome = post_restart.get("body", {}).get("outcome")
    checks = {
        "race_has_exactly_one_winner": len(winners) == 1
        and sorted(item["http_status"] for item in race) == [200, 204],
        "reclaim_has_new_fencing_token": reclaimed.get("http_status") == 200
        and bool(second)
        and second.get("lease_token") != first.get("lease_token")
        and second.get("attempt_count") == first.get("attempt_count", 0) + 1,
        "stale_token_cannot_complete": stale.get("http_status") == 409
        and stale.get("body", {}).get("error") == "lease_not_current",
        "current_token_completes_once": complete.get("http_status") == 201
        and duplicate.get("http_status") == 200,
        "terminal_outcome_reconciles": reconcile.get("http_status") == 200
        and isinstance(outcome, dict)
        and outcome.get("outcome_id") == "harness-outcome-lease-1",
        "outcome_survives_restart": post_restart.get("http_status") == 200
        and restarted_outcome == outcome,
        "terminal_command_not_reclaimed": empty_claim.get("http_status") == 204,
    }
    checks["passed"] = all(checks.values())
    return checks


async def timed_json(method: str, url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    status, response, rtt, _ = await net.http_json(method, url, body)
    return {"http_status": status, "body": response, "rtt_ms": rtt}


async def run(args: argparse.Namespace) -> dict[str, Any]:
    database = args.database or Path(tempfile.mkdtemp(prefix="sentinel-lease-")) / "commands.db"
    base = args.base_url.rstrip("/")
    command_url = base + args.command_path
    claim_url = base + args.claim_path
    reconcile_url = f"{command_url}/harness-command-lease-1"
    complete_url = reconcile_url + args.outcome_suffix
    process = None
    started = time.perf_counter_ns()
    responses: dict[str, Any] = {}
    try:
        process = net.start_gateway(args.gateway_command, database, args.database_env)
        await net.wait_for_health(args.base_url, args.health_path, args.gateway_timeout)
        snapshot_status, snapshot, _, headers = await net.http_json("GET", base + args.snapshot_path)
        if snapshot_status != 200:
            raise RuntimeError(f"snapshot failed: HTTP {snapshot_status}: {snapshot}")
        parsed = net.parse_snapshot(snapshot, headers)
        obs_status, obs, _, _ = await net.http_json(
            "POST", base + args.observation_path, net.observation(0, 0, args.seed, 0)
        )
        if obs_status not in (200, 202, 204):
            raise RuntimeError(f"observation failed: HTTP {obs_status}: {obs}")
        command = net.command_fixture(parsed["stream_epoch"], 1, "lease-1")
        responses["admit"] = await timed_json("POST", command_url, command)
        if responses["admit"]["http_status"] not in (200, 202):
            raise RuntimeError(f"command admission failed: {responses['admit']}")

        # The HTTP requests are released together; SQLite is the arbiter, not this harness.
        responses["race"] = await asyncio.gather(
            timed_json("POST", claim_url, claim_body("executor-a", args.lease_ms)),
            timed_json("POST", claim_url, claim_body("executor-b", args.lease_ms)),
        )
        winners = claimed(responses["race"])
        if len(winners) != 1:
            raise RuntimeError(f"expected one lease winner: {responses['race']}")
        first_claim = winners[0]["body"]["claim"]
        await asyncio.sleep((args.lease_ms + args.expiry_margin_ms) / 1000)
        responses["reclaim"] = await timed_json(
            "POST", claim_url, claim_body("executor-c", args.lease_ms)
        )
        second_claim = responses["reclaim"]["body"].get("claim", {})
        responses["stale_completion"] = await timed_json(
            "POST", complete_url, completion_body(command, first_claim)
        )
        current_completion = completion_body(command, second_claim)
        responses["completion"] = await timed_json("POST", complete_url, current_completion)
        responses["duplicate_completion"] = await timed_json(
            "POST", complete_url, current_completion
        )
        responses["reconcile_before_restart"] = await timed_json("GET", reconcile_url)

        net.stop_gateway(process)
        process = None
        process = net.start_gateway(args.gateway_command, database, args.database_env)
        await net.wait_for_health(args.base_url, args.health_path, args.gateway_timeout)
        responses["reconcile_after_restart"] = await timed_json("GET", reconcile_url)
        responses["claim_after_restart"] = await timed_json(
            "POST", claim_url, claim_body("executor-d", args.lease_ms)
        )
    finally:
        if process is not None:
            net.stop_gateway(process)

    checks = evaluate(
        responses["race"], responses["reclaim"], responses["stale_completion"],
        responses["completion"], responses["duplicate_completion"],
        responses["reconcile_before_restart"], responses["reconcile_after_restart"],
        responses["claim_after_restart"],
    )
    return {
        "schema": "sentinel-executor-lease-evidence/v1",
        "created_at": net.utc_now(),
        "database": str(database),
        "lease_duration_ms": args.lease_ms,
        "elapsed_ms": (time.perf_counter_ns() - started) / 1e6,
        "http_rtt_ms": {
            name: item["rtt_ms"]
            for name, item in responses.items()
            if isinstance(item, dict) and "rtt_ms" in item
        } | {"claim_race": [item["rtt_ms"] for item in responses["race"]]},
        "responses": responses,
        "checks": checks,
        "limitations": [
            "proves gateway lease fencing and restart durability, not exactly-once behavior of an external provider",
            "completion represents one logical effect reported by the executor; provider-side idempotency remains required",
            "does not prove NLP correctness or hosted Wedgetail interception",
        ],
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--base-url", default="http://127.0.0.1:8090")
    result.add_argument("--snapshot-path", default="/v1/snapshot")
    result.add_argument("--observation-path", default="/v1/observations")
    result.add_argument("--command-path", default="/v1/commands")
    result.add_argument("--claim-path", default="/v1/outbox/claim")
    result.add_argument("--outcome-suffix", default="/outcome")
    result.add_argument("--health-path", default="/healthz")
    result.add_argument("--gateway-command", required=True)
    result.add_argument("--gateway-timeout", type=float, default=30)
    result.add_argument("--database", type=Path)
    result.add_argument("--database-env", default="SENTINEL_COMMAND_DB_PATH")
    result.add_argument("--lease-ms", type=int, default=150)
    result.add_argument("--expiry-margin-ms", type=int, default=75)
    result.add_argument("--seed", type=int, default=20260925)
    result.add_argument("--output-root", type=Path, default=Path("test-results/realtime-core/network"))
    return result


async def async_main(args: argparse.Namespace) -> int:
    summary = await run(args)
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-lease-{uuid.uuid4().hex[:8]}"
    output = args.output_root / run_id
    output.mkdir(parents=True, exist_ok=False)
    target = output / "summary.json"
    target.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": summary["checks"]["passed"], "evidence": str(target)}, indent=2))
    return 0 if summary["checks"]["passed"] else 1


def main() -> int:
    args = parser().parse_args()
    if args.lease_ms <= 0 or args.expiry_margin_ms < 0:
        raise SystemExit("lease duration must be positive and margin non-negative")
    return asyncio.run(async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
