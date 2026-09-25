"""Deterministic, read-only tasking advice over one committed frame.

These are candidates for an operator's decision, never dispatch instructions.
Absent camera, link, energy, or relay telemetry must not be inferred from silence.
"""
from math import hypot
from typing import Literal

from pydantic import Field

from app.commands.kinematics import metric
from app.commands.recommendations import eligible_pairs, member_reason, source_current
from app.commands.zone_rules import blocked
from app.domain.base import Id, Model, Sequence
from app.domain.models import WorldFrame
from app.world.serialization import canonical
import json


class TaskingRequest(Model):
    frame_id: Id | None = None
    focus_zone_id: Id | None = None


class TaskingPair(Model):
    asset_id: Id
    target_id: Id


class TaskingProposal(Model):
    code: Literal["MONITOR", "RESPOND", "RESTORE_VISIBILITY", "RESTORE_LINK", "ROTATE_ASSET"]
    category: Literal["Monitor", "Respond", "Support"]
    status: Literal["candidate", "needs_evidence", "unsupported", "no_feasible_asset"]
    summary: str = Field(min_length=1, max_length=500)
    evidence_ids: list[Id] = Field(max_length=80)
    asset_ids: list[Id] = Field(max_length=32)
    target_ids: list[Id] = Field(max_length=40)
    zone_ids: list[Id] = Field(max_length=16)
    pairs: list[TaskingPair] = Field(default_factory=list, max_length=32)
    limitations: list[str] = Field(max_length=6)


class TaskingAdvice(Model):
    schema_version: Literal["1.0"] = "1.0"
    mission_id: Id
    frame_id: Id
    sequence: Sequence
    boundary_revision: Sequence
    source: Literal["deterministic-rules"] = "deterministic-rules"
    executable: Literal[False] = False
    proposals: list[TaskingProposal] = Field(min_length=5, max_length=5)


def _proposal(code, category, status, summary, *, evidence=(), assets=(), targets=(), zones=(), pairs=(), limitations=()):
    return dict(code=code, category=category, status=status, summary=summary,
                evidenceIds=sorted(set(evidence)), assetIds=sorted(set(assets)),
                targetIds=sorted(set(targets)), zoneIds=sorted(set(zones)),
                pairs=[dict(assetId=asset, targetId=target) for asset, target in pairs],
                limitations=list(limitations))


def _controls(frame):
    run = frame.get("interactive") or {}
    return sorted((control for control in run.get("controls", [])
                   if member_reason(frame, control["entityId"]) is None), key=lambda item: item["assetId"])


def _monitor(frame, controls, focus_zone_id):
    if not focus_zone_id:
        return _proposal("MONITOR", "Monitor", "needs_evidence", "Mark and select an observation area before proposing a monitor asset.")
    zone = frame["zones"].get(focus_zone_id)
    if not zone:
        return _proposal("MONITOR", "Monitor", "needs_evidence", "The selected observation area is not in this committed frame.")
    if (frame.get("boundaryRules") or {}).get("zones", {}).get(focus_zone_id) not in {"annotation", "patrol", "keep_in"}:
        return _proposal("MONITOR", "Monitor", "needs_evidence", "Select a marked Annotation, Patrol or Keep In area for view planning.")
    vertices = zone["geometry"]["coordinates"][0][:-1]
    centre = (sum(vertex[0] for vertex in vertices) / len(vertices), sum(vertex[1] for vertex in vertices) / len(vertices))
    centre_metric = metric({"longitudeDeg":centre[0], "latitudeDeg":centre[1]}, geometry=frame)
    ranked = []
    for control in controls:
        track = frame["tracks"].get(control["controlTrackId"])
        if track and track["state"] == "tracking" and not blocked(frame, track["latest"]["position"]):
            pose = metric(track["latest"]["position"], geometry=frame)
            ranked.append((hypot(pose[0]-centre_metric[0], pose[1]-centre_metric[1]), control["assetId"], control["entityId"]))
    if not ranked:
        return _proposal("MONITOR", "Monitor", "no_feasible_asset", "No controlled drone has a current position for viewpoint planning.", zones=[focus_zone_id])
    _, asset, entity = min(ranked)
    return _proposal("MONITOR", "Monitor", "candidate", "Nearest controlled drone to the marked area is a candidate for view planning—not a verified camera vantage.",
                     evidence=[focus_zone_id, asset, entity], assets=[asset], zones=[focus_zone_id],
                     limitations=["A simulator move towards the marked area can be reviewed, but camera pose, field of view and occlusion remain unverified."])


