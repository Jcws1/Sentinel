"""Fresh nonpositional Stop/Return; shared per-member order fence with direct Move."""
from app.commands.errors import CommandError
from app.commands import movement, scheduler


def validate(request, run, checkpoint):
    intent = request.intent
    if run.state not in {"running", "paused"}:
        raise CommandError("INVALID_TRANSITION", "Stop and Return require a running or paused demo.")
    if intent.action == "return-to-script" and checkpoint.get("scenarioSchedule") is None:
        raise CommandError("INVALID_TRANSITION", "This run has no authored script.")
    members = intent.members
    if len({m.asset_id for m in members}) != len(members) or len({m.entity_id for m in members}) != len(members):
        raise CommandError("SELECTION_INVALID", "Select each explicitly controlled actor once.")
    for member in members:
        controls = [c for c in run.controls if c.asset_id == member.asset_id]
        if len(controls) != 1 or len([c for c in run.controls if c.entity_id == member.entity_id]) != 1:
            raise CommandError("CONTROL_REQUIRED", "Stop and Return require explicit source-bound control.")
        control = controls[0]
        if any(getattr(member, field) != getattr(control, field) for field in
                ("entity_id", "executor_id", "source_id", "control_track_id", "grant_id", "binding_revision")):
            raise CommandError("BINDING_CHANGED", "Captured live-control capability or binding changed.")
    context = dict(holderId=request.holder_id, executorEpoch=run.executor_epoch, grantId=run.grant_id, grantRevision=run.grant_revision)
    outcomes = []
    for member in members:
        control = next(c for c in run.controls if c.asset_id == member.asset_id)
        previous = checkpoint.get("directOrders", {}).get(member.asset_id)
        stale = previous and all(previous.get(k) == v for k, v in context.items()) and intent.order <= previous["order"]
        unavailable = "move-horizontal" not in control.capabilities
        outcomes.append(dict(assetId=member.asset_id, entityId=member.entity_id, outcome="skipped" if stale or unavailable else "accepted",
                             code="ORDER_SUPERSEDED" if stale else "UNAVAILABLE" if unavailable else "OK",
                             reason="A newer operator order is already accepted." if stale else
                                 "Selected controlled member has no movement capability; skipped." if unavailable else
                                 "Holding committed position; Manual override." if intent.action == "stop" else
                                 "Manual override cleared; only future pending script actions are eligible."))
    return outcomes, {**context, "order": intent.order}


def apply(frame, checkpoint, action, outcomes, context):
    events = []
    for outcome in outcomes:
        if outcome["outcome"] != "accepted":
            continue
        for execution in checkpoint["executions"]:
            if execution.get("kind") == "move" and execution["assetId"] == outcome["assetId"]:
                movement.terminate(frame, execution, "Cancelled", f'Operator {action}, order {context["order"]}.')
        events.extend(scheduler.override(frame, checkpoint, outcome["entityId"], action == "stop"))
        control = next(c for c in frame["interactive"]["controls"] if c["assetId"] == outcome["assetId"])
        # Fence reviewed movement even when there was no active execution.
        control["busyRevision"] += 1
        checkpoint.setdefault("directOrders", {})[control["assetId"]] = dict(context)
        track = frame["tracks"].get(control.get("controlTrackId"))
        if track and (action == "stop" or not any(e["entityId"] == outcome["entityId"] and e["state"] in scheduler.ACTIVE for e in checkpoint.get("scenarioSchedule", {}).get("actions", []))):
            track["latest"]["velocity"] = dict(speedMps=0.0, headingTrueDeg=track["latest"].get("velocity", {}).get("headingTrueDeg", 0.0))
    return events
