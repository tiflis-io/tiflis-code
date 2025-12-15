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
    echo "  1) OpenAI Whisper"
    echo "  2) Deepgram"
    echo "  3) Skip"
    echo ""

    local stt_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select STT provider [1-3, default: 3]: " >&2
    read -r stt_choice < "$TTY_INPUT"

    case "$stt_choice" in
        1)
            STT_PROVIDER="openai"
            STT_MODEL="whisper-1"
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
            STT_API_KEY="$(prompt_secret "Enter Deepgram API key")"
            if [ -n "$STT_API_KEY" ]; then
                print_success "STT configured: ${STT_PROVIDER} (${STT_MODEL})"
            else
                STT_PROVIDER=""
            fi
            ;;
        *)
            STT_PROVIDER=""
            print_info "STT skipped"
            ;;
    esac

    # Text-to-Speech
    echo ""
    print_info "Text-to-Speech (TTS)"
    echo ""
    echo "  1) OpenAI (tts-1)"
    echo "  2) ElevenLabs"
    echo "  3) Skip"
    echo ""

    local tts_choice
    echo -en "${COLOR_CYAN}?${COLOR_RESET} Select TTS provider [1-3, default: 3]: " >&2
    read -r tts_choice < "$TTY_INPUT"

    case "$tts_choice" in
        1)
            TTS_PROVIDER="openai"
            TTS_MODEL="tts-1"
            TTS_VOICE="nova"
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
        *)
            TTS_PROVIDER=""
            print_info "TTS skipped"
            ;;
    esac

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
                cat >> "${WORKSTATION_DIR}/.env" << EOF

# Speech-to-Text
STT_PROVIDER=${STT_PROVIDER}
STT_API_KEY=${STT_API_KEY}
STT_MODEL=${STT_MODEL}
EOF
            else
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# Speech-to-Text (optional)
# STT_PROVIDER=openai
# STT_API_KEY=your-openai-key
EOF
            fi

            # Add TTS configuration if provided
            if [ -n "$TTS_PROVIDER" ]; then
                cat >> "${WORKSTATION_DIR}/.env" << EOF

# Text-to-Speech
TTS_PROVIDER=${TTS_PROVIDER}
TTS_API_KEY=${TTS_API_KEY}
TTS_MODEL=${TTS_MODEL}
TTS_VOICE=${TTS_VOICE}
EOF
            else
                cat >> "${WORKSTATION_DIR}/.env" << 'EOF'

# Text-to-Speech (optional)
# TTS_PROVIDER=openai
# TTS_API_KEY=your-openai-key
# TTS_VOICE=nova
EOF
            fi

            chmod 600 "${WORKSTATION_DIR}/.env"
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
        if [ "$skip_config" = "true" ]; then
            # Update mode: just restart the service
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
        if [ "$skip_config" = "true" ]; then
            # Update mode: just restart the service
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
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/v22.*/bin</string>
    </dict>
</dict>
</plist>
EOF
                launchctl bootout "gui/$(id -u)/io.tiflis.workstation" 2>/dev/null || true
                launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.tiflis.workstation.plist"

                sleep 3
                if launchctl list | grep -q io.tiflis.workstation; then
                    print_success "Workstation server is running!"
                else
                    print_warning "Service created but may not be running"
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
        echo "  Commands:"
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
    elif [ "$init_system" = "launchd" ]; then
        echo "  Commands:"
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
    fi

    echo ""
    echo "  Configuration: ${WORKSTATION_DIR}/.env"
    echo "  Data:          ${WORKSTATION_DIR}/data/"
    echo "  Logs:          ${WORKSTATION_DIR}/logs/"
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
