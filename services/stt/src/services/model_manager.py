# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Model management module for STT service."""

import os
import shutil
from pathlib import Path
from typing import Optional

from loguru import logger

from src.utils.platform_detect import TranscriberBackend, get_effective_backend


def get_models_dir() -> Path:
    """
    Get the models directory from environment or default.

    Priority:
    1. MODELS_DIR environment variable
    2. HF_HOME environment variable
    3. Default: ~/.cache/huggingface/hub
    """
    models_dir = os.environ.get("MODELS_DIR")
    if models_dir:
        return Path(models_dir)

    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        return Path(hf_home)

    return Path.home() / ".cache" / "huggingface" / "hub"


def get_hf_token() -> Optional[str]:
    """
    Get HuggingFace token from environment.

    Checks:
    1. HF_TOKEN environment variable
    2. HUGGING_FACE_HUB_TOKEN environment variable
    """
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")


def setup_hf_token():
    """Setup HuggingFace token in environment if available."""
    token = get_hf_token()
    if token:
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token


def get_mlx_model_path(model_size: str) -> Path:
    """Get path for MLX model cache."""
    from src.transcribers.mlx import MLX_MODEL_REPOS

    repo_id = MLX_MODEL_REPOS.get(model_size, model_size)
    cache_dir = get_models_dir()
    repo_folder = "models--" + repo_id.replace("/", "--")
    return cache_dir / repo_folder


def get_faster_whisper_model_path(model_size: str) -> Path:
    """Get path for faster-whisper model cache."""
    return get_models_dir() / "faster-whisper" / model_size


def is_model_cached(model_size: str, backend: Optional[TranscriberBackend] = None) -> bool:
    """
    Check if a model is already downloaded.

    Args:
        model_size: Model size to check
        backend: Backend to check for (None for auto-detect)

    Returns:
        True if model is cached
    """
    if backend is None:
        backend = get_effective_backend()

    if backend == TranscriberBackend.MLX:
        return _is_mlx_model_cached(model_size)
    else:
        return _is_faster_whisper_model_cached(model_size)


def _is_mlx_model_cached(model_size: str) -> bool:
    """Check if MLX model is cached."""
    from src.transcribers.mlx import MLX_MODEL_REPOS, is_model_cached as mlx_is_cached

    repo_id = MLX_MODEL_REPOS.get(model_size, model_size)
    return mlx_is_cached(repo_id)


def _is_faster_whisper_model_cached(model_size: str) -> bool:
    """Check if faster-whisper model is cached."""
    model_path = get_faster_whisper_model_path(model_size)

    if model_path.exists() and model_path.is_dir():
        # Check for model files
        required_files = ["model.bin", "config.json"]
        for f in required_files:
            if (model_path / f).exists():
                return True

    return False


def download_model(
    model_size: str,
    backend: Optional[TranscriberBackend] = None,
    force: bool = False,
) -> Path:
    """
    Download a model for the specified backend.

    Args:
        model_size: Model size to download
        backend: Backend to download for (None for auto-detect)
        force: Force re-download even if cached

    Returns:
        Path to downloaded model
    """
    if backend is None:
        backend = get_effective_backend()

    # Setup HF token
    setup_hf_token()

    if backend == TranscriberBackend.MLX:
        return _download_mlx_model(model_size, force)
    else:
        return _download_faster_whisper_model(model_size, force)


def _download_mlx_model(model_size: str, force: bool) -> Path:
    """Download MLX model."""
    from src.transcribers.mlx import MLX_MODEL_REPOS, download_model_with_progress

    repo_id = MLX_MODEL_REPOS.get(model_size, model_size)

    if force:
        # Remove cached model
        cache_path = get_mlx_model_path(model_size)
        if cache_path.exists():
            logger.warning(f"Removing cached model: {cache_path}")
            shutil.rmtree(cache_path)

    path = download_model_with_progress(repo_id)
    return Path(path)


def _download_faster_whisper_model(model_size: str, force: bool) -> Path:
    """Download faster-whisper model."""
    from faster_whisper import WhisperModel

    from src.transcribers.faster import FASTER_WHISPER_MODEL_SIZES

    model_name = FASTER_WHISPER_MODEL_SIZES.get(model_size, model_size)
    download_root = get_models_dir() / "faster-whisper"
    download_root.mkdir(parents=True, exist_ok=True)

    model_path = download_root / model_name

    if force and model_path.exists():
        logger.warning(f"Removing cached model: {model_path}")
        shutil.rmtree(model_path)

    if not model_path.exists() or force:
        logger.info(f"Downloading model: {model_name}")

        # Download by initializing the model
        # This is how faster-whisper downloads models
        _ = WhisperModel(
            model_name,
            device="cpu",  # Just for download
            compute_type="int8",
            download_root=str(download_root),
        )

        logger.success(f"Model downloaded: {model_name}")
    else:
        logger.info(f"Model cached: {model_name}")

    return model_path


def list_cached_models(backend: Optional[TranscriberBackend] = None) -> dict[str, list[str]]:
    """
    List all cached models.

    Args:
        backend: Backend to list for (None for all)

    Returns:
        Dictionary mapping backend name to list of cached model sizes
    """
    result = {}

    if backend is None or backend == TranscriberBackend.MLX:
        result["mlx"] = _list_cached_mlx_models()

    if backend is None or backend == TranscriberBackend.FASTER_WHISPER:
        result["faster-whisper"] = _list_cached_faster_whisper_models()

    return result


def _list_cached_mlx_models() -> list[str]:
    """List cached MLX models."""
    from src.transcribers.mlx import MLX_MODEL_REPOS

    cached = []
    for model_size, repo_id in MLX_MODEL_REPOS.items():
        try:
            from src.transcribers.mlx import is_model_cached

            if is_model_cached(repo_id):
                cached.append(model_size)
        except Exception:
            pass

    return cached


def _list_cached_faster_whisper_models() -> list[str]:
    """List cached faster-whisper models."""
    from src.transcribers.faster import FASTER_WHISPER_MODEL_SIZES

    cached = []
    models_dir = get_models_dir() / "faster-whisper"

    if not models_dir.exists():
        return cached

    for model_size in FASTER_WHISPER_MODEL_SIZES.keys():
        model_path = models_dir / model_size
        if model_path.exists() and model_path.is_dir():
            cached.append(model_size)

    return cached


def get_model_size_bytes(model_size: str, backend: Optional[TranscriberBackend] = None) -> int:
    """
    Get the size of a cached model in bytes.

    Args:
        model_size: Model size to check
        backend: Backend (None for auto-detect)

    Returns:
        Size in bytes, or 0 if not cached
    """
    if backend is None:
        backend = get_effective_backend()

    if backend == TranscriberBackend.MLX:
        model_path = get_mlx_model_path(model_size)
    else:
        model_path = get_faster_whisper_model_path(model_size)

    if not model_path.exists():
        return 0

    total_size = 0
    for f in model_path.rglob("*"):
        if f.is_file():
            total_size += f.stat().st_size

    return total_size


def print_model_info():
    """Print information about cached models."""
    cached = list_cached_models()

    print("\nCached Models:")

    for backend, models in cached.items():
        print(f"\n{backend}:")
        if models:
            for model in models:
                size = get_model_size_bytes(
                    model,
                    TranscriberBackend.MLX if backend == "mlx" else TranscriberBackend.FASTER_WHISPER,
                )
                size_mb = size / (1024 * 1024)
                print(f"  - {model} ({size_mb:.1f} MB)")
        else:
            print("  No models cached")


if __name__ == "__main__":
    print_model_info()
