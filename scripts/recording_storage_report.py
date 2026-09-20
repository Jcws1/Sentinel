"""Read-only logical payload/allocation report for an explicitly named database.

This measures retained bytes, not cumulative device writes. No checkpoint or
vacuum is issued; file sizes reflect the caller's current lifecycle stage.
"""
import argparse
import json
import sqlite3
from contextlib import closing
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.recording.storage_codec import decode_text


def components(path: Path) -> dict:
    return {
        suffix or "database": candidate.stat().st_size if candidate.exists() else 0
        for suffix in ("", "-wal", "-shm")
        for candidate in (Path(str(path) + suffix),)
    }


def report(path: Path) -> dict:
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        # A live sole writer can continue publishing. Keep every logical count,
        # byte sum and range at one read snapshot; component lengths remain an
        # explicitly separate instantaneous filesystem observation.
        db.execute('BEGIN')
        result = {"files": components(path), "pragmas": {}, "tables": {}}
        for name in ("page_count", "page_size", "freelist_count", "user_version"):
            result["pragmas"][name] = db.execute("PRAGMA " + name).fetchone()[0]
        for name in ("frames", "events", "interactive_checkpoints", "command_receipts",
                     "creation_receipts", "scenario_revisions", "scenario_receipts",
                     "scenario_runs", "recordings"):
            columns = [r[1] for r in db.execute("PRAGMA table_info(" + name + ")")
                       if r[1].endswith("_json")]
            expression = "+".join("length(CAST(" + c + " AS BLOB))" for c in columns)
            count, size = db.execute("SELECT count(*), coalesce(sum(" + expression + "),0) FROM " + name).fetchone()
            result["tables"][name] = {"rows": count, "storedJsonBytes": size}
            logical = sum(len(decode_text(value).encode('utf-8')) for row in db.execute(
                'SELECT ' + ','.join(columns) + ' FROM ' + name) for value in row)
            result["tables"][name]["logicalJsonBytes"] = logical
        result["frameRange"] = db.execute(
            "SELECT min(sequence), max(sequence), min(recorded_at), max(recorded_at) FROM frames"
        ).fetchone()
        try:
            result["allocatedBytesByObject"] = dict(db.execute(
                "SELECT name, sum(pgsize) FROM dbstat GROUP BY name"))
        except sqlite3.OperationalError:
            result["allocatedBytesByObject"] = None
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    print(json.dumps(report(args.database)))
