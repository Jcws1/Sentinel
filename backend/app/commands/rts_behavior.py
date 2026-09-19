"""RTS stance coordinator; mutates only the single writer's uncommitted candidate.

Ordinary movement owns destinations. This coordinator temporarily suspends that
execution, never creates a second command writer or a new operator order.
"""
from copy import deepcopy
from app.commands import behaviors, movement, scheduler
from app.commands.behavior_geometry import pursuit_blocked
from app.commands.kinematics import distance


def enabled(checkpoint):
    return checkpoint.get("fleetBehavior", {}).get("ruleVersion") == "local-fleet-v2"


def active_move(checkpoint, asset_id):
    return next((e for e in checkpoint["executions"] if e.get("kind") == "move"
        and e["assetId"] == asset_id and e["state"] not in movement.TERMINAL), None)


def reconcile_destinations(frame, checkpoint):
    """A linked destination ending releases only its own busy reservation.

    Cancel, boundary edits and loss can terminate work outside movement.advance.
    Do not adopt an unrelated binding, grant, epoch or reservation change.
    """
    if not enabled(checkpoint):
        return
    executions = {e["id"]: e for e in checkpoint["executions"] if e.get("kind") == "move"}
    run = frame["interactive"]
    for m in checkpoint["fleetBehavior"]["members"]:
        eid = m.get("movementExecutionId")
        e = executions.get(eid)
        if not eid or (e and e["state"] not in movement.TERMINAL):
            continue
        c = next((c for c in run["controls"] if c["assetId"] == m["assetId"]), None)
        if e and c and (m["executorEpoch"], m["grantRevision"], m["bindingRevision"], m["reservationRevision"]) == (
            run["executorEpoch"], run["grantRevision"], c["bindingRevision"], e["reservationRevision"]
        ) and c["busyRevision"] == e["reservationRevision"] + 1:
            m["reservationRevision"] = c["busyRevision"]
        m.pop("movementExecutionId", None)


def resume(frame, checkpoint, member):
    e = active_move(checkpoint, member["assetId"])
    if not e or not e.get("suspendedBy"):
        return []
    track = frame["tracks"].get(e["controlTrackId"])
    if not track:
        return []
    e.pop("suspendedBy", None)
    e.update(origin=deepcopy(track["latest"]["position"]), travelledMetres=0.0)
    e["remainingMetres"] = distance(e["origin"], e["destination"], geometry=frame)
    movement.transition(e, "Running" if frame["interactive"]["state"] == "running" else "Suspended", "Pursuit ended; latest movement destination retained.")
    return [behaviors.event(frame, "movement-resumed", [member["entityId"]],
        policyId=member["id"], executionId=e["id"], destination=deepcopy(e["destination"]))]


def release(frame, checkpoint, member, reason):
    events = behaviors.halt(frame, checkpoint, member["assetId"], reason, "armed", disarm=False)
    events.extend(resume(frame, checkpoint, member))
    return events


def apply_policy(frame, checkpoint, request, outcomes, context, routes):
    if request.intent.policy.kind == "patrol":
        return None  # Existing bounded Patrol replacement owns this case.
    events = []
    policy = request.intent.policy.kind
    for o in outcomes:
        if o["outcome"] != "accepted":
            continue
        control = next(c for c in frame["interactive"]["controls"] if c["assetId"] == o["assetId"])
        e = active_move(checkpoint, control["assetId"])
        # Preserve the movement object while the normal replacement establishes
        # the new policy/order/manual override and invalidates prior source work.
        if e:
            checkpoint["executions"].remove(e)
        member, changes = behaviors.replace(frame, checkpoint, control, request.command_id,
            context, policy, o["state"], o["reason"])
        events.extend(changes)
        if e:
            e["reservationRevision"] = control["busyRevision"]
            checkpoint["executions"].append(e)
            member["movementExecutionId"] = e["id"]
            events.extend(resume(frame, checkpoint, member))
    events.append(behaviors.event(frame, "policy", [o["entityId"] for o in outcomes if o["outcome"] == "accepted"],
        commandId=request.command_id, order=context["order"], policy=policy, outcomes=outcomes))
    return events


def redirect(frame, checkpoint, asset_id, command_id, context):
    previous = behaviors.member_for(checkpoint, asset_id)
    policy = "intercept" if previous and previous["policy"] == "intercept" else "hold"
    control = next(c for c in frame["interactive"]["controls"] if c["assetId"] == asset_id)
    member, events = behaviors.replace(frame, checkpoint, control, command_id, context, policy,
        "armed" if policy == "intercept" else "hold", "New movement destination accepted; Intercept enabled." if policy == "intercept" else "Manual movement.")
    return member, events


