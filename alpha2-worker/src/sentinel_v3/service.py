from __future__ import annotations

from argparse import ArgumentParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
import json

from .worker import Alpha2Engine, CONTRACT_VERSION, MODEL_VERSION, response_json


class WorkerMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self.requests = 0
        self.failures = 0
        self.worker_total_ms = 0.0

    def record(self, result: dict[str, Any]) -> None:
        with self._lock:
            self.requests += 1
            if result.get("error"):
                self.failures += 1
            else:
                self.worker_total_ms += float(
                    result.get("timing_ms", {}).get("worker_total", 0.0)
                )

    def view(self, engine: Alpha2Engine) -> dict[str, Any]:
        with self._lock:
            return {
                "schema": "sentinel.alpha2-worker-metrics/v1",
                "model_version": MODEL_VERSION,
                "artifact_sha256": engine.artifact_sha256,
                "requests": self.requests,
                "failures": self.failures,
                "worker_total_ms_sum": self.worker_total_ms,
            }


def handler_for(engine: Alpha2Engine) -> type[BaseHTTPRequestHandler]:
    metrics = WorkerMetrics()

    class Handler(BaseHTTPRequestHandler):
        server_version = "SentinelAlpha2/3.0.0-alpha.2"

        def _write(self, status: HTTPStatus, body: dict[str, Any] | bytes) -> None:
            encoded = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802 - stdlib callback name
            if self.path == "/metrics":
                self._write(HTTPStatus.OK, metrics.view(engine))
                return
            if self.path != "/health":
                self._write(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            self._write(HTTPStatus.OK, {
                "ready": True,
                "contract_version": CONTRACT_VERSION,
                "model_version": MODEL_VERSION,
                "artifact_sha256": engine.artifact_sha256,
                "authority": "non_authoritative_decision_support",
            })

        def do_POST(self) -> None:  # noqa: N802 - stdlib callback name
            if self.path != "/v1/infer":
                self._write(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._write(HTTPStatus.BAD_REQUEST, {"error": "invalid_length"})
                return
            if length <= 0 or length > 1_048_576:
                self._write(HTTPStatus.BAD_REQUEST, {"error": "invalid_length"})
                return
            result = response_json(engine, self.rfile.read(length))
            decoded = json.loads(result)
            metrics.record(decoded)
            status = HTTPStatus.BAD_REQUEST if decoded.get("error") else HTTPStatus.OK
            self._write(status, result)

        def log_message(self, format: str, *args: object) -> None:
            return

    return Handler


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument(
        "--artifact",
        type=Path,
        default=Path(__file__).parents[2]
        / "artifacts"
        / "sentinel_level3_v3_alpha2.joblib",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8091)
    args = parser.parse_args()
    engine = Alpha2Engine.load(args.artifact)
    print(json.dumps({
        "event": "alpha2_worker_ready",
        "model_version": MODEL_VERSION,
        "artifact_sha256": engine.artifact_sha256,
        "contract_version": CONTRACT_VERSION,
        "authority": "non_authoritative_decision_support",
    }), flush=True)
    server = ThreadingHTTPServer((args.host, args.port), handler_for(engine))
    server.serve_forever()


if __name__ == "__main__":
    main()
