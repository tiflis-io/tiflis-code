#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Tiflis Code Tunnel Server Installer
#
# Usage:
#   curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash
#   curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --native
#   curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --dry-run
#
# Environment variables:
#   TIFLIS_TUNNEL_VERSION   - Version to install (default: latest)
#   TIFLIS_INSTALL_DIR      - Installation directory (default: ~/.tiflis-code)
#   TIFLIS_TUNNEL_PORT      - Port (default: 3001)
#   TIFLIS_TUNNEL_MODE      - docker | native (default: docker)
#   TUNNEL_REGISTRATION_API_KEY - API key (will prompt if not set)

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
TIFLIS_TUNNEL_VERSION="${TIFLIS_TUNNEL_VERSION:-latest}"
TIFLIS_INSTALL_DIR="${TIFLIS_INSTALL_DIR:-$HOME/.tiflis-code}"
TIFLIS_TUNNEL_PORT="${TIFLIS_TUNNEL_PORT:-3001}"
TIFLIS_TUNNEL_MODE="${TIFLIS_TUNNEL_MODE:-docker}"

TUNNEL_DIR="${TIFLIS_INSTALL_DIR}/tunnel"
PACKAGE_NAME="@tiflis-io/tiflis-code-tunnel"

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

# Colors
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

check_docker() {
    command -v docker &>/dev/null && docker info &>/dev/null 2>&1
}

check_docker_compose() {
    docker compose version &>/dev/null 2>&1 && echo "docker compose" && return 0
    command -v docker-compose &>/dev/null && echo "docker-compose" && return 0
    return 1
}

check_node() {
    local required="${1:-22}"
    command -v node &>/dev/null || return 1
    local ver="$(node --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"
    [ -n "$ver" ] && [ "$ver" -ge "$required" ]
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
    echo -e "       ${white}T I F L I S   C O D E${reset}  ${dim}·${reset}  Tunnel Installer"
    echo ""
}

# ─────────────────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────────────────
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --native)
            TIFLIS_TUNNEL_MODE="native"
            shift
            ;;
        --docker)
            TIFLIS_TUNNEL_MODE="docker"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --docker     Install using Docker Compose (default)"
            echo "  --native     Install using Node.js"
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
# Public IP Detection
# ─────────────────────────────────────────────────────────────
detect_public_ip() {
    local ip=""
    # Try multiple services for redundancy
    for service in "https://ifconfig.me" "https://api.ipify.org" "https://icanhazip.com" "https://ipecho.net/plain"; do
        ip=$(curl -sf --max-time 5 "$service" 2>/dev/null | tr -d '[:space:]')
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    return 1
}

