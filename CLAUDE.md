# 📘 Tiflis Code — Project Guide

<p align="center">
  <img src="assets/branding/logo.svg" width="120" height="120" alt="Tiflis Code">
</p>

> **Complete development guide for contributors and AI agents**

---

## Project Overview

**Project Name:** `tiflis-code` — Remote AI agent control via secure tunnel

### Key Capabilities

- 🎤 **Voice-First** — Dictate commands to AI agents from anywhere
- 🤖 **Multi-Agent** — Run Cursor, Claude Code, OpenCode simultaneously
- 📱 **Mobile & Watch** — Native iOS and watchOS apps
- 💻 **Terminal Access** — Full PTY terminal in your pocket
- 🔐 **Self-Hosted** — Your code never leaves your machine

### Core Components

| Component     | Name                                 | Platform       | Stack                        | Status        |
| ------------- | ------------------------------------ | -------------- | ---------------------------- | ------------- |
| iOS App       | `TiflisCode`                         | iOS            | Swift, SwiftUI               | ✅ Production |
| watchOS App   | `TiflisCodeWatch`                    | watchOS        | Swift, SwiftUI, HTTP Polling | ✅ Production |
| Android App   | `TiflisCodeAndroid`                  | Android        | Kotlin, Jetpack Compose      | ✅ Production |
| Web Client    | `@tiflis-io/tiflis-code-web`         | Web            | Next.js, assistant-ui        | ✅ Production |
| Tunnel Server | `@tiflis-io/tiflis-code-tunnel`      | Remote Server  | TypeScript, Node.js          | ✅ Production |
| Workstation   | `@tiflis-io/tiflis-code-workstation` | User's Machine | TypeScript, Node.js          | ✅ Production |
| STT Service   | `@tiflis-io/tiflis-code-stt`         | User's Machine | Python, FastAPI, MLX/CUDA    | ✅ Production |
| TTS Service   | `@tiflis-io/tiflis-code-tts`         | User's Machine | Python, FastAPI, Kokoro      | ✅ Production |
| Promo Page    | `promo`                              | Static Site    | Next.js, TailwindCSS         | ✅ Production |

> **Note:** All mobile apps are now in production.

### Naming Conventions

| Context            | Convention  | Example                         |
| ------------------ | ----------- | ------------------------------- |
| Swift App          | PascalCase  | `TiflisCode`                    |
| TypeScript Package | kebab-case  | `tiflis-code-tunnel`            |
| Bundle ID          | Reverse DNS | `com.tiflis.TiflisCode`         |
| npm Package        | Scoped      | `@tiflis-io/tiflis-code-tunnel` |

### Interaction Modes

1. **Supervisor Agent** — LangGraph-powered orchestrator managing sessions and workspaces
2. **Headless Agent Sessions** — Cursor (`cursor-agent -p`), Claude (`claude -p`), OpenCode (`opencode run --attach`)
3. **Agent Aliases** — Custom agent configurations via `AGENT_ALIAS_*` environment variables
4. **Terminal Session** — Direct PTY shell access

> **Workspace Structure**: `workspace/project--worktree` (e.g., `tiflis/tiflis-code--feature-auth`)

---

## System Architecture

> 📖 See [PROTOCOL.md](PROTOCOL.md) for architecture diagram, WebSocket protocol, and HTTP Polling API

- **WebSocket** — Single multiplexed connection, session subscriptions, auto-reconnect
- **HTTP Polling** — REST API for watchOS (WebSocket blocked on watchOS 9+)
- **Endpoints**: `GET /health`, `/ws`, `/api/v1/watch/*` on tunnel server

---

## Mobile Application

> 📖 **Detailed docs**: [docs/MOBILE_APP_LOGIC.md](docs/MOBILE_APP_LOGIC.md)

### Tech Stack

- **SwiftUI** + **Swift Concurrency** (async/await, actors)
- **SwiftTerm** for terminal emulation
- **WatchConnectivity** for iOS ↔ watchOS sync
- **Keychain** for secure credential storage

