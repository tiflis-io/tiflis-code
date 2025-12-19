# Screenshot Automation — Tiflis Code

> Automated screenshot generation for App Store and Play Store submissions

**Status:** Implementation Complete (Testing Pending)
**Last Updated:** 2025-12-19

---

## Overview

Automated screenshot generation for iOS, watchOS, and Android apps using isolated test environment with real tunnel and workstation servers running in mock mode.

### Goals

- **Reproducible** — Same screenshots every CI run
- **Isolated** — No interference with development environment
- **Real UI** — Actual app connected to real servers (not just previews)
- **Terminal Support** — Real PTY terminal with live bash session

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   UI Test       │────▶│  Local Tunnel        │────▶│  Local Workstation   │
│ (Android/iOS)   │     │  localhost:$RANDOM   │     │  (mock mode)         │
└─────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                              │
                                                              ▼
                                                     ┌────────────────────┐
                                                     │ Isolated Test Dir  │
                                                     │ /tmp/tiflis-test-* │
                                                     └────────────────────┘
```

### Key Principles

| Principle | Description |
|-----------|-------------|
| **Random Ports** | Tunnel uses random port (10000-60000), not standard 3001 |
| **Isolated Storage** | Temporary directory for DB, workspaces, logs |
| **Mock Agent Responses** | Workstation returns predefined responses for agents |
| **Real Terminal** | PTY works normally — can run `htop`, `ls`, etc. |
| **Auto Cleanup** | Test directory removed after screenshot capture |

---

## Isolated Test Environment

### Directory Structure

```
/tmp/tiflis-test-{session-id}/
├── db/
│   └── workstation.db      # Isolated SQLite database
├── workspaces/
│   └── demo-project/       # Sample project for terminal screenshots
│       ├── src/
│       │   └── main.ts
│       ├── package.json
│       └── README.md
├── fixtures/
│   ├── supervisor.json     # Mock supervisor responses
│   ├── claude.json         # Mock Claude agent responses
│   ├── cursor.json         # Mock Cursor agent responses
│   └── opencode.json       # Mock OpenCode agent responses
└── logs/
    ├── tunnel.log
    └── workstation.log
```

### Environment Variables

```bash
# Generated per test session
TEST_SESSION_ID=$(uuidgen | cut -c1-8)
TEST_PORT=$((10000 + RANDOM % 50000))
TEST_ROOT="/tmp/tiflis-test-${TEST_SESSION_ID}"

# Tunnel configuration
PORT="${TEST_PORT}"
TUNNEL_REGISTRATION_API_KEY="test-key-${TEST_SESSION_ID}"

# Workstation configuration
TUNNEL_URL="ws://localhost:${TEST_PORT}/ws"
TUNNEL_API_KEY="test-key-${TEST_SESSION_ID}"
WORKSTATION_AUTH_KEY="test-auth-${TEST_SESSION_ID}"
DATABASE_PATH="${TEST_ROOT}/db/workstation.db"
WORKSPACES_ROOT="${TEST_ROOT}/workspaces"

