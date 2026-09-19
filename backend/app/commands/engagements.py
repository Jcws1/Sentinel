"""Versioned toy mutual-loss candidates, committed atomically with all source work."""
from copy import deepcopy
from app.commands import behaviors, movement, scheduler, rts_behavior
from app.commands.behavior_geometry import swept_contact, interpolate, spatial_distance, pursuit_blocked


def truncate_work(frame, checkpoint, entity_id, fraction, position, events):
    """An uncommitted arrival after contact is not a completed historical action."""
    cancelled_ids = set()
    for e in checkpoint["executions"]:
        if e.get("kind") != "move" or e["entityId"] != entity_id:
            continue
        if e["state"] == "Completed" and e.get("terminalSequence") == frame["sequence"]+1 and fraction < 1:
            e.update(state="Running")
            e.pop("terminalSequence", None)
            e.pop("completionSample", None)
            cancelled_ids.add(e["id"])
        movement.terminate(frame, e, "Cancelled", "simulated-loss")
    schedule = checkpoint.get("scenarioSchedule")
    changes = []
    if schedule:
        for item in schedule["actions"]:
            if item["entityId"] != entity_id:
                continue
            if item["state"] == "Completed" and item.get("terminalSequence") == frame["sequence"]+1 and fraction < 1:
                item.update(state="Running")
                item.pop("terminalSequence", None)
                item.pop("terminalTick", None)
                item["motion"].pop("completionSample", None)
                cancelled_ids.add(item["motion"]["id"])
            if item["state"] in scheduler.ACTIVE:
                motion = item["motion"]
                from app.commands.kinematics import distance
                motion["travelledMetres"] = distance(motion["origin"], position, geometry=frame)
                motion["remainingMetres"] = distance(position, motion["destination"], geometry=frame)
            changes.extend(scheduler.halt(frame, item, "Cancelled", "simulated-loss: future source work terminated."))
        changes.extend(scheduler.resolve_broken(frame, schedule))
    events[:] = [e for e in events if not any(v.get("executionId") in cancelled_ids and e["type"].endswith(".completed") for v in e.get("extensions", {}).values() if isinstance(v, dict))]
    events.extend(changes)


def resolve(frame, checkpoint, before, events):
    fleet = checkpoint.get("fleetBehavior")
    if not fleet or frame["interactive"]["state"] != "running":
        return
    run, model = frame["interactive"], fleet["model"]
    consumed = {p["entityId"] for o in fleet["outcomes"] for p in o["participants"]}
    for a in sorted(fleet["assignments"], key=lambda a: a["id"]):
        if a["state"] != "active" or a["interceptorId"] in consumed or a["targetId"] in consumed:
            continue
        member = behaviors.member_for(checkpoint, a["assetId"])
        if not member or member["state"] != "pursuing":
            continue
        interceptor = behaviors.source_track(before, a["interceptorId"], "friendly")
        target = behaviors.source_track(before, a["targetId"], "hostile")
        if not interceptor or not target or target["id"] != a["targetTrackId"] or interceptor["id"] != member["controlTrackId"]:
            continue
        old = [interceptor["latest"]["position"], target["latest"]["position"]]
        tids = [interceptor["id"], target["id"]]
        proposed = [frame["tracks"][tid]["latest"]["position"] for tid in tids]
        if any(pursuit_blocked(frame, start, end) for start, end in zip(old, proposed)):
            reason = "Protected/restricted participant path; pursuit released."
            events.extend(rts_behavior.release(frame, checkpoint, member, reason) if rts_behavior.enabled(checkpoint) else behaviors.halt(frame, checkpoint, a["assetId"], reason, "blocked", disarm=False))
            continue
        fraction = swept_contact(old[0], proposed[0], old[1], proposed[1], model["contactRadiusM"], model["toleranceM"], geometry=frame)
        if fraction is None:
            continue
        evaluated = [interpolate(start, end, fraction, geometry=frame) for start, end in zip(old, proposed)]
        if any(pursuit_blocked(frame, p) for p in evaluated):
            continue
        ids = [a["interceptorId"], a["targetId"]]
        outcome = dict(id=behaviors.identity(run["runId"], a["id"], frame["sequence"]+1), ruleVersion=model["ruleVersion"],
            assignmentId=a["id"], policyId=member["id"], commandId=member["commandId"], runId=run["runId"], sourceId=run["sourceId"],
            executorEpoch=run["executorEpoch"], inputFrameId=before["frameId"], inputSequence=before["sequence"],
            committedSequence=frame["sequence"]+1, tick=run["tick"], fraction=fraction,
            separationM=spatial_distance(*evaluated, geometry=frame), participants=[])
        for eid, tid, start, end, position in zip(ids, tids, old, proposed, evaluated):
            entity = frame["entities"][eid]
            outcome["participants"].append(dict(entityId=eid, trackId=tid, affiliation=entity["affiliation"],
                before=deepcopy(start), proposed=deepcopy(end), evaluated=deepcopy(position), beforeCondition="operational", afterCondition="non-operational"))
            entity["condition"] = "non-operational"
            entity["presence"] = "present"
            track = frame["tracks"][tid]
            track["latest"]["position"] = deepcopy(position)
            track["latest"]["velocity"]["speedMps"] = 0.0
            for asset in frame["assets"].values():
                if asset["entityId"] == eid:
                    asset["availability"] = "unavailable"
                    events.extend(behaviors.halt(frame, checkpoint, asset["id"], "simulated-loss: NON-OP", "unavailable"))
            truncate_work(frame, checkpoint, eid, fraction, position, events)
            consumed.add(eid)
        # Release every affected reservation, including a target consumed by another pair.
        for other in list(fleet["assignments"]):
            if other["state"] == "active" and (other["targetId"] in consumed or other["interceptorId"] in consumed):
                lost = other["interceptorId"] in consumed
                if not lost and rts_behavior.enabled(checkpoint):
                    events.extend(rts_behavior.release(frame, checkpoint, behaviors.member_for(checkpoint, other["assetId"]), "Target non-operational; destination resumed."))
                else:
                    events.extend(behaviors.halt(frame, checkpoint, other["assetId"], "simulated-loss" if lost else "Target non-operational; held reserve.", "unavailable" if lost else "reserve", disarm=lost))
        fleet["outcomes"].append(outcome)
        events.append(dict(effectiveAt=frame["effectiveAt"], type="demo.simulated-engagement", severity="info", entityIds=ids,
            source=dict(id=run["sourceId"], kind="simulation", mode="simulated"), extensions={"sentinel.outcome":deepcopy(outcome)}))
