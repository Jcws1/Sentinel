"""Deterministic candidate transitions. Only InteractiveService commits or publishes.

Source work has no lease or HTTP deadline. Its immutable actor binding is not an
AssetControl and cannot be used to submit live commands.
"""
from copy import deepcopy
from app.commands.unit_profiles import entity_speed, profile
from app.commands.kinematics import cruise_speed, distance, step, in_extent
from app.commands.zone_rules import blocked

TERMINAL = {"Completed", "Skipped", "Failed", "Cancelled", "Interrupted"}
ACTIVE = {"Accepted", "Running"}


def freeze(content, frame):
    if content.actions is None:
        return None
    run = frame["interactive"]
    return dict(ruleVersion=content.schedule_rule_version, runId=run["runId"], sourceId=run["sourceId"],
                executorEpoch=run["executorEpoch"], startConsumed=False, manualOverrides=[],
                actions=[dict(action=a.model_dump(by_alias=True, exclude_none=True), entityId=frame["scenario"]["entityIds"][a.unit_id],
                              trackId=f'{frame["scenario"]["entityIds"][a.unit_id]}:control', state="Pending", revision=0)
                         for a in content.actions])


def event(frame, item):
    return dict(effectiveAt=frame["effectiveAt"], type=f'script.{item["state"].lower()}', severity="info",
                entityIds=[item["entityId"]], source=dict(id=frame["interactive"]["sourceId"], kind="simulation", mode="simulated"),
                extensions={"sentinel.script": dict(actionId=item["action"]["id"], state=item["state"],
                    tick=frame["interactive"]["tick"], reason=item.get("reason"), executionId=item.get("motion", {}).get("id"))})


def transition(frame, item, state, reason=None):
    item.update(state=state, revision=item["revision"] + 1)
    if reason:
        item["reason"] = reason
    if state in TERMINAL:
        item.update(terminalTick=frame["interactive"]["tick"], terminalSequence=frame["sequence"] + 1)


def halt(frame, item, state, reason):
    if item["state"] in TERMINAL:
        return []
    was_active = item["state"] in ACTIVE
    transition(frame, item, state, reason)
    track = frame["tracks"].get(item["trackId"])
    if was_active and track:
        track["latest"]["velocity"] = dict(speedMps=0.0, headingTrueDeg=track["latest"].get("velocity", {}).get("headingTrueDeg", 0.0))
    return [event(frame, item)]


def terminate_all(frame, checkpoint, state, reason):
    schedule = checkpoint.get("scenarioSchedule")
    events = []
    if schedule:
        for item in schedule["actions"]:
            events.extend(halt(frame, item, state, reason))
        schedule["executorEpoch"] = frame["interactive"]["executorEpoch"]
    return events


def override(frame, checkpoint, entity_id, manual=True):
    schedule = checkpoint.get("scenarioSchedule")
    if not schedule:
        return []
    events = []
    for item in schedule["actions"]:
        if item["entityId"] != entity_id:
            continue
        if manual and item["state"] in ACTIVE:
            events.extend(halt(frame, item, "Cancelled", "Superseded by live operator control; Manual override."))
        elif not manual and item["state"] == "Pending" and (due_tick(schedule, item) is not None and due_tick(schedule, item) <= frame["interactive"]["tick"]):
            events.extend(halt(frame, item, "Skipped", "Return to script enables only actions strictly after the current tick."))
    ids = set(schedule["manualOverrides"])
    ids.add(entity_id) if manual else ids.discard(entity_id)
    schedule["manualOverrides"] = sorted(ids)
    events.extend(resolve_broken(frame, schedule))
    return events


