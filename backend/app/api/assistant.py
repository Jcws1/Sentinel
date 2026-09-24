import asyncio
import time
from collections import deque

from fastapi import APIRouter, HTTPException, Request

from app.assistant.contracts import AssessmentRequest, SituationAssessment
from app.assistant.service import AssistantInvalidOutput, AssistantUnavailable
from app.assistant.tasking import TaskingRequest, TaskingAdvice, generate as generate_tasking

router = APIRouter(prefix="/api")
_admission_lock = asyncio.Lock()
_recent_requests: deque[float] = deque()


async def _admit_public_assessment() -> None:
    """Bound public demo inference spend without weakening evidence checks."""
    now = time.monotonic()
    async with _admission_lock:
        while _recent_requests and _recent_requests[0] <= now - 60:
            _recent_requests.popleft()
        if len(_recent_requests) >= 12:
            raise HTTPException(429, "Observe/Orient demo rate limit reached; retry shortly")
        _recent_requests.append(now)


@router.post("/missions/{mission_id:path}/observe-orient", response_model=SituationAssessment,
             response_model_exclude_none=True,
             description="Read-only, evidence-grounded Observe/Orient assessment of one exact committed frame.")
async def observe_orient(mission_id: str, body: AssessmentRequest, request: Request):
    await _admit_public_assessment()
    try:
        frame = request.app.state.service.read(mission_id)
    except KeyError:
        raise HTTPException(404, "Mission has no committed frame")
    if frame.frame_id != body.frame_id:
        raise HTTPException(409, "Requested frame is no longer current; review the new frame before assessing")
    try:
        return await request.app.state.observe_orient.assess(frame, body)
    except AssistantUnavailable as error:
        raise HTTPException(503, str(error))
    except AssistantInvalidOutput as error:
        raise HTTPException(502, str(error))


@router.post("/missions/{mission_id:path}/tasking-advice", response_model=TaskingAdvice,
             response_model_exclude_none=True,
             description="Read-only deterministic Monitor, Respond, Support candidates for one exact frame.")
async def tasking_advice(mission_id: str, body: TaskingRequest, request: Request):
    try:
        frame = request.app.state.service.read(mission_id)
    except KeyError:
        raise HTTPException(404, "Mission has no committed frame")
    if frame.frame_id != body.frame_id:
        raise HTTPException(409, "Requested frame is no longer current; refresh tasking advice")
    return generate_tasking(frame, body, request.app.state.service.clock())
