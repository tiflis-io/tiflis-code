#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Workstation Server Installer
#
# Usage:
#   curl -fsSL https://code.tiflis.io/install-workstation.sh | bash
#   TUNNEL_URL=wss://tunnel.example.com TUNNEL_API_KEY=your-key \
#     curl -fsSL https://code.tiflis.io/install-workstation.sh | bash
#   curl -fsSL https://code.tiflis.io/install-workstation.sh | bash -s -- --dry-run
#
# Environment variables:
#   TIFLIS_WORKSTATION_VERSION - Version to install (default: latest)
#   TIFLIS_INSTALL_DIR         - Installation directory (default: ~/.tiflis-code)
#   TUNNEL_URL                 - Tunnel server WebSocket URL (required)
#   TUNNEL_API_KEY             - Tunnel API key (required)
#   WORKSTATION_AUTH_KEY       - Auth key for mobile clients (auto-generated if not set)
#   WORKSPACES_ROOT            - Workspaces directory (default: ~/work)

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
TIFLIS_WORKSTATION_VERSION="${TIFLIS_WORKSTATION_VERSION:-latest}"
TIFLIS_INSTALL_DIR="${TIFLIS_INSTALL_DIR:-$HOME/.tiflis-code}"
WORKSPACES_ROOT="${WORKSPACES_ROOT:-$HOME/work}"

WORKSTATION_DIR="${TIFLIS_INSTALL_DIR}/workstation"
PACKAGE_NAME="@tiflis-io/tiflis-code-workstation"

# ─────────────────────────────────────────────────────────────
# TTY Detection (for curl | bash usage)
# ─────────────────────────────────────────────────────────────
# When running via curl | bash, stdin is the script itself
# We need to read user input from /dev/tty instead
if [ -t 0 ]; then
    TTY_INPUT="/dev/stdin"
else
    TTY_INPUT="/dev/tty"
fi

# ─────────────────────────────────────────────────────────────
# Inline library (for curl | bash usage)
# ─────────────────────────────────────────────────────────────
readonly COLOR_RESET="\033[0m"
readonly COLOR_RED="\033[0;31m"
readonly COLOR_GREEN="\033[0;32m"
readonly COLOR_YELLOW="\033[0;33m"
readonly COLOR_CYAN="\033[0;36m"
readonly COLOR_DIM="\033[2m"
readonly COLOR_WHITE="\033[97m"

print_step() { echo -e "${COLOR_CYAN}→${COLOR_RESET} $1" >&2; }
print_success() { echo -e "${COLOR_GREEN}✓${COLOR_RESET} $1" >&2; }
print_error() { echo -e "${COLOR_RED}✗${COLOR_RESET} $1" >&2; }
print_warning() { echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} $1" >&2; }
print_info() { echo -e "${COLOR_DIM}$1${COLOR_RESET}" >&2; }

prompt_value() {
    local prompt="$1" default="${2:-}" value
    if [ -n "$default" ]; then
        echo -en "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [${default}]: " >&2
        read -r value < "$TTY_INPUT"
        echo "${value:-$default}"
    else
        echo -en "${COLOR_CYAN}?${COLOR_RESET} ${prompt}: " >&2
        read -r value < "$TTY_INPUT"
        echo "$value"
    fi
}

prompt_secret() {
    local prompt="$1" value
    echo -en "${COLOR_CYAN}?${COLOR_RESET} ${prompt}: " >&2
    read -rs value < "$TTY_INPUT"
    echo "" >&2
    echo "$value"
}

confirm() {
    local prompt="$1" default="${2:-n}" yn
    if [ "$default" = "y" ]; then
        echo -en "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [Y/n]: " >&2
        read -r yn < "$TTY_INPUT"
        case "$yn" in [Nn]*) return 1 ;; *) return 0 ;; esac
    else
        echo -en "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [y/N]: " >&2
        read -r yn < "$TTY_INPUT"
        case "$yn" in [Yy]*) return 0 ;; *) return 1 ;; esac
    fi
}

generate_key() {
    local length="${1:-32}"
    if command -v openssl &>/dev/null; then
        openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c "$length"
    else
        LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$length"
    fi
}

detect_os() {
    local os="$(uname -s)"
    case "$os" in
        Linux*) grep -qi microsoft /proc/version 2>/dev/null && echo "wsl" || echo "linux" ;;
        Darwin*) echo "darwin" ;;
        *) echo "unknown" ;;
    esac
}

detect_arch() {
    local arch="$(uname -m)"
    case "$arch" in
        x86_64|amd64) echo "x86_64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "$arch" ;;
    esac
}

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "${ID:-unknown}"
    else
        echo "unknown"
    fi
}

check_node() {
    local required="${1:-24}"
    command -v node &>/dev/null || return 1
    local ver="$(node --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"
    [ -n "$ver" ] && [ "$ver" -ge "$required" ]
}

check_build_tools() {
    local os="$(detect_os)"
    case "$os" in
        darwin) xcode-select -p &>/dev/null 2>&1 ;;
        linux|wsl) command -v gcc &>/dev/null && command -v make &>/dev/null ;;
        *) return 1 ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────
print_banner() {
    local blue="\033[38;5;69m"
    local purple="\033[38;5;135m"
    local white="\033[97m"
    local dim="\033[2m"
    local reset="\033[0m"

    echo ""
    echo -e "                        ${white}-#####${reset}"
    echo -e "                        ${white}#     #${reset}"
    echo -e "${blue}       -####.${reset}           ${white}#     #${reset}              ${purple}-###+.${reset}"
    echo -e "${blue}     .##    .${reset}        ${white}.. #     #....${reset}          ${purple}-   ##-${reset}"
    echo -e "${blue}    -##    #.${reset}       ${white}#####     #####+${reset}         ${purple}--    #+.${reset}"
    echo -e "${blue}   +#    ##-.${reset}       ${white}#              #${reset}         ${purple}.##    ##.${reset}"
    echo -e "${blue}   #    ##.${reset}         ${white}#              #${reset}          ${purple}.+##   +.${reset}"
    echo -e "${blue}   #   ##${reset}           ${white}#####     #####+${reset}            ${purple}.#   #-${reset}"
    echo -e "${blue}   #   +-${reset}               ${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   +-${reset}               ${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   +-${reset}       ${blue}---.${reset}    ${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   +-${reset}       ${blue}+ ###.${reset}  ${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   +-${reset}       ${blue}+    ##-${reset}${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   +-${reset}       ${blue}-##    #${reset}${white}#     #${reset}                  ${purple}#   #-${reset}"
    echo -e "${blue}   #   ##.${reset}      ${blue}.###    ${reset}${white}#     #.${reset}               ${purple}.+#   #.${reset}"
    echo -e "${blue}   #    ##+${reset}     ${blue}+    ###${reset}${white}#     #####+${reset}          ${purple}.##    #.${reset}"
    echo -e "${blue}   -##    ##.${reset}   ${blue}+  ##+. ${reset}${white}#          #${reset}         ${purple}-#     #+.${reset}"
    echo -e "${blue}    .##     .${reset}   ${blue}-##+.${reset}   ${white}+##        #${reset}         ${purple}-    ##-${reset}"
    echo -e "${blue}     .-##  #.${reset}            ${white}-#########+${reset}         ${purple}-+ -#+.${reset}"
    echo ""
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Workstation Installer"
    echo ""
    echo -e "  ${dim}© 2025 Roman Barinov · FSL-1.1-NC · github.com/tiflis-io/tiflis-code${reset}"
    echo ""
}

# ─────────────────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────────────────
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Show what would be done without making changes"
            echo "  --help       Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  TUNNEL_URL                 Tunnel server WebSocket URL (required)"
            echo "  TUNNEL_API_KEY             Tunnel API key (required)"
            echo "  WORKSTATION_AUTH_KEY       Auth key for mobile clients"
            echo "  WORKSPACES_ROOT            Workspaces directory (default: ~/work)"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────
