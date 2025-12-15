#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Node.js installation helpers for Tiflis Code install scripts

# Required: source detect.sh and common.sh first

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────
readonly NODE_REQUIRED_VERSION=22
readonly NODE_LTS_VERSION="22"

# ─────────────────────────────────────────────────────────────
# Node.js Installation
# ─────────────────────────────────────────────────────────────
install_node_nvm() {
    print_step "Installing Node.js via nvm..."

    # Install nvm
    if [ ! -d "$HOME/.nvm" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi

    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Install Node.js
    nvm install "$NODE_LTS_VERSION"
    nvm use "$NODE_LTS_VERSION"

    print_success "Node.js $(node --version) installed via nvm"
}

install_node_volta() {
    print_step "Installing Node.js via volta..."

    # Install volta
    if ! command -v volta &>/dev/null; then
        curl https://get.volta.sh | bash
    fi

    # Add volta to PATH for current session
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"

    # Install Node.js
    volta install node@${NODE_LTS_VERSION}

    print_success "Node.js $(node --version) installed via volta"
}

install_node_package_manager() {
    local os distro

    os="$(detect_os)"
    distro="$(detect_distro)"

    case "$os" in
        darwin)
            if command -v brew &>/dev/null; then
                print_step "Installing Node.js via Homebrew..."
                brew install node@${NODE_LTS_VERSION}
                brew link node@${NODE_LTS_VERSION} --force --overwrite
                print_success "Node.js installed via Homebrew"
            else
                install_node_nvm
            fi
            ;;
        linux|wsl)
            case "$distro" in
                ubuntu|debian)
                    print_step "Installing Node.js via NodeSource..."
                    curl -fsSL https://deb.nodesource.com/setup_${NODE_LTS_VERSION}.x | sudo -E bash -
                    sudo apt-get install -y nodejs
                    print_success "Node.js installed via NodeSource"
                    ;;
                fedora|rhel|centos)
                    print_step "Installing Node.js via NodeSource..."
                    curl -fsSL https://rpm.nodesource.com/setup_${NODE_LTS_VERSION}.x | sudo bash -
                    sudo dnf install -y nodejs
                    print_success "Node.js installed via NodeSource"
                    ;;
                arch)
                    print_step "Installing Node.js via pacman..."
                    sudo pacman -S --noconfirm nodejs npm
                    print_success "Node.js installed via pacman"
                    ;;
                *)
                    install_node_nvm
                    ;;
            esac
            ;;
        *)
            print_error "Unsupported OS for automatic Node.js installation"
            return 1
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Build Tools Installation
# ─────────────────────────────────────────────────────────────
install_build_tools() {
    local os distro

    os="$(detect_os)"
    distro="$(detect_distro)"

    case "$os" in
        darwin)
            if ! xcode-select -p &>/dev/null 2>&1; then
                print_step "Installing Xcode Command Line Tools..."
                xcode-select --install
                print_info "Please complete the Xcode installation and re-run this script."
                return 1
            fi
            print_success "Xcode Command Line Tools already installed"
            ;;
        linux|wsl)
            case "$distro" in
                ubuntu|debian)
                    print_step "Installing build-essential..."
                    sudo apt-get update
                    sudo apt-get install -y build-essential python3
                    print_success "Build tools installed"
                    ;;
                fedora|rhel|centos)
                    print_step "Installing Development Tools..."
                    sudo dnf groupinstall -y "Development Tools"
                    sudo dnf install -y python3
                    print_success "Build tools installed"
                    ;;
                arch)
                    print_step "Installing base-devel..."
                    sudo pacman -S --noconfirm base-devel python
                    print_success "Build tools installed"
                    ;;
                *)
                    print_warning "Please install build tools manually (gcc, make, python3)"
                    return 1
                    ;;
            esac
            ;;
        *)
            print_error "Unsupported OS for build tools installation"
            return 1
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# npm Package Installation
# ─────────────────────────────────────────────────────────────
install_npm_package() {
    local package="$1"
    local install_dir="$2"
    local max_retries=3
    local retry=0

    print_step "Installing $package..."

    cd "$install_dir" || return 1

    # Initialize package.json if not exists
    if [ ! -f package.json ]; then
        npm init -y > /dev/null 2>&1
    fi

    while [ $retry -lt $max_retries ]; do
        if npm install "$package" 2>&1; then
            print_success "$package installed successfully"
            return 0
        fi

        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            print_warning "Install failed, retrying ($retry/$max_retries)..."
            sleep 2
        fi
    done

    print_error "Failed to install $package after $max_retries attempts"
    return 1
}

# ─────────────────────────────────────────────────────────────
# Check and ensure Node.js
# ─────────────────────────────────────────────────────────────
ensure_node() {
    if check_node "$NODE_REQUIRED_VERSION"; then
        print_success "Node.js $(get_node_version) detected"
        return 0
    fi

    print_warning "Node.js >= $NODE_REQUIRED_VERSION required"

    if confirm "Install Node.js automatically?"; then
        if confirm "Use nvm (recommended for development)?"; then
            install_node_nvm
        else
            install_node_package_manager
        fi

        # Verify installation
        if check_node "$NODE_REQUIRED_VERSION"; then
            return 0
        else
            print_error "Node.js installation failed"
            return 1
        fi
    else
        print_error "Node.js is required. Please install manually:"
        print_info "  - nvm: https://github.com/nvm-sh/nvm"
        print_info "  - volta: https://volta.sh"
        print_info "  - Official: https://nodejs.org"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────
# Check and ensure build tools
# ─────────────────────────────────────────────────────────────
ensure_build_tools() {
    if check_build_tools; then
        local os
        os="$(detect_os)"
        case "$os" in
            darwin)
                print_success "Xcode CLI tools detected"
                ;;
            *)
                print_success "Build tools detected"
                ;;
        esac
        return 0
    fi

    print_warning "Build tools required for native modules"

    if confirm "Install build tools automatically?"; then
        install_build_tools
    else
        local os
        os="$(detect_os)"
        print_error "Build tools required. Please install manually:"
        case "$os" in
            darwin)
                print_info "  xcode-select --install"
                ;;
            linux|wsl)
                print_info "  Ubuntu/Debian: sudo apt install build-essential python3"
                print_info "  Fedora/RHEL: sudo dnf groupinstall 'Development Tools'"
                ;;
        esac
        return 1
    fi
}
