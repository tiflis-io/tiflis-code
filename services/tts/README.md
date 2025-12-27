# Tiflis Code TTS

OpenAI-compatible Text-to-Speech API using [Kokoro](https://github.com/hexgrad/kokoro) TTS model.

## Features

- OpenAI-compatible `/v1/audio/speech` endpoint
- RESTful API with OpenAPI 3.0 specification
- Multiple voices supported (American English)
- Docker support with GPU acceleration (NVIDIA CUDA)
- Configuration via environment variables
- Auto-detection of compute device (CUDA/MPS/CPU)

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -e .

# Run the server
uvicorn src.main:app --reload --port 8101

# Or with environment variables
TTS_LOG_LEVEL=DEBUG TTS_DEVICE=cpu python -m src.main
```

### Run on Apple Silicon (MPS)

MPS is not available in Docker. For GPU acceleration on Apple Silicon, run natively:

```bash
TTS_DEVICE=mps uvicorn src.main:app --port 8101
```

### Docker

```bash
# Build CPU image
docker build --target cpu -t tiflis-code-tts:cpu .

# Build CUDA image
docker build --target cuda -t tiflis-code-tts:cuda .

# Run CPU image (detached, auto-restart, static name)
docker run -d \
  --name tiflis-tts \
  --restart unless-stopped \
  -p 8101:8101 \
  -v tts-models:/home/appuser/.cache/huggingface \
  -e HF_TOKEN=your_huggingface_token_here \
  tiflis-code-tts:cpu

# Run CUDA image (requires nvidia-container-toolkit)
docker run -d \
  --name tiflis-tts-gpu \
  --restart unless-stopped \
  --gpus all \
  -p 8101:8101 \
  -v tts-models:/home/appuser/.cache/huggingface \
  -e HF_TOKEN=your_huggingface_token_here \
  tiflis-code-tts:cuda
```

#### Container Management

```bash
# View logs
docker logs -f tiflis-tts

# Stop container
docker stop tiflis-tts

# Remove container
docker rm tiflis-tts

# Restart container
docker restart tiflis-tts
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_PORT` | `8101` | Server port |
| `TTS_LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `TTS_DEVICE` | `auto` | Compute device (auto, cuda, mps, cpu) |
| `TTS_DEFAULT_VOICE` | `af_heart` | Default voice |
| `TTS_MODEL_REPO_ID` | `hexgrad/Kokoro-82M` | HuggingFace model repository |
| `TTS_CORS_ORIGINS` | `*` | Allowed CORS origins |
| `HF_TOKEN` | - | HuggingFace API token (optional) |

## API Documentation

API documentation available at:
- Swagger UI: http://localhost:8101/docs
- ReDoc: http://localhost:8101/redoc

## API Endpoints

### POST /v1/audio/speech (OpenAI-compatible)

Create speech from text.

**Request:**
```json
{
  "model": "tts-1",
  "input": "Hello, world!",
  "voice": "af_heart",
  "speed": 1.0
}
```

**Response:** Audio/wav file

### POST /v1/tts

Convert text to speech (native endpoint).

**Request:**
```json
{
  "text": "Hello, world!",
  "voice": "af_heart",
  "speed": 1.0
}
```

**Response:** Audio/wav file

### GET /v1/voices

List available voices.

### GET /v1/health

Health check with device and configuration info.

**Response:**
```json
{
  "status": "ok",
  "service": "tiflis-code-tts",
  "device": "cuda",
  "config": {
    "model": "hexgrad/Kokoro-82M",
    "lang_code": "a",
    "default_voice": "af_heart"
  }
}
```

## Available Voices

| Voice ID | Name | Gender |
|----------|------|--------|
| `af_heart` | Heart | Female |
| `af_bella` | Bella | Female |
| `af_nicole` | Nicole | Female |
| `af_sarah` | Sarah | Female |
| `af_sky` | Sky | Female |
| `am_michael` | Michael | Male |
| `am_adam` | Adam | Male |
| `am_echo` | Echo | Male |

## Project Structure

```
services/tts/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Pydantic Settings
│   ├── api/
│   │   └── routes.py        # API endpoints
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   └── services/
│       └── kokoro_service.py # Kokoro TTS wrapper
├── tests/
├── Dockerfile
├── pyproject.toml
├── package.json
└── README.md
```

## License

FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