# Install Node.js helpers
# ─────────────────────────────────────────────────────────────
install_node() {
    local os distro
    os="$(detect_os)"
    distro="$(detect_distro)"

    print_step "Installing Node.js..."

    case "$os" in
        darwin)
            if command -v brew &>/dev/null; then
                brew install node@24
                brew link node@24 --force --overwrite 2>/dev/null || true
            else
                # Install via nvm
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
                export NVM_DIR="$HOME/.nvm"
                [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
                nvm install 24
                nvm use 24
            fi
            ;;
        linux|wsl)
            case "$distro" in
                ubuntu|debian)
                    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
                    sudo apt-get install -y nodejs
                    ;;
                fedora|rhel|centos)
                    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
                    sudo dnf install -y nodejs
                    ;;
                *)
                    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
                    export NVM_DIR="$HOME/.nvm"
                    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
                    nvm install 24
                    nvm use 24
                    ;;
            esac
            ;;
    esac

    print_success "Node.js installed"
}

install_build_tools() {
    local os distro
    os="$(detect_os)"
    distro="$(detect_distro)"

    print_step "Installing build tools..."

    case "$os" in
        darwin)
            xcode-select --install 2>/dev/null || true
            print_info "Please complete Xcode CLI tools installation if prompted"
            ;;
        linux|wsl)
            case "$distro" in
                ubuntu|debian)
                    sudo apt-get update
                    sudo apt-get install -y build-essential python3
                    ;;
                fedora|rhel|centos)
                    sudo dnf groupinstall -y "Development Tools"
                    sudo dnf install -y python3
                    ;;
                arch)
                    sudo pacman -S --noconfirm base-devel python
                    ;;
                *)
                    print_warning "Please install build tools manually (gcc, make, python3)"
                    ;;
            esac
            ;;
    esac

    print_success "Build tools installed"
}

# ─────────────────────────────────────────────────────────────
# GPU Detection
# ─────────────────────────────────────────────────────────────
detect_gpu() {
    local os="$(detect_os)"
    
    # Check for Apple Silicon
    if [ "$os" = "darwin" ]; then
        local chip="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "")"
        if echo "$chip" | grep -qi "apple"; then
            echo "apple-silicon"
            return
        fi
    fi
    
    # Check for NVIDIA GPU
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | grep -qi "nvidia\|geforce\|rtx\|gtx\|quadro\|tesla"; then
            echo "nvidia"
            return
        fi
    fi
    
    # Check for AMD GPU (ROCm)
    if command -v rocm-smi &>/dev/null; then
        echo "amd"
        return
    fi
    
    echo "cpu"
}

get_gpu_name() {
    local gpu_type="$1"
    case "$gpu_type" in
        apple-silicon)
            sysctl -n machdep.cpu.brand_string 2>/dev/null | grep -o "Apple M[0-9].*" || echo "Apple Silicon"
            ;;
        nvidia)
            nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU"
            ;;
        amd)
            rocm-smi --showproductname 2>/dev/null | head -1 || echo "AMD GPU"
            ;;
        *)
            echo "CPU only"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Local STT Configuration
# ─────────────────────────────────────────────────────────────
configure_local_stt() {
    local gpu_type="$1"
    
    echo "" >&2
    print_info "Local STT Configuration"
    echo "" >&2
    
    # Model selection
    echo "  Available Whisper models:" >&2
    echo "    1) large-v3 (best quality, ~3GB, recommended)" >&2
    echo "    2) large-v3-turbo (faster, slightly lower quality)" >&2
    echo "    3) medium (balanced, ~1.5GB)" >&2
    echo "    4) small (fast, ~500MB)" >&2
    echo "    5) base (fastest, ~150MB)" >&2
    echo "" >&2
    
    local model_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select STT model [1-5, default: 1]: " >&2
    read -r model_choice < "$TTY_INPUT"
    
    case "$model_choice" in
        2) STT_MODEL="large-v3-turbo" ;;
        3) STT_MODEL="medium" ;;
        4) STT_MODEL="small" ;;
        5) STT_MODEL="base" ;;
        *) STT_MODEL="large-v3" ;;
    esac
    
    STT_PROVIDER="local"
    STT_BASE_URL="http://localhost:8100"
    STT_API_KEY=""  # Not needed for local
    LOCAL_STT_GPU="$gpu_type"
    LOCAL_STT_MODEL="$STT_MODEL"
    
    print_success "Local STT configured: ${STT_MODEL} on ${gpu_type}"
}

# ─────────────────────────────────────────────────────────────
# Local TTS Configuration
# ─────────────────────────────────────────────────────────────
configure_local_tts() {
    local gpu_type="$1"
    
    echo "" >&2
    print_info "Local TTS Configuration (Kokoro)"
    echo "" >&2
    
    # Voice selection
    echo "  Available voices:" >&2
    echo "    American English:" >&2
    echo "      1) af_heart (female, warm)" >&2
    echo "      2) af_bella (female, expressive)" >&2
    echo "      3) af_nicole (female, professional)" >&2
    echo "      4) af_sky (female, bright)" >&2
    echo "      5) am_adam (male, neutral)" >&2
    echo "      6) am_michael (male, deep)" >&2
    echo "    British English:" >&2
    echo "      7) bf_emma (female, British)" >&2
    echo "      8) bm_george (male, British)" >&2
    echo "" >&2
    
    local voice_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select TTS voice [1-8, default: 1]: " >&2
    read -r voice_choice < "$TTY_INPUT"
    
    case "$voice_choice" in
        2) TTS_VOICE="af_bella" ;;
        3) TTS_VOICE="af_nicole" ;;
        4) TTS_VOICE="af_sky" ;;
        5) TTS_VOICE="am_adam" ;;
        6) TTS_VOICE="am_michael" ;;
        7) TTS_VOICE="bf_emma" ;;
        8) TTS_VOICE="bm_george" ;;
        *) TTS_VOICE="af_heart" ;;
    esac
    
    TTS_PROVIDER="local"
    TTS_BASE_URL="http://localhost:8101"
    TTS_API_KEY=""  # Not needed for local
    TTS_MODEL="kokoro"
    LOCAL_TTS_GPU="$gpu_type"
    LOCAL_TTS_VOICE="$TTS_VOICE"
    
    print_success "Local TTS configured: ${TTS_VOICE} on ${gpu_type}"
}

# ─────────────────────────────────────────────────────────────
# Configure HuggingFace Token for Local Speech Services
# ─────────────────────────────────────────────────────────────
configure_hf_token() {
    echo "" >&2
    print_info "HuggingFace Token (Optional)"
    echo "" >&2
    echo "  Some models require a HuggingFace token to download." >&2
    echo "  Get your token at: https://huggingface.co/settings/tokens" >&2
    echo "" >&2
    
    # Prompt for token directly (empty to skip)
    HF_TOKEN="$(prompt_value "HuggingFace token (leave empty to skip)")"
    if [ -n "$HF_TOKEN" ]; then
        # Validate token format
        if [[ "$HF_TOKEN" == hf_* ]]; then
            print_success "HuggingFace token configured"
        else
            print_warning "Token should start with 'hf_' - using anyway"
        fi
    else
        print_info "Skipped (can be added later to .env as HF_TOKEN=...)"
    fi
}

