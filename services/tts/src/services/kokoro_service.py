"""Kokoro TTS service wrapper."""

import asyncio
from io import BytesIO

import numpy as np
from loguru import logger

try:
    from kokoro import KPipeline
    KOKORO_AVAILABLE = True
except ImportError:
    KOKORO_AVAILABLE = False

from src.config import Settings, get_settings
from src.models.schemas import VoiceInfo


class KokoroService:
    """Service for handling Kokoro TTS operations."""

    # Default American English voices from Kokoro
    AVAILABLE_VOICES = [
        "af_heart",  # American Female Heart
        "af_bella",  # American Female Bella
        "af_nicole", # American Female Nicole
        "af_sarah",  # American Female Sarah
        "af_sky",    # American Female Sky
        "am_michael", # American Male Michael
        "am_adam",   # American Male Adam
        "am_echo",   # American Male Echo
    ]

    def __init__(self, settings: Settings | None = None) -> None:
        """Initialize the Kokoro service."""
        self._settings = settings or get_settings()
        self._pipeline: KPipeline | None = None
        self._voices: dict[str, VoiceInfo] = {}
        self._device: str | None = None

    @property
    def device(self) -> str | None:
        """Return the compute device in use."""
        return self._device

    async def initialize(self) -> None:
        """Initialize the Kokoro pipeline (lazy loading)."""
        if not KOKORO_AVAILABLE:
            raise RuntimeError(
                "Kokoro is not installed. Install with: pip install kokoro"
            )

        if self._pipeline is None:
            # Determine device
            self._device = self._settings.get_device()
            logger.info(f"Initializing Kokoro pipeline on device: {self._device}")

            # Load pipeline in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            self._pipeline = await loop.run_in_executor(
                None,
                lambda: KPipeline(
                    lang_code=self._settings.model_lang_code,
                    repo_id=self._settings.model_repo_id,
                    device=self._device,
                ),
            )
            self._load_voices()
            logger.info(f"Kokoro pipeline initialized successfully")

    def _load_voices(self) -> None:
        """Load available voices from the model."""
        default_voices = [
            {"id": "af_heart", "name": "Heart (American Female)", "language": "en", "gender": "female"},
            {"id": "af_bella", "name": "Bella (American Female)", "language": "en", "gender": "female"},
            {"id": "af_nicole", "name": "Nicole (American Female)", "language": "en", "gender": "female"},
            {"id": "af_sarah", "name": "Sarah (American Female)", "language": "en", "gender": "female"},
            {"id": "af_sky", "name": "Sky (American Female)", "language": "en", "gender": "female"},
            {"id": "am_michael", "name": "Michael (American Male)", "language": "en", "gender": "male"},
            {"id": "am_adam", "name": "Adam (American Male)", "language": "en", "gender": "male"},
            {"id": "am_echo", "name": "Echo (American Male)", "language": "en", "gender": "male"},
        ]
        for voice in default_voices:
            self._voices[voice["id"]] = VoiceInfo(**voice)

    async def synthesize(
        self,
        text: str,
        voice: str = "af_heart",
        speed: float = 1.0,
    ) -> tuple[BytesIO, str]:
        """
        Synthesize speech from text.

        Returns:
            A tuple of (audio_data, content_type).
        """
        await self.initialize()

        if self._pipeline is None:
            raise RuntimeError("Pipeline not initialized")

        # Use default voice from settings if voice not found
        voice_id = voice if voice in self._voices else self._settings.default_voice

        # Run synthesis in thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: list(self._pipeline(text, voice=voice_id, speed=speed, split_pattern=r'\n'))[0],
        )

        # Get audio from result (result is (graphemes, phonemes, audio))
        import torch
        audio_data = result.audio  # type: ignore

        # Convert to WAV bytes
        audio_io = BytesIO()
        import wave

        with wave.open(audio_io, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(24000)  # Kokoro sample rate
            wav_file.writeframes(
                (audio_data.numpy() * 32767).astype(np.int16).tobytes()  # type: ignore
            )

        audio_io.seek(0)
        return audio_io, "audio/wav"

    def get_available_voices(self) -> list[dict]:
        """Return list of available voices."""
        return [v.model_dump() for v in self._voices.values()]


# Singleton instance
_kokoro_service: KokoroService | None = None


def get_kokoro_service() -> KokoroService:
    """Get or create the singleton Kokoro service instance."""
    global _kokoro_service
    if _kokoro_service is None:
        _kokoro_service = KokoroService()
    return _kokoro_service
