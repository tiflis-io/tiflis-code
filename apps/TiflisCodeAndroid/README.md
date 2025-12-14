# TiflisCode Android

Native Android client for TiflisCode - Remote AI agent control via secure tunnel.

## Overview

This is the Android port of the iOS TiflisCode app, built with:

- **Jetpack Compose** - Modern declarative UI
- **Kotlin Coroutines + Flow** - Async and reactive programming
- **Hilt** - Dependency injection
- **OkHttp** - WebSocket communication
- **Material 3** - Design system

## Requirements

- Android 8.0+ (API 26+)
- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17+

## Building

```bash
# From project root
cd apps/TiflisCodeAndroid

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Run on connected device
./gradlew installDebug
```

## Architecture

The app follows **MVVM + Services** architecture, mirroring the iOS implementation:

```
ui/
├── navigation/      # Jetpack Navigation
├── state/           # AppState ViewModel
├── chat/            # Chat screens and components
├── terminal/        # Terminal screen
├── sidebar/         # Session navigation
├── settings/        # Settings screens
└── common/          # Shared components

data/
├── websocket/       # WebSocket client and service
├── storage/         # Secure storage
└── audio/           # Audio recording/playback

domain/
└── models/          # Data models
```

## Features

### Implemented

- **Supervisor Agent** - AI orchestrator for session management
- **Agent Sessions** - Cursor, Claude Code, OpenCode support
- **Voice Input** - Audio recording (M4A, 16kHz, 32kbps)
- **Voice Output** - TTS playback with audio format auto-detection
- **QR Code Setup** - Magic link connection via CameraX + ML Kit
- **Multi-device Sync** - Message deduplication by device ID
- **Adaptive Layout** - Phone (drawer) / Tablet (split view)
- **Deep Linking** - `tiflis://connect?data=<base64>` magic links
- **Secure Storage** - EncryptedSharedPreferences for credentials
- **Network Monitoring** - Real-time WiFi/Cellular detection

### Connection Features

- **Dual Heartbeat** - Network ping/pong (15s) + Application heartbeat (10s)
- **Exponential Backoff** - 1s → 30s max reconnection delay
- **Command Queue** - Queues commands when disconnected (50 max, 60s expiry)
- **Smart Retry** - 3 retries with 500ms → 4s backoff

### In Progress

- **Terminal** - PTY shell access (placeholder, custom ANSI emulator planned)

## Protocol

Uses the same WebSocket protocol as iOS client (v1.10):

- Single multiplexed WebSocket connection
- JSON message format with snake_case fields
- Dual heartbeat: transport ping/pong (15s) + application heartbeat (10s)
- Exponential backoff reconnection (1s → 30s max)
- On-demand audio loading via `audio.request`/`audio.response`

### Message Content Blocks

Supports all 10 content block types:

| Block Type | Description |
|------------|-------------|
| `text` | Plain text with markdown |
| `code` | Syntax highlighted code |
| `toolCall` | Tool execution with status |
| `thinking` | AI reasoning (expandable) |
| `status` | Transient status messages |
| `error` | Error messages |
| `cancel` | Cancellation indicator |
| `voiceInput` | Voice recording + transcription |
| `voiceOutput` | TTS audio playback |
| `actionButtons` | Interactive buttons |

## Kotlin Best Practices (CRITICAL)

### Coroutines

```kotlin
// ❌ DON'T: Use GlobalScope
GlobalScope.launch { fetchData() }

// ✅ DO: Use lifecycle-aware scopes
viewModelScope.launch {
    val result = repository.fetchData()
    _uiState.value = result
}

// ✅ DO: Always rethrow CancellationException
try {
    val data = api.fetchData()
} catch (e: CancellationException) {
    throw e  // CRITICAL: Never swallow this
} catch (e: Exception) {
    _uiState.value = UiState.Error(e.message)
}

// ✅ DO: Use Dispatchers.IO for blocking ops
val data = withContext(Dispatchers.IO) {
    File("large.json").readText()
}
```

### Jetpack Compose

```kotlin
// ✅ DO: Use collectAsStateWithLifecycle
@Composable
fun MyScreen(viewModel: MyViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
}

// ✅ DO: Use remember for state
var count by remember { mutableStateOf(0) }

// ✅ DO: LaunchedEffect for coroutines tied to composition
LaunchedEffect(userId) {
    viewModel.loadUser(userId)
}

// ✅ DO: rememberCoroutineScope for event handlers
val scope = rememberCoroutineScope()
Button(onClick = { scope.launch { onRefresh() } })
```

### Naming Conventions

| Type      | Convention      | Example                |
| --------- | --------------- | ---------------------- |
| Classes   | PascalCase      | `UserRepository`       |
| Functions | camelCase       | `fetchUserData()`      |
| Constants | SCREAMING_SNAKE | `MAX_BUFFER_SIZE`      |
| Packages  | lowercase       | `com.tiflis.code.data` |

## TODO

- [ ] Custom terminal emulator (ANSI parsing)
- [ ] Syntax highlighting for code blocks (Markwon + Prism4j integrated)
- [ ] WearOS companion app (future)

## License

FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
