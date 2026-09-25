"""Explicitly opted-in P5-BATCH measurement runtime for a task-owned backend.

Times are time.perf_counter_ns() (QueryPerformanceCounter on Windows).

Never imported by app.main or a normal entry point. It serves the ordinary
application unchanged and adds read-only verification routes that expose:
- a 10 ms asyncio heartbeat (maximum interval = event-loop blocking), and
- a publication tap recording when each authoritative message for the watched
  interactive mission is published (other missions: time and size only).
No scheduling, cadence, transaction or recording behavior is modified.
"""
import asyncio
import json
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from app.main import create_app
from app.missions.service import MissionService

database = Path(os.environ.get("SENTINEL_DB_PATH", "")).resolve()
if (os.environ.get("SENTINEL_BATCH_PROBE") != "1" or database.suffix != ".sqlite3"
        or not database.name.startswith("batch-probe-")):
    raise RuntimeError("Batch probe requires SENTINEL_BATCH_PROBE=1 and an owned batch-probe-*.sqlite3 database")

HEARTBEAT_SECONDS = 0.01
beats = deque(maxlen=200_000)
publications = deque(maxlen=200_000)
watch = {"missionId": None}
ordinary_publish = MissionService._publish


def tapped_publish(self, mission_id, message):
    at = time.perf_counter_ns()
    if mission_id == watch["missionId"]:
        value = json.loads(message)
        publications.append(dict(atNs=at, missionId=mission_id, type=value.get("type"), sequence=value.get("sequence"),
                                 epoch=value.get("streamEpoch"), bytes=len(message)))
    else:
        publications.append(dict(atNs=at, missionId=mission_id, type=None, sequence=None, epoch=None, bytes=len(message)))
    return ordinary_publish(self, mission_id, message)


MissionService._publish = tapped_publish
app = create_app()
normal_lifespan = app.router.lifespan_context


@asynccontextmanager
async def probed(application):
    async def heartbeat():
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            beats.append(time.perf_counter_ns())
    async with normal_lifespan(application):
        task = asyncio.create_task(heartbeat())
        try:
            yield
        finally:
            task.cancel()


app.router.lifespan_context = probed


class Watch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    missionId: str


@app.post("/__verification/batch-probe/watch")
async def watch_mission(value: Watch):
    watch["missionId"] = value.missionId
    return dict(watch=watch, serverPerfNs=time.perf_counter_ns())


@app.get("/__verification/batch-probe")
async def probe(sinceNs: int = 0, untilNs: int = 2**63 - 1):
    return dict(heartbeatSeconds=HEARTBEAT_SECONDS, serverPerfNs=time.perf_counter_ns(),
                beats=[b for b in beats if sinceNs <= b <= untilNs],
                publications=[p for p in publications if sinceNs <= p["atNs"] <= untilNs])