# ─────────────────────────────────────────────────────────────
# DNS Verification
# ─────────────────────────────────────────────────────────────
check_dns_resolution() {
    local domain="$1"
    local expected_ip="$2"
    local resolved_ip=""

    # Query external DNS servers directly (bypass local resolver)
    if command -v dig &>/dev/null; then
        # Try Cloudflare DNS first, then Google DNS
        resolved_ip=$(dig +short "$domain" A @1.1.1.1 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        if [ -z "$resolved_ip" ]; then
            resolved_ip=$(dig +short "$domain" A @8.8.8.8 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        fi
    elif command -v host &>/dev/null; then
        resolved_ip=$(host "$domain" 1.1.1.1 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    elif command -v nslookup &>/dev/null; then
        resolved_ip=$(nslookup "$domain" 1.1.1.1 2>/dev/null | grep -A1 "Name:" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    fi

    if [ -z "$resolved_ip" ]; then
        echo "unresolved"
        return 1
    elif [ "$resolved_ip" = "$expected_ip" ]; then
        echo "$resolved_ip"
        return 0
    else
        echo "$resolved_ip"
        return 2
    fi
}

wait_for_dns() {
    local domain="$1"
    local expected_ip="$2"
    local max_attempts=30
    local attempt=0
    local check_interval=5

    echo "" >&2
    print_info "DNS Verification"
    echo "" >&2
    echo "  Domain:      $domain" >&2
    echo "  Expected IP: $expected_ip" >&2
    echo "" >&2
    print_info "Please create a DNS A record pointing $domain to $expected_ip"
    echo "" >&2

    if ! confirm "Wait for DNS propagation and verify?" "y"; then
        print_warning "Skipping DNS verification. Make sure DNS is configured before using HTTPS."
        return 0
    fi

    echo "" >&2
    print_step "Waiting for DNS propagation (checking every ${check_interval}s, max $((max_attempts * check_interval / 60)) min)..."

    while [ $attempt -lt $max_attempts ]; do
        local result
        result=$(check_dns_resolution "$domain" "$expected_ip")
        local status=$?

        case $status in
            0)
                echo "" >&2
                print_success "DNS verified! $domain resolves to $expected_ip"
                return 0
                ;;
            2)
                # Resolved but to wrong IP
                echo -e "  ${COLOR_YELLOW}⚠${COLOR_RESET} Attempt $((attempt + 1))/$max_attempts: $domain → $result (expected: $expected_ip)" >&2
                ;;
            *)
                # Not resolved yet
                echo -e "  ${COLOR_DIM}⏳${COLOR_RESET} Attempt $((attempt + 1))/$max_attempts: not resolved yet" >&2
                ;;
        esac

        attempt=$((attempt + 1))
        sleep $check_interval
    done

    echo "" >&2
    print_warning "DNS verification timed out after $((max_attempts * check_interval / 60)) minutes"

    local final_result
    final_result=$(check_dns_resolution "$domain" "$expected_ip")
    local final_status=$?

    if [ $final_status -eq 2 ]; then
        print_error "$domain resolves to $final_result instead of $expected_ip"
        print_info "Please check your DNS configuration"
    else
        print_info "$domain is not resolving yet. DNS propagation can take up to 48 hours."
    fi

    if confirm "Continue anyway?" "n"; then
        return 0
    else
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────
# Reverse Proxy Selection
# ─────────────────────────────────────────────────────────────
prompt_reverse_proxy() {
    echo "" >&2
    print_info "Reverse Proxy Setup"
    echo "" >&2
    echo "  1) None - Direct access (development/testing)" >&2
    echo "  2) Traefik - Automatic SSL with Let's Encrypt (recommended)" >&2
    echo "  3) nginx - Automatic SSL with Let's Encrypt (certbot)" >&2
    echo "" >&2

    local choice
    while true; do
        echo -en "${COLOR_CYAN}?${COLOR_RESET} Select: 1=None, 2=Traefik, 3=nginx: " >&2
        read -r choice < "$TTY_INPUT"
        case "$choice" in
            1) echo "none"; return ;;
            2) echo "traefik"; return ;;
            3) echo "nginx"; return ;;
            *) print_error "Please enter 1, 2, or 3" ;;
        esac
    done
}

