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

The drawer uses `allowsHitTesting` to ensure buttons work correctly. The key improvement is checking the actual drawer position rather than just the state flag:

```swift
// Main content: disabled when drawer is open
.allowsHitTesting(!isDrawerOpen)

// Drawer: enabled only when actually visible (at least 90% on screen)
.allowsHitTesting(drawerOffsetValue(drawerWidth: drawerWidth) > -drawerWidth * 0.9)
```

This ensures buttons are only tappable when the drawer is actually visible, preventing issues during the opening animation.

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

| Tunnel State | Workstation Status | Indicator | Color | Description |
|--------------|-------------------|-----------|-------|-------------|
| `connected` | Online | ● | Green | Fully functional - tunnel and workstation both online |
| `connected` | Offline | ● | Orange | Tunnel connected but workstation offline - limited functionality |
| `connecting` | — | ◐ (animated) | Yellow | Attempting to connect to tunnel |
| `disconnected` | — | ○ | Gray | Not connected to tunnel |
| `error` | — | ● | Red | Connection failed with error |

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

```
┌─────────────────────────────────────────────────────────────────┐
│                    TerminalView (SwiftUI)                        │
│  • Wraps TerminalContentView (UIViewRepresentable)               │
│  • Manages TerminalViewModel state                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              TerminalContentView (UIViewRepresentable)          │
│  • Bridges SwiftUI to UIKit                                      │
│  • Manages TerminalViewUIKit lifecycle                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              TerminalViewUIKit (UIView Wrapper)                  │
│  • Wraps SwiftTerm.TerminalView                                   │
│  • Configures fonts, colors, accessibility                      │
│  • Handles system theme changes (iOS 17+ API)                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│            SwiftTerm.TerminalView (UIKit)                        │
│  • Creates and manages its own Terminal instance internally      │
│  • Handles rendering, input, and terminal state                  │
│  • Forwards input events via TerminalViewDelegate                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              TerminalViewModel (@MainActor)                     │
│  • Receives input via TerminalViewDelegate.send()               │
│  • Sends output via TerminalView.feed()                          │
│  • Manages WebSocket communication                              │
│  • Handles session subscription and replay                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Implementation Details

#### Simplified Architecture

**Important:** The implementation uses **only one Terminal instance** - the one created internally by `SwiftTerm.TerminalView`. This eliminates the need for a duplicate Terminal instance.

**Data Flow:**
- **Output (Server → Terminal)**: WebSocket → `TerminalViewModel.handleOutputMessage()` → `TerminalView.feed(byteArray:)` → SwiftTerm's internal Terminal → Rendering
- **Input (User → Server)**: User types → SwiftTerm's Terminal → `TerminalViewDelegate.send()` → `TerminalViewModel.sendInput()` → WebSocket

**Access to Terminal:**
- Use `TerminalView.getTerminal()` to access the internal Terminal instance for resize operations
- Set `TerminalView.terminalDelegate` to receive input events

#### System Theme Support

The terminal automatically adapts to system dark/light mode:

```swift
// iOS 17+ API
if #available(iOS 17.0, *) {
    registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changedView: Self, _: UITraitCollection) in
        changedView.updateTheme()
    }
}

