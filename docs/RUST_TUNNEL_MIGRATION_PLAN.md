# Rust Tunnel Migration Plan

## Overview

Simplify architecture by making Rust tunnel a **transparent proxy**. Workstation becomes a pure local server with zero tunnel awareness.

## Current Architecture (Complex)

```
Mobile ──WSS──► TypeScript Tunnel ──WSS──► TypeScript Workstation
                    │                            │
                    │ (tunnel protocol)          │ (tunnel client code)
                    │ - workstation.register     │ - tunnel-client.ts
                    │ - connect/connected        │ - reconnection logic
                    │ - message forwarding       │ - registration
                    └────────────────────────────┘
```

**Problems:**
- Workstation has tunnel-specific code
- Complex registration/reconnection protocol
- Two WebSocket hops with custom message wrapping

## Target Architecture (Simple)

```
Mobile ──WSS──► Rust Tunnel Server ──QUIC──► Rust Tunnel Client ──WS──► Workstation
                (cloud/VPS)                  (on workstation)          (localhost:3001)
                     │                              │
                     │                              │
              Public endpoint              Transparent proxy
              /t/{workstation_id}/*        to localhost:3001
```

**Key insight:** The tunnel is just a network-level proxy. Workstation has **zero tunnel awareness**.

## What Changes

### Remove from Workstation

1. **Delete tunnel client code**
   - `packages/workstation/src/infrastructure/websocket/tunnel-client.ts`
   - All tunnel registration/reconnection logic

2. **Remove tunnel-specific protocol**
   - `workstation.register` / `workstation.registered`
   - `connect` / `connected` messages
   - Tunnel heartbeat logic

3. **Remove tunnel config**
   - `TUNNEL_URL` environment variable
   - `TUNNEL_API_KEY` environment variable
   - `tunnel_id` persistence in database

### Keep in Workstation (unchanged)

- Local HTTP/WebSocket server on `localhost:3001`
- All business logic (sessions, supervisor, agents)
- Client authentication (`auth` / `auth.success`)
- Application-level heartbeat
- All `supervisor.*` and `session.*` commands

### Deployment Model

**Workstation machine runs:**
```bash
# 1. Start workstation server (local only)
workstation --port 3001

# 2. Start tunnel client (connects to cloud tunnel)
tunnel-client \
  --server tunnel.example.com:443 \
  --api-key $API_KEY \
  --workstation-id my-workstation \
  --local-address http://localhost:3001
```

**Cloud/VPS runs:**
```bash
tunnel-server \
  --domain tunnel.example.com \
  --api-key $API_KEY
```

**Mobile connects to:**
```
wss://tunnel.example.com/t/my-workstation/ws
```

## Migration Steps

### Step 1: Update Workstation to Local-Only Mode

**Remove:**
```typescript
// Delete these files:
- src/infrastructure/websocket/tunnel-client.ts
- src/infrastructure/websocket/tunnel-connection.ts

// Remove from env.ts:
- TUNNEL_URL
- TUNNEL_API_KEY

// Remove from app.ts:
- Tunnel client initialization
- Tunnel registration logic
- Tunnel reconnection handling
```

**Keep:**
```typescript
// Workstation is now just a local Fastify server:
const app = fastify();
app.register(websocketPlugin);
app.listen({ port: 3001, host: '127.0.0.1' });  // Local only!
```

### Step 2: Update Mobile Clients

**Change connection URL:**
```swift
// Before:
let url = "wss://tunnel.example.com/ws"
// + send "connect" message with tunnel_id

// After:
let url = "wss://tunnel.example.com/t/\(workstationId)/ws"
// No "connect" message needed - directly sends "auth"
```

**Remove tunnel protocol handling:**
```swift
// Remove:
- "connect" / "connected" message handling
- "connection.workstation_offline" / "connection.workstation_online"
- Tunnel-level error codes
```

### Step 3: Update Protocol Documentation