# ─────────────────────────────────────────────────────────────
# Generate Docker Compose for Local Services
# ─────────────────────────────────────────────────────────────
generate_speech_docker_compose() {
    local stt_gpu="$1"
    local tts_gpu="$2"
    local stt_model="$3"
    local tts_voice="$4"
    local compose_file="${WORKSTATION_DIR}/docker-compose.speech.yml"
    
    print_step "Generating Docker Compose for speech services..."
    
    # Determine image tags
    local stt_tag="cpu"
    local tts_tag="cpu"
    local stt_runtime=""
    local tts_runtime=""
    
    if [ "$stt_gpu" = "nvidia" ]; then
        stt_tag="cuda"
        stt_runtime="runtime: nvidia"
    fi
    
    if [ "$tts_gpu" = "nvidia" ]; then
        tts_tag="cuda"
        tts_runtime="runtime: nvidia"
    fi
    
    cat > "$compose_file" << EOF
# Tiflis Code Speech Services
# Generated by install script on $(date -Iseconds)
# 
# Usage:
#   docker compose -f docker-compose.speech.yml up -d
#   docker compose -f docker-compose.speech.yml logs -f

services:
EOF

    # Add STT service if configured
    if [ -n "$stt_model" ]; then
        cat >> "$compose_file" << EOF
  stt:
    image: ghcr.io/tiflis-io/tiflis-code-stt:${stt_tag}
    container_name: tiflis-stt
    ports:
      - "8100:8100"
    environment:
      - STT_MODEL=${stt_model}
      - STT_HOST=0.0.0.0
      - STT_PORT=8100
EOF
        # Add HF_TOKEN if set
        if [ -n "$HF_TOKEN" ]; then
            echo "      - HF_TOKEN=${HF_TOKEN}" >> "$compose_file"
        fi
        cat >> "$compose_file" << EOF
    volumes:
      - stt-models:/app/models
      - stt-cache:/root/.cache
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
EOF
        if [ -n "$stt_runtime" ]; then
            echo "    $stt_runtime" >> "$compose_file"
        fi
        echo "" >> "$compose_file"
    fi
    
    # Add TTS service if configured
    if [ -n "$tts_voice" ]; then
        cat >> "$compose_file" << EOF
  tts:
    image: ghcr.io/tiflis-io/tiflis-code-tts:${tts_tag}
    container_name: tiflis-tts
    ports:
      - "8101:8101"
    environment:
      - TTS_DEFAULT_VOICE=${tts_voice}
      - TTS_HOST=0.0.0.0
      - TTS_PORT=8101
EOF
        # Add HF_TOKEN if set
        if [ -n "$HF_TOKEN" ]; then
            echo "      - HF_TOKEN=${HF_TOKEN}" >> "$compose_file"
        fi
        cat >> "$compose_file" << EOF
    volumes:
      - tts-models:/app/models
      - tts-cache:/root/.cache
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8101/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
EOF
        if [ -n "$tts_runtime" ]; then
            echo "    $tts_runtime" >> "$compose_file"
        fi
        echo "" >> "$compose_file"
    fi
    
    # Add volumes section
    cat >> "$compose_file" << EOF

volumes:
EOF
    if [ -n "$stt_model" ]; then
        echo "  stt-models:" >> "$compose_file"
        echo "  stt-cache:" >> "$compose_file"
    fi
    if [ -n "$tts_voice" ]; then
        echo "  tts-models:" >> "$compose_file"
        echo "  tts-cache:" >> "$compose_file"
    fi
    
    print_success "Docker Compose file created: $compose_file"
}

# ─────────────────────────────────────────────────────────────
# Setup Native Services for Apple Silicon (MLX)
# ─────────────────────────────────────────────────────────────
setup_native_stt() {
    local model="$1"
    print_step "Setting up native STT service for Apple Silicon..."
    
    local stt_dir="${TIFLIS_INSTALL_DIR}/stt"
    
    # Stop existing service first
    if launchctl list 2>/dev/null | grep -q io.tiflis.stt; then
        print_info "Stopping existing STT service..."
        launchctl bootout "gui/$(id -u)/io.tiflis.stt" 2>/dev/null || true
        sleep 1
    fi
    
    # Clean and recreate directory for fresh install
    if [ -d "$stt_dir" ]; then
        print_info "Removing existing STT installation..."
        rm -rf "$stt_dir"
    fi
    mkdir -p "$stt_dir"
    
    # Create virtual environment and install
    print_info "Installing STT dependencies (this may take a few minutes)..."
    if [ "$DRY_RUN" = "false" ]; then
        cd "$stt_dir"
        
        # Check if uv is installed
        if ! command -v uv &>/dev/null; then
            print_step "Installing uv package manager..."
            curl -LsSf https://astral.sh/uv/install.sh | sh
            export PATH="$HOME/.local/bin:$PATH"
        fi
        
        # Create project structure
        cat > "$stt_dir/pyproject.toml" << 'EOF'
[project]
name = "tiflis-stt-local"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.32.0",
    "mlx-whisper>=0.4.0",
    "python-multipart>=0.0.9",
]
EOF
        
        # Create minimal server script
        cat > "$stt_dir/server.py" << 'PYEOF'
#!/usr/bin/env python3
"""Minimal STT server for Apple Silicon using MLX Whisper."""
import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Tiflis STT", version="0.1.0")

# Lazy load model
_model = None
_model_name = os.environ.get("STT_MODEL", "large-v3")

def get_model():
    global _model
    if _model is None:
        import mlx_whisper
        _model = mlx_whisper
    return _model

@app.get("/health")
async def health():
    return {"status": "ok", "model": _model_name}

