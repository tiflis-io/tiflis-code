# 🔌 Tiflis Code — WebSocket Protocol

<p align="center">
  <img src="assets/branding/logo.svg" width="120" height="120" alt="Tiflis Code">
</p>

<p align="center">
  <strong>Unified communication protocol specification</strong>
</p>

<p align="center">
  <a href="#1-overview">Overview</a> •
  <a href="#2-tunnel-server-protocol">Tunnel</a> •
  <a href="#3-workstation-server-protocol">Workstation</a> •
  <a href="#4-supervisor-commands">Supervisor</a> •
  <a href="#5-session-commands">Sessions</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0-blue" alt="Version 1.0">
  <img src="https://img.shields.io/badge/status-Draft-orange" alt="Draft">
  <img src="https://img.shields.io/badge/transport-WebSocket-green" alt="WebSocket">
</p>

---

## 1. Overview

This document specifies the unified WebSocket-based communication protocol for the tiflis-code system.

### 1.1 Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
│   Mobile    │◄───────►│   Tunnel    │◄───────►│   Workstation   │
│  (iOS/Watch)│   WS    │   Server    │   WS    │     Server      │
└─────────────┘         └─────────────┘         └─────────────────┘
```

### 1.2 Design Principles

1. **Single WebSocket Channel** — All communication through one multiplexed WebSocket connection
2. **Stateless Tunnel** — Tunnel Server is a pure reverse proxy with auth
3. **Session Persistence** — Sessions survive connection drops
4. **Subscription Model** — Clients subscribe to session outputs

### 1.3 Endpoints

| Component | HTTP | WebSocket |
|-----------|------|-----------|
| Tunnel Server | `GET /health` | `/ws` |
| Workstation Server | `GET /health` | `/ws` |

---

## 2. Tunnel Server Protocol

Tunnel Server acts as a reverse proxy between Mobile clients and Workstations.

### 2.1 Workstation Registration

```typescript
// Workstation → Tunnel
{
  type: "workstation.register",
  payload: {
    api_key: string,           // TUNNEL_REGISTRATION_API_KEY
    name: string,              // Display name (e.g., "My MacBook Pro")
    auth_key: string,          // Key for mobile client authorization
    reconnect?: boolean,       // Is this a reconnection?
    previous_tunnel_id?: string // Previous tunnel ID (for reconnect/reclaim)
  }
}

// Tunnel → Workstation (success)
{
  type: "workstation.registered",
  payload: {
    tunnel_id: string,         // Unique tunnel identifier
    public_url: string,        // Public WebSocket URL
    restored?: boolean         // Was previous tunnel_id restored/reclaimed?
  }
}
```

#### Tunnel ID Persistence

The `tunnel_id` is a **persistent workstation identifier** that survives:
- Workstation server restarts (stored in SQLite database)
- Tunnel server restarts (workstation can reclaim its `tunnel_id`)

**Reconnection Behavior:**

1. **Workstation reconnects to same tunnel server** (tunnel server didn't restart):
   - If `previous_tunnel_id` exists in tunnel registry → socket is updated, `restored: true`
   - If `previous_tunnel_id` not found → new `tunnel_id` generated

2. **Workstation reconnects after tunnel server restart**:
   - If `previous_tunnel_id` is available (not in use) → workstation reclaims it, `restored: false`
   - If `previous_tunnel_id` is in use by another workstation → new `tunnel_id` generated
   - This ensures `tunnel_id` persistence across tunnel server restarts

**Important:** The workstation stores its `tunnel_id` in its local database. On reconnection, it always sends `previous_tunnel_id` to attempt reclaiming the same identifier.

// Tunnel → Workstation (error)
{
  type: "error",
  payload: {
    code: "INVALID_API_KEY" | "REGISTRATION_FAILED",
    message: string
  }
}
```

### 2.2 Mobile Client Connection

```typescript
// Mobile → Tunnel
{
  type: "connect",
  payload: {
    tunnel_id: string,         // Target workstation tunnel ID
    auth_key: string,          // Workstation auth key
    device_id: string,         // Unique device identifier
    reconnect?: boolean        // Is this a reconnection?
  }
}

// Tunnel → Mobile (success)
{
  type: "connected",
  payload: {
    tunnel_id: string,
    restored?: boolean         // Was connection restored?
  }
}

// Tunnel → Mobile (error)
{
  type: "error",
  payload: {
    code: "WORKSTATION_OFFLINE" | "INVALID_AUTH_KEY" | "TUNNEL_NOT_FOUND",
    message: string
  }
}
```

### 2.3 Message Forwarding

After successful connection, Tunnel forwards all messages bidirectionally:

```
Mobile ──► Tunnel ──► Workstation
Mobile ◄── Tunnel ◄── Workstation
```

