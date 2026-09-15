from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.voice import TRANSCRIBE_MODEL, plan_command, transcribe_audio


router = APIRouter(prefix="/api/voice", tags=["voice"])


class CommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    transcript: str = Field(min_length=1, max_length=4000)


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    text = await transcribe_audio(
        file.filename or "sentinel-voice.webm",
        file.content_type or "audio/webm",
        await file.read(),
    )
    return {"text": text, "model": TRANSCRIBE_MODEL}


@router.post("/command")
async def command(request: CommandRequest):
    return {"command": (await plan_command(request.transcript)).model_dump(exclude_none=True)}