# ─────────────────────────────────────────────────────────────
# Docker Mode Installation
# ─────────────────────────────────────────────────────────────
install_docker_mode() {
    print_step "Checking Docker..."

    if ! check_docker; then
        print_error "Docker is not installed or not running"
        print_info "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    local compose_cmd
    if ! compose_cmd=$(check_docker_compose); then
        print_error "Docker Compose is not installed"
        print_info "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi

    print_success "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) detected"

    # Create directory
    print_step "Creating directory ${TUNNEL_DIR}..."
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "${TUNNEL_DIR}"
    fi

    # Get or generate API key
    local api_key="${TUNNEL_REGISTRATION_API_KEY:-}"
    if [ -z "$api_key" ]; then
        if confirm "Generate a random API key?"; then
            api_key="$(generate_key 32)"
            print_success "Generated API key: ${api_key:0:8}..."
        else
            api_key="$(prompt_secret "Enter TUNNEL_REGISTRATION_API_KEY (min 32 chars)")"
        fi
    fi

    if [ ${#api_key} -lt 32 ]; then
        print_error "API key must be at least 32 characters"
        exit 1
    fi

    # Detect public IP
    print_step "Detecting public IP address..."
    local public_ip
    if public_ip=$(detect_public_ip); then
        print_success "Public IP detected: $public_ip"
    else
        print_warning "Could not auto-detect public IP"
        public_ip=""
    fi

    # Reverse proxy selection
    local reverse_proxy domain_name acme_email
    reverse_proxy="$(prompt_reverse_proxy)"

    if [ "$reverse_proxy" != "none" ]; then
        # Confirm or enter public IP
        echo ""
        if [ -n "$public_ip" ]; then
            local confirmed_ip
            confirmed_ip="$(prompt_value "Server public IP address" "$public_ip")"
            public_ip="$confirmed_ip"
        else
            public_ip="$(prompt_value "Server public IP address")"
        fi

        if [ -z "$public_ip" ]; then
            print_error "Public IP is required for reverse proxy setup"
            exit 1
        fi

        # Get domain name
        domain_name="$(prompt_value "Domain name (e.g., tunnel.example.com)")"
        if [ -z "$domain_name" ]; then
            print_error "Domain name is required for reverse proxy setup"
            exit 1
        fi

        # Wait for DNS verification
        wait_for_dns "$domain_name" "$public_ip"

        # Get email for Let's Encrypt (both traefik and nginx use it)
        acme_email="$(prompt_value "Email for Let's Encrypt SSL certificates")"
        if [ -z "$acme_email" ]; then
            print_error "Email is required for Let's Encrypt"
            exit 1
        fi
    fi

    # Create .env file
    print_step "Creating .env file..."
    if [ "$DRY_RUN" = "false" ]; then
        cat > "${TUNNEL_DIR}/.env" << EOF
# Tiflis Code Tunnel Server Configuration
# Generated by install script on $(date -Iseconds)

# Required: API key for workstation registration (min 32 chars)
TUNNEL_REGISTRATION_API_KEY=${api_key}

# Server settings
PORT=${TIFLIS_TUNNEL_PORT}
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
EOF

        if [ "$reverse_proxy" != "none" ]; then
            cat >> "${TUNNEL_DIR}/.env" << EOF

# Reverse proxy settings
TRUST_PROXY=true
PUBLIC_BASE_URL=wss://${domain_name}
EOF
        fi

        if [ "$reverse_proxy" = "traefik" ] || [ "$reverse_proxy" = "nginx" ]; then
            cat >> "${TUNNEL_DIR}/.env" << EOF

# Reverse proxy settings
DOMAIN=${domain_name}
ACME_EMAIL=${acme_email}
EOF
        fi

        chmod 600 "${TUNNEL_DIR}/.env"
    fi

    # Create docker-compose.yml based on reverse proxy choice
    print_step "Creating docker-compose.yml..."
    if [ "$DRY_RUN" = "false" ]; then
        case "$reverse_proxy" in
            traefik)
                create_docker_compose_traefik
                ;;
            nginx)
                create_docker_compose_nginx
                ;;
            *)
                create_docker_compose_basic
                ;;
        esac
    fi

    # Start containers
    print_step "Starting containers..."
    if [ "$DRY_RUN" = "false" ]; then
        cd "${TUNNEL_DIR}"

        if [ "$reverse_proxy" = "nginx" ]; then
            # For nginx, run the init-letsencrypt script which handles everything
            print_step "Provisioning SSL certificate via Let's Encrypt..."
            bash "${TUNNEL_DIR}/init-letsencrypt.sh"
        else
            $compose_cmd up -d

            # Wait for health check
            sleep 5
            if curl -sf "http://localhost:${TIFLIS_TUNNEL_PORT}/healthz" > /dev/null 2>&1; then
                print_success "Tunnel server is running!"
            else
                print_warning "Server started but health check failed. Check logs with: $compose_cmd logs"
            fi
        fi
    fi

    # Print success info
    echo ""
    print_success "Tunnel server installed successfully!"
    echo ""

    if [ "$reverse_proxy" = "none" ]; then
        echo "  URL:      http://localhost:${TIFLIS_TUNNEL_PORT}"
        echo "  Health:   http://localhost:${TIFLIS_TUNNEL_PORT}/healthz"
    else
        echo "  URL:      https://${domain_name}"
        echo "  WebSocket: wss://${domain_name}/ws"
        echo "  Health:   https://${domain_name}/healthz"
    fi

    echo "  API Key:  ${api_key:0:8}..."
    echo ""
    echo "  Commands:"
    echo "    Logs:    cd ${TUNNEL_DIR} && $compose_cmd logs -f"
    echo "    Stop:    cd ${TUNNEL_DIR} && $compose_cmd down"
    echo "    Start:   cd ${TUNNEL_DIR} && $compose_cmd up -d"
    echo ""

    if [ "$reverse_proxy" = "none" ]; then
        echo "  Next steps:"
        echo "    1. Configure DNS for your domain"
        echo "    2. Re-run installer with reverse proxy option for HTTPS"
        echo "    3. Install workstation: curl -fsSL https://code.tiflis.io/install-workstation.sh | bash"
    elif [ "$reverse_proxy" = "traefik" ]; then
        echo "  Next steps:"
        echo "    1. SSL certificate will be automatically provisioned by Let's Encrypt"
        echo "    2. Install workstation: curl -fsSL https://code.tiflis.io/install-workstation.sh | bash"
    elif [ "$reverse_proxy" = "nginx" ]; then
        echo "  Next steps:"
        echo "    1. Install workstation: curl -fsSL https://code.tiflis.io/install-workstation.sh | bash"
    fi
}

