import copy
import hashlib
import json

from app.domain.models import Mission
from app.simulation.contracts import SimulationEntityDetail, SimulationProjection
from app.simulation.policy import NAMESPACE
from app.simulation.validation import canonical_external


def identity(kind, *parts):
    return "sim-v1-" + kind + "-" + hashlib.sha256(canonical_external(list(parts)).encode("utf-8")).hexdigest()


def mission_identity(external_id):
    return identity("mission", external_id)


def source(run, mode):
    return dict(id=identity("source", run.mission_id), kind="simulation" if mode == "SIMULATED" else "import",
                mode=mode.lower(), externalId=run.external_mission_id)


def module_projection(run):
    return SimulationProjection.model_validate({key: value for key, value in run.model_dump().items()
                                               if key in SimulationProjection.model_fields}).model_dump(mode="json", by_alias=True, exclude_none=True)


def new_mission(run):
    area = run.last_request["area"]
    ring = area["polygon"][:-1]
    point = dict(longitudeDeg=sum(p[0] for p in ring) / len(ring), latitudeDeg=sum(p[1] for p in ring) / len(ring),
                 altitude=dict(metres=0.0, reference="MSL"))
    return Mission.model_validate_json(json.dumps(dict(id=run.mission_id, name="Simulation · " + run.external_mission_id,
        domain="external-simulation-v1", lifecycle="active", createdAt=run.received_at, updatedAt=run.received_at,
        referencePoint=point, extensions={NAMESPACE: module_projection(run)})))


def frame_base(previous, run, at, recorded_at, area_update):
    frame = copy.deepcopy(previous) if previous else dict(mission=new_mission(run).model_dump(mode="json", by_alias=True, exclude_none=True),
        entities={}, tracks={}, assets={}, sensors={}, zones={}, tasks={})
    frame["effectiveAt"] = at
    frame["mission"]["updatedAt"] = max(recorded_at, frame["mission"]["createdAt"])
    frame["mission"]["lifecycle"] = "completed" if run.state == "ABORTED" else "active"
    frame["mission"]["extensions"][NAMESPACE] = module_projection(run)
    if area_update or not frame["zones"]:
        area = run.last_request["area"]
        zone_id = identity("area", run.mission_id, area["area_id"])
        frame["zones"] = {zone_id: dict(id=zone_id, missionId=run.mission_id, label=area["area_id"], purpose="simulation-area",
            geometry=dict(type="Polygon", coordinates=[area["polygon"]]),
            altitudeBand=dict(lower=dict(metres=area["min_altitude_m"], reference="MSL"), upper=dict(metres=area["max_altitude_m"], reference="MSL")),
            provenance=dict(source=source(run, run.source_mode), effectiveAt=at, recordedAt=recorded_at))}
        frame["mission"]["zoneIds"] = [zone_id]
    return frame


def control_frame(previous, run, recorded_at, event_type):
    at = max(run.last_request["command"]["execute_at"], previous["effectiveAt"] if previous else run.last_request["command"]["execute_at"])
    frame = frame_base(previous, run, at, recorded_at, False)
    return frame, [control_event(run, event_type)]


def control_event(run, event_type):
    return dict(id=identity("event", run.run_id, run.command_id, event_type), effectiveAt=run.last_request["command"]["execute_at"],
                 type=event_type, severity="info", entityIds=[], zoneIds=[], taskIds=[], source=source(run, run.source_mode),
                 extensions={NAMESPACE: dict(policyId=run.policy_id, runId=run.run_id, commandId=run.command_id,
                    action=run.last_request["command"]["action"], issuedAt=run.last_request["command"]["issued_at"],
                    executeAt=run.last_request["command"]["execute_at"], phase=run.phase)})


def sample_frame(previous, run, at, rows, results, recorded_at):
    frame = frame_base(previous, run, at, recorded_at, True)
    # Missing observations remain identities, not removals. A backward import
    # must never relabel a future track as an earlier sample or carry future health.
    for entity in frame["entities"].values():
        entity["presence"] = "unobserved"
        if entity["provenance"]["effectiveAt"] > at:
            entity["condition"] = "unknown"
            entity["extensions"].pop(NAMESPACE, None)
    frame["tracks"] = {key: {**track, "state": "stale"} for key, track in frame["tracks"].items() if track["latest"]["timestamp"] <= at}
    health = {row["drone_id"]: row for row in results["drone_health"]}
    src = source(run, run.source_mode)
    provenance = dict(source=src, effectiveAt=at, recordedAt=recorded_at)
    for row in rows:
        outcome = health[row["drone_id"]]
        entity_id = identity("entity", run.mission_id, src["id"], row["drone_id"])
        track_id = identity("track", entity_id)
        detail = SimulationEntityDetail(drone_id=row["drone_id"], drone_class=row["class"], input_health=outcome["health_before"],
            health=outcome["health_after"], reported_status=outcome["status_after"], state_discontinuity=outcome["state_discontinuity"],
            command_id=run.command_id, run_id=run.run_id, calibration=run.calibration).model_dump(mode="json", by_alias=True)
        frame["entities"][entity_id] = dict(id=entity_id, missionId=run.mission_id, label=row["drone_id"], kind="aircraft",
            classification=dict(scheme="simulation-v1.drone-class", code=row["class"], label="Class " + row["class"]),
            affiliation={"RED": "hostile", "BLUE": "friendly", "NEUTRAL": "neutral", "UNKNOWN": "unknown"}[row["team"]],
            condition="operational" if outcome["status_after"] == "ACTIVE" else "non-operational",
            presence="removed" if outcome["status_after"] == "REMOVED" else "present", provenance=provenance, extensions={NAMESPACE: detail})
        old = frame["tracks"].get(track_id)
        frame["tracks"][track_id] = dict(id=track_id, missionId=run.mission_id, entityId=entity_id, source=src,
            state="ended" if outcome["status_after"] == "REMOVED" else "tracking",
            latest=dict(timestamp=at, position=dict(longitudeDeg=row["longitude_deg"], latitudeDeg=row["latitude_deg"],
                        altitude=dict(metres=row["altitude_m"], reference="MSL")),
                        discontinuity=outcome["state_discontinuity"] or bool(old and old["source"]["mode"] != src["mode"])),
            historySeriesId=identity("history", track_id))
    events = []
    for result in results["interactions"]:
        # Preserve the external hash even when distinct pipe-delimited IDs collide.
        event_id = identity("interaction", run.run_id, run.command_id, at, result["red_drone_id"], result["blue_drone_id"])
        events.append(dict(id=event_id, effectiveAt=at, type="simulation.v1.interaction", severity="info",
            entityIds=[identity("entity", run.mission_id, src["id"], result[key]) for key in ("red_drone_id", "blue_drone_id")],
            zoneIds=[], taskIds=[], source=src,
            extensions={NAMESPACE: dict(policyId=run.policy_id, runId=run.run_id, commandId=run.command_id,
                                        calibration=run.calibration.model_dump(mode="json", by_alias=True), result=result)}))
    for row in results["drone_health"]:
        if row["state_discontinuity"]:
            entity_id = identity("entity", run.mission_id, src["id"], row["drone_id"])
            events.append(dict(id=identity("correction", run.run_id, run.command_id, at, row["drone_id"]), effectiveAt=at,
                type="simulation.v1.state-correction", severity="info", entityIds=[entity_id], zoneIds=[], taskIds=[], source=src,
                extensions={NAMESPACE: dict(commandId=run.command_id, droneId=row["drone_id"], suppliedHealth=row["health_before"])}))
    return frame, events
