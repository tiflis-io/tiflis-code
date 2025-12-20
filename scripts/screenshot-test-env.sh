#!/bin/bash
# Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.
#
# screenshot-test-env.sh
# Manages isolated test environment for automated screenshot generation.
#
# Usage:
#   ./scripts/screenshot-test-env.sh setup    # Create isolated environment
#   ./scripts/screenshot-test-env.sh start    # Start tunnel + workstation
#   ./scripts/screenshot-test-env.sh stop     # Stop servers and cleanup
#   ./scripts/screenshot-test-env.sh status   # Check if servers are running

set -e

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Session ID file (persists across commands)
SESSION_FILE="/tmp/tiflis-screenshot-session"

# Default ports range (random selection)
MIN_PORT=10000
MAX_PORT=60000

# ─────────────────────────────────────────────────────────────
# Utility Functions
# ─────────────────────────────────────────────────────────────

log() {
  echo "[screenshot-test-env] $1"
}

error() {
  echo "[screenshot-test-env] ERROR: $1" >&2
  exit 1
}

generate_session_id() {
  uuidgen | cut -c1-8 | tr '[:upper:]' '[:lower:]'
}

get_random_port() {
  echo $((MIN_PORT + RANDOM % (MAX_PORT - MIN_PORT)))
}

wait_for_port() {
  local port=$1
  local max_attempts=30
  local attempt=0

  while ! nc -z localhost "$port" 2>/dev/null; do
    sleep 0.5
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
      error "Timeout waiting for port $port"
    fi
  done
}

load_session() {
  if [ -f "$SESSION_FILE" ]; then
    source "$SESSION_FILE"
    return 0
  fi
  return 1
}

save_session() {
  cat > "$SESSION_FILE" << EOF
TEST_SESSION_ID="$TEST_SESSION_ID"
TEST_PORT="$TEST_PORT"
WORKSTATION_PORT="$WORKSTATION_PORT"
TEST_ROOT="$TEST_ROOT"
TUNNEL_PID="$TUNNEL_PID"
WORKSTATION_PID="$WORKSTATION_PID"
EOF
}

# ─────────────────────────────────────────────────────────────
# Setup Command
# ─────────────────────────────────────────────────────────────

cmd_setup() {
  log "Setting up isolated test environment..."

  # Generate session ID and ports
  TEST_SESSION_ID=$(generate_session_id)
  TEST_PORT=$(get_random_port)
  WORKSTATION_PORT=$((TEST_PORT + 1))
  TEST_ROOT="/tmp/tiflis-test-${TEST_SESSION_ID}"

  log "Session ID: $TEST_SESSION_ID"
  log "Tunnel Port: $TEST_PORT"
  log "Workstation Port: $WORKSTATION_PORT"
  log "Root: $TEST_ROOT"

  # Create directory structure
  mkdir -p "${TEST_ROOT}"/{db,workspaces/demo-project/src,fixtures,logs}

  # Create demo project files
  create_demo_project

  # Copy fixtures from workstation package (if built)
  local fixtures_src="${PROJECT_ROOT}/packages/workstation/dist/infrastructure/mock/fixtures"
  if [ -d "$fixtures_src" ]; then
    cp -r "$fixtures_src"/* "${TEST_ROOT}/fixtures/" 2>/dev/null || true
  fi

  # Also copy from source (for development)
  local fixtures_src_dev="${PROJECT_ROOT}/packages/workstation/src/infrastructure/mock/fixtures"
  if [ -d "$fixtures_src_dev" ]; then
    cp -r "$fixtures_src_dev"/* "${TEST_ROOT}/fixtures/" 2>/dev/null || true
  fi

  # Generate connection config
  generate_connection_config

  # Save session
  save_session

  log "Environment setup complete!"
  log "Run './scripts/screenshot-test-env.sh start' to start servers"
}

create_demo_project() {
  local demo_dir="${TEST_ROOT}/workspaces/demo-project"

  # Create package.json
  cat > "${demo_dir}/package.json" << 'EOF'
{
  "name": "demo-project",
  "version": "1.0.0",
  "description": "Demo project for screenshot automation",
  "main": "src/main.ts",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
EOF

  # Create main.ts
  cat > "${demo_dir}/src/main.ts" << 'EOF'
/**
 * Demo Project - Main Entry
 * This is a sample TypeScript project for screenshot automation.
 */

interface Config {
  port: number;
  host: string;
}

const config: Config = {
  port: 3000,
  host: 'localhost',
};

async function main(): Promise<void> {
  console.log(`Starting server on ${config.host}:${config.port}`);
  // Server implementation would go here
}

main().catch(console.error);
EOF

  # Create README
  cat > "${demo_dir}/README.md" << 'EOF'
# Demo Project

This is a demo project for Tiflis Code screenshot automation.

## Getting Started

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Start: `npm run start`
EOF

  # Initialize git repo (for worktree features)
  cd "${demo_dir}" && git init -q && git add -A && git commit -q -m "Initial commit" 2>/dev/null || true
}

