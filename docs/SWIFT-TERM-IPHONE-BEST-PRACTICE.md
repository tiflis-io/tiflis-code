# SwiftTerm iPhone Best Practices Guide

## Overview

SwiftTerm is a powerful, production-ready VT100/Xterm terminal emulator library for iOS applications (version 1.5.0). This guide provides comprehensive best practices for integrating SwiftTerm into iOS applications, following Apple's Human Interface Guidelines and modern iOS development patterns.

## Table of Contents

- [Integration Setup](#integration-setup)
- [Terminal View Configuration](#terminal-view-configuration)
- [Connection Management](#connection-management)
- [User Interface Design](#user-interface-design)
- [Performance Optimization](#performance-optimization)
- [Accessibility](#accessibility)
- [Security Considerations](#security-considerations)
- [Testing](#testing)
- [Common Pitfalls](#common-pitfalls)

## Integration Setup

### Swift Package Manager Integration

```swift
// In your Package.swift
dependencies: [
    .package(url: "https://github.com/migueldeicaza/SwiftTerm", from: "1.5.0")
],
targets: [
    .target(name: "YourApp", dependencies: ["SwiftTerm"])
]
```

### Basic Terminal View Setup

```swift
import UIKit
import SwiftTerm

class TerminalViewController: UIViewController {
    var terminalView: TerminalView!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupTerminalView()
        setupTerminalDelegate()

        // Configure for visionOS if needed
        if #available(visionOS 1.0, *) {
            setupVisionOSSpecificFeatures()
        }
    }

    private func setupTerminalView() {
        terminalView = TerminalView(frame: view.bounds)
        terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Note: configureNativeColors() does not exist in SwiftTerm
        // Configure colors manually using nativeForegroundColor and nativeBackgroundColor
        terminalView.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)

        // Enable proper keyboard handling
        // Note: keyboardType is read-only, cannot be set directly
        terminalView.keyboardAppearance = .dark
        terminalView.autocapitalizationType = .none
        terminalView.autocorrectionType = .no

        view.addSubview(terminalView)
        terminalView.becomeFirstResponder()
    }

    @available(visionOS 1.0, *)
    private func setupVisionOSSpecificFeatures() {
        // Configure visionOS-specific optimizations
        terminalView.backgroundColor = UIColor.clear
        // Add visionOS-specific gesture handling if needed
    }
}
```

## Terminal View Configuration

### Font Configuration

```swift
// Use system monospaced fonts for optimal iOS integration
extension UIFont {
    static func terminalFont(ofSize size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        return UIFont.monospacedSystemFont(ofSize: size, weight: weight)
    }
}

// Configure font variants
// Note: UIFont.italic() does not exist - use UIFontDescriptor to create italic variants
let normalFont = UIFont.terminalFont(ofSize: 14)
let boldFont = UIFont.terminalFont(ofSize: 14, weight: .semibold)

// Create italic variants using UIFontDescriptor
var normalFontDescriptor = normalFont.fontDescriptor
var boldFontDescriptor = boldFont.fontDescriptor

let italicSymbolicTraits = normalFontDescriptor.symbolicTraits.union(.traitItalic)
normalFontDescriptor = normalFontDescriptor.withSymbolicTraits(italicSymbolicTraits) ?? normalFontDescriptor
let italicFont = UIFont(descriptor: normalFontDescriptor, size: 14)

let boldItalicSymbolicTraits = boldFontDescriptor.symbolicTraits.union(.traitItalic)
boldFontDescriptor = boldFontDescriptor.withSymbolicTraits(boldItalicSymbolicTraits) ?? boldFontDescriptor
let boldItalicFont = UIFont(descriptor: boldFontDescriptor, size: 14)

terminalView.setFonts(
    normal: normalFont,
    bold: boldFont,
    italic: italicFont,
    boldItalic: boldItalicFont
)
```

### Color Scheme Configuration

```swift
extension TerminalView {
    func configureDarkTheme() {
        // Note: UIColor.systemGray100 does not exist - use systemGray6 for dark theme
        let foregroundColor = UIColor.systemGray6
        terminalView.nativeForegroundColor = foregroundColor
        terminalView.nativeBackgroundColor = UIColor.systemBackground
        terminalView.selectedTextBackgroundColor = UIColor.systemBlue.withAlphaComponent(0.3)
        terminalView.caretColor = UIColor.systemBlue
        terminalView.caretTextColor = foregroundColor
    }

    func configureLightTheme() {
        terminalView.nativeForegroundColor = UIColor.label
        terminalView.nativeBackgroundColor = UIColor.systemBackground
        terminalView.selectedTextBackgroundColor = UIColor.systemBlue.withAlphaComponent(0.2)
        terminalView.caretColor = UIColor.systemBlue
        terminalView.caretTextColor = UIColor.label
    }
}
```

### Terminal Options Configuration

```swift
func configureTerminalOptions() {
    let terminal = terminalView.getTerminal()
    // Note: TerminalOptions only supports basic options
    // It does NOT support: allowTitleReporting, allowMouseReporting, mouseMode
    // These are handled internally by SwiftTerm
    terminal.options = TerminalOptions(
        cols: 80,
        rows: 24,
        cursorStyle: .blinkBlock,
        scrollback: 1000,
        enableSixelReported: true  // Enable Sixel graphics support
    )
}
```

## Connection Management

### Modern Swift Concurrency SSH Connection

```swift
import SwiftSH

@MainActor
class SSHTerminalManager: NSObject, TerminalViewDelegate {
    private var shell: SSHShell?
    private var connectionTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var listenTask: Task<Void, Never>?

    // Connection state management
    private var isConnecting = false
    private var isReconnecting = false
    private var isConnected = false

    private let heartbeatInterval: TimeInterval = 20.0

    override init() {
        super.init()
    }

    func connect(to host: String, port: Int, username: String, password: String) async {
        // Prevent multiple simultaneous connection attempts
        guard !isConnecting, !isReconnecting, !isConnected else {
            SSHTerminalManager.log("⚠️ SSH: Connection already in progress or connected")
            return
        }

        isConnecting = true
        defer { isConnecting = false }

        connectionTask = Task { [weak self] in
            guard let self = self else { return }

            do {
                self.shell = try SSHShell(
                    sshLibrary: Libssh2.self,
                    host: host,
                    port: port,
                    environment: [
                        Environment(name: "LANG", variable: "en_US.UTF-8"),
                        Environment(name: "TERM", variable: "xterm-256color")
                    ],
                    terminal: "xterm-256color"
                )

                try await self.establishConnection(username: username, password: password)

            } catch {
                await MainActor.run {
                    self.handleConnectionError(error)
                }
            }
        }
    }

    private func establishConnection(username: String, password: String) async throws {
        guard let shell = shell else { throw SSHTerminalError.shellNotInitialized }

        // Setup callback handling
        shell.withCallback { [weak self] data, error in
            guard let self = self else { return }

            Task { @MainActor in
                if let data = data {
                    self.processIncomingData(data)
                } else if let error = error {
                    self.handleConnectionError(error)
                }
            }
        }

        // Connect and authenticate
        try shell.connect()
        try shell.authenticate(.byPassword(username: username, password: password))

        // Open shell
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            shell.open { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }

        await MainActor.run {
            self.connectionEstablished()
        }

        // Start background tasks
        startHeartbeat()
        startListening()
    }

    // MARK: - Swift Concurrency Patterns

    private func startHeartbeat() {
        heartbeatTask = Task { [weak self] in
            guard let self = self else { return }

            // Initial delay before first heartbeat
            try? await Task.sleep(for: .seconds(self.heartbeatInterval))

            // Periodic heartbeat loop
            while !Task.isCancelled {
                // Check connection state on MainActor before sending
                let shouldContinue = await MainActor.run {
                    guard self.isConnected else { return false }
                    return true
                }

                guard shouldContinue else { break }

                // Send heartbeat
                await self.sendHeartbeat()

                // Wait for next interval
                try? await Task.sleep(for: .seconds(self.heartbeatInterval))
            }
        }
    }

    private func startListening() {
        listenTask = Task { [weak self] in
            guard let self = self else { return }

            while !Task.isCancelled {
                do {
                    // Listen for incoming data
                    if let data = try await self.waitForData() {
                        await MainActor.run {
                            self.processIncomingData(data)
                        }
                    }
                } catch {
                    if Task.isCancelled { break }
                    await MainActor.run {
                        self.handleConnectionError(error)
                    }
                }
            }
        }
    }

    private func sendHeartbeat() async {
        // Capture state on MainActor first
        let canSend = await MainActor.run {
            guard self.isConnected, let shell = self.shell else {
                return false
            }
            return true
        }

        guard canSend else { return }

        // Send heartbeat ping
        do {
            try shell?.write(Data(" \n".utf8))
        } catch {
            await MainActor.run {
                self.handleConnectionError(error)
            }
        }
    }

    private func waitForData() async throws -> Data? {
        // Implement data waiting logic with timeout for setup
        return try await withThrowingTaskGroup(of: Data?.self) { group in
            group.addTask {
                // Simulate waiting for data - replace with actual implementation
                try? await Task.sleep(for: .seconds(1.0))
                return nil
            }

            guard let result = try await group.next() else {
                throw SSHTerminalError.connectionClosed
            }

            return result
        }
    }

    // MARK: - TerminalViewDelegate Conformance

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        Task { @MainActor in
            let canSend = await MainActor.run {
                guard self.isConnected, let shell = self.shell else {
                    return false
                }
                return true
            }

            guard canSend else { return }

            do {
                try shell?.write(Data(data))
            } catch {
                self.handleConnectionError(error)
            }
        }
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        Task { @MainActor in
            let canResize = await MainActor.run {
                guard self.isConnected, let shell = self.shell else {
                    return false
                }
                return true
            }

            guard canResize else { return }

            do {
                try shell?.setTerminalSize(width: UInt(newCols), height: UInt(newRows))
            } catch {
                self.handleConnectionError(error)
            }
        }
    }

    // MARK: - Data Processing

    private func processIncomingData(_ data: Data) {
        // Process data in chunks to prevent UI blocking
        let chunkSize = 1024

        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self = self else { return }

            for offset in stride(from: 0, to: data.count, by: chunkSize) {
                let end = min(offset + chunkSize, data.count)
                let chunk = data[offset..<end]

                await MainActor.run {
                    self.terminalView.feed(byteArray: Array(chunk))
                }
            }
        }
    }

    // MARK: - Connection Management

    private func connectionEstablished() {
        isConnected = true
        SSHTerminalManager.log("✅ SSH: Connection established")
    }

    private func handleConnectionError(_ error: Error) {
        isConnected = false
        SSHTerminalManager.log("❌ SSH: Connection error - \(error.localizedDescription)")

        // Cancel all tasks
        disconnect()

        // Handle error (show alert, attempt reconnection, etc.)
    }

    func disconnect() {
        // Cancel all tasks
        connectionTask?.cancel()
        connectionTask = nil

        heartbeatTask?.cancel()
        heartbeatTask = nil

        listenTask?.cancel()
        listenTask = nil

        // Disconnect shell
        shell?.disconnect()
        shell = nil

        isConnected = false
        SSHTerminalManager.log("🔌 SSH: Disconnected")
    }

    // MARK: - Static Logging Utilities

    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    private static func log(_ message: String) {
        print("[\(SSHTerminalManager.timestamp)] \(message)")
    }

    deinit {
        disconnect()
    }
}

enum SSHTerminalError: Error {
    case shellNotInitialized
    case connectionClosed
    case invalidMessage

    var localizedDescription: String {
        switch self {
        case .shellNotInitialized:
            return "SSH shell not initialized"
        case .connectionClosed:
            return "SSH connection closed"
        case .invalidMessage:
            return "Invalid SSH message"
        }
    }
}
```

### Local Process Connection (for jailbroken devices or simulator)

```swift
@MainActor
class LocalTerminalManager: NSObject, TerminalViewDelegate {
    private var process: LocalProcess?
    private var outputTask: Task<Void, Never>?

    func startLocalProcess(command: String = "/bin/bash") async {
        do {
            process = try LocalProcess()
            process?.delegate = self
            process?.start(command: command)

            // Set initial terminal size
            let terminal = terminalView.getTerminal()
            process?.setTerminalSize(cols: UInt(terminal.cols), rows: UInt(terminal.rows))

            // Start monitoring process output
            startOutputMonitoring()

        } catch {
            await handleProcessError(error)
        }
    }

    private func startOutputMonitoring() {
        outputTask = Task { [weak self] in
            guard let self = self else { return }

            while !Task.isCancelled, let process = self.process {
                // Monitor process output with proper cancellation
                do {
                    if let output = try await self.waitForProcessOutput(process) {
                        await MainActor.run {
                            self.terminalView.feed(text: output)
                        }
                    }
                } catch {
                    if Task.isCancelled { break }
                    await MainActor.run {
                        self.handleProcessError(error)
                    }
                }
            }
        }
    }

    private func waitForProcessOutput(_ process: LocalProcess) async throws -> String? {
        // Implement process output monitoring with timeout
        return try await withThrowingTaskGroup(of: String?.self) { group in
            group.addTask {
                // Simulate waiting for process output - replace with actual implementation
                try? await Task.sleep(for: .milliseconds(100))
                return nil
            }

            guard let result = try await group.next() else {
                return nil
            }

            return result
        }
    }

    // TerminalViewDelegate conformance
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        Task { @MainActor in
            guard let process = self.process else { return }

            do {
                process.write(Data(data))
            } catch {
                await self.handleProcessError(error)
            }
        }
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        Task { @MainActor in
            guard let process = self.process else { return }

            process.setTerminalSize(cols: UInt(newCols), rows: UInt(newRows))
        }
    }

    private func handleProcessError(_ error: Error) async {
        LocalTerminalManager.log("❌ Process error: \(error.localizedDescription)")

        // Cancel monitoring task
        outputTask?.cancel()
        outputTask = nil

        // Clean up process
        process = nil
    }

    func stopProcess() {
        outputTask?.cancel()
        outputTask = nil

        process?.terminate()
        process = nil

        LocalTerminalManager.log("🔌 Process terminated")
    }

    // MARK: - Static Logging Utilities

    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    private static func log(_ message: String) {
        print("[\(LocalTerminalManager.timestamp)] \(message)")
    }

    deinit {
        stopProcess()
    }
}
```

## User Interface Design

### Layout and Auto Layout

```swift
class TerminalViewController: UIViewController {
    var terminalView: TerminalView!
    var keyboardLayoutGuide: UILayoutGuide!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupAutoLayout()
        setupKeyboardHandling()

        // Configure platform-specific optimizations
        setupPlatformSpecificFeatures()
    }

    private func setupAutoLayout() {
        terminalView = TerminalView()
        terminalView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(terminalView)

        // Create keyboard layout guide (iOS 15+)
        if #available(iOS 15.0, *) {
            keyboardLayoutGuide = UILayoutGuide()
            view.addLayoutGuide(keyboardLayoutGuide)

            NSLayoutConstraint.activate([
                terminalView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                terminalView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                terminalView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                terminalView.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),

                keyboardLayoutGuide.topAnchor.constraint(equalTo: terminalView.bottomAnchor),
                keyboardLayoutGuide.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                keyboardLayoutGuide.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                keyboardLayoutGuide.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])
        } else {
            // Fallback for iOS 14 and below
            NSLayoutConstraint.activate([
                terminalView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                terminalView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                terminalView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                terminalView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])
        }
    }

    private func setupPlatformSpecificFeatures() {
        if #available(visionOS 1.0, *) {
            // visionOS-specific optimizations
            terminalView.backgroundColor = UIColor.clear
            // Configure for visionOS window management
        } else if #available(iOS 15.0, *) {
            // iOS 15+ specific features
            setupKeyboardLayoutGuide()
        }
    }

    @available(iOS 15.0, *)
    private func setupKeyboardLayoutGuide() {
        // Enhanced keyboard handling for iOS 15+
        terminalView.keyboardLayoutGuide = keyboardLayoutGuide
    }
}
```

### Custom Accessory View Configuration

```swift
extension TerminalViewController {
    func setupCustomAccessoryView() {
        let accessory = TerminalAccessory(
            frame: CGRect(x: 0, y: 0, width: view.bounds.width, height: 44),
            inputViewStyle: .keyboard,
            container: terminalView
        )

        // Customize accessory view appearance
        accessory.setupUI()

        // Add custom buttons if needed
        let customButton = UIButton(type: .system)
        customButton.setTitle("Custom", for: .normal)
        customButton.addTarget(self, action: #selector(customAction), for: .touchUpInside)
        accessory.addSubview(customButton)

        terminalView.inputAccessoryView = accessory
    }

    @objc private func customAction() {
        // Handle custom accessory button action
    }
}
```

### Gesture Handling

```swift
extension TerminalViewController {
    func setupGestureHandling() {
        // Long press for context menu
        let longPressGesture = UILongPressGestureRecognizer(
            target: self,
            action: #selector(handleLongPress(_:))
        )
        longPressGesture.minimumPressDuration = 0.5
        terminalView.addGestureRecognizer(longPressGesture)

        // Double tap for word selection
        let doubleTapGesture = UITapGestureRecognizer(
            target: self,
            action: #selector(handleDoubleTap(_:))
        )
        doubleTapGesture.numberOfTapsRequired = 2
        doubleTapGesture.require(toFail: longPressGesture)
        terminalView.addGestureRecognizer(doubleTapGesture)
    }

    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        if gesture.state == .began {
            // Handle long press - typically shows context menu
            showContextMenu(at: gesture.location(in: terminalView))
        }
    }

    @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        // Handle double tap - typically selects word
        let location = gesture.location(in: terminalView)
        // Implement word selection logic
    }
}
```

## Performance Optimization

### Modern Swift Concurrency Display Updates

```swift
@MainActor
extension TerminalView {
    private var displayUpdateTask: Task<Void, Never>?
    private var pendingUpdates = false

    func optimizeDisplayPerformance() {
        // Use Task-based periodic operations instead of Timer
        startDisplayUpdates()

        // Implement dirty region rendering with v1.5.0 optimizations
        override func draw(_ dirtyRect: CGRect) {
            super.draw(dirtyRect)

            // Only redraw the dirty region
            guard let context = UIGraphicsGetCurrentContext() else { return }

            // Optimize drawing operations with enhanced performance
            context.saveGState()
            defer { context.restoreGState() }

            // Use optimized rendering for v1.5.0
            drawTerminalContents(dirtyRect: dirtyRect, context: context, bufferOffset: 0)

            // Log performance metrics for debugging (optional)
            #if DEBUG
            await logRenderingPerformance()
            #endif
        }
    }

    private func startDisplayUpdates() {
        displayUpdateTask = Task { [weak self] in
            guard let self = self else { return }

            while !Task.isCancelled {
                // Check if updates are pending
                let shouldUpdate = await MainActor.run {
                    guard self.pendingUpdates else { return false }
                    self.pendingUpdates = false
                    return true
                }

                if shouldUpdate {
                    await MainActor.run {
                        self.setNeedsDisplay(self.bounds)
                    }
                }

                // Wait for next display cycle (60fps)
                try? await Task.sleep(for: .seconds(1.0 / 60.0))
            }
        }
    }

    func scheduleDisplayUpdate() {
        pendingUpdates = true
    }

    func suspendDisplayUpdates() {
        displayUpdateTask?.cancel()
        displayUpdateTask = nil
    }

    #if DEBUG
    private func logRenderingPerformance() async {
        let startTime = CFAbsoluteTimeGetCurrent()
        // ... rendering code ...
        let timeElapsed = CFAbsoluteTimeGetCurrent() - startTime
        if timeElapsed > 0.016 { // Log if frame takes longer than 60fps
            TerminalPerformanceLogger.log("Terminal rendering took \(timeElapsed) seconds")
        }
    }
    #endif
}

// MARK: - Performance Logging Utilities
#if DEBUG
enum TerminalPerformanceLogger {
    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    static func log(_ message: String) {
        print("[\(TerminalPerformanceLogger.timestamp)] 📊 \(message)")
    }
}
#endif
```

### Modern Memory Management with Swift Concurrency

```swift
@MainActor
class TerminalViewController: UIViewController {
    private var terminalView: TerminalView?
    private var termcastRecorder: TermcastRecorder?
    private var sshManager: SSHTerminalManager?

    // Task management for proper cleanup
    private var recordingTask: Task<Void, Never>?
    private var cleanupTask: Task<Void, Never>?

    deinit {
        // Clean up terminal resources with v1.5.0 enhancements
        Task { @MainActor in
            await performCleanup()
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)

        // Note: suspendDisplayUpdates() is internal in SwiftTerm and not publicly available
        // SwiftTerm automatically handles display updates based on view visibility
        // You don't need to manually suspend/resume display updates

        // Stop Termcast recording if active
        Task { @MainActor in
            await stopTermcastRecording()
        }

        // Disconnect active connections
        sshManager?.disconnect()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        // Note: startDisplayUpdates() is internal in SwiftTerm and not publicly available
        // SwiftTerm automatically handles display updates based on view visibility

        // Restart Termcast recording if needed
        if isRecording {
            Task { @MainActor in
                await startTermcastRecording()
            }
        }
    }

    // MARK: - Termcast Integration with Modern Concurrency

    private var isRecording = false

    func startTermcastRecording() async {
        guard let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            TerminalLogger.log("⚠️ Documents directory not found")
            return
        }

        let recordingURL = documentsPath.appendingPathComponent("session.cast")

        recordingTask = Task { [weak self] in
            guard let self = self else { return }

            do {
                self.termcastRecorder = TermcastRecorder(url: recordingURL)

                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
                    self.termcastRecorder?.startRecording { success, error in
                        if let error = error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume(returning: success)
                        }
                    }
                }

                await MainActor.run {
                    self.isRecording = true
                    self.updateRecordingUI()
                }

                TerminalLogger.log("✅ Termcast recording started")

            } catch {
                await MainActor.run {
                    TerminalLogger.log("❌ Failed to start recording: \(error.localizedDescription)")
                }
            }
        }
    }

    func stopTermcastRecording() async {
        recordingTask?.cancel()
        recordingTask = nil

        guard let recorder = termcastRecorder else { return }

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL?, Error>) in
                recorder.stopRecording { url, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: url)
                    }
                }
            }

            await MainActor.run {
                self.isRecording = false
                self.updateRecordingUI()
            }

            TerminalLogger.log("✅ Termcast recording stopped")

        } catch {
            await MainActor.run {
                TerminalLogger.log("❌ Failed to stop recording: \(error.localizedDescription)")
            }
        }

        termcastRecorder = nil
    }

    private func updateRecordingUI() {
        // Update UI to show recording status
        // Update navigation bar, status indicators, etc.
    }

    // MARK: - Cleanup Management

    private func performCleanup() async {
        // Cancel all ongoing tasks
        recordingTask?.cancel()
        recordingTask = nil

        cleanupTask?.cancel()
        cleanupTask = nil

        // Clean up terminal resources
        terminalView?.updateUiClosed()
        terminalView = nil

        // Clean up Termcast recorder if active
        if isRecording {
            await stopTermcastRecording()
        }

        // Disconnect active connections
        sshManager?.disconnect()
        sshManager = nil

        TerminalLogger.log("🧹 Terminal cleanup completed")
    }

    // MARK: - Actor Isolation for State Access

    private func updateTerminalState() async {
        // Capture state on MainActor first
        let currentState = await MainActor.run {
            guard let terminal = self.terminalView?.getTerminal() else {
                return (cols: 0, rows: 0, isConnected: false)
            }
            return (cols: terminal.cols, rows: terminal.rows, isConnected: self.sshManager?.isConnected ?? false)
        }

        // Use captured state safely
        TerminalLogger.log("Terminal state: \(currentState.cols)x\(currentState.rows), connected: \(currentState.isConnected)")
    }
}

// MARK: - Logging Utilities
enum TerminalLogger {
    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    static func log(_ message: String) {
        print("[\(TerminalLogger.timestamp)] \(message)")
    }
}
```

### Text Input Optimization

```swift
extension TerminalView {
    func optimizeTextInput() {
        // Note: keyboardType is read-only on TerminalView - cannot be set directly
        // TerminalView handles keyboard input internally

        // Disable unnecessary text input features
        autocapitalizationType = .none
        autocorrectionType = .no
        spellCheckingType = .no
        smartQuotesType = .no
        smartDashesType = .no
        smartInsertDeleteType = .no

        // Configure keyboard appearance
        keyboardAppearance = .dark
    }
}
```

## Accessibility

### VoiceOver Support

```swift
extension TerminalView {
    func configureAccessibility() {
        // Enable VoiceOver
        isAccessibilityElement = true
        accessibilityLabel = "Terminal"
        accessibilityHint = "Double tap to interact"

        // Configure accessibility traits
        // Note: .keyboardInterface does not exist in UIAccessibilityTraits
        accessibilityTraits = [.staticText]

        // Update accessibility when content changes
        func updateAccessibility() {
            // Note: terminal.buffer.lines is internal and cannot be accessed directly
            // For now, use a simple accessibility value
            // In the future, implement a custom method to get current line text if needed
            accessibilityValue = "Terminal output"
        }
    }
}
```

### System Theme Support (Dark/Light Mode)

```swift
extension TerminalView {
    /// Updates theme based on current system appearance
    /// Automatically follows system dark/light mode settings
    func updateTheme() {
        switch traitCollection.userInterfaceStyle {
        case .dark:
            configureDarkTheme()
        case .light:
            configureLightTheme()
        case .unspecified:
            configureLightTheme()  // Default to light theme
        @unknown default:
            configureLightTheme()
        }
    }

    /// Observes theme changes using iOS 17+ API when available
    /// Falls back to traitCollectionDidChange for iOS 16 and below
    func observeThemeChanges() {
        // For iOS 17+, register for trait changes using new API
        if #available(iOS 17.0, *) {
            registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changedView: Self, _: UITraitCollection) in
                changedView.updateTheme()
            }
        }
        // For iOS 16 and below, traitCollectionDidChange will handle theme updates
    }

    // For iOS 16 and below, use traitCollectionDidChange
    // Note: This method is deprecated in iOS 17.0 but still works for compatibility
    @available(iOS, deprecated: 17.0, message: "Use registerForTraitChanges for iOS 17+")
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)

        // Only handle trait changes on iOS 16 and below
        guard #unavailable(iOS 17.0) else { return }

        if let previous = previousTraitCollection,
           traitCollection.hasDifferentColorAppearance(comparedTo: previous) {
            updateTheme()
        }
    }
}
```

### Dynamic Type Support

```swift
extension TerminalViewController {
    func setupDynamicTypeSupport() {
        // Update font size when dynamic type changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleContentSizeCategoryChange),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
    }

    @objc private func handleContentSizeCategoryChange() {
        let fontSize = UIFont.preferredFont(forTextStyle: .body).pointSize
        terminalView.font = UIFont.terminalFont(ofSize: fontSize)

        // Update accessory view fonts
        if let accessory = terminalView.inputAccessoryView as? TerminalAccessory {
            accessory.updateFontsForDynamicType()
        }
    }
}
```

## Security Considerations

### Connection Security

```swift
class SecureSSHManager: SSHTerminalManager {
    func connectSecurely(to host: String, port: Int, username: String, password: String) {
        // Validate host and port
        guard isValidHost(host) && isValidPort(port) else {
            handleConnectionError("Invalid connection parameters")
            return
        }

        // Use secure authentication
        let authentication: AuthenticationChallenge
        if let sshKey = loadSSHKey() {
            authentication = .byPublicKey(username: username, key: sshKey)
        } else {
            authentication = .byPassword(username: username, password: password)
        }

        // Establish connection with security checks
        connectWithSecurityChecks(host: host, port: port, authentication: authentication)
    }

    private func isValidHost(_ host: String) -> Bool {
        // Implement host validation
        return !host.isEmpty && host.range(of: "^[a-zA-Z0-9.-]+$", options: .regularExpression) != nil
    }

    private func isValidPort(_ port: Int) -> Bool {
        return port > 0 && port <= 65535
    }
}
```

### Data Handling

```swift
extension TerminalView {
    func sanitizeInput(_ input: String) -> String {
        // Remove potentially dangerous control sequences
        var sanitized = input

        // Remove escape sequences that could affect terminal state
        sanitized = sanitized.replacingOccurrences(
            of: "\\x1b\\[[0-9;]*[mHJK]",
            with: "",
            options: .regularExpression
        )

        // Limit input length to prevent buffer overflow
        if sanitized.count > 1024 {
            sanitized = String(sanitized.prefix(1024))
        }

        return sanitized
    }
}
```

## Testing

### Unit Tests

```swift
import XCTest
@testable import SwiftTerm

class TerminalTests: XCTestCase {

    var terminalView: TerminalView!
    var testDelegate: TestTerminalDelegate!

    override func setUp() {
        super.setUp()
        terminalView = TerminalView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        testDelegate = TestTerminalDelegate()
        terminalView.terminalDelegate = testDelegate
    }

    override func tearDown() {
        terminalView = nil
        testDelegate = nil
        super.tearDown()
    }

    func testTerminalInitialization() {
        XCTAssertNotNil(terminalView.getTerminal())
        XCTAssertEqual(terminalView.getTerminal().cols, 40)
        XCTAssertEqual(terminalView.getTerminal().rows, 15)
    }

    func testTextInput() {
        let testText = "Hello, World!"
        terminalView.insertText(testText)

        // Verify text was processed
        XCTAssertEqual(testDelegate.receivedData?.count, testText.count)
    }

    func testKeyboardHandling() {
        // Test special key handling
        let upArrowKey = UIPress(key: .keyboardUpArrow)
        let presses = Set([upArrowKey])

        terminalView.pressesBegan(presses, with: nil)

        // Verify up arrow sequence was sent
        XCTAssertEqual(testDelegate.receivedData, EscapeSequences.moveUpNormal)
    }
}

class TestTerminalDelegate: TerminalViewDelegate {
    var receivedData: ArraySlice<UInt8>?

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        receivedData = data
    }

    // Implement other required delegate methods with empty implementations
    func scrolled(source: TerminalView, position: Double) {}
    func setTerminalTitle(source: TerminalView, title: String) {}
    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {}
    func bell(source: TerminalView) {}
    // ... other required methods
}
```

### UI Tests

```swift
import XCTest

class TerminalUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testTerminalInteraction() {
        // Test terminal view exists
        XCTAssertTrue(app.otherElements["TerminalView"].exists)

        // Test text input
        app/*@START_MENU_TOKEN@*/.textFields["Terminal Input"]/*[END_MENU_TOKEN@]*/.tap()
        app/*@START_MENU_TOKEN@*/.keys["H"]/*[END_MENU_TOKEN@]*/.tap()
        app/*@START_MENU_TOKEN@*/.keys["e"]/*[END_MENU_TOKEN@]*/.tap()
        app/*@START_MENU_TOKEN@*/.keys["l"]/*[END_MENU_TOKEN@]*/.tap()
        app/*@START_MENU_TOKEN@*/.keys["l"]/*[END_MENU_TOKEN@]*/.tap()
        app/*@START_MENU_TOKEN@*/.keys["o"]/*[END_MENU_TOKEN@]*/.tap()

        // Test accessory view buttons
        app.buttons["esc"].tap()
        app.buttons["ctrl"].tap()
        app.buttons["tab"].tap()
    }

    func testKeyboardAccessoryView() {
        // Test keyboard accessory view functionality
        app/*@START_MENU_TOKEN@*/.textFields["Terminal Input"]/*[END_MENU_TOKEN@]*/.tap()

        // Test arrow keys
        app.buttons["arrow.up"].tap()
        app.buttons["arrow.down"].tap()
        app.buttons["arrow.left"].tap()
        app.buttons["arrow.right"].tap()

        // Test function keys
        app.buttons["F1"].tap()
        app.buttons["F2"].tap()
    }
}
```

## Common Pitfalls and API Corrections

### Important API Corrections

Based on actual SwiftTerm implementation and compilation errors, here are critical corrections to common mistakes:

#### 1. `configureNativeColors()` Does Not Exist

**❌ Incorrect:**

```swift
        // Note: configureNativeColors() does not exist - configure colors manually
        terminalView.nativeForegroundColor = UIColor.label
        terminalView.nativeBackgroundColor = UIColor.systemBackground  // This method does not exist
```

**✅ Correct:**

```swift
// Configure colors manually
terminalView.nativeForegroundColor = UIColor.label
terminalView.nativeBackgroundColor = UIColor.systemBackground
```

#### 2. `UIColor.systemGray100` Does Not Exist

**❌ Incorrect:**

```swift
terminalView.nativeForegroundColor = UIColor.systemGray100  // Does not exist
```

**✅ Correct:**

```swift
// Use systemGray6 for dark theme (lighter gray with better contrast)
let foregroundColor = UIColor.systemGray6
terminalView.nativeForegroundColor = foregroundColor
```

#### 3. `TerminalOptions` Limited Parameters

**❌ Incorrect:**

```swift
terminal.options = TerminalOptions(
    cols: 80,
    rows: 24,
    cursorStyle: .blinkBlock,
    scrollback: 1000,
    allowTitleReporting: true,      // ❌ Does not exist
    allowMouseReporting: true,       // ❌ Does not exist
    mouseMode: .buttonTracking      // ❌ Does not exist
)
```

**✅ Correct:**

```swift
terminal.options = TerminalOptions(
    cols: 80,
    rows: 24,
    cursorStyle: .blinkBlock,
    scrollback: 1000,
    enableSixelReported: true  // ✅ Valid parameter for Sixel support
)
```

#### 4. `keyboardType` is Read-Only

**❌ Incorrect:**

```swift
terminalView.keyboardType = .asciiCapable  // ❌ Read-only property
```

**✅ Correct:**

```swift
// keyboardType is read-only - TerminalView handles it internally
// You can only configure other input properties:
terminalView.autocapitalizationType = .none
terminalView.autocorrectionType = .no
terminalView.keyboardAppearance = .dark
```

#### 5. `.keyboardInterface` Does Not Exist in UIAccessibilityTraits

**❌ Incorrect:**

```swift
accessibilityTraits = [.staticText, .keyboardInterface]  // ❌ .keyboardInterface does not exist
```

**✅ Correct:**

```swift
accessibilityTraits = [.staticText]  // ✅ Only valid traits
```

#### 6. Creating Italic Fonts - Wrong Syntax

**❌ Incorrect:**

```swift
let italicFont = normalFont.withSymbolicTraits(.traitItalic)  // ❌ Wrong syntax
```

**✅ Correct:**

```swift
var fontDescriptor = normalFont.fontDescriptor
let italicTraits = fontDescriptor.symbolicTraits.union(.traitItalic)
fontDescriptor = fontDescriptor.withSymbolicTraits(italicTraits) ?? fontDescriptor
let italicFont = UIFont(descriptor: fontDescriptor, size: fontSize)
```

#### 7. `terminal.buffer.lines` is Internal

**❌ Incorrect:**

```swift
let currentLine = terminal.buffer.lines[terminal.buffer.y]  // ❌ Internal property
let text = currentLine.map { String($0.code) }.joined()
```

**✅ Correct:**

```swift
// terminal.buffer.lines is internal - cannot access directly
// Use a simple accessibility value or implement custom method if needed
accessibilityValue = "Terminal output"
```

#### 8. `suspendDisplayUpdates()` and `startDisplayUpdates()` are Internal

**❌ Incorrect:**

```swift
terminalView.suspendDisplayUpdates()  // ❌ Internal method - not publicly available
terminalView.startDisplayUpdates()   // ❌ Internal method - not publicly available
```

**✅ Correct:**

```swift
// These methods are internal in SwiftTerm
// SwiftTerm automatically handles display updates based on view visibility
// You don't need to manually call these methods
```

#### 9. iOS 17+ Trait Collection Changes

**❌ Deprecated (iOS 17+):**

```swift
override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    // Deprecated in iOS 17.0 - generates warning
    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
        updateTheme()
    }
}
```

**✅ Correct (iOS 17+):**

```swift
// For iOS 17+, use registerForTraitChanges
if #available(iOS 17.0, *) {
    registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (changedView: Self, _: UITraitCollection) in
        changedView.updateTheme()
    }
}

// For iOS 16 and below, use traitCollectionDidChange
@available(iOS, deprecated: 17.0, message: "Use registerForTraitChanges for iOS 17+")
override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard #unavailable(iOS 17.0) else { return }

    if let previous = previousTraitCollection,
       traitCollection.hasDifferentColorAppearance(comparedTo: previous) {
        updateTheme()
    }
}
```

#### 10. Sixel Graphics Support

**❌ Incorrect:**

```swift
terminal.options.enableSixel = true  // ❌ Property does not exist
terminal.sixelImageHandler = { image in ... }  // ❌ Handler does not exist as public API
```

**✅ Correct:**

```swift
// Enable Sixel support
terminal.options.enableSixelReported = true

// SwiftTerm automatically renders Sixel images inline in the terminal
// No custom handlers needed - images are displayed automatically when Sixel sequences are received
```

#### 11. Hyperlink Support Configuration

**❌ Incorrect:**

```swift
terminalView.urlAttributes = [
    .underlineStyle: NSUnderlineStyle.single.rawValue,
    .foregroundColor: UIColor.systemBlue
]  // ❌ Wrong type - urlAttributes is [Attribute: [NSAttributedString.Key:Any]], not [NSAttributedString.Key:Any]
```

**✅ Correct:**

```swift
// Hyperlink support is automatic - no manual configuration needed
// SwiftTerm automatically detects and styles hyperlinks via OSC 8 escape sequences
// Implement requestOpenLink in TerminalViewDelegate to handle taps:

func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
    guard let url = URL(string: link) else { return }
    if UIApplication.shared.canOpenURL(url) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
```

#### 12. Main Actor Isolation in TerminalViewDelegate

**⚠️ Important:** `TerminalViewDelegate` methods are called from nonisolated context, but `TerminalViewModel` is `@MainActor`.

**✅ Correct:**

```swift
extension TerminalViewModel: TerminalViewDelegate {
    // Mark delegate methods as nonisolated
    nonisolated func send(source: TerminalView, data: ArraySlice<UInt8>) {
        Task { @MainActor [weak self] in
            self?.sendInput(Data(data))
        }
    }

    nonisolated func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            self.terminalSize = (cols: newCols, rows: newRows)
            // Send resize message...
        }
    }
}
```

## Common Pitfalls

### 1. Memory Leaks

**Problem:** Terminal views and connections not properly cleaned up.

**Solution:**

```swift
deinit {
    terminalView?.updateUiClosed()
    terminalView = nil
    shell?.disconnect()
    shell = nil
}
```

### 2. UI Thread Blocking

**Problem:** Large data chunks causing UI freezes.

**Solution:**

```swift
// Process data in chunks using modern Swift concurrency
func processIncomingData(_ data: Data) async {
    let chunkSize = 1024

    await withTaskGroup(of: Void.self) { group in
        for offset in stride(from: 0, to: data.count, by: chunkSize) {
            let end = min(offset + chunkSize, data.count)
            let chunk = data[offset..<end]

            group.addTask { [weak self] in
                await MainActor.run {
                    self?.terminalView.feed(byteArray: Array(chunk))
                }
            }
        }
    }
}

// Alternative: Sequential processing with cancellation support
func processIncomingDataSequential(_ data: Data) async {
    let chunkSize = 1024

    for offset in stride(from: 0, to: data.count, by: chunkSize) {
        // Check for cancellation
        try? Task.checkCancellation()

        let end = min(offset + chunkSize, data.count)
        let chunk = data[offset..<end]

        await MainActor.run {
            self.terminalView.feed(byteArray: Array(chunk))
        }

        // Small delay to prevent overwhelming the main thread
        try? await Task.sleep(for: .milliseconds(1))
    }
}
```

### 3. Keyboard Handling Issues

**Problem:** Keyboard not properly dismissing or resizing terminal view.

**Solution:**

```swift
override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    terminalView.resignFirstResponder()
}

override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)

    coordinator.animate(alongsideTransition: nil) { _ in
        self.terminalView.frame = CGRect(origin: .zero, size: size)
    }
}
```

### 4. Color Theme Issues

**Problem:** Colors not updating properly or looking inconsistent.

**Solution:**

```swift
func updateTheme(for traitCollection: UITraitCollection) {
    if traitCollection.userInterfaceStyle == .dark {
        configureDarkTheme()
    } else {
        configureLightTheme()
    }

    // Force redraw
    terminalView.setNeedsDisplay(terminalView.bounds)
}
```

### 5. iPhone Virtual Keyboard and UITextInput Buffer Issues

**Problem:** The iPhone virtual keyboard's Backspace key doesn't properly delete characters that were typed using the physical keyboard (Mac keyboard when using simulator, or external keyboard on real device).

**Root Cause:**

- SwiftTerm's TerminalView implements UITextInput protocol to support iOS keyboard
- When text is entered via the virtual keyboard, it goes into UITextInput's internal buffer
- When Backspace is pressed on the virtual keyboard, SwiftTerm first tries to delete from this buffer **before** sending the backspace character to the terminal
- Characters entered via physical keyboard bypass this buffer and go directly to the terminal
- This creates a disconnect: virtual keyboard Backspace only deletes buffered characters, not characters in the actual terminal

**Technical Details:**

```swift
// What happens when you type 'AAA' from Mac keyboard and 'BBB' from iPhone keyboard:

// Mac keyboard (physical):
// Input: 'A' -> Goes directly to terminal via TerminalView's text input handling
// Terminal buffer: "AAA"
// UITextInput buffer: (empty)

// iPhone keyboard (virtual):
// Input: 'B' -> Goes to UITextInput buffer first, then to terminal
// Terminal buffer: "AAABBB"
// UITextInput buffer: "BBB"

// Backspace from iPhone keyboard:
// First deletes from UITextInput buffer: "BBB" -> "BB" -> "B" -> (empty)
// Only AFTER buffer is empty does it start sending backspace to terminal
// Result: Can't delete 'AAA' without clearing 'BBB' first
```

**Symptoms:**

- Backspace from virtual keyboard deletes characters entered from virtual keyboard
- Backspace from virtual keyboard does NOT delete characters entered from physical keyboard
- Physical keyboard Backspace works correctly for all characters
- Control+H from virtual keyboard works correctly (bypasses UITextInput buffer)

**Solution: Complete Custom Keyboard (Production-Ready)**

The recommended solution is a **complete custom keyboard replacement** using SwiftUI views embedded as `inputView`. This approach is used by all professional terminal apps (Blink Shell, Termius, iSH).

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│              TerminalCustomKeyboardView (SwiftUI)                │
│  • Main keyboard container with state management                 │
│  • Handles layout switching (letters ↔ symbols)                  │
│  • Manages modifier key states (Ctrl, Alt, Shift)                │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Layout Components                               │
│  • TerminalLettersKeyboardView: QWERTY letter layout             │
│  • TerminalSymbolsKeyboardView: Symbols and numbers              │
│  • TerminalModifierRow: Ctrl, Alt, Tab, Esc, arrows              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              TerminalKeyboardHostingController                   │
│  • UIHostingController wrapper for SwiftUI keyboard              │
│  • Bridges SwiftUI to UIKit inputView system                     │
│  • Handles delegate callbacks to TerminalViewUIKit               │
└─────────────────────────────────────────────────────────────────┘
```

**Key Implementation:**

```swift
// Main SwiftUI keyboard view
struct TerminalCustomKeyboardView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var showSymbols = false
    @State private var isCtrlActive = false
    @State private var isAltActive = false
    @State private var isShiftActive = false

    weak var delegate: TerminalCustomKeyboardDelegate?

    var body: some View {
        VStack(spacing: 8) {
            // Modifier row (always visible): Esc, Ctrl, Alt, Tab, arrows
            TerminalModifierRow(...)

            // Main keyboard area (switches between layouts)
            if showSymbols {
                TerminalSymbolsKeyboardView(...)
            } else {
                TerminalLettersKeyboardView(...)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 8)
        .background(colorScheme == .dark ? Color.black : Color(uiColor: .systemGray6))
    }
}
```

**UIKit Integration:**

```swift
// Hosting controller bridges SwiftUI to UIKit
class TerminalKeyboardHostingController: UIHostingController<TerminalCustomKeyboardView> {
    weak var keyboardDelegate: TerminalCustomKeyboardDelegate?

    init() {
        let keyboardView = TerminalCustomKeyboardView()
        super.init(rootView: keyboardView)
        rootView.delegate = self
    }
}

// In TerminalViewUIKit, set as inputView:
private func setupCustomKeyboard() {
    let hostingController = TerminalKeyboardHostingController()
    hostingController.keyboardDelegate = self
    terminalView.inputView = hostingController.view
    terminalView.reloadInputViews()
}
```

**Delegate Pattern:**

```swift
protocol TerminalCustomKeyboardDelegate: AnyObject {
    func customKeyboardDidSendInput(_ bytes: [UInt8])
    func customKeyboardDidRequestDismiss()
}

// Implementation bypasses UITextInput completely
extension TerminalViewUIKit: TerminalCustomKeyboardDelegate {
    func customKeyboardDidSendInput(_ bytes: [UInt8]) {
        // Send directly to terminal, bypassing UITextInput buffer
        terminalDelegate?.send(source: terminalView, data: bytes[...])
    }
}
```

**Control Code Generation:**

```swift
func sendKey(_ key: String) {
    var bytes: [UInt8] = []

    if isCtrlActive {
        // Ctrl+letter produces control code (A=1, B=2, C=3, etc.)
        if let char = key.uppercased().first,
           let ascii = char.asciiValue,
           ascii >= 65 && ascii <= 90 {
            bytes = [UInt8(ascii - 64)]
        }
    } else {
        bytes = Array(key.utf8)
    }

    delegate?.customKeyboardDidSendInput(bytes)
}

// Special key escape sequences
func sendBackspace() { delegate?.customKeyboardDidSendInput([0x08]) }  // Control-H
func sendTab() { delegate?.customKeyboardDidSendInput([0x09]) }
func sendEnter() { delegate?.customKeyboardDidSendInput([0x0D]) }
func sendEscape() { delegate?.customKeyboardDidSendInput([0x1B]) }
func sendArrowUp() { delegate?.customKeyboardDidSendInput([0x1B, 0x5B, 0x41]) }  // ESC[A
func sendArrowDown() { delegate?.customKeyboardDidSendInput([0x1B, 0x5B, 0x42]) }  // ESC[B
func sendArrowRight() { delegate?.customKeyboardDidSendInput([0x1B, 0x5B, 0x43]) }  // ESC[C
func sendArrowLeft() { delegate?.customKeyboardDidSendInput([0x1B, 0x5B, 0x44]) }  // ESC[D
```

**Escape Sequences Reference:**

| Key         | Sequence         | Description                           |
| ----------- | ---------------- | ------------------------------------- |
| Backspace   | `0x08`           | Control-H (proper terminal backspace) |
| Tab         | `0x09`           | Horizontal tab                        |
| Enter       | `0x0D`           | Carriage return                       |
| Escape      | `0x1B`           | Escape character                      |
| Arrow Up    | `0x1B 0x5B 0x41` | ESC[A                                 |
| Arrow Down  | `0x1B 0x5B 0x42` | ESC[B                                 |
| Arrow Right | `0x1B 0x5B 0x43` | ESC[C                                 |
| Arrow Left  | `0x1B 0x5B 0x44` | ESC[D                                 |
| Ctrl+C      | `0x03`           | Interrupt signal (SIGINT)             |
| Ctrl+D      | `0x04`           | End of transmission (EOF)             |
| Ctrl+Z      | `0x1A`           | Suspend signal (SIGTSTP)              |

**Why Custom Keyboard is Essential:**

1. **Solves Root Cause**: Bypasses UITextInput buffer entirely
2. **Terminal-Specific Keys**: Easy access to Esc, Tab, Ctrl, Alt, arrows
3. **Proper Control Codes**: Ctrl+C, Ctrl+Z work correctly for signals
4. **Industry Standard**: All professional terminal apps use this approach
5. **Reliable Behavior**: No unexpected buffer-related issues
6. **Visual Polish**: Professional appearance matching iOS design

**References:**

- Blink Shell: Uses custom keyboard with excellent terminal-specific layout
- Termius: Professional custom keyboard for SSH/terminal
- iSH: Custom keyboard optimized for Linux shell commands

**Important:** This is a fundamental limitation of using standard iOS keyboard with terminal applications. For production terminal apps, implementing a custom keyboard is **essential**, not optional.

### 5. Font Rendering Issues

**Problem:** Fonts not displaying correctly or causing layout issues.

**Solution:**

```swift
func setupFont() {
    let font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
    terminalView.font = font

    // Ensure font dimensions are properly calculated
    let cellDimension = terminalView.cellDimension
    print("Cell width: \(cellDimension.width), height: \(cellDimension.height)")
}
```

## Advanced Features

### Sixel Graphics Support

```swift
extension TerminalView {
    func enableSixelGraphics() {
        let terminal = getTerminal()

        // Enable Sixel support in terminal options
        // Note: There is no enableSixel property - use enableSixelReported
        terminal.options.enableSixelReported = true

        // Note: terminal.sixelImageHandler does not exist as a public API
        // SwiftTerm automatically renders Sixel images inline in the terminal
        // Images are displayed automatically when Sixel sequences are received
        // No additional configuration or handlers needed
    }
}
```

**Important Notes:**

- SwiftTerm automatically handles Sixel image rendering when `enableSixelReported` is `true`
- Images are displayed inline in the terminal output
- No custom image handlers or overlay views are needed
- Sixel images are rendered as part of the terminal buffer

### Hyperlink Support

```swift
extension TerminalView {
    func enableHyperlinkSupport() {
        // Hyperlink support is enabled by default in SwiftTerm
        // URLs are automatically detected when applications emit OSC 8 escape sequences
        // SwiftTerm automatically styles hyperlinks with underline and appropriate colors

        // Note: urlAttributes is a dictionary of type [Attribute: [NSAttributedString.Key:Any]]
        // It is used internally by SwiftTerm - you don't need to configure it manually
        // Hyperlinks are automatically styled when detected
    }
}

// Implement TerminalViewDelegate.requestOpenLink to handle hyperlink taps
extension YourViewController: TerminalViewDelegate {
    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        guard let url = URL(string: link) else { return }

        // Open URL in Safari or default browser
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }
}
```

**Important Notes:**

- Hyperlink support is automatic - no manual configuration needed
- SwiftTerm detects hyperlinks via OSC 8 escape sequences
- Implement `requestOpenLink` in your `TerminalViewDelegate` to handle taps
- Don't manually configure `urlAttributes` - SwiftTerm handles it internally

## Conclusion

SwiftTerm provides a robust foundation for building terminal applications on iOS. By following these best practices, you can create applications that are:

- **Performant**: Optimized for smooth rendering and responsive user interaction
- **Accessible**: Compatible with VoiceOver and dynamic type
- **Secure**: Properly handles connections and data sanitization
- **User-friendly**: Intuitive interface following iOS design guidelines
- **Maintainable**: Clean architecture with proper separation of concerns

Remember to always test your implementation thoroughly on actual iOS devices, as simulator behavior may differ from real-world scenarios.

## Version 1.5.0 New Features

SwiftTerm 1.5.0 introduces several enhancements for iOS applications:

### visionOS Support

- Added visionOS platform support alongside iOS and macOS
- Updated platform availability to include `.visionOS(.v1)`
- Cross-platform rendering optimizations

### Termcast Integration

- Built-in terminal session recording and playback
- Compatible with asciinema format for easy sharing
- Command-line tools for session management

### Enhanced Image Handling

- Improved `TTImage` protocol for better cross-platform compatibility
- Sixel graphics rendering enhancements
- iTerm2-style graphic rendering support

### Performance Improvements

- Optimized memory management for long-running sessions
- Improved text rendering performance
- Better handling of large terminal buffers

### Accessibility Enhancements

- Improved VoiceOver support
- Better dynamic type handling
- Enhanced cursor visibility options

## Real-World Application Best Practices

Based on analysis of production applications using SwiftTerm, here are specific best practices from each project:

### SwiftTermApp (Official Sample) Best Practices

**Key Insights:**

- **Metal Background Integration**: Uses CAMetalLayer for animated backgrounds with proper lifecycle management
- **Dynamic Font Scaling**: Implements pinch-to-zoom with user override detection
- **Theme System**: Reactive theme changes using Combine publishers
- **SSH Connection Management**: Sophisticated session handling with tmux support

**Implementation Patterns:**

```swift
// 1. Reactive Theme Management with Combine
class AppTerminalView: TerminalView {
    var themeChange: AnyCancellable?

    init(frame: CGRect, host: Host) {
        super.init(frame: frame)

        themeChange = settings.$themeName.sink { [weak self] _ in
            guard let self = self else { return }
            if self.useSharedTheme {
                self.applyTheme(theme: settings.getTheme())
            }
        }
    }
}

// 2. Metal Background Integration
func updateBackground(background: String) {
    if background == "" {
        // Remove metal layer
        metalHost?.stopRunning()
        metalLayer?.removeFromSuperlayer()
        metalHost = nil
    } else {
        // Setup metal layer
        if metalLayer == nil {
            metalLayer = CAMetalLayer()
            metalLayer!.frame = frame
            if let mySuper = superview {
                mySuper.layer.insertSublayer(metalLayer!, at: 0)
            }
        }
        metalHost = MetalHost(target: metalLayer!, fragmentName: background)
        metalHost!.startRunning()
        backgroundColor = UIColor.clear
    }
}

// 3. Pinch-to-Zoom with User Override
@objc func pinchHandler(_ gestureRecognizer: UIPinchGestureRecognizer) {
    if gestureRecognizer.state == .began || gestureRecognizer.state == .changed {
        let new = font.pointSize * gestureRecognizer.scale
        gestureRecognizer.scale = 1.0

        if new < 5 || new > 72 { return }

        if let uifont = UIFont(name: settings.fontName, size: new) {
            userOverrideSize = true  // Prevent global changes
            font = uifont
        }
    }
}

// 4. Chunked Data Processing for Performance
nonisolated func channelReader(channel: Channel, data: Data?, error: Data?, eof: Bool) {
    if let d = data {
        let sliced = Array(d)[0...]
        let blocksize = 1024
        var next = 0
        let last = sliced.endIndex

        while next < last {
            let end = min(next + blocksize, last)
            let chunk = sliced[next..<end]

            DispatchQueue.main.sync {
                self.feed(byteArray: chunk)
            }
            next = end
        }
    }
}
```

**Best Practices from SwiftTermApp:**

1. **Memory Management**: Proper cleanup of Metal resources and SSH connections
2. **Error Handling**: Comprehensive error reporting with user-friendly messages
3. **Session Restoration**: Advanced tmux session management with reconnection logic
4. **Performance**: Chunked data processing to prevent UI blocking
5. **Accessibility**: VoiceOver support and dynamic type handling

### Citadel (SSH Framework) Best Practices

**Key Insights:**

- **SwiftNIO Integration**: Modern async/await networking with proper resource management
- **Modular Architecture**: Clean separation between SSH protocol and terminal handling
- **Security-First**: Proper key management and authentication handling

**Implementation Patterns:**

```swift
// 1. Async SSH Connection with SwiftNIO
class CitadelTerminalController: NSObject, TerminalViewDelegate {
    private var client: CitadelClient?

    func connectToHost(_ host: String, port: Int) async {
        do {
            client = try CitadelClient()
            client?.delegate = self

            // Async connection with proper error handling
            try await client?.connect(to: host, port: port)

            // Set up terminal channel
            let channel = try await client?.openTerminalChannel(
                term: "xterm-256color",
                cols: 80,
                rows: 24
            )

            // Start shell
            try await channel?.startShell()

        } catch {
            await MainActor.run {
                self.handleConnectionError(error)
            }
        }
    }
}

// 2. Proper Resource Cleanup
deinit {
    Task {
        try await client?.disconnect()
        client = nil
    }
}

// 3. Terminal Size Change Handling
func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
    Task {
        try await client?.resizeTerminal(cols: newCols, rows: newRows)
    }
}
```

**Best Practices from Citadel:**

1. **Modern Concurrency**: Use async/await for all network operations
2. **Error Propagation**: Proper error handling through the call chain
3. **Resource Management**: Automatic cleanup on deinit
4. **Protocol Design**: Clean delegate patterns for terminal events

### Pisth (SSH Client) Best Practices

**Key Insights:**

- **WebKit Integration**: Uses WKWebView for terminal rendering with custom interactions
- **Context Menus**: Sophisticated context menu system for terminal operations
- **File Management**: Integrated SFTP file browser alongside terminal

**Implementation Patterns:**

```swift
// 1. WebKit-based Terminal with Custom Interactions
class TerminalWebView: WKWebView, UIGestureRecognizerDelegate, UIContextMenuInteractionDelegate {
    var terminal: TerminalViewController?

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)

        // Setup gesture recognizers
        if #available(iOS 13.0, *) {
            addInteraction(UIContextMenuInteraction(delegate: self))
        } else {
            longPress = UILongPressGestureRecognizer(target: self, action: #selector(showMenu_(_:)))
            addGestureRecognizer(longPress)
        }

        tap = UITapGestureRecognizer(target: self, action: #selector(toggleKeyboard_))
        addGestureRecognizer(tap)
    }
}

// 2. Context Menu Configuration
@available(iOS 13.0, *)
func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
    return UIContextMenuConfiguration(identifier: nil, previewProvider: {
        // Create preview of terminal content
        let vc = UIViewController()
        let imageView = UIImageView()
        imageView.image = imageWithView(view: self)
        vc.view = imageView
        return vc
    }) { _ -> UIMenu? in
        let items = [
            UIAction(title: "Paste", image: UIImage(systemName: "doc.on.clipboard")) { _ in
                self.terminal?.pasteText()
            },
            UIAction(title: "Selection Mode", image: UIImage(systemName: "selection.pin.in.out")) { _ in
                self.terminal?.selectionMode()
            }
        ]
        return UIMenu(title: "", children: items)
    }
}

// 3. Gesture Recognition Coordination
func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    if (gestureRecognizer == tap && otherGestureRecognizer == longPress) ||
       (gestureRecognizer == longPress && otherGestureRecognizer == tap) {
        return false
    }
    return true
}
```

**Best Practices from Pisth:**

1. **User Experience**: Rich context menus and gesture support
2. **Visual Feedback**: Preview functionality in context menus
3. **Accessibility**: Proper gesture coordination and VoiceOver support
4. **Integration**: Seamless file browser and terminal integration

### CodeEdit (IDE with Terminal) Best Practices

**Key Insights:**

- **SwiftUI Integration**: Modern NSViewRepresentable wrapper for SwiftTerm
- **Theme System**: Sophisticated theme integration with IDE-wide theming
- **Terminal Caching**: Advanced caching system for terminal state preservation
- **Multi-Mode Support**: Support for both shell sessions and active tasks

**Implementation Patterns:**

```swift
// 1. SwiftUI Integration with Caching
struct TerminalEmulatorView: NSViewRepresentable {
    private let terminalID: UUID
    @StateObject private var themeModel: ThemeModel = .shared

    func makeNSView(context: Context) -> CELocalShellTerminalView {
        let view: CELocalShellTerminalView

        // Check cache first
        let isCached = TerminalCache.shared.getTerminalView(terminalID) != nil
        view = TerminalCache.shared.getTerminalView(terminalID) ?? CELocalShellTerminalView(frame: .zero)

        if !isCached {
            view.startProcess(workspaceURL: url, shell: shellType)
            configureView(view)
        }

        view.processDelegate = context.coordinator
        TerminalCache.shared.cacheTerminalView(for: terminalID, view: view)
        return view
    }
}

// 2. Advanced Theme Integration
private var colors: [SwiftTerm.Color] {
    if let selectedTheme = Settings[\.theme].matchAppearance && Settings[\.terminal].darkAppearance
        ? themeModel.selectedDarkTheme
        : themeModel.selectedTheme,
       let index = themeModel.themes.firstIndex(of: selectedTheme) {
        return themeModel.themes[index].terminal.ansiColors.map { color in
            SwiftTerm.Color(hex: color)
        }
    }
    return []
}

// 3. Terminal Configuration with Theme Support
func configureView(_ terminal: CELocalShellTerminalView) {
    terminal.getTerminal().silentLog = true
    terminal.appearance = colorAppearance
    terminal.font = font
    terminal.installColors(self.colors)
    terminal.caretColor = cursorColor.withAlphaComponent(0.5)
    terminal.selectedTextBackgroundColor = selectionColor
    terminal.nativeForegroundColor = textColor
    terminal.nativeBackgroundColor = terminalSettings.useThemeBackground ? backgroundColor : .clear
    terminal.cursorStyleChanged(source: terminal.getTerminal(), newStyle: getTerminalCursor())
    terminal.optionAsMetaKey = optionAsMeta
}

// 4. Coordinator Pattern for Delegate Handling
final class Coordinator: NSObject, CELocalShellTerminalViewDelegate {
    func setTerminalTitle(source: CETerminalView, title: String) {
        onTitleChange(title)
    }

    func processTerminated(source: TerminalView, exitCode: Int32?) {
        guard let exitCode else { return }
        if case .shell = mode {
            source.feed(text: "Exit code: \(exitCode)\n\r\n")
            source.feed(text: "To open a new session, create a new terminal tab.")
            TerminalCache.shared.removeCachedView(terminalID)
        }
    }
}
```

**Best Practices from CodeEdit:**

1. **State Management**: Sophisticated caching system for terminal state
2. **Theme Integration**: Deep integration with IDE-wide theming system
3. **SwiftUI Patterns**: Modern SwiftUI integration with proper coordinator patterns
4. **Resource Management**: Efficient terminal lifecycle management

### TerminalEmulator (Educational) Best Practices

**Key Insights:**

- **Simplicity**: Clean, straightforward SwiftUI implementation
- **Educational Focus**: Clear separation of concerns for learning
- **Modern SwiftUI**: Uses latest SwiftUI patterns and modifiers

**Implementation Patterns:**

```swift
// 1. Simple SwiftUI Terminal Structure
struct TerminalView: View {
    @State private var input: String = ""
    @State private var output: String = ""
    @State private var prompt: String = ""

    var body: some View {
        VStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading) {
                        Text(output)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .foregroundColor(.green)
                            .font(.custom("JetBrainsMono-Regular", size: 12))

                        Color.clear
                            .frame(height: 1)
                            .id("BOTTOM")
                    }
                }
                .onChange(of: output) {
                    withAnimation {
                        proxy.scrollTo("BOTTOM", anchor: .bottom)
                    }
                }
            }

            HStack {
                Text(prompt)
                    .foregroundColor(.green)
                    .font(.custom("JetBrainsMono-Regular", size: 12))

                TextField("", text: $input, onCommit: runCommand)
                    .textFieldStyle(.plain)
                    .foregroundColor(.green)
                    .background(Color.clear)
                    .font(.custom("JetBrainsMono-Regular", size: 12))
            }
        }
        .padding()
        .onAppear {
            prompt = getPrompt()
        }
    }
}

