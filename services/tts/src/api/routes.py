"""FastAPI routes for TTS API."""

import time
import wave
from io import BytesIO

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from loguru import logger

from src.config import get_settings
from src.models.schemas import ErrorResponse, OpenAITTSRequest, TTSRequest, TTSResponse, VoiceInfo, VoicesResponse
from src.services.kokoro_service import get_kokoro_service

router = APIRouter(
    prefix="/v1",
    tags=["tts"],
)


def get_wav_duration(audio_data: bytes) -> float:
    """Get duration of WAV audio in seconds."""
    try:
        with wave.open(BytesIO(audio_data), 'rb') as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            return frames / float(rate)
    except Exception:
        # Fallback: estimate based on file size
        # WAV: 24kHz, 16-bit, mono = 48000 bytes/second
        return len(audio_data) / 48000.0


@router.post(
    "/audio/speech",
    responses={
        200: {
            "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}},
            "description": "Audio file",
        },
        400: {"model": ErrorResponse, "description": "Bad request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Create speech from text (OpenAI-compatible)",
    description="Generates audio from the input text using the specified voice.",
)
async def create_speech(
    request: OpenAITTSRequest,
    http_response: Response,
) -> Response:
    """
    Create speech from text using Kokoro TTS (OpenAI-compatible endpoint).

    - **model**: Model to use for TTS (tts-1 or tts-1-hd for compatibility)
    - **input**: The text to generate audio for (max 5000 characters)
    - **voice**: The voice to use (af_heart, af_bella, etc.)
    - **speed**: Speed of the generated audio (0.25 to 4.0)
    - **response_format**: Format of the output audio (we return wav)
    """
    service = get_kokoro_service()
    start_time = time.time()
    text_preview = request.input[:50] + "..." if len(request.input) > 50 else request.input

    logger.info(f"TTS Request | voice: {request.voice} | text: \"{text_preview}\"")

    try:
        audio_io, content_type = await service.synthesize(
            text=request.input,
            voice=request.voice,
            speed=request.speed,
        )

        audio_bytes = audio_io.getvalue()
        processing_time = time.time() - start_time
        duration = get_wav_duration(audio_bytes)

        http_response.headers["Content-Disposition"] = 'attachment; filename="speech.wav"'
        http_response.headers["X-Audio-Duration"] = f"{duration:.3f}"
        http_response.headers["X-Processing-Time"] = f"{processing_time:.3f}"

        # Real-time factor (RTF) = processing time / audio duration
        rtf = processing_time / duration if duration > 0 else 0

        logger.success(
            f"TTS Complete | "
            f"duration: {duration:.2f}s | "
            f"processing: {processing_time:.2f}s | "
            f"RTF: {rtf:.2f}x | "
            f"size: {len(audio_bytes) / 1024:.1f} KB"
        )

        return StreamingResponse(
            BytesIO(audio_bytes),
            media_type=content_type,
        )

    except RuntimeError as e:
        logger.error(f"TTS Failed | {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.error(f"TTS Failed | {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {e!s}",
        ) from e


@router.post(
    "/tts",
    response_model=TTSResponse,
    responses={
        200: {
            "content": {"audio/wav": {"schema": {"type": "string", "format": "binary"}}},
            "description": "Audio file in WAV format",
        },
        400: {"model": ErrorResponse, "description": "Bad request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Convert text to speech",
    description="Synthesize speech from the provided text using the specified voice.",
)
async def text_to_speech(
    request: TTSRequest,
    response: Response,
) -> Response:
    """
    Convert text to speech using Kokoro TTS.

    - **text**: The text to synthesize (max 5000 characters)
    - **voice**: Voice identifier to use (default: "default")
    - **speed**: Speech speed multiplier, 0.25 to 4.0 (default: 1.0)
    """
    service = get_kokoro_service()
    start_time = time.time()
    text_preview = request.text[:50] + "..." if len(request.text) > 50 else request.text

    logger.info(f"TTS Request | voice: {request.voice} | text: \"{text_preview}\"")

    try:
        audio_io, content_type = await service.synthesize(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
        )

        audio_bytes = audio_io.getvalue()
        processing_time = time.time() - start_time
        duration = get_wav_duration(audio_bytes)

        # Real-time factor (RTF) = processing time / audio duration
        rtf = processing_time / duration if duration > 0 else 0

        logger.success(
            f"TTS Complete | "
            f"duration: {duration:.2f}s | "
            f"processing: {processing_time:.2f}s | "
            f"RTF: {rtf:.2f}x | "
            f"size: {len(audio_bytes) / 1024:.1f} KB"
        )

        response.headers["Content-Disposition"] = 'attachment; filename="speech.wav"'
        response.headers["X-Audio-Duration"] = f"{duration:.3f}"
        response.headers["X-Processing-Time"] = f"{processing_time:.3f}"

        return StreamingResponse(
            BytesIO(audio_bytes),
            media_type=content_type,
        )

    except RuntimeError as e:
        logger.error(f"TTS Failed | {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.error(f"TTS Failed | {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {e!s}",
        ) from e


@router.get(
    "/voices",
    response_model=VoicesResponse,
    summary="List available voices",
    description="Returns a list of all available voice identifiers.",
)
async def list_voices() -> VoicesResponse:
    """
    Get list of available voices.

    Returns a list of voice identifiers with metadata including name, language, and gender.
    """
    service = get_kokoro_service()
    voices = service.get_available_voices()
    return VoicesResponse(
        voices=[VoiceInfo(**v) for v in voices],
    )


@router.get(
    "/health",
    summary="Health check",
    description="Check if the API is running and report configuration.",
)
async def health_check() -> dict:
    """Health check endpoint with device and configuration info."""
    settings = get_settings()
    service = get_kokoro_service()

    return {
        "status": "ok",
        "service": "kokoro-tts",
        "device": service.device or "not initialized",
        "config": {
            "model": settings.model_repo_id,
            "lang_code": settings.model_lang_code,
            "default_voice": settings.default_voice,
        },
    }