**Remove from PROTOCOL.md:**
- Section 2 (Tunnel Server Protocol) - most of it
- `workstation.register` / `workstation.registered`
- `connect` / `connected`
- Tunnel heartbeat section

**Simplify to:**
```markdown
## Tunnel

The Rust tunnel is a transparent HTTP/WebSocket proxy.

- Mobile connects to: `wss://tunnel.example.com/t/{workstation_id}/ws`
- Tunnel proxies to workstation's local server
- No tunnel-specific protocol - just forwards bytes
```

### Step 4: Deprecate TypeScript Tunnel

- Delete `packages/tunnel/` directory
- Remove from `pnpm-workspace.yaml`
- Update CI/CD workflows
- Update install scripts

## New Deployment Options

### Option A: Docker Compose (Self-Hosted Tunnel)

```yaml
# On cloud VPS
services:
  tunnel-server:
    image: ghcr.io/tiflis-io/tunnel-server:latest
    ports:
      - "443:443"
    environment:
      SERVER_DOMAIN: tunnel.example.com
      AUTH_API_KEY: ${API_KEY}
```

```yaml
# On workstation machine
services:
  workstation:
    image: ghcr.io/tiflis-io/workstation:latest
    ports:
      - "3001:3001"
    # ... workstation config
    
  tunnel-client:
    image: ghcr.io/tiflis-io/tunnel-client:latest
    environment:
      SERVER_ADDRESS: tunnel.example.com:443
      AUTH_API_KEY: ${API_KEY}
      WORKSTATION_ID: my-workstation
      WORKSTATION_LOCAL_ADDRESS: http://workstation:3001
