import asyncio
import hashlib
import json
from uuid import uuid4
from app.commands.errors import CommandError
from app.scenarios.contracts import ScenarioRevision, ScenarioReceipt, ScenarioList
from app.world.serialization import canonical


class ScenarioService:
    def __init__(self, authority, enabled):
        self.authority, self.repository, self.enabled = authority, authority.repository, enabled
        self._lock = asyncio.Lock()

    def get(self, identity, revision=None):
        query = "SELECT revision_json FROM scenario_revisions WHERE definition_id=?"
        args = [identity]
        if revision is not None:
            query += " AND revision=?"
            args.append(revision)
        row = self.repository.db.execute(query + " ORDER BY revision DESC LIMIT 1", args).fetchone()
        if row is None:
            raise CommandError("NOT_FOUND", "Scenario revision not found.", 404)
        return ScenarioRevision.model_validate_json(row[0])

    def list(self):
        rows = self.repository.db.execute("SELECT revision_json FROM scenario_revisions r WHERE revision=(SELECT MAX(revision) FROM scenario_revisions WHERE definition_id=r.definition_id) ORDER BY definition_id LIMIT 100").fetchall()
        return ScenarioList(scenarios=[ScenarioRevision.model_validate_json(r[0]) for r in rows])

    def resolve(self, reference):
        revision = self.get(reference.definition_id, reference.revision)
        if revision.content_hash != reference.content_hash:
            raise CommandError("REFERENCE_MISMATCH", "Saved scenario hash does not match the requested revision.")
        return revision

    def review(self, reference):
        from app.commands.template import TEMPLATE
        from app.commands.kinematics import cruise_speed
        from app.scenarios.review import ScenarioReview, ScenarioCounts, ScenarioMotionPreset, ScenarioReviewIssue
        revision = self.resolve(reference)
        units = revision.content.units
        active = self.repository.active_interactive()
        from app.commands.zone_rules import scenario_issues
        issues = [ScenarioReviewIssue.model_validate(i) for i in scenario_issues(revision.content)]
        if not units:
            issues.append(ScenarioReviewIssue(code="EMPTY_ARRANGEMENT", message="Place at least one entity, then save and validate the new revision."))
        if not self.enabled:
            issues.append(ScenarioReviewIssue(code="DEMO_DISABLED", message="Local demo controls are disabled on this server."))
        if active:
            issues.append(ScenarioReviewIssue(code="ACTIVE_RUN_EXISTS", message="Return to the active demo and End it before starting another; then validate again."))
        controlled = sum(u.command_role == "sentinel" for u in units)
        return ScenarioReview(reference=reference, name=revision.content.name, checked_at=self.authority.clock(),
            boundary_count=len(revision.content.boundaries or []),
            counts=ScenarioCounts(total=len(units), friendly=sum(u.category == "friendly" for u in units),
                hostile=sum(u.category == "hostile" for u in units), unknown=sum(u.category == "unknown" for u in units),
                controlled=controlled, observation_only=len(units) - controlled),
            motion_preset=ScenarioMotionPreset(template_id=TEMPLATE, model_id="local-horizontal-v1", speed_mps=cruise_speed(TEMPLATE)),
            issues=issues, active_mission_id=active, can_run=not issues)

    def lookup(self, identity, definition_id=None):
        row = self.repository.db.execute("SELECT receipt_json FROM scenario_receipts WHERE scope=? AND request_id=?", (definition_id or "", identity)).fetchone()
        if row is None:
            raise CommandError("NOT_FOUND", "No committed scenario receipt.", 404)
        return ScenarioReceipt.model_validate_json(row[0])

    async def write(self, request, definition_id=None):
        payload, scope = canonical(request), definition_id or ""
        async with self._lock:
            with self.repository.transaction():
                row = self.repository.db.execute("SELECT payload_json, receipt_json FROM scenario_receipts WHERE scope=? AND request_id=?", (scope, request.request_id)).fetchone()
                if row:
                    if row[0] != payload:
                        raise CommandError("IDENTITY_CONFLICT", "This scenario request already has different content.")
                    return ScenarioReceipt.model_validate_json(row[1])
                if not self.enabled:
                    raise CommandError("DEMO_DISABLED", "Local scenario authoring is disabled.", 403)
                current = self.repository.db.execute("SELECT MAX(revision) FROM scenario_revisions WHERE definition_id=?", (definition_id,)).fetchone()[0] if definition_id else 0
                code = "NOT_FOUND" if current is None else "REVISION_CONFLICT" if request.expected_revision != current else "OK"
                result = None
                if code == "OK":
                    result = ScenarioRevision(schema_version="1.1" if request.content.boundaries is not None else "1.0", definition_id=definition_id or str(uuid4()), revision=current + 1,
                        content_hash=hashlib.sha256(canonical(request.content).encode()).hexdigest(), created_at=self.authority.clock(), content=request.content)
                    self.repository.db.execute("INSERT INTO scenario_revisions VALUES (?,?,?)", (result.definition_id, result.revision, canonical(result)))
                receipt = ScenarioReceipt(schema_version="1.1" if request.content.boundaries is not None else "1.0", request_id=request.request_id, accepted=code == "OK", code=code, result=result,
                    message="Saved immutable revision." if code == "OK" else "Scenario changed. Your edits are retained; reload the latest revision or save as a new scenario." if code == "REVISION_CONFLICT" else "Scenario not found.")
                self.repository.db.execute("INSERT INTO scenario_receipts VALUES (?,?,?,?)", (scope, request.request_id, payload, canonical(receipt)))
                return receipt


