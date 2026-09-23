"""Read-only adapter for telemetry sampled from the hosted Wedgetail viewer.

This endpoint never commands or simulates an engagement.  It accepts observed
viewer state and projects the viewer's schematic coordinates onto Sentinel's
map so that the two UIs can be shown together.
"""
import copy
import math
from typing import Literal

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.domain.models import Mission

NS = "wedgetail.viewer-observation"


class ViewerObject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    side: Literal["friendly", "hostile"]
    state: Literal["bay", "launching", "flying", "intercepted", "hit", "lost", "expended", "cleared"]
    position: tuple[float, float, float]
    target: str | None = Field(default=None, max_length=128)


class ViewerObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str = Field(alias="runId", min_length=1, max_length=128)
    at: str
    viewer_url: HttpUrl = Field(alias="viewerUrl")
    mission_name: str = Field(alias="missionName", default="Wedgetail live API · hosted simulator", min_length=1, max_length=128)
    sim_state: str = Field(alias="simState", max_length=128)
    stats: dict[str, int | float | str | bool | None]
    objects: list[ViewerObject] = Field(max_length=64)


def _position(value: tuple[float, float, float]):
    return {
        "longitudeDeg": 103.85 + value[0] * 5 / (111320 * math.cos(math.radians(1.29))),
        "latitudeDeg": 1.29 - value[2] * 5 / 111320,
        "altitude": {"metres": value[1] * 5, "reference": "ELLIPSOID", "datumId": "WGS84"},
    }


def install_wedgetail_observation(app):
    @app.post("/api/wedgetail/observation")
    async def observation(payload: ViewerObservation, request: Request):
        mid, at = payload.run_id, payload.at
        service = request.app.state.service
        source = {
            "id": "wedgetail-hosted-viewer",
            "kind": "simulation",
            "mode": "live",
            "externalId": str(payload.viewer_url),
        }
        mission = Mission.model_validate({
            "id": mid,
            "name": payload.mission_name,
            "domain": "wedgetail-sandbox-viewer-observation",
            "lifecycle": "active",
            "createdAt": at,
            "updatedAt": at,
            "referencePoint": _position((0, 0, 100)),
            "extensions": {NS: {
                "projection": "Schematic viewer coordinates, 5 m per world unit; not surveyed GPS",
                "authority": "Unmodified hosted simulator; read-only observed telemetry",
            }},
        })
        await service.establish(mission)

        def build(previous):
            frame = copy.deepcopy(previous) if previous else {
                "mission": mission.model_dump(mode="json", by_alias=True, exclude_none=True),
                "entities": {}, "tracks": {}, "assets": {}, "sensors": {}, "zones": {}, "tasks": {},
            }
            frame["effectiveAt"] = at
            frame["mission"]["updatedAt"] = at
            frame["mission"]["extensions"][NS].update(
                stats=payload.stats, viewerState=payload.sim_state
            )
            provenance = {"source": source, "effectiveAt": at, "recordedAt": service.clock()}
            events = []
            for item in payload.objects:
                row = item.model_dump(mode="json", by_alias=True, exclude_none=True)
                eid, state = row["id"], row["state"]
                old = frame["entities"].get(eid)
                old_state = old["extensions"][NS]["state"] if old else None
                terminal = state in {"intercepted", "hit", "lost", "expended", "cleared"}
                frame["entities"][eid] = {
                    "id": eid, "missionId": mid, "label": row["label"], "kind": "aircraft",
                    "classification": {
                        "scheme": "wedgetail-sandbox", "code": row["side"],
                        "label": "Shahed" if row["side"] == "hostile" else "Wedgetail Interceptor",
                    },
                    "affiliation": row["side"],
                    "condition": "non-operational" if terminal else "operational",
                    "presence": "removed" if terminal else "present",
                    "provenance": provenance,
                    "extensions": {NS: {
                        "state": state, "target": row.get("target"), "rawPosition": row["position"],
                    }},
                }
                track_id = eid + "-track"
                frame["tracks"][track_id] = {
                    "id": track_id, "missionId": mid, "entityId": eid, "source": source,
                    "state": "ended" if terminal else "tracking",
                    "historySeriesId": track_id + "-history",
                    "latest": {
                        "timestamp": at, "position": _position(tuple(row["position"])),
                        "discontinuity": old_state == "expended" and state == "bay",
                    },
                }
                if old_state != state:
                    events.append({
                        "effectiveAt": at, "type": "wedgetail." + state,
                        "severity": "warning" if state in {"hit", "lost"} else "info",
                        "entityIds": [eid], "zoneIds": [], "taskIds": [], "source": source,
                        "location": _position(tuple(row["position"])),
                        "extensions": {NS: {
                            "label": row["label"], "previous": old_state, "target": row.get("target"),
                        }},
                    })
            return frame, events

        frame = await service.commit_source(mid, build)
        return {"sequence": frame.sequence, "effectiveAt": frame.effective_at}

    return app
