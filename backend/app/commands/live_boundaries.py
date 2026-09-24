"""Pure run-bound boundary candidate transitions, committed by InteractiveService."""
from copy import deepcopy
from app.commands.errors import CommandError
from app.commands import movement, scheduler
from app.commands.kinematics import in_extent
from app.commands.zone_rules import blocked


def candidate(frame, mutation):
    run = frame["interactive"]
    if "boundary-edit" not in run["capabilities"]:
        raise CommandError("CONTROL_REQUIRED", "This source has not granted live boundary editing.")
    revision = frame.get("liveBoundaries", {}).get("revision", 0)
    if mutation.expected_revision != revision:
        raise CommandError("BOUNDARY_CONFLICT", "Live boundaries changed. Reload current boundaries before revising this edit.")
    result = deepcopy(frame)
    zones = result["zones"]
    rules = result.setdefault("boundaryRules", dict(ruleVersion="local-boundary-v1", zones={}))
    zid = mutation.boundary_id
    if not zid.startswith(f'{run["runId"]}:boundary:'):
        raise CommandError("REFERENCE_MISMATCH", "Boundary identity must belong to this run.")
    if mutation.operation == "delete":
        if zid not in rules["zones"]:
            raise CommandError("NOT_FOUND", "This boundary is no longer in the effective run set.")
        del zones[zid]
        del rules["zones"][zid]
    else:
        definition = mutation.definition
        from app.scenarios.geometry import validate
        try:
            validate(definition.vertices, definition.type, frame)
        except ValueError as error:
            raise CommandError("INVALID_REQUEST", str(error)) from error
        if zid != f'{run["runId"]}:boundary:{definition.id}':
            raise CommandError("REFERENCE_MISMATCH", "Boundary and geometry identities disagree.")
        if zid not in rules["zones"] and len(rules["zones"]) >= 16:
            raise CommandError("INVALID_REQUEST", "A demo supports at most 16 boundaries.")
        vertices = [list(v) for v in definition.vertices]
        zones[zid] = dict(id=zid, missionId=frame["mission"]["id"], label=definition.name, purpose=definition.type,
            geometry=dict(type="Polygon", coordinates=[vertices+vertices[:1]]),
            provenance=dict(source=dict(id=run["sourceId"],kind="simulation",mode="simulated"),
                effectiveAt=frame["effectiveAt"],recordedAt=frame["recordedAt"]))
        rules["zones"][zid] = definition.type
        if definition.type == "keep_in" and sum(kind == "keep_in" for kind in rules["zones"].values()) > 1:
            raise CommandError("INVALID_REQUEST", "Use only one active Keep In boundary in this POC.")
        if definition.type == "restricted":
            # Only the proposed footprint: existing inconsistent positions stay honest.
            check = dict(interactive=run, zones={zid:zones[zid]}, boundaryRules=dict(zones={zid:"restricted"}))
            owned = [e for e in frame["entities"].values() if e["provenance"]["source"]["id"] == run["sourceId"] and e["presence"] != "removed"]
            for entity in owned:
                tracks = [t for t in frame["tracks"].values() if t["entityId"] == entity["id"] and t["source"] == dict(id=run["sourceId"],kind="simulation",mode="simulated")]
                if len(tracks) != 1 or tracks[0]["state"] != "tracking" or not in_extent(tracks[0]["latest"]["position"], geometry=frame):
                    raise CommandError("POSITION_UNAVAILABLE", f'{entity["label"]}: current source position is unavailable; cannot activate a Restricted boundary.')
                reason = blocked(check, tracks[0]["latest"]["position"])
                if reason:
                    raise CommandError("ENDPOINT_INVALID", f'{entity["label"]} is inside/on the proposed Restricted boundary. Revise the boundary; actors are never repositioned.')
        if definition.type == "keep_in":
            # The gate applies to explicitly controlled friendly drones, not hostile observations.
            check = dict(interactive=run, zones={zid:zones[zid]}, boundaryRules=dict(zones={zid:"keep_in"}))
            for control in run["controls"]:
                entity = frame["entities"].get(control["entityId"])
                if not entity or entity["presence"] != "present":
                    continue
                track = frame["tracks"].get(control["controlTrackId"])
                if not track or track["state"] != "tracking" or not in_extent(track["latest"]["position"], geometry=frame):
                    raise CommandError("POSITION_UNAVAILABLE", f'{entity["label"]}: current source position is unavailable; cannot activate a Keep In boundary.')
                if blocked(check, track["latest"]["position"]):
                    raise CommandError("ENDPOINT_INVALID", f'{entity["label"]} is outside/on the proposed Keep In boundary. Revise it; actors are never repositioned.')
    result["mission"]["zoneIds"] = list(zones)
    return result, revision + 1


def apply(frame, checkpoint, mutation, command_id):
    result, revision = candidate(frame, mutation)
    frame.update(result)
    frame["liveBoundaries"] = dict(ruleVersion="local-boundary-v1",runId=frame["interactive"]["runId"],
        sourceId=frame["interactive"]["sourceId"],revision=revision,lastCommandId=command_id,committedSequence=frame["sequence"]+1)
    events = []
    for execution in checkpoint["executions"]:
        if execution.get("kind") != "move" or execution["state"] in movement.TERMINAL:
            continue
        track = frame["tracks"].get(execution["controlTrackId"])
        reason = blocked(frame, track["latest"]["position"], execution["destination"]) if track else "Source position unavailable."
        if reason:
            movement.terminate(frame, execution, "Failed", "Live boundary change: " + reason)
    schedule = checkpoint.get("scenarioSchedule")
    if schedule:
        for item in schedule["actions"]:
            if item["state"] not in scheduler.ACTIVE:
                continue
            track = frame["tracks"].get(item["trackId"])
            reason = blocked(frame, track["latest"]["position"], item["motion"]["destination"],
                             enforce_keep_in=scheduler.controlled(frame, item)) if track else "Source position unavailable."
            if reason:
                events.extend(scheduler.halt(frame, item, "Failed", "Live boundary change: " + reason))
        events.extend(scheduler.resolve_broken(frame, schedule))
    events.append(dict(effectiveAt=frame["effectiveAt"],type="boundary.changed",severity="info",
        source=dict(id=frame["interactive"]["sourceId"],kind="simulation",mode="simulated"),
        extensions={"sentinel.boundary":dict(requestId=command_id,revision=revision,mutation=mutation.model_dump(by_alias=True,exclude_none=True))}))
    checkpoint["liveBoundaries"] = deepcopy(frame["liveBoundaries"])
    return events