generate_connection_config() {
  local api_key="test-key-${TEST_SESSION_ID}-32-characters!!"
  local auth_key="test-auth-${TEST_SESSION_ID}"

  # Create connection.env for test scripts
  cat > "${TEST_ROOT}/connection.env" << EOF
# Test Environment Connection Config
# Generated: $(date -Iseconds)

# iOS Simulator / macOS (use localhost)
TEST_TUNNEL_URL="ws://localhost:${TEST_PORT}/ws"

# Android Emulator (use 10.0.2.2 which maps to host's localhost)
ANDROID_TUNNEL_URL="ws://10.0.2.2:${TEST_PORT}/ws"

TEST_API_KEY="${api_key}"
TEST_AUTH_KEY="${auth_key}"
TEST_TUNNEL_ID="test-tunnel-${TEST_SESSION_ID}"
TEST_PORT="${TEST_PORT}"
EOF

  # Create magic link data
  local magic_link_json=$(cat << EOF
{
  "tunnel_id": "test-tunnel-${TEST_SESSION_ID}",
  "url": "ws://localhost:${TEST_PORT}/ws",
  "key": "${auth_key}"
}
EOF
)
  local magic_link_base64=$(echo -n "$magic_link_json" | base64 | tr -d '\n')

  echo "TEST_MAGIC_LINK=\"tiflis://connect?data=${magic_link_base64}\"" >> "${TEST_ROOT}/connection.env"

  log "Connection config saved to ${TEST_ROOT}/connection.env"
}

# ─────────────────────────────────────────────────────────────
# Start Command
# ─────────────────────────────────────────────────────────────

cmd_start() {
  if ! load_session; then
    error "No session found. Run 'setup' first."
  fi

  log "Starting servers for session $TEST_SESSION_ID..."

  # Check if already running
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    log "Tunnel server already running (PID: $TUNNEL_PID)"
  else
    start_tunnel
  fi

  if [ -n "$WORKSTATION_PID" ] && kill -0 "$WORKSTATION_PID" 2>/dev/null; then
    log "Workstation server already running (PID: $WORKSTATION_PID)"
  else
    start_workstation
  fi

  save_session

  log "Servers started!"
  log "Tunnel:      http://localhost:${TEST_PORT}"
  log "Workstation: Connected to tunnel"
  log ""
  log "Connection config: ${TEST_ROOT}/connection.env"
}

start_tunnel() {
  local api_key="test-key-${TEST_SESSION_ID}-32-characters!!"

  log "Starting tunnel server on port $TEST_PORT..."

  PORT="${TEST_PORT}" \
  TUNNEL_REGISTRATION_API_KEY="${api_key}" \
  NODE_ENV="development" \
  node "${PROJECT_ROOT}/packages/tunnel/dist/main.js" \
    > "${TEST_ROOT}/logs/tunnel.log" 2>&1 &

  TUNNEL_PID=$!

  # Wait for tunnel to be ready
  wait_for_port "$TEST_PORT"

  log "Tunnel started (PID: $TUNNEL_PID)"
}

