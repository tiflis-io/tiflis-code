# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="STT_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Server settings
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8100, description="Server port")
    reload: bool = Field(default=False, description="Enable hot reload")
    workers: int = Field(default=1, description="Number of workers")

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Logging level"
    )

    # CORS
    cors_origins: str = Field(default="*", description="Comma-separated CORS origins")

    # Model settings
    model: str = Field(default="large-v3", description="Whisper model size")
    backend: Literal["auto", "mlx", "faster-whisper"] = Field(
        default="auto", description="Transcription backend"
    )
    language: str | None = Field(default=None, description="Language code or None for auto")

    # Storage
    models_dir: str | None = Field(default=None, description="Models cache directory")

    # HuggingFace
    hf_token: str | None = Field(default=None, alias="HF_TOKEN", description="HuggingFace token")

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins into a list."""
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
