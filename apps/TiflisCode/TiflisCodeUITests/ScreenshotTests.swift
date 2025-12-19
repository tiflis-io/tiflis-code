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
        app.launchArguments = ["-UITesting"]

        // Pass test environment configuration
        if let tunnelURL = ProcessInfo.processInfo.environment["TEST_TUNNEL_URL"] {
            app.launchEnvironment["SCREENSHOT_TEST_TUNNEL_URL"] = tunnelURL
        }
        if let authKey = ProcessInfo.processInfo.environment["TEST_AUTH_KEY"] {
            app.launchEnvironment["SCREENSHOT_TEST_AUTH_KEY"] = authKey
        }

        // Enable screenshot testing mode
        app.launchEnvironment["SCREENSHOT_TESTING"] = "1"

        setupSnapshot(app)
        app.launch()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: 10)

        // Create screenshot directory if needed
        try? FileManager.default.createDirectory(
            at: Self.screenshotDir,
            withIntermediateDirectories: true
        )
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

    /// Screenshot 3: Chat with input focus
    func test03_ChatInput() throws {
        Thread.sleep(forTimeInterval: 2)

        // Find and tap any text field
        let textFields = app.textFields.allElementsBoundByIndex
        if !textFields.isEmpty {
            textFields[0].tap()
            Thread.sleep(forTimeInterval: 0.5)
        }

        snapshot("03_ChatInput")
    }

    /// Screenshot 4: Terminal navigation
    func test04_Terminal() throws {
        Thread.sleep(forTimeInterval: 2)

        // Open drawer
        openDrawer()
        Thread.sleep(forTimeInterval: 0.5)

        // Look for Terminal in the drawer
        let terminalButton = app.buttons["Terminal"]
        if terminalButton.exists {
            terminalButton.tap()
            Thread.sleep(forTimeInterval: 2)
        }

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
