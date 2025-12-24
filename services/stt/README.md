# Tiflis Code STT

OpenAI-compatible Speech-to-Text API with automatic platform detection.

## Features

- OpenAI-compatible API (`/v1/audio/transcriptions`)
- Automatic platform detection and optimal backend selection:
  - **Apple Silicon (M1/M2/M3+)**: MLX Whisper with Metal GPU
  - **NVIDIA GPU**: faster-whisper with CUDA
  - **CPU**: faster-whisper with int8 quantization
- Docker images for CPU and CUDA
- HuggingFace token support for model downloads
- Volume mounting for model caching

## Quick Start

### Local Development

```bash
# Install with MLX backend (Apple Silicon)
pip install -e ".[mlx,cli]"

# Install with CUDA backend (NVIDIA GPU)
pip install -e ".[cuda,cli]"

# Install with CPU backend
pip install -e ".[cpu,cli]"

# Run the API server
uvicorn src.main:app --reload --port 8100
```

### Docker

```bash
# Build CPU image
docker build --target cpu -t tiflis-code-stt:cpu .

# Build CUDA image
docker build --target cuda -t tiflis-code-stt:cuda .

# Run CPU image
docker run -p 8100:8100 -v ./models:/app/models tiflis-code-stt:cpu

# Run CUDA image (requires nvidia-container-toolkit)
docker run --gpus all -p 8100:8100 -v ./models:/app/models tiflis-code-stt:cuda
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STT_HOST` | Server host | `0.0.0.0` |
| `STT_PORT` | Server port | `8100` |
| `STT_MODEL` | Whisper model size | `large-v3` |
| `STT_BACKEND` | Backend: `auto`, `mlx`, `faster-whisper` | `auto` |
| `STT_LANGUAGE` | Language code (None for auto-detect) | `None` |
| `STT_LOG_LEVEL` | Logging level | `INFO` |
| `MODELS_DIR` | Models cache directory | `~/.cache/huggingface/hub` |
| `HF_TOKEN` | HuggingFace token | - |

### Available Models

| Model | Size | Description |
|-------|------|-------------|
| `large-v3` | ~3 GB | Best quality (recommended) |
| `large-v3-turbo` | ~1.5 GB | Fastest large model |
| `large-v2` | ~3 GB | Previous best |
| `medium` | ~1.5 GB | Balanced |
| `small` | ~500 MB | Fast |
| `base` | ~150 MB | Faster |
| `tiny` | ~75 MB | Fastest |

## API Usage

### Health Check

```bash
curl http://localhost:8100/health
```

### List Models

```bash
curl http://localhost:8100/v1/models
```

### Transcribe Audio

```bash
curl -X POST http://localhost:8100/v1/audio/transcriptions \
  -F "file=@audio.mp3" \
  -F "model=whisper-1"
```

### Python Client (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8100/v1",
    api_key="not-needed"
)

with open("audio.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="whisper-1",
        file=f,
        language="en"  # optional
    )

print(result.text)
```

### Supported Audio Formats

mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg

### Response Formats

- `json` (default): `{"text": "..."}`
- `text`: Plain text only
- `verbose_json`: With metadata (language, duration)
- `srt`: SRT subtitles
- `vtt`: WebVTT subtitles

## CLI Mode

Interactive real-time transcription from microphone:

```bash
# List available models
tiflis-stt-cli --list-models

# List audio devices
tiflis-stt-cli --list-devices

# Run with settings
tiflis-stt-cli --model large-v3 --language en
```

## Project Structure

```
services/stt/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Pydantic Settings
│   ├── api/
│   │   └── routes.py        # API endpoints
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   ├── services/
│   │   ├── vad.py           # Voice Activity Detection
│   │   ├── audio_capture.py # Microphone capture
│   │   └── model_manager.py # Model management
│   ├── transcribers/
│   │   ├── base.py          # Base transcriber
│   │   ├── mlx.py           # MLX backend
│   │   ├── faster.py        # faster-whisper backend
│   │   └── factory.py       # Transcriber factory
│   ├── utils/
│   │   ├── platform_detect.py
│   │   ├── stats.py
│   │   └── ui.py
│   └── cli/
│       └── main.py          # CLI entry point
├── tests/
├── Dockerfile
├── pyproject.toml
├── package.json
└── README.md
```

## License

FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
