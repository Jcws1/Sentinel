"""Authored stationary cases for M1.1. No movement or encounter handler."""
from uuid import uuid4
from app.commands.contracts import InteractiveRun, Lease, AssetControl
from app.domain.models import Mission
from app.world.serialization import canonical
import json

TEMPLATE = "singapore-local-v1"


def new_template(at: str):
    mid, rid, epoch = (str(uuid4()) for _ in range(3))
    source = {"id": f"demo-source-{rid}", "kind": "simulation", "mode": "simulated"}
    executor, grant = f"local-executor-{rid}", str(uuid4())
    point = {"longitudeDeg": 103.85, "latitudeDeg": 1.29,
             "altitude": {"metres": 150.0, "reference": "ELLIPSOID", "datumId": "WGS84"}}
    mission = Mission(id=mid, name=f"Local demo {mid[:8]}", domain="synthetic-interactive", lifecycle="draft",
                      created_at=at, updated_at=at, reference_point=point,
                      extensions={"sentinel.interactive": {"templateId": TEMPLATE, "synthetic": True}})
    frame = {"mission": json.loads(canonical(mission)), "effectiveAt": at, "entities": {}, "tracks": {},
             "assets": {}, "sensors": {}, "zones": {}, "tasks": {}}
    provenance = {"source": source, "effectiveAt": at, "recordedAt": at}
    controls = []
    for index, label in enumerate(("F-01", "F-02", "F-03", "F-04", "O-01", "F-05")):
        eid, tid, aid = f"{rid}:{label}", f"{rid}:{label}:control", f"{rid}:{label}:asset"
        frame["entities"][eid] = {"id": eid, "missionId": mid, "label": label, "kind": "virtual-object",
                                  "affiliation": "hostile" if label == "O-01" else "friendly",
                                  "condition": "operational", "presence": "present", "provenance": provenance}
        if label != "F-03":
            p = json.loads(canonical(point))
            p["longitudeDeg"] += index * .004
            p["latitudeDeg"] += (index % 2) * .004
            frame["tracks"][tid] = {"id": tid, "missionId": mid, "entityId": eid, "source": source,
                                    "state": "stale" if label == "F-04" else "tracking",
                                    "latest": {"timestamp": at, "position": p,
                                               "velocity": {"speedMps": 0.0, "headingTrueDeg": 0.0}},
                                    "historySeriesId": f"{tid}:{epoch}"}
        if index < 4:
            frame["assets"][aid] = {"id": aid, "missionId": mid, "entityId": eid,
                                     "availability": "available" if index < 2 else "unavailable",
                                     "capabilityCodes": ["synthetic-horizontal"] if index < 2 else [], "provenance": provenance}
            controls.append(AssetControl(mission_id=mid, asset_id=aid, entity_id=eid, executor_id=executor,
                                        control_track_id=tid if label != "F-03" else None, source_id=source["id"], grant_id=grant,
                                        binding_revision=1, capabilities=["move-horizontal"] if index < 2 else [],
                                        position_reference="ELLIPSOID/WGS84",
                                        reason="Movement is not available in M1.1" if index < 2 else "Position missing" if index == 2 else "Stale control report"))
    # A competing display observation demonstrates that it never selects control routing.
    tid = f"{rid}:F-01:control"
    alternate = json.loads(canonical(frame["tracks"][tid]))
    alternate.update(id=f"{rid}:F-01:alternate", source={"id": "demo-observer-v1", "kind": "sensor", "mode": "simulated"})
    frame["tracks"][alternate["id"]] = alternate
    run = InteractiveRun(mission_id=mid, run_id=rid, executor_id=executor, executor_epoch=epoch,
                         source_id=source["id"], state="ready", run_revision=0, grant_id=grant, grant_revision=0,
                         capabilities=["run-control", "scenario-pair"],
                         supported_actions=["acquire", "renew", "reclaim", "revoke", "start", "pause", "resume", "end"],
                         lease=Lease(revision=0), tick=0, controls=controls)
    frame["interactive"] = json.loads(canonical(run))
    return mission, frame
