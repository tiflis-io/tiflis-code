# Tiflis Tunnel — Architecture Plan

## 1. Project Overview

### Purpose

Self-hosted tunnel solution for the Tiflis Code project, providing access to local Workstation servers through a public URL.

### Key Requirements

- Path-based routing: `/t/{workstation_id}/*`
- Single API key from configuration
- Full HTTP and WebSocket proxying support
- Reliable connection with automatic reconnect
- Built-in Let's Encrypt support
- Ability to run without TLS for testing

### License

```
FSL-1.1-NC
Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
```

---

## 2. Architecture Decisions

### 2.1 Transport Protocol: QUIC

**Decision:** Use QUIC as the only transport between Tunnel Server and Tunnel Client.

**Rationale:**
- Built-in multiplexing — each request is a separate stream
- 0-RTT reconnection — fast connection recovery
- No head-of-line blocking — packet loss in one stream doesn't block others
- Connection migration — connection survives IP changes
- Built-in reliability — retransmission at protocol level

**WebSocket fallback is not implemented** — target audience (developers) controls their network environment.

### 2.2 Client Traffic: Standard Protocols

**Decision:** Mobile/Web clients connect via standard HTTP/HTTPS/WebSocket.

```
Mobile Client ──── HTTPS/WSS ────► Tunnel Server ──── QUIC ────► Tunnel Client ──── HTTP/WS ────► Workstation
```

Clients are unaware of QUIC — for them it's a regular HTTPS endpoint.

### 2.3 Configuration: File + Environment Variables

**Decision:** Support TOML file and environment variables with unified naming convention.

**Priority:**
1. Environment variables (highest)
2. Config file
3. Default values (lowest)

**Naming convention:** Environment variables match TOML structure.

```
TOML path                    Environment variable
─────────────────────────    ─────────────────────────────────
server.domain                SERVER_DOMAIN
server.http_port             SERVER_HTTP_PORT
server.https_port            SERVER_HTTPS_PORT
tls.enabled                  TLS_ENABLED
tls.acme_email               TLS_ACME_EMAIL
tls.certs_dir                TLS_CERTS_DIR
auth.api_key                 AUTH_API_KEY
reliability.grace_period     RELIABILITY_GRACE_PERIOD
reliability.request_timeout  RELIABILITY_REQUEST_TIMEOUT
limits.max_workstations      LIMITS_MAX_WORKSTATIONS
```

### 2.4 Server Operating Modes

**Production mode** (`tls.enabled = true`):
- Port 80: HTTP → HTTPS redirect
- Port 443: HTTPS for clients, QUIC for Tunnel Client
- Automatic Let's Encrypt certificate issuance

**Test mode** (`tls.enabled = false`):
- Port 80: HTTP for clients, QUIC without TLS for Tunnel Client
- No certificates required

### 2.5 Connection Reliability

**Grace period:** On Tunnel Client disconnect, server waits for reconnect for specified time. Pending requests are not rejected immediately.

**0-RTT reconnection:** QUIC session ticket is persisted, on reconnect data is sent immediately without full handshake.

**Request tracking:** Each request has unique stream_id, responses are correlated with requests.

---

## 3. System Components

### 3.1 tunnel-core (shared library)

**Purpose:** Shared code for server and client.

**Contents:**
- Protocol messages — all message types (Register, HttpRequest, WsOpen, etc.)
- Codec — message serialization/deserialization
- Error types — typed errors
- QUIC utilities — common helpers for QUIC operations

### 3.2 tunnel-server (binary)

**Purpose:** Public server accepting connections from clients and Tunnel Client.

**Components:**
- HTTP Server — port 80, redirect and health check
- QUIC/HTTPS Server — port 443, main traffic
- Workstation Registry — storing active connections
- Pending Requests — tracking in-flight requests
- HTTP Proxy — proxying HTTP requests
- WebSocket Proxy — proxying WebSocket connections
- TLS/ACME — Let's Encrypt certificate management

### 3.3 tunnel-client (binary)

**Purpose:** Client running alongside Workstation, forwarding traffic.

**Components:**
- QUIC Connection — connection to Tunnel Server
- Reconnection Manager — automatic reconnect with exponential backoff
- Session Persistence — saving QUIC session ticket for 0-RTT
- Local HTTP Proxy — forwarding to local HTTP server
- Local WebSocket Proxy — forwarding to local WebSocket server

