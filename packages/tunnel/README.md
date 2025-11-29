# @tiflis/tiflis-code-tunnel

<p align="center">
  <img src="../../assets/branding/logo.svg" width="80" height="80" alt="Tiflis Code">
</p>

<p align="center">
  <strong>WebSocket reverse proxy for Tiflis Code workstation connections</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#docker">Docker</a> •
  <a href="#reverse-proxy">Reverse Proxy</a>
</p>

---

## Overview

The Tunnel Server acts as a secure reverse proxy between mobile clients (iOS/watchOS) and workstations running the Tiflis Code workstation server. It enables remote access to your workstation without requiring a public IP address.

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
│   Mobile    │◄───────►│   Tunnel    │◄───────►│   Workstation   │
│  (iOS/Watch)│   WSS   │   Server    │   WS    │     Server      │
└─────────────┘         └─────────────┘         └─────────────────┘
```

## Installation

```bash
# Using npm (from GitHub Packages)
npm install @tiflis/tiflis-code-tunnel

# Using pnpm
pnpm add @tiflis/tiflis-code-tunnel
```

### GitHub Packages Authentication

Add to your `.npmrc`:

```
@tiflis:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

## Quick Start

<p align="center">
  <img src="../../assets/screenshots/tunnel/startup.png" alt="Tunnel Server Startup" width="700">
</p>

### 1. Set Environment Variables

```bash
# Required: API key for workstation registration (min 32 chars)
export TUNNEL_REGISTRATION_API_KEY="your-secure-api-key-at-least-32-characters"

# Optional
export PORT=3001
export LOG_LEVEL=info
```

### 2. Run the Server

```bash
# Using npx
npx @tiflis/tiflis-code-tunnel

# Or if installed globally
tiflis-code-tunnel
```

### 3. Verify It's Running

```bash
curl http://localhost:3001/health
```

## Configuration

All configuration is done via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TUNNEL_REGISTRATION_API_KEY` | ✅ | — | API key for workstation registration (min 32 chars) |
| `PORT` | ❌ | `3001` | HTTP/WebSocket port |
| `HOST` | ❌ | `0.0.0.0` | Host to bind to |
| `LOG_LEVEL` | ❌ | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error` |
| `TRUST_PROXY` | ❌ | `false` | Set to `true` when behind a reverse proxy |
| `PUBLIC_BASE_URL` | ❌ | auto | Public WebSocket URL (e.g., `wss://tunnel.example.com`) |
| `WS_PATH` | ❌ | `/ws` | WebSocket endpoint path |

### Example `.env` File

```bash
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
TUNNEL_REGISTRATION_API_KEY=your-secure-api-key-at-least-32-characters

# For reverse proxy setups
TRUST_PROXY=true
PUBLIC_BASE_URL=wss://tunnel.example.com
```

## Docker

### Quick Start with Docker

```bash
docker run -d \
  --name tiflis-tunnel \
  -p 3001:3001 \
  -e TUNNEL_REGISTRATION_API_KEY="your-api-key-here-32-chars-min!!" \
  ghcr.io/tiflis-io/tiflis-code-tunnel:latest
```

### Docker Compose

```yaml
services:
  tunnel:
    image: ghcr.io/tiflis-io/tiflis-code-tunnel:latest
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      TUNNEL_REGISTRATION_API_KEY: ${TUNNEL_REGISTRATION_API_KEY}
    restart: unless-stopped
```

### Multi-Architecture Support

The Docker image supports both architectures:
- `linux/amd64` (x86_64)
- `linux/arm64` (Apple Silicon, AWS Graviton, Raspberry Pi)

## Reverse Proxy

When deploying behind a reverse proxy with TLS termination:

### Configuration

```bash
TRUST_PROXY=true
PUBLIC_BASE_URL=wss://tunnel.example.com
```

### Nginx Example

```nginx
upstream tiflis_tunnel {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl http2;
    server_name tunnel.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /ws {
        proxy_pass http://tiflis_tunnel;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    location /health {
        proxy_pass http://tiflis_tunnel;
    }
}
```

### Traefik with Docker Compose

See `deploy/docker-compose.traefik.yml` for a complete example with automatic Let's Encrypt certificates.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Detailed health check with connection stats |
| `/healthz` | GET | Simple liveness probe |
| `/readyz` | GET | Readiness probe |
| `/ws` | WebSocket | Main WebSocket endpoint |

### Health Check Response

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 3600,
  "connections": {
    "workstations": 2,
    "clients": 5
  },
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

## Protocol

The tunnel server implements the Tiflis Code WebSocket Protocol. See [PROTOCOL.md](../../PROTOCOL.md) for the full specification.

### Key Message Types

**Workstation Registration:**
```json
{
  "type": "workstation.register",
  "payload": {
    "api_key": "your-api-key",
    "name": "My MacBook Pro",
    "auth_key": "client-auth-key"
  }
}
```

**Mobile Client Connection:**
```json
{
  "type": "connect",
  "payload": {
    "tunnel_id": "abc123",
    "auth_key": "client-auth-key",
    "device_id": "device-uuid"
  }
}
```

## Development

```bash
# Clone the repository
git clone https://github.com/tiflis-io/tiflis-code.git
cd tiflis-code/packages/tunnel

# Install dependencies
pnpm install

# Run in development mode
TUNNEL_REGISTRATION_API_KEY="dev-key-32-characters-minimum!!" pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## License

MIT © [Roman Barinov](mailto:rbarinov@gmail.com)