### 2.4 Connection Events

```typescript
// Tunnel → Mobile (workstation status changes)
{ type: "connection.workstation_offline", payload: { tunnel_id: string } }
{ type: "connection.workstation_online", payload: { tunnel_id: string } }
```

### 2.5 Tunnel Heartbeat

Tunnel Server monitors connections from both Workstations and Mobile clients.

#### Workstation ↔ Tunnel

| Role | Obligation |
|------|------------|
| Workstation | Sends `ping` every 20 seconds |
| Tunnel | Responds with `pong` |
| Tunnel | Marks Workstation offline if no ping for 30 seconds |
| Tunnel | Notifies connected Mobile clients via `connection.workstation_offline` |

#### Mobile ↔ Tunnel

| Role | Obligation |
|------|------------|
| Mobile | Sends `ping` every 20 seconds |
| Tunnel | Responds with `pong` |
| Tunnel | Closes connection if no ping for 30 seconds |

---

## 3. Workstation Server Protocol

### 3.1 Authentication

```typescript
// Mobile → Workstation (via Tunnel, first message after connect)
{
  type: "auth",
  payload: {
    auth_key: string,          // Workstation auth key
    device_id: string          // Unique device identifier
  }
}

// Workstation → Mobile (success)
{
  type: "auth.success",
  payload: {
    device_id: string,
    restored_subscriptions?: string[]  // Session IDs (on reconnect)
  }
}

// Workstation → Mobile (error)
{
  type: "auth.error",
  payload: {
    code: "INVALID_AUTH_KEY",
    message: string
  }
}
```

### 3.2 Connection Health & Heartbeat

All WebSocket connections must implement heartbeat mechanism to detect stale connections.

#### 3.2.1 Heartbeat Messages

```typescript
{ type: "ping", timestamp: number }
{ type: "pong", timestamp: number }
```

#### 3.2.2 Timing Requirements

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PING_INTERVAL` | 20 seconds | How often to send ping |
| `PONG_TIMEOUT` | 30 seconds | Max time to wait for pong |
| `RECONNECT_DELAY_MIN` | 1 second | Initial reconnect delay |
| `RECONNECT_DELAY_MAX` | 30 seconds | Maximum reconnect delay |
| `RECONNECT_BACKOFF` | exponential | Delay doubles on each attempt |

#### 3.2.3 Connection State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐│
│CONNECTING│──►│CONNECTED │──►│  STALE   │──►│RECONNECT ││
└──────────┘   └──────────┘   └──────────┘   │  ING     ││
                    ▲              │          └────┬─────┘│
                    │              │               │      │
                    │              ▼               │      │
                    │         ┌──────────┐         │      │
                    └─────────│DISCONNECT│◄────────┘      │
                              │   ED     │                │
                              └────┬─────┘                │
                                   │   (max retries)      │
                                   ▼                      │
                              ┌──────────┐                │
                              │  DEAD    │────────────────┘
                              └──────────┘   (manual reconnect)
```

#### 3.2.4 Heartbeat Obligations

**Initiator (who sends ping):**

| Connection | Ping Sender |
|------------|-------------|
| Mobile ↔ Tunnel | Mobile |
| Tunnel ↔ Workstation | Workstation |

**Responder obligations:**
- MUST respond with `pong` within 5 seconds of receiving `ping`
- `pong.timestamp` MUST match `ping.timestamp`

**Sender obligations:**
- MUST send `ping` every `PING_INTERVAL`
- If no `pong` received within `PONG_TIMEOUT`, MUST consider connection stale
- MUST close stale connection and initiate reconnect

#### 3.2.5 Reconnection Logic

```typescript
// Pseudocode
let delay = RECONNECT_DELAY_MIN;
let attempts = 0;

while (not connected) {
  wait(delay);
  try {
    connect();
    authenticate();
    sync();  // Restore state
    break;
  } catch (error) {
    attempts++;
    delay = min(delay * 2, RECONNECT_DELAY_MAX);
  }
}
```

#### 3.2.6 Connection Events During Reconnect

**Tunnel → Mobile** (when Workstation reconnects):
```typescript
{ type: "connection.workstation_online", payload: { tunnel_id: string } }
```

**Tunnel → Mobile** (when Workstation disconnects):
```typescript
{ type: "connection.workstation_offline", payload: { tunnel_id: string } }
```

**Mobile behavior when Workstation offline:**
- SHOULD show "Workstation offline" status
- SHOULD queue commands (optional)
- MUST NOT close connection to Tunnel
- MUST wait for `workstation_online` event

---

## 4. Supervisor Commands

Supervisor manages session lifecycle. Project/workspace management is done through natural language commands to the Supervisor Agent session.

### 4.1 List Sessions

