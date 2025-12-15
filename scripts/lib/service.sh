#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# Service management utilities for Tiflis Code install scripts

# Required: source detect.sh and common.sh first

# ─────────────────────────────────────────────────────────────
# systemd Service Management
# ─────────────────────────────────────────────────────────────
create_systemd_service() {
    local service_name="$1"
    local description="$2"
    local exec_start="$3"
    local working_dir="$4"
    local env_file="$5"

    local service_file="/etc/systemd/system/${service_name}.service"

    print_step "Creating systemd service ${service_name}..."

    # Create service file
    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${working_dir}
EnvironmentFile=${env_file}
ExecStart=${exec_start}
Restart=always
RestartSec=10
StandardOutput=append:${working_dir}/logs/output.log
StandardError=append:${working_dir}/logs/error.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    # Create logs directory
    mkdir -p "${working_dir}/logs"

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable "$service_name"

    print_success "systemd service created: $service_name"
}

start_systemd_service() {
    local service_name="$1"

    print_step "Starting ${service_name}..."
    sudo systemctl start "$service_name"

    # Wait a bit and check status
    sleep 2
    if sudo systemctl is-active --quiet "$service_name"; then
        print_success "${service_name} is running"
        return 0
    else
        print_error "${service_name} failed to start"
        sudo systemctl status "$service_name" --no-pager
        return 1
    fi
}

stop_systemd_service() {
    local service_name="$1"

    if sudo systemctl is-active --quiet "$service_name"; then
        print_step "Stopping ${service_name}..."
        sudo systemctl stop "$service_name"
        print_success "${service_name} stopped"
    fi
}

remove_systemd_service() {
    local service_name="$1"
    local service_file="/etc/systemd/system/${service_name}.service"

    if [ -f "$service_file" ]; then
        stop_systemd_service "$service_name"
        sudo systemctl disable "$service_name" 2>/dev/null || true
        sudo rm -f "$service_file"
        sudo systemctl daemon-reload
        print_success "systemd service removed: $service_name"
    fi
}

# ─────────────────────────────────────────────────────────────
# launchd Service Management (macOS)
# ─────────────────────────────────────────────────────────────
create_launchd_service() {
    local service_name="$1"
    local label="$2"
    local description="$3"
    local program="$4"
    local working_dir="$5"
    local env_file="$6"

    local plist_file="$HOME/Library/LaunchAgents/${label}.plist"
    local log_dir="${working_dir}/logs"

    print_step "Creating launchd service ${label}..."

    # Create LaunchAgents directory if needed
    mkdir -p "$HOME/Library/LaunchAgents"
    mkdir -p "$log_dir"

    # Read environment file and build env dict
    local env_dict=""
    if [ -f "$env_file" ]; then
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            [[ "$key" =~ ^#.*$ ]] && continue
            [[ -z "$key" ]] && continue
            # Remove quotes from value
            value="${value%\"}"
            value="${value#\"}"
            env_dict+="        <key>${key}</key>
        <string>${value}</string>
"
        done < "$env_file"
    fi

    # Create plist file
    cat > "$plist_file" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>bash</string>
        <string>-c</string>
        <string>source ${env_file} &amp;&amp; exec ${program}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${working_dir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${log_dir}/output.log</string>
    <key>StandardErrorPath</key>
    <string>${log_dir}/error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
${env_dict}    </dict>
</dict>
</plist>
EOF

    print_success "launchd service created: $label"
}

start_launchd_service() {
    local label="$1"
    local plist_file="$HOME/Library/LaunchAgents/${label}.plist"

    print_step "Starting ${label}..."

    # Unload if already loaded (ignore errors)
    launchctl unload "$plist_file" 2>/dev/null || true

    # Load service
    launchctl load "$plist_file"

    # Wait and check
    sleep 2
    if launchctl list | grep -q "$label"; then
        print_success "${label} is running"
        return 0
    else
        print_error "${label} failed to start"
        return 1
    fi
}

stop_launchd_service() {
    local label="$1"
    local plist_file="$HOME/Library/LaunchAgents/${label}.plist"

    if launchctl list | grep -q "$label"; then
        print_step "Stopping ${label}..."
        launchctl unload "$plist_file" 2>/dev/null || true
        print_success "${label} stopped"
    fi
}

remove_launchd_service() {
    local label="$1"
    local plist_file="$HOME/Library/LaunchAgents/${label}.plist"

    stop_launchd_service "$label"
    if [ -f "$plist_file" ]; then
        rm -f "$plist_file"
        print_success "launchd service removed: $label"
    fi
}

# ─────────────────────────────────────────────────────────────
# Generic Service Functions
# ─────────────────────────────────────────────────────────────
setup_service() {
    local service_name="$1"
    local label="$2"
    local description="$3"
    local exec_start="$4"
    local working_dir="$5"
    local env_file="$6"

    local init_system
    init_system="$(detect_init)"

    case "$init_system" in
        systemd)
            create_systemd_service "$service_name" "$description" "$exec_start" "$working_dir" "$env_file"
            start_systemd_service "$service_name"
            ;;
        launchd)
            create_launchd_service "$service_name" "$label" "$description" "$exec_start" "$working_dir" "$env_file"
            start_launchd_service "$label"
            ;;
        *)
            print_warning "No supported init system detected. You'll need to run the service manually."
            print_info "Command: cd ${working_dir} && source ${env_file} && ${exec_start}"
            return 1
            ;;
    esac
}

stop_service() {
    local service_name="$1"
    local label="$2"

    local init_system
    init_system="$(detect_init)"

    case "$init_system" in
        systemd)
            stop_systemd_service "$service_name"
            ;;
        launchd)
            stop_launchd_service "$label"
            ;;
    esac
}

remove_service() {
    local service_name="$1"
    local label="$2"

    local init_system
    init_system="$(detect_init)"

    case "$init_system" in
        systemd)
            remove_systemd_service "$service_name"
            ;;
        launchd)
            remove_launchd_service "$label"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────
# Print Service Info
# ─────────────────────────────────────────────────────────────
print_service_commands() {
    local service_name="$1"
    local label="$2"
    local working_dir="$3"

    local init_system
    init_system="$(detect_init)"

    echo ""
    echo "  Commands:"
    case "$init_system" in
        systemd)
            echo "    Status:  sudo systemctl status $service_name"
            echo "    Logs:    sudo journalctl -u $service_name -f"
            echo "    Stop:    sudo systemctl stop $service_name"
            echo "    Start:   sudo systemctl start $service_name"
            echo "    Restart: sudo systemctl restart $service_name"
            ;;
        launchd)
            echo "    Status:  launchctl list | grep ${label}"
            echo "    Logs:    tail -f ${working_dir}/logs/output.log"
            echo "    Stop:    launchctl unload ~/Library/LaunchAgents/${label}.plist"
            echo "    Start:   launchctl load ~/Library/LaunchAgents/${label}.plist"
            ;;
        *)
            echo "    Manual:  cd ${working_dir} && node node_modules/@tiflis-io/*/dist/main.js"
            ;;
    esac
}