// 2. Command Execution Pattern
func runCommand() {
    guard !input.isEmpty else { return }

    let result = executeShellCommand(input)
    prompt = getPrompt()
    output += "\(prompt) \(input)\n\(result)\n"
    input = ""
}

// 3. Dynamic Prompt Generation
func getPrompt() -> String {
    let username = NSUserName()
    let hostname = Host.current().localizedName ?? "Unknown Host"
    let path = FileManager.default.currentDirectoryPath
    let shortpath = path.replacingOccurrences(of: NSHomeDirectory(), with: "~")

    return "\(username)@\(hostname) \(shortpath) %"
}
```

**Best Practices from TerminalEmulator:**

1. **Simplicity**: Clean, readable code structure
2. **Modern SwiftUI**: Uses latest SwiftUI patterns and modifiers
3. **User Experience**: Smooth scrolling with animation
4. **Educational Value**: Clear separation of concerns for learning

## Cross-Application Best Practices Summary

### Common Patterns Across All Applications

1. **Resource Management**

   ```swift
   deinit {
       terminalView?.updateUiClosed()
       terminalView = nil
       // Clean up connections, metal layers, etc.
   }
   ```

2. **Error Handling**

   ```swift
   func handleConnectionError(_ error: Error) {
       DispatchQueue.main.async {
           let alert = UIAlertController(title: "Connection Error",
                                     message: error.localizedDescription,
                                     preferredStyle: .alert)
           self.present(alert, animated: true)
       }
   }
   ```

3. **Theme Integration**

   ```swift
   func applyTheme(_ theme: Theme) {
       terminalView.nativeForegroundColor = theme.foreground
       terminalView.nativeBackgroundColor = theme.background
       terminalView.selectedTextBackgroundColor = theme.selection
       terminalView.caretColor = theme.cursor
   }
   ```

4. **Performance Optimization**
   ```swift
   // Chunked data processing
   let chunkSize = 1024
   for offset in stride(from: 0, to: data.count, by: chunkSize) {
       let end = min(offset + chunkSize, data.count)
       let chunk = data[offset..<end]

       DispatchQueue.main.async {
           self.terminalView.feed(byteArray: Array(chunk))
       }
   }
   ```

### Architecture Recommendations

1. **Separation of Concerns**: Separate terminal view, connection management, and UI logic
2. **Delegate Patterns**: Use proper delegate patterns for terminal events
3. **State Management**: Use Combine, SwiftUI, or custom state management for complex applications
4. **Resource Cleanup**: Implement proper cleanup in deinit and view lifecycle methods

### User Experience Best Practices

1. **Responsive Design**: Handle device rotation and size changes properly
2. **Accessibility**: Implement VoiceOver support and dynamic type
3. **Performance**: Use chunked processing and background queues
4. **Error Recovery**: Provide clear error messages and recovery options

## Swift Development Best Practices

### Modern Swift Concurrency Patterns

SwiftTerm integration should follow modern Swift concurrency patterns for optimal performance and maintainability. These patterns are **mandatory** for all async operations.

#### 1. Task-Based Periodic Operations (Not Timer)

**❌ Anti-Pattern:**

```swift
// DON'T: Timer requires RunLoop and doesn't work well in async contexts
private var pingTimer: Timer?

