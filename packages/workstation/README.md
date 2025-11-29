# @tiflis/tiflis-code-workstation

<p align="center">
  <img src="../../assets/branding/logo-large.svg" width="80" height="80" alt="Tiflis Code">
</p>

<p align="center">
  <strong>Agent sessions and terminal access manager for Tiflis Code</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#docker">Docker</a> •
  <a href="#architecture">Architecture</a>
</p>

---

## Overview

The Workstation Server runs on the user's machine and provides:

- **AI Agent Sessions**: Create and manage headless agent sessions (Cursor, Claude Code, OpenCode)
- **Terminal Access**: Full PTY terminal sessions via node-pty
- **Supervisor Agent**: LangGraph-based assistant for workspace discovery and session management
- **Tunnel Connection**: Connects to the tunnel server for remote mobile access
- **Tunnel ID Persistence**: Stores tunnel_id in SQLite database, survives restarts and reclaims ID after tunnel server restarts
- **Message Persistence**: SQLite database for conversation history
- **Audio Storage**: File system storage for voice recordings (TTS/STT)

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────────┐
│  Mobile Client  │◄───────►│  Tunnel Server  │◄───────►│  Workstation Server │
│  (iOS/watchOS)  │   WSS   │     (VPS)       │   WS    │   (Your Machine)    │
└─────────────────┘         └─────────────────┘         └─────────────────────┘
```

## Installation

```bash
# Using npm (from GitHub Packages)
npm install @tiflis/tiflis-code-workstation

# Using pnpm
pnpm add @tiflis/tiflis-code-workstation
```

### GitHub Packages Authentication

Add to your `.npmrc`:

```
@tiflis:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

## Quick Start

### 1. Set Environment Variables

```bash
# Required: Tunnel connection
export TUNNEL_URL="wss://tunnel.example.com/ws"
export TUNNEL_API_KEY="your-tunnel-api-key-32-chars-min!!"
export WORKSTATION_AUTH_KEY="your-client-auth-key"

# Required: Workspaces location
export WORKSPACES_ROOT="$HOME/work"

# Required: AI Agent configuration
export AGENT_API_KEY="your-openai-api-key"
```

### 2. Run the Server

```bash
# Using npx
npx @tiflis/tiflis-code-workstation

# Or if installed globally
tiflis-code-workstation

# Development mode
pnpm dev
```

### 3. Verify It's Running

```bash
curl http://localhost:3002/health
```

<p align="center">
  <img src="../../assets/screenshots/workstation/startup.png" alt="Workstation Server Startup" width="600">
</p>

## Configuration

All configuration is done via environment variables:

### Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TUNNEL_URL` | ✅ | — | WebSocket URL of the tunnel server |
| `TUNNEL_API_KEY` | ✅ | — | API key for tunnel registration |
| `WORKSTATION_AUTH_KEY` | ✅ | — | Auth key for mobile client access |
| `WORKSPACES_ROOT` | ✅ | — | Root directory containing workspaces |
| `PORT` | ❌ | `3002` | HTTP server port |
| `LOG_LEVEL` | ❌ | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error` |
| `WORKSTATION_NAME` | ❌ | hostname | Display name for this workstation |
| `DATA_DIR` | ❌ | `~/.tiflis-code` | Data directory for SQLite and audio files |

### AI Agent (Supervisor)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_PROVIDER` | ❌ | `openai` | LLM provider: `openai`, `cerebras`, `anthropic` |
| `AGENT_API_KEY` | ✅ | — | API key for LLM provider |
| `AGENT_MODEL_NAME` | ❌ | `gpt-4o-mini` | Model name |
| `AGENT_BASE_URL` | ❌ | provider default | Custom API base URL |
| `AGENT_TEMPERATURE` | ❌ | `0` | LLM temperature (0-2) |

