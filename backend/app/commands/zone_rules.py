"""Pure eligibility checks; only the existing simulation writer applies effects."""
from app.commands.kinematics import metric
from app.scenarios.geometry import point, contains, crosses, touches, edges


def restricted(frame):
    rules = frame.get("boundaryRules")
    if not rules:
        return []
    return [(frame["zones"][key]["label"], [point(v, geometry=frame) for v in frame["zones"][key]["geometry"]["coordinates"][0][:-1]])
            for key, kind in rules["zones"].items() if kind == "restricted"]


def keep_in(frame):
    rules = frame.get("boundaryRules")
    if not rules:
        return []
    return [(frame["zones"][key]["label"], [point(v, geometry=frame) for v in frame["zones"][key]["geometry"]["coordinates"][0][:-1]])
            for key, kind in rules["zones"].items() if kind == "keep_in"]


def inside_path(a, b, ring):
    """Strict interior, including a whole straight segment through a concave polygon."""
    if not contains(a, ring) or (b is not None and not contains(b, ring)):
        return False
    # Boundary contact is not a safe keep-in route. This also excludes a pose on the edge.
    if any(touches(a, a, c, d) or (b is not None and touches(a, b, c, d)) for c, d in edges(ring)):
        return False
    return True


def blocked(frame, origin, destination=None, *, enforce_keep_in=True):
    rings = restricted(frame)
    in_rings = keep_in(frame) if enforce_keep_in else []
    if not rings and not in_rings:
        return None
    a, b = metric(origin, geometry=frame), metric(destination, geometry=frame) if destination is not None else None
    for name, ring in rings:
        if crosses(a,b,ring) if b is not None else contains(a,ring):
            return f'Restricted boundary “{name}”: no entry, edge contact or crossing. Revise the destination or the next scenario revision.'
    for name, ring in in_rings:
        if not inside_path(a, b, ring):
            return f'Keep In boundary “{name}”: the position or straight path leaves or touches the operating area. Revise the destination or boundary.'
    return None


def scenario_issues(content):
    issues = []
    keep_ins = [b for b in content.boundaries or [] if b.type == "keep_in"]
    if len(keep_ins) > 1:
        issues.append(dict(code="MULTIPLE_KEEP_IN", message="Use only one active Keep In boundary in this POC."))
    for boundary in content.boundaries or []:
        if boundary.type == "untyped":
            issues.append(dict(code="UNTYPED_BOUNDARY", boundaryId=boundary.id,
                message=f'“{boundary.name}”: choose a boundary type or explicitly keep as annotation only.'))
        if boundary.type == "restricted":
            ring = [point(v, geometry=content) for v in boundary.vertices]
            for unit in content.units:
                if contains(metric(unit.position.model_dump(by_alias=True), geometry=content), ring):
                    issues.append(dict(code="RESTRICTED_OCCUPANT", boundaryId=boundary.id, unitId=unit.id,
                        message=f'“{unit.label}” starts inside/on restricted boundary “{boundary.name}”. Reposition it before Run.'))
        if boundary.type == "keep_in":
            ring = [point(v, geometry=content) for v in boundary.vertices]
            for unit in content.units:
                if unit.command_role == "sentinel" and not inside_path(metric(unit.position.model_dump(by_alias=True), geometry=content), None, ring):
                    issues.append(dict(code="KEEP_IN_OCCUPANT", boundaryId=boundary.id, unitId=unit.id,
                        message=f'“{unit.label}” starts outside/on Keep In boundary “{boundary.name}”. Reposition it before Run.'))
    return issues