func startHeartbeat() {
    pingTimer = Timer.scheduledTimer(withTimeInterval: 20.0, repeats: true) { [weak self] _ in
        self?.sendPing()
    }
}
```

**✅ Best Practice:**

```swift
// DO: Use Task.sleep for periodic operations in async contexts
private var pingTask: Task<Void, Never>?

func startHeartbeat() {
    pingTask = Task { [weak self] in
        guard let self = self else { return }

        // Initial delay before first periodic ping
        try? await Task.sleep(for: .seconds(self.pingInterval))

        // Periodic loop
        while !Task.isCancelled {
            // Check connection state on MainActor before sending
            let shouldContinue = await MainActor.run {
                guard self.isConnected else { return false }
                return true
            }

            guard shouldContinue else { break }

            // Send ping
            await self.sendPing()

            // Wait for next interval
            try? await Task.sleep(for: .seconds(self.pingInterval))
        }
    }
}

func stopHeartbeat() {
    pingTask?.cancel()
    pingTask = nil
}
```

#### 2. Actor Isolation for State Access

**❌ Anti-Pattern:**

```swift
// DON'T: Accessing MainActor-isolated properties from non-isolated context
private func sendPing() async {
    guard isConnected, let task = webSocketTask else { return } // ❌ Data race warning
    // ...
}
```

**✅ Best Practice:**

```swift
// DO: Access state on MainActor, then use the captured values
private func sendPing() async {
    // Capture state on MainActor first
    let canSend = await MainActor.run {
        guard self.isConnected, let task = self.webSocketTask, task.state == .running else {
            return false
        }
        return true
    }

    guard canSend else { return }

    // Now use the captured state safely
    // ...
}
```

#### 3. Connection State Management

**❌ Anti-Pattern:**

```swift
// DON'T: Multiple simultaneous connection attempts
func connect() async throws {
    // No guard against concurrent calls
    webSocketTask = urlSession.webSocketTask(with: url)
    // ...
}
```

**✅ Best Practice:**

```swift
// DO: Prevent multiple simultaneous attempts
private var isConnecting = false
private var isReconnecting = false

