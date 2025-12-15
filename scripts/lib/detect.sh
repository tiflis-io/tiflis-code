#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Platform detection utilities for Tiflis Code install scripts

# ─────────────────────────────────────────────────────────────
# OS Detection
# ─────────────────────────────────────────────────────────────
detect_os() {
    local os
    os="$(uname -s)"

    case "$os" in
        Linux*)
            # Check if running in WSL
            if grep -qi microsoft /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        Darwin*)
            echo "darwin"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Architecture Detection
# ─────────────────────────────────────────────────────────────
detect_arch() {
    local arch
    arch="$(uname -m)"

    case "$arch" in
        x86_64|amd64)
            echo "x86_64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        armv7l)
            echo "armv7"
            ;;
        *)
            echo "$arch"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Init System Detection
# ─────────────────────────────────────────────────────────────
detect_init() {
    local os
    os="$(detect_os)"

    case "$os" in
        darwin)
            echo "launchd"
            ;;
        linux|wsl)
            if command -v systemctl &>/dev/null && systemctl --version &>/dev/null 2>&1; then
                echo "systemd"
            else
                echo "none"
            fi
            ;;
        *)
            echo "none"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Linux Distribution Detection
# ─────────────────────────────────────────────────────────────
detect_distro() {
    if [ -f /etc/os-release ]; then
        # shellcheck source=/dev/null
        . /etc/os-release
        echo "${ID:-unknown}"
    elif command -v lsb_release &>/dev/null; then
        lsb_release -is | tr '[:upper:]' '[:lower:]'
    else
        echo "unknown"
    fi
}

# ─────────────────────────────────────────────────────────────
# Docker Detection
# ─────────────────────────────────────────────────────────────
check_docker() {
    if ! command -v docker &>/dev/null; then
        return 1
    fi

    # Check if Docker daemon is running
    if ! docker info &>/dev/null 2>&1; then
        return 2
    fi

    return 0
}

check_docker_compose() {
    # Try docker compose (v2)
    if docker compose version &>/dev/null 2>&1; then
        echo "docker compose"
        return 0
    fi

    # Try docker-compose (v1)
    if command -v docker-compose &>/dev/null; then
        echo "docker-compose"
        return 0
    fi

    return 1
}

get_docker_version() {
    docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

# ─────────────────────────────────────────────────────────────
# Node.js Detection
# ─────────────────────────────────────────────────────────────
check_node() {
    local required_major="${1:-22}"

    if ! command -v node &>/dev/null; then
        return 1
    fi

    local node_version
    node_version="$(node --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"

    if [ -z "$node_version" ] || [ "$node_version" -lt "$required_major" ]; then
        return 2
    fi

    return 0
}

get_node_version() {
    node --version 2>/dev/null | sed 's/^v//'
}

check_npm() {
    command -v npm &>/dev/null
}

# ─────────────────────────────────────────────────────────────
# Build Tools Detection
# ─────────────────────────────────────────────────────────────
check_build_tools() {
    local os
    os="$(detect_os)"

    case "$os" in
        darwin)
            # Check for Xcode Command Line Tools
            if xcode-select -p &>/dev/null 2>&1; then
                return 0
            fi
            return 1
            ;;
        linux|wsl)
            # Check for essential build tools
            if command -v gcc &>/dev/null && command -v make &>/dev/null; then
                return 0
            fi
            return 1
            ;;
        *)
            return 1
            ;;
    esac
}

check_python() {
    command -v python3 &>/dev/null || command -v python &>/dev/null
}

# ─────────────────────────────────────────────────────────────
# Print Platform Info
# ─────────────────────────────────────────────────────────────
print_platform_info() {
    local os arch init

    os="$(detect_os)"
    arch="$(detect_arch)"
    init="$(detect_init)"

    echo "OS: $os"
    echo "Arch: $arch"
    echo "Init: $init"

    if [ "$os" = "linux" ] || [ "$os" = "wsl" ]; then
        echo "Distro: $(detect_distro)"
    fi
}
