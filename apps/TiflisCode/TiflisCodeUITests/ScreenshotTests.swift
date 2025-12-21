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

@preconcurrency import XCTest

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

    /// Project root directory
    static let projectRoot: URL = {
        if let projectRoot = ProcessInfo.processInfo.environment["PROJECT_ROOT"] {
            return URL(fileURLWithPath: projectRoot)
        }
        return URL(fileURLWithPath: "/Users/roman/tiflis-code-work/tiflis/tiflis-code--feature-automated-screenshots")
    }()

    /// Cached device folder, determined on first screenshot
    nonisolated(unsafe) static var cachedDeviceFolder: String?

    /// Determines the device folder based on app window size
    static func getDeviceFolder(for app: XCUIApplication) -> String {
        if let cached = cachedDeviceFolder {
            return cached
        }

        // Wait for window to exist before querying frame
        let window = app.windows.firstMatch
        _ = window.waitForExistence(timeout: 5)

        let appFrame = window.frame
        let maxDimension = max(appFrame.width, appFrame.height)

        let folder: String
        // iPad detection - iPads have much larger frames
        if maxDimension >= 1000 {
            folder = "ipad-12.9"
        } else if maxDimension >= 950 {
            // iPhone 16 Pro Max: 956pt height -> 6.9"
            folder = "iphone-6.9"
        } else if maxDimension >= 920 {
            // iPhone 16 Plus / 15 Pro Max: 932pt height -> 6.7"
            folder = "iphone-6.7"
        } else if maxDimension >= 890 {
            // iPhone 11 Pro Max / XS Max: 896pt height -> 6.5"
            folder = "iphone-6.5"
        } else {
            folder = "iphone-6.1"
        }

        cachedDeviceFolder = folder
        print("📱 Detected device folder: \(folder) (frame: \(appFrame.width)x\(appFrame.height))")
        return folder
    }

    /// Output directory for screenshots - determined dynamically based on app
    static func screenshotDir(for app: XCUIApplication) -> URL {
        projectRoot
            .appendingPathComponent("assets/screenshots/appstore")
            .appendingPathComponent(getDeviceFolder(for: app))
    }

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

        // Cache device folder early before any gestures that might cause timing issues
        _ = Self.getDeviceFolder(for: app)

        // Give extra time for WebSocket connection to establish
        Thread.sleep(forTimeInterval: 3)
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
        print("👆 Opening drawer with swipe gesture...")
        // Swipe from near the left edge to the right side of the screen
        let leftEdge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.5))
        let rightSide = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
        leftEdge.press(forDuration: 0.05, thenDragTo: rightSide, withVelocity: .fast, thenHoldForDuration: 0.1)
        // Wait for drawer animation to complete
        Thread.sleep(forTimeInterval: 1.5)
        print("✅ Drawer should be open now")
    }

    /// Closes the navigation drawer by swiping from right to left
    private func closeDrawer() {
        print("👆 Closing drawer with swipe gesture...")
        let center = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let leftEdge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        center.press(forDuration: 0.05, thenDragTo: leftEdge, withVelocity: .fast, thenHoldForDuration: 0.1)
        // Wait for drawer animation to complete
        Thread.sleep(forTimeInterval: 1.0)
        print("✅ Drawer should be closed now")
    }

    /// Taps the sidebar button to open drawer (fallback method)
    private func tapSidebarButton() {
        let sidebarButton = app.buttons["SidebarButton"]
        if sidebarButton.waitForExistence(timeout: 3) {
            sidebarButton.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
    }

    // MARK: - Screenshot Tests

    /// Screenshot 1: Main chat view (Supervisor) with conversation
    func test01_SupervisorChat() throws {
        // Wait for app to load and render mock data
        Thread.sleep(forTimeInterval: 3)

        // Capture the Supervisor chat with mock conversation
        snapshot("01_SupervisorChat", app: app)
    }

    /// Screenshot 2: Navigation drawer (sidebar) open
    func test02_NavigationDrawer() throws {
        // Relaunch app with drawer pre-opened
        app.terminate()
        app.launchEnvironment["SCREENSHOT_DRAWER_OPEN"] = "1"
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)
        Thread.sleep(forTimeInterval: 2)

        // Capture the navigation drawer
        snapshot("02_Navigation", app: app)
    }

    /// Screenshot 2b: Create Session sheet showing available agents
    func test02b_CreateSession() throws {
        // Relaunch app with drawer pre-opened
        app.terminate()
        app.launchEnvironment["SCREENSHOT_DRAWER_OPEN"] = "1"
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)
        Thread.sleep(forTimeInterval: 2)

        // Tap New Session button
        let newSessionButton = app.buttons["New Session"]
        if newSessionButton.waitForExistence(timeout: 5) {
            newSessionButton.tap()
            Thread.sleep(forTimeInterval: 1)
        }

        // Capture the create session sheet
        snapshot("04_CreateSession", app: app)
    }

    /// Screenshot 3: Claude agent session with code response
    func test03_AgentChat() throws {
        // Relaunch app with Claude session pre-selected
        app.terminate()
        app.launchEnvironment["SCREENSHOT_SESSION"] = "claude"
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)
        Thread.sleep(forTimeInterval: 2)

        // Capture the agent chat with code example
        snapshot("03_AgentChat", app: app)
    }

    /// Screenshot 4: Terminal session
    func test04_Terminal() throws {
        // Relaunch app with Terminal session pre-selected
        app.terminate()
        app.launchEnvironment["SCREENSHOT_SESSION"] = "terminal"
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)
        Thread.sleep(forTimeInterval: 2)

        // Capture the terminal view
        snapshot("05_Terminal", app: app)
    }

    /// Screenshot 5: Settings view
    func test05_Settings() throws {
        // Relaunch app with Settings pre-selected
        app.terminate()
        app.launchEnvironment["SCREENSHOT_SESSION"] = "settings"
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)
        Thread.sleep(forTimeInterval: 2)

        // Capture the settings view
        snapshot("06_Settings", app: app)
    }

    // MARK: - iPad-specific Screenshots

    /// Screenshot: iPad split view
    func test06_iPadSplitView() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("iPad-only test")
        }

        Thread.sleep(forTimeInterval: 2)

        // iPad should show split view by default
        snapshot("06_iPadSplitView", app: app)
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
/// When running directly, saves to device-specific directory and adds as test attachment.
func snapshot(_ name: String, app: XCUIApplication, waitForLoadingIndicator: Bool = true) {
    // Give UI time to settle
    if waitForLoadingIndicator {
        Thread.sleep(forTimeInterval: 0.5)
    }

    // Take screenshot
    let screenshot = XCUIScreen.main.screenshot()

    // Get device-specific directory and create if needed
    let screenshotDir = ScreenshotTests.screenshotDir(for: app)
    try? FileManager.default.createDirectory(at: screenshotDir, withIntermediateDirectories: true)

    // Save to file
    let fileURL = screenshotDir.appendingPathComponent("\(name).png")

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