func connect() async throws {
    // Prevent concurrent connection attempts
    guard !isConnecting, !isReconnecting, !isConnected else {
        WebSocketClient.log("⚠️ WebSocket: Connection already in progress or connected")
        return
    }

    isConnecting = true
    defer { isConnecting = false }

    do {
        // Connection logic...
        isConnecting = false
    } catch {
        isConnecting = false
        throw error
    }
}
```

#### 4. Task Cancellation and Cleanup

**✅ Best Practice:**

```swift
// Always track tasks and cancel them properly
private var pingTask: Task<Void, Never>?
private var listenTask: Task<Void, Never>?

func disconnect() {
    // Cancel all tasks
    pingTask?.cancel()
    pingTask = nil
    listenTask?.cancel()
    listenTask = nil

    // Clean up resources
    webSocketTask?.cancel()
    webSocketTask = nil
}

// In task loops, always check cancellation
while !Task.isCancelled {
    // Work...
    try? await Task.sleep(for: .seconds(interval))
}
```

#### 5. Static Logging Utilities

**✅ Best Practice:**

```swift
// DO: Use static methods for logging utilities
final class WebSocketClient {
    private static var timestamp: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    private static func log(_ message: String) {
        print("[\(WebSocketClient.timestamp)] \(message)")
    }

