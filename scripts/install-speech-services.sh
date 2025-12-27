#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Speech Services Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/install-speech-services.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/install-speech-services.sh | bash -s -- --dry-run
#

# DEBUG: Script started!
echo "DEBUG: Script execution started at $(date)" > /tmp/tiflis_debug.log
# Environment variables:
#   STT_MODEL          - Whisper model (default: large-v3)
#   TTS_VOICE          - TTS voice (default: af_heart)
#   STT_PORT           - STT port (default: 8100)
#   TTS_PORT           - TTS port (default: 8101)
#   HF_TOKEN           - HuggingFace token (optional)
#   SKIP_DEPS          - Skip dependency checks (debug)

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
TIFLIS_INSTALL_DIR="${TIFLIS_INSTALL_DIR:-/opt/tiflis-code}"
SPEECH_DIR="${TIFLIS_INSTALL_DIR}/speech"
REPO_URL="${REPO_URL:-https://github.com/tiflis-io/tiflis-code.git}"

# ─────────────────────────────────────────────────────────────
# TTY Detection (for curl | bash usage)
# ─────────────────────────────────────────────────────────────
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

check_sudo_access() {
    if ! sudo -n true 2>/dev/null; then
        echo "" >&2
        echo -en "${COLOR_CYAN}?${COLOR_RESET} Enter password for sudo access:" >&2
        if ! sudo true; then
            print_error "Sudo access required for installation"
            exit 1
        fi
    fi
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
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Speech Services Installer"
    echo ""
    echo -e "  ${dim}© 2025 Roman Barinov · FSL-1.1-NC · github.com/tiflis-io/tiflis-code${reset}"
    echo ""
}

# ─────────────────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────────────────
DRY_RUN=false
PYTHON_CMD=""
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
            echo "  STT_MODEL          Whisper model (default: large-v3)"
            echo "  TTS_VOICE          TTS voice (default: af_heart)"
            echo "  STT_PORT           STT port (default: 8100)"
            echo "  TTS_PORT           TTS port (default: 8101)"
            echo "  HF_TOKEN           HuggingFace token (optional)"
            echo "  SKIP_DEPS          Skip dependency checks (debug)"
            echo ""
            echo "Python Requirements:"
            echo "  - Minimum: Python 3.11 (required by STT service)"
            echo "  - Preferred: Python 3.12+ (better performance)"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────
# GPU Detection
# ─────────────────────────────────────────────────────────────
detect_gpu() {
    local os="$(detect_os)"
    
    # Check for NVIDIA GPU
    if command -v nvidia-smi &>/dev/null; then
        if nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | grep -qi "nvidia\|geforce\|rtx\|gtx\|quadro\|tesla"; then
            echo "nvidia"
            return
        fi
    fi
    
    echo "cpu"
}

get_gpu_name() {
    local gpu_type="$1"
    case "$gpu_type" in
        nvidia)
            nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU"
            ;;
        *)
            echo "CPU only"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Dependency Checkers
