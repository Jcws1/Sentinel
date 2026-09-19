"""Interactive application service under the existing mission lock and writer."""
import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from uuid import uuid4

from app.commands.contracts import (CommandRequest, CreateRunRequest, DemoEntry, Intent, InteractiveRun,
                                    Receipt, RunRead, LegacyReceipt, LegacyM12Receipt, LegacyD2Receipt, MoveRequest,
                                    DirectMoveRequest, MoveMember, MovementExecution, ExecutionRead, LegacyD3Receipt, LegacyD3aReceipt,
                                    RecommendationSet, RecommendationAudit, RecommendationRef)
from app.commands.errors import CommandError
from app.commands import movement, scheduler, selected_control, live_boundaries, behaviors, engagements, rts_behavior, recommendations
from app.commands.unit_profiles import entity_speed
from app.commands.legacy_d4 import LegacyD4Receipt
from app.commands.kinematics import endpoints, distance, in_extent, cruise_speed
from app.commands.policy import TRANSITIONS
from app.commands.template import TEMPLATE, LEGACY_TEMPLATE, new_template
from app.world.serialization import canonical, read_frame


def plus(at: str, seconds: float) -> str:
    return (datetime.fromisoformat(at.replace("Z", "+00:00")) + timedelta(seconds=seconds)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class InteractiveService:
    def __init__(self, authority, enabled=False):
        self.authority, self.repository, self.enabled = authority, authority.repository, enabled
        self._creation_lock = asyncio.Lock()
        self._intents: dict[str, str] = {}
        self._credentials: dict[str, str] = {}  # Private process memory only.
        self._recommendations: dict[str, str] = {}  # Bounded advisory bytes, not world state.

    def _run(self, mid):
        try:
            frame = self.authority.read(mid)
        except KeyError:
            raise CommandError("NOT_INTERACTIVE", "Load a local demo run.", 404)
        if frame.interactive is None:
            raise CommandError("NOT_INTERACTIVE", "This mission is a read-only fixture.", 409)
        return frame

    def _enabled(self):
        if not self.enabled:
            raise CommandError("DEMO_DISABLED", "Local synthetic run controls are disabled.", 403)

    def entry(self):
        return DemoEntry(enabled=self.enabled, active_mission_id=self.repository.active_interactive())

    def _owns(self, mid, credential):
        return bool(credential and mid in self._credentials and hmac.compare_digest(
            self._credentials[mid], hashlib.sha256(credential.encode()).hexdigest()))

    def status(self, mid, credential):
        frame = self._run(mid)
        run, now = frame.interactive, self.authority.clock()
        lease_state = "unclaimed" if not run.lease.holder_id else "expired" if now >= run.lease.expires_at else "held"
        return RunRead(server_time=now, frame_id=frame.frame_id, sequence=frame.sequence, run=run, unit_profiles=frame.unit_profiles,
                       owns_control=lease_state == "held" and self._owns(mid, credential), lease_state=lease_state)

    async def suggest(self, mid, selection, credential):
        self._enabled()
        async with self.authority._lock(mid):
            frame, now = self._run(mid), self.authority.clock()
            self._recommendations = {k: v for k, v in self._recommendations.items() if json.loads(v)["expiresAt"] > now}
            if len(self._recommendations) >= recommendations.MAX_SETS:
                raise CommandError("INVALID_REQUEST", "Suggestion capacity reached; retry after expiry.", 429)
            if frame.interactive.state == "ended":
                raise CommandError("RUN_TERMINAL", "Recorded and ended runs are read-only.")
            result = recommendations.generate(json.loads(canonical(frame)), self.repository.checkpoint(mid), selection.entity_ids,
                owns_control=self.status(mid, credential).owns_control, now=now,
                expires_at=plus(now, recommendations.TTL_SECONDS), identity=str(uuid4()))
            self._recommendations[result.id] = canonical(result)
            return result

    def _review_recommendation(self, mid, reference, action, members, policy, frame, checkpoint, now):
        saved = self._recommendations.get(reference.recommendation_id)
        if not saved:
            raise CommandError("OBSOLETE_INTENT", "Out of date — refresh. Suggestion is no longer available.")
        proposal = RecommendationSet.model_validate_json(saved)
        if proposal.mission_id != mid or proposal.run_id != frame.interactive.run_id or proposal.executor_epoch != frame.interactive.executor_epoch:
            raise CommandError("REFERENCE_MISMATCH", "Out of date — refresh. Run context changed.")
        if now >= proposal.expires_at:
            raise CommandError("INTENT_EXPIRED", "Out of date — refresh. Suggestion expired.")
        option = next((o for o in proposal.options if o.id == reference.option_id), None)
        if not option or not option.action or (option.action.operation, [canonical(m) for m in option.action.members], canonical(option.action.policy)) != (action, [canonical(m) for m in members or []], canonical(policy)):
            raise CommandError("INTENT_INVALID", "Suggestion action or exact members changed; refresh.")
        current = recommendations.fingerprint(json.loads(canonical(frame)), checkpoint, proposal.selected_entity_ids, now)
        if current != proposal.fingerprint:
            raise CommandError("OBSOLETE_INTENT", "Out of date — refresh. Availability, orders, assignments, boundaries or eligibility changed.")
        data = json.loads(canonical(proposal))
        data.pop("id")
        data.pop("options")
        return RecommendationAudit.model_validate(dict(data, recommendationId=proposal.id, option=json.loads(canonical(option))))

    async def issue_intent(self, mid, action, execution_id=None, members=None, order=None, boundary=None, policy=None, recommendation=None):
        self._enabled()
        async with self.authority._lock(mid):
            frame, now = self._run(mid), self.authority.clock()
            run = frame.interactive
            audit = self._review_recommendation(mid, recommendation, action, members, policy, frame, self.repository.checkpoint(mid), now) if recommendation else None
            # Expired evidence may be discarded; it can never regain admission.
            self._intents = {k: v for k, v in self._intents.items() if json.loads(v)["expiresAt"] > now}
            if len(self._intents) >= 4096:
                raise CommandError("INTENT_INVALID", "Too many outstanding intents; retry after expiry.", 429)
            execution = next((e for e in run.executions if e.id == execution_id), None)
            if action == "cancel" and execution is None:
                raise CommandError("NOT_FOUND", "Execution is not in the current bounded projection.", 404)
            if action != "cancel" and execution_id is not None:
                raise CommandError("INVALID_REQUEST", "Only Cancel targets an execution.", 422)
            intent = Intent(id=str(uuid4()), mission_id=mid, run_id=run.run_id, executor_epoch=run.executor_epoch,
                            source_id=run.source_id, grant_id=run.grant_id, grant_revision=run.grant_revision,
                            run_revision=run.run_revision, lease_revision=run.lease.revision, action=action,
                            issued_at=now, expires_at=plus(now, 30), execution_id=execution_id,
                            execution_revision=execution.revision if execution else None, members=members, order=order, boundary=boundary, policy=policy, recommendation=audit)
            self._intents[intent.id] = canonical(intent)
            return intent

    def _duplicate(self, identity, payload, mid=None):
        saved = self.repository.receipt(identity, mid)
        if saved:
            if saved[0] != payload:
                raise CommandError("IDENTITY_CONFLICT", "This request identity already has different content.")
            return self._read_receipt(saved[1])
        return None

    def lookup(self, identity, mid=None):
        saved = self.repository.receipt(identity, mid)
        if saved is None:
            raise CommandError("NOT_FOUND", "No committed receipt for this identity.", 404)
        return self._read_receipt(saved[1])

    @staticmethod
    def _read_receipt(text):
        versions = {"1.0": LegacyReceipt, "1.1": LegacyM12Receipt, "1.2": LegacyD2Receipt, "1.3": LegacyD3Receipt, "1.4": LegacyD3aReceipt, "1.5": LegacyD4Receipt, "1.6": Receipt}
        return versions[json.loads(text).get("schemaVersion")].model_validate_json(text)

    def _receipt(self, identity, operation, frame=None, error=None, mid=None, execution_ids=None, direct_order=None, member_outcomes=None, control_order=None, control_outcomes=None, behavior_order=None, behavior_outcomes=None, target_scope=None, movement_order=None):
        return Receipt(request_id=identity, operation=operation, accepted=error is None,
                       code=error.code if error else "OK", message=error.message if error else "Committed",
                       recorded_at=frame.recorded_at if frame else self.authority.clock(),
                       mission_id=frame.mission.id if frame else mid,
                       run_id=frame.interactive.run_id if frame else None,
                       recording_id=frame.recording_id if frame else None,
                       frame_id=frame.frame_id if frame else None, sequence=frame.sequence if frame else None,
                       boundary_revision=frame.live_boundaries.revision if frame and operation == "boundary-edit" else None,
                       execution_ids=execution_ids or [], direct_order=direct_order, member_outcomes=member_outcomes or [], control_order=control_order, control_outcomes=control_outcomes or [],
                       behavior_order=behavior_order, behavior_outcomes=behavior_outcomes or [], target_scope=target_scope or [], movement_order=movement_order)

    def _event(self, frame, operation, identity=None, holder=None):
        return {"effectiveAt": frame["effectiveAt"], "type": f"interactive.{operation}", "severity": "info",
                "source": {"id": frame["interactive"]["sourceId"], "kind": "simulation", "mode": "simulated"},
                "extensions": {"sentinel.interactive": {"requestId": identity, "holderId": holder}}}

    def _commit(self, mid, proposed, events, checkpoint, receipt_factory=None):
        previous = json.loads(self.repository.latest_text(mid))
        movement.project(proposed, checkpoint, max(self.authority.clock(), previous["recordedAt"]))
        scheduler.project(proposed, checkpoint)
        behaviors.project(proposed, checkpoint)
        receipt = None
        def effects(frame):
            nonlocal receipt
            checkpoint["run"] = json.loads(canonical(frame.interactive))
            self.repository.save_checkpoint(mid, checkpoint)
            if receipt_factory:
                receipt = receipt_factory(frame)
        messages = []
        with self.repository.transaction():
            frame = self.authority.commit_locked(mid, lambda _: (proposed, events), effects=effects,
                                                 publish=False, deferred_messages=messages)
        self.authority._publish(mid, messages[0])
        return receipt or frame

    async def create(self, request: CreateRunRequest):
        payload = canonical(request)
        async with self._creation_lock:
            prior = self._duplicate(request.creation_id, payload)
            if prior:
                return prior
            self._enabled()
            if request.scenario is None and request.template_id not in (TEMPLATE, LEGACY_TEMPLATE):
                receipt = self._receipt(request.creation_id, "create", error=CommandError("INVALID_REQUEST", "Only the configured local synthetic template is available."))
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            active = self.repository.active_interactive()
            if active:
                receipt = self._receipt(request.creation_id, "create", error=CommandError(
                    "ACTIVE_RUN_EXISTS", "Reopen the active run and End it before creating another."), mid=active)
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            revision = None
            if request.scenario:
                from app.scenarios.service import ScenarioService, instantiate
                try:
                    revision = ScenarioService(self.authority, self.enabled).resolve(request.scenario)
                    mission, proposed = instantiate(revision, self.authority.clock())
                except CommandError as error:
                    receipt = self._receipt(request.creation_id, "create", error=error)
                    self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                    return receipt
            else:
                mission, proposed = new_template(self.authority.clock(), request.template_id)
            async with self.authority._lock(mission.id):
                with self.repository.transaction():
                    self.repository.establish(mission, str(uuid4()), str(uuid4()), self.authority.clock())
                    proposed["mission"]["name"] = self.repository.assign_demo_alias(mission.id)
                    checkpoint = {"schemaVersion": "1.5", "executions": [], "directOrders": {}}
                    if "scenarioSchedule" in proposed:
                        checkpoint["scenarioSchedule"] = proposed["scenarioSchedule"]
                    scheduler.project(proposed, checkpoint)
                    behaviors.initialize(proposed, checkpoint)
                    frame = self.authority.commit_locked(mission.id, lambda _: (proposed, [self._event(proposed, "created")]), publish=False)
                    checkpoint["run"] = json.loads(canonical(frame.interactive))
                    self.repository.save_checkpoint(mission.id, checkpoint)
                    receipt = self._receipt(request.creation_id, "create", frame)
                    self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                    if revision:
                        self.repository.db.execute("INSERT INTO scenario_runs VALUES (?,?)", (mission.id, canonical(revision)))
                return receipt

    def _validate(self, mid, request, credential, run, now):
        intent = request.intent
        # Resolve immutable evidence, then check references and current revisions.
        if intent.expires_at <= now:
            raise CommandError("INTENT_EXPIRED", "The review intent expired. Request a fresh action.")
        saved = self._intents.get(intent.id)
        if not saved:
            raise CommandError("INTENT_INVALID", "Intent is unknown or belongs to a previous backend process.")
        if (intent.mission_id, intent.run_id, intent.executor_epoch, intent.source_id, intent.grant_id) != (
                mid, run.run_id, run.executor_epoch, run.source_id, run.grant_id):
            raise CommandError("REFERENCE_MISMATCH", "Mission, run, source, grant or executor reference changed.")
        if saved != canonical(intent):
            raise CommandError("INTENT_INVALID", "Issued intent evidence was changed.")
        if (intent.run_revision, intent.grant_revision, intent.lease_revision) != (run.run_revision, run.grant_revision, run.lease.revision):
            raise CommandError("OBSOLETE_INTENT", "Run or control changed after this intent was issued.")
        if run.state == "ended":
            raise CommandError("RUN_TERMINAL", "This run has ended. Create a new demo run.")
        action, lease = intent.action, run.lease
        held = lease.holder_id is not None and now < lease.expires_at
        if action in ("acquire", "reclaim"):
            if held:
                raise CommandError("CONTROL_HELD", "The current holder must release control or let its lease expire.")
            if action == "acquire" and lease.holder_id:
                raise CommandError("RECLAIM_REQUIRED", "The previous lease expired. Explicitly Reclaim control.")
            if action == "reclaim" and not lease.holder_id:
                raise CommandError("INVALID_TRANSITION", "Control is unclaimed; use Acquire control.")
            if not credential:
                raise CommandError("CONTROL_REQUIRED", "A private session credential is required.")
            return
        if not self._owns(mid, credential) or request.holder_id != lease.holder_id:
            raise CommandError("CONTROL_REQUIRED", "Acquire control in this session before submitting actions.")
        if not held:
            raise CommandError("LEASE_EXPIRED", "Control expired. Explicitly Reclaim control.")
        if action == "cancel":
            execution = next((e for e in run.executions if e.id == intent.execution_id), None)
            if execution is None or execution.state in movement.TERMINAL:
                raise CommandError("EXECUTION_TERMINAL", "Execution is already terminal or outside the current projection.")
            if execution.revision != intent.execution_revision:
                raise CommandError("OBSOLETE_INTENT", "Execution changed; request fresh cancellation evidence.")
        elif action not in ("renew", "revoke", "stop", "return-to-script", "boundary-edit", "behavior") and (run.state, action) not in TRANSITIONS:
            raise CommandError("INVALID_TRANSITION", f"{action.title()} is unavailable while the run is {run.state}.")

    async def command(self, mid, request: CommandRequest, credential):
        payload = canonical(request)
        async with self.authority._lock(mid):
            prior = self._duplicate(request.command_id, payload, mid)
            if prior:
                return prior
            self._enabled()
            frame = self._run(mid)
            run, now = frame.interactive, self.authority.clock()
            checkpoint = self.repository.checkpoint(mid)
            outcomes, control_context = [], None
            behavior_outcomes, routes = [], {}
            try:
                self._validate(mid, request, credential, run, now)
                if request.intent.recommendation:
                    audit = request.intent.recommendation
                    self._review_recommendation(mid, RecommendationRef(recommendation_id=audit.recommendation_id, option_id=audit.option.id),
                        request.intent.action, request.intent.members, request.intent.policy, frame, checkpoint, now)
                if request.intent.action == "boundary-edit":
                    live_boundaries.candidate(json.loads(canonical(frame)), request.intent.boundary)
                if request.intent.action in {"stop", "return-to-script", "behavior"}:
                    outcomes, control_context = selected_control.validate(request, run, checkpoint)
                    if not any(o["outcome"] == "accepted" for o in outcomes):
                        if request.intent.action == "behavior":
                            behavior_outcomes = outcomes
                        outdated = all(o["code"] == "ORDER_SUPERSEDED" for o in outcomes)
                        raise CommandError("ORDER_SUPERSEDED" if outdated else "NO_AVAILABLE_ASSETS",
                                           "A newer operator order is already accepted." if outdated else "No available controlled members.")
                if request.intent.action == "behavior":
                    if request.intent.policy.kind == "patrol":
                        self._validate_behavior_position(mid, request.intent, frame, now)
                    behavior_outcomes, routes = behaviors.validate_policy(json.loads(canonical(frame)), checkpoint, request.intent.policy, outcomes)
                    if not any(o["outcome"] == "accepted" for o in behavior_outcomes):
                        raise CommandError("NO_AVAILABLE_ASSETS", "No available controlled drones for this behavior.")
            except CommandError as error:
                if request.intent.action == "behavior":
                    receipt = self._receipt(request.command_id, "behavior", error=error, mid=mid, behavior_order=request.intent.order,
                        behavior_outcomes=[o for o in behavior_outcomes if o["outcome"] == "skipped"])
                else:
                    receipt = self._receipt(request.command_id, request.intent.action, error=error, mid=mid, control_order=request.intent.order, control_outcomes=outcomes)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            proposed = json.loads(canonical(frame))
            updated, action = proposed["interactive"], request.intent.action
            if action in ("acquire", "reclaim", "renew", "revoke"):
                updated["lease"] = {"revision": run.lease.revision + 1}
                if action != "revoke":
                    updated["lease"].update(holderId=request.holder_id, expiresAt=plus(now, 30))
                if action == "revoke":
                    updated["grantRevision"] += 1
            elif action not in {"cancel", "stop", "return-to-script", "boundary-edit", "behavior"}:
                updated["state"] = TRANSITIONS[(run.state, action)]
                updated["runRevision"] += 1
                proposed["mission"]["lifecycle"] = "completed" if action == "end" else "active"
                proposed["mission"]["updatedAt"] = max(proposed["mission"]["updatedAt"], now)
                if action == "end":
                    updated["lease"] = {"revision": run.lease.revision + 1}
            events = []
            for execution in checkpoint["executions"]:
                if execution["state"] in movement.TERMINAL:
                    continue
                if action in ("revoke", "end") or (action == "cancel" and execution["id"] == request.intent.execution_id):
                    if execution.get("kind") == "move":
                        movement.terminate(proposed, execution, "Cancelled", "operator-cancel" if action == "cancel" else f"run-{action}")
                    else:
                        execution.update(state="Cancelled", reason=f"run-{action}")
                elif execution.get("kind") == "move" and action == "pause":
                    movement.transition(execution, "Suspended", "Run paused.")
                elif execution.get("kind") == "move" and action == "resume":
                    execution.pop("reason", None)
                    if execution.get("suspendedBy"):
                        movement.transition(execution, "Suspended", "Destination retained while Intercept pursues.")
                    else:
                        movement.transition(execution, "Running" if execution.get("startedAt") else "Accepted")
            if action == "start":
                events.extend(scheduler.dispatch(proposed, checkpoint, start=True))
            elif action in {"end", "revoke"}:
                events.extend(scheduler.terminate_all(proposed, checkpoint, "Cancelled", f"run-{action}"))
                events.extend(behaviors.terminate_all(proposed, checkpoint, f"run-{action}"))
            elif action in {"stop", "return-to-script"}:
                for o in outcomes:
                    if o["outcome"] == "accepted":
                        events.extend(behaviors.halt(proposed, checkpoint, o["assetId"], f"Operator {action}; Intercept disarmed."))
                events.extend(selected_control.apply(proposed, checkpoint, action, outcomes, control_context))
            elif action == "behavior":
                events.extend(behaviors.apply_policy(proposed, checkpoint, request, behavior_outcomes, control_context, routes))
            elif action == "boundary-edit":
                events.extend(live_boundaries.apply(proposed, checkpoint, request.intent.boundary, request.command_id))
                events.extend(behaviors.revalidate(proposed, checkpoint))
            def receipt_factory(committed):
                receipt = self._receipt(request.command_id, action, committed,
                    **(dict(behavior_order=request.intent.order, behavior_outcomes=behavior_outcomes) if action == "behavior" else dict(control_order=request.intent.order, control_outcomes=outcomes)))
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            result = self._commit(mid, proposed, [self._event(proposed, action, request.command_id, request.holder_id)] + events, checkpoint, receipt_factory)
            if action in ("acquire", "reclaim"):
                self._credentials[mid] = hashlib.sha256(credential.encode()).hexdigest()
            elif action in ("revoke", "end"):
                self._credentials.pop(mid, None)
            return result

    async def tick(self):
        mid = self.repository.active_interactive()
        if not mid or not self.enabled:
            return
        async with self.authority._lock(mid):
            frame = self._run(mid)
            proposed = json.loads(canonical(frame))
            now = max(self.authority.clock(), frame.recorded_at)
            if frame.interactive.state == "running":
                effective = plus(frame.effective_at, .2)
                proposed["effectiveAt"] = effective
                proposed["interactive"]["tick"] += 1
                proposed["interactive"]["lastReportAt"] = now
                for track in proposed["tracks"].values():
                    if track["state"] == "tracking":
                        track["latest"]["timestamp"] = effective
                        track["latest"]["discontinuity"] = False
            checkpoint = self.repository.checkpoint(mid)
            before = json.loads(canonical(frame))
            events = rts_behavior.prepare(proposed, checkpoint, before, now)
            if rts_behavior.enabled(checkpoint):
                events.extend(behaviors.revalidate(proposed, checkpoint))
            events.extend(scheduler.advance(proposed, checkpoint))
            events.extend(movement.advance(proposed, checkpoint, now))
            events.extend(behaviors.advance(proposed, checkpoint, before, now))
            engagements.resolve(proposed, checkpoint, before, events)
            if frame.interactive.state != "running" and not events:
                return
            # The template's second observation reports the same synthetic object;
            # its display priority never chooses the executing control source.
            for track in proposed["tracks"].values():
                if track["source"]["id"] == "demo-observer-v1" and track["state"] == "tracking":
                    control = next((c for c in proposed["interactive"]["controls"] if c["entityId"] == track["entityId"]), None)
                    original = proposed["tracks"].get(control.get("controlTrackId")) if control else None
                    if original:
                        track["latest"]["position"] = json.loads(canonical(original["latest"]["position"]))
                        track["latest"]["velocity"] = dict(original["latest"]["velocity"])
            self._commit(mid, proposed, events, checkpoint)

    async def recover(self):
        mid = self.repository.active_interactive()
        if not mid:
            return
        async with self.authority._lock(mid):
            frame = self._run(mid)
            proposed = json.loads(canonical(frame))
            run = proposed["interactive"]
            run.update(executorEpoch=str(uuid4()), state="ready" if run["state"] == "ready" else "paused",
                       runRevision=run["runRevision"] + 1, grantRevision=run["grantRevision"] + 1,
                       lease={"revision": run["lease"]["revision"] + 1})
            for track in proposed["tracks"].values():
                track["historySeriesId"] = f'{track["id"]}:{run["executorEpoch"]}'
                track["latest"]["discontinuity"] = True
            checkpoint = self.repository.checkpoint(mid)
            for execution in checkpoint["executions"]:
                if execution["state"] not in ("Completed", "Cancelled", "Failed", "Expired", "Interrupted"):
                    if execution.get("kind") == "move":
                        movement.terminate(proposed, execution, "Interrupted", "backend-restart")
                    else:
                        execution.update(state="Interrupted", reason="backend-restart")
            events = scheduler.terminate_all(proposed, checkpoint, "Interrupted", "Backend restart: script interrupted. Create a fresh Run to restart it.")
            events.extend(behaviors.terminate_all(proposed, checkpoint, "Backend restart: behavior interrupted and disarmed. Reapply explicitly.", interrupted=True))
            self._commit(mid, proposed, [self._event(proposed, "restarted-paused")] + events, checkpoint)

    def frame_at(self, mid, frame_id):
        row = self.repository.db.execute("""SELECT f.frame_json FROM frames f JOIN recordings r ON r.id=f.recording_id
            WHERE r.mission_id=? AND f.frame_id=?""", (mid, frame_id)).fetchone()
        if not row:
            raise CommandError("FRAME_INVALID", "Reviewed frame is not a committed frame of this mission.")
        return self.repository.display_frame(read_frame(row[0]))

    def _validate_behavior_position(self, mid, intent, frame, now):
        policy, run = intent.policy, frame.interactive
        if run.state != "running":
            raise CommandError("INVALID_TRANSITION", "Resume the demo before starting Patrol.")
        if not run.last_report_at or movement.age(now, run.last_report_at) > 2:
            raise CommandError("SOURCE_UNHEALTHY", "Wait for a current source report before Patrol.")
        anchor = self.frame_at(mid, policy.reviewed_frame_id)
        r = anchor.interactive
        if not r or r.state != "running" or (r.run_id, r.executor_epoch, r.grant_revision, r.source_id) != (run.run_id, run.executor_epoch, run.grant_revision, run.source_id):
            raise CommandError("FRAME_INVALID", "Patrol needs a running frame from this control context.")
        if policy.deadline != plus(anchor.recorded_at, 30) or now >= policy.deadline:
            raise CommandError("MOVE_EXPIRED", "Patrol positional evidence expired. Apply a fresh decision.")
        for m in intent.members:
            c = next((c for c in r.controls if c.asset_id == m.asset_id), None)
            if not c or any(getattr(c, k) != getattr(m, k) for k in ("entity_id", "control_track_id", "source_id", "executor_id", "grant_id", "binding_revision")):
                raise CommandError("BINDING_CHANGED", "Patrol reviewed binding changed.")

    def executions(self, mid, frame_id=None):
        frame = self.frame_at(mid, frame_id) if frame_id else self._run(mid)
        if frame.interactive is None:
            raise CommandError("NOT_INTERACTIVE", "No interactive execution in this frame.")
        return ExecutionRead(mission_id=mid, frame_id=frame.frame_id, sequence=frame.sequence,
                             executions=frame.interactive.executions)

    def _validate_move(self, mid, request, credential, frame, now):
        run, move = frame.interactive, request.move
        if (move.mission_id, move.run_id, move.executor_epoch, move.source_id, move.grant_id, move.grant_revision) != (mid, run.run_id, run.executor_epoch, run.source_id, run.grant_id, run.grant_revision):
            raise CommandError("REFERENCE_MISMATCH", "Mission, run, executor or grant changed.")
        if not self._owns(mid, credential) or request.holder_id != run.lease.holder_id:
            raise CommandError("CONTROL_REQUIRED", "Acquire control in this session.")
        if not run.lease.expires_at or now >= run.lease.expires_at:
            raise CommandError("LEASE_EXPIRED", "Control expired; reclaim explicitly.")
        if run.state != "running":
            raise CommandError("INVALID_TRANSITION", "Move requires a running source.")
        anchor_frame = self.frame_at(mid, move.reviewed_frame_id)
        anchor = json.loads(canonical(anchor_frame))
        proposed = json.loads(canonical(frame))
        if anchor_frame.interactive is None or anchor_frame.interactive.state != "running" or (anchor_frame.interactive.executor_epoch, anchor_frame.interactive.run_id, anchor_frame.interactive.grant_revision) != (move.executor_epoch, move.run_id, move.grant_revision):
            raise CommandError("FRAME_INVALID", "Review requires a running frame from this executor epoch.")
        if move.deadline != plus(anchor_frame.recorded_at, 30) or now >= move.deadline:
            raise CommandError("MOVE_EXPIRED", "Original reviewed-frame deadline elapsed or was changed. Make a new review.")
        if len({m.asset_id for m in move.members}) != len(move.members) or len({m.entity_id for m in move.members}) != len(move.members):
            raise CommandError("SELECTION_INVALID", "Every selected Entity and Asset must appear once.")
        targets = endpoints([json.loads(canonical(m.origin)) for m in move.members], json.loads(canonical(move.anchor)))
        for member, target in zip(move.members, targets):
            controls = [c for c in run.controls if c.asset_id == member.asset_id]
            original = next((c for c in anchor_frame.interactive.controls if c.asset_id == member.asset_id), None)
            if len(controls) != 1 or original is None:
                raise CommandError("BINDING_CHANGED", "Explicit Asset binding is unavailable.")
            control = controls[0]
            for name in ("entity_id", "executor_id", "control_track_id", "source_id", "grant_id", "binding_revision"):
                if getattr(member, name) != getattr(control, name) or getattr(member, name) != getattr(original, name):
                    raise CommandError("BINDING_CHANGED", "Reviewed Asset/control binding changed.")
            if any(e.asset_id == member.asset_id and e.state not in movement.TERMINAL for e in run.executions):
                raise CommandError("ASSET_BUSY", "A selected Asset is busy; cancel and confirm termination before replacement.")
            if member.busy_revision != control.busy_revision or member.busy_revision != original.busy_revision:
                raise CommandError("BINDING_CHANGED", "Asset reservation changed since review; make a fresh draft.")
            for value, c, instant in ((proposed, control, now), (anchor, original, anchor_frame.recorded_at)):
                reason = movement.control_reason(value, json.loads(canonical(c)), instant)
                if reason:
                    raise CommandError(*reason)
            actual_origin = anchor["tracks"][member.control_track_id]["latest"]["position"]
            if canonical(member.origin) != canonical(actual_origin) or canonical(proposed["tracks"][member.control_track_id]["latest"]["position"]) != canonical(actual_origin):
                raise CommandError("POSITION_UNAVAILABLE", "Control position differs from the frozen review; make a fresh draft.")
            from app.commands.zone_rules import blocked
            zone_reason = blocked(proposed, actual_origin, target)
            if zone_reason:
                raise CommandError("ENDPOINT_INVALID", f"{proposed['entities'][member.entity_id]['label']}: {zone_reason}")
            supplied = json.loads(canonical(member.destination))
            if not in_extent(supplied):
                raise CommandError("OUTSIDE_EXTENT", "Every supplied endpoint must be inside the local metric extent.")
            if supplied["altitude"] != target["altitude"] or distance(supplied, target) > .002:
                raise CommandError("ENDPOINT_INVALID", "Endpoint differs from the reviewed group translation or supplied height.")

    async def move(self, mid, request: MoveRequest, credential):
        payload = canonical(request)
        async with self.authority._lock(mid):
            prior = self._duplicate(request.command_id, payload, mid)
            if prior:
                return prior
            self._enabled()
            frame = self._run(mid)
            now = max(self.authority.clock(), frame.recorded_at)
            try:
                self._validate_move(mid, request, credential, frame, now)
                checkpoint = self.repository.checkpoint(mid)
                context = dict(holderId=request.holder_id, executorEpoch=frame.interactive.executor_epoch, grantId=frame.interactive.grant_id, grantRevision=frame.interactive.grant_revision)
                if request.order is not None:
                    for member in request.move.members:
                        previous = checkpoint.get("directOrders", {}).get(member.asset_id)
                        if previous and all(previous.get(k) == v for k, v in context.items()) and request.order <= previous["order"]:
                            raise CommandError("ORDER_SUPERSEDED", "A newer operator order is already accepted.")
            except CommandError as error:
                receipt = self._receipt(request.command_id, "move", error=error, mid=mid, movement_order=request.order)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            proposed, checkpoint = json.loads(canonical(frame)), self.repository.checkpoint(mid)
            ids, events = [], []
            for member in request.move.members:
                events.extend(behaviors.halt(proposed, checkpoint, member.asset_id, "Ordinary Move; Intercept disarmed."))
                events.extend(scheduler.override(proposed, checkpoint, member.entity_id))
                control = next(c for c in proposed["interactive"]["controls"] if c["assetId"] == member.asset_id)
                control["busyRevision"] += 1
                if request.order is not None:
                    checkpoint.setdefault("directOrders", {})[member.asset_id] = {**context, "order":request.order}
                else:
                    checkpoint.setdefault("legacyReviewedFences", {})[member.asset_id] = frame.sequence + 1
                execution = MovementExecution(**member.model_dump(), id=str(uuid4()), command_id=request.command_id,
                    mission_id=mid, run_id=frame.interactive.run_id, executor_epoch=frame.interactive.executor_epoch,
                    grant_revision=frame.interactive.grant_revision, reservation_revision=control["busyRevision"],
                    state="Accepted", revision=0, accepted_at=now, accepted_sequence=frame.sequence + 1,
                    deadline=request.move.deadline, travelled_metres=0.0, speed_mps=entity_speed(proposed, member.entity_id),
                    remaining_metres=distance(json.loads(canonical(member.origin)), json.loads(canonical(member.destination))))
                checkpoint["executions"].append(json.loads(canonical(execution)))
                ids.append(execution.id)
            def receipt_factory(committed):
                receipt = self._receipt(request.command_id, "move", committed, execution_ids=ids, movement_order=request.order)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            return self._commit(mid, proposed, [self._event(proposed, "move-accepted", request.command_id, request.holder_id)] + events, checkpoint, receipt_factory)

    def _validate_direct(self, mid, request, credential, frame, checkpoint, now):
        """Resolve every binding before computing available-only current-position geometry."""
        run, intent = frame.interactive, request.direct
        if (intent.mission_id, intent.run_id, intent.executor_epoch, intent.source_id, intent.grant_id, intent.grant_revision) != (mid, run.run_id, run.executor_epoch, run.source_id, run.grant_id, run.grant_revision):
            raise CommandError("REFERENCE_MISMATCH", "Demo or control context changed.")
        if not self._owns(mid, credential) or request.holder_id != run.lease.holder_id:
            raise CommandError("CONTROL_REQUIRED", "This session does not hold control.")
        if not run.lease.expires_at or now >= run.lease.expires_at:
            raise CommandError("LEASE_EXPIRED", "Control expired.")
        if run.state != "running":
            raise CommandError("INVALID_TRANSITION", "Resume the demo before moving drones.")
        if not run.last_report_at or movement.age(now, run.last_report_at) > 2:
            raise CommandError("SOURCE_UNHEALTHY", "No current source report.")
        anchor_frame = self.frame_at(mid, intent.reviewed_frame_id)
        anchor_run = anchor_frame.interactive
        if anchor_run is None or anchor_run.state != "running" or (anchor_run.executor_epoch, anchor_run.run_id, anchor_run.grant_revision, anchor_run.source_id) != (intent.executor_epoch, intent.run_id, intent.grant_revision, intent.source_id):
            raise CommandError("FRAME_INVALID", "Order requires a running frame from this control context.")
        if intent.deadline != plus(anchor_frame.recorded_at, 30) or now >= intent.deadline:
            raise CommandError("MOVE_EXPIRED", "Order expired before delivery. Issue a new destination.")
        if len({m.asset_id for m in intent.members}) != len(intent.members) or len({m.entity_id for m in intent.members}) != len(intent.members):
            raise CommandError("SELECTION_INVALID", "Every selected Entity and Asset must appear once.")
        anchor = json.loads(canonical(intent.anchor))
        if not in_extent(anchor):
            raise CommandError("OUTSIDE_EXTENT", "Destination outside the supported area.")
        controls = []
        for member in intent.members:
            matches = [c for c in run.controls if c.asset_id == member.asset_id]
            original = next((c for c in anchor_run.controls if c.asset_id == member.asset_id), None)
            if len(matches) != 1 or original is None or len([c for c in run.controls if c.entity_id == member.entity_id]) != 1:
                raise CommandError("BINDING_CHANGED", "Explicit Asset binding is unavailable or ambiguous.")
            control = matches[0]
            if any(getattr(member, name) != getattr(control, name) or getattr(member, name) != getattr(original, name)
                   for name in ("entity_id", "executor_id", "control_track_id", "source_id", "grant_id", "binding_revision")):
                raise CommandError("BINDING_CHANGED", "Captured Asset/control binding changed.")
            controls.append(json.loads(canonical(control)))
        current = json.loads(canonical(frame))
        accepted, skipped = [], []
        context = dict(holderId=request.holder_id, executorEpoch=intent.executor_epoch,
                       grantId=intent.grant_id, grantRevision=intent.grant_revision)
        for member, control in zip(intent.members, controls):
            previous = checkpoint.get("directOrders", {}).get(member.asset_id)
            reason = None
            if (previous and all(previous.get(key) == value for key, value in context.items()) and intent.order <= previous["order"]) or anchor_frame.sequence < checkpoint.get("legacyReviewedFences", {}).get(member.asset_id, 0):
                reason = ("ORDER_SUPERSEDED", "A newer destination is already accepted.")
            if reason is None:
                reason = movement.direct_member_reason(current, control)
            if reason:
                skipped.append(dict(assetId=member.asset_id, entityId=member.entity_id, outcome="skipped", code=reason[0], reason=reason[1]))
            else:
                accepted.append((member, control, current["tracks"][member.control_track_id]["latest"]["position"]))
        # Geometry validation is deliberately before any supersession or reservation.
        legacy_approach = bool(intent.intercept and not rts_behavior.enabled(checkpoint))
        targets = [origin for _, _, origin in accepted] if legacy_approach else endpoints([origin for _, _, origin in accepted], anchor) if accepted else []
        from app.commands.zone_rules import blocked
        for (member, _, origin), target in zip(accepted, targets):
            if legacy_approach and (not in_extent(origin) or behaviors.source_track(current, member.entity_id, "friendly") is None):
                raise CommandError("POSITION_UNAVAILABLE", "Intercept requires a fresh source-owned friendly position inside the local extent.")
            zone_reason = None if legacy_approach else blocked(current, origin, target)
            if zone_reason:
                raise CommandError("ENDPOINT_INVALID", f"{current['entities'][member.entity_id]['label']}: {zone_reason}")
        members = [MoveMember(**member.model_dump(), busy_revision=control["busyRevision"], origin=origin, destination=target)
                   for (member, control, origin), target in zip(accepted, targets)]
        return members, skipped, {**context, "order": intent.order}

    async def direct_move(self, mid, request: DirectMoveRequest, credential):
        payload = canonical(request)
        async with self.authority._lock(mid):
            prior = self._duplicate(request.command_id, payload, mid)
            if prior:
                return prior
            self._enabled()
            frame = self._run(mid)
            now = max(self.authority.clock(), frame.recorded_at)
            checkpoint = self.repository.checkpoint(mid)
            outcomes = []
            legacy_approach = bool(request.direct.intercept and not rts_behavior.enabled(checkpoint))
            operation = "intercept-approach" if legacy_approach else "direct-move"
            try:
                members, outcomes, context = self._validate_direct(mid, request, credential, frame, checkpoint, now)
                if not members:
                    outdated = all(o["code"] == "ORDER_SUPERSEDED" for o in outcomes)
                    raise CommandError("ORDER_SUPERSEDED" if outdated else "NO_AVAILABLE_ASSETS",
                                       "A newer destination is already accepted." if outdated else "No available drones.")
            except CommandError as error:
                receipt = self._receipt(request.command_id, operation, error=error, mid=mid,
                    **(dict(behavior_order=request.direct.order, behavior_outcomes=outcomes) if legacy_approach else dict(direct_order=request.direct.order, member_outcomes=outcomes)))
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            proposed = json.loads(canonical(frame))
            if legacy_approach:
                try:
                    events, outcomes, scope = behaviors.approach(proposed, checkpoint, request, members, outcomes, context)
                except CommandError as error:
                    receipt = self._receipt(request.command_id, operation, error=error, mid=mid, behavior_order=request.direct.order,
                        behavior_outcomes=[o for o in outcomes if o["outcome"] == "skipped"])
                    self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                    return receipt
                def receipt_factory(committed):
                    receipt = self._receipt(request.command_id, operation, committed, behavior_order=request.direct.order, behavior_outcomes=outcomes, target_scope=scope)
                    self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                    return receipt
                return self._commit(mid, proposed, events, checkpoint, receipt_factory)
            ids, events = [], []
            for member in members:
                rts_member = None
                if rts_behavior.enabled(checkpoint):
                    rts_member, changes = rts_behavior.redirect(proposed, checkpoint, member.asset_id, request.command_id, context)
                    events.extend(changes)
                else:
                    events.extend(behaviors.halt(proposed, checkpoint, member.asset_id, "Ordinary Move; Intercept disarmed."))
                events.extend(scheduler.override(proposed, checkpoint, member.entity_id))
                for previous in checkpoint["executions"]:
                    if previous.get("kind") == "move" and previous["assetId"] == member.asset_id and previous["state"] not in movement.TERMINAL:
                        movement.terminate(proposed, previous, "Cancelled", f"Superseded by order {request.direct.order}.")
                control = next(c for c in proposed["interactive"]["controls"] if c["assetId"] == member.asset_id)
                control["busyRevision"] += 1
                checkpoint.setdefault("directOrders", {})[member.asset_id] = context
                execution = MovementExecution(**member.model_dump(), id=str(uuid4()), command_id=request.command_id,
                    mission_id=mid, run_id=frame.interactive.run_id, executor_epoch=frame.interactive.executor_epoch,
                    grant_revision=frame.interactive.grant_revision, reservation_revision=control["busyRevision"],
                    state="Accepted", revision=0, accepted_at=now, accepted_sequence=frame.sequence + 1,
                    deadline=request.direct.deadline, travelled_metres=0.0, direct_order=request.direct.order,
                    speed_mps=entity_speed(proposed, member.entity_id),
                    remaining_metres=distance(json.loads(canonical(member.origin)), json.loads(canonical(member.destination))))
                checkpoint["executions"].append(json.loads(canonical(execution)))
                if rts_member:
                    rts_member.update(reservationRevision=control["busyRevision"], movementExecutionId=execution.id)
                ids.append(execution.id)
                outcomes.append(dict(assetId=member.asset_id, entityId=member.entity_id, outcome="accepted", code="OK",
                                     reason="Destination accepted; awaiting a committed source step.", executionId=execution.id))
            # Preserve captured membership order in immutable results.
            by_asset = {o["assetId"]: o for o in outcomes}
            outcomes = [by_asset[m.asset_id] for m in request.direct.members]
            ids = [o["executionId"] for o in outcomes if o["outcome"] == "accepted"]
            event = self._event(proposed, "direct-move-accepted", request.command_id, request.holder_id)
            event["extensions"]["sentinel.direct"] = {"order": request.direct.order, "memberOutcomes": outcomes}
            def receipt_factory(committed):
                receipt = self._receipt(request.command_id, "direct-move", committed, execution_ids=ids,
                                        direct_order=request.direct.order, member_outcomes=outcomes)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            return self._commit(mid, proposed, [event] + events, checkpoint, receipt_factory)
