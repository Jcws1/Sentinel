"""Pure eligibility checks; only the existing simulation writer applies effects."""
from app.commands.kinematics import metric
from app.scenarios.geometry import point, contains, crosses


def restricted(frame):
    rules = frame.get("boundaryRules")
    if not rules:
        return []
    return [(frame["zones"][key]["label"], [point(v, geometry=frame) for v in frame["zones"][key]["geometry"]["coordinates"][0][:-1]])
            for key, kind in rules["zones"].items() if kind == "restricted"]


def blocked(frame, origin, destination=None):
    rings = restricted(frame)
    if not rings:
        return None
    a, b = metric(origin, geometry=frame), metric(destination, geometry=frame) if destination is not None else None
    for name, ring in rings:
        if crosses(a,b,ring) if b is not None else contains(a,ring):
            return f'Restricted boundary “{name}”: no entry, edge contact or crossing. Revise the destination or the next scenario revision.'
    return None


def scenario_issues(content):
    issues = []
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
    return issues
