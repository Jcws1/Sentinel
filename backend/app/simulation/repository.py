"""Phase 5 journal over the application's single authoritative SQLite writer."""
import json
import sqlite3

from app.recording.storage_codec import decode_text
from app.simulation.contracts import StoredRun, SimulationCommandSummary
from app.simulation.policy import POLICY_ID
from app.simulation.validation import SimulationError, content_digest, parse_request, canonical_external
from app.world.serialization import canonical


class SimulationRepository:
    def __init__(self, repository):
        self.repository = repository
        self.db = repository.db

    def exists(self):
        return self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='simulation_commands'").fetchone() is not None

    def establish_schema(self):
        if not self.db.in_transaction:
            raise RuntimeError("Simulation schema establishment requires the owner transaction")
        # No executescript: it would implicitly commit the encompassing transaction.
        for statement in (
            """CREATE TABLE IF NOT EXISTS mission_writers (
                mission_id TEXT PRIMARY KEY REFERENCES recordings(mission_id), writer_id TEXT NOT NULL)""",
            """CREATE TABLE IF NOT EXISTS simulation_runs (
                mission_id TEXT PRIMARY KEY REFERENCES recordings(mission_id),
                external_id TEXT NOT NULL UNIQUE, run_json TEXT NOT NULL, run_digest TEXT NOT NULL)""",
            """CREATE TABLE IF NOT EXISTS simulation_commands (
                command_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES recordings(mission_id),
                digest TEXT NOT NULL, policy_id TEXT NOT NULL, original_request BLOB NOT NULL,
                request_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','interrupted','completed')),
                received_at TEXT NOT NULL, completed_at TEXT, response_json TEXT, response_digest TEXT,
                action TEXT NOT NULL, source_mode TEXT NOT NULL)""",
            """CREATE TABLE IF NOT EXISTS simulation_profiles (
                profile_id TEXT NOT NULL, version TEXT NOT NULL, profile_json TEXT NOT NULL,
                PRIMARY KEY(profile_id,version))""",
            "CREATE INDEX IF NOT EXISTS simulation_commands_mission ON simulation_commands(mission_id)",
        ):
            self.db.execute(statement)
        self.db.execute("PRAGMA user_version=6")

    def command(self, command_id):
        if not self.exists():
            return None
        row = self.db.execute("SELECT * FROM simulation_commands WHERE command_id=?", (command_id,)).fetchone()
        if row is None:
            return None
        result = dict(row)
        if result["policy_id"] != POLICY_ID:
            raise sqlite3.DatabaseError("Unsupported simulation command policy")
        try:
            body = decode_text(result["request_json"])
            request = parse_request(body)
            if content_digest(request) != result["digest"] or canonical_external(parse_request(result["original_request"])) != body:
                raise ValueError("Command digest mismatch")
            if request["command"]["command_id"] != command_id or result["state"] not in {"pending", "interrupted", "completed"}:
                raise ValueError("Command identity/state mismatch")
            if (request["command"]["action"], request["command"]["source_mode"]) != (result["action"], result["source_mode"]):
                raise ValueError("Command metadata mismatch")
            result["request_json"] = body
            if result["response_json"] is not None:
                result["response_json"] = decode_text(result["response_json"])
                if content_digest(parse_request(result["response_json"])) != result["response_digest"]:
                    raise ValueError("Response digest mismatch")
            if (result["state"] == "completed") != (result["response_json"] is not None and result["completed_at"] is not None):
                raise ValueError("Incomplete command receipt")
        except (ValueError, TypeError, KeyError, SimulationError):
            raise sqlite3.DatabaseError("Malformed simulation journal") from None
        return result

    def run(self, mission_id):
        if not self.exists():
            return None
        row = self.db.execute("SELECT run_json,run_digest FROM simulation_runs WHERE mission_id=?", (mission_id,)).fetchone()
        if row is None:
            return None
        try:
            text = decode_text(row[0])
            if content_digest(parse_request(text)) != row[1]:
                raise ValueError("Checkpoint digest mismatch")
            run = StoredRun.model_validate_json(text)
            if run.mission_id != mission_id:
                raise ValueError("Checkpoint identity mismatch")
            return run
        except (ValueError, TypeError, SimulationError):
            raise sqlite3.DatabaseError("Malformed simulation checkpoint") from None

    def runs(self):
        if not self.exists():
            return []
        return [self.run(row[0]) for row in self.db.execute("SELECT mission_id FROM simulation_runs ORDER BY mission_id").fetchall()]

    def save_run(self, run):
        if not self.db.in_transaction:
            raise RuntimeError("Simulation checkpoint requires the owner transaction")
        checked = StoredRun.model_validate_json(canonical(run))
        text = canonical(checked)
        self.db.execute("INSERT INTO simulation_runs VALUES (?,?,?,?) ON CONFLICT(mission_id) DO UPDATE SET run_json=excluded.run_json,run_digest=excluded.run_digest",
                        (checked.mission_id, checked.external_mission_id, self.repository._stored(text), content_digest(json.loads(text))))

    def profile(self, identity, version):
        if not self.exists():
            return None
        row = self.db.execute("SELECT profile_json FROM simulation_profiles WHERE profile_id=? AND version=?", (identity, version)).fetchone()
        return row[0] if row else None

    def commands(self, mission_id, after, limit):
        if not self.exists():
            return []
        rows = self.db.execute("SELECT rowid AS sequence,command_id,action,state,received_at,completed_at FROM simulation_commands WHERE mission_id=? AND rowid>? ORDER BY rowid LIMIT ?", (mission_id, after, limit)).fetchall()
        try:
            return [SimulationCommandSummary.model_validate(dict(row)) for row in rows]
        except ValueError:
            raise sqlite3.DatabaseError("Malformed simulation command index") from None
