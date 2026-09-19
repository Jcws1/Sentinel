import re
from fastapi import APIRouter, Request
from app.commands.contracts import CommandRequest, CreateRunRequest, DemoEntry, Intent, IntentRequest, ReceiptRead, RunRead, MoveRequest, DirectMoveRequest, ExecutionRead, RecommendationRequest, RecommendationSet
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


@router.post("/runs", response_model=ReceiptRead, response_model_exclude_none=True)
async def create(command: CreateRunRequest, request: Request):
    return await request.app.state.interactive.create(command)


# Query lookups preserve every opaque ID, including URL dot segments. Keep path aliases.
@router.get("/creations", response_model=ReceiptRead, response_model_exclude_none=True)
@router.get("/creations/{identity:path}", response_model=ReceiptRead, response_model_exclude_none=True, deprecated=True)
async def creation_receipt(identity: str, request: Request):
    return request.app.state.interactive.lookup(identity)


@router.get("/{mission_id}/status", response_model=RunRead, response_model_exclude_none=True)
async def status(mission_id: str, request: Request):
    return request.app.state.interactive.status(mission_id, credential(request))


@router.post("/{mission_id}/intents", response_model=Intent, response_model_exclude_none=True)
async def intent(mission_id: str, command: IntentRequest, request: Request):
    return await request.app.state.interactive.issue_intent(mission_id, command.action, command.execution_id, command.members, command.order, command.boundary, command.policy, command.recommendation)


@router.post("/{mission_id}/recommendations", response_model=RecommendationSet, response_model_exclude_none=True)
async def recommendations(mission_id: str, selection: RecommendationRequest, request: Request):
    # POST carries a bounded selection; this endpoint never writes authoritative state.
    return await request.app.state.interactive.suggest(mission_id, selection, credential(request))


@router.post("/{mission_id}/commands", response_model=ReceiptRead, response_model_exclude_none=True)
async def command(mission_id: str, command: CommandRequest, request: Request):
    return await request.app.state.interactive.command(mission_id, command, credential(request))


@router.get("/{mission_id}/receipts", response_model=ReceiptRead, response_model_exclude_none=True)
@router.get("/{mission_id}/receipts/{identity:path}", response_model=ReceiptRead, response_model_exclude_none=True, deprecated=True)
async def receipt(mission_id: str, identity: str, request: Request):
    return request.app.state.interactive.lookup(identity, mission_id)


@router.post("/{mission_id}/moves", response_model=ReceiptRead, response_model_exclude_none=True)
async def move(mission_id: str, command: MoveRequest, request: Request):
    return await request.app.state.interactive.move(mission_id, command, credential(request))


@router.get("/{mission_id}/executions", response_model=ExecutionRead, response_model_exclude_none=True)
async def executions(mission_id: str, request: Request, throughFrameId: str | None = None):
    return request.app.state.interactive.executions(mission_id, throughFrameId)


@router.post("/{mission_id}/direct-moves", response_model=ReceiptRead, response_model_exclude_none=True)
async def direct_move(mission_id: str, command: DirectMoveRequest, request: Request):
    return await request.app.state.interactive.direct_move(mission_id, command, credential(request))
