#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Common utilities for Tiflis Code install scripts

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────
readonly COLOR_RESET="\033[0m"
readonly COLOR_RED="\033[0;31m"
readonly COLOR_GREEN="\033[0;32m"
readonly COLOR_YELLOW="\033[0;33m"
readonly COLOR_BLUE="\033[0;34m"
readonly COLOR_PURPLE="\033[0;35m"
readonly COLOR_CYAN="\033[0;36m"
readonly COLOR_WHITE="\033[0;37m"
readonly COLOR_DIM="\033[2m"
readonly COLOR_BOLD="\033[1m"

# ─────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────
print_step() {
    echo -e "${COLOR_CYAN}→${COLOR_RESET} $1"
}

print_success() {
    echo -e "${COLOR_GREEN}✓${COLOR_RESET} $1"
}

print_error() {
    echo -e "${COLOR_RED}✗${COLOR_RESET} $1" >&2
}

print_warning() {
    echo -e "${COLOR_YELLOW}⚠${COLOR_RESET} $1"
}

print_info() {
    echo -e "${COLOR_DIM}$1${COLOR_RESET}"
}

# ─────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────
print_banner() {
    local component="$1"
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
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  ${component} Installer"
    echo ""
}

# ─────────────────────────────────────────────────────────────
# User interaction
# ─────────────────────────────────────────────────────────────
prompt_value() {
    local prompt="$1"
    local default="${2:-}"
    local value

    if [ -n "$default" ]; then
        read -rp "$(echo -e "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [${default}]: ")" value
        echo "${value:-$default}"
    else
        read -rp "$(echo -e "${COLOR_CYAN}?${COLOR_RESET} ${prompt}: ")" value
        echo "$value"
    fi
}

prompt_secret() {
    local prompt="$1"
    local value

    read -rsp "$(echo -e "${COLOR_CYAN}?${COLOR_RESET} ${prompt}: ")" value
    echo ""
    echo "$value"
}

confirm() {
    local prompt="$1"
    local default="${2:-n}"
    local yn

    if [ "$default" = "y" ]; then
        read -rp "$(echo -e "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [Y/n]: ")" yn
        case "$yn" in
            [Nn]*) return 1 ;;
            *) return 0 ;;
        esac
    else
        read -rp "$(echo -e "${COLOR_CYAN}?${COLOR_RESET} ${prompt} [y/N]: ")" yn
        case "$yn" in
            [Yy]*) return 0 ;;
            *) return 1 ;;
        esac
    fi
}

# ─────────────────────────────────────────────────────────────
# Security helpers
# ─────────────────────────────────────────────────────────────
generate_key() {
    local length="${1:-32}"

    if command -v openssl &>/dev/null; then
        openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c "$length"
    elif [ -r /dev/urandom ]; then
        LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$length"
    else
        print_error "Cannot generate secure random key"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────
# File helpers
# ─────────────────────────────────────────────────────────────
ensure_dir() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
    fi
}

create_env_file() {
    local file="$1"
    shift

    # Create file with restricted permissions
    touch "$file"
    chmod 600 "$file"

    # Write variables
    for var in "$@"; do
        echo "$var" >> "$file"
    done
}

backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        cp "$file" "${file}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
}

# ─────────────────────────────────────────────────────────────
# Dry run mode
# ─────────────────────────────────────────────────────────────
DRY_RUN="${DRY_RUN:-false}"

run_cmd() {
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${COLOR_DIM}[dry-run] $*${COLOR_RESET}"
    else
        "$@"
    fi
}

# ─────────────────────────────────────────────────────────────
# Cleanup on exit
# ─────────────────────────────────────────────────────────────
cleanup() {
    # Override this function in main script if needed
    :
}

trap cleanup EXIT