    // Usage throughout the class
    private func connect() async throws {
        WebSocketClient.log("🔌 WebSocket: Connecting to \(url)")
        // ...
    }
}
```

#### 6. Sendable Safety in Task Groups

**❌ Anti-Pattern:**

```swift
// DON'T: Passing non-Sendable types through TaskGroup
let result = try await withThrowingTaskGroup(of: [String: Any].self) { group in
    // ❌ [String: Any] is not Sendable
}
```

**✅ Best Practice:**

```swift
// DO: Use Sendable types (Data) in TaskGroup, parse after
let result = try await withThrowingTaskGroup(of: Data.self) { group in
    group.addTask {
        let wsMessage = try await task.receive()
        // Convert to Data (which is Sendable)
        switch wsMessage {
        case .string(let text):
            return text.data(using: .utf8) ?? Data()
        case .data(let data):
            return data
        }
    }

    // Wait for result
    guard let messageData = try await group.next() else {
        throw WebSocketError.connectionClosed
    }

    // Parse JSON on current actor (not in TaskGroup)
    guard let dict = try? JSONSerialization.jsonObject(with: messageData) as? [String: Any] else {
        throw WebSocketError.invalidMessage
    }

    return dict
}
```

## Additional Resources

- [SwiftTerm GitHub Repository](https://github.com/migueldeicaza/SwiftTerm)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [iOS Accessibility Guidelines](https://developer.apple.com/accessibility/ios/)
- [Swift Package Manager Documentation](https://swift.org/package-manager/)
- [Termcast Documentation](https://github.com/migueldeicaza/SwiftTerm#termcast---terminal-recording-and-playback)
- [SwiftTerm Usage Examples](https://github.com/migueldeicaza/SwiftTerm/blob/main/swiftterm-examples.md)
- [Awesome Terminal Emulators](https://github.com/cdeleon/awesome-terminals) - Comprehensive list of terminal emulators
- [Swift Forums](https://forums.swift.org/) - Community support and discussions
- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html)
- [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)

---

_This guide is based on SwiftTerm version 1.5.0 and iOS development best practices as of 2024. Always refer to the latest documentation for updates._

## visionOS Development Guide (v1.5.0)

SwiftTerm 1.5.0 introduces native visionOS support, enabling developers to create terminal applications for Apple Vision devices. This section provides specific guidance for visionOS development.

### visionOS-Specific Considerations

#### 1. Spatial Interface Design

```swift
@available(visionOS 1.0, *)
struct VisionOSTerminalContainer: View {
    @StateObject private var terminalController = VisionOSTerminalController()

