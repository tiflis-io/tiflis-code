# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Utilities package for STT service."""

from src.utils.platform_detect import (
    Accelerator,
    Architecture,
    OperatingSystem,
    PlatformInfo,
    TranscriberBackend,
    detect_platform,
    get_effective_backend,
    is_apple_silicon,
)
from src.utils.stats import SessionStats, SystemMonitor, TranscriptionStats, create_transcription_stats

__all__ = [
    "Accelerator",
    "Architecture",
    "OperatingSystem",
    "PlatformInfo",
    "TranscriberBackend",
    "detect_platform",
    "get_effective_backend",
    "is_apple_silicon",
    "SessionStats",
    "SystemMonitor",
    "TranscriptionStats",
    "create_transcription_stats",
]