# Mock mode
MOCK_MODE=true
MOCK_FIXTURES_PATH="${TEST_ROOT}/fixtures"
```

---

## Mock Mode Specification

### Workstation Behavior in Mock Mode

| Component | Normal Mode | Mock Mode |
|-----------|-------------|-----------|
| **Supervisor** | LangGraph + LLM API | Returns fixture responses |
| **Agent Sessions** | Real `cursor-agent`, `claude`, `opencode` | Simulated streaming from fixtures |
| **Terminal** | Real PTY | Real PTY (unchanged) |
| **Speech (STT/TTS)** | Real API calls | Returns fixture audio/text |

### Fixture Format

```json
{
  "scenarios": {
    "greeting": {
      "trigger": "hello",
      "response": {
        "text": "Hello! I'm the Supervisor agent. I can help you manage your coding sessions...",
        "delay_ms": 50
      }
    },
    "create_session": {
      "trigger": "create claude session",
      "response": {
        "text": "I'll create a new Claude session for you.",
        "actions": [
          { "type": "create_session", "agent": "claude", "workspace": "demo-project" }
        ]
      }
    }
  },
  "default_response": {
    "text": "I understand. How can I help you with your coding task?",
    "delay_ms": 30
  }
}
```

### Streaming Simulation

Mock mode simulates realistic streaming:
- Character-by-character output with configurable delay
- Proper `content_delta` and `content_complete` messages
- Realistic typing speed (30-50ms per token)

---

## Screenshot Scenarios

### iOS Screenshots (iPhone)

| # | Screen | State | Actions |
|---|--------|-------|---------|
| 1 | Navigation | Drawer open | Swipe from left edge |
| 2 | Supervisor Chat | With messages | Send "hello", wait for response |
| 3 | Agent Chat (Claude) | Active session | Create session, send message |
| 4 | Agent Chat (Cursor) | Empty state | Show empty chat UI |
| 5 | Terminal | Empty | Show terminal ready state |
| 6 | Terminal | Running htop | Execute `htop` command |
| 7 | Settings | Connection tab | Navigate to settings |
| 8 | Connection Status | Connected | Show connection indicator |

### iOS Screenshots (iPad)

| # | Screen | State |
|---|--------|-------|
| 1 | Split View | Sidebar + Chat |
| 2 | Terminal | Full screen landscape |

### watchOS Screenshots

| # | Screen | State |
|---|--------|-------|
| 1 | Session List | Multiple sessions |
| 2 | Chat View | Voice input ready |
| 3 | Voice Recording | Recording state |

### Android Screenshots (Phone)

| # | Screen | State |
|---|--------|-------|
| 1 | Navigation Drawer | Open |
| 2 | Supervisor Chat | With messages |
| 3 | Agent Chat | Active Claude session |
| 4 | Terminal | Running command |
| 5 | Settings | Main settings screen |

### Android Screenshots (Tablet)

| # | Screen | State |
|---|--------|-------|
| 1 | Split View | Navigation + Chat |
| 2 | Terminal | Landscape mode |

---

## Implementation Plan

### Phase 1: Workstation Changes

**Goal:** Add support for isolated environment and mock mode

#### 1.1 Configurable Database Path

```typescript
// packages/workstation/src/config/environment.ts
export const config = {
  database: {
    path: process.env.DATABASE_PATH || './data/workstation.db',
  },
  // ...
};
```

#### 1.2 Mock Mode Infrastructure

```typescript
// packages/workstation/src/infrastructure/mock/
├── MockModeManager.ts      # Enables/disables mock mode
├── FixtureLoader.ts        # Loads JSON fixtures
├── MockSupervisor.ts       # Mock supervisor responses
├── MockAgentSession.ts     # Simulated agent streaming
└── fixtures/               # Default fixture files
```

#### 1.3 Environment Flag

```typescript
const isMockMode = process.env.MOCK_MODE === 'true';

if (isMockMode) {
  // Use mock implementations
  container.register('SupervisorAgent', MockSupervisor);
  container.register('AgentSessionFactory', MockAgentSessionFactory);
}
```

### Phase 2: Test Runner Script

**Goal:** Script to manage isolated test environment

```bash
#!/bin/bash
# scripts/screenshot-test-env.sh

set -e