    var body: some View {
        VStack(spacing: 0) {
            // Terminal view with spatial optimizations
            TerminalRepresentable(terminalController: terminalController)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .focusable()
                .onAppear {
                    terminalController.setupTerminal()
                }

            // Spatial-specific controls
            HStack {
                SpatialControlButton("Keyboard", action: toggleKeyboard)
                SpatialControlButton("Mouse", action: toggleMouseMode)
                SpatialControlButton("Record", action: toggleRecording)
            }
            .padding()
        }
        .onDisappear {
            terminalController.cleanupTerminal()
        }
    }

    private func toggleKeyboard() {
        // Toggle keyboard input for spatial interaction
    }

    private func toggleMouseMode() {
        // Toggle mouse reporting for spatial gestures
    }

    private func toggleRecording() {
        // Start/stop Termcast recording
    }
}
```

#### 2. Spatial Gesture Handling

```swift
@available(visionOS 1.0, *)
class VisionOSTerminalController: NSObject, ObservableObject, TerminalViewDelegate {
    var terminalView: TerminalView!

    func setupTerminal() {
        terminalView = TerminalView(frame: CGRect(width: 800, height: 600))
        // Note: configureNativeColors() does not exist - configure colors manually
        terminalView.nativeForegroundColor = UIColor.label
        terminalView.nativeBackgroundColor = UIColor.systemBackground
        terminalView.font = UIFont.monospacedSystemFont(ofSize: 18, weight: .regular)

        // Configure for spatial computing
        setupSpatialFeatures()
        setupSpatialGestures()
    }

