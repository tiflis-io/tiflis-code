# 📱 Tiflis Code — Mobile App Logic

> Complete documentation of iOS and watchOS application behavior, navigation patterns, and UI logic.

---

## Table of Contents

- [Application Architecture](#application-architecture)
- [Recent Features](#recent-features)
- [watchOS App](#watchos-app)
- [Navigation System](#navigation-system)
- [Connection Management](#connection-management)
- [Session Management](#session-management)
- [Chat Interface](#chat-interface)
- [Voice Interaction](#voice-interaction)
- [Settings](#settings)
- [State Management](#state-management)
- [UI Components](#ui-components)

---

## Application Architecture

### Tech Stack

| Layer                | Technology                                           |
| -------------------- | ---------------------------------------------------- |
| **UI Framework**     | SwiftUI                                              |
| **State Management** | `@StateObject`, `@EnvironmentObject`, `@AppStorage`  |
| **Navigation**       | `NavigationSplitView` (iPad), Custom Drawer (iPhone) |
| **Concurrency**      | Swift Concurrency (async/await)                      |
| **Persistence**      | `@AppStorage` for settings, Keychain for credentials |

### Architecture Pattern: MVVM

```
┌─────────────────────────────────────────────────────────────────┐
│                        View Layer                                │
│   SwiftUI Views (ContentView, ChatView, SettingsView, etc.)     │
│   • Observes ViewModel via @StateObject                         │
│   • Sends user actions to ViewModel                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ViewModel Layer                              │
│   @MainActor classes (ChatViewModel, AppState)                  │
│   • Manages UI state via @Published properties                  │
│   • Handles user actions, transforms data                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Domain Layer                                │
│   Pure Swift types (Session, Message, ConnectionState)          │
│   • Shared between iOS and watchOS                              │
└─────────────────────────────────────────────────────────────────┘
```

### Entry Point

```swift
@main
struct TiflisCodeApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}
```

---

## Recent Features

### Voice Messaging (v1.6)

Full voice input/output pipeline with STT transcription and TTS responses:

- **Voice Input** — Record audio commands with pulsing ring animation
- **STT Transcription** — Server-side speech-to-text via OpenAI Whisper, ElevenLabs, or Deepgram
- **TTS Output** — Text-to-speech responses automatically summarized to ~3 sentences
- **Multi-device Sync** — Only the initiating device auto-plays TTS audio

### Agent Aliases

Custom agent configurations display with their alias names:

- Session creation shows available aliases (e.g., "zai" instead of "claude")
- Aliases restored correctly after reconnection
- Streaming state preserved during agent alias restoration

### Confirmation Dialogs

User confirmation required for destructive actions:

- **Clear Supervisor Context** — Confirmation before clearing chat history
- **Terminate Terminal Session** — Confirmation before ending terminal sessions

### Keyboard Input Enhancements

Improved text input handling in chat:

- **Return** — Sends the message
- **Shift+Return** — Inserts a newline

### Screen On Feature

App keeps the screen awake while active to prevent interruptions during voice commands or long-running operations. Implemented via `UIApplication.shared.isIdleTimerDisabled`.

### WebSocket Optimization

- Increased max message size to 50MB for audio sync
- Audio data excluded from `sync.state` (uses `has_audio` flags instead)

### Stop Generation (v1.7)

Cancel in-progress AI responses:

- **UI**: Send button transforms into Stop button during streaming
- **Protocol**: Sends `supervisor.cancel` or `session.cancel` command
- **Feedback**: Shows "Cancelled by user" status block

### Message Delivery Status (v1.12)

Real-time feedback for message delivery with "Sending..." → "Sent" → "Failed" indicators:

- **Pending (🕐)**: Message sent, waiting for server acknowledgment
- **Sent (✓)**: Server confirmed receipt via `message.ack`
- **Failed (⚠️)**: No acknowledgment within 5 seconds

```swift
enum SendStatus: String, Codable {
    case pending   // Waiting for ack
    case sent      // Ack received
    case failed    // Timeout, no ack
}
```

**Implementation:**
- Messages include unique `message_id` in command
- AppState tracks pending acks with 5-second timeout
- UI shows status indicator next to user messages
- Works for both Supervisor and Agent session messages

### Message Splitting (v1.10)

Long assistant responses are automatically split into multiple chat bubbles for improved readability:

- **Max Lines Per Segment**: 17 lines (estimated height units)
- **Min Threshold to Split**: 20 height units
- **Preserves Context**: Each segment shows segment index (e.g., "1/3")
- **Avatar/Timestamp**: Only shown on first segment

```swift
struct SplitMessageSegment {
    let segmentIndex: Int
    let totalSegments: Int
    let isContinuation: Bool  // true for segments after first
    let content: [MessageContentBlock]
}
```

### Portrait-Only Locking

App is locked to portrait mode on iPhone to ensure consistent UI experience and prevent layout issues during voice recording.

### Scroll-to-Bottom FAB

Floating action button appears when user scrolls >100px from bottom:

- Uses actual item count (accounting for message splitting)
- Smooth scroll animation on tap
- Auto-hides when near bottom

### On-Demand Audio Loading

Audio data excluded from sync to reduce bandwidth. Audio loaded on-demand:

1. Voice blocks show `has_audio: true` without actual data
2. User taps play → `audio.request` sent with `message_id`
3. Server responds with `audio.response` containing base64 audio
4. Client caches audio locally for subsequent plays

---

## watchOS App (WIP)

> **Status:** In active development, not yet ready for production use.

Native Apple Watch companion app with independent connectivity.

### Overview

| Feature               | Description                                           |
| --------------------- | ----------------------------------------------------- |
| **HTTP Polling**      | REST API instead of WebSocket (blocked on watchOS 9+) |
| **Voice Input**       | Dictation for Supervisor commands                     |
| **Session List**      | View and manage active sessions                       |
| **WatchConnectivity** | Sync credentials with iPhone app                      |
| **Independent**       | Works without iPhone nearby (requires network)        |

### Architecture

```
TiflisCodeWatch/
├── App/
│   └── TiflisCodeWatchApp.swift      # Entry point
├── State/
│   └── WatchAppState.swift           # @MainActor state management
├── Services/
│   ├── HTTPPollingService.swift      # REST API client
│   ├── WatchConnectionService.swift  # Connection management
│   ├── WatchConnectivityManager.swift # iPhone sync
│   └── WatchAudioService.swift       # TTS playback
└── Views/
    ├── WatchRootView.swift           # Root navigation
    ├── WatchMainView.swift           # Main content
    ├── WatchSetupView.swift          # Initial setup
    ├── WatchSessionListView.swift    # Session list
    ├── WatchChatView.swift           # Supervisor chat
    ├── WatchMessageRow.swift         # Message rendering
    └── WatchVoiceButton.swift        # Voice input button
```

### HTTP Polling API

watchOS uses HTTP polling instead of WebSocket (Apple blocks WebSocket on watchOS 9+).

> 📖 See [PROTOCOL.md Section 10](../PROTOCOL.md#10-http-polling-api-watchos) for full API specification including endpoints, message format, and polling strategy.

### WatchConnectivity

Synchronization with iPhone app:

```swift
// Credential transfer from iPhone
struct WatchConnectionData: Codable {
    let tunnelId: String
    let tunnelURL: String
    let authKey: String
}

// State sync
struct WatchStateSync: Codable {
    let sessions: [Session]
    let supervisorHistory: [Message]
}
```

**Sync Events:**

- **iPhone → Watch**: Credentials, sessions, chat history
- **Watch → iPhone**: Voice commands, session actions

### Limitations

| Feature      | iOS             | watchOS               |
| ------------ | --------------- | --------------------- |
| WebSocket    | ✅ Full support | ❌ Blocked by Apple   |
| Terminal     | ✅ SwiftTerm    | ❌ Not available      |
| Voice Input  | ✅ Recording    | ✅ Dictation only     |
| TTS Playback | ✅ Full support | ✅ Limited support    |
| Background   | ✅ Extended     | ⚠️ Limited by watchOS |

---

## Navigation System

### Adaptive Navigation

The app uses **different navigation patterns** based on device/orientation:

| Device / Orientation | Navigation Pattern    | Sidebar Behavior                |
| -------------------- | --------------------- | ------------------------------- |
| **iPhone (any)**     | Custom Drawer         | Full-screen menu, swipe-to-open |
| **iPad Portrait**    | `NavigationSplitView` | Overlay sidebar                 |
| **iPad Landscape**   | `NavigationSplitView` | Persistent sidebar              |

### iPhone Navigation (Drawer)

Custom full-screen drawer with gesture-based navigation:

| Gesture                           | Action       |
| --------------------------------- | ------------ |
| Swipe right from left edge (20pt) | Open drawer  |
| Swipe left anywhere               | Close drawer |
| Tap ☰ button                      | Open drawer  |
| Tap selected item                 | Close drawer |

**Key Implementation:**

- Drawer opens **only** from left edge (20pt) to prevent accidental triggers
- Uses `allowsHitTesting` based on actual drawer position (90% visibility threshold)
- Auto-closes on session change with `isSilentSessionChange` flag support

### iPad Navigation (Split View)

Uses `NavigationSplitView` with sidebar containing: Supervisor, Agent Sessions, Terminals, Settings.

### Sidebar Structure

- **Header**: "Tiflis Code" + [+] button for new sessions
- **Supervisor**: Always visible singleton
- **Sessions**: Grouped by type (Agents, Terminals), swipe-left to terminate
- **Settings**: Separate page

### Navigation Flow

App Launch → Check credentials → Auto-connect (if saved) or Show Disconnected → Supervisor view → User navigates to Session/Terminal/Settings

---

## Connection Management

### Connection States

The app tracks two separate connection states:

1. **Tunnel Connection** (`ConnectionState`) - Connection to the tunnel server
2. **Workstation Status** (`workstationOnline: Bool`) - Whether the workstation is online

```swift
enum ConnectionState: Equatable {
    case connected
    case connecting
    case disconnected
    case error(String)
}

@Published var workstationOnline: Bool = true
```

| Tunnel State   | Workstation Status | Indicator    | Color  | Description                                                      |
| -------------- | ------------------ | ------------ | ------ | ---------------------------------------------------------------- |
| `connected`    | Online             | ●            | Green  | Fully functional - tunnel and workstation both online            |
| `connected`    | Offline            | ●            | Orange | Tunnel connected but workstation offline - limited functionality |
| `connecting`   | —                  | ◐ (animated) | Yellow | Attempting to connect to tunnel                                  |
| `disconnected` | —                  | ○            | Gray   | Not connected to tunnel                                          |
| `error`        | —                  | ●            | Red    | Connection failed with error                                     |

**Important:** The tunnel connection and workstation status are tracked independently. The tunnel server sends `connection.workstation_offline` and `connection.workstation_online` events when the workstation disconnects/reconnects, allowing the app to show the orange indicator even when the tunnel connection remains active.

### Connection Indicator

The connection indicator is **always visible** in the toolbar and reflects both tunnel connection and workstation status:

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  │  Session Title               ● │  ⋮                      │
│     │  Subtitle                      │                         │
└─────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Tap
                                        ▼
                    ┌─────────────────────────────────────┐
                    │  ● Connected                        │  ← 1. Status (Green/Orange)
                    │  ───────────────────────────────    │
                    │  Workstation: My MacBook             │  ← 2. Workstation name
                    │  Tunnel: wss://tunnel.tiflis.io/ws   │  ← 3. Tunnel URL
                    │  Tunnel ID: Z6q62aKz-F96             │  ← 4. Tunnel ID
                    │  Tunnel Version: 0.1.0 (1.0.0)      │  ← 5. Tunnel version (protocol version inline)
                    │  Workstation Version: 0.1.0 (1.0.0)│  ← 6. Workstation version (protocol version inline)
                    │                                     │
                    │  [ Disconnect ]                     │  ← 7. Disconnect (with confirmation)
                    └─────────────────────────────────────┘
```

**Indicator Colors:**

- **Green (●)**: Tunnel connected AND workstation online - fully functional
- **Orange (●)**: Tunnel connected BUT workstation offline - shows "Connected (Workstation Offline)" status text
- **Yellow (◐)**: Connecting to tunnel (animated pulse)
- **Gray (○)**: Disconnected from tunnel
- **Red (●)**: Connection error

The indicator color is computed based on both states:

```swift
private var indicatorColor: Color {
    guard appState.connectionState.isConnected else {
        return appState.connectionState.indicatorColor
    }
    // If tunnel is connected but workstation is offline, show orange
    if !appState.workstationOnline {
        return .orange
    }
    // Both tunnel and workstation are online
    return .green
}
```

### Connection Methods

#### 1. QR Code Scan

```
┌─────────────────────────────┐
│    📷 Camera View           │
│                             │
│    Point at QR code on      │
│    workstation terminal     │
└─────────────────────────────┘
```

#### 2. Magic Link

Format: `tiflis://connect?data=<base64_encoded_json>`

The magic link uses a single base64-encoded query parameter containing a JSON payload with connection information. The `tunnel_id` parameter is required for proper routing to the correct workstation. It is a persistent identifier that survives workstation restarts.

**JSON payload structure:**

```json
{
  "tunnel_id": "Z6q62aKz-F96",
  "url": "wss://tunnel.example.com/ws",
  "key": "my-workstation-auth-key"
}
```

**Important:** The `url` field contains only the base WebSocket address without query parameters. The `tunnel_id` is provided separately in the payload and should not be included in the URL.

```swift
private func handleMagicLink(_ link: String) {
    // Parse magic link in format: tiflis://connect?data=<base64_encoded_json>
    guard let url = URL(string: link),
          url.scheme == "tiflis",
          url.host == "connect",
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let queryItems = components.queryItems,
          let dataItem = queryItems.first(where: { $0.name == "data" }),
          let base64Data = dataItem.value,
          let jsonData = Data(base64Encoded: base64Data),
          let payload = try? JSONDecoder().decode(MagicLinkPayload.self, from: jsonData) else {
        return
    }

    tunnelId = payload.tunnel_id
    tunnelURL = payload.url
    authKey = payload.key

    appState.connect()
}

private struct MagicLinkPayload: Codable {
    let tunnel_id: String
    let url: String
    let key: String
}
```

### Auto-Connect on Launch

```swift
init() {
    // Auto-connect on launch if we have saved credentials
    if hasConnectionConfig {
        connect()
    }
}

var hasConnectionConfig: Bool {
    !tunnelURL.isEmpty
}
```

---

## Session Management

### Session Types

```swift
enum SessionType: String, Codable {
    case supervisor   // Singleton, always available
    case cursor       // Cursor agent session
    case claude       // Claude Code agent session
    case opencode     // OpenCode agent session
    case terminal     // PTY terminal session
}
```

### Agent Aliases

Sessions can have custom aliases defined via `AGENT_ALIAS_*` environment variables on the workstation:

```swift
struct Session {
    // ...
    var agentAlias: String?  // Custom alias name (e.g., "zai")

    var displayName: String {
        agentAlias ?? type.displayName
    }
}
```

### Session Icons

| Type       | Icon Source                | Asset Name            |
| ---------- | -------------------------- | --------------------- |
| Supervisor | Custom Image               | `TiflisLogo`          |
| Cursor     | Custom Image               | `CursorLogo`          |
| Claude     | Custom Image               | `ClaudeLogo`          |
| OpenCode   | Custom Image (theme-aware) | `OpenCodeLogo`        |
| Terminal   | SF Symbol                  | `apple.terminal.fill` |

```swift
var customIcon: String? {
    switch self {
    case .supervisor: return "TiflisLogo"
    case .cursor: return "CursorLogo"
    case .claude: return "ClaudeLogo"
    case .opencode: return "OpenCodeLogo"
    case .terminal: return nil // Use SF Symbol
    }
}
```

### Session Subtitle (Working Directory)

Sessions display a **relative path** as subtitle:

```swift
var subtitle: String? {
    guard let workspace = workspace, let project = project else {
        return workingDir  // For terminal sessions
    }

    if let worktree = worktree {
        return "\(workspace)/\(project)--\(worktree)"
    }
    return "\(workspace)/\(project)"
}
```

Examples:

- `tiflis/tiflis-code`
- `tiflis/tiflis-code--feature-auth`

### Session Creation

Sessions are created via the `[+]` button in sidebar:

```
┌─────────────────────────────────────────┐
│          New Session                    │
├─────────────────────────────────────────┤
│  Session Type                           │
│  ┌─────────────────────────────────┐    │
│  │ 🤖 Claude Code              ✓   │    │  ← Radio selection
│  │ 🎯 Cursor                       │    │
│  │ 📟 OpenCode                     │    │
│  │ 💻 Terminal                     │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Project (for agents only)              │
│  ┌─────────────────────────────────┐    │
│  │ Workspace: [tiflis        ▼]   │    │  ← Picker
│  │ Project:   [tiflis-code   ▼]   │    │  ← Depends on workspace
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  [Cancel]              [Create]         │
└─────────────────────────────────────────┘
```

**Validation Rules:**

- Terminal: No project selection required
- Agents: Both workspace and project required

### Session Termination

Sessions can be terminated via:

1. **Swipe-to-delete** in sidebar (all session types)
2. **Menu action** in session detail view (with confirmation for terminal sessions)

```swift
func terminateSession(_ session: Session, silent: Bool = false) {
    sessions.removeAll { $0.id == session.id }
    if selectedSessionId == session.id {
        // Set flag before changing selection
        isSilentSessionChange = silent
        selectedSessionId = "supervisor"
        // Reset flag after a brief delay
        if silent {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.isSilentSessionChange = false
            }
        }
    }
}
```

**Termination Behavior:**

**From Sidebar (Swipe-to-Delete):**

- Session is removed from the list immediately
- If the terminated session was currently selected, `selectedSessionId` silently changes to "supervisor"
- **No UI transitions occur** - drawer stays open, no navigation animations
- User remains on the sidebar for quick multi-session management
- Applies to all session types (agents and terminals)

**From Session Detail View (Menu Action):**

- **Agent sessions** (Claude, Cursor, OpenCode): Terminates immediately with navigation
- **Terminal sessions**: Shows confirmation dialog, then navigates to supervisor
- After termination, supervisor is automatically selected
- **iPhone**: Sidebar drawer opens to show supervisor selection (for terminal only)
- **iPad**: View switches to supervisor immediately

---

## Chat Interface

### ChatView Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  │  Claude Code              ● │  ⋮                         │
│     │  tiflis/tiflis-code         │                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │              Empty State / Messages                      │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Message input...                         🎤  ▶         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Empty State

When no messages exist, an empty state is displayed:

```
              ┌────────────────────┐
              │    [Agent Icon]    │
              │                    │
              │    Agent Name      │
              │  📁 workspace/proj │
              │                    │
              │  "Send a message   │
              │   to start..."     │
              └────────────────────┘
```

**Empty State Messages by Type:**

| Session Type           | Message                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Supervisor             | "Ask me to create sessions, manage projects, or explore your workspaces" |
| Claude/Cursor/OpenCode | "Send a message to start coding with AI assistance"                      |
| Terminal               | (no message - terminal has different UI)                                 |

### Message Bubbles

```
User Message (right-aligned):
                              ┌─────────────────────────┐
                              │ User's message text     │
                              │                         │
                              └─────────────────────────┘

Assistant Message (left-aligned):
┌───────┐
│ Icon  │  ┌─────────────────────────────────────────┐
└───────┘  │ Assistant's response with markdown      │
           │ support and streaming...                 │
           │                                          │
           │ ▶ Audio attachment (if TTS enabled)     │
           └─────────────────────────────────────────┘
```

### Session Menu Actions

| Session Type           | Menu Actions                                 |
| ---------------------- | -------------------------------------------- |
| Supervisor             | Clear Context (with confirmation dialog)     |
| Claude/Cursor/OpenCode | Session Info, Terminate Session              |
| Terminal               | Terminate Session (with confirmation dialog) |

### Confirmation Dialogs

Destructive actions require user confirmation:

**Clear Supervisor Context:**

```swift
.confirmationDialog(
    "Clear Context?",
    isPresented: $showClearContextConfirmation,
    titleVisibility: .visible
) {
    Button("Clear", role: .destructive) {
        viewModel.clearContext()
    }
    Button("Cancel", role: .cancel) {}
} message: {
    Text("This will clear the conversation history. This action cannot be undone.")
}
```

### Keyboard Handling

#### Return Key Behavior

In the chat input field:

- **Return** — Sends the message immediately
- **Shift+Return** — Inserts a newline for multi-line input

```swift
TextField("Message", text: $text, axis: .vertical)
    .onSubmit {
        if !text.isEmpty {
            onSend()
        }
    }
    .submitLabel(.send)
```

#### Dismissing Keyboard

Tap anywhere in scroll view dismisses keyboard:

```swift
.onTapGesture {
    hideKeyboard()
}

@MainActor
func hideKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil, from: nil, for: nil
    )
}
```

#### Drawer and Keyboard Interaction

When the drawer opens on iPhone, the keyboard is automatically dismissed. When the drawer closes, the keyboard is restored if the terminal session was active:

**Implementation using Environment Values (Best Practice):**

1. **Environment Key** - Define a custom Environment key for drawer state:

```swift
// View+Extensions.swift
private struct IsDrawerOpenKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var isDrawerOpen: Bool {
        get { self[IsDrawerOpenKey.self] }
        set { self[IsDrawerOpenKey.self] = newValue }
    }
}
```

2. **DrawerNavigationView** - Pass state via Environment and hide keyboard on open:

```swift
// Main content
NavigationStack { ... }
    .environment(\.isDrawerOpen, isDrawerOpen)
    .onChange(of: isDrawerOpen) { oldValue, newValue in
        if newValue {
            hideKeyboard()
        }
    }
```

3. **TerminalView** - Restore focus when drawer closes:

```swift
@Environment(\.isDrawerOpen) private var isDrawerOpen
@FocusState private var isInputFocused: Bool

.onChange(of: isDrawerOpen) { oldValue, newValue in
    if !newValue && oldValue {
        // Drawer just closed - restore focus
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250)) // Wait for animation
            isInputFocused = true
        }
    }
}
```

**Why This Approach:**

- ✅ Uses Environment for state passing (standard SwiftUI pattern)
- ✅ Uses `.onChange` for reactivity (Apple recommended)
- ✅ Uses `@FocusState` for focus management (official API)
- ✅ Uses `Task.sleep` instead of `DispatchQueue.asyncAfter` (modern async/await)
- ✅ Avoids private APIs and NotificationCenter

---

## Terminal Interface

### TerminalView Architecture

The terminal uses **SwiftTerm** library for terminal emulation. The implementation follows a simplified architecture:

**Architecture:** `TerminalView` (SwiftUI) → `TerminalContentView` (UIViewRepresentable) → `TerminalViewUIKit` → `SwiftTerm.TerminalView`

> 📖 See [SWIFT-TERM-IPHONE-BEST-PRACTICE.md](SWIFT-TERM-IPHONE-BEST-PRACTICE.md) for complete implementation guide

### Key Implementation Details

**Data Flow:**

- **Output**: WebSocket → TerminalViewModel → `TerminalView.feed()` → SwiftTerm rendering
- **Input**: User types → SwiftTerm → `TerminalViewDelegate.send()` → ViewModel → WebSocket

**Features:**

- Single Terminal instance (SwiftTerm's internal)
- Auto dark/light theme via iOS 17+ `registerForTraitChanges` API
- Sixel graphics (`enableSixelReported = true`) and OSC 8 hyperlinks
- Batch replay for performance, `Coordinator` pattern for size tracking
- Keyboard focus restoration when drawer closes via `@Environment(\.isDrawerOpen)`

### Terminal ViewModel State Machine

The terminal uses a sophisticated state machine for reliable output handling:

```swift
enum TerminalState {
    case disconnected      // Not connected to session
    case subscribing       // Waiting for session.subscribed
    case replaying         // Loading historical output
    case buffering         // Replay complete, buffering live messages
    case live              // Real-time output streaming
    case sessionLost       // Session terminated or connection lost
}
```

**Key Features:**

- **Master/Non-Master Model**: First subscriber becomes "master" and controls terminal size
- **Sequence Tracking**: Gap detection with automatic targeted replay
- **Replay Buffer**: Captures live messages during replay, applies after load complete
- **Pending Feed Buffer**: Buffers output before view is ready (1000 item limit)
- **TUI App Detection**: Detects alternate screen mode (vim, htop, Claude) via escape sequences
  - Disables auto-scroll in TUI mode
  - Prevents forced resize after clear in TUI mode

### Terminal Session Lifecycle

Session Creation → View Init → SwiftTerm Setup → WebSocket Subscribe → Replay → Live Updates → Termination

### Termination Flow

Menu (⋯) → "Terminate Session" → Confirmation dialog → Session removed → Supervisor selected

**Platform behavior:** iPhone opens drawer after 0.3s delay (waits for auto-close animation to finish), iPad switches view immediately.

### Custom Keyboard Implementation

Custom keyboard replacing iOS keyboard to solve backspace buffer issues. Sends bytes directly to terminal, bypassing UITextInput.

> 📖 See [SWIFT-TERM-IPHONE-BEST-PRACTICE.md](SWIFT-TERM-IPHONE-BEST-PRACTICE.md) for detailed implementation guide

**Key Features:**

- QWERTY + Symbols layouts with modifier row (Ctrl, Alt, Tab, Esc, arrows)
- Proper escape sequences (Backspace=0x08, arrows=ESC[A/B/C/D)
- Ctrl+letter combinations (Ctrl+C=0x03, Ctrl+Z=0x1A)
- Toggle via toolbar button, enabled by default

**Files:** `TerminalCustomKeyboardView.swift`, `TerminalKeyboardHostingController.swift`, `TerminalViewUIKit.swift`

---

## Voice Interaction

### Voice Input Modes

| Mode             | Gesture       | Behavior                                        |
| ---------------- | ------------- | ----------------------------------------------- |
| **Toggle**       | Tap 🎤        | Start recording → Tap again to stop and send    |
| **Push-to-talk** | Long press 🎤 | Record while holding → Release to stop and send |

### Voice Input Flow

```
1. User taps/holds 🎤 button
          │
          ▼
2. Recording starts
   • Pulsing ring animation indicates recording
   • VoiceMessageBubble appears with waveform
          │
          ▼
3. User releases/taps again to stop
          │
          ▼
4. Audio sent to backend with message_id
          │
          ▼
5. Server processes:
   a. STT transcription → supervisor.transcription event
   b. Command execution → supervisor.output streaming
   c. TTS synthesis → supervisor.voice_output event
          │
          ▼
6. Client updates:
   • voice_input block updated with transcription
   • voice_output block added with audio playback
```

### Recording Visual Feedback

The recording button displays visual feedback:

- **Pulsing Ring** — Scale and opacity animation during recording
- **Color Change** — Button color changes to indicate active recording
- **Push-to-talk** — Long press mode for voice recording

### Audio Recording Settings

Voice recordings are optimized for speech-to-text while minimizing file size:

| Parameter   | Value    | Rationale                                   |
| ----------- | -------- | ------------------------------------------- |
| Format      | AAC/M4A  | Hardware-accelerated, efficient compression |
| Sample Rate | 16000 Hz | Standard for STT (Whisper, Google, Apple)   |
| Bit Rate    | 32 kbps  | Sufficient for clear voice                  |
| Channels    | 1 (mono) | Voice doesn't need stereo                   |
| Quality     | Medium   | Balance between quality and size            |

**File Size Comparison (10-second recording):**

- Before optimization: ~100-150 KB (44.1kHz, high quality)
- After optimization: ~40 KB (16kHz, 32kbps)

### Audio Services Architecture

Both audio services are **singletons** for coordinated behavior:

```swift
AudioRecorderService.shared  // Voice recording
AudioPlayerService.shared    // TTS playback
```

**Recording/Playback Coordination:**

- TTS auto-playback is **blocked while recording** to prevent feedback loop
- When user starts recording, any playing audio is stopped first
- TTS responses received during recording are cached for manual playback later

### Audio Playback

TTS responses include an audio attachment:

```
┌────────────────────────────────────────────────────┐
│ ▶ │ ═══════════●════════════════ │ 0:23 / 1:15    │
└────────────────────────────────────────────────────┘
```

### Multi-device TTS Synchronization

TTS audio is synchronized across multiple connected devices:

- **Initiating Device** — Auto-plays TTS audio immediately
- **Other Devices** — Receive `has_audio: true` flag but don't auto-play
- **Audio Persistence** — TTS audio saved to disk for playback after app restart
- **Unavailable State** — Shows "Audio unavailable" when audio file not found

### TTS Summarization

Long agent responses are automatically summarized before TTS synthesis:

- Maximum 3 sentences for voice output
- Context-aware summarization using the same LLM as supervisor
- Original text preserved in chat, only audio is summarized

---

## Settings

### Settings Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  │  Settings                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONNECTION                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ● Connected                      [Disconnect]           │   │ ← 1. Status
│  │ Workstation: My MacBook                                 │   │ ← 2. Workstation name
│  │ Tunnel: wss://tunnel.tiflis.io/ws                       │   │ ← 3. Tunnel URL
│  │ Tunnel ID: Z6q62aKz-F96                                 │   │ ← 4. Tunnel ID
│  │ Tunnel Version: 0.1.0 (1.0.0)                           │   │ ← 5. Tunnel version (protocol version inline)
│  │ Workstation Version: 0.1.0 (1.0.0)                     │   │ ← 6. Workstation version (protocol version inline)
│  └─────────────────────────────────────────────────────────┘   │
│  (Disconnect button shows confirmation dialog)                  │
│                                                                 │
│  VOICE & SPEECH                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Text-to-Speech                              [Toggle]    │   │
│  │ Speech Language                      [English ▼]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DEBUG                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚠️ View Crash Log (or ✓ No crashes detected)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ABOUT                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Version                                      1.0.0 (1)  │   │
│  │ Author                                   Roman Barinov  │   │
│  │ GitHub Repository                               ↗       │   │
│  │ License                                          FSL-1.1-NC    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Privacy Policy                                      ↗   │   │
│  │ Terms of Service                                    ↗   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Connection Section States

**Connected:**

- Shows connection information in this order:
  1. Connection status (circle indicator + text)
  2. Workstation name (from server via `auth.success`)
  3. Tunnel URL (full URL with protocol)
  4. Tunnel ID
  5. Tunnel Version (tunnel server version with tunnel's protocol version inline, e.g., "0.1.0 (1.0.0)")
  6. Workstation Version (workstation server version with workstation's protocol version inline, e.g., "0.1.0 (1.0.0)")
- Disconnect button with confirmation dialog

**Disconnected:**

- Scan QR Code button
- Paste Magic Link button

### Settings Persistence

| Setting      | Storage       | Key           |
| ------------ | ------------- | ------------- |
| Tunnel URL   | `@AppStorage` | `tunnelURL`   |
| TTS Enabled  | `@AppStorage` | `ttsEnabled`  |
| STT Language | `@AppStorage` | `sttLanguage` |

### Language Options

| Language | Code |
| -------- | ---- |
| English  | `en` |
| Russian  | `ru` |

### Debug Section

The Settings page includes a Debug section for troubleshooting:

```
DEBUG
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ View Crash Log                                    →     │  ← Only shown if crash detected
└─────────────────────────────────────────────────────────────┘
       — or —
┌─────────────────────────────────────────────────────────────┐
│ ✓ No crashes detected                                       │  ← Shown when no crashes
└─────────────────────────────────────────────────────────────┘
```

**Crash Log View:**

When a crash is detected from a previous session, the user can:

- **View** the full crash report with stack trace
- **Copy** to clipboard for sharing
- **Share** via system share sheet
- **Clear** the crash log

The crash reporter captures:

- Uncaught exceptions (NSException)
- Fatal signals (SIGABRT, SIGSEGV, SIGBUS, etc.)
- Device info (model, iOS version, app version)
- Full call stack

---

## State Management

### AppState (Global)

```swift
@MainActor
final class AppState: ObservableObject {
    static let settingsId = "__settings__"

    @Published var connectionState: ConnectionState = .disconnected
    @Published var workstationOnline: Bool = true  // Tracks workstation status separately
    @Published var sessions: [Session] = Session.mockSessions
    @Published var selectedSessionId: String? = "supervisor"

    @AppStorage("tunnelURL") private var tunnelURL = ""

    // Flag to indicate if session change should not trigger UI transitions
    var isSilentSessionChange = false

    // Computed properties
    var selectedSession: Session? { ... }
    var isShowingSettings: Bool { selectedSessionId == Self.settingsId }
    var hasConnectionConfig: Bool { !tunnelURL.isEmpty }

    // Actions
    func connect() { ... }
    func disconnect() { ... }
    func selectSession(_ session: Session) { ... }
    func createSession(type:workspace:project:) { ... }
    func terminateSession(_ session: Session, silent: Bool = false) { ... }
}
```

**Workstation Status Tracking:**

- `workstationOnline` is observed from `ConnectionService.workstationOnlinePublisher`
- Updated automatically when receiving `connection.workstation_offline` or `connection.workstation_online` events from the tunnel server
- Defaults to `true` (assumes online until notified otherwise)
- Reset to `true` when tunnel disconnects

**Silent Session Changes:**

- `isSilentSessionChange` flag prevents UI transitions when terminating sessions from sidebar
- When `true`, the drawer's `onChange(of: selectedSessionId)` handler skips the auto-close animation
- Flag is set before `selectedSessionId` changes and reset after 0.1 seconds
- This allows quick multi-session management without disruptive navigation transitions

### Settings Navigation

Settings uses a special session ID to integrate with navigation:

```swift
static let settingsId = "__settings__"

var isShowingSettings: Bool {
    selectedSessionId == Self.settingsId
}
```

### ChatViewModel (Per-Session)

```swift
@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var inputText = ""
    @Published var isRecording = false
    @Published var isLoading = false

    private let session: Session

    func sendMessage() { ... }  // Sets sendStatus = .pending, tracks for ack
    func startRecording() { ... }
    func stopRecording() { ... }
    func clearContext() { ... }  // Supervisor only
}
```

### Message Send Status

User messages track delivery status via the `sendStatus` property:

```swift
struct Message {
    // ...
    var sendStatus: SendStatus?  // Only for user messages
}

enum SendStatus: String, Codable {
    case pending  // 🕐 Waiting for server ack
    case sent     // ✓ Server confirmed receipt
    case failed   // ⚠️ Timeout, no ack received
}
```

**AppState Ack Tracking:**

```swift
// Pending message acks with timeout tasks
private var pendingMessageAcks: [String: Task<Void, Never>] = [:]

func trackMessageForAck(messageId: String, sessionId: String?) {
    // Start 5-second timeout task
    // On timeout: mark message as failed
}

func handleMessageAck(messageId: String, sessionId: String?) {
    // Cancel timeout task
    // Find message and set sendStatus = .sent
}
```

### Message Content Blocks

The app supports 10 different content block types:

| Block Type | Description | UI Rendering |
|------------|-------------|--------------|
| `text` | Plain text content | Markdown rendering |
| `code` | Code with language | Syntax highlighted |
| `toolCall` | Tool execution | Collapsible with status indicator |
| `thinking` | AI reasoning | Expandable, dimmed styling |
| `status` | Transient status | Filtered from history |
| `error` | Error message | Red styling |
| `cancel` | User cancellation | "Cancelled by user" indicator |
| `voiceInput` | User voice + transcription | Waveform + transcription text |
| `voiceOutput` | TTS audio | Audio player with duration |
| `actionButtons` | Interactive buttons | Button row with actions |

**Action Button Actions:**

- `send:<message>` — Send message to current session
- `url:<url>` — Open URL in browser
- `session:<type>` — Create new session of type
- Custom strings — Handled by app logic

---

## UI Components

### SessionIcon

Displays custom image or SF Symbol based on session type:

```swift
struct SessionIcon: View {
    let type: Session.SessionType

    var body: some View {
        if let customIcon = type.customIcon {
            Image(customIcon)
                .resizable()
                .aspectRatio(contentMode: .fit)
        } else {
            Image(systemName: type.sfSymbol)
                .font(.title2)
                .foregroundStyle(.primary)
        }
    }
}
```

### SessionRow

Row in sidebar with icon, title, subtitle, and selection checkmark. **Important:** The entire row must be clickable, including empty areas on the right:

```swift
struct SessionRow: View {
    let session: Session
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            SessionIcon(type: session.type)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.type.displayName)
                    .font(.body).fontWeight(.medium)

                if let subtitle = session.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
```

**Key Implementation Details:**

- `.frame(maxWidth: .infinity, alignment: .leading)` - Makes the row fill the entire width
- `.contentShape(Rectangle())` - Makes the entire rectangular area tappable, not just visible content
- Applied to the label inside the Button, ensuring the full row is clickable even when content is sparse

### ConnectionIndicator

Small colored dot with animation for connecting state. The indicator color reflects both tunnel connection and workstation status:

```swift
struct ConnectionIndicator: View {
    @EnvironmentObject private var appState: AppState

    /// Computed color based on both tunnel connection and workstation status
    private var indicatorColor: Color {
        // If tunnel is not connected, use connection state color
        guard appState.connectionState.isConnected else {
            return appState.connectionState.indicatorColor
        }

        // If tunnel is connected but workstation is offline, show orange
        if !appState.workstationOnline {
            return .orange
        }

        // Both tunnel and workstation are online
        return .green
    }

    var body: some View {
        Circle()
            .fill(indicatorColor)
            .frame(width: 10, height: 10)
            .overlay {
                if case .connecting = appState.connectionState {
                    // Animated pulse overlay
                }
            }
    }
}
```

**Color Logic:**

- When tunnel is **not connected**: Uses `ConnectionState.indicatorColor` (yellow/gray/red)
- When tunnel is **connected**:
  - **Green**: `workstationOnline == true` (fully functional)
  - **Orange**: `workstationOnline == false` (workstation offline, limited functionality)

### PromptInputBar

Text input with voice recording button:

```swift
struct PromptInputBar: View {
    @Binding var text: String
    @Binding var isRecording: Bool
    let onSend: () -> Void
    let onStartRecording: () -> Void
    let onStopRecording: () -> Void

    // Toggle mode (tap) and push-to-talk mode (long press)
}
```

---

## Asset Icons

### Custom Icons (Theme-Aware)

| Asset        | Light Mode             | Dark Mode             |
| ------------ | ---------------------- | --------------------- |
| TiflisLogo   | TiflisLogo.png         | TiflisLogo.png        |
| ClaudeLogo   | ClaudeLogo.png         | ClaudeLogo.png        |
| CursorLogo   | CursorLogo.png         | CursorLogo.png        |
| OpenCodeLogo | OpenCodeLogo-light.png | OpenCodeLogo-dark.png |

### Icon Sizes

Generated at multiple scales for crisp display:

| Scale | Size  |
| ----- | ----- |
| @1x   | 80px  |
| @2x   | 160px |
| @3x   | 240px |

---

## Environment Values

### Custom Environment Keys

The app uses custom Environment values for cross-view state communication:

#### isDrawerOpen

Tracks whether the iPhone drawer menu is open, used for keyboard management:

```swift
// View+Extensions.swift
private struct IsDrawerOpenKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var isDrawerOpen: Bool {
        get { self[IsDrawerOpenKey.self] }
        set { self[IsDrawerOpenKey.self] = newValue }
    }
}
```

**Usage:**

- Set in `DrawerNavigationView` via `.environment(\.isDrawerOpen, isDrawerOpen)`
- Read in `TerminalView` via `@Environment(\.isDrawerOpen) private var isDrawerOpen`
- Used to restore keyboard focus when drawer closes

---

## Error Handling

### Connection Errors

```swift
case .error(let message):
    // Show red indicator
    // Display error in popover
```

### Session Errors

- Failed to create → Show alert
- Failed to terminate → Show alert
- Connection lost → Auto-reconnect with exponential backoff

---

## Accessibility

### VoiceOver Support

- All buttons have labels
- Session rows describe type and status
- Connection state announced

### Dynamic Type

- Text scales with system settings
- Minimum touch targets: 44x44pt

---

---

## Additional Resources

### Related Documentation

- **[PROTOCOL.md](../PROTOCOL.md)** - Complete WebSocket protocol specification and HTTP Polling API
- **[SWIFT-TERM-IPHONE-BEST-PRACTICE.md](SWIFT-TERM-IPHONE-BEST-PRACTICE.md)** - Comprehensive guide for SwiftTerm integration on iOS, including:
  - Terminal view configuration and setup
  - System theme support (dark/light mode)
  - Sixel graphics and hyperlink support
  - Performance optimizations
  - Common pitfalls and API corrections
  - Modern Swift concurrency patterns
  - Accessibility best practices

---

_This document describes the current implementation of the Tiflis Code iOS and watchOS applications. For protocol details, see [PROTOCOL.md](../PROTOCOL.md)._
