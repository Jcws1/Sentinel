import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter

from app.api import missions, stream
from app.missions.fixtures import seed_fixtures
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.world.contracts import StreamMessage


def create_app(db_path: str | None = None, fixtures_enabled: bool | None = None, heartbeat_seconds: float = 5) -> FastAPI:
    path = db_path or os.environ.get("SENTINEL_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "sentinel.sqlite3"))
    fixtures = os.environ.get("SENTINEL_FIXTURES") == "1" if fixtures_enabled is None else fixtures_enabled

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        repository = RecordingRepository(path)
        application.state.service = MissionService(repository)
        application.state.fixtures_enabled = fixtures
        application.state.heartbeat_seconds = heartbeat_seconds
        try:
            if fixtures:
                await seed_fixtures(application.state.service)
            yield
        finally:
            repository.close()

    application = FastAPI(title="Sentinel world authority", version="1.0.0", lifespan=lifespan)
    application.include_router(missions.router)
    application.include_router(stream.router)

    @application.middleware("http")
    async def prevent_cached_authority(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(sqlite3.Error)
    async def storage_failure(request: Request, error: sqlite3.Error):
        # Do not expose filesystem/database internals; failed writes never publish.
        return JSONResponse(status_code=503, content={"detail": "Authoritative recording unavailable; no change was committed"})

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
