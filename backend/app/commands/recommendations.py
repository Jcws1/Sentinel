"""Bounded, read-only options over existing commands; never an allocator/writer."""
from hashlib import sha256
from datetime import datetime, timedelta
import json

from app.commands import behaviors, movement
from app.commands.behavior_contracts import BehaviorPolicy
from app.commands.behavior_geometry import pursuit_blocked
from app.commands.contracts import DirectMoveMember, RecommendationSet
from app.commands.errors import CommandError
from app.commands.kinematics import distance
from app.world.serialization import canonical

TTL_SECONDS = 15
MAX_SETS = 128


def binding(control):
    return DirectMoveMember(**{key: control.get(key) for key in
        ("assetId", "entityId", "executorId", "sourceId", "controlTrackId", "grantId", "bindingRevision")})


def source_current(frame, now):
    run = frame["interactive"]
    return run["state"] != "running" or bool(run.get("lastReportAt") and 0 <= movement.age(now, run["lastReportAt"]) <= 2)


def member_reason(frame, entity_id):
    entity = frame["entities"].get(entity_id)
    controls = [c for c in frame["interactive"]["controls"] if c["entityId"] == entity_id]
    if not entity:
        return "Entity is no longer in this run."
    if entity["affiliation"] != "friendly":
        return "Only explicitly controlled friendly drones are eligible."
    if len(controls) != 1:
        return "Observation only; no explicit control binding."
    if entity["condition"] != "operational":
        return "NON-OP; no new action offered."
    if entity["presence"] != "present":
        return "Entity is not present."
    if frame["assets"].get(controls[0]["assetId"], {}).get("availability") != "available":
        return "Controlled asset is unavailable."
    if "move-horizontal" not in controls[0]["capabilities"]:
        return "Binding has no movement capability."
    return None


def eligible_pairs(frame, entity_ids):
    """The existing proximity/geometry predicates, without allocating anything."""
    fleet = frame.get("fleetBehavior")
    if not fleet or fleet["ruleVersion"] != "local-fleet-v2":
        return []
    occupied = {a["targetId"] for a in fleet["assignments"] if a["state"] == "active"}
    targets = [(eid, behaviors.source_track(frame, eid, "hostile")) for eid in sorted(frame["entities"])
               if eid not in occupied]
    pairs = []
    for c in sorted(frame["interactive"]["controls"], key=lambda c: c["assetId"]):
        if c["entityId"] not in entity_ids or member_reason(frame, c["entityId"]) or "demo-intercept" not in c["capabilities"]:
            continue
        if movement.direct_member_reason(frame, c):
            continue
        origin = frame["tracks"][c["controlTrackId"]]["latest"]["position"]
        for eid, track in targets:
            if track:
                point = track["latest"]["position"]
                if distance(origin, point, geometry=frame) <= fleet["model"]["acquisitionRadiusM"] + fleet["model"]["toleranceM"] and not pursuit_blocked(frame, origin, point):
                    pairs.append((c["assetId"], eid))
    return pairs


