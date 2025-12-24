# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Factory for creating transcriber instances based on platform."""

from typing import Optional

from loguru import logger

from src.transcribers.base import BaseTranscriber
from src.utils.platform_detect import (
    TranscriberBackend,
    detect_platform,
    get_effective_backend,
)


def create_transcriber(
    model_size: str = "large-v3",
    language: Optional[str] = None,
    backend: Optional[str] = None,
    device: Optional[str] = None,
) -> BaseTranscriber:
    """
    Create a transcriber instance based on platform and configuration.

    Args:
        model_size: Model size to use (e.g., "large-v3", "medium", "small")
        language: Language code for transcription (None for auto-detect)
        backend: Force specific backend ("mlx", "faster-whisper", or None for auto)
        device: Force specific device ("cuda", "cpu", "metal", or None for auto)

    Returns:
        Configured transcriber instance

    Raises:
        RuntimeError: If the required backend is not available
    """
    # Determine backend
    if backend:
        # Use specified backend
        if backend.lower() == "mlx":
            effective_backend = TranscriberBackend.MLX
        elif backend.lower() in ("faster-whisper", "faster_whisper", "fw"):
            effective_backend = TranscriberBackend.FASTER_WHISPER
        else:
            raise ValueError(f"Unknown backend: {backend}")
    else:
        # Auto-detect or use environment variable
        effective_backend = get_effective_backend()

    # Print platform info
    platform_info = detect_platform()
    logger.info(f"Platform: {platform_info.os.value}/{platform_info.architecture.value}")
    logger.info(f"Accelerator: {platform_info.accelerator.value}")
    logger.info(f"Backend: {effective_backend.value}")

    if effective_backend == TranscriberBackend.MLX:
        return _create_mlx_transcriber(model_size, language)
    else:
        return _create_faster_whisper_transcriber(model_size, language, device)


def _create_mlx_transcriber(
    model_size: str,
    language: Optional[str],
) -> BaseTranscriber:
    """Create MLX transcriber (Apple Silicon only)."""
    try:
        from src.transcribers.mlx import MLXTranscriber
    except ImportError as e:
        raise RuntimeError(
            "MLX backend requires mlx-whisper package. "
            "Install with: pip install mlx-whisper"
        ) from e

    return MLXTranscriber(
        model_size=model_size,
        language=language,
    )


def _create_faster_whisper_transcriber(
    model_size: str,
    language: Optional[str],
    device: Optional[str],
) -> BaseTranscriber:
    """Create faster-whisper transcriber (CUDA/CPU)."""
    try:
        from src.transcribers.faster import FasterWhisperTranscriber
    except ImportError as e:
        raise RuntimeError(
            "Faster-whisper backend requires faster-whisper package. "
            "Install with: pip install faster-whisper"
        ) from e

    return FasterWhisperTranscriber(
        model_size=model_size,
        language=language,
        device=device or "auto",
    )


def get_available_models(backend: Optional[str] = None) -> dict[str, str]:
    """
    Get available models for the specified or auto-detected backend.

    Args:
        backend: Backend name or None for auto-detect

    Returns:
        Dictionary mapping model size to description
    """
    if backend:
        if backend.lower() == "mlx":
            from src.transcribers.mlx import MLXTranscriber

            return MLXTranscriber.get_available_models()
        else:
            from src.transcribers.faster import FasterWhisperTranscriber

            return FasterWhisperTranscriber.get_available_models()

    # Auto-detect backend
    effective_backend = get_effective_backend()

    if effective_backend == TranscriberBackend.MLX:
        from src.transcribers.mlx import MLXTranscriber

        return MLXTranscriber.get_available_models()
    else:
        from src.transcribers.faster import FasterWhisperTranscriber

        return FasterWhisperTranscriber.get_available_models()


def get_model_sizes() -> list[str]:
    """Get list of standard model sizes (common across all backends)."""
    return [
        "tiny",
        "base",
        "small",
        "medium",
        "large-v2",
        "large-v3",
        "large-v3-turbo",
    ]
