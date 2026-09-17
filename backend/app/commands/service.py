"""Interactive application service under the existing mission lock and writer."""
import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from uuid import uuid4

from app.commands.contracts import (CommandRequest, CreateRunRequest, DemoEntry, Intent, InteractiveRun,
                                    Receipt, RunRead, LegacyReceipt, LegacyM12Receipt, MoveRequest,
                                    DirectMoveRequest, MoveMember, MovementExecution, ExecutionRead)
from app.commands.errors import CommandError
from app.commands import movement
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
        return RunRead(server_time=now, frame_id=frame.frame_id, sequence=frame.sequence, run=run,
                       owns_control=lease_state == "held" and self._owns(mid, credential), lease_state=lease_state)

    async def issue_intent(self, mid, action, execution_id=None):
        self._enabled()
        async with self.authority._lock(mid):
            run, now = self._run(mid).interactive, self.authority.clock()
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
                            execution_revision=execution.revision if execution else None)
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
        versions = {"1.0": LegacyReceipt, "1.1": LegacyM12Receipt, "1.2": Receipt}
        return versions[json.loads(text).get("schemaVersion")].model_validate_json(text)

    def _receipt(self, identity, operation, frame=None, error=None, mid=None, execution_ids=None, direct_order=None, member_outcomes=None):
        return Receipt(request_id=identity, operation=operation, accepted=error is None,
                       code=error.code if error else "OK", message=error.message if error else "Committed",
                       recorded_at=frame.recorded_at if frame else self.authority.clock(),
                       mission_id=frame.mission.id if frame else mid,
                       run_id=frame.interactive.run_id if frame else None,
                       recording_id=frame.recording_id if frame else None,
                       frame_id=frame.frame_id if frame else None, sequence=frame.sequence if frame else None,
                       execution_ids=execution_ids or [], direct_order=direct_order, member_outcomes=member_outcomes or [])

    def _event(self, frame, operation, identity=None, holder=None):
        return {"effectiveAt": frame["effectiveAt"], "type": f"interactive.{operation}", "severity": "info",
                "source": {"id": frame["interactive"]["sourceId"], "kind": "simulation", "mode": "simulated"},
                "extensions": {"sentinel.interactive": {"requestId": identity, "holderId": holder}}}

    def _commit(self, mid, proposed, events, checkpoint, receipt_factory=None):
        previous = json.loads(canonical(self.authority.read(mid)))
        movement.project(proposed, checkpoint, max(self.authority.clock(), previous["recordedAt"]))
        receipt = None
        def effects(frame):
            nonlocal receipt
            checkpoint["run"] = json.loads(canonical(frame.interactive))
            self.repository.save_checkpoint(mid, checkpoint)
            if receipt_factory:
                receipt = receipt_factory(frame)
        with self.repository.transaction():
            frame = self.authority.commit_locked(mid, lambda _: (proposed, events), effects=effects, publish=False)
        current = json.loads(canonical(frame))
        last = previous["recentEvents"][-1]["sequence"] if previous["recentEvents"] else -1
        appended = [e for e in current["recentEvents"] if e["sequence"] > last]
        self.authority._publish(mid, self.authority._delta(previous, current, appended))
        return receipt or frame

    async def create(self, request: CreateRunRequest):
        payload = canonical(request)
        async with self._creation_lock:
            prior = self._duplicate(request.creation_id, payload)
            if prior:
                return prior
            self._enabled()
            if request.template_id not in (TEMPLATE, LEGACY_TEMPLATE):
                receipt = self._receipt(request.creation_id, "create", error=CommandError("INVALID_REQUEST", "Only the configured local synthetic template is available."))
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            active = self.repository.active_interactive()
            if active:
                receipt = self._receipt(request.creation_id, "create", error=CommandError(
                    "ACTIVE_RUN_EXISTS", "Reopen the active run and End it before creating another."), mid=active)
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            mission, proposed = new_template(self.authority.clock(), request.template_id)
            async with self.authority._lock(mission.id):
                with self.repository.transaction():
                    self.repository.establish(mission, str(uuid4()), str(uuid4()), self.authority.clock())
                    proposed["mission"]["name"] = self.repository.assign_demo_alias(mission.id)
                    frame = self.authority.commit_locked(mission.id, lambda _: (proposed, [self._event(proposed, "created")]), publish=False)
                    self.repository.save_checkpoint(mission.id, {"schemaVersion": "1.3", "run": json.loads(canonical(frame.interactive)), "executions": [], "directOrders": {}})
                    receipt = self._receipt(request.creation_id, "create", frame)
                    self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
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
        elif action not in ("renew", "revoke") and (run.state, action) not in TRANSITIONS:
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
            try:
                self._validate(mid, request, credential, run, now)
            except CommandError as error:
                receipt = self._receipt(request.command_id, request.intent.action, error=error, mid=mid)
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
            elif action != "cancel":
                updated["state"] = TRANSITIONS[(run.state, action)]
                updated["runRevision"] += 1
                proposed["mission"]["lifecycle"] = "completed" if action == "end" else "active"
                proposed["mission"]["updatedAt"] = max(proposed["mission"]["updatedAt"], now)
                if action == "end":
                    updated["lease"] = {"revision": run.lease.revision + 1}
            checkpoint = self.repository.checkpoint(mid)
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
                    movement.transition(execution, "Running" if execution.get("startedAt") else "Accepted")
            def receipt_factory(committed):
                receipt = self._receipt(request.command_id, action, committed)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            result = self._commit(mid, proposed, [self._event(proposed, action, request.command_id, request.holder_id)], checkpoint, receipt_factory)
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
            events = movement.advance(proposed, checkpoint, now)
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
            self._commit(mid, proposed, [self._event(proposed, "restarted-paused")], checkpoint)

    def frame_at(self, mid, frame_id):
        row = self.repository.db.execute("""SELECT f.frame_json FROM frames f JOIN recordings r ON r.id=f.recording_id
            WHERE r.mission_id=? AND f.frame_id=?""", (mid, frame_id)).fetchone()
        if not row:
            raise CommandError("FRAME_INVALID", "Reviewed frame is not a committed frame of this mission.")
        return self.repository.display_frame(read_frame(row[0]))

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
            except CommandError as error:
                receipt = self._receipt(request.command_id, "move", error=error, mid=mid)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            proposed, checkpoint = json.loads(canonical(frame)), self.repository.checkpoint(mid)
            ids = []
            for member in request.move.members:
                control = next(c for c in proposed["interactive"]["controls"] if c["assetId"] == member.asset_id)
                control["busyRevision"] += 1
                execution = MovementExecution(**member.model_dump(), id=str(uuid4()), command_id=request.command_id,
                    mission_id=mid, run_id=frame.interactive.run_id, executor_epoch=frame.interactive.executor_epoch,
                    grant_revision=frame.interactive.grant_revision, reservation_revision=control["busyRevision"],
                    state="Accepted", revision=0, accepted_at=now, accepted_sequence=frame.sequence + 1,
                    deadline=request.move.deadline, travelled_metres=0.0, speed_mps=cruise_speed(frame.interactive.template_id),
                    remaining_metres=distance(json.loads(canonical(member.origin)), json.loads(canonical(member.destination))))
                checkpoint["executions"].append(json.loads(canonical(execution)))
                ids.append(execution.id)
            def receipt_factory(committed):
                receipt = self._receipt(request.command_id, "move", committed, execution_ids=ids)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            return self._commit(mid, proposed, [self._event(proposed, "move-accepted", request.command_id, request.holder_id)], checkpoint, receipt_factory)

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
            if previous and all(previous.get(key) == value for key, value in context.items()) and intent.order <= previous["order"]:
                reason = ("ORDER_SUPERSEDED", "A newer destination is already accepted.")
            if reason is None:
                reason = movement.direct_member_reason(current, control)
            if reason:
                skipped.append(dict(assetId=member.asset_id, entityId=member.entity_id, outcome="skipped", code=reason[0], reason=reason[1]))
            else:
                accepted.append((member, control, current["tracks"][member.control_track_id]["latest"]["position"]))
        # Geometry validation is deliberately before any supersession or reservation.
        targets = endpoints([origin for _, _, origin in accepted], anchor) if accepted else []
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
            try:
                members, outcomes, context = self._validate_direct(mid, request, credential, frame, checkpoint, now)
                if not members:
                    outdated = all(o["code"] == "ORDER_SUPERSEDED" for o in outcomes)
                    raise CommandError("ORDER_SUPERSEDED" if outdated else "NO_AVAILABLE_ASSETS",
                                       "A newer destination is already accepted." if outdated else "No available drones.")
            except CommandError as error:
                receipt = self._receipt(request.command_id, "direct-move", error=error, mid=mid,
                                        direct_order=request.direct.order, member_outcomes=outcomes)
                self.repository.save_receipt(request.command_id, payload, canonical(receipt), mid)
                return receipt
            proposed = json.loads(canonical(frame))
            ids = []
            for member in members:
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
                    speed_mps=cruise_speed(frame.interactive.template_id),
                    remaining_metres=distance(json.loads(canonical(member.origin)), json.loads(canonical(member.destination))))
                checkpoint["executions"].append(json.loads(canonical(execution)))
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
            return self._commit(mid, proposed, [event], checkpoint, receipt_factory)
