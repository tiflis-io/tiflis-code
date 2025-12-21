//
//  WatchScreenshotTests.swift
//  TiflisCodeWatchUITests
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//
//  Automated screenshot tests for App Store Watch screenshots.
//  These tests capture screenshots of key watch app screens with mock data.
//
//  ## Prerequisites
//  1. Start the test environment:
//     ```
//     ./scripts/screenshot-test-env.sh setup
//     ./scripts/screenshot-test-env.sh start
//     ```
//
//  ## Running
//  Run via Xcode with the TiflisCodeWatch scheme on Apple Watch simulator.
//

@preconcurrency import XCTest

/// Screenshot tests for watchOS App Store submission.
///
/// These tests capture screenshots of the watch app with mock data
/// for use in App Store Connect.
final class WatchScreenshotTests: XCTestCase {

    var app: XCUIApplication!

    /// Project root directory
    static let projectRoot: URL = {
        if let projectRoot = ProcessInfo.processInfo.environment["PROJECT_ROOT"] {
            return URL(fileURLWithPath: projectRoot)
        }
        return URL(fileURLWithPath: "/Users/roman/tiflis-code-work/tiflis/tiflis-code--feature-automated-screenshots")
    }()

    /// Determines the watch folder based on screen size
    /// Uses app window frame since XCUIScreen.main.bounds is not available on watchOS
    static func deviceFolder(for app: XCUIApplication) -> String {
        let screenSize = app.windows.firstMatch.frame.size
        let maxDimension = max(screenSize.width, screenSize.height)

        // Watch sizes based on screen height in points
        // 45mm/46mm watches: ~251pt height -> watch-45mm
        // 41mm/42mm watches: ~224pt height -> watch-41mm
        if maxDimension >= 240 {
            return "watch-45mm"
        } else {
            return "watch-41mm"
        }
    }

    /// Output directory for screenshots - saves to assets/screenshots/appstore/<device>/
    static func screenshotDir(for app: XCUIApplication) -> URL {
        projectRoot
            .appendingPathComponent("assets/screenshots/appstore")
            .appendingPathComponent(deviceFolder(for: app))
    }

    // MARK: - Setup

    override func setUpWithError() throws {
        continueAfterFailure = true

        app = XCUIApplication()

        // Configure app for screenshot testing
        app.launchArguments = [
            "-UITesting",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US"
        ]

        // Enable screenshot testing mode with mock data
        app.launchEnvironment["SCREENSHOT_TESTING"] = "1"

        // Load test config from session file if available
        if let sessionPath = readSessionPath(),
           let config = loadConnectionConfig(from: sessionPath) {
            app.launchEnvironment["SCREENSHOT_TEST_TUNNEL_URL"] = config.tunnelURL
            app.launchEnvironment["SCREENSHOT_TEST_TUNNEL_ID"] = config.tunnelId
            app.launchEnvironment["SCREENSHOT_TEST_AUTH_KEY"] = config.authKey
        }

        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)

        // Give time for mock data to populate
        Thread.sleep(forTimeInterval: 2)

        // Create screenshot directory if needed
        try? FileManager.default.createDirectory(
            at: Self.screenshotDir(for: app),
            withIntermediateDirectories: true
        )
    }

    /// Reads the session file path
    private func readSessionPath() -> String? {
        let sessionFile = "/tmp/tiflis-screenshot-session"
        guard let content = try? String(contentsOfFile: sessionFile, encoding: .utf8) else {
            return nil
        }

        for line in content.components(separatedBy: "\n") {
            if line.contains("TEST_ROOT=") {
                let parts = line.components(separatedBy: "=")
                if parts.count >= 2 {
                    return parts[1].trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
                }
            }
        }
        return nil
    }

    /// Loads connection config from the test root
    private func loadConnectionConfig(from testRoot: String) -> (tunnelURL: String, tunnelId: String, authKey: String)? {
        let configPath = "\(testRoot)/connection.env"
        guard let content = try? String(contentsOfFile: configPath, encoding: .utf8) else {
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
            return (url, id, key)
        }
        return nil
    }

    private func extractValue(from line: String) -> String? {
        guard let equalIndex = line.firstIndex(of: "=") else { return nil }
        let value = String(line[line.index(after: equalIndex)...])
        return value.trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Screenshot Tests

    /// Screenshot 1: Session list view
    func test01_SessionList() throws {
        // Wait for session list to render with mock data
        Thread.sleep(forTimeInterval: 2)

        // The app should show session list by default when in screenshot testing mode
        takeScreenshot(name: "01_SessionList")
    }

    /// Screenshot 2: Supervisor chat
    func test02_SupervisorChat() throws {
        Thread.sleep(forTimeInterval: 1)

        // Tap on Supervisor row to open chat
        let supervisorButton = app.buttons["Supervisor"]
        if supervisorButton.waitForExistence(timeout: 5) {
            supervisorButton.tap()
            Thread.sleep(forTimeInterval: 1)
        } else {
            // Try static text
            let supervisorText = app.staticTexts["Supervisor"]
            if supervisorText.waitForExistence(timeout: 3) {
                supervisorText.tap()
                Thread.sleep(forTimeInterval: 1)
            }
        }

        takeScreenshot(name: "02_SupervisorChat")
    }

    /// Screenshot 3: Agent chat (Claude Code)
    func test03_AgentChat() throws {
        Thread.sleep(forTimeInterval: 1)

        // Scroll down to see Claude Code session and tap it
        // The session list shows: Supervisor, then Sessions header, then Claude Code
        app.swipeUp() // Scroll to reveal Claude Code
        Thread.sleep(forTimeInterval: 0.5)

        // Try different ways to find and tap Claude Code
        let claudeButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Claude'")).firstMatch
        if claudeButton.waitForExistence(timeout: 3) {
            claudeButton.tap()
            Thread.sleep(forTimeInterval: 1)
        } else {
            // Try tapping on any element containing "Claude"
            let claudeElements = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Claude'"))
            if claudeElements.count > 0 {
                claudeElements.firstMatch.tap()
                Thread.sleep(forTimeInterval: 1)
            }
        }

        takeScreenshot(name: "03_AgentChat")
    }

    /// Screenshot 4: Voice recording button (showing the mic interface)
    func test04_VoiceInterface() throws {
        Thread.sleep(forTimeInterval: 1)

        // Navigate back to session list
        app.swipeRight()
        Thread.sleep(forTimeInterval: 0.5)

        // Tap Supervisor to get to chat
        let supervisorButton = app.buttons["Supervisor"]
        if supervisorButton.waitForExistence(timeout: 3) {
            supervisorButton.tap()
            Thread.sleep(forTimeInterval: 1)
        }

        // The voice button should be visible at the bottom
        takeScreenshot(name: "04_VoiceInterface")
    }

    // MARK: - Helper Methods

    private func takeScreenshot(name: String) {
        Thread.sleep(forTimeInterval: 0.5) // Let UI settle

        // Use app.screenshot() for watchOS compatibility (XCUIScreen.main is not available)
        let screenshot = app.screenshot()

        // Save to file
        let fileURL = Self.screenshotDir(for: app).appendingPathComponent("\(name).png")
        do {
            try screenshot.pngRepresentation.write(to: fileURL)
            print("📸 Watch screenshot saved: \(fileURL.path)")
        } catch {
            print("❌ Failed to save watch screenshot: \(error)")
        }

        // Also add as test attachment
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        XCTContext.runActivity(named: "Watch Screenshot: \(name)") { activity in
            activity.add(attachment)
        }
    }
}
