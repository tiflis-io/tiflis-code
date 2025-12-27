"""Pydantic models for TTS API."""

from pydantic import BaseModel, Field, field_validator


class OpenAITTSRequest(BaseModel):
    """OpenAI-compatible TTS request model."""

    model: str = Field(default="tts-1", description="Model name (for compatibility)")
    input: str = Field(..., min_length=1, max_length=5000, description="Text to convert to speech")
    voice: str = Field(default="af_heart", description="Voice identifier")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Speech speed multiplier")
    response_format: str = Field(default="mp3", description="Audio format (mp3, opus, aac, flac, wav)")

    @field_validator("input")
    @classmethod
    def validate_input(cls, v: str) -> str:
        """Validate and clean input text."""
        return v.strip()


class TTSRequest(BaseModel):
    """Request model for text-to-speech conversion."""

    text: str = Field(..., min_length=1, max_length=5000, description="Text to convert to speech")
    voice: str = Field(default="default", description="Voice identifier")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Speech speed multiplier")

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        """Validate and clean input text."""
        return v.strip()


class TTSResponse(BaseModel):
    """Response model for TTS request."""

    success: bool = True
    format: str = "wav"
    duration_ms: int | None = None


class VoiceInfo(BaseModel):
    """Information about an available voice."""

    id: str
    name: str
    language: str = "en"
    gender: str = "unknown"


class VoicesResponse(BaseModel):
    """Response model for voices list."""

    voices: list[VoiceInfo]


class ErrorResponse(BaseModel):
    """Error response model."""

    error: str
    detail: str | None = None
