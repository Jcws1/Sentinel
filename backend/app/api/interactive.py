import re
from fastapi import APIRouter, Request
from app.commands.contracts import CommandRequest, CreateRunRequest, DemoEntry, Intent, IntentRequest, Receipt, RunRead
from app.commands.service import CommandError

router = APIRouter(prefix="/api/interactive", tags=["local synthetic demo"])


def credential(request):
    value = request.headers.get("X-Sentinel-Control")
    if value is not None and not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", value):
        raise CommandError("INVALID_REQUEST", "Invalid private credential format.", 400)
    return value


@router.get("/entry", response_model=DemoEntry, response_model_exclude_none=True)
async def entry(request: Request):
    return request.app.state.interactive.entry()


@router.post("/runs", response_model=Receipt, response_model_exclude_none=True)
async def create(command: CreateRunRequest, request: Request):
    return await request.app.state.interactive.create(command)


# Query lookups preserve every opaque ID, including URL dot segments. Keep path aliases.
@router.get("/creations", response_model=Receipt, response_model_exclude_none=True)
@router.get("/creations/{identity:path}", response_model=Receipt, response_model_exclude_none=True, deprecated=True)
async def creation_receipt(identity: str, request: Request):
    return request.app.state.interactive.lookup(identity)


@router.get("/{mission_id}/status", response_model=RunRead, response_model_exclude_none=True)
async def status(mission_id: str, request: Request):
    return request.app.state.interactive.status(mission_id, credential(request))


@router.post("/{mission_id}/intents", response_model=Intent, response_model_exclude_none=True)
async def intent(mission_id: str, command: IntentRequest, request: Request):
    return await request.app.state.interactive.issue_intent(mission_id, command.action)


@router.post("/{mission_id}/commands", response_model=Receipt, response_model_exclude_none=True)
async def command(mission_id: str, command: CommandRequest, request: Request):
    return await request.app.state.interactive.command(mission_id, command, credential(request))


@router.get("/{mission_id}/receipts", response_model=Receipt, response_model_exclude_none=True)
@router.get("/{mission_id}/receipts/{identity:path}", response_model=Receipt, response_model_exclude_none=True, deprecated=True)
async def receipt(mission_id: str, identity: str, request: Request):
    return request.app.state.interactive.lookup(identity, mission_id)