# ─────────────────────────────────────────────────────────────
check_python() {
    local required="${1:-3.11}"
    print_step "Checking Python..."
    
    # Simple debug that doesn't rely on stderr redirection
    echo "DEBUG: Python detection started" > /tmp/tiflis_debug.log
    
    # Check for available Python versions in order of preference
    local python_version=""
    local python_cmd=""
    
    # Try specific versions in order of preference
    # STT requires >=3.11, TTS requires >=3.10, so we need 3.11 minimum
    for version in "3.13" "3.12" "3.11"; do
        echo "DEBUG: Checking python$version..." >> /tmp/tiflis_debug.log
        if command -v "python$version" &>/dev/null; then
            echo "DEBUG: Found python$version command" >> /tmp/tiflis_debug.log
            # Python --version outputs to stderr on some systems
            local full_version="$(python$version --version 2>&1)"
            local major_minor="$(echo "$full_version" | grep -oE '[0-9]+\.[0-9]+' | head -1)"
            local major="$(echo "$full_version" | grep -oE '[0-9]+' | head -1)"
            local minor="$(echo "$full_version" | grep -oE '[0-9]+' | head -2 | tail -1)"
            
            # Debug info
            echo "DEBUG: Checking python$version -> $full_version (major=$major, minor=$minor)" >&2
            
            # Check if version >= 3.11
            if [ -n "$major" ] && [ -n "$minor" ]; then
                if [ "$major" -gt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -ge 11 ]); then
                    python_version="$full_version"
                    python_cmd="python$version"
                    print_success "$python_version detected"
                    PYTHON_CMD="$python_cmd"
                    return 0
                fi
            fi
        fi
    done
    
    # Check if python3 is available and meets requirements
    echo "DEBUG: Checking python3 command..." >> /tmp/tiflis_debug.log
    if command -v python3 &>/dev/null; then
        echo "DEBUG: Found python3 command" >> /tmp/tiflis_debug.log
        # Python --version outputs to stderr on some systems
        local full_version="$(python3 --version 2>&1)"
        local major_minor="$(echo "$full_version" | grep -oE '[0-9]+\.[0-9]+' | head -1)"
        local major="$(echo "$full_version" | grep -oE '[0-9]+' | head -1)"
        local minor="$(echo "$full_version" | grep -oE '[0-9]+' | head -2 | tail -1)"
        
        # Debug info
        echo "DEBUG: Checking python3 -> $full_version (major=$major, minor=$minor)" >&2
        
        # Check if version >= 3.11
        if [ -n "$major" ] && [ -n "$minor" ]; then
            if [ "$major" -gt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -ge 11 ]); then
                python_version="$full_version"
                python_cmd="python3"
                print_success "$python_version detected"
                PYTHON_CMD="$python_cmd"
                return 0
            fi
        fi
    fi
    
    print_warning "Python 3.11+ not found (required by STT service)"
    if confirm "Install Python 3.11+?"; then
        print_step "Installing Python 3.11+..."
        if [ "$DRY_RUN" = "false" ]; then
            # Add deadsnakes PPA for older Ubuntu versions
            local ubuntu_version=$(lsb_release -rs)
            if [[ $(echo "$ubuntu_version < 25.04" | bc -l) -eq 1 ]]; then
                sudo apt-get update
                sudo apt-get install -y software-properties-common
                sudo add-apt-repository -y ppa:deadsnakes/ppa
                sudo apt-get update
                sudo apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip
            else
                # Ubuntu 25.04+ has Python 3.12+ in main repos (preferred over 3.11)
                sudo apt-get update
                sudo apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip
            fi
        fi
        
        # Check again after installation
        for version in "3.13" "3.12" "3.11"; do
            if command -v "python$version" &>/dev/null; then
                # Python --version outputs to stderr on some systems
                local full_version="$(python$version --version 2>&1)"
                local major="$(echo "$full_version" | grep -oE '[0-9]+' | head -1)"
                local minor="$(echo "$full_version" | grep -oE '[0-9]+' | head -2 | tail -1)"
                
                # Debug info
                echo "DEBUG: Post-install check python$version -> $full_version (major=$major, minor=$minor)" >&2
                
                # Check if version >= 3.11
                if [ -n "$major" ] && [ -n "$minor" ]; then
                    if [ "$major" -gt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -ge 11 ]); then
                        python_version="$full_version"
                        python_cmd="python$version"
                        PYTHON_CMD="$python_cmd"
                        print_success "$python_version installed"
                        return 0
fi
    
    echo "DEBUG: No suitable Python version found" >&2
                fi
            fi
        done
        
        print_error "Python installation failed"
        exit 1
    else
        print_error "Python 3.11+ is required for STT service compatibility"
        exit 1
    fi
}