---

## 4. Technology Stack

### 4.1 Language and Runtime

| Component | Technology |
|-----------|------------|
| Language | Rust (edition 2021) |
| Async runtime | Tokio |
| Build system | Cargo workspace |

### 4.2 Core Libraries

| Purpose | Library | Rationale |
|---------|---------|-----------|
| QUIC | `quinn` | Mature, production-ready, used in major projects |
| HTTP Server | `axum` | Modern, Tokio-native, good performance |
| TLS | `rustls` | Pure Rust, secure, no OpenSSL dependency |
| ACME/Let's Encrypt | `rustls-acme` | Integration with rustls |
| Serialization | `serde` + `serde_json` | Standard for Rust |
| Config parsing | `toml` | For configuration file |
| CLI | `clap` | Standard for CLI in Rust |
| Logging | `tracing` | Structured logging, async-friendly |
| HTTP Client | `reqwest` | For Tunnel Client (requests to local server) |
| Error handling | `thiserror` + `anyhow` | Typed and ad-hoc errors |

### 4.3 Data Formats

| Data | Format |
|------|--------|
| Configuration | TOML |
| Protocol messages | JSON |
| Binary data in messages | Base64 |

---

## 5. Project Structure

```
apps/tiflis-tunnel/
├── Cargo.toml                      # Workspace manifest
├── LICENSE                         # FSL-1.1-NC
├── README.md
│
├── crates/
│   ├── tunnel-core/                # Shared library
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              # Public exports
│   │       ├── protocol.rs         # Message types
│   │       ├── codec.rs            # Serialization
│   │       ├── quic.rs             # QUIC utilities
│   │       └── error.rs            # Error types
│   │
│   ├── tunnel-server/              # Server binary
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs             # Entry point
│   │       ├── config.rs           # Configuration
│   │       ├── server.rs           # HTTP + QUIC servers
│   │       ├── registry.rs         # Workstation registry
│   │       ├── pending.rs          # Pending requests
│   │       └── proxy.rs            # HTTP/WS proxy logic
│   │
│   └── tunnel-client/              # Client binary
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs             # Entry point
│           ├── config.rs           # Configuration
│           ├── client.rs           # Main client logic
│           ├── connection.rs       # QUIC connection
│           ├── reconnect.rs        # Reconnection logic
│           └── proxy.rs            # Local forwarding
│
├── tests/
│   └── integration/                # Integration tests
│       ├── mod.rs
│       ├── common.rs               # Test utilities
│       ├── registration.rs         # Registration tests
│       ├── http_proxy.rs           # HTTP proxy tests
│       ├── websocket_proxy.rs      # WebSocket proxy tests
│       └── reliability.rs          # Reconnection tests
│
├── Dockerfile
└── docker-compose.yml
```

---

## 6. Configuration

### 6.1 Tunnel Server

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

**Environment variables:**

| Variable | Default |
|----------|---------|
| `SERVER_DOMAIN` | required |
| `SERVER_HTTP_PORT` | 80 |
| `SERVER_HTTPS_PORT` | 443 |
| `TLS_ENABLED` | true |
| `TLS_ACME_EMAIL` | required if TLS enabled |
| `TLS_CERTS_DIR` | /var/lib/tunnel/certs |
| `AUTH_API_KEY` | required |
| `RELIABILITY_GRACE_PERIOD` | 30 |
| `RELIABILITY_REQUEST_TIMEOUT` | 60 |
| `LIMITS_MAX_WORKSTATIONS` | 100 |

### 6.2 Tunnel Client

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

**Environment variables:**

| Variable | Default |
|----------|---------|
| `SERVER_ADDRESS` | required |
| `AUTH_API_KEY` | required |
| `WORKSTATION_ID` | required |
| `WORKSTATION_LOCAL_ADDRESS` | required |
| `RECONNECT_ENABLED` | true |
| `RECONNECT_MAX_DELAY` | 30 |
| `SESSION_TICKET_PATH` | ./session.ticket |

---

## 7. Protocol Messages

### 7.1 Control Messages (QUIC Stream 0)

| Message | Direction | Description |
|---------|-----------|-------------|
| `register` | Client → Server | Workstation registration |
| `registered` | Server → Client | Registration confirmation |
| `reconnect` | Client → Server | Session restoration |
| `ping` | Client → Server | Keepalive |
| `pong` | Server → Client | Keepalive response |
| `error` | Server → Client | Error |