@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    whisper = get_model()
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        result = whisper.transcribe(tmp_path, path_or_hf_repo=f"mlx-community/whisper-{_model_name}-mlx")
        return JSONResponse({"text": result.get("text", "")})
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    port = int(os.environ.get("STT_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
PYEOF
        
        # Sync dependencies
        uv sync 2>/dev/null || uv pip install -e .
        
        print_success "STT dependencies installed"
    fi
    
    # Create launchd plist
    local plist_path="$HOME/Library/LaunchAgents/io.tiflis.stt.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    
    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.tiflis.stt</string>
    <key>ProgramArguments</key>
    <array>
        <string>${HOME}/.local/bin/uv</string>
        <string>run</string>
        <string>python</string>
        <string>server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${stt_dir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>STT_MODEL</key>
        <string>${model}</string>
        <key>STT_PORT</key>
        <string>8100</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.local/bin</string>
EOF
    # Add HF_TOKEN if set
    if [ -n "$HF_TOKEN" ]; then
        cat >> "$plist_path" << EOF
        <key>HF_TOKEN</key>
        <string>${HF_TOKEN}</string>
EOF
    fi
    cat >> "$plist_path" << EOF
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${TIFLIS_INSTALL_DIR}/logs/stt-output.log</string>
    <key>StandardErrorPath</key>
    <string>${TIFLIS_INSTALL_DIR}/logs/stt-error.log</string>
</dict>
</plist>
EOF
    
    # Load service
    if [ "$DRY_RUN" = "false" ]; then
        # Ensure service is fully stopped
        launchctl bootout "gui/$(id -u)/io.tiflis.stt" 2>/dev/null || true
        sleep 1
        
        # Bootstrap the service
        if launchctl bootstrap "gui/$(id -u)" "$plist_path" 2>&1; then
            print_success "STT service started (MLX Whisper ${model})"
        else
            # If bootstrap fails, try load as fallback
            print_warning "Bootstrap failed, trying alternative method..."
            launchctl load -w "$plist_path" 2>/dev/null || true
            sleep 1
            if launchctl list 2>/dev/null | grep -q io.tiflis.stt; then
                print_success "STT service started (MLX Whisper ${model})"
            else
                print_error "Failed to start STT service. Check logs: tail -f ${TIFLIS_INSTALL_DIR}/logs/stt-error.log"
            fi
        fi
    fi
}

setup_native_tts() {
    local voice="$1"
    print_step "Setting up native TTS service for Apple Silicon..."
    
    local tts_dir="${TIFLIS_INSTALL_DIR}/tts"
    
    # Stop existing service first
    if launchctl list 2>/dev/null | grep -q io.tiflis.tts; then
        print_info "Stopping existing TTS service..."
        launchctl bootout "gui/$(id -u)/io.tiflis.tts" 2>/dev/null || true
        sleep 1
    fi
    
    # Clean and recreate directory for fresh install
    if [ -d "$tts_dir" ]; then
        print_info "Removing existing TTS installation..."
        rm -rf "$tts_dir"
    fi
    mkdir -p "$tts_dir"
    
    # Create virtual environment and install
    print_info "Installing TTS dependencies (this may take a few minutes)..."
    if [ "$DRY_RUN" = "false" ]; then
        cd "$tts_dir"
        
        # Check if uv is installed
        if ! command -v uv &>/dev/null; then
            print_step "Installing uv package manager..."
            curl -LsSf https://astral.sh/uv/install.sh | sh
            export PATH="$HOME/.local/bin:$PATH"
        fi
        
        # Create project structure
        cat > "$tts_dir/pyproject.toml" << 'EOF'
[project]
name = "tiflis-tts-local"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.32.0",
    "kokoro>=0.3.0",
    "soundfile>=0.12.1",
]
EOF
        
        # Create minimal server script
        cat > "$tts_dir/server.py" << 'PYEOF'
#!/usr/bin/env python3
"""Minimal TTS server for Apple Silicon using Kokoro."""
import os
import io
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Tiflis TTS", version="0.1.0")

# Lazy load model
_pipeline = None
_default_voice = os.environ.get("TTS_DEFAULT_VOICE", "af_heart")

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from kokoro import KPipeline
        _pipeline = KPipeline(lang_code="a")
    return _pipeline

class TTSRequest(BaseModel):
    input: str
    voice: str = None
    model: str = "kokoro"
    response_format: str = "mp3"

@app.get("/health")
async def health():
    return {"status": "ok", "voice": _default_voice}

@app.post("/v1/audio/speech")
async def synthesize(request: TTSRequest):
    import soundfile as sf
    
    pipeline = get_pipeline()
    voice = request.voice or _default_voice
    
    # Generate audio
    generator = pipeline(request.input, voice=voice)
    audio_chunks = []
    for _, _, audio in generator:
        audio_chunks.append(audio)
    
    if not audio_chunks:
        return {"error": "No audio generated"}
    
    import numpy as np
    audio = np.concatenate(audio_chunks)
    
    # Convert to requested format
    buffer = io.BytesIO()
    sf.write(buffer, audio, 24000, format="WAV")
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=speech.wav"}
    )

if __name__ == "__main__":
    port = int(os.environ.get("TTS_PORT", "8101"))
    uvicorn.run(app, host="0.0.0.0", port=port)
PYEOF
        
        # Sync dependencies
        uv sync 2>/dev/null || uv pip install -e .
        
        print_success "TTS dependencies installed"
    fi
    
    # Create launchd plist
    local plist_path="$HOME/Library/LaunchAgents/io.tiflis.tts.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    
    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.tiflis.tts</string>
    <key>ProgramArguments</key>
    <array>
        <string>${HOME}/.local/bin/uv</string>
        <string>run</string>
        <string>python</string>
        <string>server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${tts_dir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TTS_DEFAULT_VOICE</key>
        <string>${voice}</string>
        <key>TTS_PORT</key>
        <string>8101</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.local/bin</string>
EOF
    # Add HF_TOKEN if set
    if [ -n "$HF_TOKEN" ]; then
        cat >> "$plist_path" << EOF
        <key>HF_TOKEN</key>
        <string>${HF_TOKEN}</string>
EOF
    fi
    cat >> "$plist_path" << EOF
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${TIFLIS_INSTALL_DIR}/logs/tts-output.log</string>
    <key>StandardErrorPath</key>
    <string>${TIFLIS_INSTALL_DIR}/logs/tts-error.log</string>
</dict>
</plist>
EOF
    
    # Load service
    if [ "$DRY_RUN" = "false" ]; then
        # Ensure service is fully stopped
        launchctl bootout "gui/$(id -u)/io.tiflis.tts" 2>/dev/null || true
        sleep 1
        
        # Bootstrap the service
        if launchctl bootstrap "gui/$(id -u)" "$plist_path" 2>&1; then
            print_success "TTS service started (Kokoro ${voice})"
        else
            # If bootstrap fails, try load as fallback
            print_warning "Bootstrap failed, trying alternative method..."
            launchctl load -w "$plist_path" 2>/dev/null || true
            sleep 1
            if launchctl list 2>/dev/null | grep -q io.tiflis.tts; then
                print_success "TTS service started (Kokoro ${voice})"
            else
                print_error "Failed to start TTS service. Check logs: tail -f ${TIFLIS_INSTALL_DIR}/logs/tts-error.log"
            fi
        fi
    fi
}

# ─────────────────────────────────────────────────────────────
# Wait for Service Health
# ─────────────────────────────────────────────────────────────
wait_for_service() {
    local url="$1"
    local name="$2"
    local max_attempts="${3:-30}"
    local attempt=1
    
    print_step "Waiting for ${name} to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            print_success "${name} is ready"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_warning "${name} did not become ready in time"
    return 1
}

# ─────────────────────────────────────────────────────────────
# AI Provider Configuration (Optional)
# ─────────────────────────────────────────────────────────────
configure_ai_providers() {
    echo ""
    print_info "AI Provider Configuration (Optional)"
    echo ""
    echo "  The Supervisor agent requires an LLM provider."
    echo "  Voice features require STT/TTS providers."
    echo ""

    if ! confirm "Configure AI providers now?" "y"; then
        print_info "Skipping AI configuration. You can configure later in .env"
        return
    fi
    
    # Detect GPU once for speech services
    local detected_gpu="$(detect_gpu)"
    local gpu_name="$(get_gpu_name "$detected_gpu")"

    # Supervisor Agent (LLM)
    echo ""
    print_info "Supervisor Agent (LLM)"
    echo ""
    echo "  1) OpenAI (gpt-4o, gpt-4o-mini)"
    echo "  2) Anthropic (claude-3-5-sonnet)"
    echo "  3) Cerebras (llama3.1-70b)"
    echo "  4) Skip"
    echo ""

    local agent_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select LLM provider [1-4, default: 1]: " >&2
    read -r agent_choice < "$TTY_INPUT"

    case "$agent_choice" in
        2)
            AGENT_PROVIDER="anthropic"
            AGENT_MODEL_NAME="claude-3-5-sonnet-20241022"
            AGENT_BASE_URL=""
            ;;
        3)
            AGENT_PROVIDER="cerebras"
            AGENT_BASE_URL="https://api.cerebras.ai/v1"
            # Cerebras model selection
            echo "" >&2
            echo "  Cerebras models:" >&2
            echo "    1) qwen-3-32b (default)" >&2
            echo "    2) llama-4-scout-17b-16e-instruct" >&2
            echo "    3) llama3.1-70b" >&2
            echo "    4) gpt-oss-120b" >&2
            echo "    5) zai-glm-4.6" >&2
            echo "    6) Other (enter custom model name)" >&2
            echo "" >&2
            local cerebras_model
            echo -en "${COLOR_CYAN}?${COLOR_RESET} Select Cerebras model [1-6, default: 1]: " >&2
            read -r cerebras_model < "$TTY_INPUT"
            case "$cerebras_model" in
                2) AGENT_MODEL_NAME="llama-4-scout-17b-16e-instruct" ;;
                3) AGENT_MODEL_NAME="llama3.1-70b" ;;
                4) AGENT_MODEL_NAME="gpt-oss-120b" ;;
                5) AGENT_MODEL_NAME="zai-glm-4.6" ;;
                6) AGENT_MODEL_NAME="$(prompt_value "Enter model name")" ;;
                *) AGENT_MODEL_NAME="qwen-3-32b" ;;
            esac
            ;;
        4)
            AGENT_PROVIDER=""
            AGENT_BASE_URL=""
            ;;
        *)
            AGENT_PROVIDER="openai"
            AGENT_MODEL_NAME="gpt-4o-mini"
            AGENT_BASE_URL=""
            ;;
    esac

    if [ -n "$AGENT_PROVIDER" ]; then
        AGENT_API_KEY="$(prompt_secret "Enter ${AGENT_PROVIDER^^} API key")"
        if [ -z "$AGENT_API_KEY" ]; then
            print_warning "No API key provided. Supervisor agent will be disabled."
            AGENT_PROVIDER=""
        else
            print_success "LLM configured: ${AGENT_PROVIDER} (${AGENT_MODEL_NAME})"
        fi
    fi

    # Speech-to-Text
    echo ""
    print_info "Speech-to-Text (STT)"
    echo ""
    echo "  1) OpenAI Whisper (cloud)"
    echo "  2) Deepgram (cloud)"
    echo "  3) Local (self-hosted Whisper)"
    echo "  4) Skip"
    echo ""
    
    if [ "$detected_gpu" != "cpu" ]; then
        print_info "  Detected: ${gpu_name}"
    fi
    echo ""

    local stt_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select STT provider [1-4, default: 4]: " >&2
    read -r stt_choice < "$TTY_INPUT"

    # Initialize local service variables
    LOCAL_STT_GPU=""
    LOCAL_STT_MODEL=""
    LOCAL_TTS_GPU=""
    LOCAL_TTS_VOICE=""

    case "$stt_choice" in
        1)
            STT_PROVIDER="openai"
            STT_MODEL="whisper-1"
            STT_BASE_URL=""
            if [ -n "$AGENT_API_KEY" ] && [ "$AGENT_PROVIDER" = "openai" ]; then
                if confirm "Use same API key as LLM?" "y"; then
                    STT_API_KEY="$AGENT_API_KEY"
                else
                    STT_API_KEY="$(prompt_secret "Enter OpenAI API key for STT")"
                fi
            else
                STT_API_KEY="$(prompt_secret "Enter OpenAI API key for STT")"
            fi
            if [ -n "$STT_API_KEY" ]; then
                print_success "STT configured: ${STT_PROVIDER} (${STT_MODEL})"
            else
                STT_PROVIDER=""
            fi
            ;;
        2)
            STT_PROVIDER="deepgram"
            STT_MODEL="nova-2"
            STT_BASE_URL=""
            STT_API_KEY="$(prompt_secret "Enter Deepgram API key")"
            if [ -n "$STT_API_KEY" ]; then
                print_success "STT configured: ${STT_PROVIDER} (${STT_MODEL})"
            else
                STT_PROVIDER=""
            fi
            ;;
        3)
            # Local STT
            echo "" >&2
            if [ "$detected_gpu" != "cpu" ]; then
                if confirm "Use detected GPU (${gpu_name}) for STT?" "y"; then
                    configure_local_stt "$detected_gpu"
                else
                    configure_local_stt "cpu"
                fi
            else
                print_info "No GPU detected, will use CPU (slower)"
                configure_local_stt "cpu"
            fi
            ;;
        *)
            STT_PROVIDER=""
            STT_BASE_URL=""
            print_info "STT skipped"
            ;;
    esac

    # Text-to-Speech
    echo ""
    print_info "Text-to-Speech (TTS)"
    echo ""
    echo "  1) OpenAI (tts-1, cloud)"
    echo "  2) ElevenLabs (cloud)"
    echo "  3) Local (self-hosted Kokoro)"
    echo "  4) Skip"
    echo ""
    
    if [ "$detected_gpu" != "cpu" ]; then
        print_info "  Detected: ${gpu_name}"
    fi
    echo ""

    local tts_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select TTS provider [1-4, default: 4]: " >&2
    read -r tts_choice < "$TTY_INPUT"

    case "$tts_choice" in
        1)
            TTS_PROVIDER="openai"
            TTS_MODEL="tts-1"
            TTS_VOICE="nova"
            TTS_BASE_URL=""
            if [ -n "$AGENT_API_KEY" ] && [ "$AGENT_PROVIDER" = "openai" ]; then
                if confirm "Use same API key as LLM?" "y"; then
                    TTS_API_KEY="$AGENT_API_KEY"
                else
                    TTS_API_KEY="$(prompt_secret "Enter OpenAI API key for TTS")"
                fi
            elif [ -n "$STT_API_KEY" ] && [ "$STT_PROVIDER" = "openai" ]; then
                if confirm "Use same API key as STT?" "y"; then
                    TTS_API_KEY="$STT_API_KEY"
                else
                    TTS_API_KEY="$(prompt_secret "Enter OpenAI API key for TTS")"
                fi
            else
                TTS_API_KEY="$(prompt_secret "Enter OpenAI API key for TTS")"
            fi
            if [ -n "$TTS_API_KEY" ]; then
                print_success "TTS configured: ${TTS_PROVIDER} (${TTS_MODEL}, voice: ${TTS_VOICE})"
            else
                TTS_PROVIDER=""
            fi
            ;;
        2)
            TTS_PROVIDER="elevenlabs"
            TTS_MODEL="eleven_multilingual_v2"
            TTS_BASE_URL=""
            TTS_API_KEY="$(prompt_secret "Enter ElevenLabs API key")"
            if [ -n "$TTS_API_KEY" ]; then
                echo "" >&2
                print_info "Find your voice ID at: https://elevenlabs.io/app/voice-library"
                TTS_VOICE="$(prompt_value "Enter ElevenLabs voice ID")"
                if [ -z "$TTS_VOICE" ]; then
                    print_warning "No voice ID provided. TTS will be disabled."
                    TTS_PROVIDER=""
                else
                    print_success "TTS configured: ${TTS_PROVIDER} (voice: ${TTS_VOICE})"
                fi
            else
                TTS_PROVIDER=""
            fi
            ;;
        3)
            # Local TTS
            echo "" >&2
            if [ "$detected_gpu" != "cpu" ]; then
                if confirm "Use detected GPU (${gpu_name}) for TTS?" "y"; then
                    configure_local_tts "$detected_gpu"
                else
                    configure_local_tts "cpu"
                fi
            else
                print_info "No GPU detected, will use CPU"
                configure_local_tts "cpu"
            fi
            ;;
        *)
            TTS_PROVIDER=""
            TTS_BASE_URL=""
            print_info "TTS skipped"
            ;;
    esac

    # Configure HuggingFace token if local services are used
    HF_TOKEN=""
    if [ "$STT_PROVIDER" = "local" ] || [ "$TTS_PROVIDER" = "local" ]; then
        configure_hf_token
    fi

    echo ""
}

