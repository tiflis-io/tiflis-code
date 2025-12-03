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

| Component     | Name                                 | Platform       | Stack               |
| ------------- | ------------------------------------ | -------------- | ------------------- |
| Mobile App    | `TiflisCode`                         | iOS/watchOS    | Swift, SwiftUI      |
| Tunnel Server | `@tiflis-io/tiflis-code-tunnel`      | Remote Server  | TypeScript, Node.js |
| Workstation   | `@tiflis-io/tiflis-code-workstation` | User's Machine | TypeScript, Node.js |

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
3. **Terminal Session** — Direct PTY shell access

> **Workspace Structure**: `workspace/project--worktree` (e.g., `tiflis/tiflis-code--feature-auth`)

---

## System Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────────┐
│  Mobile Client  │◄───────►│  Tunnel Server  │◄───────►│  Workstation Server │
│  (iOS/watchOS)  │   WS    │     (VPS)       │   WS    │   (User's Machine)  │
└─────────────────┘         └─────────────────┘         └─────────────────────┘
```

- **WebSocket Protocol** — Single multiplexed connection, session subscriptions, auto-reconnect
- **Endpoints**: `GET /health`, `/ws` on both servers

> 📖 See [PROTOCOL.md](PROTOCOL.md) for complete protocol specification

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

| View             | Description                         |
| ---------------- | ----------------------------------- |
| **ChatView**     | Supervisor and Agent chat interface |
| **TerminalView** | PTY terminal (SwiftTerm)            |
| **SettingsView** | Connection and preferences          |
| **Sidebar**      | Session navigation                  |

### Navigation

- **iPhone**: Custom drawer (swipe from left edge)
- **iPad**: `NavigationSplitView` with persistent sidebar

### Connection Setup

Magic link format: `tiflis://connect?data=<base64_json>` with `{tunnel_id, url, key}`

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

**Tunnel Server:**

- `TUNNEL_REGISTRATION_API_KEY` (required, min 32 chars)
- `PORT` (default: 3000)

**Workstation Server:**

- `TUNNEL_URL`, `TUNNEL_API_KEY`, `WORKSTATION_AUTH_KEY` (required)
- `AGENT_PROVIDER`, `AGENT_API_KEY`, `AGENT_MODEL_NAME`
- `STT_PROVIDER`, `STT_API_KEY`, `TTS_PROVIDER`, `TTS_API_KEY`

> See `packages/*/env.example` for full configuration

---

## Monorepo & CI/CD

### Repository Structure

```
tiflis-code/
├── apps/TiflisCode/          # iOS + watchOS (Xcode)
├── packages/
│   ├── tunnel/               # @tiflis-io/tiflis-code-tunnel
│   └── workstation/          # @tiflis-io/tiflis-code-workstation
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

# GitHub Actions automatically publishes to GitHub Packages
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

# Run servers
pnpm dev  # Runs tunnel + workstation with Turborepo

# iOS
open apps/TiflisCode/TiflisCode.xcodeproj
# Run on iPhone 16 Pro simulator (⌘R)
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

**MIT License** — Copyright (c) 2025 Roman Barinov

All source files must include license header:

```swift
// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the MIT License.
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

When working on this project, the AI agent must operate at an **expert senior developer level** for both technology stacks.

### Swift Development (iOS & watchOS)

The agent must embody the expertise of a **world-class Swift developer**:

- **Swift Language Mastery** — async/await, actors, structured concurrency, generics, type system
- **SwiftUI Excellence** — @State, @Binding, @StateObject, @EnvironmentObject, animations, accessibility
- **Platform Expertise** — iOS/watchOS lifecycle, WatchConnectivity, background tasks
- **Networking** — URLSession, WebSocket, Keychain, certificate pinning

#### Swift Concurrency Best Practices (CRITICAL)

> **⚠️ MANDATORY**: These patterns are required for all async operations.

##### 1. Task-Based Periodic Operations (Not Timer)

```swift
// ❌ DON'T: Timer requires RunLoop, doesn't work in async contexts
private var pingTimer: Timer?
func startHeartbeat() {
    pingTimer = Timer.scheduledTimer(withTimeInterval: 20.0, repeats: true) { _ in
        self.sendPing()
    }
}

// ✅ DO: Use Task.sleep for periodic operations
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

##### 2. Actor Isolation for State Access

```swift
// ❌ DON'T: Access MainActor-isolated properties from non-isolated context
private func sendPing() async {
    guard isConnected else { return } // Data race warning
}

// ✅ DO: Access state on MainActor, then use captured values
private func sendPing() async {
    let canSend = await MainActor.run {
        guard self.isConnected, self.webSocketTask?.state == .running else { return false }
        return true
    }
    guard canSend else { return }
    // Now use captured state safely...
}
```

##### 3. Prevent Concurrent Operations

```swift
// ✅ DO: Use flags to prevent connection storms
private var isConnecting = false
private var isReconnecting = false

func connect() async throws {
    guard !isConnecting, !isReconnecting, !isConnected else { return }
    isConnecting = true
    defer { isConnecting = false }
    // Connection logic...
}
```

##### 4. Task Cancellation and Cleanup

```swift
// ✅ DO: Track all tasks and cancel them properly
private var pingTask: Task<Void, Never>?
private var listenTask: Task<Void, Never>?

func disconnect() {
    pingTask?.cancel()
    pingTask = nil
    listenTask?.cancel()
    listenTask = nil
    webSocketTask?.cancel()
    webSocketTask = nil
}
```

##### 5. Sendable Safety in Task Groups

```swift
// ❌ DON'T: Pass non-Sendable types through TaskGroup
let result = try await withThrowingTaskGroup(of: [String: Any].self) { group in
    // [String: Any] is not Sendable
}

// ✅ DO: Use Sendable types (Data), parse after
let result = try await withThrowingTaskGroup(of: Data.self) { group in
    group.addTask {
        let wsMessage = try await task.receive()
        switch wsMessage {
        case .string(let text): return text.data(using: .utf8) ?? Data()
        case .data(let data): return data
        }
    }
    guard let messageData = try await group.next() else { throw WebSocketError.connectionClosed }
    return try JSONSerialization.jsonObject(with: messageData) as? [String: Any] ?? [:]
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

---

## References

- [PROTOCOL.md](PROTOCOL.md) — WebSocket protocol specification
- [docs/MOBILE_APP_LOGIC.md](docs/MOBILE_APP_LOGIC.md) — iOS app architecture
- [docs/TERMINAL_IMPLEMENTATION.md](docs/TERMINAL_IMPLEMENTATION.md) — Terminal implementation
- [docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md](docs/SWIFT-TERM-IPHONE-BEST-PRACTICE.md) — SwiftTerm guide
- [docs/WEBSOCKET_CONNECTION_IMPLEMENTATION.md](docs/WEBSOCKET_CONNECTION_IMPLEMENTATION.md) — WebSocket client
- [docs/TYPESCRIPT_SERVER_STACK.md](docs/TYPESCRIPT_SERVER_STACK.md) — TypeScript/Node.js server development
- [docs/CICD_AND_RELEASE.md](docs/CICD_AND_RELEASE.md) — CI/CD and release process
- [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) — Local development setup
- [docs/RELEASE_SIMPLE.md](docs/RELEASE_SIMPLE.md) — Simplified release guide
- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

_This document is the authoritative guide for AI agents and developers working on tiflis-code._
