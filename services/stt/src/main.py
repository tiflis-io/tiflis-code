# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
"""Main FastAPI application for STT API."""

import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from src.api.routes import router
from src.config import get_settings
from src.transcribers.factory import create_transcriber
from src.utils.platform_detect import detect_platform

# Load settings
settings = get_settings()

# Configure loguru
logger.remove()
logger.add(
    sys.stderr,
    format="{time:HH:mm:ss} | {level: <8} | {message}",
    level=settings.log_level,
)

# Global transcriber instance
transcriber = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global transcriber
    platform_info = detect_platform()
    logger.info(f"Platform: {platform_info.os.value}/{platform_info.architecture.value}")
    logger.info(f"Accelerator: {platform_info.accelerator.value}")
    logger.info(f"Loading Whisper model: {settings.model}")

    backend = settings.backend if settings.backend != "auto" else None
    transcriber = create_transcriber(
        model_size=settings.model,
        language=settings.language,
        backend=backend,
    )
    logger.success(f"Model loaded: {settings.model} (backend: {transcriber.get_backend_name()})")
    yield
    transcriber = None
    logger.info("Server shutting down...")


app = FastAPI(
    title="Tiflis Code STT API",
    description="OpenAI-compatible Speech-to-Text API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "status": "ok",
        "service": "tiflis-code-stt",
        "model": settings.model,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "tiflis-code-stt",
        "model": settings.model,
        "backend": transcriber.get_backend_name() if transcriber else "not loaded",
    }


def get_transcriber():
    """Get the global transcriber instance."""
    return transcriber


def main():
    """Run the server."""
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        workers=1 if settings.reload else settings.workers,
    )


if __name__ == "__main__":
    main()
