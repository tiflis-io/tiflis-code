# 📱 Tiflis Code — iOS & watchOS App

Native iOS and watchOS applications for remote interaction with AI coding agents.

## ✨ Features

- **Voice-First Interaction** — Dictate commands using push-to-talk or tap-to-toggle
- **Multi-Agent Support** — Connect to Cursor, Claude Code, or OpenCode agents
- **Supervisor Agent** — Manage sessions and navigate workspaces via natural language
- **Terminal Access** — Full PTY terminal emulator for direct shell access
- **Real-time Sync** — WebSocket-based communication with instant updates
- **Dark Mode** — Full support for light and dark themes

## 📋 Requirements

| Software | Version |
|----------|---------|
| macOS | 15.0+ (Sequoia) |
| Xcode | 16.1+ |
| iOS | 18.0+ |
| watchOS | 11.0+ |

## 🚀 Getting Started

### Option 1: Using XcodeGen (Recommended)

1. Install XcodeGen:
   ```bash
   brew install xcodegen
   ```

2. Generate the Xcode project:
   ```bash
   cd apps/TiflisCode
   xcodegen generate
   ```

3. Open the generated project:
   ```bash
   open TiflisCode.xcodeproj
   ```

### Option 2: Create Xcode Project Manually

1. Open Xcode and create a new iOS App project
2. Set these project settings:
   - **Product Name**: TiflisCode
   - **Bundle Identifier**: com.tiflis.TiflisCode
   - **Interface**: SwiftUI
   - **Language**: Swift
   - **Minimum Deployment**: iOS 18.0

3. Add existing files from this directory to the project
4. Configure signing and capabilities

## 📁 Project Structure

```
TiflisCode/
├── TiflisCode/                      # iOS App Target
│   ├── App/                         # App entry point
│   │   ├── TiflisCodeApp.swift      # @main entry
│   │   └── ContentView.swift        # Root navigation
│   ├── Features/                    # Feature modules
│   │   ├── Agent/                   # Chat with AI agents
│   │   ├── Navigation/              # Sidebar, Header
│   │   ├── Settings/                # App settings
│   │   └── Terminal/                # Terminal emulator
│   ├── Components/                  # Reusable UI
│   │   ├── Chat/                    # Chat components
│   │   ├── Common/                  # Shared components
│   │   └── Voice/                   # Voice input
│   └── Resources/                   # Assets, Info.plist
│
├── TiflisCodeWatch/                 # watchOS App Target
│   └── App/
│       └── TiflisCodeWatchApp.swift
│
├── Shared/                          # Shared Code (iOS + watchOS)
│   └── Domain/
│       └── Models/                  # Domain models
│
├── TiflisCodeTests/                 # Unit Tests
├── TiflisCodeUITests/               # UI Tests
├── project.yml                      # XcodeGen config
└── README.md
```

## 🎨 Design System

The app follows design principles inspired by:
- **[shadcn/ui](https://ui.shadcn.com/)** — Clean, accessible components
- **[shadcn/ai](https://www.shadcn.io/ai)** — AI chat patterns
- **Apple HIG** — Native iOS/watchOS conventions

### Color Palette

| Color | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| Accent | `#6B69F9` | `#8080F9` | Primary actions, links |
| Supervisor | Purple | Purple | Supervisor session |
| Claude | Orange | Orange | Claude agent sessions |
| Cursor | Blue | Blue | Cursor agent sessions |
| OpenCode | Green | Green | OpenCode agent sessions |

## 🔧 Configuration

### Connection Setup

1. Launch the workstation server on your machine
2. Open Tiflis Code app on iOS
3. Go to Settings → Scan QR Code
4. Scan the QR code displayed by the workstation server

### Manual Configuration

If QR scanning isn't available:

1. Go to Settings
2. Enter the Tunnel URL (e.g., `wss://tunnel.tiflis.io/ws`)
3. Enter your Auth Key
4. Tap Connect

## 🧪 Running Tests

```bash
# Unit tests
xcodebuild test \
  -project TiflisCode.xcodeproj \
  -scheme TiflisCode \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro'

# UI tests
xcodebuild test \
  -project TiflisCode.xcodeproj \
  -scheme TiflisCode \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:TiflisCodeUITests
```

## 📝 License

MIT License — Copyright (c) 2025 Roman Barinov