### 7.2 Data Messages (QUIC Streams 1+)

| Message | Direction | Description |
|---------|-----------|-------------|
| `http_request` | Server → Client | Incoming HTTP request |
| `http_response` | Client → Server | HTTP request response |
| `ws_open` | Server → Client | WebSocket opening |
| `ws_data` | Bidirectional | WebSocket data |
| `ws_close` | Bidirectional | WebSocket closing |

### 7.3 Message Structure

All messages are JSON with `type` field as discriminator:

```json
{
  "type": "message_type",
  "field1": "value1",
  "field2": "value2"
}
```

Binary data (request bodies, WebSocket frames) encoded in Base64.

---

## 8. Flow Diagrams

### 8.1 Workstation Registration

```
Tunnel Client                          Tunnel Server
     │                                       │
     │─────── QUIC Connect ─────────────────►│
     │                                       │
     │─────── register {api_key, id} ───────►│
     │                                       │
     │                            Validate API key
     │                            Add to registry
     │                                       │
     │◄────── registered {url} ─────────────│
     │                                       │
```

### 8.2 HTTP Request Flow

```
Mobile Client          Tunnel Server          Tunnel Client          Workstation
     │                       │                       │                     │
     │── GET /t/ws-1/api ───►│                       │                     │
     │                       │                       │                     │
     │                       │── http_request ──────►│                     │
     │                       │   (QUIC stream)       │                     │
     │                       │                       │── GET /api ────────►│
     │                       │                       │                     │
     │                       │                       │◄── 200 OK ─────────│
     │                       │◄── http_response ────│                     │
     │                       │                       │                     │
     │◄── 200 OK ───────────│                       │                     │
     │                       │                       │                     │
```

### 8.3 WebSocket Flow

```
Mobile Client          Tunnel Server          Tunnel Client          Workstation
     │                       │                       │                     │
     │── WS Upgrade ────────►│                       │                     │
     │                       │── ws_open ───────────►│                     │
     │                       │                       │── WS Connect ──────►│
     │◄── 101 Switching ────│                       │◄── 101 ────────────│
     │                       │                       │                     │
     │── WS Data ───────────►│── ws_data ───────────►│── WS Data ─────────►│
     │◄── WS Data ──────────│◄── ws_data ──────────│◄── WS Data ─────────│
     │                       │                       │                     │
     │── WS Close ──────────►│── ws_close ──────────►│── WS Close ────────►│
     │                       │                       │                     │
```

### 8.4 Reconnection Flow

```
Timeline:
────────────────────────────────────────────────────────────────────────────►

T0: Normal operation
    │
T1: Connection breaks
    │
    │  Tunnel Server:
    │  ├── Mark workstation as "reconnecting"
    │  ├── Start grace period timer
    │  └── Queue new requests (don't reject)
    │
T2: Tunnel Client detects disconnect
    │
    │  Tunnel Client:
    │  ├── Calculate backoff delay
    │  ├── Attempt reconnect with session ticket (0-RTT)
    │  └── Send "reconnect" message
    │
T3: Reconnection successful (within grace period)
    │
    │  Tunnel Server:
    │  ├── Restore workstation state
    │  ├── Process queued requests
    │  └── Resume normal operation
    │
T4: Alternative: Grace period expires
    │
    │  Tunnel Server:
    │  ├── Reject all pending requests with 502
    │  └── Remove workstation from registry
```

---

## 9. Testing

### 9.1 Strategy

All integration tests run with `tls.enabled = false` to work without Let's Encrypt.

### 9.2 Test Categories

| Category | Count | Description |
|----------|-------|-------------|
| Registration | 4 | Registration, auth, duplicates, limits |
| HTTP Proxy | 8 | GET, POST, headers, large body, timeouts |
| WebSocket Proxy | 7 | Open, messages, binary, close, multiple |
| Reliability | 8 | Reconnect, grace period, 0-RTT, in-flight requests |
| E2E | 5 | Full flows, mixed traffic, long-running |

### 9.3 Test Environment

Each test:
1. Starts Tunnel Server (TLS disabled)
2. Starts mock local server (simulates Workstation app)
3. Starts Tunnel Client
4. Executes test scenarios
5. Verifies results
6. Cleanup

---

## 10. Deployment