def due_tick(schedule, item):
    action = item["action"]
    if action.get("offsetMs") is not None:
        return action["offsetMs"] // 200
    previous = next((e for e in schedule["actions"] if e["action"]["id"] == action.get("afterActionId")), None)
    if previous and previous["state"] == "Completed":
        return previous["terminalTick"] + max(1, action["delayMs"] // 200)
    return None


def resolve_broken(frame, schedule):
    """Resolve a linear chain to a fixed point in this same candidate transaction."""
    events = []
    by_id = {e["action"]["id"]: e for e in schedule["actions"]}
    for _ in range(len(by_id)):
        changed = False
        for item in schedule["actions"]:
            previous = by_id.get(item["action"].get("afterActionId"))
            if item["state"] == "Pending" and previous and previous["state"] in TERMINAL - {"Completed"}:
                events.extend(halt(frame, item, "Skipped", f'Previous movement {previous["action"]["id"]} is {previous["state"]}; completion dependency cannot start.'))
                changed = True
        if not changed:
            break
    return events


def source_reason(frame, schedule, item):
    run = frame["interactive"]
    if (schedule["runId"], schedule["sourceId"], schedule["executorEpoch"]) != (run["runId"], run["sourceId"], run["executorEpoch"]):
        return "Frozen source binding changed. Create a fresh run."
    if frame.get("scenario", {}).get("entityIds", {}).get(item["action"]["unitId"]) != item["entityId"]:
        return "Frozen scenario actor binding is unavailable."
    entity, track = frame["entities"].get(item["entityId"]), frame["tracks"].get(item["trackId"])
    if not entity or entity["condition"] != "operational" or entity["presence"] != "present":
        return "Script actor is unavailable or non-operational."
    if not track or track["state"] != "tracking" or track["entityId"] != item["entityId"] or track["source"] != dict(id=run["sourceId"], kind="simulation", mode="simulated"):
        return "Frozen source Track is unavailable; an observation cannot substitute for it."
    position = track["latest"]["position"]
    if position["altitude"]["reference"] != "ELLIPSOID" or position["altitude"].get("datumId") != "WGS84" or not in_extent(position, geometry=frame):
        return "Source position requires supplied WGS84 height inside the local extent."
    return blocked(frame, position)


def dispatch(frame, checkpoint, start=False):
    schedule = checkpoint.get("scenarioSchedule")
    if not schedule:
        return []
    if start:
        if schedule["startConsumed"]:
            return []
        schedule["startConsumed"] = True
    elif not schedule["startConsumed"]:
        return []
    events = resolve_broken(frame, schedule)
    tick = frame["interactive"]["tick"]
    due = [(due_tick(schedule, e), e) for e in schedule["actions"] if e["state"] == "Pending"]
    absolute_actors = {e["entityId"] for at, e in due if at is not None and at <= tick and e["action"].get("offsetMs") is not None}
    for at, item in sorted(due, key=lambda pair: (pair[0] if pair[0] is not None else 3001, pair[1]["action"]["ordinal"], pair[1]["action"]["id"])):
        if item["state"] != "Pending":
            continue
        if tick > 3000 and item["action"].get("afterActionId"):
            events.extend(halt(frame, item, "Skipped", "Completion-dependent start exceeded the 600 second authored-start window."))
            continue
        if at is None or at > tick:
            continue
        item["consumedTick"] = tick
        if item["action"].get("afterActionId") and item["entityId"] in absolute_actors:
            events.extend(halt(frame, item, "Skipped", "Start conflict: an explicit-time movement has precedence at this tick."))
            continue
        if item["entityId"] in schedule["manualOverrides"]:
            events.extend(halt(frame, item, "Skipped", "Manual override: use Return to script for later actions."))
            continue
        reason = source_reason(frame, schedule, item)
        track = frame["tracks"].get(item["trackId"])
        origin = deepcopy(track["latest"]["position"]) if track else None
        target = {**item["action"]["destination"], "altitude": deepcopy(origin["altitude"])} if origin else None
        if not reason:
            reason = blocked(frame, origin, target)
        if reason:
            events.extend(halt(frame, item, "Failed", reason + " Previous valid movement is retained."))
            continue
        # Only a valid replacement supersedes the previous source execution.
        for previous in schedule["actions"]:
            if previous is not item and previous["entityId"] == item["entityId"] and previous["state"] in ACTIVE:
                events.extend(halt(frame, previous, "Cancelled", f'Superseded by script action {item["action"]["id"]}.'))
        item["motion"] = dict(id=f'{schedule["runId"]}:script:{item["action"]["id"]}', origin=origin, destination=target,
                              acceptedTick=tick, acceptedSequence=frame["sequence"] + 1, travelledMetres=0.0,
                              remainingMetres=distance(origin, target, geometry=frame), speedMps=entity_speed(frame, item["entityId"]))
        transition(frame, item, "Accepted")
        events.append(event(frame, item))
    events.extend(resolve_broken(frame, schedule))
    return events


def advance(frame, checkpoint):
    if frame["interactive"]["state"] != "running":
        return []
    schedule = checkpoint.get("scenarioSchedule")
    if not schedule:
        return []
    events = dispatch(frame, checkpoint)
    for item in schedule["actions"]:
        if item["state"] not in ACTIVE:
            continue
        reason = source_reason(frame, schedule, item)
        if reason:
            events.extend(halt(frame, item, "Failed", reason))
            continue
        motion = item["motion"]
        # step replaces only scalar progress fields and reads origin/destination.
        # Keep a separate candidate for boundary refusal without recursively
        # copying the unchanged geometry on every live and nominal source tick.
        candidate = dict(motion)
        position, velocity = step(candidate, geometry=frame)
        track = frame["tracks"][item["trackId"]]
        reason = blocked(frame, track["latest"]["position"], position)
        if reason:
            events.extend(halt(frame, item, "Failed", reason))
            continue
        candidate.setdefault("startedTick", frame["interactive"]["tick"])
        item["motion"] = candidate
        track["latest"].update(position=position, velocity=velocity)
        if candidate["remainingMetres"] == 0:
            transition(frame, item, "Completed", "Destination reached in a committed source sample.")
            candidate["completionSample"] = dict(sequence=frame["sequence"] + 1, trackId=item["trackId"], timestamp=frame["effectiveAt"], position=deepcopy(position))
            events.append(event(frame, item))
        elif item["state"] != "Running":
            transition(frame, item, "Running")
            events.append(event(frame, item))
    events.extend(resolve_broken(frame, schedule))
    return events


def project(frame, checkpoint):
    checkpoint["schemaVersion"] = "1.5"
    schedule = checkpoint.get("scenarioSchedule")
    if schedule is not None:
        frame["scenarioSchedule"] = deepcopy(schedule)
    supported = frame["interactive"]["supportedActions"]
    if "boundary-edit" not in supported:
        supported.append("boundary-edit")
    if "boundary-edit" not in frame["interactive"]["capabilities"]:
        frame["interactive"]["capabilities"].append("boundary-edit")
    if "stop" not in supported:
        supported.append("stop")
    if schedule is not None and "return-to-script" not in supported:
        supported.append("return-to-script")


def nominal_plan(content):
    """Read-only deterministic dry run of the same rules, never execution authority."""
    if not content.actions:
        return []
    source = dict(id="nominal", kind="simulation", mode="simulated")
    zones = content.boundaries or []
    frame = dict(sequence=0, effectiveAt="2000-01-01T00:00:00.000Z",
        interactive=dict(runId="nominal", sourceId="nominal", executorEpoch="nominal", state="running", tick=0, templateId="singapore-local-v2"),
        scenario=dict(entityIds={u.id:u.id for u in content.units}),
        unitProfiles={u.id:profile(u.profile_id) for u in content.units if u.profile_id},
        entities={u.id:dict(condition="operational", presence="present") for u in content.units},
        tracks={f"{u.id}:control":dict(entityId=u.id, state="tracking", source=source,
            latest=dict(position=u.position.model_dump(by_alias=True))) for u in content.units},
        boundaryRules=dict(zones={b.id:b.type for b in zones}), zones={b.id:dict(label=b.name,
            geometry=dict(coordinates=[[list(v) for v in b.vertices]+[list(b.vertices[0])]])) for b in zones})
    if content.local_geometry is not None:
        frame["interactive"]["localGeometry"] = content.local_geometry.model_dump(by_alias=True)
    checkpoint = dict(scenarioSchedule=freeze(content, frame))
    dispatch(frame, checkpoint, start=True)
    # The slowest typed profile takes <3,200 ticks across the local diagonal.
    for tick in range(1, 6201):
        frame["interactive"]["tick"] = tick
        frame["sequence"] = tick
        advance(frame, checkpoint)
        if all(e["state"] in TERMINAL for e in checkpoint["scenarioSchedule"]["actions"]):
            break
    return checkpoint["scenarioSchedule"]["actions"]


def scenario_issues(content, plan=None):
    units = {u.id:u for u in content.units}
    return [dict(code="SCRIPT_PATH_BLOCKED" if item["state"] == "Failed" else "SCRIPT_TIMING_INVALID",
        actionId=item["action"]["id"], unitId=item["action"]["unitId"],
        message=f'{units[item["action"]["unitId"]].label}: {item.get("reason", "Unresolved movement")} Revise the action destination or timing.')
        for item in (nominal_plan(content) if plan is None else plan) if item["state"] in {"Failed", "Skipped", "Pending"}]
