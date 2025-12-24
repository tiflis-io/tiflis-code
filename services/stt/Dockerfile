# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Multi-stage Dockerfile for STT API service
# Supports CUDA (NVIDIA GPU) and CPU-only deployments
#
# Note: MLX (Apple Silicon) is NOT supported in Docker because Metal GPU
# is not accessible from containers. For Apple Silicon, use native installation.

# =============================================================================
# Base stage - common dependencies
# =============================================================================
FROM python:3.11-slim AS base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN useradd --create-home --shell /bin/bash app

# =============================================================================
# CPU stage - faster-whisper with CPU optimization
# =============================================================================
FROM base AS cpu

# Copy project files
COPY pyproject.toml ./
COPY src/ ./src/

# Install dependencies with CPU extras
RUN pip install --no-cache-dir -e ".[cpu]"

# Create models directory
RUN mkdir -p /app/models && chown -R app:app /app

# Switch to non-root user
USER app

# Set default environment variables
ENV MODELS_DIR=/app/models \
    STT_HOST=0.0.0.0 \
    STT_PORT=8100 \
    STT_BACKEND=faster-whisper \
    STT_MODEL=large-v3 \
    STT_LOG_LEVEL=INFO

# Expose API port
EXPOSE 8100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:8100/health || exit 1

# Default command
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]

# =============================================================================
# CUDA stage - faster-whisper with NVIDIA GPU support
# =============================================================================
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 AS cuda

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

# Install Python and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/bin/python

# Create app directory
WORKDIR /app

# Create non-root user
RUN useradd --create-home --shell /bin/bash app

# Copy project files
COPY pyproject.toml ./
COPY src/ ./src/

# Install dependencies with CUDA extras
RUN pip install --no-cache-dir -e ".[cuda]"

# Create models directory
RUN mkdir -p /app/models && chown -R app:app /app

# Switch to non-root user
USER app

# Set default environment variables
ENV MODELS_DIR=/app/models \
    STT_HOST=0.0.0.0 \
    STT_PORT=8100 \
    STT_BACKEND=faster-whisper \
    STT_MODEL=large-v3 \
    STT_LOG_LEVEL=INFO

# Expose API port
EXPOSE 8100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:8100/health || exit 1

# Default command
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]
