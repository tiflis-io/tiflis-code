# Rust Tunnel Migration Plan

## Overview

Migrate from TypeScript Tunnel Server (`packages/tunnel`) to Rust QUIC Tunnel (`apps/tiflis-tunnel`) and simplify the workstation protocol.

## Current Architecture

```
Mobile ──WSS──► TypeScript Tunnel ──WSS──► TypeScript Workstation
                    (Node.js)                    (Node.js)
```

**Current Flow:**
1. Mobile connects to Tunnel via WebSocket
2. Tunnel authenticates mobile client (`auth_key`)
3. Tunnel forwards all messages bidirectionally to Workstation
4. Workstation handles all business logic (sessions, supervisor, etc.)

## Target Architecture

```
Mobile ──HTTPS/WSS──► Rust Tunnel ──QUIC──► TypeScript Workstation
                      (tiflis-tunnel)           (Node.js)
```

**Key Changes:**
- Rust tunnel handles HTTP/WebSocket → QUIC translation
- Mobile clients connect via standard HTTPS/WebSocket
- Workstation connects to tunnel via QUIC (0-RTT reconnect, multiplexing)

## Migration Phases

### Phase 1: Workstation → Rust Tunnel Integration

**Goal:** Workstation connects to Rust tunnel instead of TypeScript tunnel.

**Tasks:**

1. **Create QUIC client in Workstation**
   - Replace `packages/workstation/src/infrastructure/websocket/tunnel-client.ts`
   - Implement QUIC connection using Node.js QUIC bindings or HTTP/2 fallback
   - Handle registration: `register` → `registered` messages
   - Handle reconnection with session tickets (0-RTT)

2. **Update Workstation registration flow**
   ```typescript
   // Current (WebSocket)
   ws.send({ type: "workstation.register", payload: { api_key, name, auth_key } })
   
   // New (QUIC JSON message)
   quicStream.write({ type: "register", payload: { api_key, workstation_id, auth_key } })
   ```

3. **Message forwarding adaptation**
   - Rust tunnel forwards HTTP requests as JSON messages
   - Workstation responds with JSON, tunnel converts back to HTTP
   - WebSocket connections are proxied as `ws_open`, `ws_data`, `ws_close` messages

**Files to modify:**
- `packages/workstation/src/infrastructure/websocket/tunnel-client.ts` → rename to `tunnel-connection.ts`
- `packages/workstation/src/config/env.ts` → update `TUNNEL_URL` handling
- `packages/workstation/src/app.ts` → update initialization

### Phase 2: HTTP API for Mobile Clients

**Goal:** Mobile clients connect via HTTPS to Rust tunnel, which proxies to Workstation.

**Current mobile connection:**
```
Mobile ──WSS──► /ws (Tunnel) ──WSS──► Workstation
```

**New mobile connection:**
```
Mobile ──WSS──► /t/{workstation_id}/ws (Rust Tunnel) ──QUIC──► Workstation
```

**Tasks:**

1. **Update mobile clients to use path-based routing**
   - iOS: Update `WebSocketService.swift` to connect to `/t/{workstation_id}/ws`
   - Android: Update WebSocket URL construction
   - Web: Update Next.js client connection URL

2. **Workstation exposes local HTTP server**
   - Keep existing Fastify server on `localhost:3001` (or configurable port)
   - Rust tunnel client proxies requests to this local server
   - No changes to workstation HTTP routes

3. **Authentication flow update**
   - Tunnel authenticates `auth_key` in HTTP header or query param
   - Remove `connect` message from mobile → tunnel flow
   - Workstation still receives `auth` message via WebSocket proxy

**Files to modify:**
- `apps/TiflisCode/Services/WebSocketService.swift`
- `apps/TiflisCodeAndroid/.../WebSocketService.kt`
- `packages/web/src/lib/websocket.ts`

### Phase 3: Protocol Simplification

**Goal:** Remove tunnel-specific protocol, use standard HTTP/WebSocket.

**Simplifications:**

1. **Remove Tunnel Protocol from Mobile**
   ```typescript
   // Remove these message types from mobile clients:
   - "connect" / "connected"
   - "connection.workstation_offline" / "connection.workstation_online"
   - "workstation.register" / "workstation.registered"
   ```

