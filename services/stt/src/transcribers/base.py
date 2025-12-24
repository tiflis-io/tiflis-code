# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Base transcriber interface for STT service."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class TranscriptionResult:
    """Result of a transcription."""

    text: str
    audio_duration: float
    transcription_time: float
    language: Optional[str] = None
    language_probability: Optional[float] = None


class BaseTranscriber(ABC):
    """Abstract base class for transcription backends."""

    def __init__(
        self,
        model_size: str = "large-v3",
        language: Optional[str] = None,
    ):
        """
        Initialize the transcriber.

        Args:
            model_size: Model size/name (e.g., "large-v3", "medium", "small")
            language: Language code for transcription (None for auto-detect)
        """
        self.model_size = model_size
        self.language = language

    @abstractmethod
    def transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> TranscriptionResult:
        """
        Transcribe audio.

        Args:
            audio: Audio samples as float32 numpy array
            sample_rate: Audio sample rate (default 16000)

        Returns:
            TranscriptionResult with text and timing info
        """
        pass

    @classmethod
    @abstractmethod
    def get_available_models(cls) -> dict[str, str]:
        """
        Get dictionary of available model sizes and their descriptions.

        Returns:
            Dict mapping model size to description
        """
        pass

    @classmethod
    @abstractmethod
    def get_backend_name(cls) -> str:
        """
        Get the name of this transcriber backend.

        Returns:
            Backend name (e.g., "mlx", "faster-whisper")
        """
        pass

    def _normalize_audio(self, audio: np.ndarray) -> np.ndarray:
        """
        Normalize audio to float32 in range [-1, 1].

        Args:
            audio: Input audio array

        Returns:
            Normalized audio as float32
        """
        # Ensure correct dtype
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        # Normalize if needed (int16 range)
        if np.abs(audio).max() > 1.0:
            audio = audio / 32768.0

        return audio

    def _prepare_language(self, language: Optional[str]) -> Optional[str]:
        """
        Prepare language parameter.

        Args:
            language: Language code or None/"auto"

        Returns:
            Language code or None for auto-detect
        """
        if language and language.lower() == "auto":
            return None
        return language