    private func setupSpatialFeatures() {
        let terminal = terminalView.getTerminal()

        // Optimize for spatial viewing
        terminal.options.rows = 30
        terminal.options.cols = 100

        // Enable spatial-specific features
        terminal.options.enableSixel = true
        terminal.options.mouseMode = .buttonTracking

        // Configure colors for spatial environment
        terminalView.nativeBackgroundColor = UIColor.systemBackground.withAlphaComponent(0.9)
        terminalView.nativeForegroundColor = UIColor.label
    }

    private func setupSpatialGestures() {
        // Configure spatial gesture recognizers
        let pinchGesture = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        terminalView.addGestureRecognizer(pinchGesture)

        let rotateGesture = UIRotationGestureRecognizer(target: self, action: #selector(handleRotate(_:)))
        terminalView.addGestureRecognizer(rotateGesture)

        let spatialTapGesture = UITapGestureRecognizer(target: self, action: #selector(handleSpatialTap(_:)))
        spatialTapGesture.numberOfTapsRequired = 1
        terminalView.addGestureRecognizer(spatialTapGesture)
    }

    @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
        // Handle pinch gestures for zooming
        if gesture.state == .changed {
            let scale = gesture.scale
            adjustTerminalFontSize(scale: scale)
            gesture.scale = 1.0
        }
    }

    @objc private func handleRotate(_ gesture: UIRotationGestureRecognizer) {
        // Handle rotation gestures for orientation
        if gesture.state == .changed {
            let rotation = gesture.rotation
            adjustTerminalOrientation(rotation: rotation)
            gesture.rotation = 0.0
        }
    }

    @objc private func handleSpatialTap(_ gesture: UITapGestureRecognizer) {
        // Handle spatial taps for interaction
        let location = gesture.location(in: terminalView)
        handleTerminalInteraction(at: location)
    }

    private func adjustTerminalFontSize(scale: CGFloat) {
        let currentFont = terminalView.font
        let newSize = currentFont.pointSize * scale
        terminalView.font = UIFont.terminalFont(ofSize: newSize)
    }

    private func adjustTerminalOrientation(rotation: CGFloat) {
        // Handle terminal orientation changes
    }

    private func handleTerminalInteraction(at location: CGPoint) {
        // Handle spatial interaction with terminal
    }
}
```

#### 3. visionOS Accessibility

```swift
@available(visionOS 1.0, *)
extension VisionOSTerminalController {
    func setupVisionOSAccessibility() {
        // Configure VoiceOver for spatial environments
        terminalView.isAccessibilityElement = true
        terminalView.accessibilityLabel = "Terminal Interface"
        terminalView.accessibilityHint = "Double tap to interact, use gestures to navigate"

        // Configure spatial-specific accessibility features
        setupSpatialVoiceOver()
        setupSpatialSwitchControl()
    }