### 10.1 Docker Images

| Image | Description |
|-------|-------------|
| `tiflis/tunnel-server` | Tunnel Server |
| `tiflis/tunnel-client` | Tunnel Client |

### 10.2 Tunnel Server Deployment

```yaml
# docker-compose.yml
services:
  tunnel-server:
    image: tiflis/tunnel-server
    ports:
      - "80:80"
      - "443:443/tcp"
      - "443:443/udp"    # QUIC
    environment:
      SERVER_DOMAIN: tunnel.example.com
      TLS_ENABLED: "true"
      TLS_ACME_EMAIL: admin@example.com
      AUTH_API_KEY: ${AUTH_API_KEY}
    volumes:
      - certs:/var/lib/tunnel/certs

volumes:
  certs:
```

### 10.3 Tunnel Client Deployment

```yaml
# docker-compose.yml (alongside Workstation)
services:
  workstation:
    image: tiflis/workstation
    # ... workstation config

  tunnel-client:
    image: tiflis/tunnel-client
    depends_on:
      - workstation
    environment:
      SERVER_ADDRESS: tunnel.example.com:443
      AUTH_API_KEY: ${AUTH_API_KEY}
      WORKSTATION_ID: ${WORKSTATION_ID}
      WORKSTATION_LOCAL_ADDRESS: http://workstation:3002
    volumes:
      - session:/var/lib/tunnel

volumes:
  session:
```

---

## 11. Development Plan

### 11.1 Phases

| Phase | Description | Estimate |
|-------|-------------|----------|
| 1 | Foundation (core, protocol, QUIC) | 15h |
| 2 | Tunnel Server | 36h |
| 3 | Tunnel Client | 21h |
| 4 | Integration Tests | 28h |
| 5 | DevOps | 8h |
| **TOTAL** | | **108h (~14 days)** |

### 11.2 Phase Details

**Phase 1: Foundation (15h)**
- Project setup, Cargo workspace
- Protocol messages definition
- Codec (serialization/deserialization)
- QUIC connection utilities
- Error types
- Unit tests

**Phase 2: Tunnel Server (36h)**
- Configuration (TOML + env vars)
- HTTP server (port 80)
- QUIC/HTTPS server (port 443)
- Let's Encrypt integration
- Workstation registry
- Pending requests tracking
- HTTP proxy handler
- WebSocket proxy handler
- Reconnection handling
- Unit tests

**Phase 3: Tunnel Client (21h)**
- Configuration (TOML + env vars + CLI)
- QUIC connection management
- Reconnection with exponential backoff
- Session ticket persistence (0-RTT)
- Local HTTP forwarding
- Local WebSocket forwarding
- Unit tests

**Phase 4: Integration Tests (28h)**
- Test infrastructure
- Registration tests
- HTTP proxy tests
- WebSocket proxy tests
- Reliability/reconnection tests
- E2E scenarios

**Phase 5: DevOps (8h)**
- Dockerfile (multi-stage build)
- docker-compose.yml
- GitHub Actions CI
- Documentation

---

## 12. Acceptance Criteria

### Functional

- [ ] Workstation registers with API key
- [ ] HTTP requests proxied through `/t/{workstation_id}/*`
- [ ] WebSocket connections proxied
- [ ] Let's Encrypt certificate issued automatically
- [ ] TLS-disabled mode works for testing
- [ ] Configuration via TOML file works
- [ ] Configuration via environment variables works
- [ ] Reconnection restores connection
- [ ] 0-RTT reconnection works

### Reliability

- [ ] Disconnect within grace period — requests not lost
- [ ] After grace period — pending requests get 502
- [ ] Concurrent requests (100+) handled correctly
- [ ] Large payloads (10MB+) transferred
- [ ] WebSocket survives tunnel client reconnect

### Quality

- [ ] `cargo build --release` without warnings
- [ ] `cargo clippy` without warnings
- [ ] `cargo test --all` — all tests pass
- [ ] All integration tests pass
- [ ] Docker images build successfully

---

## 13. Risks

| Risk | Probability | Mitigation |
|------|-------------|------------|
| QUIC blocked in rare networks | Low | Documentation for users |
| Let's Encrypt rate limits | Low | Certificate caching in volume |
| Quinn library issues | Low | Library is mature, actively maintained |

---

*Document created: January 2026*
*License: FSL-1.1-NC*
