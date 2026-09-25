import asyncio
import json
import logging
from uuid import uuid4
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.world.contracts import HeartbeatMessage
from app.world.serialization import canonical, utc_now

router = APIRouter()


@router.websocket("/api/missions/{mission_id:path}/stream")
async def stream(websocket: WebSocket, mission_id: str):
    service = websocket.app.state.service
    telemetry = service.telemetry
    connection_id = uuid4().hex[:16]
    try:
        snapshot, subscription = await service.subscribe(mission_id)
    except KeyError:
        await websocket.close(code=1008, reason="Mission has no committed frame")
        return

    async def send():
        cursor = json.loads(snapshot)
        await asyncio.wait_for(websocket.send_text(snapshot), timeout=5)
        telemetry.event("stream.connected", connection_id=connection_id, mission_id=mission_id,
                        sequence=cursor["sequence"], subscriber_count=service.subscriber_count(mission_id))
        while True:
            try:
                message = await asyncio.wait_for(subscription.queue.get(), timeout=websocket.app.state.heartbeat_seconds)
            except asyncio.TimeoutError:
                if not subscription.queue.empty():
                    continue
                heartbeat = HeartbeatMessage(type="heartbeat", schema_version=cursor["schemaVersion"], mission_id=mission_id, stream_epoch=cursor["streamEpoch"],
                                             sequence=cursor["sequence"], server_time=utc_now())
                await asyncio.wait_for(websocket.send_text(canonical(heartbeat)), timeout=5)
                continue
            parsed = json.loads(message)
            # A timed-out send terminates this stream; it must not consume a delta
            # then continue as though that sequence was delivered successfully.
            await asyncio.wait_for(websocket.send_text(message), timeout=5)
            if parsed["type"] == "resync-required":
                await websocket.close(code=1013, reason="Resnapshot required")
                return
            cursor = parsed

    async def receive():
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message["type"] == "websocket.receive":
                await websocket.close(code=1008, reason="Read-only server stream")
                return

    tasks = []
    try:
        await websocket.accept()
        tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (WebSocketDisconnect, RuntimeError, asyncio.TimeoutError) as error:
        telemetry.event("stream.failed", level=logging.WARNING, connection_id=connection_id, mission_id=mission_id, error_type=type(error).__name__)
    finally:
        service.unsubscribe(mission_id, subscription)
        telemetry.event("stream.disconnected", connection_id=connection_id, mission_id=mission_id,
                        subscriber_count=service.subscriber_count(mission_id))
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError, asyncio.TimeoutError):
                await task
