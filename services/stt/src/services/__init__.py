# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Services package for STT service."""

from src.services.vad import SpeechState, VoiceActivityDetector
from src.services.audio_capture import AudioCapture, list_devices, get_default_device
from src.services.model_manager import (
    download_model,
    get_models_dir,
    is_model_cached,
    list_cached_models,
)

__all__ = [
    "SpeechState",
    "VoiceActivityDetector",
    "AudioCapture",
    "list_devices",
    "get_default_device",
    "download_model",
    "get_models_dir",
    "is_model_cached",
    "list_cached_models",
]