    private func setupSpatialVoiceOver() {
        // Configure VoiceOver for spatial interactions
        // Note: .keyboardInterface does not exist in UIAccessibilityTraits
        terminalView.accessibilityTraits = [.staticText]

        // Add spatial-specific accessibility actions
        terminalView.accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: "Start Recording", target: self, selector: #selector(startRecording)),
            UIAccessibilityCustomAction(name: "Stop Recording", target: self, selector: #selector(stopRecording)),
            UIAccessibilityCustomAction(name: "Toggle Mouse Mode", target: self, selector: #selector(toggleMouseMode))
        ]
    }

    private func setupSpatialSwitchControl() {
        // Configure switch control for spatial environments
        terminalView.accessibilityUserInputLabels = [
            "Terminal View",
            "Keyboard Access",
            "Mouse Control",
            "Session Recording"
        ]
    }

    @objc private func startRecording() {
        startTermcastRecording()
        return true
    }

    @objc private func stopRecording() {
        stopTermcastRecording()
        return true
    }

    @objc private func toggleMouseMode() {
        toggleMouseReporting()
        return true
    }
}
```

#### 4. visionOS Performance Optimization

```swift
@available(visionOS 1.0, *)
extension VisionOSTerminalController {
    func optimizeForVisionOS() {
        // Optimize for spatial rendering performance
        setupSpatialRendering()
        setupSpatialMemoryManagement()
        setupSpatialInputHandling()
    }

    private func setupSpatialRendering() {
        // Configure rendering for spatial environments
        terminalView.layer.backgroundColor = UIColor.clear.cgColor
        terminalView.isOpaque = false

        // Enable spatial-specific rendering optimizations
        let terminal = terminalView.getTerminal()
        terminal.options.scrollback = 2000  // Increased for spatial viewing

        // Configure spatial color management
        terminalView.useBrightColors = true
        terminalView.selectedTextBackgroundColor = UIColor.systemBlue.withAlphaComponent(0.2)
    }

    private func setupSpatialMemoryManagement() {
        // Note: suspendDisplayUpdates() is internal in SwiftTerm and not publicly available
        // SwiftTerm automatically handles display updates based on view visibility

        // Configure spatial-specific memory management
        setupSpatialBufferManagement()
    }

    private func setupSpatialBufferManagement() {
        // Configure buffer management for spatial viewing
        let terminal = terminalView.getTerminal()
        terminal.options.bufferType = .scrollback
        terminal.options.scrollback = 5000  // Larger buffer for spatial environments
    }

    private func setupSpatialInputHandling() {
        // Configure input handling for spatial interactions
        terminalView.keyboardAppearance = .dark
        terminalView.autocapitalizationType = .none
        terminalView.autocorrectionType = .no

        // Enable spatial-specific input handling
        setupSpatialKeyboardHandling()
        setupSpatialGestureHandling()
    }
}
```

### Cross-Platform Development Strategy

```swift
// Cross-platform terminal manager
class CrossPlatformTerminalManager {
    func setupTerminal(for platform: Platform) {
        switch platform {
        case .iOS:
            setupIOSTerminal()
        case .visionOS:
            if #available(visionOS 1.0, *) {
                setupVisionOSTerminal()
            } else {
                setupIOSTerminal()
            }
        case .macOS:
            setupMacOSTerminal()
        }
    }

    @available(visionOS 1.0, *)
    private func setupVisionOSTerminal() {
        // visionOS-specific setup
        let controller = VisionOSTerminalController()
        controller.setupTerminal()
        controller.setupVisionOSAccessibility()
        controller.optimizeForVisionOS()
    }

    private func setupIOSTerminal() {
        // iOS-specific setup
        let controller = IOSTerminalController()
        controller.setupTerminal()
        controller.setupIOSSpecificFeatures()
    }
}

enum Platform {
    case iOS
    case visionOS
    case macOS
}
```

### visionOS Testing Guidelines

```swift
@available(visionOS 1.0, *)
class VisionOSTerminalTests: XCTestCase {

    var terminalController: VisionOSTerminalController!

    override func setUp() {
        super.setUp()
        terminalController = VisionOSTerminalController()
        terminalController.setupTerminal()
    }

    override func tearDown() {
        terminalController.cleanupTerminal()
        terminalController = nil
        super.tearDown()
    }

    func testSpatialGestureHandling() {
        // Test spatial gesture recognition
        let pinchGesture = UIPinchGestureRecognizer(target: terminalController, action: #selector(handlePinch(_:)))
        pinchGesture.scale = 1.5

        terminalController.terminalView.addGestureRecognizer(pinchGesture)
        pinchGesture.state = .changed

        // Verify font size adjustment
        XCTAssertGreaterThan(terminalController.terminalView.font.pointSize, 18.0)
    }

    func testSpatialAccessibility() {
        // Test VoiceOver functionality
        XCTAssertTrue(terminalController.terminalView.isAccessibilityElement)
        XCTAssertEqual(terminalController.terminalView.accessibilityLabel, "Terminal Interface")
    }

    func testTermcastIntegration() {
        // Test Termcast recording and playback
        terminalController.startTermcastRecording()
        XCTAssertTrue(terminalController.isRecording)

        terminalController.stopTermcastRecording()
        XCTAssertFalse(terminalController.isRecording)
    }
}
```

### Deployment Considerations

When deploying visionOS applications with SwiftTerm:

1. **Minimum Version**: Target visionOS 1.0 or later
2. **Interface Orientation**: Configure for spatial environments
3. **Memory Management**: Optimize for spatial memory constraints
4. **Performance**: Test on actual visionOS devices
5. **Accessibility**: Ensure spatial accessibility compliance
6. **Input Methods**: Support spatial input and gesture recognition

### Resources for visionOS Development

- [Apple VisionOS Developer Documentation](https://developer.apple.com/visionos/)
- [SwiftUI for Spatial Computing](https://developer.apple.com/documentation/swiftui/views_for_spatial_computing)
- [Human Interface Guidelines for visionOS](https://developer.apple.com/design/human-interface-guidelines/visionos)
- [SwiftTerm visionOS Sample Code](https://github.com/migueldeicaza/SwiftTerm/tree/main/TerminalApp)
