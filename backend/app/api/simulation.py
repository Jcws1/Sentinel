"""Frozen external JSON endpoint plus separate typed Sentinel module reads."""
import json
import re
import sqlite3
import logging

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from app.simulation.contracts import SimulationRunStatus, SimulationCommandSummary
from app.simulation.validation import SimulationError, parse_request

router = APIRouter(prefix="/api/simulation/v1", tags=["simulation compatibility"])


def failure(raw, error):
    """C05 provisional fallback only when a conforming identity cannot be read."""
    minimal = dict(error=dict(code=error.code, path=error.path, message=error.message))
    try:
        value = parse_request(raw)
        mission, command, profile = value["mission_id"], value["command"]["command_id"], value["calibration_profile"]
        if any(not isinstance(item, str) or not re.fullmatch(r"[!-~](?:[ -~]*[!-~])?", item) or len(item) > 128 for item in (mission, command)):
            return minimal
        if any(not isinstance(profile[key], str) or not profile[key] for key in ("profile_id", "version")) or profile["evidence_status"] not in ("NOTIONAL", "PUBLIC_PARTIAL", "VALIDATED"):
            return minimal
        return dict(schema_version="1.0", mission_id=mission,
            command_ack=dict(command_id=command, status="REJECTED", run_status="FAILED", error_code=error.code, error_path=error.path, error_message=error.message),
            calibration={key: profile[key] for key in ("profile_id", "version", "evidence_status")}, results_by_timestamp={})
    except (SimulationError, KeyError, TypeError):
        return minimal


@router.post("/commands", response_class=Response)
async def submit(request: Request):
    raw = await request.body()
    try:
        result = await request.app.state.simulation.submit(raw)
        return Response(result, media_type="application/json")
    except SimulationError as error:
        request.app.state.telemetry.event("request.rejected", level=logging.WARNING, code=error.code, http_status=error.status)
        return Response(json.dumps(failure(raw, error), ensure_ascii=True, allow_nan=False), media_type="application/json", status_code=error.status)
    except sqlite3.Error as error:
        request.app.state.telemetry.event("recording.failed", level=logging.ERROR, error_type=type(error).__name__, pending=True)
        # Preparation might already have committed. Never falsely report rollback
        # of the entire command or acknowledge a result that has not committed.
        return JSONResponse(dict(error=dict(code="RECORDING_UNAVAILABLE", path="",
            message="Recording unavailable; command outcome may be pending. Retry the exact command identity and body.")), status_code=503)


@router.get("/runs", response_model=list[SimulationRunStatus], response_model_exclude_none=True)
async def runs(request: Request):
    return request.app.state.simulation.statuses()


@router.get("/runs/{mission_id}", response_model=SimulationRunStatus, response_model_exclude_none=True)
async def status(mission_id: str, request: Request):
    try:
        return request.app.state.simulation.status(mission_id)
    except KeyError:
        raise HTTPException(404, "External simulation run not found") from None


@router.get("/command-result", response_class=Response)
@router.get("/commands/{command_id:path}/result", response_class=Response, deprecated=True)
async def result(command_id: str, request: Request):
    command = request.app.state.simulation.journal.command(command_id)
    if command is None:
        raise HTTPException(404, "External command not found")
    if command["state"] != "completed":
        raise HTTPException(409, "Command is interrupted or processing; retry its exact original body")
    return Response(command["response_json"], media_type="application/json")


@router.get("/runs/{mission_id}/input", response_class=Response)
async def input_for_run(mission_id: str, request: Request):
    run = request.app.state.simulation.journal.run(mission_id)
    if run is None:
        raise HTTPException(404, "External simulation run not found")
    command = request.app.state.simulation.journal.command(run.command_id)
    if command is None:
        raise sqlite3.DatabaseError("Run command is missing")
    return Response(command["original_request"], media_type="application/json")


@router.get("/runs/{mission_id}/commands", response_model=list[SimulationCommandSummary], response_model_exclude_none=True)
async def command_page(mission_id: str, request: Request, after: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)):
    try:
        request.app.state.simulation.status(mission_id)
    except KeyError:
        raise HTTPException(404, "External simulation run not found") from None
    return request.app.state.simulation.journal.commands(mission_id, after, limit)
