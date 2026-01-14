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

Complete auth redesign: JWT tokens for both WebSocket and HTTP APIs. Single auth flow, stateless verification.

### Current Problems

1. **WebSocket**: Sends `auth_key` in plaintext via `auth` message after connect
2. **HTTP Polling**: Sends `auth_key` in every request body
3. **Inconsistent**: Two different auth flows for same workstation
4. **Insecure**: Raw secret transmitted repeatedly

### New Design: Token-Based Auth

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Client obtains token (one-time, with auth_key)              │
│     POST /api/v1/auth/token                                     │
│     { auth_key, device_id } → { token, expires_in }             │
│                                                                 │
│  2. Client uses token for all subsequent connections            │
│                                                                 │
│     WebSocket: /ws?token=<jwt>                                  │
│     HTTP:      Authorization: Bearer <jwt>                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### JWT Structure

```typescript
// Header
{ "alg": "HS256", "typ": "JWT" }

// Payload
interface JwtPayload {
  sub: string;           // device_id (subject)
  iat: number;           // Issued at
  exp: number;           // Expiration (24h default)
  jti?: string;          // Optional: unique token ID for revocation
}

// Signature
HMACSHA256(base64(header) + "." + base64(payload), WORKSTATION_AUTH_KEY)
```

### API Endpoints

#### Authentication

```
POST /api/v1/auth/token
  Request:  { auth_key: string, device_id: string }
  Response: { 
    token: string,           // JWT
    expires_in: number,      // Seconds until expiration
    workstation_name: string,
    workstation_version: string,
    protocol_version: string
  }
  Errors:   401 Invalid auth key
```

#### WebSocket (authenticated via query param)

```
GET /ws?token=<jwt>
  
  On connect: Server verifies JWT, extracts device_id
  No "auth" message needed - connection is pre-authenticated
  
  On invalid/expired token: 
    Server sends { type: "error", payload: { code: "TOKEN_EXPIRED" } }
    Server closes connection with 4001 code
```

#### HTTP Polling (authenticated via header)

```
POST /api/v1/http/command
  Headers:  Authorization: Bearer <jwt>
  Request:  { message: object }
  Response: { success: true }
  Errors:   401 Invalid/expired token

GET /api/v1/http/messages?since=<seq>&ack=<seq>
  Headers:  Authorization: Bearer <jwt>
  Response: { messages: [...], current_sequence: number }
  Errors:   401 Invalid/expired token

GET /api/v1/http/state
  Headers:  Authorization: Bearer <jwt>
  Response: { queue_size: number, current_sequence: number }
  Errors:   401 Invalid/expired token

POST /api/v1/http/disconnect
  Headers:  Authorization: Bearer <jwt>
  Response: { success: true }
```

### Token Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Fresh   │────►│  Valid   │────►│ Expiring │────►│ Expired  │
│          │     │          │     │ (< 1hr)  │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │                │
                      │                │                │
                 Use normally    Auto-refresh      Re-auth
                                 (optional)        required
```

**Client Responsibilities:**
1. Store token securely (Keychain on iOS, EncryptedSharedPreferences on Android)
2. Include token in all requests
3. Handle 401 errors by re-authenticating
4. Optionally refresh token before expiration

**Server Responsibilities:**
1. Verify JWT signature on every request
2. Check expiration
3. Extract device_id from token (no DB lookup)

### Removed Messages

```typescript
// REMOVE from WebSocket protocol:
- { type: "auth", payload: { auth_key, device_id } }
- { type: "auth.success", payload: { ... } }
- { type: "auth.error", payload: { ... } }

// Auth info now returned from /api/v1/auth/token
// WebSocket connect is pre-authenticated via ?token=
```

### Security Benefits

1. **Auth key transmitted once** - Only during initial token request
2. **Stateless verification** - JWT signature check, no DB lookup
3. **Standard mechanism** - Well-understood JWT + Bearer token pattern  
4. **Revocable** - Can implement token blacklist if needed (jti claim)
5. **Auditable** - Token contains device_id, timestamps
6. **Cross-transport** - Same token works for WS and HTTP

### Implementation Notes

```typescript
// Middleware for HTTP routes
async function authMiddleware(request, reply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'missing_token' });
  }
  
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, WORKSTATION_AUTH_KEY, { 
      algorithms: ['HS256'] 
    });
    request.deviceId = payload.sub;
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    return reply.status(401).send({ error: code });
  }
}

// WebSocket upgrade handler
function handleUpgrade(request, socket, head) {
  const url = new URL(request.url, 'http://localhost');
  const token = url.searchParams.get('token');
  
  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  
  try {
    const payload = jwt.verify(token, WORKSTATION_AUTH_KEY);
    // Proceed with WebSocket upgrade, attach deviceId to connection
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.deviceId = payload.sub;
      wss.emit('connection', ws, request);
    });
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
}
```

### Mobile Client Changes

**iOS (Swift):**
```swift
// Before
func connect() {
  ws.connect(url: tunnelUrl)
  ws.send(AuthMessage(auth_key: authKey, device_id: deviceId))
}

// After  
func connect() async throws {
  // 1. Get token (if not cached or expired)
  if token == nil || token.isExpired {
    token = try await api.getToken(authKey: authKey, deviceId: deviceId)
    keychain.save(token)
  }
  
  // 2. Connect with token
  ws.connect(url: "\(workstationUrl)/ws?token=\(token.jwt)")
  // No auth message needed - already authenticated
}
```

**Android (Kotlin):**
```kotlin
// Before
fun connect() {
  ws.connect(tunnelUrl)
  ws.send(AuthMessage(authKey, deviceId))
}

// After
suspend fun connect() {
  // 1. Get token (if not cached or expired)
  val token = tokenManager.getValidToken() 
    ?: api.getToken(authKey, deviceId).also { tokenManager.save(it) }
  
  // 2. Connect with token
  ws.connect("$workstationUrl/ws?token=${token.jwt}")
  // No auth message needed
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