start_workstation() {
  local api_key="test-key-${TEST_SESSION_ID}-32-characters!!"
  local auth_key="test-auth-${TEST_SESSION_ID}"

  log "Starting workstation in mock mode on port $WORKSTATION_PORT..."

  PORT="${WORKSTATION_PORT}" \
  TUNNEL_URL="ws://localhost:${TEST_PORT}/ws" \
  TUNNEL_API_KEY="${api_key}" \
  WORKSTATION_AUTH_KEY="${auth_key}" \
  WORKSTATION_NAME="Screenshot-Test" \
  WORKSPACES_ROOT="${TEST_ROOT}/workspaces" \
  DATA_DIR="${TEST_ROOT}/db" \
  MOCK_MODE="true" \
  MOCK_FIXTURES_PATH="${TEST_ROOT}/fixtures" \
  NODE_ENV="development" \
  LOG_LEVEL="info" \
  node "${PROJECT_ROOT}/packages/workstation/dist/main.js" \
    > "${TEST_ROOT}/logs/workstation.log" 2>&1 &

  WORKSTATION_PID=$!

  # Wait for workstation to be ready
  wait_for_port "$WORKSTATION_PORT"

  log "Workstation started in mock mode (PID: $WORKSTATION_PID)"

  # Extract the actual tunnel ID from the workstation log
  # The workstation logs: Registered with tunnel ... tunnelId: "..."
  local max_attempts=30
  local attempt=0
  local actual_tunnel_id=""

  while [ -z "$actual_tunnel_id" ] && [ $attempt -lt $max_attempts ]; do
    sleep 0.5
    attempt=$((attempt + 1))
    # Look for the tunnel ID in the log
    actual_tunnel_id=$(grep -o 'tunnelId[^"]*"[^"]*"' "${TEST_ROOT}/logs/workstation.log" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
  done

  if [ -n "$actual_tunnel_id" ]; then
    log "Extracted actual tunnel ID: $actual_tunnel_id"
    # Update connection.env with the actual tunnel ID
    sed -i.bak "s/TEST_TUNNEL_ID=.*/TEST_TUNNEL_ID=\"${actual_tunnel_id}\"/" "${TEST_ROOT}/connection.env"
    rm -f "${TEST_ROOT}/connection.env.bak"
  else
    log "WARNING: Could not extract tunnel ID from workstation log"
  fi
}

# ─────────────────────────────────────────────────────────────
# Stop Command
# ─────────────────────────────────────────────────────────────

cmd_stop() {
  log "Stopping servers..."

  if load_session; then
    # Stop workstation
    if [ -n "$WORKSTATION_PID" ]; then
      kill "$WORKSTATION_PID" 2>/dev/null && log "Stopped workstation (PID: $WORKSTATION_PID)" || true
    fi

    # Stop tunnel
    if [ -n "$TUNNEL_PID" ]; then
      kill "$TUNNEL_PID" 2>/dev/null && log "Stopped tunnel (PID: $TUNNEL_PID)" || true
    fi

    # Cleanup session file
    rm -f "$SESSION_FILE"

    log "Servers stopped."
  else
    log "No active session found."
  fi
}

# ─────────────────────────────────────────────────────────────
# Cleanup Command
# ─────────────────────────────────────────────────────────────

cmd_cleanup() {
  log "Cleaning up test environment..."

  # Stop servers first
  cmd_stop 2>/dev/null || true

  # Remove test directory
  if load_session 2>/dev/null && [ -n "$TEST_ROOT" ] && [ -d "$TEST_ROOT" ]; then
    rm -rf "$TEST_ROOT"
    log "Removed test directory: $TEST_ROOT"
  fi

  # Remove session file
  rm -f "$SESSION_FILE"

  # Clean up any orphaned test directories
  for dir in /tmp/tiflis-test-*; do
    if [ -d "$dir" ]; then
      rm -rf "$dir"
      log "Cleaned up orphaned directory: $dir"
    fi
  done

  log "Cleanup complete."
}

# ─────────────────────────────────────────────────────────────
# Status Command
# ─────────────────────────────────────────────────────────────

cmd_status() {
  if ! load_session; then
    log "No active session."
    exit 0
  fi

  echo "Session: $TEST_SESSION_ID"
  echo "Root:    $TEST_ROOT"
  echo "Port:    $TEST_PORT"
  echo ""

  # Check tunnel
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Tunnel:      RUNNING (PID: $TUNNEL_PID)"
  else
    echo "Tunnel:      STOPPED"
  fi

  # Check workstation
  if [ -n "$WORKSTATION_PID" ] && kill -0 "$WORKSTATION_PID" 2>/dev/null; then
    echo "Workstation: RUNNING (PID: $WORKSTATION_PID)"
  else
    echo "Workstation: STOPPED"
  fi

  echo ""
  echo "Connection config: ${TEST_ROOT}/connection.env"

  # Show connection details
  if [ -f "${TEST_ROOT}/connection.env" ]; then
    echo ""
    echo "Connection Details:"
    cat "${TEST_ROOT}/connection.env" | grep -v "^#" | grep -v "^$"
  fi
}

# ─────────────────────────────────────────────────────────────
# Logs Command
# ─────────────────────────────────────────────────────────────

cmd_logs() {
  if ! load_session; then
    error "No active session."
  fi

  local log_type="${1:-all}"

  case "$log_type" in
    tunnel)
      tail -f "${TEST_ROOT}/logs/tunnel.log"
      ;;
    workstation)
      tail -f "${TEST_ROOT}/logs/workstation.log"
      ;;
    all)
      tail -f "${TEST_ROOT}/logs/"*.log
      ;;
    *)
      error "Unknown log type: $log_type (use: tunnel, workstation, all)"
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────
# Android Instructions Command
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Collect Command - Copy screenshots to assets folder
# ─────────────────────────────────────────────────────────────