```typescript
// Request
{
  type: "supervisor.list_sessions",
  id: string  // Request ID for response correlation
}

// Response
{
  type: "response",
  id: string,
  payload: {
    sessions: Array<{
      session_id: string,
      session_type: "cursor" | "claude" | "opencode" | "terminal" | "supervisor",
      status: "active" | "idle" | "busy",
      workspace?: string,
      project?: string,
      worktree?: string,
      created_at: number
    }>
  }
}
```

### 4.2 Create Session

```typescript
// Request
{
  type: "supervisor.create_session",
  id: string,
  payload: {
    session_type: "cursor" | "claude" | "opencode" | "terminal",
    workspace: string,
    project: string,
    worktree?: string  // Optional, defaults to main project folder
  }
}

// Response
{
  type: "response",
  id: string,
  payload: {
    session_id: string,
    session_type: string,
    working_dir: string
  }
}

// Event (broadcasted to all connected clients)
{
  type: "session.created",
  session_id: string,
  payload: {
    session_type: string,
    workspace: string,
    project: string,
    worktree?: string,
    working_dir: string
  }
}
```

### 4.3 Terminate Session

```typescript
// Request
{
  type: "supervisor.terminate_session",
  id: string,
  payload: {
    session_id: string
  }
}

// Response
{
  type: "response",
  id: string,
  payload: {
    session_id: string,
    terminated: true
  }
}

// Event (broadcasted)
{
  type: "session.terminated",
  session_id: string
}
```

---

## 5. Session Commands

### 5.1 Subscribe / Unsubscribe

```typescript
// Subscribe to session output
{
  type: "session.subscribe",
  session_id: string
}

// Confirmation
{
  type: "session.subscribed",
  session_id: string
}

// Unsubscribe
{
  type: "session.unsubscribe",
  session_id: string
}

// Confirmation
{
  type: "session.unsubscribed",
  session_id: string
}
```

### 5.2 Execute Command

Unified command for text and audio input with optional TTS output.

```typescript
// Request
{
  type: "session.execute",
  id: string,
  session_id: string,
  payload: {
    // Input: XOR (text OR audio, not both)
    text?: string,              // Text command
    audio?: string,             // Base64 encoded audio
    audio_format?: string,      // "m4a" | "wav" | "mp3" (required if audio)
    
    // Options
    language?: string,          // Language hint for STT/TTS ("en", "ru", ...)
    tts_enabled?: boolean       // Synthesize speech in response?
  }
}

// Response (immediate acknowledgment)
{
  type: "response",
  id: string,
  payload: {
    accepted: true,
    session_id: string
  }
}
```

### 5.3 Terminal Input (PTY sessions only)

```typescript
{
  type: "session.input",
  session_id: string,
  payload: {
    data: string  // Raw terminal input
  }
}
```

### 5.4 Terminal Resize (PTY sessions only)

```typescript
{
  type: "session.resize",
  session_id: string,
  payload: {
    cols: number,
    rows: number
  }
}
```

---

## 6. Session Events

All events are sent only to clients subscribed to the session.

### 6.1 Unified Output

```typescript
{
  type: "session.output",
  session_id: string,
  payload: {
    // Content type
    content_type: "agent" | "terminal" | "transcription",
    
    // Content
    content: string,
    
    // Metadata
    timestamp: number,
    
    // For agent output
    is_complete?: boolean,      // Is this the final message?
    
    // For agent output with TTS (only when is_complete=true && tts_enabled)
    audio?: string              // Base64 encoded audio
  }
}
```

#### Content Types

| Type | Source | Description |
|------|--------|-------------|
| `agent` | Headless Agent | Streaming AI response |
| `terminal` | PTY | Raw terminal output |
| `transcription` | STT | Speech-to-text result |

### 6.2 Session Error

```typescript
{
  type: "session.error",
  session_id: string,
  payload: {
    code: string,
    message: string
  }
}
```

---

## 7. Sync & Recovery

### 7.1 State Synchronization (after reconnect)

```typescript
// Request
{
  type: "sync",
  id: string
}

// Response
{
  type: "sync.state",
  id: string,
  payload: {
    sessions: Array<{
      session_id: string,
      session_type: string,
      status: string
    }>,
    subscriptions: string[]  // Session IDs client was subscribed to
  }
}
```

### 7.2 Message Replay (recover missed messages)

```typescript
// Request
{
  type: "session.replay",
  session_id: string,
  payload: {
    since_timestamp: number,   // Replay messages after this timestamp
    limit?: number             // Max messages (default: 100)
  }
}

// Response
{
  type: "session.replay.data",
  session_id: string,
  payload: {
    messages: Array<{
      content_type: string,
      content: string,
      timestamp: number
    }>,
    has_more: boolean
  }
}
```

