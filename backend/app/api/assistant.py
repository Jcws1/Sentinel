from fastapi import APIRouter, HTTPException, Request

from app.assistant.contracts import AssessmentRequest, SituationAssessment
from app.assistant.service import AssistantInvalidOutput, AssistantUnavailable

router = APIRouter(prefix="/api")


@router.post("/missions/{mission_id:path}/observe-orient", response_model=SituationAssessment,
             response_model_exclude_none=True,
             description="Read-only, evidence-grounded Observe/Orient assessment of one exact committed frame.")
async def observe_orient(mission_id: str, body: AssessmentRequest, request: Request):
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
