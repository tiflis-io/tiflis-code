//
//  ScreenshotTests.swift
//  TiflisCodeUITests
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//
//  Automated screenshot tests for App Store submissions.
//  These tests capture screenshots of key app screens connected to a mock test environment.
//

import XCTest

/// Screenshot tests for App Store submission.
///
/// These tests connect to a mock test environment and capture screenshots
/// of various app states for use in App Store Connect.
///
/// ## Prerequisites
/// 1. Start the test environment:
///    ```
///    ./scripts/screenshot-test-env.sh setup
///    ./scripts/screenshot-test-env.sh start
///    ```
/// 2. Set environment variables (done automatically by Fastlane Snapshot):
///    - TEST_TUNNEL_URL
///    - TEST_AUTH_KEY
///
/// ## Running
/// Use Fastlane: `bundle exec fastlane screenshots`
/// Or run directly in Xcode with the ScreenshotTests scheme.
final class ScreenshotTests: XCTestCase {

    var app: XCUIApplication!

    /// Output directory for screenshots - saves to project folder
    static let screenshotDir: URL = {
        // Try to get project root from environment or use a known path
        if let projectRoot = ProcessInfo.processInfo.environment["PROJECT_ROOT"] {
            return URL(fileURLWithPath: projectRoot)
                .appendingPathComponent("apps/TiflisCode/screenshots/en-US")
        }
        // Fallback: go up from the derived data to find the project
        return URL(fileURLWithPath: "/Users/roman/tiflis-code-work/tiflis/tiflis-code--feature-automated-screenshots/apps/TiflisCode/screenshots/en-US")
    }()

    // MARK: - Setup

    override func setUpWithError() throws {
        continueAfterFailure = true

        app = XCUIApplication()

        // Configure app for screenshot testing
        // Force English locale and keyboard for consistent screenshots
        app.launchArguments = [
            "-UITesting",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US"
        ]

        // Try to load test config from the session file
        // The screenshot-test-env.sh script writes config to /tmp/tiflis-screenshot-session
        var tunnelURL: String?
        var tunnelId: String?
        var authKey: String?

        // First try environment variables (for Fastlane)
        tunnelURL = ProcessInfo.processInfo.environment["TEST_TUNNEL_URL"]
        tunnelId = ProcessInfo.processInfo.environment["TEST_TUNNEL_ID"]
        authKey = ProcessInfo.processInfo.environment["TEST_AUTH_KEY"]

        // If not set, try reading from session file
        if tunnelURL == nil || tunnelId == nil || authKey == nil {
            if let sessionPath = readSessionPath(),
               let config = loadConnectionConfig(from: sessionPath) {
                tunnelURL = tunnelURL ?? config.tunnelURL
                tunnelId = tunnelId ?? config.tunnelId
                authKey = authKey ?? config.authKey
            }
        }

        // Pass test environment configuration to the app
        if let url = tunnelURL {
            app.launchEnvironment["SCREENSHOT_TEST_TUNNEL_URL"] = url
            print("📍 Setting SCREENSHOT_TEST_TUNNEL_URL: \(url)")
        }
        if let id = tunnelId {
            app.launchEnvironment["SCREENSHOT_TEST_TUNNEL_ID"] = id
            print("📍 Setting SCREENSHOT_TEST_TUNNEL_ID: \(id)")
        }
        if let key = authKey {
            app.launchEnvironment["SCREENSHOT_TEST_AUTH_KEY"] = key
            print("📍 Setting SCREENSHOT_TEST_AUTH_KEY: \(key.prefix(10))...")
        }

        // Enable screenshot testing mode
        app.launchEnvironment["SCREENSHOT_TESTING"] = "1"

        setupSnapshot(app)
        app.launch()

        // Wait for app to be ready and connection to establish
        _ = app.wait(for: .runningForeground, timeout: 10)

        // Give extra time for WebSocket connection to establish
        Thread.sleep(forTimeInterval: 3)

        // Create screenshot directory if needed
        try? FileManager.default.createDirectory(
            at: Self.screenshotDir,
            withIntermediateDirectories: true
        )
    }