# ─────────────────────────────────────────────────────────────
# AI Agents Installation (Optional)
# ─────────────────────────────────────────────────────────────
install_ai_agents() {
    echo ""
    print_info "AI Coding Agents Installation (Optional)"
    echo ""
    print_info "Tiflis Code can run these AI coding agents:"
    echo "  - Claude Code (claude -p)"
    echo "  - Cursor Agent (cursor-agent)"
    echo "  - OpenCode (opencode run)"
    echo ""

    if ! confirm "Install AI coding agents?" "y"; then
        print_info "Skipping agents installation"
        return
    fi

    local agents_installed=false

    # Claude Code
    if command -v claude &>/dev/null; then
        print_success "Claude Code already installed ($(claude --version 2>/dev/null | head -1 || echo 'installed'))"
    else
        if confirm "Install Claude Code?"; then
            print_step "Installing Claude Code..."
            if [ "$DRY_RUN" = "false" ]; then
                if curl -fsSL https://claude.ai/install.sh | bash; then
                    print_success "Claude Code installed"
                    agents_installed=true
                else
                    print_warning "Claude Code installation failed. Install manually: npm i -g @anthropic-ai/claude-code"
                fi
            fi
        fi
    fi

    # Cursor Agent
    if command -v cursor-agent &>/dev/null; then
        print_success "Cursor Agent already installed"
    else
        if confirm "Install Cursor Agent?"; then
            print_step "Installing Cursor Agent..."
            if [ "$DRY_RUN" = "false" ]; then
                if curl -fsSL https://cursor.com/install | bash; then
                    print_success "Cursor Agent installed"
                    agents_installed=true
                else
                    print_warning "Cursor Agent installation failed. Install manually: https://cursor.com/docs/cli/installation"
                fi
            fi
        fi
    fi

    # OpenCode
    if command -v opencode &>/dev/null; then
        print_success "OpenCode already installed ($(opencode --version 2>/dev/null | head -1 || echo 'installed'))"
    else
        if confirm "Install OpenCode?"; then
            print_step "Installing OpenCode..."
            if [ "$DRY_RUN" = "false" ]; then
                if curl -fsSL https://opencode.ai/install | bash; then
                    print_success "OpenCode installed"
                    agents_installed=true
                else
                    print_warning "OpenCode installation failed. Install manually: npm i -g opencode-ai"
                fi
            fi
        fi
    fi

    if [ "$agents_installed" = "true" ]; then
        print_info "Note: You may need to restart your terminal for PATH changes to take effect"
    fi

    echo ""
}