---

## 8. Error Handling

### 8.1 Error Response

```typescript
{
  type: "error",
  id?: string,  // Present if responding to a specific request
  payload: {
    code: string,
    message: string,
    details?: any
  }
}
```

### 8.2 Error Codes

| Code | Description |
|------|-------------|
| `INVALID_AUTH_KEY` | Authentication failed |
| `SESSION_NOT_FOUND` | Session ID does not exist |
| `SESSION_BUSY` | Session is processing another command |
| `INVALID_PAYLOAD` | Request payload validation failed |
| `INTERNAL_ERROR` | Server-side error |
| `WORKSTATION_OFFLINE` | Workstation is not connected |
| `TUNNEL_NOT_FOUND` | Tunnel ID does not exist |

---

## 9. Message Summary

### Client → Server (Commands)

| Type | Description |
|------|-------------|
| `auth` | Authenticate client |
| `ping` | Heartbeat |
| `sync` | Request state sync (after reconnect) |
| `supervisor.list_sessions` | List active sessions |
| `supervisor.create_session` | Create new session |
| `supervisor.terminate_session` | Terminate session |
| `session.subscribe` | Subscribe to session output |
| `session.unsubscribe` | Unsubscribe from session |
| `session.execute` | Execute command (text/audio) |
| `session.input` | PTY input |
| `session.resize` | PTY resize |
| `session.replay` | Request missed messages |

### Server → Client (Events)

| Type | Description |
|------|-------------|
| `auth.success` | Authentication successful |
| `auth.error` | Authentication failed |
| `pong` | Heartbeat response |
| `response` | Response to command (by id) |
| `error` | Error response |
| `sync.state` | State sync data |
| `session.created` | Session was created |
| `session.terminated` | Session was terminated |
| `session.subscribed` | Subscribed to session |
| `session.unsubscribed` | Unsubscribed from session |
| `session.output` | Session output (agent/terminal/transcription) |
| `session.error` | Session error |
| `session.replay.data` | Replayed messages |
| `connection.workstation_offline` | Workstation disconnected |
| `connection.workstation_online` | Workstation reconnected |

### Tunnel-specific

| Type | Description |
|------|-------------|
| `workstation.register` | Register workstation |
| `workstation.registered` | Registration successful |
| `connect` | Connect to workstation |
| `connected` | Connection successful |

---

## 10. Security Considerations

1. **All connections over TLS** — WSS only in production
2. **API Key for Tunnel Registration** — Workstations authenticate with `TUNNEL_REGISTRATION_API_KEY`
3. **Auth Key for Client Access** — Mobile clients authenticate with workstation's `WORKSTATION_AUTH_KEY`
4. **Device ID Tracking** — Clients identified by `device_id` for subscription restoration
5. **No sensitive data in logs** — Keys and audio data must not be logged

---

## 11. QR Code / Magic Link Payload

For initial mobile client setup, the magic link format uses a single base64-encoded query parameter:

```
tiflis://connect?data=<base64_encoded_json>
```

**Query parameter:**
- `data` (required) - Base64-encoded JSON payload containing connection information

**JSON payload structure:**
```json
{
  "tunnel_id": "Z6q62aKz-F96",
  "url": "wss://tunnel.example.com/ws",
  "key": "my-workstation-auth-key"
}
```

**Fields:**
- `tunnel_id` (required) - Workstation tunnel ID (persistent identifier)
- `url` (required) - Tunnel server base WebSocket URL without query parameters (e.g., `wss://tunnel.example.com/ws`)
- `key` (required) - Workstation auth key for client authentication

**Important:** The `url` field must contain only the base WebSocket address without any query parameters. The `tunnel_id` is provided separately in the payload and should not be included in the URL.

**Example:**
```
tiflis://connect?data=eyJ0dW5uZWxfaWQiOiJaNnE2MmFLei1GOTYiLCJ1cmwiOiJ3c3M6Ly90dW5uZWwuZXhhbXBsZS5jb20vd3MiLCJrZXkiOiJteS13b3Jrc3RhdGlvbi1hdXRoLWtleSJ9
```

**Decoded payload (for reference):**
```json
{
  "tunnel_id": "Z6q62aKz-F96",
  "url": "wss://tunnel.example.com/ws",
  "key": "my-workstation-auth-key"
}
```

**Note:** The URL must be the base WebSocket address only. Do not include `tunnel_id` as a query parameter in the URL, as it is already provided in the JSON payload.

**Note:** The `tunnel_id` is the persistent workstation identifier that must be included in the magic link so mobile clients can route to the correct workstation. The `tunnel_id` persists across both workstation and tunnel server restarts, ensuring stable routing.

---

*This document is the authoritative specification for the tiflis-code WebSocket protocol.*

