"""Finalize an isolated test demo only after its owning service has stopped.

The caller owns process shutdown. This helper refuses operator database paths;
--delete removes only the explicitly named verification database and sidecars.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.commands.contracts import CommandRequest
from app.commands.service import InteractiveService
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository


async def finish(path: Path) -> dict:
    repo = RecordingRepository(str(path))
    try:
        mission_id = repo.active_interactive()
        if mission_id:
            service = InteractiveService(MissionService(repo), True)
            await service.recover()
            for action in ("acquire", "end"):
                request = CommandRequest(
                    command_id=str(uuid4()),
                    holder_id="Isolated verification cleanup",
                    intent=await service.issue_intent(mission_id, action),
                )
                receipt = await service.command(mission_id, request, "d" * 64)
                if not receipt.accepted:
                    raise RuntimeError("Owned test demo cleanup command refused")
        return {
            "database": str(path),
            "interruptedDemoEnded": bool(mission_id),
            "activeMissionId": repo.active_interactive(),
        }
    finally:
        repo.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()
    path = args.database.resolve()
    if (
        path.parent != (ROOT / "frontend/.cache").resolve()
        or not path.name.startswith("verification-")
        or path.suffix != ".sqlite3"
        or not path.is_file()
    ):
        parser.error("Expected an existing frontend/.cache/verification-*.sqlite3 owned by the stopped test")
    result = asyncio.run(finish(path))
    if args.delete:
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(str(path) + suffix).unlink(missing_ok=True)
        result["deleted"] = True
    print(json.dumps(result))
