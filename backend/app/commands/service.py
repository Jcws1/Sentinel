"""Interactive application service under the existing mission lock and writer."""
import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta
from uuid import uuid4

from app.commands.contracts import (CommandRequest, CreateRunRequest, DemoEntry, Intent, InteractiveRun,
                                    Receipt, RunRead)
from app.commands.policy import TRANSITIONS
from app.commands.template import TEMPLATE, new_template
from app.world.serialization import canonical


def plus(at: str, seconds: float) -> str:
    return (datetime.fromisoformat(at.replace("Z", "+00:00")) + timedelta(seconds=seconds)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class CommandError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        self.code, self.message, self.status = code, message, status


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

    async def issue_intent(self, mid, action):
        self._enabled()
        async with self.authority._lock(mid):
            run, now = self._run(mid).interactive, self.authority.clock()
            # Expired evidence may be discarded; it can never regain admission.
            self._intents = {k: v for k, v in self._intents.items() if json.loads(v)["expiresAt"] > now}
            if len(self._intents) >= 4096:
                raise CommandError("INTENT_INVALID", "Too many outstanding intents; retry after expiry.", 429)
            intent = Intent(id=str(uuid4()), mission_id=mid, run_id=run.run_id, executor_epoch=run.executor_epoch,
                            source_id=run.source_id, grant_id=run.grant_id, grant_revision=run.grant_revision,
                            run_revision=run.run_revision, lease_revision=run.lease.revision, action=action,
                            issued_at=now, expires_at=plus(now, 30))
            self._intents[intent.id] = canonical(intent)
            return intent

    def _duplicate(self, identity, payload, mid=None):
        saved = self.repository.receipt(identity, mid)
        if saved:
            if saved[0] != payload:
                raise CommandError("IDENTITY_CONFLICT", "This request identity already has different content.")
            return Receipt.model_validate_json(saved[1])
        return None

    def lookup(self, identity, mid=None):
        saved = self.repository.receipt(identity, mid)
        if saved is None:
            raise CommandError("NOT_FOUND", "No committed receipt for this identity.", 404)
        return Receipt.model_validate_json(saved[1])

    def _receipt(self, identity, operation, frame=None, error=None, mid=None):
        return Receipt(request_id=identity, operation=operation, accepted=error is None,
                       code=error.code if error else "OK", message=error.message if error else "Committed",
                       recorded_at=frame.recorded_at if frame else self.authority.clock(),
                       mission_id=frame.mission.id if frame else mid,
                       run_id=frame.interactive.run_id if frame else None,
                       recording_id=frame.recording_id if frame else None,
                       frame_id=frame.frame_id if frame else None, sequence=frame.sequence if frame else None)

    def _event(self, frame, operation, identity=None, holder=None):
        return {"effectiveAt": frame["effectiveAt"], "type": f"interactive.{operation}", "severity": "info",
                "source": {"id": frame["interactive"]["sourceId"], "kind": "simulation", "mode": "simulated"},
                "extensions": {"sentinel.interactive": {"requestId": identity, "holderId": holder}}}

    def _commit(self, mid, proposed, events, checkpoint, receipt_factory=None):
        previous = json.loads(canonical(self.authority.read(mid)))
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
            if request.template_id != TEMPLATE:
                receipt = self._receipt(request.creation_id, "create", error=CommandError("INVALID_REQUEST", "Only the configured local synthetic template is available."))
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            active = self.repository.active_interactive()
            if active:
                receipt = self._receipt(request.creation_id, "create", error=CommandError(
                    "ACTIVE_RUN_EXISTS", "Reopen the active run and End it before creating another."), mid=active)
                self.repository.save_receipt(request.creation_id, payload, canonical(receipt))
                return receipt
            mission, proposed = new_template(self.authority.clock())
            async with self.authority._lock(mission.id):
                with self.repository.transaction():
                    self.repository.establish(mission, str(uuid4()), str(uuid4()), self.authority.clock())
                    frame = self.authority.commit_locked(mission.id, lambda _: (proposed, [self._event(proposed, "created")]), publish=False)
                    self.repository.save_checkpoint(mission.id, {"run": json.loads(canonical(frame.interactive)), "executions": []})
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
        if action not in ("renew", "revoke") and (run.state, action) not in TRANSITIONS:
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
            else:
                updated["state"] = TRANSITIONS[(run.state, action)]
                updated["runRevision"] += 1
                proposed["mission"]["lifecycle"] = "completed" if action == "end" else "active"
                proposed["mission"]["updatedAt"] = max(proposed["mission"]["updatedAt"], now)
                if action == "end":
                    updated["lease"] = {"revision": run.lease.revision + 1}
            checkpoint = self.repository.checkpoint(mid)
            if action in ("revoke", "end"):
                for execution in checkpoint["executions"]:
                    if execution["state"] not in ("Completed", "Cancelled", "Failed", "Expired", "Interrupted"):
                        execution.update(state="Cancelled", reason=f"run-{action}")
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
            if frame.interactive.state != "running":
                return
            proposed = json.loads(canonical(frame))
            effective = plus(frame.effective_at, .2)
            proposed["effectiveAt"] = effective
            proposed["interactive"]["tick"] += 1
            proposed["interactive"]["lastReportAt"] = max(self.authority.clock(), frame.recorded_at)
            for track in proposed["tracks"].values():
                if track["state"] == "tracking":
                    track["latest"]["timestamp"] = effective
                    track["latest"]["discontinuity"] = False
            self._commit(mid, proposed, [], self.repository.checkpoint(mid))

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
                    execution.update(state="Interrupted", reason="backend-restart")
            self._commit(mid, proposed, [self._event(proposed, "restarted-paused")], checkpoint)
