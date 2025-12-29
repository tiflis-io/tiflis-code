# Local Development Setup

> Complete guide for setting up and running all components locally.

**Last Updated:** 2025-12-30

---

## Prerequisites

### Required Software

| Software    | Version         | Purpose                              |
| ----------- | --------------- | ------------------------------------ |
| **macOS**   | 15.0+ (Sequoia) | Required for iOS/watchOS development |
| **Xcode**   | 16.1+           | iOS/watchOS builds, simulators       |
| **Node.js** | 22 LTS          | TypeScript server runtime            |
| **pnpm**    | 9.0+            | Package manager                      |
| **Docker**  | Latest          | Optional: containerized testing      |
| **Git**     | 2.40+           | Version control                      |

### Xcode Command Line Tools

```bash
xcode-select --install
```

### Node.js Setup (via nvm)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Install Node.js 22 LTS
nvm install 22
nvm use 22
nvm alias default 22

# Enable pnpm via corepack
corepack enable
corepack prepare pnpm@latest --activate
```

---

## Clone and Install

```bash
# Clone repository
git clone git@github.com:tiflis-io/tiflis-code.git
cd tiflis-code

# Install TypeScript dependencies
pnpm install

# Build all packages
pnpm build
```

---

## Running TypeScript Components

### Terminal 1: Tunnel Server

```bash
cd packages/tunnel

# Create local environment
cp .env.example .env.local

# Edit .env.local:
# TUNNEL_REGISTRATION_API_KEY=dev-api-key-32-chars-minimum!!
# PORT=3001
# LOG_LEVEL=debug

# Run in development mode
pnpm dev
```

The tunnel server will be available at `ws://localhost:3001/ws`.

### Terminal 2: Workstation Server

```bash
cd packages/workstation

# Create local environment
cp .env.example .env.local

# Edit .env.local:
# TUNNEL_URL=ws://localhost:3001/ws
# TUNNEL_API_KEY=dev-api-key-32-chars-minimum!!
# WORKSTATION_AUTH_KEY=dev-workstation-key
# WORKSPACES_ROOT=/Users/yourname/work
# LOG_LEVEL=debug

# Run in development mode
pnpm dev
```

### Running Both with Turborepo

```bash
# From repository root
pnpm dev

# This runs both servers in parallel with proper log prefixes
```

### Web Client Development

The web client is bundled with the tunnel server and served as static files:

```bash
# The web client is automatically built when running:
cd packages/tunnel && pnpm build

# Access at: http://localhost:3001/ (or your tunnel URL)

# For web client development with hot reload:
cd packages/web
pnpm dev  # Runs Next.js dev server on http://localhost:3002
```

**Note:** In production, the web client is bundled into the tunnel server's Docker image and served at the root path.

---

## iOS/watchOS Development

### Opening the Project

```bash
open apps/TiflisCode/TiflisCode.xcodeproj
```

### Required Simulators

Install via Xcode → Settings → Platforms:

| Platform    | Simulator                    | Minimum OS    |
| ----------- | ---------------------------- | ------------- |
| **iOS**     | iPhone 16 Pro                | iOS 18.0+     |
| **iOS**     | iPhone 16 Pro Max            | iOS 18.0+     |
| **iOS**     | iPad Pro 13" (M4)            | iPadOS 18.0+  |
| **watchOS** | Apple Watch Ultra 2          | watchOS 11.0+ |
| **watchOS** | Apple Watch Series 10 (46mm) | watchOS 11.0+ |

**Primary Configuration:**

- iPhone 16 Pro Simulator (iOS 18.x)
- Apple Watch Ultra 2 Simulator (paired)

### Pairing iOS and watchOS Simulators

```bash
# List available simulators
xcrun simctl list devices

# Verify paired devices
xcrun simctl list pairs
```

**In Xcode:**

1. Select `TiflisCode` scheme → Choose iPhone simulator
2. Select `TiflisCodeWatch` scheme → Choose paired Watch simulator
3. Run iPhone app first, then Watch app
4. WatchConnectivity will automatically sync configuration

### Running on Simulators

**Xcode UI:** Select scheme → Select destination → Press ⌘R

**Command Line:**

```bash
# Build and run iOS app
xcodebuild build \
  -project apps/TiflisCode/TiflisCode.xcodeproj \
  -scheme TiflisCode \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -configuration Debug

# Launch in simulator
xcrun simctl boot "iPhone 16 Pro"
xcrun simctl install "iPhone 16 Pro" build/Debug-iphonesimulator/TiflisCode.app
xcrun simctl launch "iPhone 16 Pro" io.tiflis.TiflisCode
```

### Connecting iOS Simulator to Local Servers

| Setting    | Value                    |
| ---------- | ------------------------ |
| Tunnel URL | `ws://localhost:3001/ws` |
| Auth Key   | `dev-workstation-key`    |

