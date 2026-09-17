"""Candidate movement transitions, composed by InteractiveService's single writer."""
from datetime import datetime
from app.commands.kinematics import step
from app.commands.zone_rules import blocked

TERMINAL = {"Completed", "Cancelled", "Failed", "Expired", "Interrupted"}


def age(newer, older):
    return (datetime.fromisoformat(newer.replace("Z", "+00:00")) - datetime.fromisoformat(older.replace("Z", "+00:00"))).total_seconds()


def controls_for(frame, entity_id):
    return [c for c in frame["interactive"]["controls"] if c["entityId"] == entity_id]


def control_reason(frame, control, now, ignore_busy=False):
    run = frame["interactive"]
    if run["state"] != "running":
        return "INVALID_TRANSITION", "Source must be running."
    if not run.get("lastReportAt") or age(now, run["lastReportAt"]) > 2:
        return "SOURCE_UNHEALTHY", "No current source report within two seconds."
    if len(controls_for(frame, control["entityId"])) != 1:
        return "SELECTION_INVALID", "Ambiguous Asset/control binding."
    if "move-horizontal" not in control["capabilities"]:
        return "CONTROL_REQUIRED", "No horizontal movement capability."
    entity, asset = frame["entities"].get(control["entityId"]), frame["assets"].get(control["assetId"])
    if not entity or entity["presence"] != "present" or entity["condition"] != "operational" or not asset or asset["availability"] != "available":
        return "SELECTION_INVALID", "Entity or Asset is unavailable for movement."
    track = frame["tracks"].get(control.get("controlTrackId"))
    if not track or track["state"] != "tracking" or age(frame["effectiveAt"], track["latest"]["timestamp"]) > 1:
        return "POSITION_UNAVAILABLE", "Control position is missing or stale."
    if track["source"]["id"] != control["sourceId"] or track["entityId"] != control["entityId"]:
        return "BINDING_CHANGED", "Control Track/source binding changed."
    altitude = track["latest"]["position"]["altitude"]
    if altitude["reference"] != "ELLIPSOID" or altitude.get("datumId") != "WGS84":
        return "UNSUPPORTED_REFERENCE", "Movement requires supplied ELLIPSOID/WGS84 height."
    zone_reason = blocked(frame, track["latest"]["position"])
    if zone_reason:
        return "ENDPOINT_INVALID", zone_reason
    if not ignore_busy and any(e["assetId"] == control["assetId"] and e["state"] not in TERMINAL for e in run.get("executions", [])):
        return "ASSET_BUSY", "Asset is busy; Cancel its execution and wait for termination."
    return None


def direct_member_reason(frame, control):
    """Availability is evidence, not affiliation or the existence of a display Track."""
    entity = frame["entities"].get(control["entityId"])
    asset = frame["assets"].get(control["assetId"])
    if not entity or entity["presence"] == "removed":
        return "UNAVAILABLE", "Entity is no longer present."
    if entity["condition"] == "non-operational":
        return "UNAVAILABLE", "Down: reported non-operational."
    if entity["presence"] != "present":
        return "NO_RESPONSE", "No response."
    track = frame["tracks"].get(control.get("controlTrackId"))
    if not track:
        return "POSITION_UNAVAILABLE", "No known control position."
    if track["state"] != "tracking" or age(frame["effectiveAt"], track["latest"]["timestamp"]) > 1:
        return "NO_RESPONSE", "No response: control observation is stale."
    altitude = track["latest"]["position"]["altitude"]
    if altitude["reference"] != "ELLIPSOID" or altitude.get("datumId") != "WGS84":
        return "UNSUPPORTED_REFERENCE", "Unsupported altitude reference."
    if entity["condition"] != "operational" or not asset or asset["availability"] != "available" or "move-horizontal" not in control["capabilities"]:
        return "UNAVAILABLE", "Unavailable for movement."
    return None


def transition(execution, state, reason=None):
    if execution["state"] != state:
        execution["revision"] += 1
    execution["state"] = state
    if reason:
        execution["reason"] = reason


def terminate(frame, execution, state, reason):
    if execution["state"] in TERMINAL:
        return
    transition(execution, state, reason)
    execution["terminalSequence"] = frame["sequence"] + 1
    control = next((c for c in frame["interactive"]["controls"] if c["assetId"] == execution["assetId"]), None)
    if control:
        control["busyRevision"] += 1
    track = frame["tracks"].get(execution["controlTrackId"])
    if track:
        track["latest"]["velocity"] = {"speedMps": 0.0, "headingTrueDeg": track["latest"].get("velocity", {}).get("headingTrueDeg", 0.0)}


