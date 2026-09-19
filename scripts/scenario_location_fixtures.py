"""Generate reusable content for the existing POST /api/scenarios + Load workflow.

No runtime, database or operator storage is opened. JSON files are authoring content,
not recordings. Invoke from the checkout with backend/.venv/Scripts/python.exe.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.commands.kinematics import geographic
from app.scenarios.contracts import ScenarioContent
from app.scenarios.location import LocalGeometry
from app.world.serialization import canonical
from app.commands.scheduler import nominal_plan


def scenario(name, lon, lat, side=2):
    geometry = LocalGeometry.model_validate(dict(modelId="local-horizontal-v2", halfExtentMetres=5000,
        origin=dict(longitudeDeg=lon, latitudeDeg=lat)))
    units, actions = [], []
    for category, start, end, profile in [("friendly", -1500, 1500, "sting-v1"), ("hostile", 1500, -1500, "lancet-3-v1")]:
        for i in range(side):
            uid = f"{category}-{i+1:02}"
            y = (i-(side-1)/2)*80 + (-1000 if category == "friendly" else 1000)
            units.append(dict(id=uid, label=f"{category.title()} {i+1:02}", category=category,
                commandRole="sentinel" if category == "friendly" else "observation", profileId=profile,
                position={**geographic(start, y, geometry), "altitude":dict(metres=150.125+i,reference="ELLIPSOID",datumId="WGS84")}, headingTrueDeg=73.5))
            actions.extend([
                dict(id=f"{uid}-out",unitId=uid,kind="move",offsetMs=0,ordinal=len(actions),destination=geographic(end,y,geometry)),
                dict(id=f"{uid}-back",unitId=uid,kind="move",afterActionId=f"{uid}-out",delayMs=200,ordinal=len(actions)+1,destination=geographic(start,y,geometry))])
    def ring(points):
        return [list(geographic(x,y,geometry).values()) for x,y in points]
    return json.loads(canonical(ScenarioContent.model_validate(dict(name=name, localGeometry=json.loads(canonical(geometry)), units=units,
        actions=actions,scheduleRuleVersion="local-schedule-v2", boundaryRuleVersion="local-boundary-v1", boundaries=[
            dict(id="patrol-area",name="Patrol practice",type="patrol",vertices=ring([(-2400,-2500),(-1600,-2500),(-1600,-1900),(-2400,-1900)])),
            dict(id="restricted-area",name="Restricted practice",type="restricted",vertices=ring([(2500,2500),(2800,2500),(2800,2800),(2500,2800)]))]))))


def fixtures():
    return {
        "default": scenario("Location · default",103.85,1.29),
        "nearby": scenario("Location · nearby airbase",103.91,1.36),
        "remote": scenario("Location · Sydney",151.1772,-33.9461),
        "remote-20v20": scenario("Location · Sydney 20v20",151.1772,-33.9461,20),
    }


if __name__ == "__main__":
    output = ROOT / "frontend/tests/fixtures/scenario-location"
    output.mkdir(parents=True,exist_ok=True)
    for name, value in fixtures().items():
        (output / f"{name}.json").write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    plan=nominal_plan(ScenarioContent.model_validate(fixtures()["remote"]))
    expected=[{k:item[k] for k in ("state","consumedTick","terminalTick") if k in item} | {"id":item["action"]["id"]} for item in plan]
    (output / "remote-timing.json").write_text(json.dumps(expected,indent=2)+"\n",encoding="utf-8")
    print("Four reusable scenario content fixtures generated; no database changed.")
