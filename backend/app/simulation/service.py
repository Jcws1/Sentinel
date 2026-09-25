"""Durable command boundary around the pure external simulation resolver.

The prepared command and initial recording commit before evaluation. Completion
owns response, frames, events and run checkpoint in one synchronous transaction.
No coroutine yields while the shared SQLite connection has an open transaction.
"""
import asyncio
import sqlite3
import logging
from uuid import uuid4

from app.adapters.simulation_v1.projection import control_event, control_frame, mission_identity, new_mission, sample_frame
from app.simulation.calibration import CalibrationRegistry
from app.simulation.contracts import CalibrationIdentity, SimulationRunStatus, StoredRun
from app.simulation.policy import POLICY_ID, TRANSITIONS, WRITER_ID
from app.simulation.repository import SimulationRepository
from app.simulation.resolver import resolve_steps, validate_complete_steps
from app.simulation.validation import SimulationError, canonical_external, content_digest, parse_request


async def cooperative(iterator):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + .002
    while True:
        try:
            next(iterator)
        except StopIteration as complete:
            return complete.value
        if loop.time() >= deadline:
            await asyncio.sleep(0)
            deadline = loop.time() + .002


class SimulationService:
    def __init__(self, authority, calibration_directory=None):
        self.authority = authority
        self.repository = authority.repository
        self.journal = SimulationRepository(self.repository)
        self.calibrations = CalibrationRegistry(calibration_directory)
        self._gate = asyncio.Lock()
        self._tasks = set()
        self._closing = False

    async def recover(self):
        if not self.journal.exists():
            return
        # Recovery does not invent a new command, rerun effects, or mutate frames.
        # Status truthfully exposes interrupted work until the exact request retries.
        with self.repository.transaction():
            for run in self.journal.runs():
                if run.pending_command_id:
                    command = self.journal.command(run.pending_command_id)
                    if command is None or command["state"] == "completed":
                        raise sqlite3.DatabaseError("Simulation pending identity mismatch")
                    self.journal.save_run(run.model_copy(update={"phase": "interrupted"}))
            self.repository.db.execute("UPDATE simulation_commands SET state='interrupted' WHERE state='pending'")

    async def close(self):
        self._closing = True
        for task in tuple(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def submit(self, raw):
        if self._closing:
            raise SimulationError("SERVICE_UNAVAILABLE", "", "Service is stopping; retry the exact request", 503)
        task = asyncio.create_task(self._observed_submit(raw))
        self._tasks.add(task)
        # A lost HTTP response must not cancel an accepted authoritative command.
        def finished(done):
            self._tasks.discard(done)
            if not done.cancelled():
                done.exception()  # Consume exceptions also when the HTTP peer left.
        task.add_done_callback(finished)
        return await asyncio.shield(task)

    async def _observed_submit(self, raw):
        # The task inherits the HTTP trace and survives a disconnected caller.
        # Diagnostics must not change how the parser rejects unsupported values.
        with self.authority.telemetry.span("simulation.submit", input_bytes=len(raw) if isinstance(raw, bytes) else None):
            return await self._submit(raw)

    def status(self, mission_id):
        run = self.journal.run(mission_id)
        if run is None:
            raise KeyError(mission_id)
        return SimulationRunStatus.model_validate({key: value for key, value in run.model_dump().items()
                                                  if key in SimulationRunStatus.model_fields})

    def statuses(self):
        return [self.status(run.mission_id) for run in self.journal.runs()]

    async def _submit(self, raw):
        request = parse_request(raw)
        await cooperative(validate_complete_steps(request))
        body = canonical_external(request)
        digest = content_digest(request)
        command_id = request["command"]["command_id"]
        mission_id = mission_identity(request["mission_id"])
        self.authority.telemetry.event("simulation.validated", mission_id=mission_id, command_id=command_id,
                                       action=request["command"]["action"], timestamps=len(request["samples_by_timestamp"]),
                                       input_rows=sum(len(rows) for rows in request["samples_by_timestamp"].values()))
        async with self._gate, self.authority._lock(mission_id):
            prior = self.journal.command(command_id)
            if prior:
                if prior["digest"] != digest or prior["request_json"] != body:
                    raise SimulationError("COMMAND_ID_CONFLICT", "/command/command_id", "Command identity already has different content", 409)
                if prior["state"] == "completed":
                    self.authority.telemetry.event("simulation.retry_returned", mission_id=mission_id, command_id=command_id)
                    return prior["response_json"]
                run = self.journal.run(mission_id)
                if run is None or run.pending_command_id != command_id:
                    raise sqlite3.DatabaseError("Interrupted simulation identity mismatch")
            else:
                run = self.journal.run(mission_id)
                if run and run.pending_command_id:
                    raise SimulationError("RUN_COMMAND_PENDING", "/command/command_id", "Retry the exact interrupted command before another transition", 409)
                transition = TRANSITIONS[run.state if run else None][request["command"]["action"]]
                if transition not in {"RUNNING", "HELD", "ABORTED"}:
                    raise SimulationError(transition, "/command/action", "Command is not allowed in the current run state", 409)
                profile = request["calibration_profile"]
                profile_body = canonical_external(profile)
                old_profile = self.journal.profile(profile["profile_id"], profile["version"])
                if old_profile is not None and old_profile != profile_body:
                    raise SimulationError("CALIBRATION_ID_CONFLICT", "/calibration_profile", "Calibration identity is immutable", 409)
                artifact = self.calibrations.verify(profile)
                run = self._prepare(request, raw, body, digest, run, artifact)
            try:
                response, health = await cooperative(resolve_steps(request, run.last_health))
                return self._complete(request, run, response, health)
            except (Exception, asyncio.CancelledError) as error:
                # The prepared journal survives; a failed completion transaction
                # neither replaces the previous state nor publishes candidate frames.
                self._mark_interrupted(run)
                self.authority.telemetry.event("simulation.interrupted", level=logging.ERROR, mission_id=mission_id,
                                               command_id=command_id, error_type=type(error).__name__, pending=True)
                raise

    def _prepare(self, request, raw, body, digest, previous, artifact):
        now = self.authority.clock()
        run = StoredRun(mission_id=mission_identity(request["mission_id"]), external_mission_id=request["mission_id"],
            run_id=previous.run_id if previous else str(uuid4()), state=previous.state if previous else None,
            phase="processing", command_id=request["command"]["command_id"], source_mode=request["command"]["source_mode"],
            calibration=CalibrationIdentity(
                **{key: request["calibration_profile"][key] for key in ("profile_id", "version", "evidence_status")}),
            received_at=now, last_health=previous.last_health if previous else {}, pending_command_id=request["command"]["command_id"], last_request=request)
        deferred = []
        with self.repository.transaction():
            self.journal.establish_schema()
            if previous is None:
                if self.repository.has_mission(run.mission_id):
                    raise SimulationError("MISSION_OWNERSHIP_CONFLICT", "/mission_id", "This internal mission already belongs to another source", 409)
                self.repository.establish(new_mission(run), str(uuid4()), str(uuid4()), now)
                self.repository.db.execute("INSERT INTO mission_writers VALUES (?,?)", (run.mission_id, WRITER_ID))
            self.repository.db.execute("INSERT INTO simulation_profiles VALUES (?,?,?) ON CONFLICT DO NOTHING",
                (run.calibration.profile_id, run.calibration.version, canonical_external(request["calibration_profile"])))
            self.repository.db.execute("INSERT INTO simulation_commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (run.command_id, run.mission_id, digest, POLICY_ID, raw.encode("utf-8") if isinstance(raw, str) else raw,
                 self.repository._stored(body), "pending", now, None, None, None, request["command"]["action"], request["command"]["source_mode"]))
            self.journal.save_run(run)
            def build(previous_frame):
                frame, events = control_frame(previous_frame, run, now, "simulation.v1.command-received")
                if artifact is not None:
                    events[0]["extensions"]["sentinel.simulation.v1"]["calibrationArtifact"] = artifact
                return frame, events
            self.authority.commit_locked(run.mission_id, build, publish=False, deferred_messages=deferred,
                                         source_owner=WRITER_ID, preserve_event_ids=True)
        self._publish(run.mission_id, deferred)
        self.authority.telemetry.event("simulation.prepared", mission_id=run.mission_id, command_id=run.command_id,
                                       action=request["command"]["action"], pending=True, recorded_at=now)
        return run

    def _complete(self, request, run, response, health):
        completed = self.authority.clock()
        final = run.model_copy(update={"state": response["command_ack"]["run_status"], "phase": "ready",
            "completed_at": completed, "last_health": health, "pending_command_id": None})
        response_text = canonical_external(response)
        deferred = []
        with self.repository.transaction():
            last_at = next(reversed(response["results_by_timestamp"]), None)
            for at, results in response["results_by_timestamp"].items():
                def build(previous, at=at, results=results):
                    frame, events = sample_frame(previous, final, at, request["samples_by_timestamp"][at], results, completed)
                    if at == last_at:
                        events.append(control_event(final, "simulation.v1.command-completed"))
                    return frame, events
                self.authority.commit_locked(run.mission_id,
                    build,
                    publish=False, deferred_messages=deferred, source_owner=WRITER_ID, preserve_event_ids=True)
            # Control commands have no sample frame. Otherwise completion joins
            # the last authoritative sample rather than duplicating its full world.
            if last_at is None:
                self.authority.commit_locked(run.mission_id,
                    lambda previous: control_frame(previous, final, completed, "simulation.v1.command-completed"),
                    publish=False, deferred_messages=deferred, source_owner=WRITER_ID, preserve_event_ids=True)
            self.journal.save_run(final)
            self.repository.db.execute("UPDATE simulation_commands SET state='completed',completed_at=?,response_json=?,response_digest=? WHERE command_id=?",
                (completed, self.repository._stored(response_text), content_digest(response), run.command_id))
        self._publish(run.mission_id, deferred)
        self.authority.telemetry.event("simulation.recorded", mission_id=run.mission_id, command_id=run.command_id,
                                       run_status=final.state, timestamps=len(response["results_by_timestamp"]),
                                       recorded_at=completed, pending=False)
        return response_text

    def _mark_interrupted(self, run):
        try:
            with self.repository.transaction():
                self.repository.db.execute("UPDATE simulation_commands SET state='interrupted' WHERE command_id=? AND state!='completed'", (run.command_id,))
                current = self.journal.run(run.mission_id)
                if current and current.pending_command_id == run.command_id:
                    self.journal.save_run(current.model_copy(update={"phase": "interrupted"}))
        except sqlite3.Error:
            # Durable pending is enough for startup recovery if storage remains down.
            pass

    def _publish(self, mission_id, messages):
        for message in messages:
            self.authority._publish(mission_id, message)
