"""Main FastAPI application for Kokoro TTS API."""

import sys

from contextlib import asynccontextmanager
from loguru import logger

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings
from src.services.kokoro_service import get_kokoro_service

# Load settings
settings = get_settings()

# Configure loguru
logger.remove()
logger.add(
    sys.stderr,
    format="{time:HH:mm:ss} | {level: <8} | {message}",
    level=settings.log_level,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Pre-load service on startup
    service = get_kokoro_service()
    await service.initialize()
    logger.success(
        f"Server started | Kokoro TTS API ready | device: {service.device}"
    )
    yield
    # Cleanup
    logger.info("Server shutting down...")


app = FastAPI(
    title="Kokoro TTS API",
    description="OpenAPI-compatible Text-to-Speech API using Kokoro TTS model",
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
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint with API information."""
    return {
        "name": "Kokoro TTS API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/v1/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        workers=1 if settings.reload else settings.workers,
    )
