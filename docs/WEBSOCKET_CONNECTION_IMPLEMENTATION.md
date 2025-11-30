# WebSocket Connection Implementation

> Documentation of the real WebSocket connection implementation for the Tiflis Code mobile app.

> **⚠️ CRITICAL SECURITY NOTE:** This implementation includes `NSAllowsArbitraryLoads = true` in `Info.plist` for local development. **This MUST be removed before production deployment.** See [Security Considerations](#security-considerations) section for details.

> **✅ Status:** Fully functional - connection, authentication, heartbeat, and reconnection all working. Last updated: January 30, 2025.

## Overview

This document describes the implementation of the WebSocket connection feature that replaces the stub connection logic with a fully functional, production-ready connection system following MVVM + Services architecture.

## Implementation Date

January 2025

## Update History

### January 30, 2025 - Workstation Status Tracking

**New Feature:**
1. **Workstation Status Tracking:** Added separate tracking for workstation online/offline status
   - `ConnectionService` now publishes `workstationOnline: Bool` property
   - Updated via `workstationDidGoOffline` and `workstationDidComeOnline` delegate methods
   - `AppState` observes and publishes workstation status separately from tunnel connection
   - UI shows **orange indicator** when tunnel is connected but workstation is offline
   - Status text shows "Connected (Workstation Offline)" when workstation is offline
   - Provides clear visual feedback when workstation disconnects from tunnel

### January 30, 2025 - Heartbeat Refactoring and Architecture Improvements

**Major Improvements:**
1. **Task-Based Heartbeat:** Replaced `Timer`-based heartbeat with `Task.sleep`-based periodic pings
   - More reliable in async contexts (no RunLoop dependency)
   - Better cancellation handling
   - Sends initial ping immediately after authentication
   - Periodic pings every 20 seconds using `Task.sleep`
2. **Task-Based Pong Timeout:** Replaced `Timer`-based pong timeout with `Task`-based timeout
   - Properly cancellable when pong is received
   - No RunLoop dependency
   - Better integration with Swift concurrency
3. **Timestamp Logging:** Added human-readable timestamps to all log messages
   - Format: `[HH:mm:ss.SSS]` prefix on all log messages
   - Static logging utility for consistent formatting
   - Improves debugging and log analysis
4. **Actor Isolation Improvements:** Enhanced thread safety for ping/pong operations
   - Connection state checks happen on MainActor
   - Proper synchronization for all state mutations
   - Eliminated data race warnings

**Fixed Issues:**
1. **Connection Timeout After Auth:** Fixed connection closing after authentication by refactoring message listening
   - `listenForMessages()` now uses `task.receive()` directly (no timeout)
   - `receiveMessage()` only used for connection setup with explicit timeouts
   - Prevents premature disconnection after successful auth
2. **Multiple Reconnection Attempts:** Enhanced reconnection logic to prevent simultaneous attempts
   - Checks both `isConnecting` and `isReconnecting` flags
   - Prevents reconnection if already connected
   - Better state management during connection lifecycle

### January 29, 2025 - Bug Fixes and Improvements

**Fixed Issues:**
1. **URL Normalization:** Fixed to not add default ports (80/443) for URLs with paths (e.g., `/ws`), as these are service-specific and should include the port explicitly
2. **Continuation Leaks:** Fixed Swift task continuation leaks in `waitForConnection()` by ensuring continuations are always resumed, even on connection close
3. **Workstation Offline Handling:** Added proper error handling for workstation offline scenarios with `workstationOffline` error type
4. **Workstation Auth Processing:** Fixed workstation server's `onClientMessage` handler to actually process auth messages (was previously only logging)
5. **Type Safety:** Replaced `any` types with proper Zod schema validation
6. **Code Quality:** Extracted helper functions for better maintainability and added comprehensive error handling

**Improvements:**
- Added extensive logging throughout connection flow for debugging
- Improved error messages with actionable guidance
- Added timeout handling for message receiving operations
- Prevented multiple simultaneous connection attempts
- Better error handling for authentication failures

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
7. Send `auth` message to workstation (via tunnel)
8. Workstation processes auth message and sends `auth.success` response
9. Tunnel forwards response to client
10. Client receives `auth.success` and completes authentication
11. Start heartbeat mechanism
  - **URL Normalization:**
    - Converts `http://` → `ws://` and `https://` → `wss://`
    - Only adds default ports (80 for `ws://`, 443 for `wss://`) if port is missing AND no path is present
    - URLs with paths (like `/ws`) are assumed to be service-specific and should include the port explicitly
    - Validates WebSocket URL format
    - Logs warnings when port is missing to guide users
  - **Heartbeat:**
    - **Task-Based Implementation:** Uses `Task.sleep` for periodic pings (no Timer/RunLoop dependency)
    - Sends initial ping immediately after authentication
    - Sends `ping` every 20 seconds using async task loop
    - Tracks last `pong` timestamp
    - **Pong Timeout:** Uses `Task`-based timeout (30 seconds) instead of Timer
    - Marks connection stale if no `pong` received within 30 seconds
    - Automatically reconnects on stale connection
    - Properly cancels all tasks on disconnection
  - **Reconnection:**
    - Exponential backoff: 1s → 2s → 4s → ... → 30s max
    - Automatic reconnection on disconnect or stale connection
    - **Smart Reconnection:** Skips reconnection attempts when workstation is offline (user needs to start workstation first)
    - Restores subscriptions after reconnect
    - Prevents multiple simultaneous connection attempts with `isConnecting` flag
  - **Message Handling:**
    - **Connection Setup:** Uses `receiveMessage()` with 30s timeout for initial connection/auth
    - **Ongoing Listening:** Uses `task.receive()` directly (no timeout) after authentication
    - Uses `Data` (Sendable) in task groups to avoid concurrency issues
    - Routes to delegate callbacks (all dispatched to main actor)
    - Handles `pong` responses for heartbeat (cancels pong timeout task)
    - Handles `connection.workstation_offline/online` events
    - Handles error messages during auth flow (workstation offline, tunnel not found)
    - **Timestamp Logging:** All log messages include human-readable timestamps `[HH:mm:ss.SSS]`
    - Comprehensive logging at each step for debugging

### 6. Connection Service

**File:** `apps/TiflisCode/Shared/Services/WebSocket/ConnectionService.swift`

- **Protocol:** `ConnectionServicing` (marked `@MainActor`)
- **Implementation:** `ConnectionService` (marked `@MainActor`)
- **Features:**
  - Wraps `WebSocketClient` and coordinates connection lifecycle
  - Manages connection state transitions
  - **Tracks workstation status separately from tunnel connection:**
    - `@Published var workstationOnline: Bool` - Tracks whether workstation is online
    - Updated via `workstationDidGoOffline` and `workstationDidComeOnline` delegate methods
    - Defaults to `true` (assumes online until notified otherwise)
    - Reset to `true` when tunnel disconnects
  - Handles credential loading from Keychain and UserDefaults
  - Provides `@Published` connection state for ViewModel observation
  - Provides `@Published` workstation online status for ViewModel observation
  - Implements `WebSocketClientDelegate` to update connection state and workstation status
  - **Dependencies (injected):**
    - `WebSocketClient` (concrete type, not protocol, for Sendable safety)
    - `KeychainManaging`
    - `DeviceIDManaging`

## Files Modified

### 1. AppState (ViewModel)

**File:** `apps/TiflisCode/TiflisCode/App/TiflisCodeApp.swift`

**Changes:**
- Added `@AppStorage("tunnelId")` for tunnel ID persistence
- Added `@Published var workstationOnline: Bool` to track workstation status separately
- Injected `ConnectionService` as dependency (with default implementation)
- Removed stub `connect()` implementation
- Updated `connect()` to call `connectionService.connect()` asynchronously
- Updated `disconnect()` to call `connectionService.disconnect()`
- Added `observeConnectionState()` to subscribe to connection state changes via Combine
- Added observation of `workstationOnlinePublisher` from `ConnectionService`
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
After authentication:
    ↓
Send initial ping immediately
    ↓
Start periodic ping task (Task.sleep-based)
    ↓
Every 20 seconds:
    ↓
Check connection state on MainActor
    ↓
If connected:
    WebSocketClient.sendPing()
        ↓
    Send {"type": "ping", "timestamp": ...}
        ↓
    Start 30-second pong timeout task (Task-based)
        ↓
    If pong received within 30s:
        - Cancel pong timeout task
        - Update lastPongTimestamp
        - Continue normal operation
        ↓
    If no pong within 30s:
        - handlePongTimeout() called
        - Mark connection stale
        - Disconnect
        - Schedule reconnection
    ↓
If not connected:
    - Stop ping task
    - Exit loop
```

**Key Implementation Details:**
- **Task-Based:** Uses `Task.sleep` instead of `Timer` for better async integration
- **Initial Ping:** Sends ping immediately after authentication to keep connection alive
- **Cancellation:** All tasks properly cancelled on disconnection via `stopHeartbeat()`
- **Thread Safety:** Connection state checks happen on MainActor
- **No RunLoop Dependency:** Works reliably in any async context

### 3. Reconnection Flow

```
Connection lost or stale
    ↓
WebSocketClient.handleDisconnection()
    ↓
Cancel heartbeat
Notify delegate (on main actor)
    ↓
Check error type:
    - If workstationOffline: Skip reconnection (user must start workstation)
    - Otherwise: scheduleReconnect()
    ↓
scheduleReconnect()
    ↓
Prevent multiple simultaneous attempts (isConnecting flag)
    ↓
Calculate delay: min(1s * 2^attempts, 30s)
    ↓
Wait for delay
    ↓
Retry connect() with stored credentials
    ↓
If successful:
    - Reset reconnectAttempts
    - Clear isConnecting flag
    - Restore subscriptions
    ↓
If failed:
    - Increment reconnectAttempts
    - Clear isConnecting flag
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
    "workstation_name": "My MacBook",
    "workstation_version": "0.1.0",
    "protocol_version": "1.0",
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
  - Message receiving uses `Data` (which is Sendable) in task groups instead of `[String: Any]`
  - Connection state checks in ping task happen on MainActor
  - All task-based operations use proper actor isolation
- `ConnectionService` stores concrete `WebSocketClient` type (not protocol) to avoid Sendable protocol issues
- `receiveMessage()` uses `withThrowingTaskGroup(of: Data.self)` to avoid Sendable issues with `[String: Any]`
- **Heartbeat Tasks:** All ping/pong timeout tasks use `weak self` and proper cancellation

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

### Continuation Management

The `waitForConnection()` function uses a continuation that must always be resumed to prevent leaks:

```swift
private func waitForConnection() async throws {
    return try await withCheckedThrowingContinuation { continuation in
        self.connectionContinuation = continuation
        // Timeout task ensures continuation is always resumed
        Task {
            try? await Task.sleep(for: .seconds(10))
            if let cont = self.connectionContinuation {
                self.connectionContinuation = nil
                cont.resume(throwing: WebSocketError.connectionClosed)
            }
        }
    }
}
```

The continuation is also resumed in the `didCloseWith` delegate method to handle cases where the connection closes before opening.

## URL Normalization

The `normalizeWebSocketURL()` function handles various URL formats:

| Input | Output | Notes |
|-------|--------|-------|
| `http://192.168.1.112/ws` | `ws://192.168.1.112/ws` | Converts http→ws, **does NOT add port** (path present) |
| `https://example.com/ws` | `wss://example.com/ws` | Converts https→wss, **does NOT add port** (path present) |
| `ws://192.168.1.112:3001/ws` | `ws://192.168.1.112:3001/ws` | No change (port already specified) |
| `ws://192.168.1.112` | `ws://192.168.1.112:80` | Adds default port 80 (no path) |
| `wss://example.com` | `wss://example.com:443` | Adds default port 443 (no path) |

**Important:** URLs with paths (like `/ws`) are assumed to be service-specific endpoints and should include the port explicitly. The tunnel server typically runs on port 3001, so URLs should be: `ws://host:3001/ws`.

## Error Handling

### Connection Errors

- `WebSocketError.invalidURL` - URL format is invalid
- `WebSocketError.notConnected` - Attempted operation on closed connection
- `WebSocketError.connectionClosed` - Connection was closed unexpectedly (includes helpful message about port)
- `WebSocketError.authenticationFailed(String)` - Auth key rejected by workstation
- `WebSocketError.missingCredentials` - Required credentials not available
- `WebSocketError.workstationOffline(String)` - Workstation is not connected to tunnel (new)

### Error Handling Improvements

- **Workstation Offline Detection:** Client now properly detects when workstation is offline and shows clear error message
- **No Automatic Reconnection:** When workstation is offline, client does not attempt reconnection (user must start workstation first)
- **Error Messages:** All error messages include actionable guidance (e.g., "Check that the tunnel server is running and the URL includes the correct port (default: 3001)")
- **Timeout Protection:** Message receiving operations have 30-second timeout to prevent indefinite waiting

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
- ✅ Workstation status tracking in UI (orange indicator when workstation offline)
- ✅ URL normalization (http→ws, missing ports)
- ✅ Workstation offline error detection and handling
- ✅ Multiple simultaneous connection attempt prevention
- ✅ Continuation leak prevention
- ✅ Message receiving timeout protection
- ✅ Proper error responses for authentication failures
- ✅ Task-based heartbeat (no Timer/RunLoop dependency)
- ✅ Human-readable timestamp logging
- ✅ Improved reconnection state management

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

1. **URL Port Requirement:** URLs with paths (like `/ws`) do not get default ports added. Users must include the port explicitly (e.g., `ws://host:3001/ws`). This is intentional to avoid incorrect port assumptions for service-specific endpoints.
2. **Reconnection:** Maximum reconnection delay is 30 seconds; after that, manual reconnect may be needed.
3. **Message Queueing:** Messages sent during disconnection are not queued (future enhancement).
4. **Tunnel Socket Architecture:** The workstation server now supports optional socket for tunnel connections. Clients registered via tunnel don't require a direct WebSocket socket, improving architecture and eliminating the previous workaround.
5. **Broadcast to All Clients:** When workstation sends auth response, tunnel forwards it to all clients (not just the requesting client). This works because clients only process messages intended for them, but is not optimal for multi-client scenarios.

## Future Enhancements

1. **Message Queueing:** Queue messages during disconnection and send on reconnect
2. **Connection Quality Monitoring:** Track latency and connection quality metrics
3. **Adaptive Heartbeat:** Adjust ping interval based on connection quality (currently fixed at 20s)
4. **Background Reconnection:** Continue reconnection attempts when app is backgrounded
5. **Certificate Pinning:** For production WSS connections
6. **Voice Activity Detection (VAD):** Automatic end-of-speech detection for voice input (currently requires manual stop)

## Workstation Server Authentication Flow

### Tunnel-Based Authentication

When a mobile client sends an `auth` message through the tunnel:

1. **Tunnel receives message** from mobile client
2. **Tunnel forwards to workstation** via `forwardToWorkstation()`
3. **Workstation receives** via `onClientMessage` callback
4. **Message validation** using Zod `AuthMessageSchema`
5. **Client authentication** via `AuthenticateClientUseCase`
6. **Client registration** in client registry (optional socket for tunnel connections)
7. **Response generation** - `auth.success` or `auth.error`
8. **Response sent** through `MessageBroadcaster.sendToClient()` via tunnel
9. **Tunnel forwards** response to all connected clients
10. **Mobile client receives** and processes response

### Implementation Details

**Architecture Improvements (January 30, 2025):**

- **Optional Socket Support:** `Client` entity now supports optional `socket` for tunnel connections
- **Tunnel Registration:** `ClientRegistry.registerTunnel()` method for registering clients without direct socket
- **Clean Architecture:** Removed workaround functions; proper domain-driven design
- **Message Broadcasting:** Uses `MessageBroadcaster` to send responses via tunnel instead of direct socket access

**Error Handling:**

- Invalid message format: Logged and ignored
- Authentication failure: Sends `auth.error` response with error details
- All errors logged with structured logging for debugging

**Type Safety:**

- Uses Zod schemas for runtime validation (`AuthMessageSchema`)
- Proper error types instead of `any`
- Type-safe message parsing

## Debugging and Logging

### Client-Side Logging

The WebSocket client includes comprehensive logging with **human-readable timestamps**:

**Log Format:**
- All log messages are prefixed with timestamp: `[HH:mm:ss.SSS]`
- Example: `[22:27:29.556] 🔌 WebSocket: Connecting to ws://192.168.1.112:3001/ws`

**Log Categories:**
- `🔌 WebSocket: Connecting to...` - Connection attempts
- `✅ WebSocket: Connection opened successfully` - Connection established
- `📤 WebSocket: Sending connect message...` - Message sending
- `📥 WebSocket: Received message: ...` - Message reception
- `⏳ WebSocket: Waiting for...` - Waiting states
- `❌ WebSocket: ...` - Errors and failures
- `⚠️ WebSocket: ...` - Warnings (e.g., missing port)
- `📤 WebSocket: Sent ping (timestamp: ...)` - Heartbeat pings
- `📥 WebSocket: Received pong (timestamp: ...)` - Heartbeat pongs
- `⏰ WebSocket: Ping task started (interval: ...)` - Heartbeat initialization
- `🛑 WebSocket: Ping task ended` - Heartbeat cancellation

**Implementation:**
- Static `log(_:)` method for consistent formatting
- Static `timestamp` computed property using `DateFormatter`
- All logging centralized through `WebSocketClient.log()` helper

### Server-Side Logging

Workstation server logs:
- Auth message processing
- Authentication results
- Error responses
- Tunnel communication status

## References

- **PROTOCOL.md** - Complete WebSocket protocol specification
- **docs/MOBILE_APP_LOGIC.md** - Mobile app architecture and UI patterns
- **CLAUDE.md** - Project architecture and development guidelines