# Setup
setup_test_environment() {
    export TEST_SESSION_ID=$(uuidgen | cut -c1-8)
    export TEST_PORT=$((10000 + RANDOM % 50000))
    export TEST_ROOT="/tmp/tiflis-test-${TEST_SESSION_ID}"
    
    mkdir -p "${TEST_ROOT}"/{db,workspaces/demo-project,fixtures,logs}
    
    # Copy fixtures
    cp -r tests/fixtures/screenshot/* "${TEST_ROOT}/fixtures/"
    
    # Create demo project
    create_demo_project "${TEST_ROOT}/workspaces/demo-project"
    
    # Generate connection config for mobile app
    generate_connection_config
}

# Start servers
start_servers() {
    # Start tunnel
    PORT="${TEST_PORT}" \
    TUNNEL_REGISTRATION_API_KEY="test-key-${TEST_SESSION_ID}" \
    node packages/tunnel/dist/main.js > "${TEST_ROOT}/logs/tunnel.log" 2>&1 &
    TUNNEL_PID=$!
    
    # Wait for tunnel
    wait_for_port "${TEST_PORT}"
    
    # Start workstation in mock mode
    TUNNEL_URL="ws://localhost:${TEST_PORT}/ws" \
    MOCK_MODE=true \
    DATABASE_PATH="${TEST_ROOT}/db/workstation.db" \
    WORKSPACES_ROOT="${TEST_ROOT}/workspaces" \
    node packages/workstation/dist/main.js > "${TEST_ROOT}/logs/workstation.log" 2>&1 &
    WORKSTATION_PID=$!
    
    # Wait for workstation to connect
    sleep 2
}

# Cleanup
cleanup() {
    kill $TUNNEL_PID $WORKSTATION_PID 2>/dev/null || true
    rm -rf "${TEST_ROOT}"
}

trap cleanup EXIT
```

### Phase 3: Android Screenshot Tests

**Goal:** Compose UI tests with Screengrab integration

#### 3.1 Test Dependencies

```kotlin
// apps/TiflisCodeAndroid/app/build.gradle.kts
androidTestImplementation("tools.fastlane:screengrab:2.1.1")
androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
```

#### 3.2 Screenshot Test Class

```kotlin
// apps/TiflisCodeAndroid/app/src/androidTest/kotlin/io/tiflis/code/ScreenshotTest.kt
@RunWith(AndroidJUnit4::class)
@LargeTest
class ScreenshotTest {
    
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()
    
    @get:Rule
    val localeTestRule = LocaleTestRule()
    
    private val testConfig = TestEnvironmentConfig.fromSystemProperties()
    
    @Before
    fun setup() {
        // Connect to test environment
        composeTestRule.activity.connectToTunnel(
            url = testConfig.tunnelUrl,
            authKey = testConfig.authKey
        )
    }
    
    @Test
    fun screenshot_01_navigation() {
        // Open drawer
        composeTestRule.onNodeWithContentDescription("Menu").performClick()
        Thread.sleep(500)
        
        Screengrab.screenshot("01_navigation")
    }
    
    @Test
    fun screenshot_02_supervisor_chat() {
        // Navigate to supervisor
        composeTestRule.onNodeWithText("Supervisor").performClick()
        
        // Send message
        composeTestRule.onNodeWithContentDescription("Message input")
            .performTextInput("hello")
        composeTestRule.onNodeWithContentDescription("Send").performClick()
        
        // Wait for response
        Thread.sleep(2000)
        
        Screengrab.screenshot("02_supervisor_chat")
    }
    
    @Test
    fun screenshot_06_terminal_htop() {
        // Navigate to terminal
        composeTestRule.onNodeWithText("Terminal").performClick()
        
        // Execute command
        // ... send terminal input via WebSocket
        
        Thread.sleep(1000)
        Screengrab.screenshot("06_terminal_htop")
    }
}
```

#### 3.3 Fastlane Configuration

```ruby
# apps/TiflisCodeAndroid/fastlane/Fastfile
default_platform(:android)

platform :android do
  lane :screenshots do
    # Build debug APK and test APK
    gradle(task: "assembleDebug assembleAndroidTest")
    
    # Capture screenshots
    screengrab(
      locales: ["en-US"],
      clear_previous_screenshots: true,
      app_apk_path: "app/build/outputs/apk/debug/app-debug.apk",
      tests_apk_path: "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk",
      test_instrumentation_runner: "androidx.test.runner.AndroidJUnitRunner"
    )
  end
end
```

### Phase 4: iOS Screenshot Tests

**Goal:** XCUITest with Snapshot integration

#### 4.1 Screenshot Test Class

```swift
// apps/TiflisCode/TiflisCodeUITests/ScreenshotTests.swift
import XCTest

final class ScreenshotTests: XCTestCase {
    
    let app = XCUIApplication()
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        
        // Pass test environment config
        app.launchArguments = [
            "-TUNNEL_URL", ProcessInfo.processInfo.environment["TEST_TUNNEL_URL"] ?? "",
            "-AUTH_KEY", ProcessInfo.processInfo.environment["TEST_AUTH_KEY"] ?? ""
        ]
        
        app.launch()
    }
    
    func test_screenshot_01_navigation() {
        // Swipe to open drawer
        app.swipeRight()
        Thread.sleep(forTimeInterval: 0.5)
        
        snapshot("01_navigation")
    }
    
    func test_screenshot_02_supervisor_chat() {
        // Tap supervisor
        app.buttons["Supervisor"].tap()
        
        // Type message
        let textField = app.textFields["MessageInput"]
        textField.tap()
        textField.typeText("hello")
        
        // Send
        app.buttons["Send"].tap()
        
        // Wait for response
        Thread.sleep(forTimeInterval: 2)
        
        snapshot("02_supervisor_chat")
    }
    
    func test_screenshot_06_terminal_htop() {
        app.buttons["Terminal"].tap()
        
        // Terminal should auto-connect and show prompt
        Thread.sleep(forTimeInterval: 1)
        
        // Type command (terminal input handling)
        // ...
        
        snapshot("06_terminal_htop")
    }
}
```

#### 4.2 Fastlane Configuration

```ruby
# apps/TiflisCode/fastlane/Fastfile
default_platform(:ios)

platform :ios do
  lane :screenshots do
    snapshot(
      scheme: "TiflisCode",
      devices: [
        "iPhone 16 Pro Max",
        "iPhone 16",
        "iPad Pro 13-inch (M4)"
      ],
      languages: ["en-US"],
      clear_previous_screenshots: true,
      output_directory: "./screenshots"
    )
  end
end
```

### Phase 5: CI Integration

**Goal:** GitHub Actions workflow for automated screenshots

```yaml
# .github/workflows/screenshots.yml
name: Generate Screenshots

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'apps/TiflisCode/**'
      - 'apps/TiflisCodeAndroid/**'

jobs:
  android-screenshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install and build
        run: pnpm install && pnpm build
      
      - name: Start test environment
        run: |
          ./scripts/screenshot-test-env.sh start
          echo "TEST_TUNNEL_URL=$(cat /tmp/tiflis-test-*/connection.env | grep TUNNEL_URL)" >> $GITHUB_ENV
      
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      
      - name: Run Android screenshot tests
        working-directory: apps/TiflisCodeAndroid
        run: bundle exec fastlane screenshots
      
      - uses: actions/upload-artifact@v4
        with:
          name: android-screenshots
          path: apps/TiflisCodeAndroid/fastlane/metadata/android/**/images/

  ios-screenshots:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install and build
        run: pnpm install && pnpm build
      
      - name: Start test environment
        run: ./scripts/screenshot-test-env.sh start
      
      - name: Generate Xcode project
        working-directory: apps/TiflisCode
        run: xcodegen generate
      
      - name: Run iOS screenshot tests
        working-directory: apps/TiflisCode
        run: bundle exec fastlane screenshots
      
      - uses: actions/upload-artifact@v4
        with:
          name: ios-screenshots
          path: apps/TiflisCode/screenshots/
