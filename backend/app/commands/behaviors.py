"""Candidate-only fleet coordinator. InteractiveService is the only writer."""
from copy import deepcopy
from hashlib import sha256
import json
from app.commands import movement, scheduler
from app.commands.behavior_contracts import EngagementModel
from app.commands.behavior_geometry import pursuit_blocked, patrol_route, geometry_hash
from app.commands.kinematics import cruise_speed, distance, in_extent, step
from app.commands.errors import CommandError

ACTIVE = {"armed", "patrolling", "pursuing", "reserve"}


def identity(*parts):
    return sha256(json.dumps(parts, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def acquisition_radius():
    import os
    value = float(os.environ.get("SENTINEL_ACQUISITION_RADIUS_M", "700"))
    if not 25 <= value <= 5000:
        raise ValueError("Acquisition radius must be 25..5000 m")
    return value


def initialize(frame, checkpoint):
    """Grant only during NEW run creation, never during legacy read/recovery."""
    run = frame["interactive"]
    run["schemaVersion"] = "1.8" if run.get("localGeometry") else "1.7"
    for cap in ("fleet-policy", "demo-outcome"):
        if cap not in run["capabilities"]:
            run["capabilities"].append(cap)
    if "behavior" not in run["supportedActions"]:
        run["supportedActions"].append("behavior")
    for c in run["controls"]:
        if frame["entities"][c["entityId"]]["affiliation"] == "friendly" and "demo-intercept" not in c["capabilities"]:
            c["capabilities"].append("demo-intercept")
    checkpoint["fleetBehavior"] = dict(ruleVersion="local-fleet-v2", runId=run["runId"], sourceId=run["sourceId"],
        model=EngagementModel(movement_model=run["movementModel"], speed_mps=cruise_speed(run["templateId"]), acquisition_radius_m=acquisition_radius()).model_dump(by_alias=True),
        members=[], assignments=[], outcomes=[])
    project(frame, checkpoint)


def project(frame, checkpoint):
    checkpoint["schemaVersion"] = "1.8" if frame["interactive"].get("localGeometry") else "1.7"
    fleet = checkpoint.get("fleetBehavior")
    if fleet is None:
        return
    from app.commands.rts_behavior import reconcile_destinations
    reconcile_destinations(frame, checkpoint)
    active = [a for a in fleet["assignments"] if a["state"] == "active"]
    released = sorted((a for a in fleet["assignments"] if a["state"] == "released"), key=lambda a: (a["releasedSequence"], a["id"]))
    fleet["assignments"] = active+released[-(64-len(active)):]
    frame["fleetBehavior"] = deepcopy(fleet)


def event(frame, kind, entities, **evidence):
    return dict(effectiveAt=frame["effectiveAt"], type=f"behavior.{kind}", severity="info", entityIds=entities,
        source=dict(id=frame["interactive"]["sourceId"], kind="simulation", mode="simulated"),
        extensions={"sentinel.behavior": evidence})


def member_for(checkpoint, asset_id):
    return next((m for m in checkpoint.get("fleetBehavior", {}).get("members", []) if m["assetId"] == asset_id), None)


def source_track(frame, entity_id, affiliation=None):
    run = frame["interactive"]
    entity = frame["entities"].get(entity_id)
    source = dict(id=run["sourceId"], kind="simulation", mode="simulated")
    if not entity or entity["presence"] != "present" or entity["condition"] != "operational" or entity["provenance"]["source"] != source or (affiliation and entity["affiliation"] != affiliation):
        return None
    tracks = [t for t in frame["tracks"].values() if t["entityId"] == entity_id and t["source"] == source]
    if len(tracks) != 1:
        return None
    track = tracks[0]
    p = track["latest"]["position"]
    if track["state"] != "tracking" or not 0 <= movement.age(frame["effectiveAt"], track["latest"]["timestamp"]) <= 1 or p["altitude"]["reference"] != "ELLIPSOID" or p["altitude"].get("datumId") != "WGS84" or not in_extent(p, geometry=frame):
        return None
    return track


def halt(frame, checkpoint, asset_id, reason, state="hold", disarm=True):
    member = member_for(checkpoint, asset_id)
    if not member:
        return []
    fleet = checkpoint["fleetBehavior"]
    events = []
    for a in fleet["assignments"]:
        if a["assetId"] == asset_id and a["state"] == "active":
            a.update(state="released", releasedSequence=frame["sequence"]+1, reason=reason)
            events.append(event(frame, "assignment-released", [a["interceptorId"], a["targetId"]], assignmentId=a["id"], reason=reason))
    member.update(state=state, reason=reason)
    if disarm:
        member["policy"] = "hold"
    member.pop("assignmentId", None)
    track = frame["tracks"].get(member.get("controlTrackId"))
    if track:
        track["latest"]["velocity"] = dict(speedMps=0.0, headingTrueDeg=track["latest"].get("velocity", {}).get("headingTrueDeg", 0.0))
    return events


def terminate_all(frame, checkpoint, reason, interrupted=False):
    events = []
    for member in checkpoint.get("fleetBehavior", {}).get("members", []):
        if member["state"] in ACTIVE or member["policy"] != "hold":
            events.extend(halt(frame, checkpoint, member["assetId"], reason, "interrupted" if interrupted else "hold"))
    return events


def require_capability(frame):
    if not {"fleet-policy", "demo-outcome"} <= set(frame["interactive"]["capabilities"]):
        raise CommandError("CONTROL_REQUIRED", "This run has no fleet behavior capability. Create a fresh demo.")


def validate_policy(frame, checkpoint, policy, control_outcomes):
    require_capability(frame)
    outcomes, routes = [], {}
    for o in control_outcomes:
        if o["outcome"] == "skipped":
            outcomes.append(dict(o))
            continue
        c = next(c for c in frame["interactive"]["controls"] if c["assetId"] == o["assetId"])
        entity = frame["entities"][c["entityId"]]
        reason = None
        if entity["affiliation"] != "friendly" or entity["presence"] != "present" or entity["condition"] != "operational" or frame["assets"][c["assetId"]]["availability"] != "available":
            reason = ("UNAVAILABLE", "Only available controlled friendly drones can activate behavior.")
        if policy.kind == "intercept" and "demo-intercept" not in c["capabilities"]:
            reason = ("UNAVAILABLE", "Selected source binding has no Intercept capability; skipped.")
        if policy.kind == "patrol" and not reason:
            reason = movement.direct_member_reason(frame, c)
        if reason:
            outcomes.append(dict(assetId=c["assetId"], entityId=c["entityId"], outcome="skipped", code=reason[0], reason=reason[1]))
        else:
            if policy.kind == "patrol":
                origin = frame["tracks"][c["controlTrackId"]]["latest"]["position"]
                routes[c["assetId"]] = patrol_route(frame, policy.boundary_id, c["assetId"], origin)
            outcomes.append(dict(o, state={"hold":"hold", "intercept":"armed", "patrol":"patrolling"}[policy.kind], reason={
                "hold":"Manual; ordinary map movement. Intercept disarmed.",
                "intercept":("Intercept enabled; automatic local proximity acquisition. Movement destination retained." if checkpoint.get("fleetBehavior", {}).get("ruleVersion") == "local-fleet-v2" else "Intercept armed. Use the map to approach a local enemy area."),
                "patrol":"Patrol accepted; awaiting a committed source step."}[policy.kind]))
    return outcomes, routes


def replace(frame, checkpoint, control, command_id, context, policy, state, reason, deadline=None):
    events = halt(frame, checkpoint, control["assetId"], f'Superseded by operator order {context["order"]}.')
    for execution in checkpoint["executions"]:
        if execution.get("kind") == "move" and execution["assetId"] == control["assetId"]:
            movement.terminate(frame, execution, "Cancelled", f'Superseded by behavior order {context["order"]}.')
    events.extend(scheduler.override(frame, checkpoint, control["entityId"]))
    control["busyRevision"] += 1
    checkpoint.setdefault("directOrders", {})[control["assetId"]] = dict(context)
    run = frame["interactive"]
    member = dict(id=identity(run["runId"], command_id, control["assetId"]), commandId=command_id,
        assetId=control["assetId"], entityId=control["entityId"], executorEpoch=run["executorEpoch"],
        grantRevision=run["grantRevision"], bindingRevision=control["bindingRevision"], reservationRevision=control["busyRevision"],
        order=context["order"], policy=policy, state=state, reason=reason, acceptedSequence=frame["sequence"]+1,
        acceptedTick=run["tick"], targetScope=[])
    if control.get("controlTrackId"):
        member["controlTrackId"] = control["controlTrackId"]
        track = frame["tracks"].get(control["controlTrackId"])
        if track:
            track["latest"]["velocity"] = dict(speedMps=0.0, headingTrueDeg=track["latest"].get("velocity", {}).get("headingTrueDeg", 0.0))
    if deadline:
        member["deadline"] = deadline
    fleet = checkpoint["fleetBehavior"]
    fleet["members"] = [m for m in fleet["members"] if m["assetId"] != control["assetId"]]+[member]
    return member, events


def apply_policy(frame, checkpoint, request, outcomes, context, routes):
    from app.commands import rts_behavior
    if rts_behavior.enabled(checkpoint):
        result = rts_behavior.apply_policy(frame, checkpoint, request, outcomes, context, routes)
        if result is not None:
            return result
    events = []
    policy = request.intent.policy
    for o in outcomes:
        if o["outcome"] != "accepted":
            continue
        control = next(c for c in frame["interactive"]["controls"] if c["assetId"] == o["assetId"])
        member, changes = replace(frame, checkpoint, control, request.command_id, context, policy.kind, o["state"], o["reason"], policy.deadline)
        events.extend(changes)
        if control["assetId"] in routes:
            member["patrol"] = routes[control["assetId"]]
    events.append(event(frame, "policy", [o["entityId"] for o in outcomes if o["outcome"] == "accepted"], commandId=request.command_id, order=context["order"], policy=policy.model_dump(by_alias=True, exclude_none=True), outcomes=outcomes))
    return events


def approach(frame, checkpoint, request, members, skipped, context):
    require_capability(frame)
    fleet, run = checkpoint["fleetBehavior"], frame["interactive"]
    for captured in members:
        c = next(c for c in run["controls"] if c["assetId"] == captured.asset_id)
        previous = member_for(checkpoint, c["assetId"])
        if not previous or previous["policy"] != "intercept" or previous["state"] not in {"armed", "pursuing", "reserve", "blocked"} or "demo-intercept" not in c["capabilities"] or frame["entities"][c["entityId"]]["affiliation"] != "friendly":
            raise CommandError("CONTROL_REQUIRED", "Apply Intercept to every available selected drone before approaching an enemy area.")
    anchor = request.direct.anchor.model_dump(by_alias=True)
    targets = {}
    for eid in sorted(frame["entities"]):
        track = source_track(frame, eid, "hostile")
        if track and distance(anchor, track["latest"]["position"], geometry=frame) <= fleet["model"]["acquisitionRadiusM"]+fleet["model"]["toleranceM"] and not pursuit_blocked(frame, track["latest"]["position"]):
            targets[eid] = track
    scope = list(targets)
    kept = {}
    for captured in members:
        a = next((a for a in fleet["assignments"] if a["assetId"] == captured.asset_id and a["state"] == "active"), None)
        if a and a["targetId"] in targets and not pursuit_blocked(frame, captured.origin.model_dump(by_alias=True), targets[a["targetId"]]["latest"]["position"]):
            kept[captured.asset_id] = deepcopy(a)
    events, outcomes = [], list(skipped)
    accepted = []
    for captured in members:
        control = next(c for c in run["controls"] if c["assetId"] == captured.asset_id)
        reason = "Held reserve; all eligible targets already assigned." if scope else "No eligible targets in the 250 m area. Holding; choose another area."
        member, changes = replace(frame, checkpoint, control, request.command_id, context, "intercept", "reserve", reason, request.direct.deadline)
        member["targetScope"] = list(scope)
        events.extend(changes)
        accepted.append(member)
    # Restoring a valid pair retains the assignment identity, with the new policy/command lineage.
    for m in accepted:
        if m["assetId"] in kept:
            saved = kept[m["assetId"]]
            a = next(a for a in fleet["assignments"] if a["id"] == saved["id"])
            a.clear(); a.update(saved, policyId=m["id"], commandId=request.command_id)
            m.update(state="pursuing", assignmentId=a["id"], reason=f'Intercept assigned to {frame["entities"][a["targetId"]]["label"]}.')
            events = [e for e in events if e["extensions"]["sentinel.behavior"].get("assignmentId") != a["id"]]
    used_targets = {a["targetId"] for a in fleet["assignments"] if a["state"] == "active"}
    pairs = []
    for m in accepted:
        if m["state"] == "pursuing":
            continue
        origin = frame["tracks"][m["controlTrackId"]]["latest"]["position"]
        legal = []
        for eid, t in targets.items():
            reason = pursuit_blocked(frame, origin, t["latest"]["position"])
            if not reason:
                pairs.append((distance(origin, t["latest"]["position"], geometry=frame), eid, m["assetId"]))
            legal.append(reason)
        if legal and all(legal):
            m.update(state="blocked", reason=next(r for r in legal if r))
    by_asset = {m["assetId"]:m for m in accepted}
    for _, target_id, asset_id in sorted(pairs):
        m = by_asset[asset_id]
        if m["state"] == "pursuing" or target_id in used_targets:
            continue
        a = dict(id=identity(run["runId"], request.command_id, asset_id, target_id), policyId=m["id"], commandId=request.command_id,
            assetId=asset_id, interceptorId=m["entityId"], targetId=target_id, targetTrackId=targets[target_id]["id"],
            createdSequence=frame["sequence"]+1, state="active")
        fleet["assignments"].append(a)
        used_targets.add(target_id)
        m.update(state="pursuing", assignmentId=a["id"], reason=f'Intercept assigned to {frame["entities"][target_id]["label"]}.')
    for m in accepted:
        o = dict(assetId=m["assetId"], entityId=m["entityId"], outcome="accepted", code="OK", state=m["state"], reason=m["reason"])
        if m.get("assignmentId"):
            o["assignmentId"] = m["assignmentId"]
        outcomes.append(o)
    by_id = {o["assetId"]:o for o in outcomes}
    outcomes = [by_id[m.asset_id] for m in request.direct.members]
    events.append(event(frame, "intercept-approach", [m["entityId"] for m in accepted], commandId=request.command_id,
        order=request.direct.order, anchor=anchor, targetScope=scope, acquisitionRadiusM=250.0, outcomes=outcomes))
    return events, outcomes, scope


def binding_reason(frame, member):
    run = frame["interactive"]
    c = next((c for c in run["controls"] if c["assetId"] == member["assetId"]), None)
    if not c or (member["executorEpoch"], member["grantRevision"], member["bindingRevision"], member["reservationRevision"], member.get("controlTrackId")) != (run["executorEpoch"], run["grantRevision"], c["bindingRevision"], c["busyRevision"], c.get("controlTrackId")):
        return "Control binding, reservation or authority changed; reapply explicitly."
    if frame["entities"].get(member["entityId"], {}).get("affiliation") != "friendly" or "move-horizontal" not in c["capabilities"]:
        return "Controlled friendly movement authority unavailable."
    if member["policy"] == "intercept" and "demo-intercept" not in c["capabilities"]:
        return "Intercept capability revoked."
    reason = movement.direct_member_reason(frame, c)
    return reason[1] if reason else None


def revalidate(frame, checkpoint):
    from app.commands import rts_behavior
    rts = rts_behavior.enabled(checkpoint)
    events = rts_behavior.revalidate(frame, checkpoint) if rts else []
    for m in checkpoint.get("fleetBehavior", {}).get("members", []):
        if m["state"] not in ACTIVE or (rts and m["policy"] == "intercept"):
            continue
        reason = binding_reason(frame, m)
        origin = frame["tracks"].get(m.get("controlTrackId"), {}).get("latest", {}).get("position")
        if m["state"] == "patrolling" and not reason:
            route = m["patrol"]
            if geometry_hash(frame, route["boundaryId"]) != route["geometryHash"]:
                reason = "Patrol boundary changed or was deleted. Hold; explicitly reapply Patrol."
            else:
                from app.commands.zone_rules import blocked
                reason = blocked(frame, origin, route["loop"][route["waypoint"]])
                for a, b in zip(route["loop"], route["loop"][1:]+route["loop"][:1]):
                    reason = reason or blocked(frame, a, b)
        if m["state"] == "pursuing" and not reason:
            a = next(a for a in checkpoint["fleetBehavior"]["assignments"] if a["id"] == m["assignmentId"])
            target = source_track(frame, a["targetId"], "hostile")
            reason = "Target unavailable, stale or non-operational; held reserve. Choose another area explicitly." if target is None or target["id"] != a["targetTrackId"] else pursuit_blocked(frame, origin, target["latest"]["position"])
        if reason:
            events.extend(halt(frame, checkpoint, m["assetId"], reason, "blocked", disarm=False))
            events.append(event(frame, "held", [m["entityId"]], policyId=m["id"], reason=reason))
    return events


def advance(frame, checkpoint, before, now):
    fleet = checkpoint.get("fleetBehavior")
    if not fleet:
        return []
    events = []
    for m in fleet["members"]:
        if m["state"] in {"patrolling", "pursuing"} and m.get("deadline") and m.get("startedTick") is None and now >= m["deadline"]:
            events.extend(halt(frame, checkpoint, m["assetId"], "Initial behavior execution expired. Apply a fresh decision.", "blocked"))
            events.append(event(frame, "expired", [m["entityId"]], policyId=m["id"]))
    if frame["interactive"]["state"] != "running":
        return events
    # Admission and all pursuit steering use one PRE-STEP committed situation.
    if fleet["ruleVersion"] == "local-fleet-v1":
        events.extend(revalidate(before, checkpoint))
    from app.commands import rts_behavior
    from app.commands.unit_profiles import entity_speed
    for m in fleet["members"]:
        if m["state"] not in {"patrolling", "pursuing"}:
            continue
        track = frame["tracks"][m["controlTrackId"]]
        origin = before["tracks"][m["controlTrackId"]]["latest"]["position"]
        if m["state"] == "pursuing":
            a = next(a for a in fleet["assignments"] if a["id"] == m["assignmentId"])
            target_before = before["tracks"][a["targetTrackId"]]["latest"]["position"]
            target_after = frame["tracks"][a["targetTrackId"]]["latest"]["position"]
            reason = pursuit_blocked(frame, target_before, target_after)
            if reason:
                events.extend(rts_behavior.release(frame, checkpoint, m, reason) if rts_behavior.enabled(checkpoint) else halt(frame, checkpoint, m["assetId"], reason, "blocked", disarm=False))
                continue
            destination = {**target_before, "altitude": deepcopy(origin["altitude"])}
        else:
            destination = m["patrol"]["loop"][m["patrol"]["waypoint"]]
        motion = dict(origin=origin, destination=destination, travelledMetres=0.0, speedMps=entity_speed(frame, m["entityId"], m["state"] == "pursuing") if rts_behavior.enabled(checkpoint) else fleet["model"]["speedMps"])
        position, velocity = step(motion, geometry=frame)
        from app.commands.zone_rules import blocked
        reason = pursuit_blocked(frame, origin, position) if m["state"] == "pursuing" else blocked(frame, origin, position)
        if reason:
            events.extend(rts_behavior.release(frame, checkpoint, m, reason) if rts_behavior.enabled(checkpoint) and m["state"] == "pursuing" else halt(frame, checkpoint, m["assetId"], reason, "blocked", disarm=False))
            continue
        m.setdefault("startedTick", frame["interactive"]["tick"])
        track["latest"].update(position=position, velocity=velocity)
        if m["state"] == "patrolling" and motion["remainingMetres"] == 0:
            route = m["patrol"]
            if route["entered"]:
                route["visitedWaypoints"] += 1
                route["completedLoops"] = route["visitedWaypoints"]//len(route["loop"])
            route["entered"] = True
            route["waypoint"] = (route["waypoint"]+1)%len(route["loop"])
    # A revalidation hold must also zero the candidate's velocity, not only its input copy.
    for m in fleet["members"]:
        if m["policy"] != "hold" and m["state"] in {"blocked", "reserve", "armed"}:
            t = frame["tracks"].get(m.get("controlTrackId"))
            if t and not any(e["entityId"] == m["entityId"] and e["state"] not in movement.TERMINAL for e in checkpoint["executions"]):
                t["latest"]["velocity"]["speedMps"] = 0.0
    return events
