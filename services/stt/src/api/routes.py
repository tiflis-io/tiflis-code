# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""FastAPI routes for STT API."""

import io
import tempfile
import time
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from loguru import logger

from src.transcribers.factory import get_model_sizes

# Audio processing imports
try:
    import soundfile as sf
except ImportError:
    sf = None

try:
    from pydub import AudioSegment
except ImportError:
    AudioSegment = None

router = APIRouter(prefix="/v1", tags=["transcription"])


def load_audio(file_bytes: bytes, filename: str) -> tuple[np.ndarray, int]:
    """Load audio from bytes, convert to 16kHz mono float32."""
    # Try soundfile first (supports wav, flac, ogg)
    if sf is not None:
        try:
            audio, sr = sf.read(io.BytesIO(file_bytes))
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)  # Convert to mono

            # Resample to 16kHz if needed
            if sr != 16000:
                import scipy.signal

                audio = scipy.signal.resample(audio, int(len(audio) * 16000 / sr))
                sr = 16000

            return audio.astype(np.float32), sr
        except Exception:
            pass

    # Try pydub for mp3, m4a, webm, etc.
    if AudioSegment is not None:
        try:
            # Determine format from extension
            ext = Path(filename).suffix.lower().lstrip(".")
            if ext in ("mp3", "m4a", "mp4", "webm", "ogg", "wav", "flac"):
                audio_segment = AudioSegment.from_file(io.BytesIO(file_bytes), format=ext)

                # Convert to 16kHz mono
                audio_segment = audio_segment.set_frame_rate(16000).set_channels(1)

                # Convert to numpy array
                samples = np.array(audio_segment.get_array_of_samples(), dtype=np.float32)
                samples /= 32768.0  # Normalize int16 to float32

                return samples, 16000
        except Exception:
            pass

    # Fallback: save to temp file and try soundfile
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=True) as tmp:
        tmp.write(file_bytes)
        tmp.flush()

        if sf is not None:
            audio, sr = sf.read(tmp.name)
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            if sr != 16000:
                import scipy.signal

                audio = scipy.signal.resample(audio, int(len(audio) * 16000 / sr))
                sr = 16000

            return audio.astype(np.float32), sr

    raise ValueError(f"Could not load audio file: {filename}")


@router.get("/models")
async def list_models():
    """List available models (OpenAI-compatible)."""
    models = []
    for model_id in get_model_sizes():
        models.append(
            {
                "id": f"whisper-{model_id}",
                "object": "model",
                "owned_by": "local",
            }
        )
    return {"object": "list", "data": models}


@router.post("/audio/transcriptions")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Form(default="whisper-1"),
    language: Optional[str] = Form(default=None),
    prompt: Optional[str] = Form(default=None),
    response_format: str = Form(default="json"),
    temperature: float = Form(default=0.0),
):
    """
    Transcribe audio to text (OpenAI-compatible endpoint).

    Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg
    """
    # Import here to avoid circular import
    from src.main import get_transcriber

    transcriber = get_transcriber()

    if transcriber is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Read file
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    # Load and convert audio
    try:
        audio, sample_rate = load_audio(file_bytes, file.filename or "audio.wav")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not process audio: {e}")

    # Transcribe
    start_time = time.time()

    # Normalize language (empty, "auto" -> None for auto-detect)
    lang = language
    if lang and lang.lower() in ("auto", ""):
        lang = None

    # Temporarily override language if specified
    original_language = transcriber.language
    transcriber.language = lang

    try:
        result = transcriber.transcribe(audio, sample_rate)
    finally:
        transcriber.language = original_language

    processing_time = time.time() - start_time
    text_preview = result.text[:50] + "..." if len(result.text) > 50 else result.text
    logger.success(
        f"Transcription complete | "
        f"duration: {result.audio_duration:.2f}s | "
        f"processing: {processing_time:.2f}s | "
        f'text: "{text_preview}"'
    )

    # Format response
    if response_format == "text":
        return PlainTextResponse(result.text)

    elif response_format == "verbose_json":
        return JSONResponse(
            {
                "task": "transcribe",
                "language": result.language or language or "unknown",
                "duration": result.audio_duration,
                "text": result.text,
            }
        )

    elif response_format == "srt":
        # Simple SRT format
        duration = result.audio_duration
        srt = f"1\n00:00:00,000 --> {int(duration // 3600):02d}:{int((duration % 3600) // 60):02d}:{int(duration % 60):02d},{int((duration % 1) * 1000):03d}\n{result.text}\n"
        return PlainTextResponse(srt, media_type="text/plain")

    elif response_format == "vtt":
        # WebVTT format
        duration = result.audio_duration
        vtt = f"WEBVTT\n\n00:00:00.000 --> {int(duration // 3600):02d}:{int((duration % 3600) // 60):02d}:{int(duration % 60):02d}.{int((duration % 1) * 1000):03d}\n{result.text}\n"
        return PlainTextResponse(vtt, media_type="text/vtt")

    else:  # json (default)
        return JSONResponse({"text": result.text})
