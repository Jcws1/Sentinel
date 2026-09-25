from fastapi import APIRouter, Request
from app.observability import log_receipt
from app.scenarios.contracts import ScenarioWrite, ScenarioReceipt, ScenarioRevision, ScenarioList
from app.scenarios.contracts import ScenarioRef
from app.scenarios.review import ScenarioReview

router = APIRouter(prefix="/api/scenarios", tags=["local scenario authoring"])

@router.get("", response_model=ScenarioList, response_model_exclude_none=True)
async def catalog(request: Request):
    return request.app.state.scenarios.list()

@router.post("", response_model=ScenarioReceipt, response_model_exclude_none=True)
async def create(body: ScenarioWrite, request: Request):
    receipt = await request.app.state.scenarios.write(body)
    return log_receipt(request.app.state.telemetry, receipt, "scenario")

@router.get("/creations", response_model=ScenarioReceipt, response_model_exclude_none=True)
async def creation_receipt(identity: str, request: Request):
    return request.app.state.scenarios.lookup(identity)

@router.post("/validate", response_model=ScenarioReview, response_model_exclude_none=True)
async def validate(body: ScenarioRef, request: Request):
    result = await request.app.state.scenarios.review_async(body)
    request.app.state.telemetry.event("scenario.reviewed", definition_id=result.reference.definition_id,
                                    revision=result.reference.revision, unit_count=result.counts.total,
                                    accepted=result.can_run, issue_codes=[issue.code for issue in result.issues])
    return result

@router.get("/{definition_id}", response_model=ScenarioRevision, response_model_exclude_none=True)
async def read(definition_id: str, request: Request, revision: int | None = None):
    return request.app.state.scenarios.get(definition_id, revision)

@router.post("/{definition_id}/revisions", response_model=ScenarioReceipt, response_model_exclude_none=True)
async def save(definition_id: str, body: ScenarioWrite, request: Request):
    receipt = await request.app.state.scenarios.write(body, definition_id)
    return log_receipt(request.app.state.telemetry, receipt, "scenario")

@router.get("/{definition_id}/receipts", response_model=ScenarioReceipt, response_model_exclude_none=True)
async def receipt(definition_id: str, identity: str, request: Request):
    return request.app.state.scenarios.lookup(identity, definition_id)
