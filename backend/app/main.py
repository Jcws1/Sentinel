import os
import asyncio
import logging
import time
from contextlib import suppress
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter

from app.api import missions, stream, interactive, scenarios, simulation, analytics
from app.simulation.service import SimulationService
from app.scenarios.service import ScenarioService
from app.commands.service import InteractiveService, CommandError
from fastapi.exceptions import RequestValidationError
from app.missions.fixtures import seed_fixtures
from app.missions.service import MissionService
from app.observability import Telemetry, TRACE_ID
from app.recording.sqlite_repository import RecordingRepository
from app.world.contracts import StreamMessage
from app.world.serialization import elapsed_utc_clock


def create_app(db_path: str | None = None, fixtures_enabled: bool | None = None, heartbeat_seconds: float = 5, demo_enabled: bool | None = None) -> FastAPI:
    path = db_path or os.environ.get("SENTINEL_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "sentinel.sqlite3"))
    fixtures = os.environ.get("SENTINEL_FIXTURES") == "1" if fixtures_enabled is None else fixtures_enabled
    demo = os.environ.get("SENTINEL_DEMO") == "1" if demo_enabled is None else demo_enabled

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        telemetry = Telemetry(os.environ.get("SENTINEL_LOG_DIR"), console=os.environ.get("SENTINEL_LOG_CONSOLE") != "0")
        application.state.telemetry = telemetry
        repository, runner, ready = None, None, False
        try:
            repository = RecordingRepository(path)
            application.state.service = MissionService(repository, clock=elapsed_utc_clock(), telemetry=telemetry)
            application.state.fixtures_enabled = fixtures
            application.state.heartbeat_seconds = heartbeat_seconds
            application.state.interactive = InteractiveService(application.state.service, demo)
            application.state.scenarios = ScenarioService(application.state.service, demo)
            application.state.simulation = SimulationService(application.state.service, os.environ.get("SENTINEL_CALIBRATION_REPORTS"))

            async def source_loop():
                loop = asyncio.get_running_loop()
                previous = None
                while True:
                    started = loop.time()
                    if previous is not None:
                        interval = (started - previous) * 1000
                        telemetry.timing("source.interval", interval)
                        if interval > 1000:
                            telemetry.event("source.delayed", level=logging.WARNING, min_interval=5,
                                            interval_ms=round(interval, 3), gap_ms=round(max(0, interval - 200), 3))
                    previous = started
                    tick_started = time.perf_counter()
                    try:
                        await application.state.interactive.tick()
                    except sqlite3.Error as error:
                        # No candidate was adopted. Existing lastReportAt exposes the stall.
                        telemetry.event("source.recording_failed", level=logging.ERROR, min_interval=5,
                                        error_type=type(error).__name__)
                    finally:
                        telemetry.timing("source.tick", (time.perf_counter() - tick_started) * 1000)
                    # Fixed simulation steps, compensated wall cadence, no catch-up burst.
                    await asyncio.sleep(max(.001, .2 - (loop.time() - started)))

            await application.state.interactive.recover()
            await application.state.simulation.recover()
            telemetry.event("application.recovered")
            if fixtures:
                await seed_fixtures(application.state.service)
            runner = asyncio.create_task(source_loop())
            ready = True
            telemetry.event("application.started", demo_enabled=demo, fixtures_enabled=fixtures)
            yield
        except BaseException as error:
            if not ready:
                telemetry.event("application.start_failed", level=logging.ERROR, error_type=type(error).__name__)
            raise
        finally:
            telemetry.event("application.stopping")
            try:
                if runner:
                    runner.cancel()
                    with suppress(asyncio.CancelledError):
                        await runner
                if hasattr(application.state, "scenarios"):
                    await application.state.scenarios.close()
                if hasattr(application.state, "simulation"):
                    await application.state.simulation.close()
                if repository:
                    repository.close()
            finally:
                telemetry.close()

    application = FastAPI(title="Sentinel world authority", version="1.10.0", lifespan=lifespan)
    application.include_router(missions.router)
    application.include_router(stream.router)
    application.include_router(interactive.router)
    application.include_router(scenarios.router)
    application.include_router(simulation.router)
    application.include_router(analytics.router)

    @application.get("/api/diagnostics/metrics", include_in_schema=False)
    async def local_metrics():
        # Process diagnostics, deliberately outside the frozen mission contract.
        return application.state.telemetry.metrics()

    @application.middleware("http")
    async def prevent_cached_authority(request: Request, call_next):
        telemetry = getattr(request.app.state, "telemetry", None)
        trace = uuid4().hex
        token = TRACE_ID.set(trace)
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Sentinel-Trace"] = trace
            return response
        except BaseException as error:
            if telemetry:
                telemetry.event("http.failed", level=logging.ERROR, method=request.method,
                                error_type=type(error).__name__)
            raise
        finally:
            if telemetry:
                # Route templates avoid logging IDs, query strings or unknown URLs.
                route = getattr(request.scope.get("route"), "path", "unmatched")
                duration = (time.perf_counter() - started) * 1000
                telemetry.count(f"http.status.{status}")
                telemetry.timing(f"http.{request.method}.{route}", duration)
                if request.method != "GET" or status >= 400:
                    telemetry.event("http.completed", level=logging.WARNING if status >= 400 else logging.INFO,
                                    method=request.method, route=route, http_status=status,
                                    duration_ms=round(duration, 3))
            TRACE_ID.reset(token)

    @application.exception_handler(sqlite3.Error)
    async def storage_failure(request: Request, error: sqlite3.Error):
        request.app.state.telemetry.event("recording.failed", level=logging.ERROR, error_type=type(error).__name__)
        # Do not expose filesystem/database internals; failed writes never publish.
        return JSONResponse(status_code=503, content={"detail": "Authoritative recording unavailable; no change was committed"})

    @application.exception_handler(CommandError)
    async def command_error(request: Request, error: CommandError):
        request.app.state.telemetry.event("request.rejected", level=logging.WARNING, code=error.code, http_status=error.status)
        return JSONResponse(status_code=error.status, content={"code": error.code, "message": error.message})

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
        request.app.state.telemetry.event("request.rejected", level=logging.WARNING, code="INVALID_REQUEST", http_status=422)
        # Never echo malformed input or private headers into diagnostics.
        return JSONResponse(status_code=422, content={"code": "INVALID_REQUEST", "message": "Request does not match the published contract."})

    def openapi():
        if application.openapi_schema is None:
            schema = get_openapi(title=application.title, version=application.version, routes=application.routes)
            definitions = TypeAdapter(StreamMessage).json_schema(ref_template="#/components/schemas/{model}").get("$defs", {})
            schema.setdefault("components", {}).setdefault("schemas", {}).update(definitions)
            schema["x-sentinel-websocket"] = {"path": "/api/missions/{mission_id}/stream", "schema": "stream.schema.json",
                                              "initial": "atomic snapshot on every connection", "heartbeatSeconds": 5}
            application.openapi_schema = schema
        return application.openapi_schema

    application.openapi = openapi
    return application


app = create_app()
