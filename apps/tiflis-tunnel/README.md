# Tiflis Tunnel

Self-hosted tunnel solution using QUIC for the Tiflis Code project.

## Features

- **QUIC Protocol** — Fast, reliable transport with built-in multiplexing
- **0-RTT Reconnection** — Instant reconnection after network interruptions
- **Let's Encrypt** — Automatic TLS certificate management
- **Path-based Routing** — `/t/{workstation_id}/*` for HTTP and WebSocket
- **Graceful Reconnection** — Requests queued during temporary disconnects
- **Simple Configuration** — TOML files or environment variables

## Architecture

```
Mobile/Web Client ──HTTPS/WSS──► Tunnel Server ──QUIC──► Tunnel Client ──HTTP──► Workstation
```

## Quick Start

### Server Deployment

```bash
docker run -d \
  --name tunnel-server \
  -p 80:80 \
  -p 443:443/tcp \
  -p 443:443/udp \
  -e SERVER_DOMAIN=tunnel.example.com \
  -e TLS_ENABLED=true \
  -e TLS_ACME_EMAIL=admin@example.com \
  -e AUTH_API_KEY=your-32-char-secret-key-here \
  -v tunnel-certs:/var/lib/tunnel/certs \
  ghcr.io/tiflis-io/tunnel-server:latest
```

### Client Deployment

```bash
docker run -d \
  --name tunnel-client \
  -e SERVER_ADDRESS=tunnel.example.com:443 \
  -e AUTH_API_KEY=your-32-char-secret-key-here \
  -e WORKSTATION_ID=my-workstation \
  -e WORKSTATION_LOCAL_ADDRESS=http://host.docker.internal:3002 \
  --add-host=host.docker.internal:host-gateway \
  -v tunnel-session:/var/lib/tunnel \
  ghcr.io/tiflis-io/tunnel-client:latest
```

Your workstation is now accessible at:
```
https://tunnel.example.com/t/my-workstation/*
```

## Configuration

### Tunnel Server

**File:** `config.toml`

```toml
[server]
domain = "tunnel.example.com"
http_port = 80
https_port = 443

[tls]
enabled = true
acme_email = "admin@example.com"
certs_dir = "/var/lib/tunnel/certs"

[auth]
api_key = "minimum-32-characters-secret-key"

[reliability]
grace_period = 30
request_timeout = 60

[limits]
max_workstations = 100
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_DOMAIN` | required | Server domain name |
| `SERVER_HTTP_PORT` | 80 | HTTP port |
| `SERVER_HTTPS_PORT` | 443 | HTTPS/QUIC port |
| `TLS_ENABLED` | true | Enable Let's Encrypt |
| `TLS_ACME_EMAIL` | required | Email for Let's Encrypt |
| `AUTH_API_KEY` | required | API key (min 32 chars) |
| `RELIABILITY_GRACE_PERIOD` | 30 | Reconnection grace period (seconds) |
| `RELIABILITY_REQUEST_TIMEOUT` | 60 | Request timeout (seconds) |
| `LIMITS_MAX_WORKSTATIONS` | 100 | Maximum concurrent workstations |

### Tunnel Client

**File:** `client.toml`

```toml
[server]
address = "tunnel.example.com:443"

[auth]
api_key = "minimum-32-characters-secret-key"

[workstation]
id = "my-workstation"
local_address = "http://localhost:3002"

[reconnect]
enabled = true
max_delay = 30

[session]
ticket_path = "/var/lib/tunnel/session.ticket"
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_ADDRESS` | required | Tunnel server address |
| `AUTH_API_KEY` | required | API key (must match server) |
| `WORKSTATION_ID` | required | Unique workstation identifier |
| `WORKSTATION_LOCAL_ADDRESS` | required | Local server URL |
| `RECONNECT_ENABLED` | true | Enable automatic reconnection |
| `RECONNECT_MAX_DELAY` | 30 | Max backoff delay (seconds) |
| `SESSION_TICKET_PATH` | ./session.ticket | Path to session ticket file |

## Development

### Prerequisites

- Rust 1.83+
- Docker (optional)

### Build

```bash
cargo build --release --bin tunnel-server
cargo build --release --bin tunnel-client
```

### Run Locally (without TLS)

**Server:**
```bash
export SERVER_DOMAIN=localhost
export TLS_ENABLED=false
export AUTH_API_KEY=dev-key-minimum-32-characters!!
cargo run --bin tunnel-server
```

**Client:**
```bash
export SERVER_ADDRESS=localhost:443
export AUTH_API_KEY=dev-key-minimum-32-characters!!
export WORKSTATION_ID=dev-ws
export WORKSTATION_LOCAL_ADDRESS=http://localhost:3002
cargo run --bin tunnel-client
```

### Pre-built Binaries

Download pre-built binaries from [GitHub Releases](https://github.com/tiflis-io/tiflis-code/releases).

**macOS Note:** Downloaded binaries are quarantined by Gatekeeper. Remove the quarantine attribute before running:

```bash
xattr -d com.apple.quarantine tunnel-server
xattr -d com.apple.quarantine tunnel-client
```

### Docker Build (Local)

```bash
docker build --build-arg BINARY_NAME=tunnel-server -t ghcr.io/tiflis-io/tunnel-server .
docker build --build-arg BINARY_NAME=tunnel-client -t ghcr.io/tiflis-io/tunnel-client .
```

## Protocol

The tunnel uses QUIC for transport with JSON messages:

### Control Messages (Stream 0)
- `register` — Initial registration
- `registered` — Registration confirmation
- `reconnect` — Session restoration
- `ping`/`pong` — Keepalive

### HTTP Proxying (Streams 1+)
- `http_request`/`http_response` — Request/response proxying
- Each HTTP request opens a new bidirectional QUIC stream
- Binary bodies are Base64-encoded

### WebSocket Proxying (Streams 1+)
- `ws_open`/`ws_data`/`ws_close` — WebSocket message proxying
- **One persistent bidirectional QUIC stream per WebSocket connection**
- All WebSocket frames flow through the same stream (open, data, close)
- Binary frames are Base64-encoded
- Stream remains open until WebSocket close or connection drop

## Testing

```bash
cargo test --all
```

## License

FSL-1.1-NC — Copyright (c) 2026 Roman Barinov

See [LICENSE](LICENSE) file for details.

## Project Structure

```
tiflis-tunnel/
├── crates/
│   ├── tunnel-core/      # Shared protocol and utilities
│   ├── tunnel-server/    # Tunnel server binary
│   └── tunnel-client/    # Tunnel client binary
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Support

For issues and questions, please use the GitHub issue tracker.
