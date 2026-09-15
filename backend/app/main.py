import os
import asyncio
from contextlib import suppress
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, JSONResponse
from pydantic import TypeAdapter

from app.api import missions, stream, interactive, voice
from app.commands.service import InteractiveService, CommandError
from fastapi.exceptions import RequestValidationError
from app.missions.fixtures import seed_fixtures
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.world.contracts import StreamMessage
from app.world.serialization import elapsed_utc_clock
from app.voice import load_local_voice_environment


def create_app(db_path: str | None = None, fixtures_enabled: bool | None = None, heartbeat_seconds: float = 5, demo_enabled: bool | None = None) -> FastAPI:
    load_local_voice_environment()
    path = db_path or os.environ.get("SENTINEL_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "sentinel.sqlite3"))
    fixtures = os.environ.get("SENTINEL_FIXTURES") == "1" if fixtures_enabled is None else fixtures_enabled

    demo = os.environ.get("SENTINEL_DEMO") == "1" if demo_enabled is None else demo_enabled

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        repository = RecordingRepository(path)
        application.state.service = MissionService(repository, clock=elapsed_utc_clock())
        application.state.fixtures_enabled = fixtures
        application.state.heartbeat_seconds = heartbeat_seconds
        application.state.interactive = InteractiveService(application.state.service, demo)
        async def source_loop():
            while True:
                await asyncio.sleep(.2)
                try:
                    await application.state.interactive.tick()
                except sqlite3.Error:
                    # No candidate was adopted. Existing lastReportAt exposes the stall.
                    continue
        runner = None
        try:
            await application.state.interactive.recover()
            if fixtures:
                await seed_fixtures(application.state.service)
            runner = asyncio.create_task(source_loop())
            yield
        finally:
            if runner:
                runner.cancel()
                with suppress(asyncio.CancelledError):
                    await runner
            repository.close()

    application = FastAPI(title="Sentinel world authority", version="1.1.0", lifespan=lifespan)
    application.include_router(missions.router)
    application.include_router(stream.router)
    application.include_router(interactive.router)
    application.include_router(voice.router)

    @application.middleware("http")
    async def prevent_cached_authority(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(sqlite3.Error)
    async def storage_failure(request: Request, error: sqlite3.Error):
        # Do not expose filesystem/database internals; failed writes never publish.
        return JSONResponse(status_code=503, content={"detail": "Authoritative recording unavailable; no change was committed"})

    @application.exception_handler(CommandError)
    async def command_error(request: Request, error: CommandError):
        return JSONResponse(status_code=error.status, content={"code": error.code, "message": error.message})

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
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
    frontend_dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'

    @application.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        target = (frontend_dist / path).resolve()
        if frontend_dist.is_dir() and target.is_relative_to(frontend_dist) and target.is_file():
            return FileResponse(target)
        index = frontend_dist / 'index.html'
        if index.is_file():
            return FileResponse(index)
        return JSONResponse(status_code=404, content={'detail': 'Frontend build unavailable.'})
    return application


app = create_app()