    /// Reads the session file path from /tmp/tiflis-screenshot-session
    private func readSessionPath() -> String? {
        let sessionFile = "/tmp/tiflis-screenshot-session"
        guard let content = try? String(contentsOfFile: sessionFile, encoding: .utf8) else {
            print("⚠️ Could not read session file at \(sessionFile)")
            return nil
        }

        // Parse: export TEST_ROOT="/tmp/tiflis-test-xxx"
        for line in content.components(separatedBy: "\n") {
            if line.contains("TEST_ROOT=") {
                let parts = line.components(separatedBy: "=")
                if parts.count >= 2 {
                    let path = parts[1].trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
                    print("📂 Found TEST_ROOT: \(path)")
                    return path
                }
            }
        }
        return nil
    }

    /// Loads connection config from the test root's connection.env file
    private func loadConnectionConfig(from testRoot: String) -> (tunnelURL: String, tunnelId: String, authKey: String)? {
        let configPath = "\(testRoot)/connection.env"
        guard let content = try? String(contentsOfFile: configPath, encoding: .utf8) else {
            print("⚠️ Could not read connection config at \(configPath)")
            return nil
        }

        var tunnelURL: String?
        var tunnelId: String?
        var authKey: String?

        for line in content.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("TEST_TUNNEL_URL=") {
                tunnelURL = extractValue(from: trimmed)
            } else if trimmed.hasPrefix("TEST_TUNNEL_ID=") {
                tunnelId = extractValue(from: trimmed)
            } else if trimmed.hasPrefix("TEST_AUTH_KEY=") {
                authKey = extractValue(from: trimmed)
            }
        }

        if let url = tunnelURL, let id = tunnelId, let key = authKey {
            print("✅ Loaded config: URL=\(url), ID=\(id), Key=\(key.prefix(10))...")
            return (url, id, key)
        }

