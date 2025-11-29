# WebSocket Connection Implementation

> Documentation of the real WebSocket connection implementation for the Tiflis Code mobile app.

> **⚠️ CRITICAL SECURITY NOTE:** This implementation includes `NSAllowsArbitraryLoads = true` in `Info.plist` for local development. **This MUST be removed before production deployment.** See [Security Considerations](#security-considerations) section for details.

## Overview

This document describes the implementation of the WebSocket connection feature that replaces the stub connection logic with a fully functional, production-ready connection system following MVVM + Services architecture.

## Implementation Date

January 2025

## Architecture

The implementation follows the project's **MVVM + Services** pattern with proper separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        View Layer                                │
│   SettingsView, ContentView (SwiftUI)                           │
│   • Observes AppState via @EnvironmentObject                    │
│   • User actions trigger AppState methods                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ViewModel Layer                              │
│   AppState (@MainActor)                                        │
│   • Manages UI state via @Published properties                 │
│   • Coordinates with ConnectionService                          │
│   • Observes connection state via Combine                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Service Layer                             │
│   ConnectionService (@MainActor)                                │
│   • Wraps WebSocketClient                                       │
│   • Manages connection lifecycle                                │
│   • Handles credential loading                                  │
│   • Publishes connection state                                  │
│                                                                  │
│   WebSocketClient (non-isolated, @unchecked Sendable)          │
│   • Network operations on background threads                    │
│   • Implements protocol (connect, auth, heartbeat, reconnect)   │
│   • Dispatches delegate callbacks to main actor                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Domain Layer                              │
│   WebSocketMessage, ConnectionState, Session                    │
│   • Pure Swift types                                            │
│   • Protocol message definitions                                │
└─────────────────────────────────────────────────────────────────┘
```

## Files Created

### 1. Keychain Storage Service

**File:** `apps/TiflisCode/Shared/Services/Storage/KeychainManager.swift`

- **Protocol:** `KeychainManaging` - Defines secure storage interface
- **Implementation:** `KeychainManager` - Uses iOS Keychain API
- **Features:**
  - Secure storage for `auth_key` using `kSecClassGenericPassword`
  - Service identifier: `com.tiflis.TiflisCode`
  - Account key: `workstation_auth_key`
  - Typed errors: `KeychainError` enum

### 2. Device ID Manager

**File:** `apps/TiflisCode/Shared/Services/Storage/DeviceIDManager.swift`

- **Protocol:** `DeviceIDManaging` (marked `@MainActor`)
- **Implementation:** `DeviceIDManager` (marked `@MainActor`)
- **Features:**
  - Uses `UIDevice.current.identifierForVendor` as primary source
  - Falls back to stored UUID in UserDefaults if vendor ID unavailable
  - Persists device identifier for reconnection and subscription restoration

### 3. WebSocket Message Types

**File:** `apps/TiflisCode/Shared/Domain/Models/WebSocketMessage.swift`

- **Purpose:** Domain models for all WebSocket protocol messages
- **Message Types:**
  - Connection: `ConnectMessage`, `ConnectedMessage`
  - Authentication: `AuthMessage`, `AuthSuccessMessage`, `AuthErrorMessage`
  - Heartbeat: `PingMessage`, `PongMessage`
  - Errors: `ErrorMessage`
  - Events: `WorkstationOfflineMessage`, `WorkstationOnlineMessage`
- **Features:**
  - All structs conform to `Codable` with proper `CodingKeys` for snake_case
  - `WebSocketMessage` enum for type-safe message parsing
  - Static `parse()` method for converting JSON dictionaries to typed messages

### 4. WebSocket Client Protocol

**File:** `apps/TiflisCode/Shared/Services/WebSocket/WebSocketClientProtocol.swift`

- **Protocol:** `WebSocketClientProtocol` - Defines WebSocket client interface
- **Delegate Protocol:** `WebSocketClientDelegate` (marked `@MainActor`)
  - All delegate methods guaranteed to be called on main actor
  - Methods: `didConnect`, `didAuthenticate`, `didReceiveMessage`, `didDisconnect`, `workstationDidGoOffline`, `workstationDidComeOnline`

### 5. WebSocket Client Implementation

**File:** `apps/TiflisCode/Shared/Services/WebSocket/WebSocketClient.swift`

- **Class:** `WebSocketClient` (non-isolated, `@unchecked Sendable`)
- **Features:**
  - Uses `URLSessionWebSocketTask` for WebSocket connections
  - **Connection Flow:**
    1. Normalize and validate WebSocket URL
    2. Create URLSession with delegate
    3. Create and resume WebSocket task
    4. Wait for connection via continuation (delegate callback)
    5. Send `connect` message to tunnel
    6. Wait for `connected` response
    7. Send `auth` message to workstation
    8. Wait for `auth.success` response
    9. Start heartbeat mechanism
  - **URL Normalization:**
    - Converts `http://` → `ws://` and `https://` → `wss://`
    - Adds default ports: 80 for `ws://`, 443 for `wss://` (if missing)
    - Validates WebSocket URL format
  - **Heartbeat:**
    - Sends `ping` every 20 seconds
    - Tracks last `pong` timestamp
    - Marks connection stale if no `pong` received within 30 seconds
    - Automatically reconnects on stale connection
  - **Reconnection:**
    - Exponential backoff: 1s → 2s → 4s → ... → 30s max
    - Automatic reconnection on disconnect or stale connection
    - Restores subscriptions after reconnect
  - **Message Handling:**
    - Parses incoming JSON messages
    - Routes to delegate callbacks (all dispatched to main actor)
    - Handles `pong` responses for heartbeat
    - Handles `connection.workstation_offline/online` events

### 6. Connection Service

**File:** `apps/TiflisCode/Shared/Services/WebSocket/ConnectionService.swift`

- **Protocol:** `ConnectionServicing` (marked `@MainActor`)
- **Implementation:** `ConnectionService` (marked `@MainActor`)
- **Features:**
  - Wraps `WebSocketClient` and coordinates connection lifecycle
  - Manages connection state transitions
  - Handles credential loading from Keychain and UserDefaults
  - Provides `@Published` connection state for ViewModel observation
  - Implements `WebSocketClientDelegate` to update connection state
  - **Dependencies (injected):**
    - `WebSocketClient` (concrete type, not protocol, for Sendable safety)
    - `KeychainManaging`
    - `DeviceIDManaging`

## Files Modified

### 1. AppState (ViewModel)

**File:** `apps/TiflisCode/TiflisCode/App/TiflisCodeApp.swift`

**Changes:**
- Added `@AppStorage("tunnelId")` for tunnel ID persistence
- Injected `ConnectionService` as dependency (with default implementation)
- Removed stub `connect()` implementation
- Updated `connect()` to call `connectionService.connect()` asynchronously
- Updated `disconnect()` to call `connectionService.disconnect()`
- Added `observeConnectionState()` to subscribe to connection state changes via Combine
- Updated `hasConnectionConfig` to check both `tunnelURL` and `tunnelId`

**Dependency Injection:**
```swift
init(connectionService: ConnectionServicing? = nil) {
    // Create services with default implementations
    let keychainManager = KeychainManager()
    let deviceIDManager = DeviceIDManager()
    let webSocketClient = WebSocketClient()
    
    // Inject or create connection service
    self.connectionService = connectionService ?? ConnectionService(
        webSocketClient: webSocketClient,
        keychainManager: keychainManager,
        deviceIDManager: deviceIDManager
    )
    
    // Observe connection state
    observeConnectionState()
}
```

### 2. SettingsView

**File:** `apps/TiflisCode/TiflisCode/Features/Settings/SettingsView.swift`

**Changes:**
- Removed local `@State private var authKey`
- Added `KeychainManager` instance for secure storage
- Updated `handleMagicLink()` to:
  - Store `authKey` in Keychain via `keychainManager.saveAuthKey()`
  - Store `tunnelId` in AppStorage
  - Store `tunnelURL` in AppStorage
  - Call `appState.connect()` after storing credentials

### 3. Info.plist

**File:** `apps/TiflisCode/TiflisCode/Resources/Info.plist`

**Changes:**
- Added `NSAppTransportSecurity` exception to allow HTTP/WebSocket connections for local development

> **⚠️ CRITICAL SECURITY WARNING:**
> 
> The `NSAllowsArbitraryLoads = true` setting **MUST be removed before production deployment**. This setting disables App Transport Security (ATS) and allows unencrypted HTTP/WebSocket connections, which is a **serious security vulnerability**.
> 
> **Before production:**
> 1. Remove the entire `NSAppTransportSecurity` dictionary from `Info.plist`
> 2. Ensure all tunnel URLs use `wss://` (secure WebSocket over TLS)
> 3. Verify TLS certificates are properly configured on the tunnel server
> 4. Test that connections work with ATS enabled (default iOS behavior)
> 
> **Failure to remove this setting will result in App Store rejection and exposes users to man-in-the-middle attacks.**

## Connection Flow

### 1. Initial Connection

```
User enters magic link or scans QR code
    ↓
SettingsView.handleMagicLink()
    ↓
Store credentials:
  - authKey → Keychain
  - tunnelId → AppStorage
  - tunnelURL → AppStorage
    ↓
AppState.connect()
    ↓
ConnectionService.connect()
    ↓
Load credentials from Keychain & AppStorage
    ↓
WebSocketClient.connect(url, tunnelId, authKey, deviceId)
    ↓
1. Normalize URL (http→ws, add default ports)
2. Create URLSessionWebSocketTask
3. Resume task
4. Wait for didOpenWithProtocol delegate callback
5. Send "connect" message to tunnel
6. Wait for "connected" response
7. Send "auth" message to workstation
8. Wait for "auth.success" response
9. Start heartbeat timer
    ↓
ConnectionService updates state to .connected
    ↓
AppState observes state change via Combine
    ↓
UI updates to show connected status
```

### 2. Heartbeat Mechanism

```
Every 20 seconds:
    ↓
WebSocketClient.sendPing()
    ↓
Send {"type": "ping", "timestamp": ...}
    ↓
Start 30-second timeout timer
    ↓
If pong received within 30s:
    - Cancel timeout timer
    - Update lastPongTimestamp
    - Continue normal operation
    ↓
If no pong within 30s:
    - Mark connection stale
    - Disconnect
    - Schedule reconnection
```

### 3. Reconnection Flow

```
Connection lost or stale
    ↓
WebSocketClient.handleDisconnection()
    ↓
Cancel heartbeat
Notify delegate (on main actor)
    ↓
scheduleReconnect()
    ↓
Calculate delay: min(1s * 2^attempts, 30s)
    ↓
Wait for delay
    ↓
Retry connect() with stored credentials
    ↓
If successful:
    - Reset reconnectAttempts
    - Restore subscriptions
    ↓
If failed:
    - Increment reconnectAttempts
    - Schedule another reconnect with increased delay
```

## Protocol Implementation

### Connection Messages

**Mobile → Tunnel:**
```json
{
  "type": "connect",
  "payload": {
    "tunnel_id": "Z6q62aKz-F96",
    "auth_key": "workstation-auth-key",
    "device_id": "device-uuid",
    "reconnect": false
  }
}
```

**Tunnel → Mobile:**
```json
{
  "type": "connected",
  "payload": {
    "tunnel_id": "Z6q62aKz-F96",
    "restored": false
  }
}
```

### Authentication Messages

**Mobile → Workstation (via Tunnel):**
```json
{
  "type": "auth",
  "payload": {
    "auth_key": "workstation-auth-key",
    "device_id": "device-uuid"
  }
}
```

**Workstation → Mobile (via Tunnel):**
```json
{
  "type": "auth.success",
  "payload": {
    "device_id": "device-uuid",
    "restored_subscriptions": ["session-1", "session-2"]
  }
}
```

### Heartbeat Messages

**Mobile → Tunnel:**
```json
{
  "type": "ping",
  "timestamp": 1704067200000
}
```

**Tunnel → Mobile:**
```json
{
  "type": "pong",
  "timestamp": 1704067200000
}
```

## Concurrency Architecture

### Actor Isolation

| Component | Actor Isolation | Reason |
|-----------|----------------|--------|
| `DeviceIDManager` | `@MainActor` | Accesses `UIDevice.current` (main actor isolated) |
| `ConnectionService` | `@MainActor` | Uses `@Published` properties, manages UI state |
| `WebSocketClient` | Non-isolated | Network operations on background threads |
| `WebSocketClientDelegate` | `@MainActor` | All callbacks dispatched to main actor |
| `ConnectionServicing` | `@MainActor` | Protocol matches implementation |

### Sendable Safety

- `WebSocketClient` conforms to `@unchecked Sendable` because:
  - All delegate callbacks are dispatched to main actor via `MainActor.run`
  - URLSession operations are thread-safe
  - State mutations are properly synchronized
- `ConnectionService` stores concrete `WebSocketClient` type (not protocol) to avoid Sendable protocol issues

### Delegate Callback Pattern

All delegate callbacks from `WebSocketClient` are dispatched to main actor:

```swift
await MainActor.run {
    delegate?.webSocketClient(self, didConnect: tunnelId)
}
```

This ensures:
- UI updates happen on main thread
- No data races when accessing `@Published` properties
- Consistent actor isolation throughout the call chain

## URL Normalization

The `normalizeWebSocketURL()` function handles various URL formats:

| Input | Output | Notes |
|-------|--------|-------|
| `http://192.168.1.112/ws` | `ws://192.168.1.112:80/ws` | Converts http→ws, adds port 80 |
| `https://example.com/ws` | `wss://example.com:443/ws` | Converts https→wss, adds port 443 |
| `ws://192.168.1.112:3001/ws` | `ws://192.168.1.112:3001/ws` | No change (port already specified) |
| `192.168.1.112/ws` | `ws://192.168.1.112:80/ws` | Adds protocol and port |

## Error Handling

### Connection Errors

- `WebSocketError.invalidURL` - URL format is invalid
- `WebSocketError.notConnected` - Attempted operation on closed connection
- `WebSocketError.connectionClosed` - Connection was closed unexpectedly
- `WebSocketError.authenticationFailed` - Auth key rejected by workstation
- `WebSocketError.missingCredentials` - Required credentials not available

### Error Flow

```
Connection error occurs
    ↓
WebSocketClient throws error
    ↓
ConnectionService catches error
    ↓
Updates connectionState to .error(message)
    ↓
AppState observes state change
    ↓
UI displays error indicator
    ↓
Automatic reconnection scheduled (if credentials available)
```

## Testing Considerations

### Local Development Setup

1. **Tunnel Server:** Run on `ws://localhost:3001/ws` or `ws://192.168.1.112:3001/ws`
2. **Workstation Server:** Connect to tunnel, generate magic link
3. **iOS Simulator:** Use `ws://localhost:3001/ws` (simulator maps localhost correctly)
4. **Physical Device:** Use Mac's local IP: `ws://192.168.1.112:3001/ws`

### Testing Scenarios

- ✅ Successful connection and authentication
- ✅ Connection timeout handling
- ✅ Automatic reconnection after network interruption
- ✅ Heartbeat keeps connection alive
- ✅ Invalid auth key rejection
- ✅ Workstation offline/online events
- ✅ URL normalization (http→ws, missing ports)

## Security Considerations

### Credential Storage

- **Auth Key:** Stored in iOS Keychain (encrypted, device-only access)
- **Tunnel URL/ID:** Stored in UserDefaults (non-sensitive, can be cleared)
- **Device ID:** Uses `identifierForVendor` (persists across app installs on same device)

### App Transport Security

> **⚠️ CRITICAL:** The `NSAllowsArbitraryLoads = true` setting in `Info.plist` **MUST be removed before production**.

**Development:**
- `NSAllowsArbitraryLoads = true` allows HTTP/WS connections for local testing
- This is acceptable for development only

**Production:**
- **MUST remove** `NSAppTransportSecurity` dictionary entirely from `Info.plist`
- **MUST use** `wss://` (secure WebSocket over TLS) for all connections
- **MUST have** valid TLS certificates on tunnel server
- **MUST test** that connections work with ATS enabled (default iOS behavior)

**Security Impact:**
- Leaving `NSAllowsArbitraryLoads = true` in production:
  - Exposes all network traffic to man-in-the-middle attacks
  - Violates iOS security best practices
  - Will cause App Store rejection
  - Puts user data at risk

## Known Limitations

1. **Default Ports:** Currently adds ports 80/443 by default, but tunnel server typically runs on 3001. Users must include port in URL for non-standard ports.
2. **Reconnection:** Maximum reconnection delay is 30 seconds; after that, manual reconnect may be needed.
3. **Message Queueing:** Messages sent during disconnection are not queued (future enhancement).

## Future Enhancements

1. **Message Queueing:** Queue messages during disconnection and send on reconnect
2. **Connection Quality Monitoring:** Track latency and connection quality metrics
3. **Adaptive Heartbeat:** Adjust ping interval based on connection quality
4. **Background Reconnection:** Continue reconnection attempts when app is backgrounded
5. **Certificate Pinning:** For production WSS connections

## References

- **PROTOCOL.md** - Complete WebSocket protocol specification
- **docs/MOBILE_APP_LOGIC.md** - Mobile app architecture and UI patterns
- **CLAUDE.md** - Project architecture and development guidelines

