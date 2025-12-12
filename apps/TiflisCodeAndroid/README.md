# TiflisCode Android

> **Status:** 🚧 In active development, not yet ready for production use.

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

- **Supervisor Agent** - AI orchestrator for session management
- **Agent Sessions** - Cursor, Claude Code, OpenCode support
- **Terminal** - PTY shell access (placeholder, requires Termux library)
- **Voice Input** - Audio recording for voice commands
- **QR Code Setup** - Magic link connection via QR scan

## Protocol

Uses the same WebSocket protocol as iOS client (v1.8):

- Single multiplexed WebSocket connection
- JSON message format with snake_case fields
- Heartbeat with ping/pong (15s interval)
- Exponential backoff reconnection

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

- [ ] Full Termux terminal emulator integration
- [ ] QR code scanner with CameraX
- [ ] Voice output (TTS) playback
- [ ] Syntax highlighting for code blocks
- [ ] WearOS support (future)

## License

FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