cmd_collect() {
  local platform="${1:-all}"
  local assets_dir="${PROJECT_ROOT}/assets/screenshots"

  log "Collecting screenshots to ${assets_dir}..."

  case "$platform" in
    ios)
      collect_ios_screenshots
      ;;
    android)
      collect_android_screenshots
      ;;
    watch)
      collect_watch_screenshots
      ;;
    all)
      collect_ios_screenshots
      collect_android_screenshots
      collect_watch_screenshots
      ;;
    *)
      error "Unknown platform: $platform (use: ios, android, watch, all)"
      ;;
  esac

  log "Screenshot collection complete!"
}

collect_ios_screenshots() {
  local src="${PROJECT_ROOT}/apps/TiflisCode/screenshots/en-US"
  local dest="${PROJECT_ROOT}/assets/screenshots/appstore/iphone-6.5"

  if [ -d "$src" ] && [ "$(ls -A "$src" 2>/dev/null)" ]; then
    mkdir -p "$dest"
    cp "$src"/*.png "$dest/" 2>/dev/null || true
    log "iOS screenshots copied to appstore/iphone-6.5/"
    ls -la "$dest"
  else
    log "No iOS screenshots found at $src"
  fi
}

collect_android_screenshots() {
  local dest="${PROJECT_ROOT}/assets/screenshots/playstore/phone"

  # Try to pull from connected Android device/emulator
  if command -v adb &> /dev/null && adb devices | grep -q "device$"; then
    log "Pulling screenshots from Android device..."
    mkdir -p "$dest"
    adb pull /sdcard/Pictures/screenshots/ /tmp/android-screenshots/ 2>/dev/null || true

    if [ -d "/tmp/android-screenshots" ] && [ "$(ls -A /tmp/android-screenshots 2>/dev/null)" ]; then
      cp /tmp/android-screenshots/*.png "$dest/" 2>/dev/null || true
      rm -rf /tmp/android-screenshots
      log "Android screenshots copied to playstore/phone/"
      ls -la "$dest"
    else
      log "No screenshots found on Android device"
    fi
  else
    log "No Android device connected. Skipping Android screenshot collection."
  fi
}

collect_watch_screenshots() {
  local src="${PROJECT_ROOT}/apps/TiflisCode/screenshots/watch"
  local dest_45="${PROJECT_ROOT}/assets/screenshots/appstore/watch-45mm"
  local dest_41="${PROJECT_ROOT}/assets/screenshots/appstore/watch-41mm"

  if [ -d "$src" ] && [ "$(ls -A "$src" 2>/dev/null)" ]; then
    # For now, copy to both sizes (can be refined based on simulator used)
    mkdir -p "$dest_45" "$dest_41"
    cp "$src"/*.png "$dest_45/" 2>/dev/null || true
    log "Watch screenshots copied to appstore/watch-45mm/"
    ls -la "$dest_45"
  else
    log "No Watch screenshots found at $src"
    log "Run Watch UI tests with TiflisCodeWatch scheme in Xcode first."
  fi
}

cmd_android_instructions() {
  if ! load_session 2>/dev/null; then
    log "No active session. Run 'setup' and 'start' first."
    log ""
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║           Android Screenshot Test Instructions               ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "1. Start the test environment:"
  echo "   ./scripts/screenshot-test-env.sh setup"
  echo "   ./scripts/screenshot-test-env.sh start"
  echo ""
  echo "2. Start Android emulator (ensure it's running)"
  echo "   # The emulator should be API 30+ for screenshot support"
  echo ""
  echo "3. Run the screenshot tests:"
  echo "   cd apps/TiflisCodeAndroid"

  if [ -n "$TEST_PORT" ]; then
    local auth_key="test-auth-${TEST_SESSION_ID}"
    echo ""
    echo "   # With current session (port ${TEST_PORT}):"
    echo "   ./gradlew connectedAndroidTest \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.class=io.tiflis.code.ScreenshotTest \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.screenshotTest=true \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.tunnelUrl=ws://10.0.2.2:${TEST_PORT}/ws \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.authKey=${auth_key}"
    echo ""
  else
    echo ""
    echo "   # Default (uses port 3001):"
    echo "   ./gradlew connectedAndroidTest \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.class=io.tiflis.code.ScreenshotTest \\"
    echo "     -Pandroid.testInstrumentationRunnerArguments.screenshotTest=true"
    echo ""
  fi

  echo "4. Pull screenshots from device:"
  echo "   adb pull /sdcard/Pictures/screenshots ./screenshots"
  echo ""
  echo "5. Stop the test environment:"
  echo "   ./scripts/screenshot-test-env.sh stop"
  echo ""

  if [ -n "$TEST_PORT" ]; then
    echo "Current connection config:"
    echo "  Port: ${TEST_PORT}"
    echo "  Tunnel URL: ws://10.0.2.2:${TEST_PORT}/ws"
    echo "  Auth Key: test-auth-${TEST_SESSION_ID}"
    echo "  (10.0.2.2 maps to host localhost from Android emulator)"
    echo ""
  fi
}

# ─────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────

case "${1:-help}" in
  setup)
    cmd_setup
    ;;
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  cleanup)
    cmd_cleanup
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs "$2"
    ;;
  android)
    cmd_android_instructions
    ;;
  collect)
    cmd_collect "$2"
    ;;
  help|--help|-h)
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup    Create isolated test environment"
    echo "  start    Start tunnel and workstation servers"
    echo "  stop     Stop servers"
    echo "  cleanup  Stop servers and remove test directory"
    echo "  status   Show current status"
    echo "  logs     Tail server logs (tunnel|workstation|all)"
    echo "  collect  Copy screenshots to assets folder (ios|android|watch|all)"
    echo "  android  Show Android test instructions"
    echo ""
    echo "Example workflow for iOS:"
    echo "  $0 setup    # Create environment"
    echo "  $0 start    # Start servers"
    echo "  # Run iOS screenshot tests in Xcode..."
    echo "  $0 stop     # Stop servers"
    echo "  $0 cleanup  # Clean up"
    echo ""
    echo "For Android, run: $0 android"
    ;;
  *)
    error "Unknown command: $1 (use --help for usage)"
    ;;
esac
