#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Speech Services Uninstaller
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/uninstall-speech-services.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/uninstall-speech-services.sh | bash -s -- --dry-run

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
TIFLIS_INSTALL_DIR="${TIFLIS_INSTALL_DIR:-/opt/tiflis-code}"
SPEECH_DIR="${TIFLIS_INSTALL_DIR}/speech"

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

check_sudo_access() {
    if ! sudo -n true 2>/dev/null; then
        echo "" >&2
        echo -en "${COLOR_CYAN}?${COLOR_RESET} Enter password for sudo access:" >&2
        if ! sudo true; then
            print_error "Sudo access required for uninstallation"
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
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Speech Services Uninstaller"
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
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────
# Uninstallation Functions
# ─────────────────────────────────────────────────────────────
confirm_uninstall() {
    print_warning "This will remove Tiflis Code Speech Services"
    echo "" >&2
    echo "  The following will be removed:" >&2
    echo "    • $SPEECH_DIR/ (venv, source, config)" >&2
    echo "    • tiflis-stt.service" >&2
    echo "    • tiflis-tts.service" >&2
    echo "" >&2
    
    if ! confirm "Continue with uninstallation?"; then
        print_info "Uninstallation cancelled"
        exit 0
    fi
}

prompt_model_cache() {
    echo "" >&2
    print_info "Model Cache"
    echo "" >&2
    echo "  Downloaded models are stored in ~/.cache/huggingface/:" >&2
    echo "    • Whisper models (~3GB)" >&2
    echo "    • Kokoro TTS model (~500MB)" >&2
    echo "" >&2
    
    if confirm "Keep downloaded models in ~/.cache/huggingface?" "y"; then
        KEEP_CACHE=true
    else
        KEEP_CACHE=false
    fi
}

stop_services() {
    print_step "Stopping services..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo systemctl stop tiflis-stt tiflis-tts 2>/dev/null || true
        sudo systemctl disable tiflis-stt tiflis-tts 2>/dev/null || true
        print_success "Services stopped and disabled"
    else
        print_info "DRY RUN: Would stop and disable tiflis-stt and tiflis-tts"
    fi
}

remove_systemd_units() {
    print_step "Removing systemd unit files..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo rm -f /etc/systemd/system/tiflis-stt.service
        sudo rm -f /etc/systemd/system/tiflis-tts.service
        sudo systemctl daemon-reload
        sudo systemctl reset-failed tiflis-stt tiflis-tts 2>/dev/null || true
        print_success "systemd unit files removed"
    else
        print_info "DRY RUN: Would remove systemd unit files from /etc/systemd/system/"
    fi
}

remove_installation() {
    print_step "Removing installation directory..."
    
    if [ "$DRY_RUN" = "false" ]; then
        if [ -d "$SPEECH_DIR" ]; then
            sudo rm -rf "$SPEECH_DIR"
            # Also remove parent directory if it's empty
            if [ -d "$TIFLIS_INSTALL_DIR" ] && [ -z "$(ls -A "$TIFLIS_INSTALL_DIR" 2>/dev/null)" ]; then
                sudo rmdir "$TIFLIS_INSTALL_DIR" 2>/dev/null || true
            fi
            print_success "Installation directory removed"
        else
            print_warning "Installation directory not found at $SPEECH_DIR"
        fi
    else
        print_info "DRY RUN: Would remove $SPEECH_DIR"
    fi
}

remove_model_cache() {
    if [ "$KEEP_CACHE" != "true" ]; then
        print_step "Removing model cache..."
        
        if [ "$DRY_RUN" = "false" ]; then
            # Remove Whisper models
            rm -rf ~/.cache/huggingface/hub/models--*whisper* 2>/dev/null || true
            # Remove Kokoro model
            rm -rf ~/.cache/huggingface/hub/models--hexgrad* 2>/dev/null || true
            # Remove Tiflis-specific cache
            rm -rf ~/.cache/huggingface/hub/models--tiflis* 2>/dev/null || true
            print_success "Model cache removed"
        else
            print_info "DRY RUN: Would remove model cache from ~/.cache/huggingface/"
        fi
    else
        print_info "Keeping model cache at ~/.cache/huggingface/"
    fi
}

print_final_summary() {
    echo "" >&2
    print_success "Speech services uninstalled successfully"
    echo "" >&2
    
    print_info "The following were NOT removed (shared system components):"
    echo "" >&2
    echo "  • Python 3.11 (system package)" >&2
    echo "  • NVIDIA drivers and CUDA (system packages)" >&2
    echo "  • ffmpeg, espeak-ng, git, curl (system packages)" >&2
    echo "  • uv package manager" >&2
    
    if [ "$KEEP_CACHE" = "true" ]; then
        echo "  • Model cache (~${SPEECH_DIR}/.cache/huggingface)" >&2
    fi
    
    echo "" >&2
    print_info "To completely remove all traces:"
    echo "" >&2
    echo "  # Remove model cache (if you chose to keep it)" >&2
    echo "  rm -rf ~/.cache/huggingface/hub/models--*whisper*" >&2
    echo "  rm -rf ~/.cache/huggingface/hub/models--hexgrad*" >&2
    echo "" >&2
    echo "  # Remove system packages (if you want to remove them)" >&2
    echo "  sudo apt remove python3.11 ffmpeg espeak-ng" >&2
    echo "  # (CUDA and NVIDIA drivers removal requires more care)" >&2
}

# ─────────────────────────────────────────────────────────────
# Main Uninstallation
# ─────────────────────────────────────────────────────────────
main() {
    print_banner
    
    # Pre-flight checks
    if [ "$EUID" -eq 0 ]; then
        print_error "Please run this uninstaller as a normal user (not as root)"
        echo "  The uninstaller will ask for sudo access when needed."
        exit 1
    fi
    
    # Check if installed
    if [ ! -d "$SPEECH_DIR" ]; then
        print_warning "Speech services not installed at $SPEECH_DIR"
        echo "" >&2
        print_info "If you installed to a different location, delete it manually."
        print_info "To remove services (if they exist):"
        echo "  sudo systemctl stop tiflis-stt tiflis-tts" >&2
        echo "  sudo systemctl disable tiflis-stt tiflis-tts" >&2
        echo "  sudo rm /etc/systemd/system/tiflis-stt.service" >&2
        echo "  sudo rm /etc/systemd/system/tiflis-tts.service" >&2
        exit 1
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        print_warning "Running in dry-run mode - no changes will be made"
        echo "" >&2
    fi
    
    # Confirmation
    check_sudo_access
    confirm_uninstall
    prompt_model_cache
    
    # Uninstallation steps
    stop_services
    remove_systemd_units
    remove_installation
    remove_model_cache
    
    # Final summary
    print_final_summary
}

main