```

### Option B: Binary (Native)

```bash
# On workstation
./workstation &
./tunnel-client --server tunnel.example.com:443 --local http://localhost:3001
```

### Option C: Managed Tunnel (Future)

We could run a managed tunnel service - users just run tunnel-client pointing to our servers.

## HTTP Polling API Migration

The HTTP polling API (`/api/v1/watch/*` → `/api/v1/http/*`) currently lives in the TypeScript tunnel package. Since Rust tunnel is a transparent proxy, this must move to workstation.

### What to Migrate

**From `packages/tunnel/` to `packages/workstation/`:**

1. **Routes** - `src/infrastructure/http/watch-api-route.ts` → `http-polling-route.ts`
   - `POST /api/v1/http/connect`
   - `POST /api/v1/http/command`  
   - `GET /api/v1/http/messages`
   - `GET /api/v1/http/state`
   - `POST /api/v1/http/disconnect`

2. **Domain Entity** - `src/domain/entities/http-client.ts`
   - `HttpClient` class with message queue
   - Queue management (100 msg max, 5min TTL)
   - Sequence numbers for gap detection

3. **Use Case** - `src/application/http-client-operations.ts`
   - `HttpClientOperationsUseCase` class
   - Connect, send command, poll messages, get state, disconnect
   - Message queuing for broadcast

4. **Registry** - `src/domain/ports/http-client-registry.ts`
   - `HttpClientRegistry` interface
   - In-memory implementation

### Simplifications in Workstation

Since workstation handles auth directly (not tunnel), the API becomes simpler.

**Remove tunnel-specific concepts:**
- `TunnelId` value object → not needed (workstation is local)
- `WorkstationRegistry` → not needed (we ARE the workstation)
- `workstationOnline` checks → always true (we're running)

## Unified JWT Authentication (WebSocket + HTTP)

Complete auth redesign: Client-signed JWT tokens using shared secret from QR/magic link.

### Current Problems

1. **WebSocket**: Sends `auth_key` in plaintext via `auth` message after connect
2. **HTTP Polling**: Sends `auth_key` in every request body
3. **Inconsistent**: Two different auth flows for same workstation
4. **Insecure**: Raw secret transmitted repeatedly over the wire

### New Design: Client-Signed JWT

**Key insight:** The client already has the shared secret (from QR code/magic link). It can sign its own JWTs - no server round-trip needed for token issuance.

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User scans QR code / clicks magic link                      │
│     Contains: { server, workstation_id, secret }                │
│                                                                 │
│  2. Client stores secret in secure storage (Keychain)           │
│                                                                 │
│  3. Client signs JWT locally using secret (HS256)               │
│     No server request needed!                                   │
│                                                                 │
│  4. Client connects with self-signed JWT                        │
│     WebSocket: /ws?token=<jwt>                                  │
│     HTTP:      Authorization: Bearer <jwt>                      │
│                                                                 │
│  5. Server verifies JWT signature using same secret             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Magic Link / QR Code Format

```
tiflis://connect?data=<base64_json>

// Decoded JSON:
{
  "server": "tunnel.example.com",      // Tunnel server address
  "workstation_id": "my-macbook",      // Workstation identifier  
  "secret": "base64_encoded_32_bytes"  // Shared signing key (256-bit)
}
```

**Security:** The `secret` is the ONLY authentication credential. Treat it like a password.

### JWT Structure (Client-Generated)

```typescript
// Header
{ "alg": "HS256", "typ": "JWT" }

// Payload
interface JwtPayload {
  sub: string;           // device_id (subject) - client generates UUID
  iat: number;           // Issued at (Unix timestamp)
  exp: number;           // Expiration (e.g., iat + 24 hours)
}

// Signature (client computes this)
HMACSHA256(base64(header) + "." + base64(payload), secret)
```

### API Endpoints

**No token issuance endpoint needed!**

#### WebSocket

```
GET /ws?token=<jwt>
  
  Server verifies JWT signature using WORKSTATION_AUTH_KEY (same as secret)
  Extracts device_id from sub claim
  
  On invalid/expired token: 
    Close connection with 4001 code
```

#### HTTP Polling

```
POST /api/v1/http/command
  Headers:  Authorization: Bearer <jwt>
  Request:  { message: object }

GET /api/v1/http/messages?since=<seq>&ack=<seq>
  Headers:  Authorization: Bearer <jwt>

GET /api/v1/http/state
  Headers:  Authorization: Bearer <jwt>

POST /api/v1/http/disconnect
  Headers:  Authorization: Bearer <jwt>
```

All endpoints return 401 if JWT is invalid or expired.

### Token Lifecycle (Client-Managed)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Generate JWT │────►│  Use Token   │────►│   Expired?   │
│  (on client) │     │              │     │  Re-generate │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │ Generate new │
                                          │ JWT locally  │
                                          └──────────────┘
```

**Client responsibilities:**
1. Store secret securely (Keychain / EncryptedSharedPreferences)
2. Generate JWT with reasonable expiration (1-24 hours)
3. Regenerate JWT when expired (no server call!)
4. Generate unique device_id (UUID) on first launch, persist it

**Server responsibilities:**
1. Verify JWT signature using `WORKSTATION_AUTH_KEY`
2. Check `exp` claim
3. Extract `sub` (device_id) for session tracking

### Removed from Protocol

```typescript
// REMOVE these WebSocket messages:
- { type: "auth", payload: { auth_key, device_id } }
- { type: "auth.success", payload: { ... } }
- { type: "auth.error", payload: { ... } }

// REMOVE this endpoint:
- POST /api/v1/auth/token  (not needed!)

// Auth is now implicit via JWT in connection URL / header
```

### Security Benefits

1. **Secret never transmitted** - Only used locally for signing
2. **Zero server round-trips** - Client generates tokens instantly
3. **Stateless** - Server just verifies signature
4. **Offline capable** - Client can generate tokens without network
5. **Standard mechanism** - HS256 JWT, well-understood

### Implementation

**Server (TypeScript):**
```typescript
import jwt from 'jsonwebtoken';

// Single verification function for both WS and HTTP
function verifyToken(token: string): { deviceId: string } {
  const payload = jwt.verify(token, process.env.WORKSTATION_AUTH_KEY, {
    algorithms: ['HS256']
  }) as { sub: string };
  return { deviceId: payload.sub };
}

// HTTP middleware
async function authMiddleware(request, reply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'missing_token' });
  }
  try {
    const { deviceId } = verifyToken(auth.slice(7));
    request.deviceId = deviceId;
  } catch {
    return reply.status(401).send({ error: 'invalid_token' });
  }
}

// WebSocket upgrade
function handleUpgrade(request, socket, head) {
  const token = new URL(request.url, 'http://localhost').searchParams.get('token');
  if (!token) {
    socket.destroy();
    return;
  }
  try {
    const { deviceId } = verifyToken(token);
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.deviceId = deviceId;
      wss.emit('connection', ws, request);
    });
  } catch {
    socket.destroy();
  }
}
```

**iOS Client (Swift):**
```swift
import Foundation
import CryptoKit

class AuthManager {
  private let secret: Data  // From QR code, stored in Keychain
  private let deviceId: String  // Generated UUID, persisted
  
  func generateToken(expiresIn: TimeInterval = 86400) -> String {
    let header = #"{"alg":"HS256","typ":"JWT"}"#
    let now = Date()
    let payload = """
      {"sub":"\(deviceId)","iat":\(Int(now.timeIntervalSince1970)),"exp":\(Int(now.timeIntervalSince1970 + expiresIn))}
      """
    
    let headerB64 = Data(header.utf8).base64URLEncoded()
    let payloadB64 = Data(payload.utf8).base64URLEncoded()
    let message = "\(headerB64).\(payloadB64)"
    
    let key = SymmetricKey(data: secret)
    let signature = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: key)
    let signatureB64 = Data(signature).base64URLEncoded()
    
    return "\(message).\(signatureB64)"
  }
  
  func connect() {
    let token = generateToken()
    let url = URL(string: "wss://\(server)/t/\(workstationId)/ws?token=\(token)")!
    webSocket.connect(to: url)
    // No auth message needed!
  }
}
```

**Android Client (Kotlin):**
```kotlin
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class AuthManager(
  private val secret: ByteArray,  // From QR code
  private val deviceId: String    // Generated UUID
) {
  fun generateToken(expiresInSeconds: Long = 86400): String {
    val header = """{"alg":"HS256","typ":"JWT"}"""
    val now = System.currentTimeMillis() / 1000
    val payload = """{"sub":"$deviceId","iat":$now,"exp":${now + expiresInSeconds}}"""
    
    val headerB64 = header.toByteArray().base64UrlEncode()
    val payloadB64 = payload.toByteArray().base64UrlEncode()
    val message = "$headerB64.$payloadB64"
    
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(secret, "HmacSHA256"))
    val signatureB64 = mac.doFinal(message.toByteArray()).base64UrlEncode()
    
    return "$message.$signatureB64"
  }
  
  fun connect() {
    val token = generateToken()
    webSocket.connect("wss://$server/t/$workstationId/ws?token=$token")
    // No auth message needed!
  }
}
```

### Updated Endpoints (in Workstation)

```
POST /api/v1/http/connect     → Register HTTP polling client, return auth status
POST /api/v1/http/command     → Forward command to message router (same as WebSocket)
GET  /api/v1/http/messages    → Poll queued messages for device
GET  /api/v1/http/state       → Get device connection state
POST /api/v1/http/disconnect  → Unregister device, clear queue
```

### Migration Steps

1. Copy `HttpClient` entity to workstation (simplify - remove TunnelId)
2. Copy `HttpClientRegistry` to workstation
3. Create `HttpPollingService` use case (simplified from HttpClientOperationsUseCase)
4. Register routes at `/api/v1/http/*` in workstation Fastify app
5. Hook into message broadcaster to queue messages for HTTP polling clients
6. Update watchOS app to use new endpoint paths
7. Test with watchOS app

## Workstation Adaptation Checklist

### Phase 1: Remove Tunnel Client Code

```
packages/workstation/src/
├── infrastructure/
│   └── websocket/
│       ├── tunnel-client.ts          # DELETE
│       └── tunnel-connection.ts      # DELETE (if exists)
├── config/
│   └── env.ts                        # REMOVE: TUNNEL_URL, TUNNEL_API_KEY
└── app.ts                            # REMOVE: tunnel initialization
```

**Database changes:**
- Remove `tunnel_id` column/table if persisted
- Keep `device_id` tracking (still needed)

### Phase 2: Implement JWT Authentication

**New files:**
```
packages/workstation/src/
├── infrastructure/
│   └── auth/
│       ├── jwt-service.ts            # JWT verification
│       └── auth-middleware.ts        # Fastify middleware
├── domain/
│   └── value-objects/
│       └── device-id.ts              # Device ID value object
```

**jwt-service.ts:**
```typescript
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  sub: string;  // device_id
  iat: number;
  exp: number;
}

export class JwtService {
  constructor(private readonly secret: string) {}

  verify(token: string): TokenPayload {
    return jwt.verify(token, this.secret, {
      algorithms: ['HS256']
    }) as TokenPayload;
  }
}
```

**auth-middleware.ts:**
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export function createAuthMiddleware(jwtService: JwtService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'missing_token' });
    }
    try {
      const payload = jwtService.verify(auth.slice(7));
      request.deviceId = payload.sub;
    } catch (err) {
      return reply.status(401).send({ error: 'invalid_token' });
    }
  };
}
```

### Phase 3: Update WebSocket Handler

**Before:**
```typescript
// Wait for auth message after connect
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'auth') {
    validateAuthKey(msg.payload.auth_key);
    // ...
  }
});
```

**After:**
```typescript
// Auth happens during upgrade, before connection
fastify.get('/ws', { websocket: true }, (connection, request) => {
  // request.deviceId already set by upgrade handler
  const deviceId = request.deviceId;
  
  // No auth message needed - already authenticated
  connection.socket.on('message', (data) => {
    // Handle business messages only
  });
});

// Upgrade handler
fastify.server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const token = url.searchParams.get('token');
  
  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  
  try {
    const payload = jwtService.verify(token);
    request.deviceId = payload.sub;
    // Let Fastify handle the upgrade
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});
```

### Phase 4: Migrate HTTP Polling API

**New files:**
```
packages/workstation/src/
├── domain/
│   ├── entities/
│   │   └── http-polling-client.ts    # Message queue per device
│   └── ports/
│       └── http-polling-registry.ts  # Client registry interface
├── application/
│   └── http-polling-service.ts       # Use case
└── infrastructure/
    └── http/
        └── http-polling-route.ts     # Fastify routes
```

**Routes:**
```typescript
// All routes use JWT auth middleware
fastify.register(async (app) => {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/http/command', commandHandler);
  app.get('/api/v1/http/messages', messagesHandler);
  app.get('/api/v1/http/state', stateHandler);
  app.post('/api/v1/http/disconnect', disconnectHandler);
});
```

### Phase 5: Update Message Broadcasting

**Current:** Broadcast to WebSocket clients only
**New:** Broadcast to WebSocket + HTTP polling clients

```typescript
class MessageBroadcaster {
  constructor(
    private readonly wsClients: Map<string, WebSocket>,
    private readonly httpPollingRegistry: HttpPollingRegistry
  ) {}

  broadcast(deviceIds: string[], message: object) {
    const json = JSON.stringify(message);
    
    for (const deviceId of deviceIds) {
      // Try WebSocket first
      const ws = this.wsClients.get(deviceId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(json);
        continue;
      }
      
      // Fall back to HTTP polling queue
      this.httpPollingRegistry.queueMessage(deviceId, json);
    }
  }
}
```

### Phase 6: Environment Variables Update

**Remove:**
```bash
TUNNEL_URL=...
TUNNEL_API_KEY=...
```

**Keep/Add:**
```bash
# Server config
PORT=3001
HOST=127.0.0.1              # Local only! Tunnel client connects here

# Auth
WORKSTATION_AUTH_KEY=...    # Shared secret for JWT verification (from QR)

# Existing
WORKSPACES_ROOT=...
AGENT_PROVIDER=...
# ... rest unchanged
```

## Protocol Documentation Updates

### PROTOCOL.md Changes

**Remove sections:**
- 2.1 Workstation Registration (`workstation.register`)
- 2.2 Mobile Client Connection (`connect` / `connected`)
- 2.3 Message Forwarding (tunnel-specific)
- 2.4 Connection Events (`workstation_offline` / `workstation_online`)
- 2.5 Tunnel Heartbeat

**Update sections:**
- 1.1 Architecture diagram (new flow)
- 3.1 Authentication (JWT-based)
- Add HTTP Polling API section

**New Section 2: Tunnel**
```markdown
## 2. Tunnel

The Rust tunnel (`tiflis-tunnel`) is a transparent QUIC proxy.

### 2.1 Architecture

```
Mobile ──HTTPS/WSS──► Tunnel Server ──QUIC──► Tunnel Client ──HTTP/WS──► Workstation
         (internet)   (cloud/VPS)             (local)        (localhost:3001)
```

### 2.2 Endpoints

Mobile clients connect to:
- WebSocket: `wss://tunnel.example.com/t/{workstation_id}/ws?token=<jwt>`
- HTTP: `https://tunnel.example.com/t/{workstation_id}/api/v1/http/*`

### 2.3 Transparency

The tunnel forwards all traffic unchanged. Workstation sees direct client connections.
No tunnel-specific protocol messages.
```

**New Section 3.1: JWT Authentication**
```markdown
## 3.1 Authentication

All connections require a JWT token signed with the shared secret.

### Token Format

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "<device_id>", "iat": <timestamp>, "exp": <timestamp> }
```

### WebSocket

```
GET /ws?token=<jwt>
```

Server verifies JWT before completing WebSocket upgrade.
No `auth` message needed after connection.

### HTTP

```
Authorization: Bearer <jwt>
```

All HTTP endpoints require this header.

### Token Generation

Clients generate tokens locally using the shared secret from QR code/magic link.
No server round-trip required.
```

### AGENTS.md Changes

**Update component table:**
```markdown
| Component     | Name                                 | Platform       | Stack                        |
| ------------- | ------------------------------------ | -------------- | ---------------------------- |
| Tunnel Server | `tiflis-tunnel` (tunnel-server)      | Remote Server  | Rust, QUIC                   |
| Tunnel Client | `tiflis-tunnel` (tunnel-client)      | User's Machine | Rust, QUIC                   |
| Workstation   | `@tiflis-io/tiflis-code-workstation` | User's Machine | TypeScript, Node.js          |
```

**Remove from table:**
```markdown
| Tunnel Server | `@tiflis-io/tiflis-code-tunnel`      | Remote Server  | TypeScript, Node.js          |
```

## Mobile Client Updates

### iOS (TiflisCode)

**Files to update:**
```
apps/TiflisCode/
├── Services/
│   ├── WebSocketService.swift      # JWT auth, new URL format
│   ├── AuthManager.swift           # NEW: JWT generation
│   └── HTTPPollingService.swift    # New endpoints
├── Models/
│   └── ConnectionConfig.swift      # New QR format
└── Views/
    └── ConnectionSetupView.swift   # Parse new QR format
```

**Key changes:**
1. Add `AuthManager` for JWT generation (CryptoKit HMAC-SHA256)
2. Update WebSocket URL: `/ws?token=<jwt>`
3. Remove `auth` message sending
4. Remove `connect`/`connected` handling
5. Update HTTP polling endpoints to `/api/v1/http/*`
6. Parse new QR code format with `secret`

### Android (TiflisCodeAndroid)

**Files to update:**
```
apps/TiflisCodeAndroid/app/src/main/java/com/tiflis/code/
├── data/
│   ├── network/
│   │   ├── WebSocketService.kt     # JWT auth, new URL format
│   │   └── HttpPollingService.kt   # New endpoints
│   └── auth/
│       └── JwtGenerator.kt         # NEW: JWT generation
├── domain/
│   └── model/
│       └── ConnectionConfig.kt     # New QR format
└── ui/
    └── setup/
        └── QrScannerViewModel.kt   # Parse new QR format
```

### Web Client

**Files to update:**
```
packages/web/src/
├── lib/
│   ├── websocket.ts               # JWT auth, new URL format
│   ├── auth.ts                    # NEW: JWT generation
│   └── api.ts                     # HTTP polling if needed
└── hooks/
    └── useConnection.ts           # Updated auth flow
```

## Testing Checklist

### Unit Tests
- [ ] JWT verification (valid, expired, invalid signature)
- [ ] HTTP polling message queue (add, poll, acknowledge, TTL)
- [ ] Auth middleware (missing token, invalid token, valid token)

### Integration Tests
- [ ] WebSocket connect with valid JWT
- [ ] WebSocket reject invalid JWT
- [ ] HTTP polling full flow (command → queue → poll)
- [ ] Broadcast to mixed WS + HTTP clients

### E2E Tests
- [ ] iOS app connect via Rust tunnel
- [ ] Android app connect via Rust tunnel
- [ ] watchOS app HTTP polling via Rust tunnel
- [ ] Web client connect via Rust tunnel
- [ ] Multi-device sync (WS + HTTP mixed)

## Rollout Plan

### Stage 1: Development (Local)
1. Implement workstation changes
2. Test with local tunnel (no Rust tunnel yet)
3. Update one mobile platform (iOS)

### Stage 2: Alpha (Single User)
1. Deploy Rust tunnel to test server
2. Test full flow with all mobile platforms
3. Fix issues

### Stage 3: Beta (Internal)
1. Deploy to production tunnel server
2. Migrate internal workstations
3. Monitor for issues

### Stage 4: GA (Public)
1. Update documentation
2. Publish new mobile app versions
3. Deprecate TypeScript tunnel
4. Delete `packages/tunnel`

## Timeline

| Task | Duration |
|------|----------|
| **Workstation** | |
| Remove tunnel client code | 1 hour |
| Implement JWT auth service | 2 hours |
| Update WebSocket handler | 2 hours |
| Migrate HTTP polling API | 3 hours |
| Update message broadcaster | 1 hour |
| Tests | 2 hours |
| **Mobile** | |
| iOS: JWT + new endpoints | 3 hours |
| Android: JWT + new endpoints | 3 hours |
| watchOS: new HTTP endpoints | 1 hour |
| Web: JWT + new endpoints | 2 hours |
| **Documentation** | |
| Update PROTOCOL.md | 2 hours |
| Update AGENTS.md | 30 min |
| Update README files | 1 hour |
| **Cleanup** | |
| Delete packages/tunnel | 30 min |
| Update CI/CD | 1 hour |
| **Testing** | |
| E2E testing all platforms | 4 hours |
| **Total** | ~2-3 days |

## Benefits

1. **Simpler workstation** - No tunnel awareness, just a local server
2. **Better separation** - Tunnel handles networking, workstation handles business logic
3. **Easier debugging** - Can test workstation locally without tunnel
4. **QUIC benefits** - 0-RTT reconnection, multiplexing (handled by tunnel, transparent to workstation)
5. **Less code** - Remove ~500 lines of tunnel client code from workstation
6. **Secure auth** - Secret never transmitted, client-signed JWTs
7. **Unified auth** - Same mechanism for WebSocket and HTTP
