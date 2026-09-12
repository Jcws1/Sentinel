from fastapi import APIRouter, HTTPException, Query, Request
from app.domain.models import MissionList, WorldFrame, EventList, RecordingMetadata, AdvanceFixtureRequest
from app.missions.fixtures import advance_fixture
from app.missions.service import SequenceConflict

router = APIRouter(prefix="/api")


@router.get("/missions", response_model=MissionList, response_model_exclude_none=True)
async def missions(request: Request):
    return MissionList(schema_version="1.0", missions=request.app.state.service.repository.list_missions(),
                       fixture_advance_enabled=request.app.state.fixtures_enabled)


# ASGI decodes %2F before route matching. A path converter preserves generic
# identifiers containing slashes; the explicit suffix still selects the read.
@router.get("/missions/{mission_id:path}/world", response_model=WorldFrame, response_model_exclude_none=True)
async def world(mission_id: str, request: Request):
    try:
        return request.app.state.service.read(mission_id)
    except KeyError:
        raise HTTPException(404, "Mission has no committed frame")


@router.get("/missions/{mission_id:path}/events", response_model=EventList, response_model_exclude_none=True)
async def events(mission_id: str, request: Request, after: int = Query(-1, ge=-1, le=9007199254740991), limit: int = Query(100, ge=1, le=500)):
    try:
        rows = request.app.state.service.repository.events_after(mission_id, after, limit)
        return EventList(schema_version="1.0", mission_id=mission_id, events=rows, next_after=rows[-1].sequence if rows else None)
    except KeyError:
        raise HTTPException(404, "Mission not found")


@router.get("/recordings/{recording_id:path}", response_model=RecordingMetadata, response_model_exclude_none=True)
async def recording(recording_id: str, request: Request):
    try:
        return request.app.state.service.repository.metadata(recording_id)
    except KeyError:
        raise HTTPException(404, "Recording not found")


@router.post("/fixtures/{mission_id}/advance", response_model=WorldFrame, response_model_exclude_none=True,
             description="Opt-in synthetic fixture only. Advances one deterministic test sample; not an operational or simulation command.")
async def advance(mission_id: str, command: AdvanceFixtureRequest, request: Request):
    if not request.app.state.fixtures_enabled:
        raise HTTPException(404, "Synthetic fixture source is disabled")
    try:
        return await advance_fixture(request.app.state.service, mission_id, command.expected_sequence)
    except KeyError:
        raise HTTPException(404, "Synthetic fixture mission not found")
    except SequenceConflict as error:
        raise HTTPException(409, str(error))