# ─────────────────────────────────────────────────────────────
# Main Installation
# ─────────────────────────────────────────────────────────────
install_workstation() {
    local os arch
    os="$(detect_os)"
    arch="$(detect_arch)"

    # Check Node.js
    print_step "Checking Node.js..."
    if ! check_node 24; then
        print_warning "Node.js >= 24 is required"
        if confirm "Install Node.js automatically?"; then
            install_node
            # Reload PATH
            hash -r 2>/dev/null || true
            if ! check_node 24; then
                print_error "Node.js installation failed. Please install manually and re-run."
                exit 1
            fi
        else
            print_error "Node.js >= 24 is required. Please install from https://nodejs.org"
            exit 1
        fi
    fi
    print_success "Node.js $(node --version) detected"

    # Check build tools
    print_step "Checking build tools..."
    if ! check_build_tools; then
        print_warning "Build tools required for native modules (node-pty, better-sqlite3)"
        if confirm "Install build tools automatically?"; then
            install_build_tools
        else
            case "$os" in
                darwin)
                    print_error "Please run: xcode-select --install"
                    ;;
                linux|wsl)
                    print_error "Please install: build-essential python3"
                    ;;
            esac
            exit 1
        fi
    fi
    case "$os" in
        darwin) print_success "Xcode CLI tools detected" ;;
        *) print_success "Build tools detected" ;;
    esac

    # Check for existing installation
    local skip_config=false
    if [ -f "${WORKSTATION_DIR}/.env" ]; then
        echo ""
        print_info "Existing installation detected"
        echo ""
        echo "  Found: ${WORKSTATION_DIR}/.env"
        echo ""
        if confirm "Keep existing configuration and only update the package?" "y"; then
            skip_config=true
            print_success "Will keep existing configuration"
        else
            print_info "Will reconfigure (existing .env will be backed up)"
            if [ "$DRY_RUN" = "false" ]; then
                cp "${WORKSTATION_DIR}/.env" "${WORKSTATION_DIR}/.env.backup.$(date +%Y%m%d%H%M%S)"
            fi
        fi
    fi

    # Configuration wizard (skip if keeping existing config)
    local tunnel_url="" tunnel_api_key="" workstation_auth_key=""

    if [ "$skip_config" = "false" ]; then
        echo ""
        print_info "Configuration"
        echo ""

        # Tunnel URL
        tunnel_url="${TUNNEL_URL:-}"
        if [ -z "$tunnel_url" ]; then
            tunnel_url="$(prompt_value "Tunnel URL (wss://...)")"
        fi
        if [ -z "$tunnel_url" ]; then
            print_error "Tunnel URL is required"
            exit 1
        fi

        # Tunnel API key
        tunnel_api_key="${TUNNEL_API_KEY:-}"
        if [ -z "$tunnel_api_key" ]; then
            tunnel_api_key="$(prompt_secret "Tunnel API key")"
        fi
        if [ -z "$tunnel_api_key" ] || [ ${#tunnel_api_key} -lt 32 ]; then
            print_error "Tunnel API key must be at least 32 characters"
            exit 1
        fi

        # Workstation auth key
        workstation_auth_key="${WORKSTATION_AUTH_KEY:-}"
        if [ -z "$workstation_auth_key" ]; then
            if confirm "Generate a random workstation auth key?" "y"; then
                workstation_auth_key="$(generate_key 24)"
                print_success "Generated auth key: ${workstation_auth_key:0:8}..."
            else
                workstation_auth_key="$(prompt_secret "Workstation auth key (min 16 chars)")"
            fi
        fi
        if [ ${#workstation_auth_key} -lt 16 ]; then
            print_error "Workstation auth key must be at least 16 characters"
            exit 1
        fi

        # Workspaces root
        WORKSPACES_ROOT="$(prompt_value "Workspaces directory" "$WORKSPACES_ROOT")"

        # AI Provider Configuration
        AGENT_PROVIDER=""
        AGENT_API_KEY=""
        AGENT_MODEL_NAME=""
        AGENT_BASE_URL=""
        STT_PROVIDER=""
        STT_API_KEY=""
        STT_MODEL=""
        TTS_PROVIDER=""
        TTS_API_KEY=""
        TTS_MODEL=""
        TTS_VOICE=""
        configure_ai_providers

        echo ""
        print_info "Summary:"
        echo "  Tunnel URL:     $tunnel_url"
        echo "  Tunnel API Key: ${tunnel_api_key:0:8}..."
        echo "  Auth Key:       ${workstation_auth_key:0:8}..."
        echo "  Workspaces:     $WORKSPACES_ROOT"
        if [ -n "$AGENT_PROVIDER" ]; then
            echo "  LLM Provider:   $AGENT_PROVIDER ($AGENT_MODEL_NAME)"
        fi
        if [ -n "$STT_PROVIDER" ]; then
            echo "  STT Provider:   $STT_PROVIDER"
        fi
        if [ -n "$TTS_PROVIDER" ]; then
            echo "  TTS Provider:   $TTS_PROVIDER"
        fi
        echo ""

        if ! confirm "Proceed with installation?" "y"; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi

    # Create directories
    print_step "Creating directories..."
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "${WORKSTATION_DIR}/logs"
        mkdir -p "${WORKSTATION_DIR}/data"
        mkdir -p "$WORKSPACES_ROOT"
    fi

    # Create .env file (skip if keeping existing config)
    if [ "$skip_config" = "false" ]; then
        print_step "Creating .env file..."
        if [ "$DRY_RUN" = "false" ]; then
            cat > "${WORKSTATION_DIR}/.env" << EOF
# Tiflis Code Workstation Configuration
# Generated by install script on $(date -Iseconds)

# Tunnel connection (required)
TUNNEL_URL=${tunnel_url}
TUNNEL_API_KEY=${tunnel_api_key}

# Workstation settings
WORKSTATION_AUTH_KEY=${workstation_auth_key}
WORKSTATION_NAME=$(hostname)
WORKSPACES_ROOT=${WORKSPACES_ROOT}
DATA_DIR=${WORKSTATION_DIR}/data

# Server settings
PORT=3002
HOST=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info
EOF

            # Add AI Agent configuration if provided
            if [ -n "$AGENT_PROVIDER" ]; then
                cat >> "${WORKSTATION_DIR}/.env" << EOF

# AI Agent (Supervisor)
AGENT_PROVIDER=${AGENT_PROVIDER}
AGENT_API_KEY=${AGENT_API_KEY}
AGENT_MODEL_NAME=${AGENT_MODEL_NAME}
EOF
                # Add base URL for non-OpenAI providers
                if [ -n "$AGENT_BASE_URL" ]; then
                    cat >> "${WORKSTATION_DIR}/.env" << EOF
AGENT_BASE_URL=${AGENT_BASE_URL}
EOF
                fi
            else
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# AI Agent (optional - uncomment and configure)
# AGENT_PROVIDER=openai
# AGENT_API_KEY=your-openai-key
# AGENT_MODEL_NAME=gpt-4o-mini
# AGENT_BASE_URL=https://api.cerebras.ai/v1  # For Cerebras
EOF
            fi

            # Add STT configuration if provided
            if [ -n "$STT_PROVIDER" ]; then
                if [ "$STT_PROVIDER" = "local" ]; then
                    cat >> "${WORKSTATION_DIR}/.env" << EOF

# Speech-to-Text (Local)
STT_PROVIDER=${STT_PROVIDER}
STT_BASE_URL=${STT_BASE_URL}
STT_MODEL=${STT_MODEL}
EOF
                else
                    cat >> "${WORKSTATION_DIR}/.env" << EOF

# Speech-to-Text
STT_PROVIDER=${STT_PROVIDER}
STT_API_KEY=${STT_API_KEY}
STT_MODEL=${STT_MODEL}
EOF
                fi
            else
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# Speech-to-Text (optional)
# STT_PROVIDER=openai
# STT_API_KEY=your-openai-key
# For local: STT_PROVIDER=local, STT_BASE_URL=http://localhost:8100
EOF
            fi

            # Add TTS configuration if provided
            if [ -n "$TTS_PROVIDER" ]; then
                if [ "$TTS_PROVIDER" = "local" ]; then
                    cat >> "${WORKSTATION_DIR}/.env" << EOF

# Text-to-Speech (Local)
TTS_PROVIDER=${TTS_PROVIDER}
TTS_BASE_URL=${TTS_BASE_URL}
TTS_VOICE=${TTS_VOICE}
EOF
                else
                    cat >> "${WORKSTATION_DIR}/.env" << EOF

# Text-to-Speech
TTS_PROVIDER=${TTS_PROVIDER}
TTS_API_KEY=${TTS_API_KEY}
TTS_MODEL=${TTS_MODEL}
TTS_VOICE=${TTS_VOICE}
EOF
                fi
            else
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# Text-to-Speech (optional)
# TTS_PROVIDER=openai
# TTS_API_KEY=your-openai-key
# TTS_VOICE=nova
# For local: TTS_PROVIDER=local, TTS_BASE_URL=http://localhost:8101
EOF
            fi

            # Add HuggingFace token if provided (for local speech services)
            if [ -n "$HF_TOKEN" ]; then
                cat >> "${WORKSTATION_DIR}/.env" << EOF

# HuggingFace (for downloading models)
HF_TOKEN=${HF_TOKEN}
EOF
            elif [ "$STT_PROVIDER" = "local" ] || [ "$TTS_PROVIDER" = "local" ]; then
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# HuggingFace (optional - for downloading gated models)
# HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx
EOF
            fi

            chmod 600 "${WORKSTATION_DIR}/.env"
        fi
        
        # Setup local speech services if configured
        if [ -n "$LOCAL_STT_GPU" ] || [ -n "$LOCAL_TTS_GPU" ]; then
            echo ""
            print_info "Setting up local speech services..."
            
            local os_for_speech="$(detect_os)"
            
            # Determine deployment method based on platform
            if [ "$os_for_speech" = "darwin" ] && [ "$LOCAL_STT_GPU" = "apple-silicon" -o "$LOCAL_TTS_GPU" = "apple-silicon" ]; then
                # Apple Silicon: use native MLX services
                if [ -n "$LOCAL_STT_MODEL" ]; then
                    setup_native_stt "$LOCAL_STT_MODEL"
                fi
                if [ -n "$LOCAL_TTS_VOICE" ]; then
                    setup_native_tts "$LOCAL_TTS_VOICE"
                fi
            else
                # NVIDIA/CPU: use Docker
                if command -v docker &>/dev/null; then
                    generate_speech_docker_compose "$LOCAL_STT_GPU" "$LOCAL_TTS_GPU" "$LOCAL_STT_MODEL" "$LOCAL_TTS_VOICE"
                    
                    if confirm "Start speech services now with Docker Compose?" "y"; then
                        print_step "Starting speech services..."
                        if [ "$DRY_RUN" = "false" ]; then
                            cd "${WORKSTATION_DIR}"
                            docker compose -f docker-compose.speech.yml up -d
                            
                            # Wait for services to be ready
                            if [ -n "$LOCAL_STT_MODEL" ]; then
                                wait_for_service "http://localhost:8100/health" "STT" 60
                            fi
                            if [ -n "$LOCAL_TTS_VOICE" ]; then
                                wait_for_service "http://localhost:8101/health" "TTS" 60
                            fi
                        fi
                    else
                        print_info "Start later with: cd ${WORKSTATION_DIR} && docker compose -f docker-compose.speech.yml up -d"
                    fi
                else
                    print_warning "Docker not found. Install Docker to run local speech services."
                    print_info "Or use native services on Apple Silicon (MLX)"
                fi
            fi
        fi
    else
        print_success "Keeping existing .env configuration"
    fi

    # Install npm package
    print_step "Installing ${PACKAGE_NAME}..."
    if [ "$DRY_RUN" = "false" ]; then
        cd "${WORKSTATION_DIR}"
        npm init -y > /dev/null 2>&1

        # Set package.json type to module for ESM compatibility
        node -e "const p=require('./package.json'); p.type='module'; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2))"

        npm install "${PACKAGE_NAME}@${TIFLIS_WORKSTATION_VERSION}"
        print_success "Package installed"
    fi

    # Install AI agents (optional, skip on update)
    if [ "$skip_config" = "false" ]; then
        install_ai_agents
    fi

    # Create/restart service
    local init_system
    case "$os" in
        darwin) init_system="launchd" ;;
        linux|wsl)
            if command -v systemctl &>/dev/null && systemctl --version &>/dev/null 2>&1; then
                init_system="systemd"
            else
                init_system="none"
            fi
            ;;
        *) init_system="none" ;;
    esac

    if [ "$init_system" = "systemd" ]; then
        # Check if service exists
        local service_exists=false
        if systemctl list-unit-files 2>/dev/null | grep -q tiflis-workstation; then
            service_exists=true
        fi

        if [ "$skip_config" = "true" ] && [ "$service_exists" = "true" ]; then
            # Update mode with existing service: just restart
            print_step "Restarting systemd service..."
            if [ "$DRY_RUN" = "false" ]; then
                sudo systemctl restart tiflis-workstation
                sleep 3
                if sudo systemctl is-active --quiet tiflis-workstation; then
                    print_success "Workstation server restarted!"
                else
                    print_warning "Service may not be running"
                    print_info "Check: sudo systemctl status tiflis-workstation"
                fi
            fi
        else
            # Fresh install: create the service
            print_step "Creating systemd service..."
            if [ "$DRY_RUN" = "false" ]; then
                sudo tee /etc/systemd/system/tiflis-workstation.service > /dev/null << EOF
[Unit]
Description=Tiflis Code Workstation Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${WORKSTATION_DIR}
EnvironmentFile=${WORKSTATION_DIR}/.env
ExecStart=$(which node) ${WORKSTATION_DIR}/node_modules/${PACKAGE_NAME}/dist/main.js
Restart=always
RestartSec=10
StandardOutput=append:${WORKSTATION_DIR}/logs/output.log
StandardError=append:${WORKSTATION_DIR}/logs/error.log

[Install]
WantedBy=multi-user.target
EOF
                sudo systemctl daemon-reload
                sudo systemctl enable tiflis-workstation
                sudo systemctl start tiflis-workstation

                sleep 3
                if sudo systemctl is-active --quiet tiflis-workstation; then
                    print_success "Workstation server is running!"
                else
                    print_warning "Service created but may not be running"
                    print_info "Check: sudo systemctl status tiflis-workstation"
                fi
            fi
        fi
    elif [ "$init_system" = "launchd" ]; then
        # Check if service exists
        local service_exists=false
        if launchctl list 2>/dev/null | grep -q io.tiflis.workstation; then
            service_exists=true
        fi

        if [ "$skip_config" = "true" ] && [ "$service_exists" = "true" ]; then
            # Update mode with existing service: just restart
            print_step "Restarting launchd service..."
            if [ "$DRY_RUN" = "false" ]; then
                launchctl kickstart -k "gui/$(id -u)/io.tiflis.workstation"
                sleep 3
                if launchctl list | grep -q io.tiflis.workstation; then
                    print_success "Workstation server restarted!"
                else
                    print_warning "Service may not be running"
                fi
            fi
        else
            # Fresh install: create the service
            print_step "Creating launchd service..."
            if [ "$DRY_RUN" = "false" ]; then
                mkdir -p "$HOME/Library/LaunchAgents"
                cat > "$HOME/Library/LaunchAgents/io.tiflis.workstation.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.tiflis.workstation</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>bash</string>
        <string>-c</string>
        <string>source ${WORKSTATION_DIR}/.env &amp;&amp; exec $(which node) ${WORKSTATION_DIR}/node_modules/${PACKAGE_NAME}/dist/main.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${WORKSTATION_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${WORKSTATION_DIR}/logs/output.log</string>
    <key>StandardErrorPath</key>
    <string>${WORKSTATION_DIR}/logs/error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.nvm/versions/node/v22.*/bin:${HOME}/.npm-global/bin:${HOME}/.local/bin:${HOME}/.cargo/bin</string>
    </dict>
</dict>
</plist>
EOF
                # Ensure service is fully stopped before starting
                launchctl bootout "gui/$(id -u)/io.tiflis.workstation" 2>/dev/null || true
                sleep 1
                
                # Bootstrap the service
                if launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.tiflis.workstation.plist" 2>&1; then
                    sleep 2
                    if launchctl list | grep -q io.tiflis.workstation; then
                        print_success "Workstation server is running!"
                    else
                        print_warning "Service created but may not be running"
                    fi
                else
                    # If bootstrap fails, try load as fallback
                    print_warning "Bootstrap failed, trying alternative method..."
                    launchctl load -w "$HOME/Library/LaunchAgents/io.tiflis.workstation.plist" 2>/dev/null || true
                    sleep 2
                    if launchctl list | grep -q io.tiflis.workstation; then
                        print_success "Workstation server is running!"
                    else
                        print_error "Failed to start workstation service"
                        print_info "Try manually: launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/io.tiflis.workstation.plist"
                    fi
                fi
            fi
        fi
    else
        print_warning "No supported init system. Run manually:"
        print_info "cd ${WORKSTATION_DIR} && source .env && node node_modules/${PACKAGE_NAME}/dist/main.js"
    fi

    # Get connection info (if server is running)
    echo ""
    if [ "$skip_config" = "true" ]; then
        print_success "Workstation updated successfully!"
    else
        print_success "Workstation installed successfully!"
    fi
    echo ""

    if [ "$DRY_RUN" = "false" ]; then
        # Wait for server to generate connection info
        sleep 2
        if curl -sf "http://localhost:3002/health" > /dev/null 2>&1; then
            echo "  Connection info available at: http://localhost:3002/connect"
            echo ""
            # Try to fetch and display magic link
            local connect_info
            if connect_info=$(curl -sf "http://localhost:3002/connect" 2>/dev/null); then
                echo "$connect_info" | head -20
            fi
        fi
    fi

    echo ""
    if [ "$init_system" = "systemd" ]; then
        echo "  Workstation Commands:"
        echo "    Status:  sudo systemctl status tiflis-workstation"
        echo "    Logs:    sudo journalctl -u tiflis-workstation -f"
        echo "    Stop:    sudo systemctl stop tiflis-workstation"
        echo "    Start:   sudo systemctl start tiflis-workstation"
        echo "    Restart: sudo systemctl restart tiflis-workstation"
        echo ""
        echo "  Debug (if service not working):"
        echo "    cat ${WORKSTATION_DIR}/logs/output.log"
        echo "    cat ${WORKSTATION_DIR}/logs/error.log"
        echo "    cd ${WORKSTATION_DIR} && source .env && node node_modules/${PACKAGE_NAME}/dist/main.js"
        
        # Show Docker commands if speech services configured
        if [ -f "${WORKSTATION_DIR}/docker-compose.speech.yml" ]; then
            echo ""
            echo "  Speech Services (Docker):"
            echo "    Status:  docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml ps"
            echo "    Logs:    docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml logs -f"
            echo "    Stop:    docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml down"
            echo "    Start:   docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml up -d"
            echo "    Restart: docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml restart"
        fi
    elif [ "$init_system" = "launchd" ]; then
        echo "  Workstation Commands:"
        echo "    Status:  launchctl list | grep tiflis"
        echo "    Logs:    tail -f ${WORKSTATION_DIR}/logs/output.log"
        echo "    Restart: launchctl kickstart -k gui/\$(id -u)/io.tiflis.workstation"
        echo "    Stop:    launchctl bootout gui/\$(id -u)/io.tiflis.workstation"
        echo "    Start:   launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/io.tiflis.workstation.plist"
        echo ""
        echo "  Debug (if service not working):"
        echo "    cat ${WORKSTATION_DIR}/logs/output.log"
        echo "    cat ${WORKSTATION_DIR}/logs/error.log"
        echo "    cd ${WORKSTATION_DIR} && source .env && node node_modules/${PACKAGE_NAME}/dist/main.js"
        
        # Show native speech service commands if configured
        local has_speech_services=false
        if [ -f "$HOME/Library/LaunchAgents/io.tiflis.stt.plist" ] || [ -f "$HOME/Library/LaunchAgents/io.tiflis.tts.plist" ]; then
            has_speech_services=true
        fi
        
        if [ "$has_speech_services" = "true" ]; then
            echo ""
            echo "  Speech Services (Native):"
            echo "    Status:  launchctl list | grep tiflis"
            if [ -f "$HOME/Library/LaunchAgents/io.tiflis.stt.plist" ]; then
                echo ""
                echo "    STT Logs:    tail -f ${TIFLIS_INSTALL_DIR}/logs/stt-output.log"
                echo "    STT Restart: launchctl kickstart -k gui/\$(id -u)/io.tiflis.stt"
                echo "    STT Stop:    launchctl bootout gui/\$(id -u)/io.tiflis.stt"
                echo "    STT Start:   launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/io.tiflis.stt.plist"
            fi
            if [ -f "$HOME/Library/LaunchAgents/io.tiflis.tts.plist" ]; then
                echo ""
                echo "    TTS Logs:    tail -f ${TIFLIS_INSTALL_DIR}/logs/tts-output.log"
                echo "    TTS Restart: launchctl kickstart -k gui/\$(id -u)/io.tiflis.tts"
                echo "    TTS Stop:    launchctl bootout gui/\$(id -u)/io.tiflis.tts"
                echo "    TTS Start:   launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/io.tiflis.tts.plist"
            fi
        fi
        
        # Show Docker commands if speech services configured via Docker
        if [ -f "${WORKSTATION_DIR}/docker-compose.speech.yml" ]; then
            echo ""
            echo "  Speech Services (Docker):"
            echo "    Status:  docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml ps"
            echo "    Logs:    docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml logs -f"
            echo "    Stop:    docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml down"
            echo "    Start:   docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml up -d"
            echo "    Restart: docker compose -f ${WORKSTATION_DIR}/docker-compose.speech.yml restart"
        fi
    fi

    echo ""
    echo "  Configuration: ${WORKSTATION_DIR}/.env"
    echo "  Data:          ${WORKSTATION_DIR}/data/"
    echo "  Logs:          ${WORKSTATION_DIR}/logs/"
    
    # Show speech logs location if configured
    if [ -f "$HOME/Library/LaunchAgents/io.tiflis.stt.plist" ] || [ -f "$HOME/Library/LaunchAgents/io.tiflis.tts.plist" ]; then
        echo "  Speech Logs:   ${TIFLIS_INSTALL_DIR}/logs/stt-*.log, tts-*.log"
    fi
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
main() {
    print_banner

    local os arch
    os="$(detect_os)"
    arch="$(detect_arch)"

    print_step "Detecting platform... ${os} ${arch}"

    if [ "$os" = "unknown" ]; then
        print_error "Unsupported operating system"
        exit 1
    fi

    if [ "$os" = "wsl" ]; then
        print_info "Running in WSL2 environment"
    fi

    if [ "$DRY_RUN" = "true" ]; then
        print_warning "Running in dry-run mode - no changes will be made"
        echo ""
    fi

    install_workstation
}

main
