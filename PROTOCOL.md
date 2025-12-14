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
  <img src="https://img.shields.io/badge/version-1.10-blue" alt="Version 1.10">
  <img src="https://img.shields.io/badge/status-Draft-orange" alt="Draft">
  <img src="https://img.shields.io/badge/transport-WebSocket%20%7C%20HTTP-green" alt="WebSocket | HTTP">
</p>

---

## Changelog

### Version 1.10 (Current)
- **Added:** `audio.request` / `audio.response` messages for on-demand audio retrieval
- **Added:** `current_streaming_blocks` in `session.subscribed` for devices joining mid-generation
- **Added:** `executingStates` map in `sync.state` for per-session execution status
- **Added:** `supervisorIsExecuting` flag in `sync.state` for supervisor processing state
- **Added:** Terminal master/non-master client model for resize authority
- **Added:** Sequence-based gap detection and targeted replay for terminal sessions
- **Added:** Agent session history replay on subscription (last 50 messages)
- **Enhanced:** `session.subscribed` now includes `history` and `is_executing` fields
- **Enhanced:** Terminal replay supports `first_sequence`, `last_sequence`, `current_sequence` metadata
- **Enhanced:** Action buttons now support `send:`, `url:`, `session:`, and custom actions

### Version 1.9
- **Added:** Application-level `heartbeat` message for end-to-end connectivity verification
- **Added:** `heartbeat.ack` response with workstation uptime
- **Added:** Extended connection states: `verified`, `degraded` for accurate status display
- **Enhanced:** Connection health monitoring now distinguishes transport vs application-level issues
- **Timing:** `HEARTBEAT_INTERVAL=10s`, `HEARTBEAT_TIMEOUT=5s`, ~20 seconds dead workstation detection

### Version 1.8
- **Added:** HTTP Polling API for watchOS clients (Apple blocks WebSocket on watchOS 9+)
- **Added:** `/api/v1/watch/connect`, `/api/v1/watch/command`, `/api/v1/watch/messages`, `/api/v1/watch/state`, `/api/v1/watch/disconnect` endpoints
- **Added:** Message queue with sequence numbers for reliable polling
- **Enhanced:** Architecture now supports both WebSocket and HTTP polling transports

### Version 1.7
- **Added:** `cancel` content block type for user-initiated cancellation messages
- **Added:** `supervisor.cancel` command to cancel in-progress Supervisor execution
- **Added:** `session.cancel` command to cancel in-progress agent command execution
- **Enhanced:** Stop generation button in mobile UI (replaces send button during generation)
- **Changed:** Cancellation messages now use dedicated `cancel` block type instead of `status`

### Version 1.6
- **Added:** Voice messaging support for Supervisor and Agent sessions
- **Added:** `supervisor.command` now accepts `audio`, `audio_format`, and `message_id` for voice input
- **Added:** `supervisor.transcription` event for STT results with `message_id` tracking
- **Added:** `supervisor.voice_output` event for TTS audio delivery
- **Added:** `session.execute` now accepts `message_id` for voice input tracking
- **Added:** `session.transcription` event for agent session STT results
- **Added:** `session.voice_output` event for agent session TTS audio
- **Enhanced:** `voice_input` content block with `audio_base64` and `has_audio` fields
- **Enhanced:** `voice_output` content block with `audio_base64`, `message_id`, and `has_audio` fields
- **Enhanced:** `sync.state` audio optimization — uses `has_audio` flags instead of full audio data
- **Enhanced:** TTS responses summarized to 3 sentences max before synthesis

### Version 1.5
- **Added:** `workspaces_root` field in `auth.success` payload for computing relative paths on mobile clients
- **Enhanced:** Mobile clients now display relative working directory paths instead of absolute paths

### Version 1.4
- **Added:** `content_blocks` field in `supervisorHistory` for persisting structured content (tool calls, code blocks)
- **Added:** Message `sequence` field for ordering in database and sync
- **Enhanced:** Chat history now preserves rich content across app restarts

