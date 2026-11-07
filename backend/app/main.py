from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile

from app.config import Settings, get_settings
from app.streaming import router as streaming_router

app = FastAPI(
    title="Kavach API",
    description="Consent-based voice safety companion prototype.",
    version="0.2.0",
)
app.include_router(streaming_router)

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_AUDIO_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".ogg",
    ".flac",
    ".aac",
    ".m4a",
}
AUDIO_CONTENT_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
}

@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "kavach-api"}


@app.post("/transcribe", tags=["speech"])
async def transcribe_audio(
    audio_file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> dict:
    # 1. Check server configuration.
    if not settings.gnani_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Speech transcription is not configured on the server.",
        )

    # 2. Validate filename and audio format.
    if not audio_file.filename:
        raise HTTPException(
            status_code=400,
            detail="An audio filename is required.",
        )

    extension = Path(audio_file.filename).suffix.lower()

    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Unsupported audio format.",
        )

    # 3. Read at most 10 MB + 1 byte to detect oversized uploads.
    audio_bytes = await audio_file.read(MAX_AUDIO_BYTES + 1)

    if not audio_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded audio file is empty.",
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds the 10 MB upload limit.",
        )

    # 4. Prepare the multipart request for Gnani.
    content_type = AUDIO_CONTENT_TYPES[extension]
    safe_filename = f"audio{extension}"

    headers = {
        "X-API-Key-ID": settings.gnani_api_key.strip(),
    }

    data = {
        "language_code": settings.gnani_stt_language,
    }

    files = {
        "audio_file": (
            safe_filename,
            audio_bytes,
            content_type,
        ),
    }

    # 5. Send the request to the actual Gnani API.
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0)
        ) as client:
            response = await client.post(
                settings.gnani_stt_url,
                headers=headers,
                data=data,
                files=files,
            )

            response.raise_for_status()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Gnani transcription request timed out.",
        ) from None

    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Gnani transcription service returned an error.",
        ) from None

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to the Gnani transcription service.",
        ) from None

    # 6. Validate Gnani's JSON response.
    try:
        result = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Gnani returned an invalid response.",
        ) from None

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="Gnani returned an unexpected response format.",
        )

    transcript = result.get("transcript")

    if result.get("success") is not True or not isinstance(
        transcript, str
    ) or not transcript.strip():
        raise HTTPException(
            status_code=502,
            detail="Gnani could not produce a valid transcription.",
        )

    # 7. Return useful transcription information to the client.
    return {
        "success": True,
        "transcript": transcript,
        "model": result.get("model"),
        "request_id": result.get("request_id"),
        "processing_time": result.get("processing_time"),
        "end_to_end_latency": result.get("end_to_end_latency"),
    }
