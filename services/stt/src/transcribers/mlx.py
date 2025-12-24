# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Whisper transcription using mlx-whisper (Apple Silicon GPU)."""

import time
from pathlib import Path
from typing import Optional

import numpy as np
from loguru import logger

from src.transcribers.base import BaseTranscriber, TranscriptionResult


# Model mapping to HuggingFace repos (MLX-optimized)
MLX_MODEL_REPOS = {
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
    "large-v2": "mlx-community/whisper-large-v2-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "small": "mlx-community/whisper-small-mlx",
    "base": "mlx-community/whisper-base-mlx",
    "tiny": "mlx-community/whisper-tiny-mlx",
}


def get_model_cache_path(repo_id: str) -> Path:
    """Get the cache path for a model."""
    cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    repo_folder = "models--" + repo_id.replace("/", "--")
    return cache_dir / repo_folder


def is_model_cached(repo_id: str) -> bool:
    """Check if model is already downloaded."""
    cache_path = get_model_cache_path(repo_id)
    if not cache_path.exists():
        return False
    # Check if snapshots directory has content
    snapshots = cache_path / "snapshots"
    if snapshots.exists() and any(snapshots.iterdir()):
        # Check for model weights file
        for snapshot in snapshots.iterdir():
            weights = snapshot / "weights.npz"
            if weights.exists():
                return True
    return False


def download_model_with_progress(repo_id: str) -> str:
    """Download model with native HuggingFace progress bar."""
    from huggingface_hub import snapshot_download

    # Check if already cached
    if is_model_cached(repo_id):
        logger.info(f"Model cached: {repo_id}")
        return snapshot_download(repo_id, local_files_only=True)

    logger.info(f"Downloading model: {repo_id}")

    # Use native HuggingFace download with tqdm progress
    path = snapshot_download(repo_id)

    logger.success(f"Model downloaded: {repo_id}")
    return path


class MLXTranscriber(BaseTranscriber):
    """MLX Whisper transcription (Apple Silicon GPU accelerated)."""

    def __init__(
        self,
        model_size: str = "large-v3",
        language: Optional[str] = None,
    ):
        """
        Initialize the MLX transcriber.

        Args:
            model_size: Whisper model size (e.g., "large-v3", "medium", "small")
            language: Language code for transcription (None for auto-detect)
        """
        super().__init__(model_size=model_size, language=language)
        self.device = "metal"  # Always Metal GPU on Apple Silicon

        # Get model repo
        if model_size in MLX_MODEL_REPOS:
            self.model_repo = MLX_MODEL_REPOS[model_size]
        else:
            # Assume it's a direct HuggingFace repo
            self.model_repo = model_size

        # Download model with progress
        download_model_with_progress(self.model_repo)
        self._model_loaded = True

    def transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> TranscriptionResult:
        """
        Transcribe audio using Metal GPU.

        Args:
            audio: Audio samples as float32 numpy array
            sample_rate: Audio sample rate

        Returns:
            TranscriptionResult with text and timing info
        """
        import mlx_whisper

        audio_duration = len(audio) / sample_rate

        # Normalize audio
        audio = self._normalize_audio(audio)

        start_time = time.time()

        # Prepare language (None or "auto" means auto-detect)
        lang = self._prepare_language(self.language)

        # MLX Whisper transcription
        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=self.model_repo,
            language=lang,
            fp16=True,  # Use float16 for speed
            verbose=False,
        )

        transcription_time = time.time() - start_time

        # Extract text from result
        text = result.get("text", "").strip()
        language = result.get("language")

        return TranscriptionResult(
            text=text,
            audio_duration=audio_duration,
            transcription_time=transcription_time,
            language=language,
            language_probability=None,  # MLX doesn't provide this
        )

    @classmethod
    def get_available_models(cls) -> dict[str, str]:
        """Get dictionary of available MLX model sizes."""
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
        return "mlx"
