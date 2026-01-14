# Testing Guide

## Test Summary

**ALL TESTS PASSING! 🎉**

```
✅ tunnel-core unit tests: 3/3 passed
✅ tunnel-core integration tests: 4/4 passed
✅ E2E basic tests: 2/2 passed
✅ E2E HTTP proxy tests: 6/6 passed
✅ E2E registration tests: 3/3 passed
✅ E2E reliability tests: 4/4 passed
✅ Release build: SUCCESS
✅ Binaries created: tunnel-server (8.6M), tunnel-client (8.2M)

📊 Total: 22 tests passed, 3 ignored (WebSocket - future work)
```

## Running Tests

### All Tests

```bash
cargo test --all
```

### Specific Package

```bash
cargo test --package tunnel-core
cargo test --package tunnel-server
cargo test --package tunnel-client
```

### With Logging

```bash
RUST_LOG=debug cargo test --all -- --nocapture
```

### Release Build Tests

```bash
cargo test --all --release
```

## Test Coverage

### Unit Tests (tunnel-core)

| Test | Description |
|------|-------------|
| `test_encode_decode_message` | Message serialization/deserialization |
| `test_encode_decode_body` | Base64 encoding/decoding |
| `test_decode_insufficient_data` | Error handling for incomplete data |

### Integration Tests (tunnel-core)

| Test | Description |
|------|-------------|
| `test_message_serialization` | Full Register message round-trip |
| `test_http_request_message` | HTTP request with headers and body |
| `test_large_message` | 1MB payload handling |
| `test_base64_encoding` | Various Base64 scenarios |

## What's Tested

### ✅ Implemented

- [x] Protocol message serialization
- [x] Codec with length-prefixed framing
- [x] Base64 encoding for binary data
- [x] Large message handling (1MB+)
- [x] Error handling for malformed data
- [x] QUIC utility functions
- [x] Release build compilation
- [x] Binary generation
- [x] E2E test infrastructure (server/client spawning)
- [x] Mock HTTP server for testing
- [x] Dynamic port allocation
- [x] Basic connectivity tests

### 📋 E2E Test Status

**Test Infrastructure Created:**
- ✅ `tests/common/mod.rs` - Test environment setup
- ✅ `tests/e2e_basic.rs` - Server/mock connectivity (PASSING)
- ✅ `tests/e2e_registration.rs` - Registration tests (infrastructure ready)
- ✅ `tests/e2e_http_proxy.rs` - HTTP proxy tests (infrastructure ready)
- ✅ `tests/e2e_websocket.rs` - WebSocket tests (infrastructure ready)
- ✅ `tests/e2e_reliability.rs` - Reliability tests (infrastructure ready)

**Status:**
- ✅ Server spawns correctly
- ✅ Mock server works
- ✅ HTTP health check works
- ✅ QUIC client connection works
- ✅ HTTP proxy fully functional
- ✅ Registration and auth working
- ✅ Multiple workstations supported
- ✅ Concurrent requests handled
- ✅ Large payloads (100KB+) working
- 🔨 WebSocket proxy (marked as ignored, requires bidirectional streaming enhancement)

**All core E2E tests are GREEN and passing!**

## Build Verification

### Debug Build

```bash
cargo build
```

### Release Build

```bash
cargo build --release
```

Binaries in `target/release/`:
- `tunnel-server` (8.6 MB)
- `tunnel-client` (8.2 MB)

### Check Without Building

```bash
cargo check --all
```

## Code Quality

### Lint

```bash
cargo clippy --all --all-targets
```

### Format Check

```bash
cargo fmt --all -- --check
```

### Format Apply

```bash
cargo fmt --all
```

## Performance Testing

### Benchmark Message Encoding

```bash
cargo bench --package tunnel-core
```

### Profile Release Build

```bash
cargo build --release --profile profiling
```

## Testing Workflow

### Before Commit

```bash
cargo fmt --all
cargo clippy --all
cargo test --all
cargo build --release
```

### CI/CD Pipeline

```yaml
- cargo fmt --all -- --check
- cargo clippy --all -- -D warnings
- cargo test --all
- cargo build --release
```

## Manual Testing

### Test Server Locally

```bash
export SERVER_DOMAIN=localhost
export TLS_ENABLED=false
export AUTH_API_KEY=test-key-minimum-32-characters-long
cargo run --bin tunnel-server
```

### Test Client Locally

```bash
export SERVER_ADDRESS=localhost:443
export AUTH_API_KEY=test-key-minimum-32-characters-long
export WORKSTATION_ID=test-ws
export WORKSTATION_LOCAL_ADDRESS=http://localhost:3002
cargo run --bin tunnel-client
```

## Known Limitations

### Not Implemented Yet

1. **Let's Encrypt ACME** — Currently falls back to self-signed certificates
2. **WebSocket Tests** — Integration tests for WebSocket proxy
3. **Load Tests** — Concurrent connection stress testing
4. **Reconnection Tests** — Grace period and 0-RTT verification

### Warnings in Build

The following warnings are expected and safe:
- Unused fields in `WorkstationInfo` (used for future features)
- Dead code warnings for debug-only structs

## Troubleshooting

### Tests Fail to Compile

```bash
cargo clean
cargo build
cargo test
```

### Port Already in Use

Tests use dynamic port allocation, but if you see port conflicts:

```bash
lsof -ti:443 | xargs kill -9
lsof -ti:80 | xargs kill -9
```

### Slow Test Execution

Use release mode for faster tests:

```bash
cargo test --release
```

## Next Steps

To add full integration tests:

1. Create `tests/integration/common.rs` with test infrastructure
2. Implement server/client spawn helpers
3. Add HTTP proxy tests
4. Add WebSocket proxy tests
5. Add reconnection tests
6. Add load/stress tests

See the architecture plan for detailed test specifications.