def project(frame, checkpoint, now):
    bound_assets = {c["assetId"] for c in frame["interactive"]["controls"]}
    checkpoint["directOrders"] = {asset_id: value for asset_id, value in checkpoint.get("directOrders", {}).items()
                                 if asset_id in bound_assets}
    executions = [e for e in checkpoint["executions"] if e.get("kind") == "move"]
    active = [e for e in executions if e["state"] not in TERMINAL]
    terminal = sorted((e for e in executions if e["state"] in TERMINAL), key=lambda e: (e["terminalSequence"], e["acceptedSequence"], e["id"]))
    retained = active + terminal[-(64 - len(active)):]
    checkpoint["executions"] = retained + [e for e in checkpoint["executions"] if e.get("kind") != "move"]
    checkpoint["schemaVersion"] = "1.3"
    frame["interactive"]["executions"] = retained
    if "cancel" not in frame["interactive"]["supportedActions"]:
        frame["interactive"]["supportedActions"].append("cancel")
    for c in frame["interactive"]["controls"]:
        c.setdefault("busyRevision", 0)
        prior = checkpoint.get("directOrders", {}).get(c["assetId"])
        if prior:
            c["lastDirectOrder"] = prior
        track = frame['tracks'].get(c.get('controlTrackId'))
        zone_reason = blocked(frame, track['latest']['position']) if track else None
        reason = ("ENDPOINT_INVALID", zone_reason) if zone_reason else control_reason(frame, c, now, ignore_busy=True)
        c.update(eligible=reason is None, reason=reason[1] if reason else "Eligible for horizontal movement.")


def advance(frame, checkpoint, now):
    """Called even when paused: initial-execution expiry uses elapsed backend time."""
    events = []
    run = frame["interactive"]
    for e in checkpoint["executions"]:
        if e.get("kind") != "move" or e["state"] in TERMINAL:
            continue
        before = e["state"]
        control = next((c for c in run["controls"] if c["assetId"] == e["assetId"]), None)
        if not e.get("startedAt") and now >= e["deadline"]:
            terminate(frame, e, "Expired", "Initial execution deadline elapsed.")
        elif run["state"] == "running":
            reason = control_reason(frame, control, now, True) if control else ("BINDING_CHANGED", "Control binding missing.")
            if e["executorEpoch"] != run["executorEpoch"]:
                terminate(frame, e, "Interrupted", "Executor epoch changed.")
            elif e["grantRevision"] != run["grantRevision"]:
                terminate(frame, e, "Cancelled", "Capability explicitly revoked.")
            elif reason or not control or (e["bindingRevision"], e["reservationRevision"], e["controlTrackId"], e["sourceId"]) != (control["bindingRevision"], control["busyRevision"], control.get("controlTrackId"), control["sourceId"]):
                terminate(frame, e, "Failed", reason[1] if reason else "Binding or reservation changed.")
            else:
                if not e.get("startedAt"):
                    e.update(startedAt=frame["effectiveAt"], startedTick=run["tick"])
                transition(e, "Running")
                candidate = dict(e)
                position, velocity = step(candidate)
                track = frame["tracks"][e["controlTrackId"]]
                zone_reason = blocked(frame, track["latest"]["position"], position)
                if zone_reason:
                    terminate(frame, e, "Failed", zone_reason)
                else:
                    e.update(candidate)
                    track["latest"].update(position=position, velocity=velocity)
                if not zone_reason and e["remainingMetres"] == 0:
                    terminate(frame, e, "Completed", "Destination reached in a committed source sample.")
                    e["completionSample"] = {"sequence": frame["sequence"] + 1, "trackId": e["controlTrackId"], "timestamp": frame["effectiveAt"], "position": position}
        if e["state"] != before:
            events.append({"effectiveAt": frame["effectiveAt"], "type": f'movement.{e["state"].lower()}', "severity": "info",
                           "entityIds": [e["entityId"]], "source": {"id": run["sourceId"], "kind": "simulation", "mode": "simulated"},
                           "extensions": {"sentinel.movement": {"executionId": e["id"], "commandId": e["commandId"], "reason": e.get("reason")}}})
    return events