def _respond(frame, controls, now):
    run = frame.get("interactive")
    if not run:
        return _proposal("RESPOND", "Respond", "unsupported", "This frame has no controlled simulator run.")
    if run["state"] != "running":
        return _proposal("RESPOND", "Respond", "needs_evidence", "Start the controlled simulator run before reviewing an Intercept action.")
    if not source_current(frame, now):
        return _proposal("RESPOND", "Respond", "needs_evidence", "The simulator source report is stale; refresh before reviewing an Intercept action.")
    hostiles = sorted(entity_id for entity_id, entity in frame["entities"].items()
                      if entity["affiliation"] == "hostile" and entity["presence"] == "present" and entity["condition"] == "operational")
    if not hostiles:
        return _proposal("RESPOND", "Respond", "needs_evidence", "No operational hostile target is present in this frame.")
    ids = [control["entityId"] for control in controls]
    pairs = eligible_pairs(frame, ids)
    # Stable maximum bipartite matching; greedy assignment can strand a target
    # when one interceptor has an alternative and another does not.
    adjacency = {asset: [] for asset, _ in pairs}
    for asset, target in pairs:
        adjacency[asset].append(target)
    by_target = {}

    def assign(asset, seen):
        for target in adjacency[asset]:
            if target in seen:
                continue
            seen.add(target)
            if target not in by_target or assign(by_target[target], seen):
                by_target[target] = asset
                return True
        return False

    for asset in sorted(adjacency):
        assign(asset, set())
    chosen = sorted((asset, target) for target, asset in by_target.items())
    shortfall = len(hostiles)-len(chosen)
    if not chosen:
        return _proposal("RESPOND", "Respond", "no_feasible_asset", f"No eligible one-to-one interceptor pairing for {len(hostiles)} observed hostile target(s).",
                         evidence=hostiles, targets=hostiles,
                         limitations=["Do not infer interception authority or dispatch from this assessment."])
    return _proposal("RESPOND", "Respond", "candidate",
                     f"{len(chosen)} one-to-one pairing(s) pass current proximity and area gates; {shortfall} target(s) remain unpaired. "
                     + ("No screen reserve is claimed while demand is unmet." if shortfall else "Unpaired eligible assets may remain as screen reserve on approved standby."),
                     evidence=hostiles + [asset for asset, _ in chosen], assets=[asset for asset, _ in chosen], targets=[target for _, target in chosen], pairs=chosen,
                     limitations=["Pairings are advisory; the current Intercept command enables a proximity policy, not a target-specific assignment.",
                                  "Human approval and platform-specific authority are required before any command."])