> **Note:** For physical devices, use your Mac's local IP (e.g., `ws://192.168.1.100:3001/ws`).

---

## Development Workflow

### Typical Session

```bash
# Terminal 1: Start all servers
cd tiflis-code
pnpm dev

# Terminal 2: (optional) Watch TypeScript for changes
pnpm turbo watch

# Xcode: Open project and run iOS app (⌘R)
```

### Hot Reload Behavior

| Component              | Hot Reload                                        |
| ---------------------- | ------------------------------------------------- |
| **Tunnel Server**      | ✅ tsx watch mode - auto-restart                  |
| **Workstation Server** | ✅ tsx watch mode - auto-restart                  |
| **iOS App**            | ⚠️ Requires rebuild (⌘R), SwiftUI previews for UI |
| **watchOS App**        | ⚠️ Requires rebuild (⌘R)                          |

### SwiftUI Previews

```swift
#Preview {
    MessageBubble(message: .mock)
}

#Preview {
    ChatView(viewModel: .mock)
}
```

---

## Testing

### TypeScript Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
pnpm --filter @tiflis-io/tiflis-code-tunnel test
pnpm --filter @tiflis-io/tiflis-code-workstation test
```

### iOS/watchOS Tests

```bash
# Run unit tests
xcodebuild test \
  -project apps/TiflisCode/TiflisCode.xcodeproj \
  -scheme TiflisCode \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -configuration Debug

# Or use Xcode: ⌘U
```

---

## Environment Variables Reference

### Tunnel Server (.env.local)

```bash
# Required
TUNNEL_REGISTRATION_API_KEY=your-32-char-api-key-here!!!

# Optional
PORT=3001
LOG_LEVEL=debug  # trace, debug, info, warn, error
NODE_ENV=development
```

### Workstation Server (.env.local)

```bash
# Required
TUNNEL_URL=ws://localhost:3001/ws
TUNNEL_API_KEY=dev-api-key-32-chars-minimum!!
WORKSTATION_AUTH_KEY=dev-workstation-key

# Optional
PORT=3002
WORKSPACES_ROOT=/Users/yourname/work
DATA_DIR=/Users/yourname/.tiflis-code
LOG_LEVEL=debug
NODE_ENV=development

# LLM for Supervisor Agent
AGENT_PROVIDER=openai          # or cerebras, anthropic
AGENT_API_KEY=sk-xxx
AGENT_MODEL_NAME=gpt-4o-mini

# Speech (optional in dev)
STT_PROVIDER=openai              # or deepgram, local
STT_API_KEY=sk-xxx               # Not required for local provider
STT_BASE_URL=http://localhost:5000/v1  # For local provider
TTS_PROVIDER=openai              # or elevenlabs, local
TTS_API_KEY=sk-xxx               # Not required for local provider
TTS_BASE_URL=http://localhost:5001/v1  # For local provider
```

---

## Debugging

### TypeScript Debugging (VS Code)

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Tunnel",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["--filter", "@tiflis-io/tiflis-code-tunnel", "dev"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Workstation",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["--filter", "@tiflis-io/tiflis-code-workstation", "dev"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

### iOS Debugging (Xcode)

- **Breakpoints**: Click line number in Xcode
- **LLDB Console**: View → Debug Area → Activate Console
- **Network Debugging**: Use `os_log` or Proxyman
- **View Hierarchy**: Debug → View Debugging → Capture View Hierarchy

### WebSocket Debugging

```bash
# Install websocat
brew install websocat

# Connect to tunnel server
websocat ws://localhost:3001/ws

# Send auth message
{"type":"connect","payload":{"tunnel_id":"test","auth_key":"dev-workstation-key","device_id":"debug-1"}}
```

---

## Common Issues

### iOS Simulator Won't Connect to localhost

**Solution:**

- Ensure servers are running on `0.0.0.0` not `127.0.0.1`
- Check firewall settings
- Use `localhost` in simulator (it maps correctly)

### watchOS Simulator Not Syncing with iOS

**Solution:**

1. Ensure simulators are paired (`xcrun simctl list pairs`)
2. Run iOS app first, then watchOS app
3. Both apps must be running simultaneously
4. Check Console.app for WatchConnectivity logs

### pnpm Install Fails

**Solution:**

```bash
pnpm store prune
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### Xcode Build Fails with Signing Errors

**Solution:**

1. Select your personal team in Signing & Capabilities
2. Enable "Automatically manage signing"
3. Use unique bundle identifier (e.g., `com.yourname.TiflisCode.dev`)

---

## References

- [TYPESCRIPT_SERVER_STACK.md](./TYPESCRIPT_SERVER_STACK.md) — Server architecture and patterns
- [MOBILE_APP_LOGIC.md](./MOBILE_APP_LOGIC.md) — iOS app architecture
- [PROTOCOL.md](../PROTOCOL.md) — WebSocket protocol specification