# ─────────────────────────────────────────────────────────────
# Docker Compose Templates
# ─────────────────────────────────────────────────────────────
create_docker_compose_basic() {
    cat > "${TUNNEL_DIR}/docker-compose.yml" << 'EOF'
services:
  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    container_name: tiflis-tunnel
    restart: unless-stopped
    ports:
      - "${PORT:-3001}:3001"
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/healthz').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
EOF
}

create_docker_compose_traefik() {
    cat > "${TUNNEL_DIR}/docker-compose.yml" << 'EOF'
services:
  traefik:
    image: traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.insecure=false"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entryPoints.web.address=:80"
      - "--entryPoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"

  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    container_name: tiflis-tunnel
    restart: unless-stopped
    env_file:
      - .env
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.tunnel.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.tunnel.entrypoints=websecure"
      - "traefik.http.routers.tunnel.tls.certresolver=letsencrypt"
      - "traefik.http.services.tunnel.loadbalancer.server.port=3001"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/healthz').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
EOF
}

create_docker_compose_nginx() {
    cat > "${TUNNEL_DIR}/docker-compose.yml" << 'EOF'
services:
  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "./nginx.conf:/etc/nginx/nginx.conf:ro"
      - "./certbot/conf:/etc/letsencrypt:ro"
      - "./certbot/www:/var/www/certbot:ro"
    depends_on:
      - tunnel
    command: '/bin/sh -c ''while :; do sleep 6h & wait $${!}; nginx -s reload; done & nginx -g "daemon off;"'''

  certbot:
    image: certbot/certbot
    container_name: certbot
    restart: unless-stopped
    volumes:
      - "./certbot/conf:/etc/letsencrypt"
      - "./certbot/www:/var/www/certbot"
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    container_name: tiflis-tunnel
    restart: unless-stopped
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/healthz').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
EOF

    # Create nginx config (initial - HTTP only for certificate provisioning)
    cat > "${TUNNEL_DIR}/nginx.conf" << 'NGINX_EOF'
events {
    worker_connections 1024;
}

http {
    upstream tunnel {
        server tunnel:3001;
    }

    # HTTP server - ACME challenge and redirect
    server {
        listen 80;
        server_name _;

        # Let's Encrypt ACME challenge
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect all other traffic to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL certificates from certbot
        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

        # SSL settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;

        # WebSocket endpoint
        location /ws {
            proxy_pass http://tunnel;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # Health and API endpoints
        location / {
            proxy_pass http://tunnel;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
NGINX_EOF

    # Replace ${DOMAIN} placeholder in nginx.conf
    sed -i.bak "s/\${DOMAIN}/${domain_name}/g" "${TUNNEL_DIR}/nginx.conf"
    rm -f "${TUNNEL_DIR}/nginx.conf.bak"

    # Create certbot directories
    mkdir -p "${TUNNEL_DIR}/certbot/conf"
    mkdir -p "${TUNNEL_DIR}/certbot/www"

    # Create initial certificate provisioning script
    cat > "${TUNNEL_DIR}/init-letsencrypt.sh" << INIT_EOF
#!/bin/bash
# Initial Let's Encrypt certificate provisioning for nginx
# Run this script once after starting the containers

set -e

domain="${domain_name}"
email="${acme_email}"
staging=0  # Set to 1 for testing to avoid rate limits

echo "→ Requesting Let's Encrypt certificate for \$domain..."

# Create dummy certificate for nginx to start
if [ ! -f "${TUNNEL_DIR}/certbot/conf/live/\$domain/fullchain.pem" ]; then
    echo "→ Creating dummy certificate..."
    mkdir -p "${TUNNEL_DIR}/certbot/conf/live/\$domain"
    docker compose run --rm --entrypoint "\
        openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
        -keyout '/etc/letsencrypt/live/\$domain/privkey.pem' \
        -out '/etc/letsencrypt/live/\$domain/fullchain.pem' \
        -subj '/CN=localhost'" certbot
fi

echo "→ Starting nginx..."
docker compose up -d nginx

echo "→ Deleting dummy certificate..."
docker compose run --rm --entrypoint "\
    rm -rf /etc/letsencrypt/live/\$domain && \
    rm -rf /etc/letsencrypt/archive/\$domain && \
    rm -rf /etc/letsencrypt/renewal/\$domain.conf" certbot

echo "→ Requesting real certificate..."
staging_arg=""
if [ \$staging -eq 1 ]; then
    staging_arg="--staging"
fi

docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
    \$staging_arg \
    --email \$email \
    --agree-tos \
    --no-eff-email \
    -d \$domain" certbot

echo "→ Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "✓ Certificate provisioned successfully!"
echo ""
echo "Your tunnel is now available at: https://\$domain"
INIT_EOF

    chmod +x "${TUNNEL_DIR}/init-letsencrypt.sh"
}

# ─────────────────────────────────────────────────────────────
# Native Mode Installation
# ─────────────────────────────────────────────────────────────
install_native_mode() {
    print_step "Checking Node.js..."

    if ! check_node 22; then
        print_error "Node.js >= 22 is required"
        print_info "Install from: https://nodejs.org or use nvm/volta"
        exit 1
    fi

    print_success "Node.js $(node --version) detected"

    # Create directory
    print_step "Creating directory ${TUNNEL_DIR}..."
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "${TUNNEL_DIR}/logs"
    fi

    # Get or generate API key
    local api_key="${TUNNEL_REGISTRATION_API_KEY:-}"
    if [ -z "$api_key" ]; then
        if confirm "Generate a random API key?"; then
            api_key="$(generate_key 32)"
            print_success "Generated API key: ${api_key:0:8}..."
        else
            api_key="$(prompt_secret "Enter TUNNEL_REGISTRATION_API_KEY (min 32 chars)")"
        fi
    fi

    if [ ${#api_key} -lt 32 ]; then
        print_error "API key must be at least 32 characters"
        exit 1
    fi

    # Create .env file
    print_step "Creating .env file..."
    if [ "$DRY_RUN" = "false" ]; then
        cat > "${TUNNEL_DIR}/.env" << EOF
# Tiflis Code Tunnel Server Configuration
TUNNEL_REGISTRATION_API_KEY=${api_key}
PORT=${TIFLIS_TUNNEL_PORT}
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
EOF
        chmod 600 "${TUNNEL_DIR}/.env"
    fi

    # Install npm package
    print_step "Installing ${PACKAGE_NAME}..."
    if [ "$DRY_RUN" = "false" ]; then
        cd "${TUNNEL_DIR}"
        npm init -y > /dev/null 2>&1
        npm install "${PACKAGE_NAME}@${TIFLIS_TUNNEL_VERSION}"
    fi

    # Create systemd/launchd service
    local os init_system
    os="$(detect_os)"

    case "$os" in
        darwin)
            init_system="launchd"
            ;;
        linux|wsl)
            init_system="systemd"
            ;;
        *)
            init_system="none"
            ;;
    esac

    if [ "$init_system" = "systemd" ]; then
        print_step "Creating systemd service..."
        if [ "$DRY_RUN" = "false" ]; then
            sudo tee /etc/systemd/system/tiflis-tunnel.service > /dev/null << EOF
[Unit]
Description=Tiflis Code Tunnel Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${TUNNEL_DIR}
EnvironmentFile=${TUNNEL_DIR}/.env
ExecStart=$(which node) ${TUNNEL_DIR}/node_modules/${PACKAGE_NAME}/dist/main.js
Restart=always
RestartSec=10
StandardOutput=append:${TUNNEL_DIR}/logs/output.log
StandardError=append:${TUNNEL_DIR}/logs/error.log

[Install]
WantedBy=multi-user.target
EOF
            sudo systemctl daemon-reload
            sudo systemctl enable tiflis-tunnel
            sudo systemctl start tiflis-tunnel

            sleep 2
            if sudo systemctl is-active --quiet tiflis-tunnel; then
                print_success "Tunnel server is running!"
            else
                print_warning "Service created but may not be running. Check: sudo systemctl status tiflis-tunnel"
            fi
        fi
    elif [ "$init_system" = "launchd" ]; then
        print_step "Creating launchd service..."
        if [ "$DRY_RUN" = "false" ]; then
            mkdir -p "$HOME/Library/LaunchAgents"
            cat > "$HOME/Library/LaunchAgents/io.tiflis.tunnel.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.tiflis.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>bash</string>
        <string>-c</string>
        <string>source ${TUNNEL_DIR}/.env &amp;&amp; exec $(which node) ${TUNNEL_DIR}/node_modules/${PACKAGE_NAME}/dist/main.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${TUNNEL_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${TUNNEL_DIR}/logs/output.log</string>
    <key>StandardErrorPath</key>
    <string>${TUNNEL_DIR}/logs/error.log</string>
</dict>
</plist>
EOF
            launchctl unload "$HOME/Library/LaunchAgents/io.tiflis.tunnel.plist" 2>/dev/null || true
            launchctl load "$HOME/Library/LaunchAgents/io.tiflis.tunnel.plist"

            sleep 2
            if launchctl list | grep -q io.tiflis.tunnel; then
                print_success "Tunnel server is running!"
            else
                print_warning "Service created but may not be running"
            fi
        fi
    fi

    # Print success info
    echo ""
    print_success "Tunnel server installed successfully!"
    echo ""
    echo "  URL:      http://localhost:${TIFLIS_TUNNEL_PORT}"
    echo "  Health:   http://localhost:${TIFLIS_TUNNEL_PORT}/healthz"
    echo "  API Key:  ${api_key:0:8}..."
    echo ""

    if [ "$init_system" = "systemd" ]; then
        echo "  Commands:"
        echo "    Status:  sudo systemctl status tiflis-tunnel"
        echo "    Logs:    sudo journalctl -u tiflis-tunnel -f"
        echo "    Stop:    sudo systemctl stop tiflis-tunnel"
        echo "    Start:   sudo systemctl start tiflis-tunnel"
    elif [ "$init_system" = "launchd" ]; then
        echo "  Commands:"
        echo "    Status:  launchctl list | grep tiflis"
        echo "    Logs:    tail -f ${TUNNEL_DIR}/logs/output.log"
        echo "    Stop:    launchctl unload ~/Library/LaunchAgents/io.tiflis.tunnel.plist"
        echo "    Start:   launchctl load ~/Library/LaunchAgents/io.tiflis.tunnel.plist"
    fi

    echo ""
    echo "  Next steps:"
    echo "    1. Configure DNS for your domain"
    echo "    2. Enable HTTPS with nginx or Traefik"
    echo "    3. Install workstation: curl -fsSL https://code.tiflis.io/install-workstation.sh | bash"
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

    if [ "$DRY_RUN" = "true" ]; then
        print_warning "Running in dry-run mode - no changes will be made"
        echo ""
    fi

    case "$TIFLIS_TUNNEL_MODE" in
        docker)
            install_docker_mode
            ;;
        native)
            install_native_mode
            ;;
        *)
            print_error "Unknown mode: $TIFLIS_TUNNEL_MODE"
            exit 1
            ;;
    esac
}

main