### Speech Services

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STT_PROVIDER` | ❌ | `openai` | STT provider: `openai`, `elevenlabs` |
| `STT_API_KEY` | ❌ | — | API key for STT provider |
| `STT_MODEL` | ❌ | `whisper-1` | STT model name |
| `TTS_PROVIDER` | ❌ | `openai` | TTS provider: `openai`, `elevenlabs` |
| `TTS_API_KEY` | ❌ | — | API key for TTS provider |
| `TTS_MODEL` | ❌ | `tts-1` | TTS model name |
| `TTS_VOICE` | ❌ | `alloy` | Voice ID for TTS |

### Example `.env.local` File

```bash
NODE_ENV=development
PORT=3002
LOG_LEVEL=debug

# Tunnel connection
TUNNEL_URL=wss://tunnel.example.com/ws
TUNNEL_API_KEY=your-tunnel-api-key-32-chars-min!!
WORKSTATION_NAME=my-macbook
WORKSTATION_AUTH_KEY=dev-workstation-key

# Workspaces
WORKSPACES_ROOT=/Users/yourname/work
DATA_DIR=/Users/yourname/.tiflis-code

# LLM (Supervisor Agent)
AGENT_PROVIDER=openai
AGENT_API_KEY=sk-xxx
AGENT_MODEL_NAME=gpt-4o-mini

# Speech-to-Text
STT_PROVIDER=openai
STT_API_KEY=sk-xxx

# Text-to-Speech
TTS_PROVIDER=openai
TTS_API_KEY=sk-xxx
TTS_VOICE=alloy
```

## Docker

### Quick Start with Docker

```bash
docker run -d \
  --name tiflis-workstation \
  -p 3002:3002 \
  -v "$HOME/work:/workspaces" \
  -v "$HOME/.tiflis-code:/data" \
  -e TUNNEL_URL="wss://tunnel.example.com/ws" \
  -e TUNNEL_API_KEY="your-api-key" \
  -e WORKSTATION_AUTH_KEY="your-auth-key" \
  -e WORKSPACES_ROOT="/workspaces" \
  -e DATA_DIR="/data" \
  -e AGENT_API_KEY="your-openai-key" \
  ghcr.io/tiflis-io/tiflis-code-workstation:latest
```

### Docker Compose

```yaml
services:
  workstation:
    image: ghcr.io/tiflis-io/tiflis-code-workstation:latest
    ports:
      - "3002:3002"
    volumes:
      - "${HOME}/work:/workspaces"
      - "${HOME}/.tiflis-code:/data"
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      TUNNEL_URL: ${TUNNEL_URL}
      TUNNEL_API_KEY: ${TUNNEL_API_KEY}
      WORKSTATION_AUTH_KEY: ${WORKSTATION_AUTH_KEY}
      WORKSPACES_ROOT: /workspaces
      DATA_DIR: /data
      AGENT_API_KEY: ${AGENT_API_KEY}
    restart: unless-stopped
```

### Multi-Architecture Support

The Docker image supports both architectures:
- `linux/amd64` (x86_64)
- `linux/arm64` (Apple Silicon, AWS Graviton)

## Architecture

```
src/
├── config/                     # Environment and constants
├── domain/                     # Business logic
│   ├── entities/               # Session, Client entities
│   ├── value-objects/          # SessionId, DeviceId, ChatMessage
│   ├── ports/                  # Interface definitions
│   └── errors/                 # Domain errors
├── application/                # Use cases
│   ├── commands/               # Create/Terminate sessions
│   ├── queries/                # List sessions
│   └── services/               # Subscriptions, broadcasting, chat history
├── infrastructure/             # External adapters
│   ├── agents/                 # Agent session management
│   │   └── supervisor/         # LangGraph Supervisor Agent
│   │       └── tools/          # Workspace, session, filesystem tools
│   ├── websocket/              # Tunnel client, message router
│   ├── persistence/            # SQLite, in-memory registries
│   ├── terminal/               # PTY management
│   ├── speech/                 # TTS/STT services
│   └── workspace/              # File system discovery
└── protocol/                   # Message types and schemas
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Detailed health check |
| `/healthz` | GET | Simple liveness probe |
| `/readyz` | GET | Readiness probe |
| `/ws` | WebSocket | Main WebSocket endpoint |

## Development

```bash
# Clone the repository
git clone https://github.com/tiflis-io/tiflis-code.git
cd tiflis-code/packages/workstation

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## License

MIT © [Roman Barinov](mailto:rbarinov@gmail.com)
