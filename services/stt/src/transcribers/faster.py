# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Whisper transcription using faster-whisper (CUDA/CPU)."""

import os
import time
from pathlib import Path
from typing import Optional

import numpy as np
from loguru import logger

from src.transcribers.base import BaseTranscriber, TranscriptionResult


# Model mapping to HuggingFace repos (CTranslate2 format)
FASTER_WHISPER_MODEL_REPOS = {
    "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
    "large-v3": "Systran/faster-whisper-large-v3",
    "large-v2": "Systran/faster-whisper-large-v2",
    "medium": "Systran/faster-whisper-medium",
    "small": "Systran/faster-whisper-small",
    "base": "Systran/faster-whisper-base",
    "tiny": "Systran/faster-whisper-tiny",
}

# Alternate model names (standard Whisper naming)
FASTER_WHISPER_MODEL_SIZES = {
    "large-v3-turbo": "large-v3-turbo",
    "large-v3": "large-v3",
    "large-v2": "large-v2",
    "medium": "medium",
    "small": "small",
    "base": "base",
    "tiny": "tiny",
}


def get_models_dir() -> Path:
    """Get the models directory from environment or default."""
    models_dir = os.environ.get("MODELS_DIR", os.environ.get("HF_HOME"))
    if models_dir:
        return Path(models_dir)
    return Path.home() / ".cache" / "huggingface" / "hub"


def get_compute_type(device: str) -> str:
    """
    Get optimal compute type for the device.

    Args:
        device: "cuda" or "cpu"

    Returns:
        Compute type string for faster-whisper
    """
    if device == "cuda":
        return "float16"
    return "int8"  # CPU works best with int8


class FasterWhisperTranscriber(BaseTranscriber):
    """Faster-Whisper transcription (CUDA/CPU)."""

    def __init__(
        self,
        model_size: str = "large-v3",
        language: Optional[str] = None,
        device: str = "auto",
    ):
        """
        Initialize the Faster-Whisper transcriber.

        Args:
            model_size: Whisper model size (e.g., "large-v3", "medium", "small")
            language: Language code for transcription (None for auto-detect)
            device: Device to use ("auto", "cuda", "cpu")
        """
        super().__init__(model_size=model_size, language=language)

        # Determine device
        if device == "auto":
            self.device = self._detect_device()
        else:
            self.device = device

        self.compute_type = get_compute_type(self.device)

        # Get model name/repo
        if model_size in FASTER_WHISPER_MODEL_SIZES:
            self.model_name = FASTER_WHISPER_MODEL_SIZES[model_size]
        else:
            self.model_name = model_size

        # Initialize model
        self._init_model()

    def _detect_device(self) -> str:
        """Detect the best available device."""
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"

    def _init_model(self):
        """Initialize the faster-whisper model."""
        from faster_whisper import WhisperModel

        logger.info(f"Loading model: {self.model_name}")
        logger.info(f"Device: {self.device}, Compute type: {self.compute_type}")

        # Get HF token if available
        hf_token = os.environ.get("HF_TOKEN")

        # Get custom download directory
        download_root = get_models_dir() / "faster-whisper"
        download_root.mkdir(parents=True, exist_ok=True)

        try:
            self.model = WhisperModel(
                self.model_name,
                device=self.device,
                compute_type=self.compute_type,
                download_root=str(download_root),
            )
            logger.success(f"Model loaded: {self.model_name}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise

    def transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> TranscriptionResult:
        """
        Transcribe audio using CUDA or CPU.

        Args:
            audio: Audio samples as float32 numpy array
            sample_rate: Audio sample rate

        Returns:
            TranscriptionResult with text and timing info
        """
        audio_duration = len(audio) / sample_rate

        # Normalize audio
        audio = self._normalize_audio(audio)

        start_time = time.time()

        # Prepare language (None or "auto" means auto-detect)
        lang = self._prepare_language(self.language)

        # Faster-Whisper transcription
        segments, info = self.model.transcribe(
            audio,
            language=lang,
            beam_size=5,
            vad_filter=False,  # We use our own VAD
        )

        # Collect text from all segments
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text)

        text = " ".join(text_parts).strip()
        transcription_time = time.time() - start_time

        return TranscriptionResult(
            text=text,
            audio_duration=audio_duration,
            transcription_time=transcription_time,
            language=info.language,
            language_probability=info.language_probability,
        )

    @classmethod
    def get_available_models(cls) -> dict[str, str]:
        """Get dictionary of available faster-whisper model sizes."""
        return {
            "large-v3-turbo": "Fastest large model (1.5 GB)",
            "large-v3": "Best quality (3 GB) - Recommended",
            "large-v2": "Previous best (3 GB)",
            "medium": "Balanced (1.5 GB)",
            "small": "Fast (500 MB)",
            "base": "Faster (150 MB)",
            "tiny": "Fastest (75 MB)",
        }

    @classmethod
    def get_backend_name(cls) -> str:
        """Get the backend name."""
        return "faster-whisper"