### Architecture: MVVM + Services

```
View (SwiftUI) → ViewModel (@MainActor) → Services → Domain Models
```

### Key Views

| View             | Description                                    |
| ---------------- | ---------------------------------------------- |
| **ChatView**     | Supervisor and Agent chat with voice input/TTS |
| **TerminalView** | PTY terminal (SwiftTerm) with custom keyboard  |
| **SettingsView** | Connection, voice/speech, and debug settings   |
| **Sidebar**      | Session navigation with swipe-to-delete        |

### Recent iOS Features

- **Voice Messaging** — Record audio commands with STT transcription and TTS responses
- **Agent Aliases** — Display custom alias names in session creation (e.g., "zai" instead of "claude")
- **Confirmation Dialogs** — Clear Supervisor context and terminate sessions with confirmation
- **Keyboard Input** — Return to send, Shift+Return for newline
- **Screen On** — App keeps screen awake during active use
- **Multi-device TTS Sync** — Only initiating device auto-plays TTS audio
- **Stop Generation** — Cancel in-progress AI responses with dedicated button
- **watchOS Companion** — Native Apple Watch app with voice commands via WatchConnectivity

### watchOS App

> **Status:** Production ready - Native Apple Watch companion with HTTP Polling (WebSocket blocked on watchOS 9+), voice commands, and WatchConnectivity sync.
> 📖 See [docs/MOBILE_APP_LOGIC.md](docs/MOBILE_APP_LOGIC.md#watchos-app) for detailed architecture

Native Apple Watch app with HTTP Polling, voice commands, and WatchConnectivity sync for seamless iOS integration.

### Navigation

- **iPhone**: Custom drawer (swipe from left edge)
- **iPad**: `NavigationSplitView` with persistent sidebar

### Connection Setup

Magic link format: `tiflis://connect?data=<base64_json>` with `{tunnel_id, url, key}`

---

## Web Client

> 📖 See [packages/web/README.md](packages/web/README.md) for detailed documentation

### Tech Stack

- **Next.js 15** with App Router
- **assistant-ui** for chat interface
- **TailwindCSS** for styling
- **WebSocket** for real-time communication

### Key Features

- **Voice Messaging** — Record audio commands with STT transcription and TTS responses
- **Mobile-First Design** — Responsive layout optimized for mobile browsers
- **iOS-Style UI** — Native-feeling interface matching iOS app design
- **Lazy History Loading** — Protocol v1.13 with on-demand chat history
- **Cross-Device Sync** — Message deduplication across multiple devices

### Deployment

The web client is bundled with the tunnel server and served as static files:

```bash
# Access at tunnel URL
https://your-tunnel-url.com/
```

---

## TypeScript Server Stack

### Technology

| Library                 | Purpose           |
| ----------------------- | ----------------- |
| **Fastify**             | HTTP server       |
| **ws**                  | WebSocket         |
| **node-pty**            | Terminal sessions |
| **zod**                 | Schema validation |
| **drizzle-orm**         | SQLite ORM        |
| **LangChain/LangGraph** | Supervisor agent  |

### Architecture: Clean Architecture

```
src/
├── domain/         # Entities, Value Objects, Ports
├── application/    # Use Cases (Commands, Queries)
├── infrastructure/ # WebSocket, HTTP, PTY, Speech, Persistence
├── protocol/       # Message types, Zod schemas
└── config/         # Environment, Constants
```

### Key Environment Variables

> 📖 See [docs/TYPESCRIPT_SERVER_STACK.md](docs/TYPESCRIPT_SERVER_STACK.md#environment-variables) for full configuration

| Component       | Required Variables                                     |
| --------------- | ------------------------------------------------------ |
| **Tunnel**      | `TUNNEL_REGISTRATION_API_KEY` (min 32 chars), `PORT`   |
| **Workstation** | `TUNNEL_URL`, `TUNNEL_API_KEY`, `WORKSTATION_AUTH_KEY` |
| **LLM**         | `AGENT_PROVIDER`, `AGENT_API_KEY`                      |
| **Speech**      | `STT_PROVIDER`, `TTS_PROVIDER`, API keys               |
| **Aliases**     | `AGENT_ALIAS_<NAME>=<command>`                         |

---

## Monorepo & CI/CD

### Repository Structure

```
tiflis-code/
├── apps/
│   ├── TiflisCode/           # iOS + watchOS (Xcode)
│   └── TiflisCodeAndroid/    # Android (Gradle)
├── packages/
│   ├── tunnel/               # @tiflis-io/tiflis-code-tunnel (with bundled web client)
│   ├── workstation/          # @tiflis-io/tiflis-code-workstation
│   ├── web/                  # @tiflis-io/tiflis-code-web (Next.js, assistant-ui)
│   └── promo/                # Marketing landing page (Next.js)
├── services/
│   ├── stt/                  # @tiflis-io/tiflis-code-stt (Python, MLX/CUDA Whisper)
│   └── tts/                  # @tiflis-io/tiflis-code-tts (Python, Kokoro TTS)
├── scripts/
│   ├── install-native-services.sh  # Native STT/TTS deployment installer
│   ├── install-tunnel.sh           # Tunnel server one-line installer
│   └── install-workstation.sh      # Workstation server one-line installer
├── docs/                     # Detailed documentation
└── assets/branding/          # Logos, ASCII art
```

### Release Process

```bash
# Bump version
pnpm version:tunnel:patch     # or :minor, :major
pnpm version:workstation:patch

# Commit and push
git add -A && git commit -m "chore: bump version" && git push origin main

# GitHub Actions automatically publishes to npmjs.com
```

> 📖 See [docs/RELEASE_SIMPLE.md](docs/RELEASE_SIMPLE.md)

---

## Local Development

### Prerequisites

- macOS 15.0+, Xcode 16.1+, Node.js 22 LTS, pnpm 9.0+

### Quick Start

```bash
# Clone and install
git clone git@github.com:tiflis-io/tiflis-code.git && cd tiflis-code
pnpm install && pnpm build

# Run servers (includes bundled web client)
pnpm dev  # Runs tunnel + workstation with Turborepo

# iOS
open apps/TiflisCode/TiflisCode.xcodeproj
# Run on iPhone 16 Pro simulator (⌘R)

# Web client
# Access at http://localhost:3001/ when tunnel is running
```

### Environment Setup

```bash
# packages/tunnel/.env.local
TUNNEL_REGISTRATION_API_KEY=dev-api-key-32-chars-minimum!!
PORT=3001

# packages/workstation/.env.local
TUNNEL_URL=ws://localhost:3001/ws
TUNNEL_API_KEY=dev-api-key-32-chars-minimum!!
WORKSTATION_AUTH_KEY=dev-workstation-key
WORKSPACES_ROOT=/Users/yourname/work
```

---

## Mandatory Policies

### Language Policy

> **⚠️ All project content must be in English** — code, comments, commits, docs, error messages

### Licensing

**FSL-1.1-NC** — Copyright (c) 2025 Roman Barinov

All source files must include license header:

```swift
// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.
```

### Git Conventional Commits

```
<type>(scope): description

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
```

### Documentation Policy

> **⚠️ Never create NEW .md files** unless explicitly requested. Update existing docs instead.

---

## Development Guidelines

### Swift Concurrency (Critical)

> 📖 See [docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md](docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md)

1. **Use `Task.sleep`** for periodic operations (not `Timer`)
2. **Access MainActor state explicitly** via `await MainActor.run { }`
3. **Track and cancel all tasks** in cleanup methods
4. **Use Sendable types** in TaskGroups (convert to `Data` first)
5. **Prevent concurrent operations** with `isConnecting` flags

```swift
// ✅ Correct heartbeat pattern
private var pingTask: Task<Void, Never>?

func startHeartbeat() {
    pingTask = Task { [weak self] in
        while !Task.isCancelled {
            let canPing = await MainActor.run { self?.isConnected ?? false }
            guard canPing else { break }
            await self?.sendPing()
            try? await Task.sleep(for: .seconds(20))
        }
    }
}
```

### TypeScript Guidelines

- **Strict mode** with all flags enabled
- **Zod schemas** for runtime validation
- **Domain errors** with typed error classes
- **Clean Architecture** — domain has no external dependencies

### General Principles

1. Keep It Simple — readable over clever
2. Single Responsibility — one reason to change
3. Fail Fast — validate early, meaningful errors
4. Test Coverage — 80%+ for critical paths

---

## AI Agent Guidelines

### Performance Optimization

- **Parallel execution** — batch independent tool calls
- **Smart searching** — use `glob`/`grep` for discovery, `task` for exploration
- **Batch operations** — use `replaceAll` for multi-occurrence edits
- **Minimal output** — code-first, concise summaries

### Tool Selection

| Task                  | Tool                   |
| --------------------- | ---------------------- |
| Find files by pattern | `glob`                 |
| Search content        | `grep`                 |
| Complex exploration   | `task` (explore agent) |
| Code changes          | `edit`/`write`         |

---

## Agent Competency Requirements

When working on this project, the AI agent must operate at an **expert senior developer level** for all technology stacks.

### Swift Development (iOS & watchOS)

The agent must embody the expertise of a **world-class Swift developer**:

- **Swift Language Mastery** — async/await, actors, structured concurrency, generics, type system
- **SwiftUI Excellence** — @State, @Binding, @StateObject, @EnvironmentObject, animations, accessibility
- **Platform Expertise** — iOS/watchOS lifecycle, WatchConnectivity, background tasks
- **Networking** — URLSession, WebSocket, Keychain, certificate pinning

#### Swift Concurrency Best Practices (CRITICAL)

> **⚠️ MANDATORY**: These patterns are required for all async operations.
> 📖 Full examples: [docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md](docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md)

| Pattern                   | Rule                                                 |
| ------------------------- | ---------------------------------------------------- |
| **Periodic ops**          | Use `Task.sleep`, NOT `Timer` (requires RunLoop)     |
| **Actor isolation**       | Access MainActor state via `await MainActor.run { }` |
| **Concurrent prevention** | Use `isConnecting`/`isReconnecting` flags            |
| **Task cleanup**          | Track all tasks, cancel in `disconnect()`            |
| **Sendable safety**       | Use `Data` in TaskGroups, parse after                |

```swift
// ✅ Correct heartbeat pattern
private var pingTask: Task<Void, Never>?

func startHeartbeat() {
    pingTask = Task { [weak self] in
        while !Task.isCancelled {
            let canPing = await MainActor.run { self?.isConnected ?? false }
            guard canPing else { break }
            await self?.sendPing()
            try? await Task.sleep(for: .seconds(20))
        }
    }
}
```

### TypeScript Development (Node.js)

The agent must embody the expertise of a **world-class TypeScript/Node.js architect**:

- **TypeScript Mastery** — generics, conditional types, mapped types, strict mode
- **Node.js Excellence** — event loop, streams, worker threads, child processes
- **Networking** — WebSocket, HTTP/HTTPS, TCP sockets, connection pooling
- **Process Management** — PTY handling, signal handling, graceful shutdown

#### TypeScript Naming Conventions

```typescript
// Interfaces & Types: PascalCase
interface AgentSession {}
type AgentState = "idle" | "running" | "stopped";

// Classes: PascalCase
class SupervisorAgent {}

// Functions & variables: camelCase
function createSession(): Session {}
const maxRetries = 5;

// Constants: SCREAMING_SNAKE_CASE
const MAX_BUFFER_SIZE = 1024 * 1024;

// File names: kebab-case
// agent-session.ts, tunnel-manager.ts
```

#### TypeScript Project Structure

```
src/
├── domain/           # Business logic, entities, value objects
├── application/      # Use cases, application services
├── infrastructure/   # External services, databases, network
├── protocol/         # Message types, Zod schemas
└── config/           # Environment, constants
```

### Kotlin Development (Android)

The agent must embody the expertise of a **world-class Kotlin/Android developer**:

- **Kotlin Language Mastery** — coroutines, flows, sealed classes, extension functions, DSLs, null safety
- **Jetpack Compose Excellence** — state hoisting, recomposition, side effects, animations, theming
- **Android Architecture** — MVVM/MVI, Clean Architecture, Repository pattern, Use Cases
- **Platform Expertise** — Activity/Fragment lifecycle, ViewModel, WorkManager, Services
- **Dependency Injection** — Hilt/Dagger, Koin
- **Networking** — Retrofit, OkHttp, Ktor Client, WebSocket handling
- **Local Storage** — Room, DataStore, encrypted SharedPreferences

> 📖 See [apps/TiflisCodeAndroid/README.md](apps/TiflisCodeAndroid/README.md) for Android-specific documentation

#### Kotlin Coroutines Best Practices (CRITICAL)

| Pattern             | Rule                                                       |
| ------------------- | ---------------------------------------------------------- |
| **Scopes**          | Use `viewModelScope`/`lifecycleScope`, NEVER `GlobalScope` |
| **Flow collection** | Use `collectAsStateWithLifecycle()` in Compose             |
| **Exceptions**      | Always rethrow `CancellationException`, catch others       |
| **Dispatchers**     | Use `Dispatchers.IO` for blocking ops via `withContext`    |
| **Cancellation**    | Call `ensureActive()` in loops, cleanup in `finally`       |

#### Jetpack Compose Best Practices

| Pattern            | Rule                                                            |
| ------------------ | --------------------------------------------------------------- |
| **State**          | Use `remember { mutableStateOf() }`, hoist for reusability      |
| **Side effects**   | `LaunchedEffect` for coroutines, `DisposableEffect` for cleanup |
| **Event handlers** | Use `rememberCoroutineScope()` for onClick coroutines           |

#### Naming Conventions

| Type                | Convention         | Example                |
| ------------------- | ------------------ | ---------------------- |
| Classes/Interfaces  | PascalCase         | `UserRepository`       |
| Functions/Variables | camelCase          | `fetchUserData()`      |
| Constants           | SCREAMING_SNAKE    | `MAX_BUFFER_SIZE`      |
| Packages            | lowercase          | `com.tiflis.code.data` |
| Files               | PascalCase (class) | `UserRepository.kt`    |

---

## References

- [PROTOCOL.md](PROTOCOL.md) — WebSocket protocol specification
- [docs/MOBILE_APP_LOGIC.md](docs/MOBILE_APP_LOGIC.md) — iOS/watchOS app architecture
- [apps/TiflisCodeAndroid/README.md](apps/TiflisCodeAndroid/README.md) — Android app documentation
- [docs/TERMINAL_IMPLEMENTATION.md](docs/TERMINAL_IMPLEMENTATION.md) — Terminal implementation
- [docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md](docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md) — SwiftTerm guide
- [docs/WEBSOCKET_CONNECTION_IMPLEMENTATION.md](docs/WEBSOCKET_CONNECTION_IMPLEMENTATION.md) — WebSocket client
- [docs/TYPESCRIPT_SERVER_STACK.md](docs/TYPESCRIPT_SERVER_STACK.md) — TypeScript/Node.js server development
- [docs/CICD_AND_RELEASE.md](docs/CICD_AND_RELEASE.md) — CI/CD and release process
- [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) — Local development setup
- [docs/RELEASE_SIMPLE.md](docs/RELEASE_SIMPLE.md) — Simplified release guide
- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)
- [Android Developers](https://developer.android.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

_This document is the authoritative guide for AI agents and developers working on tiflis-code._