def revalidate(frame, checkpoint):
    """Release invalid pairs without stopping permitted ordinary movement."""
    events = []
    reconcile_destinations(frame, checkpoint)
    fleet = checkpoint["fleetBehavior"]
    for m in fleet["members"]:
        if m["policy"] != "intercept" or m["state"] not in {"armed", "pursuing"}:
            continue
        reason = behaviors.binding_reason(frame, m)
        if reason:
            events.extend(behaviors.halt(frame, checkpoint, m["assetId"], reason, "blocked"))
            events.extend(resume(frame, checkpoint, m))
            continue
        if m["state"] != "pursuing":
            continue
        a = next(a for a in fleet["assignments"] if a["id"] == m["assignmentId"])
        t = behaviors.source_track(frame, a["targetId"], "hostile")
        origin = frame["tracks"][m["controlTrackId"]]["latest"]["position"]
        if not t or t["id"] != a["targetTrackId"]:
            reason = "Target lost or unavailable; destination resumed, Intercept remains enabled."
        elif distance(origin, t["latest"]["position"], geometry=frame) > fleet["model"]["acquisitionRadiusM"] + fleet["model"]["toleranceM"]:
            reason = "Target left proximity radius; destination resumed, Intercept remains enabled."
        else:
            reason = pursuit_blocked(frame, origin, t["latest"]["position"])
        if reason:
            events.extend(release(frame, checkpoint, m, reason))
    return events


def prepare(frame, checkpoint, before, now):
    if not enabled(checkpoint) or frame["interactive"]["state"] != "running":
        return []
    events = revalidate(frame, checkpoint)
    fleet = checkpoint["fleetBehavior"]
    occupied = {a["targetId"] for a in fleet["assignments"] if a["state"] == "active"}
    targets = {eid: behaviors.source_track(before, eid, "hostile") for eid in sorted(before["entities"])}
    pairs = []
    for m in fleet["members"]:
        if m["policy"] != "intercept" or m["state"] != "armed":
            continue
        origin = before["tracks"].get(m.get("controlTrackId"), {}).get("latest", {}).get("position")
        if origin is None or behaviors.binding_reason(frame, m):
            continue
        for eid, t in targets.items():
            if t is None or eid in occupied:
                continue
            p = t["latest"]["position"]
            d = distance(origin, p, geometry=frame)
            if d <= fleet["model"]["acquisitionRadiusM"] + fleet["model"]["toleranceM"] and not pursuit_blocked(frame, origin, p):
                pairs.append((d, eid, m["assetId"], m, t))
    allocated = set()
    for _, eid, aid, m, t in sorted(pairs, key=lambda x:x[:3]):
        if eid in occupied or aid in allocated:
            continue
        assignment = dict(id=behaviors.identity(frame["interactive"]["runId"], m["id"], eid, frame["sequence"]+1),
            policyId=m["id"], commandId=m["commandId"], assetId=aid, interceptorId=m["entityId"],
            targetId=eid, targetTrackId=t["id"], createdSequence=frame["sequence"]+1, state="active")
        fleet["assignments"].append(assignment)
        m.update(state="pursuing", assignmentId=assignment["id"], reason="Pursuing nearby hostile; movement destination retained.")
        occupied.add(eid)
        allocated.add(aid)
        events.append(behaviors.event(frame, "assigned", [m["entityId"], eid], assignmentId=assignment["id"],
            policyId=m["id"], acquisitionRadiusM=fleet["model"]["acquisitionRadiusM"]))
    for m in fleet["members"]:
        if m["state"] != "pursuing":
            continue
        e = active_move(checkpoint, m["assetId"])
        if e and not e.get("suspendedBy"):
            # A positional order still has its first-start deadline even when
            # autonomous steering is about to take ownership of the sample.
            if not e.get("startedAt") and now >= e["deadline"]:
                continue
            e.setdefault("startedAt", frame["effectiveAt"])
            e.setdefault("startedTick", frame["interactive"]["tick"])
            e["suspendedBy"] = m["id"]
            movement.transition(e, "Suspended", "Destination retained while Intercept pursues.")
            m["movementExecutionId"] = e["id"]
        elif e:
            movement.transition(e, "Suspended", "Destination retained while Intercept pursues.")
    return events