```

---

## Task Checklist

### Phase 1: Workstation Changes
- [x] Add `DATABASE_PATH` environment variable support (uses existing `DATA_DIR`)
- [x] Add `MOCK_MODE` environment variable
- [x] Create `MockModeManager` infrastructure (`fixture-loader.ts`, `streaming-simulator.ts`)
- [x] Implement `MockSupervisor` with fixture loading (`mock-supervisor-agent.ts`)
- [x] Implement `MockAgentSession` with streaming simulation (`mock-agent-session-manager.ts`)
- [x] Create default fixture files (`supervisor.json`, `claude.json`, `cursor.json`, `opencode.json`)
- [ ] Add unit tests for mock mode

### Phase 2: Test Runner Script
- [x] Create `scripts/screenshot-test-env.sh`
- [x] Implement isolated directory setup
- [x] Implement random port allocation
- [x] Add connection config generation (for mobile apps)
- [x] Add cleanup on exit
- [x] Create demo project template

### Phase 3: Android Screenshot Tests
- [x] Add Screengrab dependency
- [x] Create `ScreenshotTest.kt` test class
- [x] Implement screenshot scenarios
- [x] Add Fastlane configuration
- [ ] Test locally with emulator

### Phase 4: iOS Screenshot Tests
- [x] Create `ScreenshotTests.swift` test class
- [x] Implement screenshot scenarios
- [x] Add Fastlane Snapshot configuration
- [ ] Add watchOS screenshot support
- [ ] Test locally with simulators

### Phase 5: CI Integration
- [x] Create `.github/workflows/screenshots.yml`
- [x] Configure Android job
- [x] Configure iOS job
- [x] Add artifact upload
- [ ] Test full pipeline

---

## Related Documentation

- [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md) — Screenshot specifications and requirements
- [PUBLISHING_QUICKSTART.md](PUBLISHING_QUICKSTART.md) — App Store submission guide
- [CICD_AND_RELEASE.md](CICD_AND_RELEASE.md) — CI/CD workflows
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — Local development setup

---

_Screenshot automation plan for Tiflis Code_
