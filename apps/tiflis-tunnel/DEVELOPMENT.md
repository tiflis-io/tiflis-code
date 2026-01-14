# Development Guide

## Setup

### Prerequisites

- Rust 1.83+
- Docker (for containerized deployment)
- A domain name (for production with Let's Encrypt)

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Building

### Development Build

```bash
cargo build
```

### Release Build

```bash
cargo build --release
```

Binaries will be in `target/release/`:
- `tunnel-server`
- `tunnel-client`

### Build Specific Binary

```bash
cargo build --bin tunnel-server
cargo build --bin tunnel-client
```

## Running Locally

### Without TLS (Development Mode)

**Terminal 1 - Start Server:**
```bash
export SERVER_DOMAIN=localhost
export TLS_ENABLED=false
export AUTH_API_KEY=dev-key-minimum-32-characters-long
export SERVER_HTTP_PORT=8080
export SERVER_HTTPS_PORT=8443
cargo run --bin tunnel-server
```

**Terminal 2 - Start Local Workstation (example with Python):**
```bash
python3 -m http.server 3002
```

**Terminal 3 - Start Client:**
```bash
export SERVER_ADDRESS=localhost:8443
export AUTH_API_KEY=dev-key-minimum-32-characters-long
export WORKSTATION_ID=dev-ws
export WORKSTATION_LOCAL_ADDRESS=http://localhost:3002
cargo run --bin tunnel-client
```

**Test:**
```bash
curl http://localhost:8080/t/dev-ws/
```

## Testing

### Run All Tests

```bash
cargo test --all
```

### Run Specific Test

```bash
cargo test --package tunnel-core
```

### Run with Logs

```bash
RUST_LOG=debug cargo test --all
```

## Code Quality

### Format Code

```bash
cargo fmt --all
```

### Lint

```bash
cargo clippy --all --all-targets
```

### Check (Fast Compile Check)

```bash
cargo check --all
```

## Docker Development

### Build Images

```bash
docker build --build-arg BINARY_NAME=tunnel-server -t tiflis/tunnel-server:dev .
docker build --build-arg BINARY_NAME=tunnel-client -t tiflis/tunnel-client:dev .
```

### Run with Docker Compose

```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up
```

### Run Server Only

```bash
docker compose up tunnel-server
```

## Configuration

### Using Config Files

**Server:**
```bash
cp config.example.toml config.toml
# Edit config.toml
cargo run --bin tunnel-server -- --config config.toml
```

**Client:**
```bash
cp client.example.toml client.toml
# Edit client.toml
cargo run --bin tunnel-client -- --config client.toml
```

### Using Environment Variables

Environment variables override config file values. See README.md for full list.

## Debugging

### Enable Debug Logging

```bash
export RUST_LOG=tunnel_server=debug,tunnel_client=debug,tunnel_core=debug
cargo run --bin tunnel-server
```

### Log Levels

- `error` — Errors only
- `warn` — Warnings and errors
- `info` — Info, warnings, and errors (default)
- `debug` — Debug info
- `trace` — Very verbose

### Individual Module Logging

```bash
export RUST_LOG=tunnel_server::proxy=trace,tunnel_server=info
```

## Project Structure

```
tiflis-tunnel/
├── Cargo.toml                  # Workspace manifest
├── crates/
│   ├── tunnel-core/            # Shared library
│   │   ├── src/
│   │   │   ├── protocol.rs     # Message types
│   │   │   ├── codec.rs        # Serialization
│   │   │   ├── quic.rs         # QUIC helpers
│   │   │   ├── error.rs        # Error types
│   │   │   └── lib.rs          # Public exports
│   │   └── Cargo.toml
│   │
│   ├── tunnel-server/          # Server binary
│   │   ├── src/
│   │   │   ├── config.rs       # Configuration
│   │   │   ├── server.rs       # Main server logic
│   │   │   ├── registry.rs     # Workstation registry
│   │   │   ├── pending.rs      # Pending requests
│   │   │   ├── proxy.rs        # HTTP/WS proxy
│   │   │   └── main.rs         # Entry point
│   │   └── Cargo.toml
│   │
│   └── tunnel-client/          # Client binary
│       ├── src/
│       │   ├── config.rs       # Configuration
│       │   ├── client.rs       # Main client logic
│       │   ├── connection.rs   # QUIC connection
│       │   ├── reconnect.rs    # Reconnection logic
│       │   ├── proxy.rs        # Local forwarding
│       │   └── main.rs         # Entry point
│       └── Cargo.toml
│
├── Dockerfile
├── docker-compose.yml
├── README.md
└── DEVELOPMENT.md              # This file
```

## Common Issues

### "Address already in use"

Port 443 or 80 is already taken. Either:
- Stop the conflicting service
- Use different ports (e.g., 8080, 8443)

### "API key too short"

API key must be at least 32 characters. Generate a secure key:
```bash
openssl rand -base64 32
```

### QUIC Connection Issues

If QUIC is blocked on your network:
- For production, ensure UDP port 443 is open
- For development, use localhost which shouldn't have restrictions

### Let's Encrypt Rate Limits

Let's Encrypt has rate limits (50 certificates per domain per week). For development:
- Use `TLS_ENABLED=false`
- Use staging environment (requires code modification)

## Performance Tips

### Release Builds

Always use release builds for production:
```bash
cargo build --release
```

Release builds are ~10x faster than debug builds.

### Logging Overhead

Reduce logging in production for better performance:
```bash
export RUST_LOG=tunnel_server=info
```

## Contributing

1. Format code: `cargo fmt --all`
2. Run linter: `cargo clippy --all`
3. Run tests: `cargo test --all`
4. Ensure no warnings: `cargo build --release`

## Next Steps

- Implement integration tests (Phase 4)
- Add metrics/monitoring
- Add rate limiting
- Add connection statistics
- WebSocket support enhancement

## License

FSL-1.1-NC — Copyright (c) 2026 Roman Barinov
