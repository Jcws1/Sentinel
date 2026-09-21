from fastapi import APIRouter, HTTPException, Request
from app.recording.analytics import AuditPage, AuditQuery, read_audit

router = APIRouter(prefix="/api")


@router.post("/missions/{mission_id:path}/audit-query", response_model=AuditPage, response_model_exclude_none=True,
             description="Read-only bounded operational audit. Recording-time range and immutable frame cutoff; never changes viewing time.")
def audit(mission_id: str, query: AuditQuery, request: Request):
    try:
        return read_audit(request.app.state.service.repository, mission_id, query)
    except KeyError:
        raise HTTPException(404, "Committed mission frame not found")
    except ValueError as error:
        raise HTTPException(422, str(error))
