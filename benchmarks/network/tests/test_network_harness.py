import asyncio
import gzip
import importlib.util
import json
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).parents[1] / "network_harness.py"
SPEC = importlib.util.spec_from_file_location("network_harness", MODULE_PATH)
assert SPEC and SPEC.loader
network_harness = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = network_harness
SPEC.loader.exec_module(network_harness)


class HarnessTests(unittest.TestCase):
    def test_http_json_accepts_empty_success_response(self):
        class EmptyResponse:
            status = 204
            headers = {}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b""

        with patch.object(network_harness.urllib.request, "urlopen", return_value=EmptyResponse()):
            status, body, _, _ = asyncio.run(
                network_harness.http_json("POST", "http://example.test/claim", {})
            )
        self.assertEqual(status, 204)
        self.assertEqual(body, {})

    def test_percentile_uses_nearest_rank(self):
        self.assertEqual(network_harness.percentile([1, 2, 3, 4], 0.50), 2)
        self.assertEqual(network_harness.percentile([1, 2, 3, 4], 0.99), 4)

    def test_latency_reservoir_has_fixed_memory_and_truthful_count(self):
        samples = network_harness.BoundedSamples(capacity=8)
        for value in range(10_000):
            samples.append(float(value))
        summary = network_harness.latency_summary(samples)
        self.assertEqual(samples.count, 10_000)
        self.assertEqual(len(samples.values), 8)
        self.assertEqual(summary["samples"], 10_000)
        self.assertEqual(summary["retained_samples"], 8)
        self.assertEqual(summary["sample_capacity"], 8)
        self.assertEqual(summary["max_ms"], 9_999.0)

    def test_observation_timestamp_window_evicts_oldest_at_capacity(self):
        window = network_harness.ObservationStartWindow(capacity=2)
        window.record("a", 1)
        window.record("b", 2)
        window.record("c", 3)
        self.assertIsNone(window.get("a"))
        self.assertEqual(window.get("b"), 2)
        self.assertEqual(window.get("c"), 3)
        self.assertEqual(window.evictions, 1)

    def test_gap_requires_resync(self):
        model = network_harness.ClientModel("test")
        model.install_snapshot({"stream_epoch": "e", "sequence": 2, "tracks": []})
        result = model.apply_delta(
            {"stream_epoch": "e", "base_sequence": 3, "sequence": 4, "track": {"track_id": "T"}}
        )
        self.assertEqual(result, "resync")
        self.assertEqual(model.sequence, 2)

    def test_snapshot_epoch_header_and_safe_cursor(self):
        parsed = network_harness.parse_snapshot(
            {"stream_sequence": 9, "covers_through": 7, "tracks": []},
            {"X-Sentinel-Epoch": "epoch-7"},
        )
        self.assertEqual(parsed["stream_epoch"], "epoch-7")
        self.assertEqual(parsed["sequence"], 7)

    def test_gateway_envelope_translation(self):
        kind, delta = network_harness.parse_gateway_message(
            {
                "transport_version": "sentinel-gateway/v1",
                "server_epoch": "e-1",
                "base_sequence": 3,
                "result_sequence": 4,
                "payload": {
                    "message_type": "track_delta",
                    "track": {"track_id": "T", "revision": 1},
                },
            }
        )
        self.assertEqual(kind, "delta")
        self.assertEqual(delta["stream_epoch"], "e-1")
        self.assertEqual(delta["sequence"], 4)

    def test_gateway_heartbeat_exposes_cursor(self):
        kind, heartbeat = network_harness.parse_gateway_message({
            "message_type": "gateway_heartbeat",
            "transport_version": "sentinel-gateway/v1",
            "server_epoch": "e-1",
            "current_sequence": 9,
            "emitted_at": "2026-09-26T00:00:00Z",
        })
        self.assertEqual(kind, "heartbeat")
        self.assertEqual(heartbeat["sequence"], 9)

    def test_gateway_delta_batch_parses_and_applies_every_ordered_item(self):
        def envelope(base, result):
            return {
                "transport_version": "sentinel-gateway/v1",
                "server_epoch": "e-1",
                "base_sequence": base,
                "result_sequence": result,
                "payload": {
                    "message_type": "track_delta",
                    "track": {"track_id": "T", "revision": result},
                },
            }

        kind, deltas = network_harness.parse_gateway_message({
            "message_type": "delta_batch",
            "transport_version": "sentinel-gateway/v1",
            "server_epoch": "e-1",
            "items": [envelope(2, 3), envelope(3, 4)],
        })
        self.assertEqual(kind, "delta_batch")
        model = network_harness.ClientModel("test")
        model.install_snapshot({"stream_epoch": "e-1", "sequence": 2, "tracks": []})
        self.assertEqual([model.apply_delta(item) for item in deltas], ["applied", "applied"])
        self.assertEqual(model.sequence, 4)

    def test_negotiated_gzip_batch_decodes_with_strict_bounds(self):
        batch = {
            "message_type": "delta_batch",
            "transport_version": "sentinel-gateway/v1",
            "items": [
                {"transport_version": "sentinel-gateway/v1", "server_epoch": "e-1",
                 "base_sequence": 0, "result_sequence": 1,
                 "payload": {"message_type": "track_delta", "track": {"track_id": "T"}}}
            ],
        }
        frame = network_harness.GZIP_BATCH_MAGIC + gzip.compress(json.dumps(batch).encode())
        decoded = network_harness.decode_gateway_frame(frame)
        kind, deltas = network_harness.parse_gateway_message(decoded)
        self.assertEqual(kind, "delta_batch")
        self.assertEqual(deltas[0]["sequence"], 1)

    def test_compressed_batch_rejects_unknown_magic_trailing_data_and_count(self):
        with self.assertRaisesRegex(ValueError, "unknown binary"):
            network_harness.decode_gateway_frame(b"nope")
        valid = gzip.compress(json.dumps({"message_type": "delta_batch", "items": []}).encode())
        with self.assertRaisesRegex(ValueError, "trailing"):
            network_harness.decode_gateway_frame(network_harness.GZIP_BATCH_MAGIC + valid + b"x")
        with self.assertRaisesRegex(ValueError, "count"):
            network_harness.parse_gateway_message({
                "message_type": "delta_batch", "transport_version": "sentinel-gateway/v1",
                "items": [{}] * (network_harness.DELTA_BATCH_MAX_COUNT + 1),
            })

    def test_gzip_observation_ack_batch_decodes_with_strict_bounds(self):
        ack = {"message_type": "observation_ack", "message_id": "m1", "accepted": True}
        batch = {"message_type": "observation_ack_batch", "encoding": "gzip-v1",
                 "items": [ack]}
        frame = network_harness.ACK_GZIP_BATCH_MAGIC + gzip.compress(
            json.dumps(batch).encode()
        )
        self.assertEqual(network_harness.decode_observation_ack_frame(frame), [ack])
        self.assertEqual(
            network_harness.decode_observation_ack_frame(json.dumps(ack)), [ack]
        )
        with self.assertRaisesRegex(ValueError, "trailing"):
            network_harness.decode_observation_ack_frame(frame + b"x")
        oversized = dict(batch, items=[ack] * (network_harness.ACK_BATCH_MAX_COUNT + 1))
        with self.assertRaisesRegex(ValueError, "item count"):
            network_harness.decode_observation_ack_frame(
                network_harness.ACK_GZIP_BATCH_MAGIC
                + gzip.compress(json.dumps(oversized).encode())
            )

    def test_monotonic_watchdog_covers_no_progress_and_queue_age(self):
        timeout = 100
        self.assertFalse(network_harness.monotonic_watchdog_expired(99, 0, None, timeout))
        self.assertTrue(network_harness.monotonic_watchdog_expired(100, 0, None, timeout))
        self.assertTrue(network_harness.monotonic_watchdog_expired(150, 100, 49, timeout))

    def test_wall_latency_is_diagnostic_and_clamped(self):
        applied = network_harness.datetime.fromisoformat("2026-09-26T00:00:01+00:00")
        self.assertEqual(
            network_harness.wall_latency_ms("2026-09-26T00:00:00Z", applied), 1000.0
        )
        self.assertEqual(
            network_harness.wall_latency_ms("2026-09-26T00:00:02Z", applied), 0.0
        )

    def test_wall_stale_fence_detects_continuous_old_backlog(self):
        received = network_harness.datetime.fromisoformat("2026-09-26T00:00:05+00:00")
        self.assertTrue(
            network_harness.wall_message_stale(
                "2026-09-26T00:00:01Z", received, stale_after_ms=3000
            )
        )
        self.assertFalse(
            network_harness.wall_message_stale(
                "2026-09-26T00:00:03Z", received, stale_after_ms=3000
            )
        )
        self.assertFalse(network_harness.wall_message_stale(None, received, 3000))

    def test_strict_observation_shape(self):
        item = network_harness.observation(0, 0, 7, 0)
        required = {
            "schema_version", "message_type", "message_id", "stream_id",
            "stream_sequence", "emitted_at", "correlation", "observation_id",
            "track_id", "source_id", "source_sequence", "source_time",
            "position", "velocity",
        }
        self.assertEqual(set(item), required)

    def test_gateway_command_wraps_preconditions(self):
        command = {"command_id": "c-1"}
        request = network_harness.gateway_command_request(command, "epoch-1", 4)
        self.assertEqual(request["transport_version"], "sentinel-gateway/v1")
        self.assertEqual(request["expected_epoch"], "epoch-1")
        self.assertEqual(request["expected_revision"], 4)
        self.assertIs(request["command"], command)

    def test_restart_command_keeps_semantic_identity_across_transport_fence(self):
        before = network_harness.command_fixture("epoch-before", 7)
        after = network_harness.gateway_command_request(
            before["command"], "epoch-after", 0
        )
        self.assertIs(before["command"], after["command"])
        self.assertEqual(before["command"]["command_id"], "harness-command-restart-1")
        self.assertNotEqual(before["expected_epoch"], after["expected_epoch"])

    def test_restart_outcome_is_correlated_and_single_effect(self):
        request = network_harness.command_fixture("epoch", 1)
        outcome = network_harness.outcome_fixture(request)
        self.assertEqual(outcome["status"], "succeeded")
        self.assertEqual(outcome["details"]["logical_effect_count"], 1)
        self.assertEqual(
            outcome["correlation"]["correlation_id"],
            request["command"]["correlation"]["correlation_id"],
        )

    def test_reconciliation_helpers_accept_wrapped_or_direct_receipt(self):
        self.assertEqual(
            network_harness.receipt_status({"receipt_status": "duplicate"}), "duplicate"
        )
        self.assertEqual(
            network_harness.receipt_status(
                {"receipt": {"receipt_status": "accepted"}}
            ),
            "accepted",
        )
        outcome = {"outcome_id": "o-1"}
        self.assertIs(
            network_harness.outcome_from_reconciliation({"outcome": outcome}), outcome
        )
        self.assertTrue(
            network_harness.outcome_matches_request(
                {"command_id": "c-1", "outcome_id": "o-1"}, outcome
            )
        )

    def test_dry_run_five_clients_gap_and_commands(self):
        args = SimpleNamespace(
            drones=3,
            hz=20,
            duration=0.5,
            seed=7,
            gap_fault=True,
            gap_at=7,
        )
        summary = asyncio.run(network_harness.run_dry(args))
        self.assertTrue(summary["checks"]["passed"])
        self.assertEqual(len(summary["clients"]), 5)
        self.assertTrue(all(item["converged"] for item in summary["clients"]))
        self.assertEqual(summary["clients"][4]["fault_drops"], 1)
        self.assertEqual(summary["commands"][2]["http_status"], 409)
        self.assertFalse(summary["is_network_performance_evidence"])
        self.assertEqual(summary["producer"]["accepted"], 30)

    def test_endpoint_latency_samples_remain_separate(self):
        args = SimpleNamespace(
            drones=3, hz=1, duration=1, seed=1, gap_fault=False, gap_at=7
        )
        clients = [network_harness.ClientModel(f"c-{i}") for i in range(5)]
        snap = {"stream_epoch": "e", "sequence": 0, "tracks": []}
        for client in clients:
            client.install_snapshot(snap)
        summary = network_harness.build_summary(
            args,
            "live",
            {},
            clients,
            1000,
            [(202, {"receipt_status": "accepted"}),
             (200, {"receipt_status": "duplicate"}),
             (409, {"error": "conflict"})],
            {"snapshot": [1.0], "observation": [2.0, 3.0], "command": [4.0]},
            {"intended": 3, "offered": 3, "accepted": 3, "rejected": 0},
        )
        self.assertEqual(summary["http_rtt_by_endpoint"]["snapshot"]["p50_ms"], 1.0)
        self.assertEqual(summary["http_rtt_by_endpoint"]["observation"]["p95_ms"], 3.0)

    def test_ingest_reconnect_replays_ordered_window_and_counts_unique_acks(self):
        class FakeSocket:
            def __init__(self, *, fail_second=False, acks=()):
                self.fail_second = fail_second
                self.acks = list(acks)
                self.sent = []
                self.closed = False

            async def recv(self):
                return json.dumps({"message_type": "observation_stream_hello"})

            async def send(self, frame):
                self.sent.append(frame)
                if self.fail_second and len(self.sent) == 2:
                    raise ConnectionError("deterministic loss")

            async def close(self):
                self.closed = True

            def __aiter__(self):
                return self

            async def __anext__(self):
                if not self.acks:
                    raise StopAsyncIteration
                return json.dumps(self.acks.pop(0))

        async def scenario():
            first = FakeSocket(fail_second=True)
            second = FakeSocket(acks=(
                {"message_type": "observation_ack", "message_id": "m1", "accepted": True},
                {"message_type": "observation_ack", "message_id": "m1", "accepted": True},
                {"message_type": "observation_ack", "message_id": "m2", "accepted": True},
            ))
            sockets = iter((first, second))

            async def connect(*_args, **_kwargs):
                return next(sockets)

            accounted = []
            stream = network_harness.ReliableObservationStream(
                "ws://test", connect=connect, window_size=2, max_queue=2,
                reconnect_backoff=0, on_ack=accounted.append,
            )
            deadline = asyncio.get_running_loop().time() + 1
            await stream.offer("m1", "frame-1", deadline)
            await stream.offer("m2", "frame-2", deadline)
            await stream.wait_complete(deadline)
            await stream.close()
            return stream, first, second, accounted

        stream, first, second, accounted = asyncio.run(scenario())
        self.assertEqual(first.sent, ["frame-1", "frame-2"])
        self.assertEqual(second.sent, ["frame-1", "frame-2"])
        self.assertEqual([ack["message_id"] for ack in accounted], ["m1", "m2"])
        self.assertEqual(stream.metrics.reconnects, 1)
        self.assertEqual(stream.metrics.resends, 2)
        self.assertEqual(stream.metrics.max_pending, 2)
        self.assertEqual(stream.metrics.duplicate_acks, 1)
        self.assertFalse(stream.pending)

    def test_ingest_reconnect_deadline_failure_is_explicit(self):
        async def scenario():
            async def connect(*_args, **_kwargs):
                raise ConnectionError("offline")

            stream = network_harness.ReliableObservationStream(
                "ws://test", connect=connect, window_size=1, max_queue=1,
                reconnect_backoff=0, on_ack=lambda _ack: None,
            )
            with self.assertRaisesRegex(RuntimeError, "reconnect deadline exhausted"):
                await stream.offer(
                    "m1", "frame-1", asyncio.get_running_loop().time() + 0.001
                )

        asyncio.run(scenario())

    def test_full_ingest_window_reconnects_when_ack_progress_stalls(self):
        class FakeSocket:
            def __init__(self, *, acks=(), hang=False, ack_on_send=None):
                self.acks = list(acks)
                self.hang = hang
                self.ack_on_send = ack_on_send or {}
                self.sent = []
                self.closed = False
                self.release = asyncio.Event()

            async def recv(self):
                return json.dumps({"message_type": "observation_stream_hello"})

            async def send(self, frame):
                self.sent.append(frame)
                ack = self.ack_on_send.get(frame)
                if ack is not None:
                    self.acks.append(ack)
                    self.release.set()

            async def close(self):
                self.closed = True
                self.release.set()

            def __aiter__(self):
                return self

            async def __anext__(self):
                if self.acks:
                    return json.dumps(self.acks.pop(0))
                if self.hang or self.ack_on_send:
                    await self.release.wait()
                    self.release.clear()
                    if self.acks:
                        return json.dumps(self.acks.pop(0))
                raise StopAsyncIteration

        async def scenario():
            first = FakeSocket(hang=True)
            second = FakeSocket(
                acks=({"message_type": "observation_ack", "message_id": "m1", "accepted": True},),
                ack_on_send={
                    "frame-2": {
                        "message_type": "observation_ack", "message_id": "m2", "accepted": True
                    }
                },
            )
            sockets = iter((first, second))

            async def connect(*_args, **_kwargs):
                return next(sockets)

            stream = network_harness.ReliableObservationStream(
                "ws://test", connect=connect, window_size=1, max_queue=1,
                reconnect_backoff=0, ack_progress_timeout=0.01,
                on_ack=lambda _ack: None,
            )
            deadline = asyncio.get_running_loop().time() + 1
            await stream.offer("m1", "frame-1", deadline)
            await stream.offer("m2", "frame-2", deadline)
            await stream.wait_complete(deadline)
            await stream.close()
            return stream, first, second

        stream, first, second = asyncio.run(scenario())
        self.assertTrue(first.closed)
        self.assertEqual(second.sent, ["frame-1", "frame-2"])
        self.assertEqual(stream.metrics.ack_progress_timeouts, 1)
        self.assertEqual(stream.metrics.reconnects, 1)
        self.assertEqual(stream.metrics.resends, 1)

    def test_final_ack_drain_reconnects_and_ack_identity_history_is_bounded(self):
        class FakeSocket:
            def __init__(self, *, hang=False):
                self.hang = hang
                self.sent = []
                self.closed = False
                self.release = asyncio.Event()
                self.acks = []

            async def recv(self):
                return json.dumps({"message_type": "observation_stream_hello"})

            async def send(self, frame):
                self.sent.append(frame)
                if not self.hang:
                    message_id = frame.removeprefix("frame-")
                    self.acks.append({
                        "message_type": "observation_ack",
                        "message_id": message_id,
                        "accepted": True,
                    })
                    self.release.set()

            async def close(self):
                self.closed = True
                self.release.set()

            def __aiter__(self):
                return self

            async def __anext__(self):
                while not self.acks:
                    if self.closed:
                        raise StopAsyncIteration
                    await self.release.wait()
                    self.release.clear()
                return json.dumps(self.acks.pop(0))

        async def scenario():
            first = FakeSocket(hang=True)
            second = FakeSocket()
            sockets = iter((first, second))

            async def connect(*_args, **_kwargs):
                return next(sockets)

            stream = network_harness.ReliableObservationStream(
                "ws://test", connect=connect, window_size=2, max_queue=2,
                reconnect_backoff=0, ack_progress_timeout=0.01,
                on_ack=lambda _ack: None,
            )
            deadline = asyncio.get_running_loop().time() + 1
            await stream.offer("m1", "frame-m1", deadline)
            await stream.wait_complete(deadline)
            # Add enough subsequent identities to prove the duplicate-ACK
            # suppression history cannot grow with trial duration.
            for index in range(2, 9):
                message_id = f"m{index}"
                await stream.offer(message_id, f"frame-{message_id}", deadline)
                await stream.wait_complete(deadline)
            retained = set(stream.acked_ids)
            await stream.close()
            return stream, first, second, retained

        stream, first, second, retained = asyncio.run(scenario())
        self.assertTrue(first.closed)
        self.assertEqual(stream.metrics.ack_progress_timeouts, 1)
        self.assertEqual(stream.metrics.reconnects, 1)
        self.assertEqual(len(retained), 4)
        self.assertNotIn("m1", retained)
        self.assertEqual(retained, {"m5", "m6", "m7", "m8"})


if __name__ == "__main__":
    unittest.main()
