# App Store Materials — Tiflis Code

> Complete materials for iOS App Store submission

---

## Table of Contents

1. [App Information](#app-information)
2. [App Store Listing Text](#app-store-listing-text)
3. [Keywords](#keywords)
4. [Screenshots](#screenshots)
5. [App Preview Video](#app-preview-video)
6. [App Review Information](#app-review-information)
7. [Privacy Policy](#privacy-policy)
8. [Localization](#localization)

---

## App Information

### Basic Details

| Field                  | Value                    |
| ---------------------- | ------------------------ |
| **App Name**           | Tiflis Code              |
| **Subtitle**           | AI Coding Agents, Mobile |
| **Bundle ID**          | com.tiflis.TiflisCode    |
| **Primary Category**   | Developer Tools          |
| **Secondary Category** | Productivity             |
| **Content Rating**     | 4+                       |
| **Price**              | Free                     |

### Version Information

| Field         | Value                |
| ------------- | -------------------- |
| **Version**   | 1.0.0                |
| **Build**     | 1                    |
| **Copyright** | © 2025 Roman Barinov |

### Support Information

| Field                  | Value                                    |
| ---------------------- | ---------------------------------------- |
| **Support URL**        | https://github.com/tiflis-io/tiflis-code |
| **Marketing URL**      | https://tiflis.io                        |
| **Privacy Policy URL** | https://tiflis.io/privacy                |

---

## App Store Listing Text

### App Name (30 characters max)

```
Tiflis Code
```

### Subtitle (30 characters max)

```
AI Coding Agents, Mobile
```

**Alternatives:**

- `Voice-Control AI Agents`
- `Remote AI Dev Assistant`
- `Code with Voice, Anywhere`

### Promotional Text (170 characters max)

> Updated with each release, not part of review

```
Control Cursor, Claude Code & OpenCode from your iPhone. Dictate commands, monitor progress, access terminal — your AI coding assistants in your pocket.
```

### Description (4000 characters max)

```
Tiflis Code brings your AI coding assistants to your iPhone and Apple Watch. Control Cursor, Claude Code, and OpenCode remotely using voice commands — code from anywhere.

VOICE-FIRST EXPERIENCE
• Dictate commands naturally with speech-to-text
• Hear responses with text-to-speech (auto-summarized)
• Push-to-talk or tap-to-toggle recording modes
• Visual waveform feedback during recording

MULTI-AGENT SUPPORT
• Run Claude Code, Cursor, and OpenCode simultaneously
• Each agent operates in its own isolated session
• Switch between agents instantly
• Support for custom agent configurations

FULL TERMINAL ACCESS
• Complete PTY terminal emulation
• Professional keyboard with Ctrl, Alt, Esc keys
• Arrow keys and terminal control codes
• Session history preserved on reconnect

SUPERVISOR AGENT
• AI orchestrator for session management
• Create sessions with voice commands
• Explore workspaces and projects
• Intelligent context management

SECURE & SELF-HOSTED
• Your code never leaves your machine
• Stateless tunnel relay architecture
• End-to-end encrypted WebSocket connection
• Keychain-secured credentials

NATIVE APPLE EXPERIENCE
• Built with SwiftUI for iOS and watchOS
• iPad split-view layout support
• Real-time streaming updates
• Dark mode optimized interface

EASY SETUP
• Scan QR code from your workstation
• Or use magic link for one-tap connection
• No complex VPN or SSH configuration
• Automatic reconnection on network changes

WHO IS THIS FOR?
• Developers using AI coding assistants
• Remote workers who code on-the-go
• Anyone who wants to monitor long-running AI tasks
• Developers with commute time to utilize

REQUIREMENTS
• Self-hosted workstation server on your development machine
• Tunnel server (self-hosted or use tiflis.io)
• Active internet connection

Source-available under FSL-1.1-NC license. Your AI assistants, truly mobile.
```

### What's New (4000 characters max)

> For version 1.0.0 initial release

```
Initial Release

• Voice-first interface for AI coding assistants
• Support for Claude Code, Cursor, and OpenCode
• Full PTY terminal with professional keyboard
• Supervisor agent for session orchestration
• Real-time streaming responses
• Secure WebSocket communication
• QR code and magic link setup
• iPad split-view support
• Apple Watch companion app
```

---

## Keywords

### Keywords Field (100 characters max, comma-separated)

```
ai,coding,cursor,claude,voice,terminal,developer,remote,ssh,opencode
```

**Character count: 62** (leaves room for adjustment)

### Alternative Keyword Sets

**Set A (Developer Focus):**

```
ai,coding,developer,terminal,ssh,remote,cursor,claude,voice,ide
```

**Set B (Productivity Focus):**

```
ai,assistant,voice,coding,productivity,remote,developer,terminal,cursor,claude
```

**Set C (Feature Focus):**

```
voice,coding,ai,terminal,cursor,claude,opencode,developer,remote,pty
```

### Long-tail Keywords for ASO

Not in the keywords field, but useful for description optimization:

- AI coding assistant
- Voice coding
- Remote development
- Mobile terminal
- Cursor mobile app
- Claude Code mobile
- Developer productivity
- Code from anywhere
- AI pair programming
- Remote IDE access

---

## Screenshots

### Required Sizes

App Store requires screenshots for these device sizes:

| Device                        | Resolution  | Status     |
| ----------------------------- | ----------- | ---------- |
| iPhone 6.9" (16 Pro Max)      | 1320 × 2868 | **Needed** |
| iPhone 6.7" (15 Plus/Pro Max) | 1290 × 2796 | **Needed** |
| iPhone 6.5" (11 Pro Max)      | 1284 × 2778 | **Needed** |
| iPhone 5.5" (8 Plus)          | 1242 × 2208 | **Needed** |
| iPad Pro 12.9" (6th gen)      | 2048 × 2732 | **Needed** |
| iPad Pro 12.9" (2nd gen)      | 2048 × 2732 | Optional   |

> **Current screenshots:** 1179 × 2556 (iPhone 14 Pro / 15 Pro size)
> These can be used for 6.1" display but need additional sizes.

### Screenshot Specifications

- **Format:** PNG or JPEG (PNG preferred for quality)
- **Color Space:** sRGB or P3
- **Transparency:** Not allowed
- **Orientation:** Portrait recommended for phones
- **Count:** 1-10 per device size (recommend 6-8)

### Recommended Screenshot Set

| #   | Screen            | Caption                     |
| --- | ----------------- | --------------------------- |
| 1   | Navigation drawer | "Manage multiple AI agents" |
| 2   | Supervisor chat   | "Orchestrate your workflow" |
| 3   | Claude Code chat  | "Voice-control Claude Code" |
| 4   | Cursor chat       | "Command Cursor remotely"   |
| 5   | Terminal          | "Full terminal access"      |
| 6   | Voice recording   | "Dictate naturally"         |
| 7   | Settings          | "Easy configuration"        |
| 8   | Connection status | "Real-time status"          |

### Existing Screenshots

Located in `assets/screenshots/ios/`:

| File                      | Description                     |
| ------------------------- | ------------------------------- |
| `1-navigation.jpg`        | Navigation drawer with sessions |
| `2-supervisor-chat.jpg`   | Supervisor chat interface       |
| `3-claude-chat.jpg`       | Claude Code agent chat          |
| `4-cursor-chat-empty.jpg` | Cursor empty state              |
| `5-cursor-chat.jpg`       | Cursor active chat              |
| `5-terminal-empty.jpg`    | Terminal empty state            |
| `6-terminal-htop.jpg`     | Terminal running htop           |
| `7-settings.jpg`          | Settings screen                 |
| `8-connection-status.jpg` | Connection status popover       |

### Screenshot Captions (Optional Overlay Text)

**Style Guide:**

- Font: SF Pro Display Bold
- Size: 72pt (adjust for device)
- Color: White with subtle drop shadow
- Position: Top 15% of screenshot
- Background: Optional gradient overlay for readability

**Suggested Captions:**

1. "Your AI Agents, One Place"
2. "Orchestrate with Voice"
3. "Control Claude Code"
4. "Command Cursor Remotely"
5. "Full Terminal Power"
6. "Speak, Don't Type"
7. "Configure Your Way"
8. "Always Connected"

### Automated Screenshots with fastlane snapshot

**fastlane snapshot** automates screenshot capture across all device sizes using UI tests.

#### Prerequisites

```bash
# Install fastlane via Homebrew
brew install fastlane

# Or via RubyGems
gem install fastlane
```

#### Setup Steps

**1. Initialize fastlane in the iOS project:**

```bash
cd apps/TiflisCode
fastlane init

# When prompted, select:
# 4. Manual setup
```

**2. Initialize snapshot:**

```bash
fastlane snapshot init
```

This creates:

- `fastlane/Snapfile` — Configuration for devices and languages
- `fastlane/SnapshotHelper.swift` — Helper to add to UI test target

**3. Configure `fastlane/Snapfile`:**

```ruby
# fastlane/Snapfile

# Device list for App Store screenshots
devices([
  "iPhone 16 Pro Max",      # 6.9" (1320 × 2868)
  "iPhone 15 Pro Max",      # 6.7" (1290 × 2796)
  "iPhone 11 Pro Max",      # 6.5" (1284 × 2778)
  "iPhone 8 Plus",          # 5.5" (1242 × 2208)
  "iPad Pro (12.9-inch) (6th generation)"  # iPad
])

# Languages (add more for localization)
languages([
  "en-US"
])

# Xcode scheme
scheme("TiflisCode")

# Output directory
output_directory("./fastlane/screenshots")

# Clear previous screenshots
clear_previous_screenshots(true)

# Skip if already captured (useful for reruns)
skip_open_summary(false)

# Override status bar (iOS 13+)
override_status_bar(true)

# Dark mode screenshots (optional - run twice for both)
# dark_mode(true)
```

**4. Add SnapshotHelper to UI Test Target:**

```bash
# Copy the helper file to your UI test directory
cp fastlane/SnapshotHelper.swift TiflisCodeUITests/
```

Then add it to your Xcode project's UI test target.

**5. Create UI Test for Screenshots:**

Create `TiflisCodeUITests/ScreenshotTests.swift`:

```swift
// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import XCTest

final class ScreenshotTests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()

        // Pass launch argument to enable demo/screenshot mode
        app.launchArguments.append("--screenshot-mode")

        setupSnapshot(app)
        app.launch()
    }

    func testCaptureScreenshots() throws {
        // 1. Navigation drawer
        // Swipe from left edge to open drawer (or tap hamburger menu)
        let drawer = app.buttons["menu"]
        if drawer.exists {
            drawer.tap()
        }
        sleep(1)
        snapshot("01_Navigation")

        // 2. Supervisor chat
        app.staticTexts["Supervisor"].tap()
        sleep(1)
        snapshot("02_Supervisor_Chat")

        // 3. Claude Code chat
        openDrawer()
        app.staticTexts["Claude Code"].tap()
        sleep(1)
        snapshot("03_Claude_Chat")

        // 4. Cursor chat
        openDrawer()
        app.staticTexts["Cursor"].tap()
        sleep(1)
        snapshot("04_Cursor_Chat")

        // 5. Terminal
        openDrawer()
        app.staticTexts["Terminal"].tap()
        sleep(1)
        snapshot("05_Terminal")

        // 6. Voice recording (if applicable)
        // Tap mic button and capture waveform
        let micButton = app.buttons["microphone"]
        if micButton.exists {
            micButton.tap()
            sleep(1)
            snapshot("06_Voice_Recording")
            micButton.tap() // Stop recording
        }

        // 7. Settings
        openDrawer()
        app.staticTexts["Settings"].tap()
        sleep(1)
        snapshot("07_Settings")

        // 8. Connection status (tap status indicator)
        let statusIndicator = app.buttons["connectionStatus"]
        if statusIndicator.exists {
            statusIndicator.tap()
            sleep(1)
            snapshot("08_Connection_Status")
        }
    }

    private func openDrawer() {
        let drawer = app.buttons["menu"]
        if drawer.exists {
            drawer.tap()
            sleep(1)
        }
    }
}
```

**6. Add Screenshot Mode to App (Optional but Recommended):**

In your app's launch code, check for the screenshot mode argument to:

- Use mock data instead of requiring real connection
- Pre-populate chat with sample messages
- Show realistic terminal output

```swift
// In TiflisCodeApp.swift or AppDelegate
#if DEBUG
let isScreenshotMode = CommandLine.arguments.contains("--screenshot-mode")
if isScreenshotMode {
    // Load demo data for screenshots
    DemoDataProvider.setupScreenshotMode()
}
#endif
```

**7. Run snapshot:**

```bash
cd apps/TiflisCode
fastlane snapshot
```

Screenshots are saved to `fastlane/screenshots/` organized by device and language.

#### Output Structure

```
fastlane/screenshots/
├── en-US/
│   ├── iPhone 16 Pro Max-01_Navigation.png
│   ├── iPhone 16 Pro Max-02_Supervisor_Chat.png
│   ├── iPhone 15 Pro Max-01_Navigation.png
│   ├── iPad Pro (12.9-inch)-01_Navigation.png
│   └── ...
└── screenshots.html  # Preview gallery
```

#### Adding Screenshot Frames (Optional)

Use **frameit** to add device frames:

```bash
# Install frameit
fastlane frameit setup

# Add frames to screenshots
fastlane frameit
```

Configure `fastlane/Framefile.json`:

```json
{
  "device_frame_version": "latest",
  "default": {
    "title": {
      "text": "",
      "font_size": 128,
      "color": "#ffffff"
    },
    "background": "#000000",
    "padding": 50
  }
}
```

#### Troubleshooting

**Simulator not found:**

```bash
# List available simulators
xcrun simctl list devices

# Create missing simulator
xcrun simctl create "iPhone 16 Pro Max" "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max"
```

**UI elements not found:**

- Add accessibility identifiers to your SwiftUI views
- Use `app.printHierarchy()` to debug element tree

```swift
// In your SwiftUI view
Button("Menu") { ... }
    .accessibilityIdentifier("menu")
```

**Screenshots too slow:**

- Use `skip_open_summary(true)` in Snapfile
- Run on faster Mac or reduce device count for testing

#### Complete Fastlane Lane (Optional)

Add to `fastlane/Fastfile`:

```ruby
# fastlane/Fastfile

default_platform(:ios)

platform :ios do
  desc "Capture App Store screenshots"
  lane :screenshots do
    snapshot
  end

  desc "Capture and frame screenshots"
  lane :framed_screenshots do
    snapshot
    frameit(white: false)
  end

  desc "Upload screenshots to App Store Connect"
  lane :upload_screenshots do
    deliver(
      skip_binary_upload: true,
      skip_metadata: true,
      overwrite_screenshots: true
    )
  end
end
```

Run with:

```bash
fastlane screenshots
# or
fastlane framed_screenshots
```

---

### Manual Screenshot Capture (Alternative)

If you prefer not to set up fastlane, capture manually from simulators:

```bash
# Boot required simulators
xcrun simctl boot "iPhone 16 Pro Max"
xcrun simctl boot "iPhone 8 Plus"
xcrun simctl boot "iPad Pro (12.9-inch) (6th generation)"

# Open Simulator app
open -a Simulator

# In Simulator: Device → Screenshot (⌘S)
# Screenshots saved to Desktop by default
```

**Tip:** Use `xcrun simctl status_bar` to set clean status bar:

```bash
# Set clean status bar (9:41 AM, full battery, full signal)
xcrun simctl status_bar "iPhone 16 Pro Max" override \
  --time "9:41" \
  --batteryState charged \
  --batteryLevel 100 \
  --cellularMode active \
  --cellularBars 4
```

---

## App Preview Video

### Specifications

| Property       | Requirement                  |
| -------------- | ---------------------------- |
| **Duration**   | 15-30 seconds                |
| **Resolution** | Match device screenshot size |
| **Format**     | H.264, .mov or .mp4          |
| **Frame Rate** | 30 fps                       |
| **Audio**      | AAC, optional                |

### Suggested Video Script

**Duration: 25 seconds**

```
[0-3s]   Logo animation, "Tiflis Code" title
[3-6s]   Show navigation drawer with multiple agents
[6-10s]  Voice command: "Hey Claude, refactor the auth module"
[10-15s] Real-time streaming response from agent
[15-18s] Switch to terminal, run git status
[18-22s] Show Apple Watch quick command
[22-25s] End card: "Your AI Agents, Mobile" + App Store badge
```

### Storyboard

| Scene | Visual                  | Audio/Text                |
| ----- | ----------------------- | ------------------------- |
| 1     | App icon → opens        | Subtle sound              |
| 2     | Navigation drawer       | "Multiple agents" overlay |
| 3     | Voice waveform          | Recording indicator       |
| 4     | Chat response streaming | Real-time updates         |
| 5     | Terminal view           | "Full terminal" overlay   |
| 6     | Apple Watch             | "From your wrist"         |
| 7     | End card                | Download CTA              |

---

## App Review Information

### Demo Account

> If app requires login, provide test credentials

```
Not applicable — app uses magic link/QR code connection to user's own workstation
```

### Review Notes

```
Tiflis Code is a remote control app for AI coding assistants (Cursor, Claude Code, OpenCode) running on the user's own development machine.

TESTING THE APP:
This app requires a self-hosted workstation server running on the user's machine. Without this server, the app will show a connection setup screen.

To test core functionality:
1. The app can be evaluated for UI/UX without an active connection
2. Connection setup flow can be tested (QR scan, manual entry)
3. Settings and about screens are fully functional offline

For full functional testing, the reviewer would need:
- Our workstation server running (open source: github.com/tiflis-io/tiflis-code)
- A tunnel server connection

We can provide a temporary test tunnel URL and credentials upon request. Please contact: support@tiflis.io

KEY FEATURES TO REVIEW:
- Voice recording and playback UI
- Chat interface with markdown rendering
- Terminal emulation (offline mode shows empty state)
- Navigation and session management
- Settings configuration

The app does not collect user data. All communication happens between the user's devices through their self-hosted infrastructure.
```

### Contact Information

```
Name: Roman Barinov
Email: support@tiflis.io
Phone: [Your phone number]
```

### App-Specific Questions

**Does your app use encryption?**

```
Yes — WebSocket Secure (WSS) for communication between app and servers.
Uses standard iOS URLSession networking with TLS 1.2+.
No custom encryption implementations.
Export compliance: ECCN 5D992 (standard encryption)
```

**Does your app contain, display, or access third-party content?**

```
No — app displays content only from user's own development machine.
```

**Does your app use the Advertising Identifier (IDFA)?**

```
No
```

---

## Privacy Policy

### Privacy Nutrition Labels

**Data Not Collected:**

- Tiflis Code does not collect any user data
- No analytics or tracking
- No advertising identifiers
- All data stays on user's devices and self-hosted servers

**App Privacy Details for App Store Connect:**

| Data Type        | Collected | Linked to User | Used for Tracking |
| ---------------- | --------- | -------------- | ----------------- |
| Contact Info     | No        | —              | —                 |
| Health & Fitness | No        | —              | —                 |
| Financial Info   | No        | —              | —                 |
| Location         | No        | —              | —                 |
| Sensitive Info   | No        | —              | —                 |
| Contacts         | No        | —              | —                 |
| User Content     | No        | —              | —                 |
| Browsing History | No        | —              | —                 |
| Search History   | No        | —              | —                 |
| Identifiers      | No        | —              | —                 |
| Usage Data       | No        | —              | —                 |
| Diagnostics      | No        | —              | —                 |

### Privacy Policy Summary

```
Tiflis Code Privacy Policy

Effective Date: [DATE]

SUMMARY
Tiflis Code is a remote control application that connects to self-hosted servers. We do not collect, store, or transmit any user data.

DATA HANDLING
• All code and conversations stay on your own devices and servers
• Connection credentials stored locally in iOS Keychain
• No analytics, tracking, or telemetry
• No third-party data sharing

SELF-HOSTED ARCHITECTURE
• Tunnel server: Stateless relay, no data persistence
• Workstation server: Runs on your machine, you control all data
• Mobile app: Stores only connection settings locally

CONTACT
For privacy questions: privacy@tiflis.io

Full policy: https://tiflis.io/privacy
```

---

## Localization

### Supported Languages (Initial Release)

- English (Primary)

### Future Localization Candidates

| Language             | Priority | Notes                      |
| -------------------- | -------- | -------------------------- |
| Japanese             | High     | Strong developer community |
| German               | High     | Large iOS developer base   |
| Chinese (Simplified) | High     | Growing market             |
| Russian              | Medium   | Developer community        |
| Spanish              | Medium   | Wide reach                 |
| Korean               | Medium   | Tech-savvy market          |

### Localization Files Needed

For each language:

- App name (30 chars)
- Subtitle (30 chars)
- Keywords (100 chars)
- Description (4000 chars)
- What's New (4000 chars)
- Promotional text (170 chars)
- Screenshot captions

---

## Checklist

### Before Submission

- [ ] App name finalized
- [ ] Subtitle finalized
- [ ] Description proofread
- [ ] Keywords optimized
- [ ] Screenshots for all required sizes
- [ ] App icon uploaded (1024 × 1024)
- [ ] Privacy policy URL live
- [ ] Support URL live
- [ ] Review notes prepared
- [ ] Test credentials ready (if needed)
- [ ] Export compliance answered
- [ ] Content rights confirmed

### Screenshot Checklist

- [ ] iPhone 6.9" display (1320 × 2868)
- [ ] iPhone 6.7" display (1290 × 2796)
- [ ] iPhone 6.5" display (1284 × 2778)
- [ ] iPhone 5.5" display (1242 × 2208)
- [ ] iPad Pro 12.9" (2048 × 2732)
- [ ] No status bar time showing personal info
- [ ] No personal data visible in screenshots
- [ ] Consistent visual style across all screenshots

---

## Quick Reference

### Character Limits

| Field            | Limit |
| ---------------- | ----- |
| App Name         | 30    |
| Subtitle         | 30    |
| Promotional Text | 170   |
| Description      | 4000  |
| What's New       | 4000  |
| Keywords         | 100   |

### Required Assets

| Asset       | Size            | Format         |
| ----------- | --------------- | -------------- |
| App Icon    | 1024 × 1024     | PNG (no alpha) |
| Screenshots | Various         | PNG/JPEG       |
| App Preview | Device-specific | H.264 MOV/MP4  |

---

_Document created for Tiflis Code iOS App Store submission_
_Last updated: 2025_