check_system_deps() {
    print_step "Checking system dependencies..."
    
    local missing=()
    local deps=("ffmpeg" "espeak-ng" "git" "curl")
    local packages=("ffmpeg" "espeak-ng" "git" "curl")
    
    for i in "${!deps[@]}"; do
        local dep="${deps[$i]}"
        local pkg="${packages[$i]}"
        
        if ! command -v "$dep" &>/dev/null; then
            missing+=("$pkg")
        else
            print_success "$dep installed"
        fi
    done
    
    if [ ${#missing[@]} -gt 0 ]; then
        print_warning "Missing dependencies: ${missing[*]}"
        if confirm "Install missing dependencies?"; then
            print_step "Installing system dependencies..."
            if [ "$DRY_RUN" = "false" ]; then
                sudo apt-get update
                sudo apt-get install -y "${missing[@]}"
            fi
            print_success "System dependencies installed"
        else
            print_error "System dependencies are required"
            exit 1
        fi
    fi
}

check_nvidia_driver() {
    print_step "Checking NVIDIA driver..."
    
    if command -v nvidia-smi &>/dev/null; then
        local driver_version=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | tr -d ' ')
        print_success "NVIDIA driver $driver_version detected"
        return 0
    fi
    
    print_warning "NVIDIA driver not found"
    echo "" >&2
    echo "  This installer requires an NVIDIA GPU with drivers installed." >&2
    echo "  The recommended way to install drivers on Ubuntu is:" >&2
    echo "    sudo ubuntu-drivers autoinstall" >&2
    echo "    sudo reboot" >&2
    echo "" >&2
    
    if confirm "Install NVIDIA drivers now?"; then
        print_step "Installing NVIDIA drivers (this may take a few minutes)..."
        if [ "$DRY_RUN" = "false" ]; then
            sudo ubuntu-drivers autoinstall
        fi
        print_success "NVIDIA drivers installed"
        
        print_warning "IMPORTANT: You must reboot your system for the drivers to work."
        if confirm "Reboot now?"; then
            if [ "$DRY_RUN" = "false" ]; then
                sudo reboot
            fi
            exit 0
        else
            print_error "Please reboot your system and re-run the installer"
            exit 1
        fi
    else
        print_error "NVIDIA driver is required"
        exit 1
    fi
}

check_cuda() {
    print_step "Checking CUDA..."
    
    if command -v nvcc &>/dev/null; then
        local cuda_version=$(nvcc --version 2>/dev/null | grep -oE 'release [0-9]+\.[0-9]+' | head -1 | cut -d' ' -f2)
        print_success "CUDA $cuda_version detected"
        return 0
    fi
    
    print_warning "CUDA toolkit not found"
    if confirm "Install CUDA toolkit?"; then
        print_step "Installing CUDA toolkit..."
        if [ "$DRY_RUN" = "false" ]; then
            # Add NVIDIA repository
            wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
            sudo dpkg -i cuda-keyring_1.1-1_all.deb
            sudo apt-get update
            sudo apt-get install -y cuda-toolkit-12-4
            
            # Add CUDA to PATH for current session
            export PATH=/usr/local/cuda/bin:$PATH
            export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
        fi
        print_success "CUDA installed"
    else
        print_error "CUDA toolkit is required for GPU acceleration"
        exit 1
    fi
}

check_cudnn() {
    print_step "Checking cuDNN..."
    
    # Check for cuDNN libs
    if ldconfig -p 2>/dev/null | grep -q "libcudnn.so.9"; then
        print_success "cuDNN 9 detected"
        return 0
    fi
    
    print_warning "cuDNN 9 not found (required for faster-whisper)"
    if confirm "Install cuDNN 9?"; then
        print_step "Installing cuDNN 9..."
        if [ "$DRY_RUN" = "false" ]; then
            sudo apt-get install -y libcudnn9-cuda-12 libcudnn9-dev-cuda-12
        fi
        print_success "cuDNN 9 installed"
    else
        print_error "cuDNN 9 is required for faster-whisper"
        exit 1
    fi
}

check_uv() {
    local uv_path="$HOME/.local/bin/uv"
    if command -v uv &>/dev/null || [ -f "$uv_path" ]; then
        if command -v uv &>/dev/null; then
            print_success "uv $(uv --version) detected"
        else
            print_success "uv detected in $uv_path"
            export PATH="$HOME/.local/bin:$PATH"
        fi
        return 0
    fi
    
    print_warning "uv not found"
    if confirm "Install uv package manager?"; then
        print_step "Installing uv..."
        if [ "$DRY_RUN" = "false" ]; then
            curl -LsSf https://astral.sh/uv/install.sh | sh
            export PATH="$HOME/.local/bin:$PATH"
        fi
        print_success "uv installed"
    else
        print_error "uv is required for fast dependency installation"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────
# Configuration Wizards
# ─────────────────────────────────────────────────────────────
select_stt_model() {
    local stt_model="${STT_MODEL:-}"
    if [ -n "$stt_model" ]; then
        print_info "Using STT model: $stt_model"
        STT_MODEL="$stt_model"
        return
    fi
    
    echo "" >&2
    print_info "Speech-to-Text Configuration"
    echo "" >&2
    echo "  Available Whisper models:" >&2
    echo "    1) large-v3        Best quality, ~3GB VRAM (recommended)" >&2
    echo "    2) large-v3-turbo  Faster, ~2GB VRAM" >&2
    echo "    3) medium          Balanced, ~1.5GB VRAM" >&2
    echo "    4) small           Fast, ~1GB VRAM" >&2
    echo "    5) base            Fastest, ~500MB VRAM" >&2
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
}

select_tts_voice() {
    local tts_voice="${TTS_VOICE:-}"
    if [ -n "$tts_voice" ]; then
        print_info "Using TTS voice: $tts_voice"
        TTS_VOICE="$tts_voice"
        return
    fi
    
    echo "" >&2
    print_info "Text-to-Speech Configuration (Kokoro)"
    echo "" >&2
    echo "  Available voices:" >&2
    echo "    American English:" >&2
    echo "      1) af_heart   (female, warm)" >&2
    echo "      2) af_bella   (female, expressive)" >&2
    echo "      3) af_nicole  (female, professional)" >&2
    echo "      4) af_sky     (female, bright)" >&2
    echo "      5) am_adam    (male, neutral)" >&2
    echo "      6) am_michael (male, deep)" >&2
    echo "    British English:" >&2
    echo "      7) bf_emma    (female, British)" >&2
    echo "      8) bm_george  (male, British)" >&2
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
}

select_ports() {
    STT_PORT="${STT_PORT:-8100}"
    TTS_PORT="${TTS_PORT:-8101}"
    
    echo "" >&2
    print_info "Service Ports"
    echo "" >&2
    
    STT_PORT="$(prompt_value "STT port" "$STT_PORT")"
    TTS_PORT="$(prompt_value "TTS port" "$TTS_PORT")"
    
    # Validate ports are numbers and different
    if [[ ! "$STT_PORT" =~ ^[0-9]+$ ]] || [[ ! "$TTS_PORT" =~ ^[0-9]+$ ]]; then
        print_error "Ports must be numbers"
        select_ports  # Retry
    fi
    
    if [ "$STT_PORT" = "$TTS_PORT" ]; then
        print_error "STT and TTS ports must be different"
        select_ports  # Retry
    fi
}

prompt_hf_token() {
    local hf_token="${HF_TOKEN:-}"
    if [ -n "$hf_token" ]; then
        print_info "Using HuggingFace token: ${hf_token:0:10}..."
        HF_TOKEN="$hf_token"
        return
    fi
    
    echo "" >&2
    print_info "HuggingFace Token (Optional)"
    echo "" >&2
    echo "  Some models may require authentication to download." >&2
    echo "  Get your token at: https://huggingface.co/settings/tokens" >&2
    echo "" >&2
    
    local token
    token="$(prompt_value "HuggingFace token (leave empty to skip)")"
    if [ -n "$token" ]; then
        if [[ "$token" == hf_* ]]; then
            HF_TOKEN="$token"
            print_success "HuggingFace token configured"
        else
            print_warning "Token should start with 'hf_' - using anyway"
            HF_TOKEN="$token"
        fi
    else
        HF_TOKEN=""
        print_info "Skipped (can be added later to .env)"
    fi
}

confirm_configuration() {
    local gpu_name="$(get_gpu_name "$detected_gpu")"
    
    echo "" >&2
    print_info "Configuration Summary"
    echo "" >&2
    echo "  STT Model:  $STT_MODEL" >&2
    echo "  TTS Voice:  $TTS_VOICE" >&2
    echo "  STT Port:   $STT_PORT" >&2
    echo "  TTS Port:   $TTS_PORT" >&2
    if [ -n "$HF_TOKEN" ]; then
        echo "  HF Token:   ${HF_TOKEN:0:10}..." >&2
    fi
    echo "  GPU:        $gpu_name" >&2
    echo "  Install to: $SPEECH_DIR" >&2
    echo "" >&2
    
    if ! confirm "Proceed with installation?" "y"; then
        print_info "Installation cancelled"
        exit 0
    fi
}

# ─────────────────────────────────────────────────────────────
# Installation Functions
# ─────────────────────────────────────────────────────────────
create_directories() {
    print_step "Creating directories..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo mkdir -p "$SPEECH_DIR"
        sudo chown "$USER:$USER" "$SPEECH_DIR"
    fi
    
    print_success "Created $SPEECH_DIR"
}

clone_repo() {
    print_step "Cloning repository..."
    
    local temp_dir
    temp_dir="$(mktemp -d)"
    
    if [ "$DRY_RUN" = "false" ]; then
        cd "$temp_dir"
        git clone "$REPO_URL" .
        
        # Copy service source code
        sudo mkdir -p "$SPEECH_DIR/src"
        sudo cp -r "services/stt/src" "$SPEECH_DIR/src/stt"
        sudo cp -r "services/tts/src" "$SPEECH_DIR/src/tts"
        sudo chown -R "$USER:$USER" "$SPEECH_DIR/src"
        
        # Create combined pyproject.toml
        cat > "$SPEECH_DIR/pyproject.toml" << EOF
[project]
name = "tiflis-speech-services"
version = "1.0.0"
description = "Tiflis Code STT and TTS services"
readme = "README.md"
requires-python = ">=3.11"
license = {text = "FSL-1.1-NC"}
authors = [{name = "Roman Barinov", email = "rbarinov@gmail.com"}]
dependencies = [
    # Shared
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "python-multipart>=0.0.12",
    "loguru>=0.7.0",
    "huggingface-hub>=0.20.0",
    
    # STT (faster-whisper for CUDA)
    "faster-whisper>=1.0.0",
    "numpy>=1.24.0",
    "soundfile>=0.12.0",
    "pydub>=0.25.0",
    "scipy>=1.10.0",
    
    # TTS (Kokoro)
    "kokoro>=0.1.0",
    
    # PyTorch with CUDA
    "torch>=2.0.0",
]

[project.optional-dependencies]
vad = ["silero-vad>=5.0"]
EOF
        
        # Cleanup temp dir
        cd ~
        rm -rf "$temp_dir"
    fi
    
    print_success "Repository cloned and source code copied"
}

create_venv() {
    print_step "Creating Python virtual environment..."
    
    if [ "$DRY_RUN" = "false" ]; then
        cd "$SPEECH_DIR"
        
        # Ensure uv is available
        export PATH="$HOME/.local/bin:$PATH"
        uv venv
        source venv/bin/activate
        
        # Install packages
        print_step "Installing Python packages (this may take a few minutes)..."
        uv pip install -e .
        
        # Download spacy model
        print_step "Downloading spacy English model..."
        venv/bin/python -m spacy download en_core_web_sm
        
        print_success "Python environment and packages installed"
    else
        print_info "DRY RUN: Would create venv and install packages in $SPEECH_DIR"
    fi
}

create_env_file() {
    print_step "Creating configuration file..."
    
    if [ "$DRY_RUN" = "false" ]; then
        local hf_token_line=""
        if [ -n "$HF_TOKEN" ]; then
            hf_token_line="HF_TOKEN=$HF_TOKEN"
        else
            hf_token_line="# HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx"
        fi
        
        cat > "$SPEECH_DIR/.env" << EOF
# Tiflis Code Speech Services Configuration
# Generated by install-speech-services.sh on $(date -Iseconds)

# ─────────────────────────────────────────────────────
# Speech-to-Text (STT) Configuration
# ─────────────────────────────────────────────────────
STT_HOST=0.0.0.0
STT_PORT=$STT_PORT
STT_MODEL=$STT_MODEL
STT_BACKEND=faster-whisper
STT_LOG_LEVEL=INFO

# ─────────────────────────────────────────────────────
# Text-to-Speech (TTS) Configuration
# ─────────────────────────────────────────────────────
TTS_HOST=0.0.0.0
TTS_PORT=$TTS_PORT
TTS_DEFAULT_VOICE=$TTS_VOICE
TTS_DEVICE=cuda
TTS_LOG_LEVEL=INFO

# ─────────────────────────────────────────────────────
# Shared Configuration
# ─────────────────────────────────────────────────────
$hf_token_line

# CUDA library path (if using pip-installed cuDNN)
# LD_LIBRARY_PATH=/opt/tiflis-code/speech/venv/lib/$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")/site-packages/nvidia/cudnn/lib
EOF
        
        chmod 600 "$SPEECH_DIR/.env"
    fi
    
    print_success "Configuration file created"
}

create_systemd_services() {
    print_step "Creating systemd services..."
    
    if [ "$DRY_RUN" = "false" ]; then
        # Create STT service
        sudo tee /etc/systemd/system/tiflis-stt.service > /dev/null << EOF
[Unit]
Description=Tiflis Code Speech-to-Text Service (Whisper)
Documentation=https://github.com/tiflis-io/tiflis-code
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$SPEECH_DIR
EnvironmentFile=$SPEECH_DIR/.env
ExecStart=$SPEECH_DIR/venv/bin/python -m uvicorn src.stt.main:app --host \${STT_HOST:-0.0.0.0} --port \${STT_PORT:-8100}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tiflis-stt

# Resource limits
LimitNOFILE=65536

# GPU access
Environment="CUDA_VISIBLE_DEVICES=0"

[Install]
WantedBy=multi-user.target
EOF
        
        # Create TTS service
        sudo tee /etc/systemd/system/tiflis-tts.service > /dev/null << EOF
[Unit]
Description=Tiflis Code Text-to-Speech Service (Kokoro)
Documentation=https://github.com/tiflis-io/tiflis-code
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$SPEECH_DIR
EnvironmentFile=$SPEECH_DIR/.env
ExecStart=$SPEECH_DIR/venv/bin/python -m uvicorn src.tts.main:app --host \${TTS_HOST:-0.0.0.0} --port \${TTS_PORT:-8101}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tiflis-tts

# Resource limits
LimitNOFILE=65536

# GPU access
Environment="CUDA_VISIBLE_DEVICES=0"

[Install]
WantedBy=multi-user.target
EOF
        
        # Reload systemd and enable services
        sudo systemctl daemon-reload
        sudo systemctl enable tiflis-stt tiflis-tts
        
        print_success "systemd services created and enabled"
    else
        print_info "DRY RUN: Would create systemd units for tiflis-stt and tiflis-tts"
    fi
}

start_services() {
    print_step "Starting services..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo systemctl start tiflis-stt tiflis-tts
        print_success "Services started"
    else
        print_info "DRY RUN: Would start tiflis-stt and tiflis-tts services"
    fi
}

# ─────────────────────────────────────────────────────────────
# Post-install verification
# ─────────────────────────────────────────────────────────────
wait_for_service() {
    local url="$1"
    local name="$2"
    local max_attempts="${3:-30}"
    local attempt=1
    
    print_step "Waiting for $name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            print_success "$name is ready"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_warning "$name did not become ready in time"
    return 1
}

print_success_summary() {
    local gpu_name="$(get_gpu_name "$detected_gpu")"
    
    echo "" >&2
    print_success "Speech services installed successfully!"
    echo "" >&2
    
    echo "  Service URLs:" >&2
    echo "    STT: http://localhost:$STT_PORT  (OpenAI-compatible /v1/audio/transcriptions)" >&2
    echo "    TTS: http://localhost:$TTS_PORT  (OpenAI-compatible /v1/audio/speech)" >&2
    echo "" >&2
    
    echo "  Health checks:" >&2
    echo "    curl http://localhost:$STT_PORT/health" >&2
    echo "    curl http://localhost:$TTS_PORT/v1/health" >&2
    echo "" >&2
    
    echo "  Service commands:" >&2
    echo "    Status:   sudo systemctl status tiflis-stt tiflis-tts" >&2
    echo "    Logs:     sudo journalctl -u tiflis-stt -u tiflis-tts -f" >&2
    echo "    Restart:  sudo systemctl restart tiflis-stt tiflis-tts" >&2
    echo "    Stop:     sudo systemctl stop tiflis-stt tiflis-tts" >&2
    echo "" >&2
    
    echo "  Configuration:" >&2
    echo "    $SPEECH_DIR/.env" >&2
    echo "" >&2
    
    echo "  Note: Models will be downloaded on first use:" >&2
    echo "    • Whisper $STT_MODEL (~3GB)" >&2
    echo "    • Kokoro TTS model (~500MB)" >&2
    echo "" >&2
    
    echo "  GPU: $gpu_name" >&2
}

# ─────────────────────────────────────────────────────────────
# Main Installation
# ─────────────────────────────────────────────────────────────
main() {
    echo "DEBUG: Entering main() function at $(date)" >> /tmp/tiflis_debug.log
    print_banner
    
    # Pre-flight checks
    local os arch
    os="$(detect_os)"
    arch="$(detect_arch)"
    
    print_step "Detecting platform... $os $arch"
    
    if [ "$os" != "linux" ] && [ "$os" != "wsl" ]; then
        print_error "This installer requires Linux/Ubuntu"
        exit 1
    fi
    
    if [ "$(detect_distro)" = "unknown" ]; then
        print_error "Unable to detect distribution"
        print_info "This installer supports Ubuntu/Debian-based distributions"
        exit 1
    fi
    
    # Check if running as root directly
    if [ "$EUID" -eq 0 ]; then
        print_error "Please run this installer as a normal user (not as root)"
        echo "  The installer will ask for sudo access when needed."
        exit 1
    fi
    
    # Check existing installation
    if [ -d "$SPEECH_DIR" ]; then
        print_warning "Existing installation detected at $SPEECH_DIR"
        print_info "For updates, run the update script instead"
        if ! confirm "Continue with reinstallation (will overwrite existing)?"; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Check GPU first
    local detected_gpu="$(detect_gpu)"
    local gpu_name="$(get_gpu_name "$detected_gpu")"
    
    if [ "$DRY_RUN" = "true" ]; then
        print_warning "Running in dry-run mode - no changes will be made"
        echo "" >&2
    fi
    
    print_success "Detected GPU: $gpu_name"
    
    # Check dependencies
    if [ "${SKIP_DEPS:-}" != "true" ]; then
        check_sudo_access
        echo "DEBUG: About to call check_python at $(date)" >> /tmp/tiflis_debug.log
        print_step "Checking Python..." >> /tmp/tiflis_debug.log
        check_python
        echo "DEBUG: Returned from check_python at $(date)" >> /tmp/tiflis_debug.log
        check_system_deps
        
        if [ "$detected_gpu" = "nvidia" ]; then
            check_nvidia_driver
            check_cuda
            check_cudnn
        fi
        
        check_uv
    fi
    
    # Configuration
    select_stt_model
    select_tts_voice
    select_ports
    prompt_hf_token
    confirm_configuration
    
    # Installation
    create_directories
    clone_repo
    create_venv
    create_env_file
    
    # System setup
    create_systemd_services
    start_services
    
    # Verification
    if [ "$DRY_RUN" != "true" ]; then
        wait_for_service "http://localhost:$STT_PORT/health" "STT service" 60
        wait_for_service "http://localhost:$TTS_PORT/v1/health" "TTS service" 60
    fi
    
    print_success_summary
}

main