        print("⚠️ Incomplete config in \(configPath)")
        return nil
    }

    /// Extracts value from a KEY="value" or KEY=value line
    private func extractValue(from line: String) -> String? {
        guard let equalIndex = line.firstIndex(of: "=") else { return nil }
        let value = String(line[line.index(after: equalIndex)...])
        return value.trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Helper: Open Drawer

    /// Opens the navigation drawer by swiping from left edge
    private func openDrawer() {
        let leftEdge = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
        let center = app.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.5))
        leftEdge.press(forDuration: 0.1, thenDragTo: center)
        Thread.sleep(forTimeInterval: 0.5)
    }

    // MARK: - Screenshot Tests

    /// Screenshot 1: Navigation drawer (sidebar) open
    func test01_NavigationDrawer() throws {
        // Wait for initial load
        Thread.sleep(forTimeInterval: 2)

        // On iPhone, swipe from left edge to open drawer
        openDrawer()

        // Take screenshot
        snapshot("01_Navigation")
    }

    /// Screenshot 2: Main chat view (Supervisor)
    func test02_SupervisorChat() throws {
        // Wait for initial load - the app should show Supervisor by default
        Thread.sleep(forTimeInterval: 2)

        // Just capture the current state (Supervisor chat)
        snapshot("02_SupervisorChat")
    }

    /// Screenshot 3: Agent chat with code example (Claude)
    func test03_AgentChat() throws {
        Thread.sleep(forTimeInterval: 2)

        // Open drawer to navigate to Claude agent
        openDrawer()
        Thread.sleep(forTimeInterval: 0.5)

        // Look for Claude Code in the drawer
        // Try different possible identifiers
        let claudeButton = app.buttons["Claude Code"]
        let claudeStaticText = app.staticTexts["Claude Code"]

        if claudeButton.exists {
            claudeButton.tap()
        } else if claudeStaticText.exists {
            claudeStaticText.tap()
        } else {
            // Try tapping by position - agent sessions are below Supervisor
            let agentCells = app.cells.allElementsBoundByIndex
            if agentCells.count > 1 {
                agentCells[1].tap() // First agent after Supervisor
            }
        }

        Thread.sleep(forTimeInterval: 1)

        snapshot("03_ChatInput")
    }

    /// Screenshot 4: Terminal with htop running
    func test04_Terminal() throws {
        Thread.sleep(forTimeInterval: 2)

        // Open drawer
        openDrawer()
        Thread.sleep(forTimeInterval: 0.5)

        // Look for Terminal in the drawer - it should be pre-created with htop running
        let terminalButton = app.buttons["Terminal"]
        let terminalStaticText = app.staticTexts["Terminal"]

        if terminalButton.exists {
            terminalButton.tap()
        } else if terminalStaticText.exists {
            terminalStaticText.tap()
        } else {
            // Try scrolling down to find Terminal
            let drawer = app.scrollViews.firstMatch
            if drawer.exists {
                drawer.swipeUp()
                Thread.sleep(forTimeInterval: 0.3)
            }
            // Try again after scroll
            if app.buttons["Terminal"].exists {
                app.buttons["Terminal"].tap()
            } else if app.staticTexts["Terminal"].exists {
                app.staticTexts["Terminal"].tap()
            }
        }

        // Give terminal time to subscribe, request replay, and render content
        // Terminal needs extra time because:
        // 1. Subscribe to terminal session
        // 2. Request replay of buffered output
        // 3. Receive and render the replay data
        Thread.sleep(forTimeInterval: 5)

        // Switch keyboard to English by tapping the globe button until English keyboard appears
        let keyboard = app.keyboards.firstMatch
        if keyboard.exists {
            // Look for globe button to switch keyboard language
            let globeButton = keyboard.buttons["Next keyboard"]
            if globeButton.exists {
                // Tap globe to cycle through keyboards - tap a few times to get to English
                for _ in 0..<3 {
                    globeButton.tap()
                    Thread.sleep(forTimeInterval: 0.3)
                    // Check if we have English keyboard (space bar says "space" not "Пробел")
                    if keyboard.buttons["space"].exists {
                        break
                    }
                }
            }
        }
        Thread.sleep(forTimeInterval: 0.5)

        snapshot("04_Terminal")
    }

    /// Screenshot 5: Settings navigation
    func test05_Settings() throws {
        Thread.sleep(forTimeInterval: 2)

        // Open drawer
        openDrawer()
        Thread.sleep(forTimeInterval: 0.5)

        // Look for Settings in the drawer
        let settingsButton = app.buttons["Settings"]
        if settingsButton.exists {
            settingsButton.tap()
            Thread.sleep(forTimeInterval: 1)
        }

        snapshot("05_Settings")
    }

    // MARK: - iPad-specific Screenshots

    /// Screenshot: iPad split view
    func test06_iPadSplitView() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("iPad-only test")
        }

        Thread.sleep(forTimeInterval: 2)

        // iPad should show split view by default
        snapshot("06_iPadSplitView")
    }
}

// MARK: - Snapshot Helper

/// Sets up Fastlane Snapshot for the test.
/// This function is called automatically when running through Fastlane.
func setupSnapshot(_ app: XCUIApplication) {
    // Fastlane Snapshot will inject this setup
    // For now, this is a placeholder that does nothing when running outside Fastlane
}

/// Takes a snapshot with the given name.
/// When running through Fastlane, this saves the screenshot.
/// When running directly, saves to temp directory and adds as test attachment.
func snapshot(_ name: String, waitForLoadingIndicator: Bool = true) {
    // Give UI time to settle
    if waitForLoadingIndicator {
        Thread.sleep(forTimeInterval: 0.5)
    }

    // Take screenshot
    let screenshot = XCUIScreen.main.screenshot()

    // Save to file
    let fileURL = ScreenshotTests.screenshotDir.appendingPathComponent("\(name).png")
    do {
        try screenshot.pngRepresentation.write(to: fileURL)
        print("📸 Screenshot saved: \(fileURL.path)")
    } catch {
        print("❌ Failed to save screenshot: \(error)")
    }

    // Also add as test attachment
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    XCTContext.runActivity(named: "Screenshot: \(name)") { activity in
        activity.add(attachment)
    }
}