### Version 1.3
- **Added:** Multi-device synchronization for Supervisor chat
- **Added:** `supervisor.user_message` broadcast event for syncing user messages across devices
- **Added:** `supervisor.context_cleared` broadcast event for syncing context clear across devices
- **Added:** `supervisorHistory` in `sync.state` payload for restoring chat history on reconnect
- **Enhanced:** Supervisor chat history is now global (shared across all devices connected to workstation)

### Version 1.2
- **Added:** `content_blocks` array in `session.output` for structured agent output (text, code, tool calls, thinking, status, error)
- **Added:** `supervisor.output` streaming message for Supervisor Agent chat
- **Added:** `supervisor.command` now returns streaming output instead of blocking response
- **Added:** `supervisor.clear_context` command documented
- **Enhanced:** Rich UI rendering support with typed content blocks
- **Backward Compatible:** `content` field remains for terminal output and legacy clients

### Version 1.1
- **Added:** `terminal_config.buffer_size` field to `session.created` message for dynamic terminal buffer configuration
- **Enhanced:** Terminal sessions now receive server-configured buffer size instead of hardcoded values
- **Improved:** Mobile clients optimize memory usage based on server-provided buffer configuration

### Version 1.0
- Initial protocol specification
- Core session management and WebSocket communication
- Supervisor agent commands
- Terminal PTY support with resize and input/output

---

## 1. Overview

This document specifies the unified WebSocket-based communication protocol for the tiflis-code system.

### 1.1 Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
│   Mobile    │◄───────►│   Tunnel    │◄───────►│   Workstation   │
│(iOS/Android)│   WS    │   Server    │   WS    │     Server      │
└─────────────┘         └─────────────┘         └─────────────────┘
        ▲
        │ HTTP Polling (watchOS only)
        │