def fingerprint(frame, checkpoint, entity_ids, now):
    """Stable across ordinary position/time updates, sensitive to admission facts."""
    run = frame["interactive"]
    controls = [c for c in run["controls"] if c["entityId"] in entity_ids]
    fleet = frame.get("fleetBehavior", {})
    facts = dict(
        run={k: run.get(k) for k in ("runId", "executorEpoch", "sourceId", "grantId", "grantRevision", "runRevision", "state", "capabilities")},
        holder=run["lease"].get("holderId"), controls=controls,
        entities=[(eid, {k: frame["entities"].get(eid, {}).get(k) for k in
            ("id", "label", "affiliation", "condition", "presence", "provenance")}, member_reason(frame, eid)) for eid in entity_ids],
        assets=[{k: frame["assets"].get(c["assetId"], {}).get(k) for k in
            ("id", "entityId", "availability", "capabilities")} for c in controls],
        sourceCurrent=source_current(frame, now),
        supported=[(c["entityId"], movement.direct_member_reason(frame, c)) for c in controls],
        boundaries=frame.get("boundaryRules"), liveBoundaries=frame.get("liveBoundaries"),
        zones=frame.get("zones"),
        orders=[checkpoint.get("directOrders", {}).get(c["assetId"]) for c in controls],
        policies=[{k: m.get(k) for k in ("id", "entityId", "policy", "state", "assignmentId", "bindingRevision", "reservationRevision")}
                  for m in fleet.get("members", []) if m["entityId"] in entity_ids],
        assignments=[a for a in fleet.get("assignments", []) if a["state"] == "active"],
        executions=[{k: e.get(k) for k in ("id", "entityId", "revision", "state", "suspendedBy")}
                    for e in run.get("executions", []) if e["entityId"] in entity_ids and e["state"] not in movement.TERMINAL],
        overrides=sorted(checkpoint.get("scenarioSchedule", {}).get("manualOverrides", [])),
        script=[{k: a.get(k) for k in ("id", "entityId", "state", "executionId")}
                for a in checkpoint.get("scenarioSchedule", {}).get("actions", []) if a["entityId"] in entity_ids],
        pairs=eligible_pairs(frame, entity_ids),
    )
    return sha256(json.dumps(facts, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def generate(frame, checkpoint, entity_ids, *, owns_control, now, expires_at, identity):
    run, fleet = frame["interactive"], frame.get("fleetBehavior", {})
    selected = sorted(entity_ids)
    controls = sorted((c for c in run["controls"] if c["entityId"] in selected and not member_reason(frame, c["entityId"])), key=lambda c: c["assetId"])
    policies = {m["entityId"]: m for m in fleet.get("members", [])}
    active = {e["entityId"] for e in run.get("executions", []) if e["state"] not in movement.TERMINAL}
    schedule = checkpoint.get("scenarioSchedule", {})
    overrides = set(schedule.get("manualOverrides", []))
    scripted = {a["entityId"] for a in schedule.get("actions", []) if a["state"] in {"Pending", "Accepted", "Running"}}
    members = []
    for eid in selected:
        p = policies.get(eid, {})
        state = "Intercept" if p.get("policy") == "intercept" else "Patrol" if p.get("policy") == "patrol" else "Manual"
        state += " · pursuing" if p.get("state") == "pursuing" else " · moving" if eid in active else " · holding"
        if eid in overrides:
            state += " · script override"
        elif eid in scripted:
            state = "Script active / pending"
        reason = member_reason(frame, eid)
        control = next((c for c in controls if c["entityId"] == eid), None)
        pose_reason = movement.direct_member_reason(frame, control) if control else None
        if pose_reason:
            state += f" · Pose limitation: {pose_reason[1]}"
        members.append(dict(entityId=eid, label=frame["entities"].get(eid, {}).get("label", eid)[:256],
                            available=reason is None, state=state, **({"exclusion": reason} if reason else {})))
    targets = sorted({target for _, target in eligible_pairs(frame, selected)})
    assignments = sum(a["state"] == "active" and a["interceptorId"] in selected for a in fleet.get("assignments", []))
    unavailable = ("This run has ended." if run["state"] == "ended" else
        "Start the demo before applying suggestions." if run["state"] == "ready" else
        "Acquire or reclaim control using Simulation first." if not owns_control else
        "Current source data is unavailable; refresh after recovery." if not source_current(frame, now) else
        "Legacy fleet rules: open a new run for current Suggestions." if fleet.get("ruleVersion") != "local-fleet-v2" else None)
    options = []

    base_reasons = {m["entityId"]: ("excluded", m["exclusion"]) for m in members if m.get("exclusion")}

    def unchanged_details(ids, reasons, fallback):
        return [dict(entityId=eid, disposition=base_reasons.get(eid, reasons.get(eid, ("unchanged", fallback)))[0],
                     reason=base_reasons.get(eid, reasons.get(eid, ("unchanged", fallback)))[1]) for eid in ids]

    def add(key, title, explanation, candidates, operation="behavior", policy=None, consequences=(), reasons=None,
            unchanged_reason="Existing orders remain unchanged."):
        if not candidates or len(options) >= 3:
            return
        outcomes = [dict(assetId=c["assetId"], entityId=c["entityId"], outcome="accepted", code="OK", reason="Reviewed existing action.") for c in candidates]
        reasons = dict(reasons or {})
        if policy:
            try:
                results, _ = behaviors.validate_policy(frame, checkpoint, BehaviorPolicy.model_validate(policy), outcomes)
            except CommandError:
                return
            admitted = {r["assetId"] for r in results if r["outcome"] == "accepted"}
            reasons.update({r["entityId"]: ("excluded", r["reason"]) for r in results if r["outcome"] != "accepted"})
            candidates = [c for c in candidates if c["assetId"] in admitted]
        if not candidates:
            return
        affected = {c["entityId"] for c in candidates}
        unchanged = [eid for eid in selected if eid not in affected]
        options.append(dict(id=key, title=title.format(count=len(candidates)), explanation=explanation,
            consequences=list(consequences), unchangedEntityIds=unchanged,
            unchangedReasons=unchanged_details(unchanged, reasons, unchanged_reason),
            action=dict(operation=operation, members=[json.loads(canonical(binding(c))) for c in candidates], **({"policy": policy} if policy else {}))))

    if not unavailable:
        interceptors, intercept_reasons = [], {}
        for c in controls:
            eid = c["entityId"]
            pose_reason = movement.direct_member_reason(frame, c)
            if policies.get(eid, {}).get("policy") == "intercept":
                intercept_reasons[eid] = ("unchanged", "Intercept is already enabled; current orders retained.")
            elif "demo-intercept" not in c["capabilities"]:
                intercept_reasons[eid] = ("excluded", "This control binding has no Intercept capability.")
            elif pose_reason:
                intercept_reasons[eid] = ("excluded", pose_reason[1])
            else:
                interceptors.append(c)
        if targets:
            note = ("Existing destinations continue; unassigned members can still move.",
                    "One pursuer per target. Future assignments and outcomes are not guaranteed.",
                    "Establishes Manual override until Return to script.")
            add("intercept-all", "Enable Intercept · {count}", "Enable the existing proximity stance for these members. This does not issue a destination or reserve a target.", interceptors,
                policy={"kind": "intercept"}, consequences=note, reasons=intercept_reasons)
            if 0 < len(targets) < len(interceptors):
                add("intercept-subset", "Enable for {count} · leave others unchanged", "Use a smaller group matching the current unassigned target count. Members use stable ID order, not a tactical ranking. Unchanged members retain their current orders.", interceptors[:len(targets)],
                    policy={"kind": "intercept"}, consequences=note, reasons=intercept_reasons,
                    unchanged_reason="Not in this smaller group; existing orders retained, including any movement.")
        add("manual", "Use Manual · {count}", "Disarm Intercept or replace Patrol. An unfinished ordinary destination resumes where supported; this is not Stop.",
            [c for c in controls if policies.get(c["entityId"], {}).get("policy") in {"intercept", "patrol"}], policy={"kind": "hold"},
            consequences=("Establishes Manual override; future script actions are skipped.",),
            unchanged_reason="No Intercept or Patrol policy to replace; existing orders retained.")
        add("stop", "Stop selected · {count}", "Stop movement at the committed positions, disarm Intercept and establish Manual override.",
            [c for c in controls if c["entityId"] in active or policies.get(c["entityId"], {}).get("policy") in {"intercept", "patrol"} or c["entityId"] in scripted and c["entityId"] not in overrides],
            operation="stop", consequences=("Future script actions are skipped until Return to script.",),
            unchanged_reason="No active movement, policy or pending script to stop and disarm.")
        add("return", "Return to script · {count}", "End manual work and clear override. Only unresolved future script actions may execute; skipped actions are not replayed.",
            [c for c in controls if c["entityId"] in overrides and c["entityId"] in scripted], operation="return-to-script",
            unchanged_reason="No unresolved script work under Manual override to return to.")
        if run["state"] == "running" and len(options) < 3:
            for zone in sorted(frame.get("boundaryRules", {}).get("zones", {})):
                if frame["boundaryRules"]["zones"][zone] != "patrol":
                    continue
                policy = dict(kind="patrol", boundaryId=zone, reviewedFrameId=frame["frameId"], deadline=expires_at)
                # Patrol uses its existing 30-second positional evidence. Advisory expiry is independently 15 seconds.
                policy["deadline"] = (datetime.fromisoformat(frame["recordedAt"].replace("Z", "+00:00")) + timedelta(seconds=30)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                feasible, patrol_reasons = [], {}
                for c in controls:
                    if policies.get(c["entityId"], {}).get("patrol", {}).get("boundaryId") == zone and policies.get(c["entityId"], {}).get("state") == "patrolling":
                        patrol_reasons[c["entityId"]] = ("unchanged", "Already patrolling this boundary; current orders retained.")
                        continue
                    try:
                        result, _ = behaviors.validate_policy(frame, checkpoint, BehaviorPolicy.model_validate(policy), [dict(assetId=c["assetId"], entityId=c["entityId"], outcome="accepted", code="OK", reason="Review")])
                        if result[0]["outcome"] == "accepted":
                            feasible.append(c)
                        else:
                            patrol_reasons[c["entityId"]] = ("excluded", result[0]["reason"])
                    except CommandError as error:
                        patrol_reasons[c["entityId"]] = ("excluded", error.message)
                add("patrol", "Patrol · {count}", f'Use the existing validated straight ingress and inset loop in {frame["zones"][zone].get("label", "Patrol boundary")}.', feasible,
                    policy=policy, reasons=patrol_reasons, consequences=("Replaces current movement and establishes Manual override.", "No route finding or terrain clearance is implied."))
                if feasible:
                    break
    options.append(dict(id="keep", title="Keep current orders", explanation="Make no change. Existing movement, policies and scripts continue according to the current run state.",
                        consequences=[], unchangedEntityIds=selected,
                        unchangedReasons=unchanged_details(selected, {}, "Current orders retained; no command submitted.")))
    situation = f'{len(controls)} available selected · {assignments} current assignments · {len(targets)} unassigned hostiles within the current proximity and boundary rules.'
    if not targets:
        situation += " No eligible unassigned targets in this snapshot."
    return RecommendationSet.model_validate(dict(id=identity, missionId=frame["mission"]["id"], runId=run["runId"], executorEpoch=run["executorEpoch"], sourceId=run["sourceId"],
        inputFrameId=frame["frameId"], sequence=frame["sequence"], createdAt=now, expiresAt=expires_at,
        fingerprint=fingerprint(frame, checkpoint, selected, now), selectedEntityIds=selected, members=members, eligibleTargetIds=targets,
        assignmentCount=assignments, situation=situation, options=options, **({"unavailableReason": unavailable} if unavailable else {})))