// iOS 16 and below
@available(iOS, deprecated: 17.0)
override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    // Handle theme changes
}
```

**Theme Colors:**
- **Dark Theme**: `systemGray6` foreground, `systemBackground` background
- **Light Theme**: `label` foreground, `systemBackground` background

#### Advanced Features

**Sixel Graphics Support:**
- Enabled via `terminal.options.enableSixelReported = true`
- SwiftTerm automatically renders Sixel images inline
- No custom handlers needed

**Hyperlink Support:**
- Automatic detection of OSC 8 hyperlinks
- Implement `TerminalViewDelegate.requestOpenLink` to handle taps
- Opens URLs via `UIApplication.shared.open()`

#### Font Configuration

Uses dynamic font metrics for accurate terminal sizing:

```swift
let font = UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
let testChar = "M"
let charSize = testChar.size(withAttributes: [.font: font])
let fontWidth = charSize.width
let fontHeight = charSize.height
```

**Italic Fonts:**
Created using `UIFontDescriptor` (not `withSymbolicTraits` directly):

```swift
var fontDescriptor = normalFont.fontDescriptor
let italicTraits = fontDescriptor.symbolicTraits.union(.traitItalic)
fontDescriptor = fontDescriptor.withSymbolicTraits(italicTraits) ?? fontDescriptor
let italicFont = UIFont(descriptor: fontDescriptor, size: fontSize)
```

#### Performance Optimizations

**Data Conversion:**
- Uses `String.utf8Bytes` and `String.utf8BytesSlice` extensions for efficient conversion
- Avoids intermediate `Data` allocations

**Batch Operations:**
- Replay messages are batched into a single `feed()` call
- Reduces render passes and improves performance

**Size Calculation:**
- Only recalculates terminal size when view bounds actually change
- Uses `Coordinator` pattern to track previous size

#### Keyboard Management

The terminal integrates with the drawer navigation system:

```swift
@Environment(\.isDrawerOpen) private var isDrawerOpen
@FocusState private var isInputFocused: Bool

.onChange(of: isDrawerOpen) { oldValue, newValue in
    if !newValue && oldValue {
        // Drawer just closed - restore focus
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            isInputFocused = true
        }
    }
}
```

**Text Input Configuration:**
- `keyboardType` is read-only - TerminalView handles it internally
- Disabled features: autocapitalization, autocorrection, spell checking, smart quotes/dashes
- Keyboard appearance: `.dark`

#### Accessibility

```swift
terminalView.isAccessibilityElement = true
terminalView.accessibilityLabel = "Terminal"
terminalView.accessibilityHint = "Double tap to interact with terminal"
terminalView.accessibilityTraits = [.staticText]  // Note: .keyboardInterface does not exist
```

**Important:** `terminal.buffer.lines` is internal and cannot be accessed directly for accessibility values.

### Terminal Session Lifecycle

1. **Session Creation**: Terminal session created via `[+]` button or Supervisor command
2. **View Initialization**: `TerminalView` creates `TerminalViewModel` with session
3. **Terminal Setup**: `TerminalViewUIKit` configures SwiftTerm.TerminalView
4. **Subscription**: ViewModel subscribes to session events via WebSocket
5. **Replay Loading**: Historical output loaded and batched into terminal
6. **Live Updates**: New output fed to terminal in real-time
7. **Termination**: Session terminated via swipe-to-delete or menu action

### Terminal Menu Actions

| Action | Description |
|--------|-------------|
| **Terminate Session** | Closes terminal session and removes from sidebar |

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
    @Published var workstationOnline: Bool = true  // Tracks workstation status separately
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

**Workstation Status Tracking:**
- `workstationOnline` is observed from `ConnectionService.workstationOnlinePublisher`
- Updated automatically when receiving `connection.workstation_offline` or `connection.workstation_online` events from the tunnel server
- Defaults to `true` (assumes online until notified otherwise)
- Reset to `true` when tunnel disconnects

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

- **[PROTOCOL.md](../PROTOCOL.md)** - Complete WebSocket protocol specification
- **[SWIFT-TERM-IPHONE-BEST-PRACTICE.md](../SWIFT-TERM-IPHONE-BEST-PRACTICE.md)** - Comprehensive guide for SwiftTerm integration on iOS, including:
  - Terminal view configuration and setup
  - System theme support (dark/light mode)
  - Sixel graphics and hyperlink support
  - Performance optimizations
  - Common pitfalls and API corrections
  - Modern Swift concurrency patterns
  - Accessibility best practices

---

*This document describes the current implementation of the Tiflis Code iOS application. For protocol details, see [PROTOCOL.md](../PROTOCOL.md).*