┌───────┴─────────┐
│  Watch Client   │
│    (watchOS)    │
└─────────────────┘
```

> **Note:** watchOS uses HTTP Polling instead of WebSocket because Apple blocks WebSocket on watchOS 9+.

### 1.2 Design Principles

1. **Single WebSocket Channel** — All communication through one multiplexed WebSocket connection
2. **Stateless Tunnel** — Tunnel Server is a pure reverse proxy with auth
3. **Session Persistence** — Sessions survive connection drops
4. **Subscription Model** — Clients subscribe to session outputs

### 1.3 Endpoints

| Component | HTTP | WebSocket | HTTP Polling (watchOS) |
|-----------|------|-----------|------------------------|
| Tunnel Server | `GET /health` | `/ws` | `/api/v1/watch/*` |
| Workstation Server | `GET /health` | `/ws` | N/A |

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
    tunnel_version?: string,   // Tunnel server version (semver, e.g., "0.1.0")
    protocol_version?: string, // Protocol version (semver, e.g., "1.0.0")
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
    workstation_name?: string,        // Display name of the workstation
    workstation_version?: string,     // Workstation server version (semver, e.g., "0.1.0")
    protocol_version?: string,        // Protocol version (semver, e.g., "1.0.0")
    workspaces_root?: string,         // Base directory for workspaces (for computing relative paths)
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

#### 3.2.7 Application-Level Heartbeat

The transport-level `ping/pong` mechanism (3.2.1) only verifies the connection between adjacent components:
- Mobile ↔ Tunnel connection
- Tunnel ↔ Workstation connection

It does NOT verify end-to-end connectivity from Mobile to Workstation. A `heartbeat` message type provides application-level verification that the complete path is functional.

**Message Format:**

```typescript
// Mobile → Workstation (via Tunnel)
{
  type: "heartbeat",
  id: string,           // UUID for correlation
  timestamp: number     // Unix milliseconds
}

// Workstation → Mobile (via Tunnel)
{
  type: "heartbeat.ack",
  id: string,           // Matching request ID
  timestamp: number,    // Echo of request timestamp
  workstation_uptime_ms: number  // Workstation process uptime
}
```

**Timing Requirements:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `HEARTBEAT_INTERVAL` | 10 seconds | How often to send heartbeat (when authenticated) |
| `HEARTBEAT_TIMEOUT` | 5 seconds | Max time to wait for ack |
| `MAX_HEARTBEAT_FAILURES` | 2 | Force reconnect after consecutive failures |

**Detection Time:** With these settings, a dead workstation is detected within ~20 seconds (2 failures × 10 seconds).

**Implementation Requirements:**

1. **Mobile Client:**
   - MUST send `heartbeat` every `HEARTBEAT_INTERVAL` when in authenticated state
   - MUST track pending heartbeat and start timeout timer
   - On `heartbeat.ack` received: reset failure counter, update connection state to "verified"
   - On timeout: increment failure counter, update connection state to "degraded"
   - If failure counter >= `MAX_HEARTBEAT_FAILURES`: force full reconnect

2. **Workstation:**
   - MUST respond to `heartbeat` with `heartbeat.ack` immediately
   - MUST include current process uptime

3. **Tunnel Server:**
   - MUST forward `heartbeat` and `heartbeat.ack` messages transparently (same as other commands)

**Connection States (extended):**

| State | Indicator | Description |
|-------|-----------|-------------|
| `authenticated` | Yellow-Green | Tunnel auth complete, awaiting first heartbeat |
| `verified` | Green | Heartbeat confirmed end-to-end connectivity |
| `degraded` | Orange | Heartbeat timeout detected, connection may be stale |

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
    working_dir: string,
    terminal_config?: {
      buffer_size: number  // Terminal output buffer size (for terminal sessions)
    }
  }
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique session identifier |
| `session_type` | string | Session type: `"terminal"`, `"cursor"`, `"claude"`, `"opencode"`, `"supervisor"` |
| `workspace` | string | Workspace name (optional) |
| `project` | string | Project name (optional) |
| `worktree` | string | Worktree name (optional) |
| `working_dir` | string | Working directory path |
| `terminal_config` | object | Terminal configuration (only for terminal sessions) |
| `terminal_config.buffer_size` | number | Terminal output buffer size (default: 100) |

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

### 4.4 Supervisor Chat (Natural Language Commands)

The Supervisor Agent supports natural language commands for workspace/project discovery,
worktree management, and session orchestration. Output is streamed using ContentBlocks.

Supports both text and voice input with optional TTS output.

```typescript
// Request (text input)
{
  type: "supervisor.command",
  id: string,
  payload: {
    command: string  // Natural language command (text)
  }
}

// Request (voice input)
{
  type: "supervisor.command",
  id: string,
  payload: {
    audio: string,           // Base64 encoded audio
    audio_format: string,    // "m4a" | "wav" | "mp3"
    message_id?: string      // Client-generated ID for tracking transcription
  }
}

// Response (immediate acknowledgment)
{
  type: "response",
  id: string,
  payload: {
    acknowledged: true
  }
}

// Streamed output (multiple events)
{
  type: "supervisor.output",
  payload: {
    content_type: "supervisor",
    content: string,                  // Plain text for backward compat
    content_blocks: ContentBlock[],   // Structured blocks (see section 6.1)
    timestamp: number,
    is_complete: boolean              // true = final message
  }
}
```

#### Voice Input Flow

1. Client sends `supervisor.command` with `audio` payload and `message_id`
2. Server performs STT (Speech-to-Text) transcription
3. Server broadcasts `supervisor.transcription` with transcribed text
4. Server processes command and streams `supervisor.output`
5. If TTS enabled, server sends `supervisor.voice_output` with synthesized audio

### 4.5 Clear Supervisor Context

```typescript
// Request
{
  type: "supervisor.clear_context",
  id: string
}

// Response
{
  type: "response",
  id: string,
  payload: {
    success: true
  }
}

// Broadcast to all connected devices
{
  type: "supervisor.context_cleared",
  payload: {
    timestamp: number
  }
}
```

### 4.6 Cancel Supervisor Execution

Cancels an in-progress supervisor command execution. This aborts the LangGraph agent stream and emits a "Command cancelled by user" status block.

```typescript
// Request
{
  type: "supervisor.cancel",
  id: string
}

// Response
{
  type: "response",
  id: string,
  payload: {
    cancelled: boolean     // true if cancellation was processed
  }
}
```

#### Behavior

- If the supervisor is executing a command, the LangGraph stream will be aborted
- A status block with "Command cancelled by user" will be emitted via `supervisor.output` with `is_complete: true`
- If no command is executing, the request is acknowledged but has no effect
- The supervisor maintains conversation history up to the point of cancellation

### 4.7 Multi-Device Synchronization

Supervisor chat is **global** — shared across all devices connected to the same workstation.
When one device sends a message, all other devices receive it in real-time.

#### User Message Broadcast

When a client sends `supervisor.command`, the server broadcasts the user message to all connected devices:

```typescript
// Server → All clients (broadcast)
{
  type: "supervisor.user_message",
  payload: {
    content: string,           // The user's message
    timestamp: number,
    from_device_id: string     // Device that sent the message
  }
}
```

**Client behavior:**
- Compare `from_device_id` with local device ID
- If match → skip (message already added locally before sending)
- If different → add message to chat (from another device)

#### Supervisor Output Broadcast

All `supervisor.output` events are broadcast to **all** connected devices, not just the sender.

#### History Sync on Reconnect

When a client reconnects, it receives chat history in `sync.state`:

```typescript
{
  type: "sync.state",
  id: string,
  payload: {
    sessions: [...],
    subscriptions: [...],
    supervisorHistory?: Array<{    // Supervisor chat history
      role: "user" | "assistant",
      content: string,
      content_blocks?: ContentBlock[],  // Structured content (tool calls, code, etc.)
      sequence: number,                  // For ordering
      createdAt: string                  // ISO timestamp
    }>
  }
}
```

**Note:** History is limited to the last 50 messages. The `content_blocks` field contains structured content for rich UI rendering (tool calls, code blocks, thinking blocks, etc.).

### 4.8 Voice Events (Supervisor)

#### Transcription Event

Sent after STT processing of voice input:

```typescript
// Server → All clients (broadcast)
{
  type: "supervisor.transcription",
  payload: {
    text: string,              // Transcribed text
    message_id?: string,       // Original message_id from request
    error?: string             // Error message if transcription failed
  }
}
```

**Client behavior:**
- Find message with matching `message_id`
- Update `voice_input` block with transcription text
- If `error` is present, display error instead of transcription

#### Voice Output Event

Sent after TTS synthesis of response:

```typescript
// Server → All clients (broadcast)
{
  type: "supervisor.voice_output",
  payload: {
    audio: string,             // Base64 encoded audio (MP3/WAV)
    message_id: string,        // Unique ID for audio caching
    duration?: number          // Audio duration in seconds
  }
}
```

**Client behavior:**
- Cache audio data using `message_id` as key
- Auto-play if TTS is enabled in settings
- Add `voice_output` block to last assistant message

**Note:** Long responses are automatically summarized to ~3 sentences before TTS synthesis to keep audio concise.

### 4.9 Audio Request/Response (On-Demand Audio)

Audio data is excluded from `sync.state` to reduce message size. Clients can request audio on-demand:

```typescript
// Request audio for a specific message
// Mobile → Workstation
{
  type: "audio.request",
  id: string,
  payload: {
    message_id: string,             // Message ID containing voice block
    audio_type: "input" | "output"  // Voice input or TTS output
  }
}

// Response with audio data
// Workstation → Mobile
{
  type: "audio.response",
  id: string,
  payload: {
    message_id: string,
    audio_type: "input" | "output",
    audio?: string,           // Base64 encoded audio (if found)
    error?: string            // Error message (if not found)
  }
}
```

**Client Implementation:**

1. On `sync.state` or `session.subscribed`, voice blocks have `has_audio: true` without actual data
2. When user taps play button, send `audio.request` with `message_id`
3. On `audio.response`, cache audio locally and start playback
4. Handle `error` gracefully (show "Audio unavailable")

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
  session_id: string,
  payload?: {
    // For terminal sessions:
    is_master?: boolean,  // Whether this client controls terminal size
    cols?: number,        // Current terminal columns
    rows?: number,        // Current terminal rows

    // For agent sessions:
    is_executing?: boolean,           // Is agent currently executing a command?
    history?: Array<{                 // Message history (last 50 messages)
      role: "user" | "assistant",
      content: string,
      content_blocks?: ContentBlock[],
      timestamp: number
    }>,
    current_streaming_blocks?: ContentBlock[]  // In-progress response blocks (if is_executing=true)
  }
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

#### Terminal Session Master Client

For terminal sessions, the **first subscriber becomes the "master"** and controls the terminal size:

- **Master client**: Can resize the terminal. Resize requests are accepted.
- **Non-master clients**: Cannot resize. Receive the current terminal size in `session.subscribed` and should sync their local terminal to match.

When the master unsubscribes, the next client to subscribe becomes the new master.

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

    // Voice tracking
    message_id?: string,        // Client-generated ID for tracking transcription

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

#### Voice Input Flow (Agent Sessions)

1. Client sends `session.execute` with `audio` payload and `message_id`
2. Server performs STT transcription
3. Server sends `session.transcription` with transcribed text
4. Agent processes command and streams `session.output`
5. If TTS enabled, server sends `session.voice_output` with synthesized audio

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
// Request
{
  type: "session.resize",
  session_id: string,
  payload: {
    cols: number,
    rows: number
  }
}

// Response
{
  type: "session.resized",
  session_id: string,
  payload: {
    success: boolean,
    cols: number,         // Actual terminal columns (may differ due to min constraints)
    rows: number,         // Actual terminal rows (may differ due to min constraints)
    reason?: "not_master" | "inactive"  // Present if success=false
  }
}
```

#### Resize Constraints

- **Minimum size**: 40 columns × 24 rows (ensures proper TUI app display)
- **Master only**: Only the master client can resize the terminal
- If a non-master client attempts resize, `success=false` with `reason="not_master"` is returned
- The response always contains the actual terminal size (useful for clients to sync)

### 5.5 Cancel Command (Agent sessions only)

Cancels an in-progress agent command execution. This will kill the agent process and emit a "Command cancelled by user" status block.

```typescript
// Request
{
  type: "session.cancel",
  id: string,              // Request ID
  session_id: string       // Target session
}

// Response
{
  type: "response",
  id: string,
  payload: {
    cancelled: boolean     // true if cancellation was processed
  }
}
```

#### Behavior

- If the session is executing a command, it will be terminated immediately
- A status block with "Command cancelled by user" will be emitted via `session.output`
- If no command is executing, the request is acknowledged but has no effect
- Works only for agent sessions (cursor, claude, opencode), not terminal sessions

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

    // Plain text content (for terminal output and backward compatibility)
    content: string,

    // Structured content blocks for rich UI (agent output only)
    content_blocks?: ContentBlock[],

    // Metadata
    timestamp: number,

    // For terminal output - sequence number for deduplication and gap detection
    sequence?: number,          // Monotonically increasing counter (terminal only)

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
| `agent` | Headless Agent | Streaming AI response with structured blocks |
| `terminal` | PTY | Raw terminal output (uses `content` only) |
| `transcription` | STT | Speech-to-text result |

#### Content Blocks (for `content_type: "agent"`)

When `content_type` is `"agent"`, the `content_blocks` array provides structured typed blocks for rich UI rendering:

```typescript
// Base interface
interface ContentBlock {
  id: string,
  block_type: string,
  content: string,
  metadata?: Record<string, unknown>
}

// Text block
{
  id: string,
  block_type: "text",
  content: string    // Plain text content
}

// Code block
{
  id: string,
  block_type: "code",
  content: string,   // Code content
  metadata: {
    language?: string  // e.g., "typescript", "python"
  }
}

// Tool call block
{
  id: string,
  block_type: "tool",
  content: string,   // Tool name
  metadata: {
    tool_name: string,
    tool_input?: string,   // JSON stringified
    tool_output?: string,  // JSON stringified
    tool_status: "running" | "completed" | "failed"
  }
}

// Thinking/reasoning block
{
  id: string,
  block_type: "thinking",
  content: string    // Reasoning content
}

// Status block
{
  id: string,
  block_type: "status",
  content: string    // Status message
}

// Error block
{
  id: string,
  block_type: "error",
  content: string,   // Error message
  metadata?: {
    error_code?: string
  }
}

// Cancel block (user-initiated cancellation)
{
  id: string,
  block_type: "cancel",
  content: string    // Cancellation message (e.g., "Cancelled by user")
}

// Voice input block (user's voice message)
{
  id: string,
  block_type: "voice_input",
  content: string,   // Transcription (may be empty while transcribing)
  metadata: {
    audio_url?: string,      // URL to audio file (if available)
    audio_base64?: string,   // Base64 encoded audio (for sync)
    has_audio?: boolean,     // True if audio available (sync optimization)
    duration?: number        // Audio duration in seconds
  }
}

// Voice output block (TTS audio)
{
  id: string,
  block_type: "voice_output",
  content: string,   // Text that was spoken (or message_id for audio lookup)
  metadata: {
    message_id?: string,     // Unique ID for audio caching
    audio_base64?: string,   // Base64 encoded audio
    has_audio?: boolean,     // True if audio available (sync optimization)
    duration?: number        // Audio duration in seconds
  }
}

// Action buttons block
{
  id: string,
  block_type: "action_buttons",
  content: "",
  metadata: {
    buttons: Array<{
      id: string,
      title: string,
      icon?: string,
      style: "primary" | "secondary" | "destructive",
      action: string  // "send:<message>", "url:<url>", "session:<type>", or custom
    }>
  }
}
```

**Example Agent Output:**

```json
{
  "type": "session.output",
  "session_id": "agent-123",
  "payload": {
    "content_type": "agent",
    "content": "I'll analyze the code...",
    "content_blocks": [
      {
        "id": "b1",
        "block_type": "status",
        "content": "Analyzing codebase..."
      },
      {
        "id": "b2",
        "block_type": "tool",
        "content": "read_file",
        "metadata": {
          "tool_name": "read_file",
          "tool_input": "{\"path\": \"src/main.ts\"}",
          "tool_status": "running"
        }
      },
      {
        "id": "b3",
        "block_type": "thinking",
        "content": "I can see this is a TypeScript project using Node.js..."
      },
      {
        "id": "b4",
        "block_type": "text",
        "content": "Here's what I found:"
      },
      {
        "id": "b5",
        "block_type": "code",
        "content": "import express from 'express';\\nconst app = express();",
        "metadata": {
          "language": "typescript"
        }
      }
    ],
    "timestamp": 1701700000000,
    "is_complete": false
  }
}
```

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

### 6.3 Voice Events (Agent Sessions)

#### Transcription Event

Sent after STT processing of voice input:

```typescript
{
  type: "session.transcription",
  session_id: string,
  payload: {
    text: string,              // Transcribed text
    message_id?: string,       // Original message_id from request
    error?: string             // Error message if transcription failed
  }
}
```

#### Voice Output Event

Sent after TTS synthesis of agent response:

```typescript
{
  type: "session.voice_output",
  session_id: string,
  payload: {
    audio: string,             // Base64 encoded audio (MP3/WAV)
    message_id: string,        // Unique ID for audio caching
    duration?: number          // Audio duration in seconds
  }
}
```

**Note:** Long agent responses are automatically summarized to ~3 sentences before TTS synthesis.

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
      status: string,
      workspace?: string,
      project?: string,
      worktree?: string,
      working_dir?: string,
      agent_alias?: string      // Custom alias name (e.g., "zai")
    }>,
    subscriptions: string[],    // Session IDs client was subscribed to
    supervisorHistory?: Array<{
      role: "user" | "assistant",
      content: string,
      content_blocks?: ContentBlock[],
      sequence: number,
      createdAt: string
    }>,

    // Execution state (for UI indicators)
    supervisorIsExecuting?: boolean,       // Is supervisor currently processing?
    executingStates?: Record<string, boolean>,  // Map of session_id → is_executing

    // In-progress streaming (for devices joining mid-generation)
    currentStreamingBlocks?: ContentBlock[]    // Supervisor's current response blocks
  }
}
```

#### Audio Optimization in Sync

To reduce `sync.state` message size, audio data is **not included** during synchronization:

- `voice_input` and `voice_output` blocks have `has_audio: true` instead of `audio_base64`
- Clients should display audio controls when `has_audio: true`
- Audio can be requested on-demand via separate API (future enhancement)

This optimization prevents "Message too long" errors when reconnecting with large chat histories containing voice messages.

### 7.2 Message Replay (recover missed messages)

```typescript
// Request
{
  type: "session.replay",
  session_id: string,
  payload: {
    since_timestamp?: number,  // Replay messages after this timestamp
    since_sequence?: number,   // Replay messages after this sequence (preferred for terminal)
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
      timestamp: number,
      sequence?: number        // Sequence number (terminal only)
    }>,
    has_more: boolean,

    // Sequence metadata for terminal sessions (gap detection)
    first_sequence?: number,   // Sequence of first message in response
    last_sequence?: number,    // Sequence of last message in response
    current_sequence?: number  // Server's current (latest) sequence number
  }
}
```

#### Sequence Numbers (Terminal Sessions)

Terminal sessions use monotonically increasing sequence numbers for:

1. **Deduplication** — Client tracks `lastReceivedSequence` to skip duplicates
2. **Gap Detection** — If received sequence > lastReceived + 1, messages were missed
3. **Targeted Replay** — Use `since_sequence` to request only missing messages

**Client Implementation:**

```typescript
// Track last received sequence
let lastReceivedSequence = 0;

function handleTerminalOutput(payload) {
  const { sequence, content } = payload;

  // Skip duplicates
  if (sequence <= lastReceivedSequence) return;

  // Detect gap - request replay
  if (sequence > lastReceivedSequence + 1) {
    requestReplay({ since_sequence: lastReceivedSequence });
    return;
  }

  // Process message
  lastReceivedSequence = sequence;
  feedToTerminal(content);
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
| `supervisor.command` | Natural language command to Supervisor Agent |
| `supervisor.clear_context` | Clear Supervisor chat history |
| `supervisor.cancel` | Cancel Supervisor command execution |
| `heartbeat` | Application-level connectivity check |
| `audio.request` | Request audio data for a message |
| `session.subscribe` | Subscribe to session output |
| `session.unsubscribe` | Unsubscribe from session |
| `session.execute` | Execute command (text/audio) |
| `session.input` | PTY input |
| `session.resize` | PTY resize |
| `session.replay` | Request missed messages |
| `session.cancel` | Cancel agent command execution |

### Server → Client (Events)

| Type | Description |
|------|-------------|
| `auth.success` | Authentication successful |
| `auth.error` | Authentication failed |
| `pong` | Heartbeat response |
| `response` | Response to command (by id) |
| `error` | Error response |
| `heartbeat.ack` | Heartbeat acknowledgment with workstation uptime |
| `audio.response` | Audio data response (or error if unavailable) |
| `sync.state` | State sync data (audio excluded, use `has_audio` flags) |
| `session.created` | Session was created |
| `session.terminated` | Session was terminated |
| `session.subscribed` | Subscribed to session (terminals: `is_master`/`cols`/`rows`; agents: `history`/`is_executing`/`current_streaming_blocks`) |
| `session.unsubscribed` | Unsubscribed from session |
| `session.resized` | Terminal resize result (success/failure, actual size) |
| `session.output` | Session output (agent/terminal/transcription), includes `sequence` for terminal |
| `session.error` | Session error |
| `session.transcription` | STT result for agent session voice input |
| `session.voice_output` | TTS audio for agent session response |
| `session.replay.data` | Replayed messages with sequence metadata |
| `supervisor.output` | Supervisor Agent streaming output (broadcast to all) |
| `supervisor.user_message` | User message broadcast for multi-device sync |
| `supervisor.context_cleared` | Context cleared broadcast for multi-device sync |
| `supervisor.transcription` | STT result for supervisor voice input |
| `supervisor.voice_output` | TTS audio for supervisor response |
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

## 10. HTTP Polling API (watchOS)

Apple blocks WebSocket connections on watchOS 9+. The tunnel server provides a REST API for watchOS clients.

### 10.1 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/watch/connect` | POST | Connect to tunnel |
| `/api/v1/watch/command` | POST | Send command to workstation |
| `/api/v1/watch/messages` | GET | Poll for new messages |
| `/api/v1/watch/state` | GET | Get connection state |
| `/api/v1/watch/disconnect` | POST | Disconnect |

### 10.2 Connect

```typescript
// Request
POST /api/v1/watch/connect
{
  tunnel_id: string,
  auth_key: string,
  device_id: string
}

// Response (success)
{
  success: true,
  tunnel_id: string,
  workstation_online: boolean,
  workstation_name?: string
}

// Response (error)
{
  error: "tunnel_not_found" | "invalid_auth_key",
  message: string
}
```

### 10.3 Send Command

```typescript
// Request
POST /api/v1/watch/command
{
  device_id: string,
  message: {
    type: string,
    payload: any,
    id?: string
  }
}

// Response (success)
{
  success: true
}

// Response (error)
{
  error: "send_failed" | "workstation_offline",
  message: string
}
```

### 10.4 Poll Messages

```typescript
// Request
GET /api/v1/watch/messages?device_id=xxx&since=0&ack=5

// Query params:
// - device_id (required): Client device ID
// - since: Sequence number to get messages after (default: 0)
// - ack: Acknowledge messages up to this sequence (optional)

// Response
{
  messages: Array<{
    sequence: number,
    timestamp: string,
    data: any  // Original WebSocket message
  }>,
  current_sequence: number,
  workstation_online: boolean
}
```

### 10.5 Get State

```typescript
// Request
GET /api/v1/watch/state?device_id=xxx

// Response
{
  connected: boolean,
  workstation_online: boolean,
  workstation_name?: string,
  queue_size: number,
  current_sequence: number
}
```

### 10.6 Disconnect

```typescript
// Request
POST /api/v1/watch/disconnect
{
  device_id: string
}

// Response
{
  success: boolean
}
```

### 10.7 Polling Strategy

**Recommended intervals:**

| State | Interval | Description |
|-------|----------|-------------|
| **Active** | 1 second | When expecting responses (after sending command) |
| **Idle** | 5 seconds | Connection keepalive |
| **Background** | 30 seconds | Minimal polling when app is backgrounded |

**Acknowledgment flow:**

1. Client polls with `since=0` to get all pending messages
2. Client processes messages up to sequence `N`
3. Client polls with `since=N&ack=N` to acknowledge and get newer messages
4. Server removes acknowledged messages from queue

**Cleanup:**

- Inactive HTTP clients are removed after 5 minutes of no polls
- Message queue limited to prevent memory growth

---

## 11. Security Considerations

1. **All connections over TLS** — WSS only in production, HTTPS for HTTP Polling API
2. **API Key for Tunnel Registration** — Workstations authenticate with `TUNNEL_REGISTRATION_API_KEY`
3. **Auth Key for Client Access** — Mobile clients authenticate with workstation's `WORKSTATION_AUTH_KEY`
4. **Device ID Tracking** — Clients identified by `device_id` for subscription restoration
5. **No sensitive data in logs** — Keys and audio data must not be logged

---

## 12. QR Code / Magic Link Payload

Magic link format: `tiflis://connect?data=<base64_encoded_json>`

**JSON payload:**
```json
{
  "tunnel_id": "Z6q62aKz-F96",
  "url": "wss://tunnel.example.com/ws",
  "key": "my-workstation-auth-key"
}
```

| Field | Description |
|-------|-------------|
| `tunnel_id` | Persistent workstation identifier |
| `url` | Tunnel server WebSocket URL (base URL only, no query params) |
| `key` | Workstation auth key |

### 12.1 Connection Flow

1. Workstation starts → Generates terminal QR (ASCII via `qrcode` npm) and magic link
2. User scans QR in iOS app (Settings → Scan QR Code)
3. App decodes base64, parses JSON → Auto-configures connection
4. WebSocket connection established

---

*This document is the authoritative specification for the tiflis-code WebSocket protocol.*