def _support(frame, controls):
    def move_possible(control, affected_entity):
        # The hosted action is a direct simulator move. Do not call it a
        # candidate if the destination is missing or already occupied.
        if not frame.get("interactive"):
            return True  # Pure evidence-unit fixtures do not model motion.
        by_entity = {item["entityId"]: item for item in frame["interactive"]["controls"]}
        affected = by_entity.get(affected_entity)
        source = frame.get("tracks", {}).get(control.get("controlTrackId"))
        target = frame.get("tracks", {}).get(affected.get("controlTrackId")) if affected else None
        if not source or not target or source["state"] != "tracking" or target["state"] != "tracking":
            return False
        a, b = metric(source["latest"]["position"], geometry=frame), metric(target["latest"]["position"], geometry=frame)
        return hypot(a[0] - b[0], a[1] - b[1]) >= 1.0

    sensors = frame.get("sensors", {})
    cameras = [sensor for sensor in sensors.values() if sensor["modality"].lower() in {"camera", "video", "visual", "eo", "eo/ir"}]
    down = [sensor for sensor in cameras if sensor["status"] == "unavailable"]
    camera_entities = {sensor["entityId"] for sensor in cameras if sensor["status"] == "available"}
    failed_camera_entities = {sensor["entityId"] for sensor in down}
    camera_replacements = [control for control in controls if control["entityId"] in camera_entities
                           and control["entityId"] not in failed_camera_entities
                           and frame["assets"][control["assetId"]]["availability"] == "available"
                           and move_possible(control, down[0]["entityId"])] if down else []
    if down and camera_replacements:
        substitute = camera_replacements[0]
        visibility = _proposal("RESTORE_VISIBILITY", "Support", "candidate", "A camera feed is unavailable; an available camera asset is a candidate for a new view.",
                               evidence=[sensor["id"] for sensor in down] + [substitute["assetId"]], assets=[substitute["assetId"]],
                               targets=[down[0]["entityId"]],
                               limitations=["A move to the last reported camera position does not prove restored visibility; confirm the new view separately."])
    elif down:
        visibility = _proposal("RESTORE_VISIBILITY", "Support", "no_feasible_asset", "A camera feed is unavailable and no available controlled camera asset has a distinct, current move to review.",
                               evidence=[sensor["id"] for sensor in down])
    else:
        visibility = _proposal("RESTORE_VISIBILITY", "Support", "needs_evidence", "No failed camera feed or verified loss of required visibility is reported.")
    # Source freshness is not proof of a radio-link fault. Require explicit link
    # telemetry and an eligible relay capability before a relay suggestion.
    links = [sensor for sensor in sensors.values() if sensor["modality"].lower() in {"link", "radio-link", "communications-link"}]
    failed_links = [sensor for sensor in links if sensor["status"] == "unavailable"]
    relay_assets = [control for control in controls if
                    {"relay", "synthetic-relay"} & set(frame["assets"][control["assetId"]]["capabilityCodes"])
                    and frame["assets"][control["assetId"]]["availability"] == "available"
                    and control["entityId"] not in {sensor["entityId"] for sensor in failed_links}
                    and move_possible(control, failed_links[0]["entityId"])] if failed_links else []
    if failed_links and relay_assets:
        relay_asset = relay_assets[0]
        relay = _proposal("RESTORE_LINK", "Support", "candidate", "An explicit link sensor is unavailable; a relay-capable asset is available for planning.",
                          evidence=[sensor["id"] for sensor in failed_links] + [relay_asset["assetId"]], assets=[relay_asset["assetId"]],
                          targets=[failed_links[0]["entityId"]],
                          limitations=["A move towards the last reported link-fault position does not prove radio coverage or restored connectivity."])
    elif failed_links:
        relay = _proposal("RESTORE_LINK", "Support", "no_feasible_asset", "An explicit link sensor is unavailable; no available relay-capable asset has a distinct, current move to review.",
                          evidence=[sensor["id"] for sensor in failed_links])
    else:
        relay = _proposal("RESTORE_LINK", "Support", "needs_evidence", "No explicit link-health observation is available; a relay cannot be justified.",
                          limitations=["A stale source update alone does not diagnose RF link loss."])
    active = [task for task in frame.get("tasks", {}).values() if task["status"] in {"accepted", "active"}]
    failed = [(task, asset_id) for task in active for asset_id in task["assetIds"]
              if frame.get("assets", {}).get(asset_id, {}).get("availability") == "unavailable"]
    if not failed:
        rotation = _proposal("ROTATE_ASSET", "Support", "needs_evidence", "No active task reports an assigned asset that cannot sustain it.")
    else:
        task, failed_asset = sorted(failed, key=lambda item:(item[0]["id"], item[1]))[0]
        needed = set(frame["assets"][failed_asset]["capabilityCodes"])
        replacements = [control for control in controls if control["assetId"] not in task["assetIds"]
                        and frame["assets"][control["assetId"]]["availability"] == "available"
                        and needed <= set(frame["assets"][control["assetId"]]["capabilityCodes"])
                        and (not frame["assets"][failed_asset].get("entityId") or
                             move_possible(control, frame["assets"][failed_asset]["entityId"]))]
        if replacements:
            substitute = replacements[0]
            rotation = _proposal("ROTATE_ASSET", "Support", "candidate", "A compatible available drone may replace the unavailable task asset; review its position and endurance before approval.",
                                 evidence=[task["id"], failed_asset, substitute["assetId"]], assets=[substitute["assetId"]],
                                 targets=[frame["assets"][failed_asset]["entityId"]] if frame["assets"][failed_asset].get("entityId") else [],
                                 limitations=["A move towards the failed asset does not transfer its task or prove endurance; confirm reassignment separately."])
        else:
            rotation = _proposal("ROTATE_ASSET", "Support", "no_feasible_asset", "An active task asset is unavailable and no compatible free replacement has a distinct, current move to review.",
                                 evidence=[task["id"], failed_asset])
    return visibility, relay, rotation


def generate(frame: WorldFrame, request: TaskingRequest, now: str | None = None) -> TaskingAdvice:
    data = json.loads(canonical(frame))
    controls = _controls(data) if data.get("interactive") else []
    proposals = [_monitor(data, controls, request.focus_zone_id), _respond(data, controls, now or frame.recorded_at), *_support(data, controls)]
    return TaskingAdvice.model_validate(dict(missionId=frame.mission.id, frameId=frame.frame_id,
        sequence=frame.sequence, boundaryRevision=frame.live_boundaries.revision if frame.live_boundaries else 0,
        proposals=proposals))
