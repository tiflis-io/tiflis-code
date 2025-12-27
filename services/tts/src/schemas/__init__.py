# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Pydantic schemas package."""

from src.schemas.tts import (
    ErrorResponse,
    OpenAITTSRequest,
    TTSRequest,
    TTSResponse,
    VoiceInfo,
    VoicesResponse,
)

__all__ = [
    "ErrorResponse",
    "OpenAITTSRequest",
    "TTSRequest",
    "TTSResponse",
    "VoiceInfo",
    "VoicesResponse",
]
