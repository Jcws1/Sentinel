from app.world.serialization import read_frame
from contextlib import contextmanager
import json
import sqlite3
from pathlib import Path
from threading import RLock

from app.domain.models import Mission, RecordingMetadata, SentinelEvent, WorldFrame
from app.world.serialization import canonical, validated_frame


class RecordingRepository:
    """One authoritative application process; synchronous short SQLite commits.

    Every read returns freshly decoded data. A transaction owns mission metadata,
    full frame checkpoint and event appends together. No mutable cache aliases.
    """

    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self._lock = RLock()
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1, 2):
            self.db.close()
            raise RuntimeError(f"Unsupported recording schema version: {version}")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.execute("PRAGMA journal_mode = WAL")
        self.db.execute("PRAGMA synchronous = FULL")
        self.db.executescript("""
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS recordings (
                id TEXT PRIMARY KEY, mission_id TEXT NOT NULL UNIQUE,
                stream_epoch TEXT NOT NULL, established_at TEXT NOT NULL,
                mission_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS frames (
                frame_id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id),
                sequence INTEGER NOT NULL, effective_at TEXT NOT NULL,
                recorded_at TEXT NOT NULL, frame_json TEXT NOT NULL,
                UNIQUE(recording_id, sequence)
            );
            CREATE INDEX IF NOT EXISTS frames_effective ON frames(recording_id, effective_at, sequence);
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT NOT NULL, recording_id TEXT NOT NULL REFERENCES recordings(id),
                sequence INTEGER NOT NULL, frame_id TEXT NOT NULL REFERENCES frames(frame_id),
                effective_at TEXT NOT NULL, recorded_at TEXT NOT NULL, event_json TEXT NOT NULL,
                PRIMARY KEY(recording_id, event_id), UNIQUE(recording_id, sequence)
            );
            CREATE INDEX IF NOT EXISTS events_effective ON events(recording_id, effective_at, sequence);
            CREATE TABLE IF NOT EXISTS interactive_checkpoints (
                mission_id TEXT PRIMARY KEY REFERENCES recordings(mission_id),
                run_id TEXT NOT NULL UNIQUE, terminal INTEGER NOT NULL,
                checkpoint_json TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_interactive_run ON interactive_checkpoints(terminal) WHERE terminal=0;
            CREATE TABLE IF NOT EXISTS command_receipts (
                mission_id TEXT NOT NULL REFERENCES recordings(mission_id), command_id TEXT NOT NULL,
                payload_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
                PRIMARY KEY(mission_id, command_id)
            );
            CREATE TABLE IF NOT EXISTS creation_receipts (
                creation_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, receipt_json TEXT NOT NULL
            );
            PRAGMA user_version = 2;
            COMMIT;
        """)

    def close(self):
        self.db.close()

    def establish(self, mission: Mission, recording_id: str, epoch: str, at: str):
        """Durably establish recording before a source builder can run."""
        mission = Mission.model_validate_json(canonical(mission))
        RecordingMetadata(schema_version="1.0", id=recording_id, mission_id=mission.id, stream_epoch=epoch,
                          established_at=at, frame_count=0, event_count=0)
        with self._lock:
            self.db.execute("INSERT INTO recordings VALUES (?, ?, ?, ?, ?)",
                            (recording_id, mission.id, epoch, at, canonical(mission)))

    def has_mission(self, mission_id: str) -> bool:
        return self.db.execute("SELECT 1 FROM recordings WHERE mission_id=?", (mission_id,)).fetchone() is not None

    def list_missions(self) -> list[Mission]:
        return [Mission.model_validate_json(row[0]) for row in self.db.execute("SELECT mission_json FROM recordings ORDER BY mission_id")]

    def latest_text(self, mission_id: str) -> str | None:
        row = self.db.execute("""SELECT f.frame_json FROM frames f JOIN recordings r ON r.id=f.recording_id
                                 WHERE r.mission_id=? ORDER BY f.sequence DESC LIMIT 1""", (mission_id,)).fetchone()
        return row[0] if row else None

    def recording_for(self, mission_id: str) -> RecordingMetadata:
        row = self.db.execute("SELECT id FROM recordings WHERE mission_id=?", (mission_id,)).fetchone()
        if not row:
            raise KeyError(mission_id)
        return self.metadata(row[0])

    def metadata(self, recording_id: str) -> RecordingMetadata:
        row = self.db.execute("SELECT * FROM recordings WHERE id=?", (recording_id,)).fetchone()
        if not row:
            raise KeyError(recording_id)
        count, latest = self.db.execute("SELECT COUNT(*), MAX(sequence) FROM frames WHERE recording_id=?", (recording_id,)).fetchone()
        event_count = self.db.execute("SELECT COUNT(*) FROM events WHERE recording_id=?", (recording_id,)).fetchone()[0]
        return RecordingMetadata(schema_version="1.0", id=row["id"], mission_id=row["mission_id"], stream_epoch=row["stream_epoch"],
                                 established_at=row["established_at"], latest_sequence=latest, frame_count=count, event_count=event_count)

    def event_tail(self, mission_id: str, limit: int = 100) -> list[dict]:
        rows = self.db.execute("""SELECT e.event_json FROM events e JOIN recordings r ON r.id=e.recording_id
                                  WHERE r.mission_id=? ORDER BY e.sequence DESC LIMIT ?""", (mission_id, limit)).fetchall()
        return [json.loads(row[0]) for row in reversed(rows)]

    def events_after(self, mission_id: str, after: int, limit: int) -> list[SentinelEvent]:
        if not self.has_mission(mission_id):
            raise KeyError(mission_id)
        rows = self.db.execute("""SELECT e.event_json FROM events e JOIN recordings r ON r.id=e.recording_id
                                  WHERE r.mission_id=? AND e.sequence>? ORDER BY e.sequence LIMIT ?""", (mission_id, after, limit)).fetchall()
        return [SentinelEvent.model_validate_json(row[0]) for row in rows]

    def observed_history(self, mission_id: str, entity_id: str, frame_id: str, window_seconds: int):
        from datetime import timedelta
        from app.recording.history import MAX_FRAMES, instant, project_history
        # Immutable anchor + sequence ceiling excludes commits made while this read
        # is in flight. The connection lock also protects the bounded query.
        with self._lock:
            row = self.db.execute("""SELECT f.frame_json FROM frames f JOIN recordings r ON r.id=f.recording_id
                WHERE f.frame_id=? AND r.mission_id=?""", (frame_id, mission_id)).fetchone()
            if row is None:
                raise KeyError("Committed mission frame not found")
            anchor = read_frame(row[0])
            start = (instant(anchor.effective_at) - timedelta(seconds=window_seconds)).isoformat(timespec="milliseconds") + "Z"
            rows = self.db.execute("""WITH revisions AS (
                SELECT frame_json, effective_at, ROW_NUMBER() OVER (PARTITION BY effective_at ORDER BY sequence DESC) AS revision
                FROM frames WHERE recording_id=? AND sequence<=? AND effective_at>=? AND effective_at<=?)
                SELECT frame_json FROM revisions WHERE revision=1 ORDER BY effective_at DESC LIMIT ?""",
                (anchor.recording_id, anchor.sequence, start, anchor.effective_at, MAX_FRAMES + 1)).fetchall()
        return project_history(anchor, entity_id, window_seconds, [r[0] for r in rows[:MAX_FRAMES]], len(rows) > MAX_FRAMES)

    def commit(self, frame_text: str, appended_events: list[dict]):
        # Revalidate even a caller-provided model copy; model_copy(update=...) can
        # bypass Pydantic validation and frozen nested objects may have mutated.
        frame_text = validated_frame(frame_text)
        frame = WorldFrame.model_validate_json(frame_text)
        events = [SentinelEvent.model_validate_json(canonical(event)) for event in appended_events]
        with self._lock:
            own_transaction = not self.db.in_transaction
            if own_transaction:
                self.db.execute("BEGIN IMMEDIATE")
            try:
                recording = self.recording_for(frame.mission.id)
                expected = 0 if recording.latest_sequence is None else recording.latest_sequence + 1
                if (frame.recording_id, frame.stream_epoch, frame.sequence) != (recording.id, recording.stream_epoch, expected):
                    raise ValueError("frame recording/epoch/sequence continuity mismatch")
                previous_text = self.latest_text(frame.mission.id)
                if previous_text and frame.recorded_at < json.loads(previous_text)["recordedAt"]:
                    raise ValueError("recorded time must not go backwards")
                event_sequence = self.db.execute("SELECT COALESCE(MAX(sequence), -1) FROM events WHERE recording_id=?", (recording.id,)).fetchone()[0]
                for index, event in enumerate(events, 1):
                    if event.mission_id != frame.mission.id or event.sequence != event_sequence + index or event.recorded_at != frame.recorded_at:
                        raise ValueError("appended event mission/sequence/recordedAt mismatch")
                    for refs, table in ((event.entity_ids, frame.entities), (event.zone_ids, frame.zones), (event.task_ids, frame.tasks)):
                        if len(refs) != len(set(refs)) or any(ref not in table for ref in refs):
                            raise ValueError("appended event has duplicate or dangling references")
                expected_tail = (self.event_tail(frame.mission.id) + [json.loads(canonical(event)) for event in events])[-100:]
                if canonical({"events": expected_tail}) != canonical({"events": [json.loads(canonical(event)) for event in frame.recent_events]}):
                    raise ValueError("frame recentEvents must match the append-only event journal")
                self.db.execute("INSERT INTO frames VALUES (?, ?, ?, ?, ?, ?)",
                                (frame.frame_id, frame.recording_id, frame.sequence, frame.effective_at, frame.recorded_at, frame_text))
                for event in events:
                    self.db.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)",
                                    (event.id, frame.recording_id, event.sequence, frame.frame_id, event.effective_at, event.recorded_at, canonical(event)))
                self.db.execute("UPDATE recordings SET mission_json=? WHERE id=?", (canonical(frame.mission), frame.recording_id))
                if own_transaction:
                    self.db.execute("COMMIT")
            except BaseException:
                if own_transaction:
                    self.db.execute("ROLLBACK")
                raise

    @contextmanager
    def transaction(self):
        """Compose receipt, frame, events and checkpoint under the single writer."""
        with self._lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def active_interactive(self):
        row = self.db.execute("SELECT mission_id FROM interactive_checkpoints WHERE terminal=0").fetchone()
        return row[0] if row else None

    def checkpoint(self, mission_id: str):
        row = self.db.execute("SELECT checkpoint_json FROM interactive_checkpoints WHERE mission_id=?", (mission_id,)).fetchone()
        if row is None:
            raise KeyError(mission_id)
        return json.loads(row[0])

    def save_checkpoint(self, mission_id: str, checkpoint: dict):
        run = checkpoint["run"]
        self.db.execute("INSERT INTO interactive_checkpoints VALUES (?,?,?,?) ON CONFLICT(mission_id) DO UPDATE SET terminal=excluded.terminal, checkpoint_json=excluded.checkpoint_json",
                        (mission_id, run["runId"], int(run["state"] == "ended"), canonical(checkpoint)))

    def receipt(self, request_id: str, mission_id: str | None = None):
        if mission_id is None:
            row = self.db.execute("SELECT payload_json, receipt_json FROM creation_receipts WHERE creation_id=?", (request_id,)).fetchone()
        else:
            row = self.db.execute("SELECT payload_json, receipt_json FROM command_receipts WHERE mission_id=? AND command_id=?", (mission_id, request_id)).fetchone()
        return tuple(row) if row else None

    def save_receipt(self, request_id: str, payload: str, receipt: str, mission_id: str | None = None):
        if mission_id is None:
            self.db.execute("INSERT INTO creation_receipts VALUES (?,?,?)", (request_id, payload, receipt))
        else:
            self.db.execute("INSERT INTO command_receipts VALUES (?,?,?,?)", (mission_id, request_id, payload, receipt))
