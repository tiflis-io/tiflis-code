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

## Requirements

- **Python 3.11+** (required)
- **ffmpeg** (required for audio format conversion)

### System Dependencies

#### Ubuntu/Debian

```bash
# Install Python 3.11
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-dev

# Install ffmpeg (required for audio processing)
sudo apt install ffmpeg
```

#### macOS

```bash
# Install via Homebrew
brew install python@3.11 ffmpeg
```

#### Verify Installation

```bash
python3.11 --version  # Should be 3.11.x or higher
ffmpeg -version       # Should show ffmpeg version
ffprobe -version      # Should show ffprobe version
```

## Quick Start

### Local Development

```bash
# Create virtual environment with Python 3.11+
python3.11 -m venv venv
source venv/bin/activate

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

# Run CPU image (detached, auto-restart, static name)
docker run -d \
  --name tiflis-stt \
  --restart unless-stopped \
  -p 8100:8100 \
  -v stt-models:/app/models \
  -e HF_TOKEN=your_huggingface_token_here \
  tiflis-code-stt:cpu

# Run CUDA image (requires nvidia-container-toolkit)
docker run -d \
  --name tiflis-stt-gpu \
  --restart unless-stopped \
  --gpus all \
  -p 8100:8100 \
  -v stt-models:/app/models \
  -e HF_TOKEN=your_huggingface_token_here \
  tiflis-code-stt:cuda
```

#### Container Management

```bash
# View logs
docker logs -f tiflis-stt

# Stop container
docker stop tiflis-stt

# Remove container
docker rm tiflis-stt

# Restart container
docker restart tiflis-stt
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
# Basic transcription (auto-detect language)
curl -X POST http://localhost:8100/v1/audio/transcriptions \
  -F "file=@audio.mp3" \
  -F "model=whisper-1"

# With specific language
curl -X POST http://localhost:8100/v1/audio/transcriptions \
  -F "file=@audio.mp3" \
  -F "model=whisper-1" \
  -F "language=en"

# Explicit auto-detect language
curl -X POST http://localhost:8100/v1/audio/transcriptions \
  -F "file=@audio.mp3" \
  -F "model=whisper-1" \
  -F "language=auto"
```

### Language Detection

The STT service supports automatic language detection:

- **Omit `language` parameter** — auto-detect (default)
- **`language=auto`** — explicitly enable auto-detect
- **`language=en`** — force specific language (use ISO 639-1 codes)

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

## Troubleshooting

### Python Version Error

**Error:**
```
ERROR: Package 'tiflis-code-stt' requires a different Python: 3.10.12 not in '>=3.11'
```

**Solution:** Install Python 3.11 or higher:
```bash
# Ubuntu/Debian
sudo apt install python3.11 python3.11-venv python3.11-dev

# Create venv with correct Python
python3.11 -m venv venv
source venv/bin/activate
pip install -e ".[cuda,cli]"
```

### Missing ffmpeg/ffprobe

**Error:**
```
RuntimeWarning: Couldn't find ffmpeg or avconv - defaulting to ffmpeg, but may not work
RuntimeWarning: Couldn't find ffprobe or avprobe - defaulting to ffprobe, but may not work
```

**Symptom:** API returns `400 Bad Request` on `/v1/audio/transcriptions`

**Solution:** Install ffmpeg:
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
ffprobe -version
```

### cuDNN Library Not Found (CUDA)

**Error:**
```
Unable to load any of {libcudnn_ops.so.9.1.0, libcudnn_ops.so.9.1, libcudnn_ops.so.9, libcudnn_ops.so}
Invalid handle. Cannot load symbol cudnnCreateTensorDescriptor
```

**Solution 1:** Install cuDNN 9 via apt (Ubuntu):
```bash
# Add NVIDIA repo
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update

# Install cuDNN 9
sudo apt install libcudnn9-cuda-12 libcudnn9-dev-cuda-12
```

**Solution 2:** Install cuDNN via pip:
```bash
pip install nvidia-cudnn-cu12

# Set library path
export LD_LIBRARY_PATH=$(python -c "import nvidia.cudnn; print(nvidia.cudnn.__path__[0])")/lib:$LD_LIBRARY_PATH
```

**Solution 3:** Fall back to CPU mode:
```bash
export CUDA_VISIBLE_DEVICES=""
uvicorn src.main:app --reload --port 8100
```

**Verify cuDNN installation:**
```bash
ldconfig -p | grep cudnn
# Should show libcudnn*.so.9 entries
```

### Model Loading Issues

**Symptom:** Server hangs or crashes during model loading

**Solutions:**

1. **Use a smaller model:**
   ```bash
   export STT_MODEL=small
   uvicorn src.main:app --reload --port 8100
   ```

2. **Check available memory:**
   ```bash
   # GPU memory
   nvidia-smi
   
   # System memory
   free -h
   ```

3. **Set HuggingFace token for gated models:**
   ```bash
   export HF_TOKEN=your_token_here
   ```

### Connection Refused Errors

**Error:** `channel 4: open failed: connect failed: Connection refused`

This is typically an SSH port forwarding issue, not an STT service problem. Check your SSH tunnel configuration.

### Docker: GPU Not Available

**Symptom:** Container falls back to CPU mode

**Solution:** Ensure nvidia-container-toolkit is installed:
```bash
# Install nvidia-container-toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update
sudo apt install nvidia-container-toolkit
sudo systemctl restart docker

# Run with GPU
docker run --gpus all -p 8100:8100 tiflis-code-stt:cuda
```

## License

FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
