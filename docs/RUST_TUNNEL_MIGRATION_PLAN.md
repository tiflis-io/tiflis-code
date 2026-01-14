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

## JWT Authentication

Replace raw `auth_key` in every request with JWT tokens signed using the workstation auth key.

### Flow

```
1. Client calls POST /api/v1/http/connect with { auth_key, device_id }
2. Workstation validates auth_key, generates JWT signed with auth_key (symmetric HS256)
3. Returns { token: "eyJ...", expires_in: 86400 }
4. Client includes token in subsequent requests: Authorization: Bearer <token>
5. Workstation verifies JWT signature using auth_key (no DB lookup needed)
```

### JWT Payload

```typescript
interface JwtPayload {
  device_id: string;      // Device identifier
  iat: number;            // Issued at (Unix timestamp)
  exp: number;            // Expiration (Unix timestamp)
}
```

### Updated Endpoints

```
POST /api/v1/http/connect
  Request:  { auth_key: string, device_id: string }
  Response: { token: string, expires_in: number }

POST /api/v1/http/command
  Headers:  Authorization: Bearer <token>
  Request:  { message: object }

GET /api/v1/http/messages?since=<seq>&ack=<seq>
  Headers:  Authorization: Bearer <token>

GET /api/v1/http/state
  Headers:  Authorization: Bearer <token>

POST /api/v1/http/disconnect
  Headers:  Authorization: Bearer <token>
```

### Benefits

1. **Stateless** - No session lookup, just verify JWT signature
2. **Secure** - Auth key never sent after initial connect
3. **Efficient** - No auth_key validation on every request
4. **Standard** - Uses standard Authorization header

### Implementation

```typescript
// Generate token on connect
import jwt from 'jsonwebtoken';

function generateToken(deviceId: string, authKey: string): string {
  return jwt.sign(
    { device_id: deviceId },
    authKey,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

// Verify token on subsequent requests
function verifyToken(token: string, authKey: string): JwtPayload {
  return jwt.verify(token, authKey, { algorithms: ['HS256'] }) as JwtPayload;
}
```

### WebSocket Auth (Future)

Same JWT can be used for WebSocket connections:
```
wss://tunnel.example.com/t/{workstation_id}/ws?token=<jwt>
```

This eliminates the separate `auth` message after WebSocket connect.

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
