"""Recorded source motion is deliberately distinct from live Asset executions."""
from typing import Literal
from pydantic import Field, model_validator
from app.domain.base import Model, Id, Sequence, Finite
from app.commands.contracts import MovePosition, CompletionSample
from app.scenarios.actions import ScheduledAction, validate_chain


class SourceMotion(Model):
    id: Id
    origin: MovePosition
    destination: MovePosition
    accepted_tick: Sequence
    accepted_sequence: Sequence
    started_tick: Sequence | None = None
    travelled_metres: Finite = Field(ge=0)
    remaining_metres: Finite = Field(ge=0)
    speed_mps: Finite = Field(gt=0, le=280/3.6)
    completion_sample: CompletionSample | None = None


class ScheduledExecution(Model):
    action: ScheduledAction
    entity_id: Id
    track_id: Id
    state: Literal["Pending", "Accepted", "Running", "Completed", "Skipped", "Failed", "Cancelled", "Interrupted"]
    revision: Sequence
    consumed_tick: Sequence | None = None
    terminal_tick: Sequence | None = None
    terminal_sequence: Sequence | None = None
    reason: str | None = None
    motion: SourceMotion | None = None

    @model_validator(mode="after")
    def evidence(self):
        terminal = self.state in {"Completed", "Skipped", "Failed", "Cancelled", "Interrupted"}
        if terminal != (self.terminal_sequence is not None) or terminal != (self.terminal_tick is not None):
            raise ValueError("Terminal script state requires committed tick and sequence")
        if terminal and not self.reason:
            raise ValueError("Terminal script state requires a reason")
        if self.state == "Pending" and (self.consumed_tick is not None or self.motion is not None):
            raise ValueError("Pending work cannot contain dispatch evidence")
        if self.state in {"Accepted", "Running", "Completed"} and self.motion is None:
            raise ValueError("Accepted source movement requires execution evidence")
        if self.motion:
            if self.consumed_tick != self.motion.accepted_tick:
                raise ValueError("Source motion must identify its dispatch tick")
            if self.state == "Running" and self.motion.started_tick is None:
                raise ValueError("Running source movement requires a committed start")
            if (self.state == "Completed") != (self.motion.completion_sample is not None):
                raise ValueError("Source completion requires a committed arrival sample")
            sample = self.motion.completion_sample
            if sample and (sample.position != self.motion.destination or sample.track_id != self.track_id or sample.sequence != self.terminal_sequence or self.motion.remaining_metres != 0):
                raise ValueError("Script completion sample does not establish arrival")
        return self


class ScenarioSchedule(Model):
    rule_version: Literal["local-schedule-v1", "local-schedule-v2"]
    run_id: Id
    source_id: Id
    executor_epoch: Id
    start_consumed: bool
    manual_overrides: list[Id] = Field(default_factory=list, max_length=32)
    actions: list[ScheduledExecution] = Field(max_length=128)

    @model_validator(mode="after")
    def identities(self):
        ids = [e.action.id for e in self.actions]
        ticks = [(e.entity_id, e.action.offset_ms) for e in self.actions if e.action.offset_ms is not None]
        active = [e.entity_id for e in self.actions if e.state in {"Accepted", "Running"}]
        if len(ids) != len(set(ids)) or len(ticks) != len(set(ticks)) or len(active) != len(set(active)):
            raise ValueError("Duplicate script identity, actor tick or active source movement")
        if len(self.manual_overrides) != len(set(self.manual_overrides)) or set(active) & set(self.manual_overrides):
            raise ValueError("Manual and source motion cannot own the same actor")
        if not self.start_consumed and any(e.state in {"Accepted", "Running", "Completed", "Skipped"} for e in self.actions):
            raise ValueError("Script dispatch requires Start accounting")
        validate_chain([e.action for e in self.actions], self.rule_version)
        by_id = {e.action.id: e for e in self.actions}
        for item in self.actions:
            if item.action.after_action_id and item.motion:
                previous = by_id[item.action.after_action_id]
                if previous.state != "Completed" or item.motion.accepted_tick != previous.terminal_tick + max(1, item.action.delay_ms // 200):
                    raise ValueError("Dependent dispatch requires its committed predecessor completion and delay")
        return self