def instantiate(revision, at):
    from app.commands.template import new_template
    from app.commands.contracts import AssetControl
    from app.domain.models import Mission
    if not revision.content.units:
        raise CommandError("INVALID_REQUEST", "Place at least one entity before running the scenario.")
    from app.commands.zone_rules import scenario_issues
    issues = scenario_issues(revision.content)
    if issues:
        raise CommandError("INVALID_REQUEST", issues[0]["message"])
    mission, frame = new_template(at)
    run = frame["interactive"]
    source = {"id": run["sourceId"], "kind": "simulation", "mode": "simulated"}
    provenance = {"source": source, "effectiveAt": at, "recordedAt": at}
    for key in ("entities", "tracks", "assets"):
        frame[key] = {}
    run["controls"] = []
    mapping = {}
    for unit in revision.content.units:
        eid = f'{run["runId"]}:{unit.id}'
        tid, aid = f'{eid}:control', f'{eid}:asset'
        mapping[unit.id] = eid
        frame["entities"][eid] = dict(id=eid, missionId=mission.id, label=unit.label, kind="virtual-object",
            classification={"scheme": "sentinel-demo", "code": "unknown-entity" if unit.category == "unknown" else "drone", "label": "Unknown entity" if unit.category == "unknown" else "Drone"},
            affiliation=unit.category, condition="operational", presence="present", provenance=provenance)
        frame["tracks"][tid] = dict(id=tid, missionId=mission.id, entityId=eid, source=source, state="tracking",
            latest=dict(timestamp=at, position=json.loads(canonical(unit.position)), velocity=dict(speedMps=0.0, headingTrueDeg=unit.heading_true_deg)), historySeriesId=f'{tid}:{run["executorEpoch"]}')
        if unit.command_role == "sentinel":
            frame["assets"][aid] = dict(id=aid, missionId=mission.id, entityId=eid, availability="available", capabilityCodes=["synthetic-horizontal"], provenance=provenance)
            control = AssetControl(mission_id=mission.id, asset_id=aid, entity_id=eid, executor_id=run["executorId"], control_track_id=tid,
                source_id=source["id"], grant_id=run["grantId"], binding_revision=1, capabilities=["move-horizontal"], position_reference="ELLIPSOID/WGS84", reason="Start the source to move.")
            run["controls"].append(json.loads(canonical(control)))
    frame["scenario"] = dict(definitionId=revision.definition_id, revision=revision.revision, contentHash=revision.content_hash, name=revision.content.name, entityIds=mapping)
    frame["mission"]["extensions"] = {"sentinel.interactive": {"templateId": run["templateId"], "synthetic": True}}
    if revision.content.boundaries is not None:
        frame["zones"] = {}
        rules = {}
        for boundary in revision.content.boundaries:
            zid = f'{run["runId"]}:boundary:{boundary.id}'
            vertices = [list(v) for v in boundary.vertices]
            frame["zones"][zid] = dict(id=zid, missionId=mission.id, label=boundary.name,
                purpose=boundary.type, geometry=dict(type="Polygon", coordinates=[vertices + vertices[:1]]), provenance=provenance)
            rules[zid] = boundary.type
        frame["boundaryRules"] = dict(ruleVersion="local-boundary-v1", zones=rules)
        frame["mission"]["zoneIds"] = list(rules)
    mission = Mission.model_validate(frame["mission"])
    return mission, frame
