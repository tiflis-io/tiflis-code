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
        env_prefix="TTS_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Server settings
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8101, description="Server port")
    reload: bool = Field(default=False, description="Enable hot reload (dev only)")
    workers: int = Field(default=1, description="Number of uvicorn workers")

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Logging level"
    )

    # CORS
    cors_origins: str = Field(
        default="*", description="Comma-separated list of allowed origins"
    )
    cors_allow_credentials: bool = Field(default=True, description="Allow credentials")

    # Model settings
    model_repo_id: str = Field(
        default="hexgrad/Kokoro-82M", description="Hugging Face model repository ID"
    )
    model_lang_code: str = Field(
        default="a", description="Language code (a=American English)"
    )
    default_voice: str = Field(
        default="af_heart", description="Default voice for TTS"
    )

    # Device settings
    device: Literal["auto", "cuda", "mps", "cpu"] = Field(
        default="auto", description="Compute device (auto, cuda, mps, cpu)"
    )

    # HuggingFace
    hf_token: str | None = Field(default=None, alias="HF_TOKEN", description="HuggingFace token")

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins into a list."""
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",")]

    def get_device(self) -> str:
        """Determine the compute device to use."""
        if self.device != "auto":
            return self.device

        import torch

        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        return "cpu"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
