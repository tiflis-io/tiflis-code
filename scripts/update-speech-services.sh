#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
# https://github.com/tiflis-io/tiflis-code
#
# Tiflis Code Speech Services Updater
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/update-speech-services.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/update-speech-services.sh | bash -s -- --dry-run

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
            print_error "Sudo access required for update"
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
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Speech Services Updater"
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
# Version and Update Functions
# ─────────────────────────────────────────────────────────────
get_installed_version() {
    if [ -f "$SPEECH_DIR/VERSION" ]; then
        cat "$SPEECH_DIR/VERSION"
    else
        echo "unknown"
    fi
}

get_latest_version() {
    # For now, we'll use a simple approach - just return "latest"
    # In a real implementation, you might fetch from GitHub API
    echo "latest"
}

check_for_updates() {
    print_step "Checking for updates..."
    
    local current_version
    current_version="$(get_installed_version)"
    
    local latest_version
    latest_version="$(get_latest_version)"
    
    echo "" >&2
    print_info "Version Information:"
    echo "" >&2
    echo "  Current:  $current_version" >&2
    echo "  Available: $latest_version" >&2
    echo "" >&2
    
    if [ "$current_version" = "$latest_version" ]; then
        print_info "You already have the latest version"
        if ! confirm "Update anyway?"; then
            print_info "Update cancelled"
            exit 0
        fi
    fi
    
    return 0
}

backup_configuration() {
    print_step "Backing up configuration..."
    
    if [ "$DRY_RUN" = "false" ]; then
        if [ -f "$SPEECH_DIR/.env" ]; then
            local backup_file="$SPEECH_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$SPEECH_DIR/.env" "$backup_file"
            print_success "Configuration backed up to $(basename "$backup_file")"
        else
            print_warning "No configuration file found"
        fi
    else
        print_info "DRY RUN: Would backup .env file"
    fi
}

stop_services() {
    print_step "Stopping services..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo systemctl stop tiflis-stt tiflis-tts 2>/dev/null || true
        print_success "Services stopped"
    else
        print_info "DRY RUN: Would stop tiflis-stt and tiflis-tts"
    fi
}

update_source_code() {
    print_step "Updating source code..."
    
    local temp_dir
    temp_dir="$(mktemp -d)"
    
    if [ "$DRY_RUN" = "false" ]; then
        trap "rm -rf $temp_dir" EXIT
        
        cd "$temp_dir"
        git clone "$REPO_URL" .
        
        # Update service source code
        sudo rm -rf "$SPEECH_DIR/src/stt"
        sudo rm -rf "$SPEECH_DIR/src/tts"
        sudo cp -r "services/stt/src" "$SPEECH_DIR/src/stt"
        sudo cp -r "services/tts/src" "$SPEECH_DIR/src/tts"
        sudo chown -R "$USER:$USER" "$SPEECH_DIR/src"
        
        # Update version file
        echo "$(get_latest_version)" | sudo tee "$SPEECH_DIR/VERSION" >/dev/null
        
        print_success "Source code updated"
    else
        print_info "DRY RUN: Would update source code from $REPO_URL"
    fi
}

update_dependencies() {
    print_step "Updating Python dependencies..."
    
    if [ "$DRY_RUN" = "false" ]; then
        cd "$SPEECH_DIR"
        
        # Ensure uv is available
        export PATH="$HOME/.local/bin:$PATH"
        
        # Update venv packages
        venv/bin/uv pip install -e .
        
        print_success "Dependencies updated"
    else
        print_info "DRY RUN: Would update Python dependencies"
    fi
}

start_services() {
    print_step "Starting services..."
    
    if [ "$DRY_RUN" = "false" ]; then
        sudo systemctl start tiflis-stt tiflis-tts
        print_success "Services started"
    else
        print_info "DRY RUN: Would start tiflis-stt and tiflis-tts"
    fi
}

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

print_update_summary() {
    echo "" >&2
    print_success "Speech services updated successfully!"
    echo "" >&2
    
    print_info "What was updated:"
    echo "" >&2
    echo "  • Source code (services/stt & services/tts)" >&2
    echo "  • Python dependencies" >&2
    echo "  • Version tracking" >&2
    echo "" >&2
    
    print_info "Configuration and models preserved:" >&2
    echo "" >&2
    echo "  • ~/.env configuration" >&2
    echo "  • Downloaded models (~/.cache/huggingface/)" >&2
    echo "" >&2
    
    print_info "Service commands:" >&2
    echo "" >&2
    echo "  Status:   sudo systemctl status tiflis-stt tiflis-tts" >&2
    echo "  Logs:     sudo journalctl -u tiflis-stt -u tiflis-tts -f" >&2
    echo "  Restart:  sudo systemctl restart tiflis-stt tiflis-tts" >&2
    echo "" >&2
}

# ─────────────────────────────────────────────────────────────
# Main Update
# ─────────────────────────────────────────────────────────────
main() {
    print_banner
    
    # Pre-flight checks
    if [ "$EUID" -eq 0 ]; then
        print_error "Please run this updater as a normal user (not as root)"
        echo "  The updater will ask for sudo access when needed."
        exit 1
    fi
    
    # Check if installed
    if [ ! -d "$SPEECH_DIR" ]; then
        print_error "Speech services not installed at $SPEECH_DIR"
        print_info "Please run the installer first:"
        echo "  curl -fsSL https://raw.githubusercontent.com/tiflis-io/tiflis-code/main/scripts/install-speech-services.sh | bash" >&2
        exit 1
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        print_warning "Running in dry-run mode - no changes will be made"
        echo "" >&2
    fi
    
    # Update steps
    check_sudo_access
    check_for_updates
    
    print_warning "Note: Services will be briefly stopped during update" >&2
    echo "" >&2
    
    if ! confirm "Proceed with update?" "y"; then
        print_info "Update cancelled"
        exit 0
    fi
    
    # Update process
    backup_configuration
    stop_services
    update_source_code
    update_dependencies
    start_services
    
    # Verification
    if [ "$DRY_RUN" != "true" ]; then
        # Get ports from existing .env
        local stt_port="8100"
        local tts_port="8101"
        
        if [ -f "$SPEECH_DIR/.env" ]; then
            stt_port=$(grep "^STT_PORT=" "$SPEECH_DIR/.env" | cut -d'=' -f2 || echo "8100")
            tts_port=$(grep "^TTS_PORT=" "$SPEECH_DIR/.env" | cut -d'=' -f2 || echo "8101")
        fi
        
        wait_for_service "http://localhost:$stt_port/health" "STT service" 60
        wait_for_service "http://localhost:$tts_port/v1/health" "TTS service" 60
    fi
    
    print_update_summary
}

main