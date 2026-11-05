"""A small OpenAI-compatible speech endpoint for Notebook's existing TTS adapter."""
import asyncio
import json
import os
import uuid
from pathlib import Path

from pydantic import BaseModel, Field

APP = Path(__file__).resolve().parent
ROOT = APP.parents[1]
SYSTEM_POWERSHELL = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"
SPEECH_LOCK = asyncio.Lock()

class SpeechRequest(BaseModel):
    model: str = "clarity-windows-tts"
    input: str = Field(min_length=1, max_length=20000)
    voice: str = "alloy"
    response_format: str = "mp3"
    speed: float = Field(default=1, ge=.25, le=4)

async def run(*args):
    process = await asyncio.create_subprocess_exec(
        *args, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        creationflags=0x08000000 if os.name == "nt" else 0)
    try:
        _, error = await asyncio.wait_for(process.communicate(), 120)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise RuntimeError("The local voice took too long") from None
    if process.returncode:
        # Never expose raw shell diagnostics or source content through the API.
        raise RuntimeError("The local speech engine could not prepare this audio")

async def synthesize(request: SpeechRequest) -> bytes:
    if request.model != "clarity-windows-tts" or request.response_format != "mp3":
        raise ValueError("This local voice endpoint supports clarity-windows-tts and MP3")
    if not request.input.strip():
        raise ValueError("Speech input is empty")
    async with SPEECH_LOCK:
        cache = (ROOT / "06-runtime/cache/clarity-tts").resolve()
        cache.mkdir(parents=True, exist_ok=True)
        job = (cache / uuid.uuid4().hex).resolve()
        if not job.is_relative_to(cache):
            raise ValueError("Invalid local voice path")
        job.mkdir()
        payload, wave, audio = job / "request.json", job / "voice.wav", job / "voice.mp3"
        try:
            payload.write_text(json.dumps(request.model_dump(), ensure_ascii=False), "utf-8")
            await run(str(SYSTEM_POWERSHELL), "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
                      "-File", str(APP / "render-system-speech.ps1"),
                      "-InputPath", str(payload), "-OutputPath", str(wave))
            await run(str(ROOT / "06-runtime/tools/ffmpeg/ffmpeg.exe"), "-hide_banner", "-loglevel", "error",
                      "-y", "-i", str(wave), "-codec:a", "libmp3lame", "-q:a", "4", str(audio))
            return audio.read_bytes()
        finally:
            # Only the three known files in the verified, owned cache directory.
            for file in (payload, wave, audio):
                if file.exists():
                    file.unlink()
            job.rmdir()
