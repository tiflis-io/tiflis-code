# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Multi-stage Dockerfile for TTS API service
# Supports CUDA (NVIDIA GPU) and CPU-only deployments

# syntax=docker/dockerfile:1

# ==============================================================================
# Base stage with common dependencies
# ==============================================================================
FROM python:3.11-slim AS base

# Prevent Python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Builder stage - install Python dependencies
# ==============================================================================
FROM base AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy only dependency files first for better layer caching
COPY pyproject.toml ./
COPY README.md ./

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install PyTorch CPU version (smaller image size)
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install the application dependencies
RUN pip install .

# Download spacy model required by Kokoro
RUN python -m spacy download en_core_web_sm

# ==============================================================================
# Production stage (CPU)
# ==============================================================================
FROM base AS cpu

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser

# Copy application code
COPY --chown=appuser:appuser src/ /app/src/

# Create cache directory for HuggingFace models
RUN mkdir -p /home/appuser/.cache/huggingface && \
    chown -R appuser:appuser /home/appuser/.cache

USER appuser

# Environment variables with defaults
ENV TTS_HOST=0.0.0.0 \
    TTS_PORT=8101 \
    TTS_LOG_LEVEL=INFO \
    TTS_DEVICE=cpu \
    TTS_DEFAULT_VOICE=af_heart \
    HF_HOME=/home/appuser/.cache/huggingface

# Expose the port
EXPOSE 8101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:8101/v1/health || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8101"]

# ==============================================================================
# CUDA stage - for NVIDIA GPU support
# ==============================================================================
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04 AS cuda

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install PyTorch with CUDA support
RUN pip install torch --index-url https://download.pytorch.org/whl/cu121

# Copy pyproject.toml and install dependencies
COPY pyproject.toml ./
COPY README.md ./
RUN pip install .

# Download spacy model required by Kokoro
RUN python -m spacy download en_core_web_sm

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Copy application code
COPY --chown=appuser:appuser src/ /app/src/

# Cache directory
RUN mkdir -p /home/appuser/.cache/huggingface && \
    chown -R appuser:appuser /home/appuser/.cache

USER appuser

ENV TTS_HOST=0.0.0.0 \
    TTS_PORT=8101 \
    TTS_LOG_LEVEL=INFO \
    TTS_DEVICE=cuda \
    TTS_DEFAULT_VOICE=af_heart \
    HF_HOME=/home/appuser/.cache/huggingface

EXPOSE 8101

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -sf http://localhost:8101/v1/health || exit 1

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8101"]
