# 📱 Tiflis Code — Mobile App Logic

> Complete documentation of iOS application behavior, navigation patterns, and UI logic.

---

## Table of Contents

- [Application Architecture](#application-architecture)
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

| Layer | Technology |
|-------|------------|
| **UI Framework** | SwiftUI |
| **State Management** | `@StateObject`, `@EnvironmentObject`, `@AppStorage` |
| **Navigation** | `NavigationSplitView` (iPad), Custom Drawer (iPhone) |
| **Concurrency** | Swift Concurrency (async/await) |
| **Persistence** | `@AppStorage` for settings, Keychain for credentials |

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

## Navigation System

### Adaptive Navigation

The app uses **different navigation patterns** based on device/orientation:

| Device / Orientation | Navigation Pattern | Sidebar Behavior |
|---------------------|-------------------|------------------|
| **iPhone (any)** | Custom Drawer | Full-screen menu, swipe-to-open |
| **iPad Portrait** | `NavigationSplitView` | Overlay sidebar |
| **iPad Landscape** | `NavigationSplitView` | Persistent sidebar |

### iPhone Navigation (Drawer)

On iPhone, navigation uses a custom full-screen drawer implementation:

```
┌─────────────────────────────────────────┐
│  ┌──────────────────────────────────┐   │
│  │         Main Content             │   │
│  │    (Chat/Terminal/Settings)      │   │
│  │                                  │   │
│  │  ☰ Opens drawer on tap           │   │
│  │  ← Swipe from left edge opens    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    │ Swipe right from edge
                    ▼
┌─────────────────────────────────────────┐
│  ┌──────────────────────────────────┐   │
│  │         SIDEBAR MENU             │   │
│  │    (Full screen width)           │   │
│  │                                  │   │
│  │  ✓ Selected item has checkmark   │   │
│  │  Tap selected = close menu       │   │
│  │  Tap other = navigate + close    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Drawer Gestures:**

| Gesture | Action |
|---------|--------|
| Swipe right from left edge (20pt) | Open drawer (strict check - only from left edge) |
| Swipe left anywhere when open | Close drawer |
| Tap ☰ button in toolbar | Open drawer |
| Tap already-selected item | Close drawer |

**Important:** The drawer **only opens** when swiping from the left edge (20pt). Swipes from other areas are ignored to prevent accidental opening.

**Drawer Logic:**

```swift
// Opening: ONLY from left edge (strict check)
if startX < edgeWidth && translation > 0 {
    dragOffset = min(translation, drawerWidth)
} else {
    // Ignore swipes from other areas
    dragOffset = 0
}

// Opening validation in onEnded
if startX < edgeWidth && (translation > drawerWidth / 3 || velocity > 500) {
    isDrawerOpen = true
}

// Closing threshold
if translation < -drawerWidth / 3 || velocity < -500 {
    isDrawerOpen = false
}
```

**Hit Testing:**

The drawer uses `allowsHitTesting` to ensure buttons work correctly:

```swift
// Main content: disabled when drawer is open
.allowsHitTesting(!isDrawerOpen)

// Drawer: enabled when open or opening
.allowsHitTesting(isDrawerOpen || dragOffset > 0)
```

### iPad Navigation (Split View)

On iPad, navigation uses `NavigationSplitView`:

```
┌───────────────────────────────────────────────────────────────┐
│ ┌─────────────┐ ┌───────────────────────────────────────────┐ │
│ │   Sidebar   │ │              Detail View                  │ │
│ │             │ │                                           │ │
│ │  Supervisor │ │   ChatView / TerminalView / SettingsView  │ │
│ │  Sessions   │ │                                           │ │
│ │  Settings   │ │                                           │ │
│ └─────────────┘ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Sidebar Menu Structure

```
┌────────────────────────────┐
│  "Tiflis Code"       [+]   │  ← Header with title and add button
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ 🧠 Supervisor      ✓ │  │  ← Always visible, singleton
│  └──────────────────────┘  │
├────────────────────────────┤
│  Agent Sessions            │
│  ┌──────────────────────┐  │
│  │ 🤖 Claude Code       │  │  ← Swipe left to terminate
│  │    tiflis/tiflis-code│  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 🎯 Cursor            │  │
│  │    tiflis/tiflis-code│  │
│  └──────────────────────┘  │
├────────────────────────────┤
│  Terminals                 │
│  ┌──────────────────────┐  │
│  │ 💻 Terminal          │  │  ← Swipe left to terminate
│  │    tiflis/tiflis-code│  │
│  └──────────────────────┘  │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ ⚙️ Settings          │  │  ← Opens as separate page
│  └──────────────────────┘  │
└────────────────────────────┘
```

### Session Selection Logic

```swift
private func selectSession(_ id: String) {
    if appState.selectedSessionId == id {
        // Already selected - just dismiss menu
        onDismiss?()
    } else {
        // Select new session
        appState.selectedSessionId = id
        // Menu auto-closes via onChange observer
    }
}
```

### Navigation Flow

```
                    App Launch
                        │
                        ▼
           ┌────────────────────────┐
           │ Check hasConnectionConfig │
           └───────────┬────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
    Has Credentials          No Credentials
           │                       │
           ▼                       ▼
    Auto-connect          Show Disconnected
           │                       │
           ▼                       │
    Show Supervisor ◄──────────────┘
           │
           ▼
    User Navigation
    ├── Tap Session → ChatView
    ├── Tap Terminal → TerminalView
    └── Tap Settings → SettingsView
```

---

## Connection Management

### Connection States

```swift
enum ConnectionState: Equatable {
    case connected
    case connecting
    case disconnected
    case error(String)
}
```

| State | Indicator | Color | Description |
|-------|-----------|-------|-------------|
| `connected` | ● | Green | Successfully connected to workstation |
| `connecting` | ◐ (animated) | Yellow | Attempting to connect |
| `disconnected` | ○ | Gray | Not connected |
| `error` | ● | Red | Connection failed with error |

### Connection Indicator

The connection indicator is **always visible** in the toolbar:

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  │  Session Title               ● │  ⋮                      │
│     │  Subtitle                      │                         │
└─────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Tap
                                        ▼
                    ┌─────────────────────────────┐
                    │  ● Connected                │
                    │  ─────────────────────      │
                    │  Workstation: MacBook Pro   │
                    │  Tunnel ID: Z6q62aKz-F96    │
                    │  Version: 0.1.0             │
                    │  Tunnel: tunnel.tiflis.io   │
                    │                             │
                    │  [ Disconnect ]             │
                    └─────────────────────────────┘
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

Format: `tiflis://connect?tunnel_id=<tunnel_id>&url=<tunnel_url>&key=<auth_key>`

The `tunnel_id` parameter is required for proper routing to the correct workstation. It is a persistent identifier that survives workstation restarts.

```swift
private func handleMagicLink(_ link: String) {
    guard let url = URL(string: link),
          url.scheme == "tiflis",
          url.host == "connect",
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let queryItems = components.queryItems else {
        return
    }
    
    for item in queryItems {
        switch item.name {
        case "tunnel_id": tunnelId = item.value ?? ""
        case "url": tunnelURL = item.value ?? ""
        case "key": authKey = item.value ?? ""
        default: break
        }
    }
    
    appState.connect()
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

### Session Icons

| Type | Icon Source | Asset Name |
|------|-------------|------------|
| Supervisor | Custom Image | `TiflisLogo` |
| Cursor | Custom Image | `CursorLogo` |
| Claude | Custom Image | `ClaudeLogo` |
| OpenCode | Custom Image (theme-aware) | `OpenCodeLogo` |
| Terminal | SF Symbol | `apple.terminal.fill` |

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
1. Swipe-to-delete in sidebar
2. Menu action in session detail view

```swift
func terminateSession(_ session: Session) {
    sessions.removeAll { $0.id == session.id }
    if selectedSessionId == session.id {
        selectedSessionId = "supervisor"  // Fallback to supervisor
    }
}
```

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

| Session Type | Message |
|-------------|---------|
| Supervisor | "Ask me to create sessions, manage projects, or explore your workspaces" |
| Claude/Cursor/OpenCode | "Send a message to start coding with AI assistance" |
| Terminal | (no message - terminal has different UI) |

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

| Session Type | Menu Actions |
|-------------|--------------|
| Supervisor | Clear Context |
| Claude/Cursor/OpenCode | Session Info, Terminate Session |
| Terminal | Terminate Session |

### Keyboard Handling

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

---

## Voice Interaction

### Voice Input Modes

| Mode | Gesture | Behavior |
|------|---------|----------|
| **Toggle** | Tap 🎤 | Start recording → Tap again to stop and send |
| **Push-to-talk** | Long press 🎤 | Record while holding → Release to stop and send |

### Voice Input Flow

```
1. User taps/holds 🎤 button
          │
          ▼
2. Recording starts
   VoiceMessageBubble appears with waveform
          │
          ▼
3. User releases/taps again to stop
          │
          ▼
4. Audio sent to backend for STT
          │
          ▼
5. TranscriptionMessage appears
          │
          ▼
6. Command executed by agent
```

### Audio Playback

TTS responses include an audio attachment:

```
┌────────────────────────────────────────────────────┐
│ ▶ │ ═══════════●════════════════ │ 0:23 / 1:15    │
└────────────────────────────────────────────────────┘
```

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
│  │ ● Connected                      [Disconnect]           │   │
│  │ Workstation: MacBook Pro                                │   │
│  │ Tunnel ID: Z6q62aKz-F96                                 │   │
│  │ Version: 0.1.0                                          │   │
│  │ Tunnel: tunnel.tiflis.io                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VOICE & SPEECH                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Text-to-Speech                              [Toggle]    │   │
│  │ Speech Language                      [English ▼]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ABOUT                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Version                                      1.0.0 (1)  │   │
│  │ Author                                   Roman Barinov  │   │
│  │ GitHub Repository                               ↗       │   │
│  │ License                                          MIT    │   │
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
- Shows workstation info (name, tunnel ID, version, tunnel URL)
- Disconnect button available

**Disconnected:**
- Scan QR Code button
- Paste Magic Link button

### Settings Persistence

| Setting | Storage | Key |
|---------|---------|-----|
| Tunnel URL | `@AppStorage` | `tunnelURL` |
| TTS Enabled | `@AppStorage` | `ttsEnabled` |
| STT Language | `@AppStorage` | `sttLanguage` |

### Language Options

| Language | Code |
|----------|------|
| English | `en` |
| Russian | `ru` |

---

## State Management

### AppState (Global)

```swift
@MainActor
final class AppState: ObservableObject {
    static let settingsId = "__settings__"
    
    @Published var connectionState: ConnectionState = .disconnected
    @Published var sessions: [Session] = Session.mockSessions
    @Published var selectedSessionId: String? = "supervisor"
    
    @AppStorage("tunnelURL") private var tunnelURL = ""
    
    // Computed properties
    var selectedSession: Session? { ... }
    var isShowingSettings: Bool { selectedSessionId == Self.settingsId }
    var hasConnectionConfig: Bool { !tunnelURL.isEmpty }
    
    // Actions
    func connect() { ... }
    func disconnect() { ... }
    func selectSession(_ session: Session) { ... }
    func createSession(type:workspace:project:) { ... }
    func terminateSession(_ session: Session) { ... }
}
```

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
    
    func sendMessage() { ... }
    func startRecording() { ... }
    func stopRecording() { ... }
    func clearContext() { ... }  // Supervisor only
}
```

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

Row in sidebar with icon, title, subtitle, and selection checkmark:

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
    }
}
```

### ConnectionIndicator

Small colored dot with animation for connecting state:

```swift
struct ConnectionIndicator: View {
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        Circle()
            .fill(appState.connectionState.indicatorColor)
            .frame(width: 10, height: 10)
            .overlay {
                if case .connecting = appState.connectionState {
                    // Animated pulse overlay
                }
            }
    }
}
```

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

| Asset | Light Mode | Dark Mode |
|-------|------------|-----------|
| TiflisLogo | TiflisLogo.png | TiflisLogo.png |
| ClaudeLogo | ClaudeLogo.png | ClaudeLogo.png |
| CursorLogo | CursorLogo.png | CursorLogo.png |
| OpenCodeLogo | OpenCodeLogo-light.png | OpenCodeLogo-dark.png |

### Icon Sizes

Generated at multiple scales for crisp display:

| Scale | Size |
|-------|------|
| @1x | 80px |
| @2x | 160px |
| @3x | 240px |

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

*This document describes the current implementation of the Tiflis Code iOS application. For protocol details, see [PROTOCOL.md](../PROTOCOL.md).*

