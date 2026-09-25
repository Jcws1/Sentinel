import asyncio
import json
import logging
from app.observability import NULL_TELEMETRY
from dataclasses import dataclass
from typing import Callable
from uuid import uuid4

from app.domain.models import Mission, WorldFrame
from app.scenarios.location import geometry_for
from app.recording.sqlite_repository import RecordingRepository
from app.world.contracts import DeltaMessage, ResyncRequiredMessage, SnapshotMessage
from app.world.serialization import canonical, utc_now, read_frame


class SequenceConflict(Exception):
    pass


@dataclass(eq=False)
class Subscription:
    queue: asyncio.Queue[str]


class MissionService:
    def __init__(self, repository: RecordingRepository, queue_size: int = 32, clock: Callable[[], str] = utc_now, telemetry=None):
        if queue_size < 1:
            raise ValueError("subscriber queue must be bounded and positive")
        self.repository = repository
        self.telemetry = telemetry if telemetry is not None else NULL_TELEMETRY
        self.queue_size = queue_size
        self.clock = clock
        self._locks: dict[str, asyncio.Lock] = {}
        self._subscribers: dict[str, set[Subscription]] = {}

    def _lock(self, mission_id: str):
        return self._locks.setdefault(mission_id, asyncio.Lock())

    async def establish(self, mission: Mission):
        async with self._lock(mission.id):
            if not self.repository.has_mission(mission.id):
                self.repository.establish(mission, str(uuid4()), str(uuid4()), self.clock())

    def read(self, mission_id: str) -> WorldFrame:
        frame = self.repository.latest_text(mission_id)
        if frame is None:
            raise KeyError(mission_id)
        return self.repository.display_frame(read_frame(frame))

    async def subscribe(self, mission_id: str) -> tuple[str, Subscription]:
        # Snapshot and membership in subsequent publication are one critical section.
        async with self._lock(mission_id):
            frame = self.read(mission_id)
            subscription = Subscription(asyncio.Queue(maxsize=self.queue_size))
            self._subscribers.setdefault(mission_id, set()).add(subscription)
            snapshot = SnapshotMessage(type="snapshot", schema_version=frame.schema_version, mission_id=mission_id, stream_epoch=frame.stream_epoch,
                                       sequence=frame.sequence, frame=frame)
            return canonical(snapshot), subscription

    def unsubscribe(self, mission_id: str, subscription: Subscription):
        self._subscribers.get(mission_id, set()).discard(subscription)

    def subscriber_count(self, mission_id: str) -> int:
        return len(self._subscribers.get(mission_id, set()))

    async def commit_source(self, mission_id: str, build: Callable, expected_sequence: int | None = None) -> WorldFrame:
        """Process a source only after a recording exists; this is an internal port.

        build receives a fresh previous frame dictionary and returns a full proposed
        world plus new events. Frame/event identities, sequencing and recordedAt are
        allocated here. HTTP exposes this only for the opt-in deterministic fixture.
        """
        async with self._lock(mission_id):
            return self.commit_locked(mission_id, build, expected_sequence)

    def commit_locked(self, mission_id: str, build: Callable, expected_sequence: int | None = None,
                      effects: Callable | None = None, publish: bool = True,
                      deferred_messages: list[str] | None = None, source_owner: str | None = None,
                      preserve_event_ids: bool = False) -> WorldFrame:
        """Internal port: caller owns the mission lock; outer transactions publish later."""
        writer = self.repository.writer_for(mission_id)
        if writer is not None and writer != source_owner:
            raise ValueError("Source writer does not own this mission")
        if preserve_event_ids and (writer is None or writer != source_owner):
            raise ValueError("Explicit event identity requires the registered source owner")
        recording = self.repository.recording_for(mission_id)  # Must precede build.
        previous_text = self.repository.latest_text(mission_id)
        previous = json.loads(previous_text) if previous_text else None
        previous_sequence = previous["sequence"] if previous else None
        if expected_sequence is not None and expected_sequence != previous_sequence:
            raise SequenceConflict("Fixture changed; reload the latest frame before advancing")
        proposed, events = build(json.loads(previous_text) if previous_text else None)
        # Clamp wall-clock regressions without altering the effective source time.
        recorded_at = max(self.clock(), previous["recordedAt"] if previous else recording.established_at)
        event_tail = self.repository.event_tail(mission_id)
        event_sequence = event_tail[-1]["sequence"] + 1 if event_tail else 0
        events = json.loads(canonical({"events": events}))["events"]
        for index, event in enumerate(events):
            event.update(id=event["id"] if preserve_event_ids else str(uuid4()), missionId=mission_id, sequence=event_sequence + index, recordedAt=recorded_at)
        proposed = json.loads(canonical(proposed))
        if previous and geometry_for(previous) != geometry_for(proposed):
            raise ValueError("A mission's frozen horizontal geometry cannot change")
        proposed.update(schemaVersion="1.11" if geometry_for(proposed) is not None else "1.10", recordingId=recording.id, streamEpoch=recording.stream_epoch,
                        sequence=0 if previous is None else previous_sequence + 1,
                        frameId=str(uuid4()), recordedAt=recorded_at,
                        recentEvents=(event_tail + events)[-100:])
        if proposed.get("mission", {}).get("id") != mission_id:
            raise ValueError("source frame mission differs from authority context")
        frame = WorldFrame.model_validate_json(canonical(proposed))
        committed_text = canonical(frame)
        # Build/validate transport before commit, but distribute only AFTER it.
        message = self._delta(previous, json.loads(committed_text), events) if previous else canonical(
            SnapshotMessage(type="snapshot", schema_version=frame.schema_version, mission_id=mission_id, stream_epoch=frame.stream_epoch, sequence=frame.sequence, frame=frame))
        if effects:
            # The caller already owns the encompassing repository transaction.
            self.repository.commit(committed_text, events)
            effects(frame)
        else:
            self.repository.commit(committed_text, events)
        if publish:
            self._publish(mission_id, message)
        elif deferred_messages is not None:
            # The outer transaction owner publishes this already validated message
            # only after checkpoint/receipt/world commit together successfully.
            deferred_messages.append(message)
        return frame

    def _delta(self, previous: dict, current: dict, events: list[dict]) -> str:
        changes = {"mission": current["mission"], "events": events, "interactive": current.get("interactive"), "scenario": current.get("scenario"), "boundaryRules": current.get("boundaryRules"), "scenarioSchedule": current.get("scenarioSchedule"), "liveBoundaries": current.get("liveBoundaries"), "fleetBehavior": current.get("fleetBehavior")}
        changes["unitProfiles"] = current.get("unitProfiles", {})
        for table in ("entities", "tracks", "assets", "sensors", "zones", "tasks"):
            changes[table] = {"upserts": {key: item for key, item in current[table].items() if previous[table].get(key) != item},
                              "removes": sorted(set(previous[table]) - set(current[table]))}
        payload = {"type": "delta", "schemaVersion": current["schemaVersion"], "missionId": current["mission"]["id"],
                   "previousSequence": previous["sequence"], "changes": changes}
        for key in ("streamEpoch", "sequence", "frameId", "recordingId", "effectiveAt", "recordedAt"):
            payload[key] = current[key]
        return canonical(DeltaMessage.model_validate_json(canonical(payload)))

    def _publish(self, mission_id: str, message: str):
        # All callers publish only after their encompassing transaction commits.
        self.telemetry.published(mission_id, message)
        for subscription in tuple(self._subscribers.get(mission_id, set())):
            if subscription.queue.full():
                self.unsubscribe(mission_id, subscription)
                self.telemetry.event("stream.resync_required", level=logging.WARNING, mission_id=mission_id, reason="slow-consumer")
                while not subscription.queue.empty():
                    subscription.queue.get_nowait()
                subscription.queue.put_nowait(canonical(ResyncRequiredMessage(type="resync-required", schema_version=json.loads(message)["schemaVersion"], mission_id=mission_id, reason="slow-consumer")))
            else:
                subscription.queue.put_nowait(message)
