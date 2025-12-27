# Tiflis Code Speech Services Installer

This directory contains scripts for native deployment of Tiflis Code Speech Services (STT and TTS) on Ubuntu systems with NVIDIA GPU support.

## Scripts

### `install-speech-services.sh`
Interactive installer that handles the complete deployment process:
- Checks and installs dependencies (Python 3.11, ffmpeg, espeak-ng, NVIDIA drivers, CUDA, cuDNN)
- Clones repository and copies service source code
- Creates shared Python virtual environment
- Configures systemd services
- Supports customizable ports and model selection

### `uninstall-speech-services.sh`
Clean removal of speech services while preserving shared system dependencies.

### `update-speech-services.sh`
In-place updates while preserving configuration and downloaded models.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/install-speech-services.sh | bash
```

## Requirements

- Ubuntu 20.04+ with NVIDIA GPU (recommended RTX 2060+ with 6GB+ VRAM)
- Internet connection for downloading dependencies and models

## Configuration

After installation, services run on:
- STT: http://localhost:8100
- TTS: http://localhost:8101

Configuration file: `/opt/tiflis-code/speech/.env`

## Services Status

```bash
sudo systemctl status tiflis-stt tiflis-tts
```

## Logs

```bash
sudo journalctl -u tiflis-stt -f
sudo journalctl -u tiflis-tts -f
```

## Notes

- Services run as root for system-wide access
- Models are downloaded on first use (lazy loading)
- Total VRAM usage: ~5GB (fits RTX 2060 6GB)
- No Docker overhead (~10-15GB savings)