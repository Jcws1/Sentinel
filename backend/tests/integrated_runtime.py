"""Explicitly opted-in fault injector for a task-owned foreground D7 runtime.

Never imported by app.main or a normal application entry point. It retains one
source loop and one repository; faults run inside that existing writer process.
"""
import json
import os
import sqlite3
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.commands.service import InteractiveService
from app.main import create_app
from app.recording.sqlite_repository import RecordingRepository

database = Path(os.environ.get("SENTINEL_DB_PATH", "")).resolve()
owned_root = Path(__file__).resolve().parents[2] / "frontend" / ".cache"
if (os.environ.get("SENTINEL_INTEGRATION_PROBE") != "1"
        or database.parent != owned_root
        or not database.name.startswith("verification-")
        or database.suffix != ".sqlite3"):
    raise RuntimeError("Integration probe requires an explicitly owned verification database")

gate = {"sourceStalled": False, "failReceiptOperation": None, "injectedFailures": 0}
ordinary_tick = InteractiveService.tick
ordinary_receipt = RecordingRepository.save_receipt


async def controlled_tick(self):
    if not gate["sourceStalled"]:
        return await ordinary_tick(self)


def controlled_receipt(self, request_id, payload, receipt, mission_id=None):
    if (gate["failReceiptOperation"] is not None
            and json.loads(receipt).get("operation") == gate["failReceiptOperation"]):
        gate["failReceiptOperation"] = None
        gate["injectedFailures"] += 1
        raise sqlite3.OperationalError("D7 task-owned receipt rollback probe")
    return ordinary_receipt(self, request_id, payload, receipt, mission_id)


InteractiveService.tick = controlled_tick
RecordingRepository.save_receipt = controlled_receipt
app = create_app(heartbeat_seconds=1)


class SourceGate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stalled: bool


class ReceiptFault(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["behavior", "stop", "return-to-script", "pause", "resume"]


@app.post("/__verification/source")
async def source_gate(value: SourceGate):
    gate["sourceStalled"] = value.stalled
    return gate


@app.post("/__verification/receipt-fault")
async def receipt_fault(value: ReceiptFault):
    gate["failReceiptOperation"] = value.operation
    return gate


@app.get("/__verification/state")
async def probe_state():
    return gate