2. **Workstation handles connection status**
   - Rust tunnel sends connection status via QUIC control stream
   - Workstation broadcasts to mobile clients via existing `session.output` or new event

3. **Simplify Workstation Protocol Messages**
   ```typescript
   // Keep these (workstation ↔ mobile):
   - auth / auth.success / auth.error
   - ping / pong
   - heartbeat / heartbeat.ack
   - sync / sync.state
   - history.request / history.response
   - supervisor.* commands
   - session.* commands
   - message.ack
   - audio.request / audio.response
   ```

**Files to modify:**
- `packages/workstation/src/protocol/messages.ts`
- `packages/workstation/src/protocol/schemas.ts`
- `PROTOCOL.md` → update documentation

### Phase 4: Deprecate TypeScript Tunnel

**Goal:** Remove `packages/tunnel` entirely.

**Tasks:**

1. **Remove packages/tunnel from monorepo**
   - Delete `packages/tunnel/` directory
   - Update `pnpm-workspace.yaml`
   - Update root `package.json` scripts

2. **Update CI/CD**
   - Remove tunnel package from npm publishing workflow
   - Update deployment scripts to use Rust binary/Docker

3. **Update documentation**
   - Update `AGENTS.md` component table
   - Update `README.md` architecture diagram
   - Update `PROTOCOL.md` to reflect simplified flow

4. **Migration guide for existing users**
   - Document breaking changes
   - Provide upgrade path from TypeScript tunnel

## Technical Decisions

### QUIC Client for Node.js

**Options:**

1. **Native QUIC (experimental)**
   - Node.js 20+ has experimental QUIC support
   - Pro: Native, no external deps
   - Con: Experimental, API may change

2. **HTTP/3 via QUIC**
   - Use fetch with HTTP/3 support
   - Pro: Standard API
   - Con: May not support custom QUIC streams

3. **External process (tunnel-client binary)**
   - Spawn Rust `tunnel-client` as subprocess
   - Communicate via stdin/stdout or local socket
   - Pro: Reuse existing Rust code
   - Con: Process management complexity

**Recommendation:** Option 3 (external process) for initial implementation:
- Spawn `tunnel-client` binary
- tunnel-client connects to tunnel-server via QUIC
- tunnel-client proxies to local workstation HTTP server
- Simplest integration, proven QUIC implementation

### WebSocket Proxying

Rust tunnel handles WebSocket upgrade and proxies frames:

```
Mobile ──WS Upgrade──► Rust Tunnel ──ws_open──► Workstation
Mobile ──WS Frame──► Rust Tunnel ──ws_data──► Workstation
Mobile ◄──WS Frame── Rust Tunnel ◄──ws_data── Workstation
Mobile ──WS Close──► Rust Tunnel ──ws_close──► Workstation
```

Workstation receives WebSocket as HTTP-like messages and responds accordingly.

## Rollout Strategy

1. **Alpha:** Deploy Rust tunnel alongside TypeScript tunnel
   - Different port/domain
   - Test with single workstation

2. **Beta:** Migrate internal workstations
   - Monitor performance, latency
   - Validate 0-RTT reconnection

3. **GA:** Deprecate TypeScript tunnel
   - Update mobile apps
   - Remove from npm

## Success Metrics

- [ ] Workstation connects to Rust tunnel via QUIC
- [ ] Mobile clients connect via `/t/{id}/ws` path
- [ ] 0-RTT reconnection works (< 100ms)
- [ ] All existing protocol messages work through new tunnel
- [ ] TypeScript tunnel package removed
- [ ] Docker images published and working

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 | 2-3 days | Rust tunnel deployed |
| Phase 2 | 1-2 days | Phase 1 complete |
| Phase 3 | 1 day | Phase 2 complete |
| Phase 4 | 1 day | Phase 3 tested |

**Total:** ~5-7 days

## Open Questions

1. **Node.js QUIC support** — Is native QUIC stable enough, or use external binary?
2. **Breaking change strategy** — Force update mobile apps, or support both tunnels temporarily?
3. **watchOS HTTP polling** — Does Rust tunnel support the `/api/v1/watch/*` endpoints?
4. **Web client bundling** — Is web client still bundled with tunnel, or separate deployment?
