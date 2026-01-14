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

## Open Questions

1. **Web client** - Where does the web client get served from?
   - Option A: Bundled with tunnel-server (current) - Rust tunnel serves static files
   - Option B: Bundled with workstation - workstation serves at `/`
   - Option C: Separate static hosting (CDN)
   - **Recommendation:** Option B - bundle with workstation for simplicity

2. **Auth flow** - How does mobile get `workstation_id`?
   - Currently via QR code / magic link with `tunnel_id`
   - Need to include `workstation_id` in the link instead
   - Format: `tiflis://connect?server=tunnel.example.com&workstation=my-ws&key=xxx`

## Timeline

| Task | Duration |
|------|----------|
| Remove tunnel code from workstation | 2-3 hours |
| Migrate watchOS HTTP polling to workstation | 3-4 hours |
| Update mobile clients (iOS, Android, Web) | 2-3 hours |
| Bundle web client with workstation (optional) | 1-2 hours |
| Update PROTOCOL.md | 1 hour |
| Delete packages/tunnel | 30 min |
| Test end-to-end | 2-3 hours |
| **Total** | ~1.5-2 days |

## Benefits

1. **Simpler workstation** - No tunnel awareness, just a local server
2. **Better separation** - Tunnel handles networking, workstation handles business logic
3. **Easier debugging** - Can test workstation locally without tunnel
4. **QUIC benefits** - 0-RTT reconnection, multiplexing (handled by tunnel, transparent to workstation)
5. **Less code** - Remove ~500 lines of tunnel client code from workstation
