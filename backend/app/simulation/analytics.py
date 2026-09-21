"""Module-owned analytic interpretation of recorded external events only."""
from app.simulation.policy import NAMESPACE


def simulation_audit(event):
    detail = event.get("extensions", {}).get(NAMESPACE)
    if not isinstance(detail, dict):
        return {}
    result = {"command_id": detail.get("commandId")}
    if event["type"] == "simulation.v1.command-received":
        result.update(kind="request", state="pending", identity=detail["commandId"])
    elif event["type"] == "simulation.v1.command-completed":
        result["state"] = "completed"
    elif event["type"] == "simulation.v1.interaction":
        interaction = detail["result"]
        result["outcome"] = interaction["outcome"]
        # Entity IDs are in original RED/BLUE order. Count nonzero recorded health
        # changes, not successful draws, pairs, or repeated participant appearances.
        subjects = {effect["subject_drone_id"] for effect in interaction["effects"] if effect["health_delta"] != 0}
        result["affected_entity_ids"] = [eid for eid, external in zip(event["entityIds"], (interaction["red_drone_id"], interaction["blue_drone_id"])) if external in subjects]
    return result
