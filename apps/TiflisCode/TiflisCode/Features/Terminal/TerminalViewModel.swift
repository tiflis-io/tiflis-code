//
//  TerminalViewModel.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
@preconcurrency import Combine
import SwiftTerm
import UIKit

/// Terminal session state machine for tracking restoration state
enum TerminalState: Equatable {
    /// Not connected to workstation
    case disconnected
    /// Subscribing to terminal session
    case subscribing
    /// Loading historical output (replay)
    case replaying
    /// Applying buffered messages after replay
    case buffering
    /// Normal operation, receiving live output
    case live
    /// Session no longer exists on server
    case sessionLost
}

/// View model for terminal session management
@MainActor
final class TerminalViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var isConnected = false
    @Published var error: String?
    @Published var terminalSize: (cols: Int, rows: Int) = (cols: 80, rows: 24)
    @Published var terminalState: TerminalState = .disconnected
    
    // MARK: - Terminal
    
    // Simplified Architecture: Use only TerminalView's internal Terminal
    // 
    // TerminalView creates its own Terminal instance and implements TerminalDelegate internally.
    // When user types, TerminalView's internal Terminal calls send() which TerminalView forwards
    // to its terminalDelegate (which we set to self).
    //
    // We use:
    // - TerminalViewDelegate to receive input events (send method)
    // - TerminalView.getTerminal() to access the internal terminal for resize operations
    // - TerminalView.feed() to send output data for rendering
    //
    // This eliminates the duplicate Terminal instance that was previously needed.
    private var swiftTermView: SwiftTerm.TerminalView?
    
    /// Access to TerminalView's internal terminal via getTerminal()
    /// Returns nil if TerminalView is not yet available
    private var terminal: Terminal? {
        return swiftTermView?.getTerminal()
    }
    
    // MARK: - Dependencies
    
    private var session: Session  // Changed to var so we can update it when session ID changes
    private let webSocketClient: WebSocketClientProtocol
    private let connectionService: ConnectionServicing
    
    // MARK: - State

    private var cancellables = Set<AnyCancellable>()
    private var isSubscribed = false
    private var hasLoadedReplay = false  // Track if we've loaded replay to avoid duplicates

    // Track known session IDs (temp and real) to handle session ID updates
    private var knownSessionIds: Set<String> = []

    // MARK: - Master Client State

    /// Whether this client is the master for the terminal session (controls size)
    /// First subscriber becomes master. Non-master clients receive output but can't resize.
    private var isMaster = false

    /// Server's authoritative terminal size. Non-master clients should use this.
    private var serverTerminalSize: (cols: Int, rows: Int)?

    // MARK: - Sequence Tracking (for deduplication and gap detection)

    /// Last received sequence number (for deduplication)
    private var lastReceivedSequence: Int = 0
    /// Server's current sequence number (for gap detection)
    private var serverCurrentSequence: Int = 0
    /// Buffer for messages received during replay (sequence, content)
    private var replayBuffer: [(sequence: Int, content: String)] = []
    /// Flag indicating we're in replay mode (buffering live messages)
    private var isInReplayMode = false
    /// Buffer for content that arrives before terminal view is ready
    /// Limited to prevent unbounded memory growth
    private var pendingFeedBuffer: [String] = []
    /// Maximum number of items in pending feed buffer
    private let maxPendingFeedBufferSize = 1000

    // MARK: - Alternate Screen Mode (TUI Apps)

    /// Flag indicating terminal is in alternate screen mode (TUI apps like vim, htop, claude code)
    /// When true, we should NOT auto-scroll or force resize as the TUI app controls the screen
    private var isInAlternateScreenMode = false

    // Thread-safe terminal size for nonisolated delegate access
    // Updated from main actor, read from nonisolated context
    nonisolated(unsafe) private var threadSafeTerminalSize: (cols: Int, rows: Int) = (80, 24)

    // MARK: - Resize Debouncing

    /// Debounce task for resize operations
    /// Prevents resize storms when keyboard height changes rapidly (e.g., switching keyboards)
    private var resizeDebounceTask: Task<Void, Never>?

    /// Pending resize dimensions (used during debounce)
    private var pendingResize: (cols: Int, rows: Int)?

    /// Debounce interval for resize operations (150ms balances responsiveness with stability)
    private let resizeDebounceInterval: Duration = .milliseconds(150)

    /// Timestamp of last resize sent to server (for debounce logic)
    private var lastResizeSentTime: Date?

    /// Last size actually sent to server (to prevent duplicate resize requests)
    private var lastSentServerSize: (cols: Int, rows: Int)?

    /// Minimum interval between server resizes (first resize is always immediate)
    private let minResizeInterval: TimeInterval = 0.15

    // Performance monitoring (development only)
    #if DEBUG
    private var feedOperationCount: Int = 0
    private var feedOperationStartTime: Date?
    private var lastSizeCalculationTime: Date?
    #endif
    
    // MARK: - Initialization
    
    init(
        session: Session,
        webSocketClient: WebSocketClientProtocol,
        connectionService: ConnectionServicing
    ) {
        self.session = session
        self.webSocketClient = webSocketClient
        self.connectionService = connectionService
        
        // Track the initial session ID (might be temporary)
        knownSessionIds.insert(session.id)
        
        // Initialize thread-safe terminal size
        threadSafeTerminalSize = (cols: 80, rows: 24)
        
        // Terminal will be accessed via TerminalView.getTerminal() when view is available
        
        // Observe connection state
        observeConnectionState()

        // Observe WebSocket messages
        observeMessages()

        // Note: Session ID updates (temp -> real) are handled via updateSession()
        // which is called from TerminalView when the session binding changes in AppState

        #if DEBUG
        print("[TerminalVM:\(session.id.prefix(8))] INIT - knownSessionIds: \(knownSessionIds)")
        #endif
    }

    deinit {
        // Clean up subscriptions when ViewModel is deallocated
        // Note: We can't access @MainActor properties from deinit
        // The session will be unsubscribed when view disappears (onDisappear)
        // Cancellables will be cleaned up automatically when ViewModel is deallocated
        #if DEBUG
        print("[TerminalVM] DEINIT")
        #endif
    }
    
    /// Updates the session when AppState changes the session ID (e.g., temp ID -> real ID)
    /// This is called from TerminalView when the session binding changes
    func updateSession(_ newSession: Session) {
        guard newSession.id != session.id else { return }

        #if DEBUG
        print("[TerminalViewModel] Session ID updated: \(session.id) -> \(newSession.id)")
        #endif

        // Track the new session ID as known
        knownSessionIds.insert(newSession.id)
        session = newSession

        // Reconfigure terminal if we have a terminal view and session has different buffer size
        if let terminalView = swiftTermView {
            configureTerminalOptions(view: terminalView)
        }
    }
    
    // MARK: - Connection Observation
    
    private func observeConnectionState() {
        connectionService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self = self else { return }
                // Use isConnected which returns true only for .authenticated state
                self.isConnected = state.isConnected

                if self.isConnected {
                    // Auto-resubscribe and recover state on reconnection
                    Task { @MainActor [weak self] in
                        await self?.handleReconnection()
                    }
                } else {
                    // Update terminal state to disconnected
                    self.terminalState = .disconnected
                    // Reset subscription flag - server loses subscription on disconnect
                    // This ensures we re-subscribe (not just recover) on reconnect
                    self.isSubscribed = false
                }
            }
            .store(in: &cancellables)

        connectionService.workstationOnlinePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] online in
                guard let self = self else { return }
                if online && self.isConnected {
                    // Workstation came back online, recover state
                    Task { @MainActor [weak self] in
                        await self?.handleReconnection()
                    }
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Message Observation
    
    private func observeMessages() {
        connectionService.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleMessage(message)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Session Management
    
    func subscribeToSession() async {
        guard !isSubscribed else { return }

        // Update state
        terminalState = .subscribing

        // Reset terminal before subscribing to ensure clean state
        // This prevents duplicates when returning to terminal
        resetTerminal()

        // Reset sequence tracking
        lastReceivedSequence = 0
        serverCurrentSequence = 0
        replayBuffer.removeAll()
        isInReplayMode = true  // Enter replay mode until we load history

        // Reset master state - will be set by server response
        isMaster = false
        serverTerminalSize = nil

        let message: [String: Any] = [
            "type": "session.subscribe",
            "session_id": session.id
        ]

        do {
            try webSocketClient.sendMessage(message)
            isSubscribed = true

            // Reset replay flag when subscribing (new subscription = fresh load)
            hasLoadedReplay = false

            // Update state and request replay
            terminalState = .replaying

            // Always request replay from beginning when subscribing
            // This ensures we load fresh state from server each time we return to terminal
            await recoverSessionState()
        } catch {
            self.error = "Failed to subscribe: \(error.localizedDescription)"
            terminalState = .disconnected
        }
    }
    
    /// Resets terminal state before loading replay
    /// Note: We no longer nil out swiftTermView here because replay data may arrive
    /// before the view is recreated, causing data loss.
    /// Instead, we use TerminalView's softReset or just reset state flags.
    private func resetTerminal() {
        // Reset state flags only - don't nil out swiftTermView
        // The TerminalView will be reused or replaced when makeUIView is called
        hasLoadedReplay = false

        // If we have a terminal view, try to reset its state
        // This clears the screen without losing the view reference
        if let terminalView = swiftTermView {
            // Send reset escape sequences to clear screen and reset cursor
            // CSI H - Cursor Home (move to 0,0)
            // CSI 2J - Erase Display (clear entire screen)
            // CSI ?25h - Show Cursor (DECTCEM)
            let resetSequence = "\u{1b}[H\u{1b}[2J\u{1b}[?25h"
            terminalView.feed(byteArray: Array(resetSequence.utf8)[...])

            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Terminal reset via escape sequences")
            #endif
        }
    }
    
    func unsubscribeFromSession() {
        guard isSubscribed else { return }

        // Mark as unsubscribed FIRST to prevent any further message processing
        isSubscribed = false

        // Cancel any pending resize operation
        resizeDebounceTask?.cancel()
        resizeDebounceTask = nil
        pendingResize = nil
        lastResizeSentTime = nil  // Reset so next subscription gets immediate resize
        lastSentServerSize = nil  // Reset so next subscription will send size

        // Clear terminal view reference to prevent feeding to disposed view
        swiftTermView = nil

        // Reset replay state
        hasLoadedReplay = false
        isInReplayMode = false
        replayBuffer.removeAll()
        pendingFeedBuffer.removeAll()

        // Reset master state
        isMaster = false
        serverTerminalSize = nil

        // Send unsubscribe message to server
        let message: [String: Any] = [
            "type": "session.unsubscribe",
            "session_id": session.id
        ]

        do {
            try webSocketClient.sendMessage(message)
        } catch {
            // Don't set error here - we're unsubscribing, errors are expected if disconnected
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Failed to send unsubscribe: \(error.localizedDescription)")
            #endif
        }
    }
    
    // MARK: - Terminal Input/Output
    
    func sendInput(_ data: Data) {
        guard let inputString = String(data: data, encoding: .utf8) else { return }
        sendInput(inputString)
    }
    
    func sendInput(_ text: String) {
        let message: [String: Any] = [
            "type": "session.input",
            "session_id": session.id,
            "payload": [
                "data": text
            ]
        ]
        
        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to send input: \(error.localizedDescription)"
        }
    }
    
    func resizeTerminal(cols: Int, rows: Int) {
        // Enforce minimum terminal size to match server constraints
        // Server enforces minimum 24 rows (VT100 standard), so we must match to prevent resize loops
        // If iOS sends 22 rows but server enforces 24, TUI apps will flicker as they redraw
        let safeCols = max(40, cols)
        let safeRows = max(24, rows)  // Must match server's MIN_TERMINAL_ROWS

        #if DEBUG
        if rows < 24 {
            print("[TerminalVM:\(session.id.prefix(8))] resizeTerminal: requested \(cols)×\(rows) → clamped to \(safeCols)×\(safeRows) (minimum 24 rows)")
        }
        #endif

        // Only resize if size actually changed
        guard terminalSize.cols != safeCols || terminalSize.rows != safeRows else {
            return
        }

        // Update local state immediately for responsive UI
        terminalSize = (cols: safeCols, rows: safeRows)
        threadSafeTerminalSize = (cols: safeCols, rows: safeRows)

        // Update TerminalView's internal terminal size immediately
        if let terminalView = swiftTermView {
            terminalView.resize(cols: safeCols, rows: safeRows)
        }

        // Check if this is the first resize or enough time has passed since last resize
        let now = Date()
        let shouldSendImmediately: Bool
        if let lastSent = lastResizeSentTime {
            shouldSendImmediately = now.timeIntervalSince(lastSent) >= minResizeInterval
        } else {
            // First resize - always send immediately
            shouldSendImmediately = true
        }

        if shouldSendImmediately {
            // Cancel any pending debounced resize
            resizeDebounceTask?.cancel()
            resizeDebounceTask = nil
            pendingResize = (cols: safeCols, rows: safeRows)
            sendResizeToServer()
        } else {
            // Debounce subsequent rapid resizes to prevent storms during keyboard changes
            resizeDebounceTask?.cancel()
            pendingResize = (cols: safeCols, rows: safeRows)

            resizeDebounceTask = Task { [weak self] in
                do {
                    try await Task.sleep(for: self?.resizeDebounceInterval ?? .milliseconds(150))
                } catch {
                    // Task cancelled, another resize is pending
                    return
                }

                guard let self = self, !Task.isCancelled else { return }

                // Send the resize to server after debounce period
                self.sendResizeToServer()
            }
        }
    }

    /// Sends pending resize to server (called after debounce)
    private func sendResizeToServer() {
        guard let pending = pendingResize else { return }

        // CRITICAL: Skip if we already sent this exact size to server
        // This prevents resize loops where TUI apps redraw, SwiftTerm recalculates,
        // and we keep sending the same clamped size repeatedly
        if let lastSent = lastSentServerSize,
           lastSent.cols == pending.cols && lastSent.rows == pending.rows {
            #if DEBUG
            print("[TerminalViewModel] Skipping duplicate resize: \(pending.cols)×\(pending.rows) (already sent)")
            #endif
            pendingResize = nil
            return
        }

        #if DEBUG
        let resizeStartTime = Date()
        #endif

        let message: [String: Any] = [
            "type": "session.resize",
            "session_id": session.id,
            "payload": [
                "cols": pending.cols,
                "rows": pending.rows
            ]
        ]

        do {
            try webSocketClient.sendMessage(message)
            // Track when resize was sent for debounce logic
            lastResizeSentTime = Date()
            // Track the actual size we sent to prevent duplicate requests
            lastSentServerSize = (cols: pending.cols, rows: pending.rows)
        } catch {
            self.error = "Failed to resize terminal: \(error.localizedDescription)"
        }

        // Clear pending resize after sending
        pendingResize = nil

        #if DEBUG
        let resizeDuration = Date().timeIntervalSince(resizeStartTime)
        lastSizeCalculationTime = Date()
        print("[TerminalViewModel] Terminal resize sent to server: \(pending.cols)×\(pending.rows), \(String(format: "%.3f", resizeDuration * 1000))ms")
        #endif
    }
    
    // MARK: - Message Handling

    private func handleMessage(_ message: [String: Any]) {
        guard let messageType = message["type"] as? String else { return }

        // Skip output/replay messages if we're not subscribed (prevents crashes during teardown)
        // But still handle terminated/error messages for state updates
        if !isSubscribed && (messageType == "session.output" || messageType == "session.replay.data") {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Ignoring \(messageType) - not subscribed")
            #endif
            return
        }

        #if DEBUG
        if messageType.starts(with: "session.") || messageType == "error" {
            let sessionId = message["session_id"] as? String ?? "none"
            print("[TerminalVM:\(session.id.prefix(8))] handleMessage: type=\(messageType), session_id=\(sessionId.prefix(8))")
        }
        #endif

        switch messageType {
        case "session.output":
            handleOutputMessage(message)
        case "session.replay.data":
            handleReplayMessage(message)
        case "session.subscribed":
            handleSubscribedMessage(message)
        case "session.resized":
            handleResizedMessage(message)
        case "session.terminated":
            handleSessionTerminated(message)
        case "error":
            handleErrorMessage(message)
        case "connection.workstation_offline":
            // Workstation offline - will auto-recover when online
            break
        case "connection.workstation_online":
            // Workstation online - recover state
            Task { @MainActor [weak self] in
                await self?.handleReconnection()
            }
        default:
            break
        }
    }

    /// Handles session terminated message
    private func handleSessionTerminated(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              sessionId == session.id || knownSessionIds.contains(sessionId) else {
            return
        }

        #if DEBUG
        print("[TerminalViewModel] Session terminated: \(sessionId)")
        #endif

        terminalState = .sessionLost
        isSubscribed = false
    }

    /// Handles error messages from server
    private func handleErrorMessage(_ message: [String: Any]) {
        // Check if this error is for our session
        if let sessionId = message["session_id"] as? String,
           sessionId != session.id && !knownSessionIds.contains(sessionId) {
            return
        }

        guard let payload = message["payload"] as? [String: Any],
              let code = payload["code"] as? String else {
            return
        }

        #if DEBUG
        print("[TerminalViewModel] Error received: \(code)")
        #endif

        if code == "SESSION_NOT_FOUND" {
            terminalState = .sessionLost
            isSubscribed = false
        }
    }

    /// Handles subscription confirmation with master status and terminal size
    private func handleSubscribedMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              sessionId == session.id || knownSessionIds.contains(sessionId) else {
            return
        }

        // Extract payload with master status and terminal size
        if let payload = message["payload"] as? [String: Any] {
            isMaster = payload["is_master"] as? Bool ?? false

            // Store server's terminal size
            if let cols = payload["cols"] as? Int, let rows = payload["rows"] as? Int {
                serverTerminalSize = (cols: cols, rows: rows)

                // If not master, sync local terminal to server size
                if !isMaster {
                    terminalSize = (cols: cols, rows: rows)
                    threadSafeTerminalSize = (cols: cols, rows: rows)

                    // Update TerminalView if available
                    if let terminalView = swiftTermView {
                        terminalView.resize(cols: cols, rows: rows)
                    }
                }
            }
        }

        #if DEBUG
        print("[TerminalVM:\(session.id.prefix(8))] Subscribed: isMaster=\(isMaster), serverSize=\(String(describing: serverTerminalSize))")
        #endif
    }

    /// Handles resize result from server
    private func handleResizedMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              sessionId == session.id || knownSessionIds.contains(sessionId) else {
            return
        }

        guard let payload = message["payload"] as? [String: Any],
              let success = payload["success"] as? Bool,
              let cols = payload["cols"] as? Int,
              let rows = payload["rows"] as? Int else {
            return
        }

        // Update server terminal size
        serverTerminalSize = (cols: cols, rows: rows)

        if success {
            // Server accepted resize, update local state
            terminalSize = (cols: cols, rows: rows)
            threadSafeTerminalSize = (cols: cols, rows: rows)

            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Resize accepted: \(cols)×\(rows)")
            #endif
        } else {
            // Server rejected resize (we're not master), sync to server size
            let reason = payload["reason"] as? String

            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Resize rejected: reason=\(reason ?? "unknown"), using server size \(cols)×\(rows)")
            #endif

            // Update local terminal to match server size
            terminalSize = (cols: cols, rows: rows)
            threadSafeTerminalSize = (cols: cols, rows: rows)

            if let terminalView = swiftTermView {
                terminalView.resize(cols: cols, rows: rows)
            }

            // We're not master anymore (or never were)
            if reason == "not_master" {
                isMaster = false
            }
        }
    }

    private func handleOutputMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else {
            return
        }

        // Check if the message is for this session
        // Only accept messages that match our current session ID or known session IDs
        // knownSessionIds contains session IDs that we've confirmed belong to this terminal
        let isOurSession = sessionId == session.id || knownSessionIds.contains(sessionId)

        if !isOurSession {
            // Not our session, ignore
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Output IGNORED: got \(sessionId.prefix(8)), expected \(session.id.prefix(8))")
            #endif
            return
        }

        #if DEBUG
        print("[TerminalVM:\(session.id.prefix(8))] Output ACCEPTED for session \(sessionId.prefix(8))")
        #endif

        guard let payload = message["payload"] as? [String: Any],
              let contentType = payload["content_type"] as? String,
              contentType == "terminal",
              let content = payload["content"] as? String else {
            return
        }

        // Extract sequence number (fallback to 0 for backward compatibility)
        let sequence = payload["sequence"] as? Int ?? 0

        // If in replay mode, buffer the message for later
        if isInReplayMode {
            replayBuffer.append((sequence: sequence, content: content))
            #if DEBUG
            print("[TerminalViewModel] Buffered sequence \(sequence) during replay (buffer size: \(replayBuffer.count))")
            #endif
            return
        }

        // Skip if we've already processed this sequence (deduplication)
        guard sequence > lastReceivedSequence else {
            #if DEBUG
            print("[TerminalViewModel] Skipping duplicate sequence \(sequence), last was \(lastReceivedSequence)")
            #endif
            return
        }

        // Gap detection: if we missed sequences, request targeted replay
        if sequence > lastReceivedSequence + 1 && lastReceivedSequence > 0 {
            #if DEBUG
            print("[TerminalViewModel] Gap detected: expected \(lastReceivedSequence + 1), got \(sequence)")
            #endif
            // Enter replay mode and request missing messages
            isInReplayMode = true
            terminalState = .replaying
            replayBuffer.append((sequence: sequence, content: content))
            requestReplay(sinceSequence: lastReceivedSequence)
            return
        }

        // Update last received sequence and feed to terminal
        lastReceivedSequence = sequence
        feedToTerminal(content)
    }

    /// Feeds content to terminal view
    /// Thread-safe: Only feeds if terminal view is available and we're in a valid state
    /// If terminal view is not ready, buffers content for later delivery
    private func feedToTerminal(_ content: String) {
        // Early exit if we're not subscribed (view may be disappearing)
        guard isSubscribed else {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Skipping feed - not subscribed")
            #endif
            return
        }

        #if DEBUG
        let feedStartTime = Date()
        feedOperationCount += 1
        #endif

        guard let terminalView = swiftTermView else {
            // Buffer content if terminal view is not yet available
            // This can happen during app restart when replay arrives before view creation
            // Respect buffer size limit to prevent unbounded memory growth
            if pendingFeedBuffer.count < maxPendingFeedBufferSize {
                pendingFeedBuffer.append(content)
            }
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Buffered content (view not available): \(content.utf8.count) bytes, buffer size: \(pendingFeedBuffer.count)")
            #endif
            return
        }

        // Additional safety check: verify the view is still in a valid state
        // by checking if it has a window (is part of the view hierarchy)
        guard terminalView.window != nil else {
            // Buffer content if view is not in window hierarchy yet
            // Respect buffer size limit to prevent unbounded memory growth
            if pendingFeedBuffer.count < maxPendingFeedBufferSize {
                pendingFeedBuffer.append(content)
            }
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Buffered content (no window): \(content.utf8.count) bytes, buffer size: \(pendingFeedBuffer.count)")
            #endif
            return
        }

        // Detect alternate screen mode transitions (TUI apps like vim, htop, claude code)
        // ESC[?1049h - Enter alternate screen (TUI app started)
        // ESC[?1049l - Exit alternate screen (TUI app exited)
        let hasAltScreenEnter = content.contains("\u{1b}[?1049h")
        let hasAltScreenExit = content.contains("\u{1b}[?1049l")

        // Update alternate screen mode state
        if hasAltScreenEnter {
            isInAlternateScreenMode = true
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Entered alternate screen mode (TUI app started)")
            #endif
        }
        if hasAltScreenExit {
            isInAlternateScreenMode = false
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Exited alternate screen mode (TUI app exited)")
            #endif
        }

        // Detect clear screen sequences (only relevant when NOT in alternate screen mode)
        // ESC[2J - Erase Display, ESC[3J - Erase Scrollback, ESC c - Full Reset
        let hasEraseDisplay = content.contains("\u{1b}[2J")
        let hasEraseScrollback = content.contains("\u{1b}[3J")
        let hasFullReset = content.contains("\u{1b}c")
        // Only trigger clear handling when exiting alternate screen or in normal mode
        let hasClearSequence = hasAltScreenExit || (
            !isInAlternateScreenMode && (hasEraseDisplay || hasEraseScrollback || hasFullReset)
        )

        #if DEBUG
        if hasEraseDisplay || hasEraseScrollback || hasFullReset {
            print("[TerminalVM:\(session.id.prefix(8))] Clear sequence detected: eraseDisplay=\(hasEraseDisplay), eraseScrollback=\(hasEraseScrollback), fullReset=\(hasFullReset), altScreenMode=\(isInAlternateScreenMode)")
        }
        #endif

        // Feed directly to TerminalView (proper SwiftTerm pattern)
        // Wrap in safety check to handle potential SwiftTerm crashes with malformed escape sequences
        // This is especially important for TUI applications like htop that send complex sequences
        let bytes = content.utf8BytesSlice

        // Safety: Check content size to avoid overwhelming SwiftTerm
        // Large TUI apps like htop can send very large chunks during replay
        let contentSize = content.utf8.count
        if contentSize > 100_000 {
            // Split very large content into smaller chunks to prevent crashes
            // This is defensive - SwiftTerm may have issues with very large single feeds
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Large content detected (\(contentSize) bytes), chunking...")
            #endif

            let chunkSize = 50_000
            var offset = 0
            let utf8Array = Array(content.utf8)

            while offset < utf8Array.count {
                let endIndex = min(offset + chunkSize, utf8Array.count)
                let chunk = utf8Array[offset..<endIndex]
                terminalView.feed(byteArray: chunk)
                offset = endIndex
            }
        } else {
            terminalView.feed(byteArray: bytes)
        }

        // After clear screen, force resize to reset terminal state and scroll position
        // This is needed because TUI apps (vim, htop, claude) may leave terminal in odd state
        if hasClearSequence {
            forceTerminalResize()
        }

        #if DEBUG
        let feedDuration = Date().timeIntervalSince(feedStartTime)
        if feedOperationCount % 100 == 0 {
            print("[TerminalVM:\(session.id.prefix(8))] Feed operation #\(feedOperationCount): \(String(format: "%.3f", feedDuration * 1000))ms, content size: \(contentSize) bytes")
        }
        #endif
    }

    /// Requests replay of messages since a specific sequence number
    private func requestReplay(sinceSequence: Int) {
        let message: [String: Any] = [
            "type": "session.replay",
            "session_id": session.id,
            "payload": [
                "since_sequence": sinceSequence,
                "limit": 500
            ]
        ]

        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to request replay: \(error.localizedDescription)"
        }
    }
    
    private func handleReplayMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Replay message missing session_id")
            #endif
            return
        }

        guard sessionId == session.id || knownSessionIds.contains(sessionId) else {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Replay IGNORED: got \(sessionId.prefix(8)), expected \(session.id.prefix(8))")
            #endif
            return
        }

        #if DEBUG
        print("[TerminalVM:\(session.id.prefix(8))] Replay ACCEPTED for session \(sessionId.prefix(8))")
        #endif

        guard let payload = message["payload"] as? [String: Any],
              let messages = payload["messages"] as? [[String: Any]] else {
            #if DEBUG
            print("[TerminalViewModel] Replay message invalid payload")
            #endif
            return
        }

        // Extract sequence metadata for gap detection
        let currentSequence = payload["current_sequence"] as? Int ?? 0
        serverCurrentSequence = currentSequence

        #if DEBUG
        let replayStartTime = Date()
        print("[TerminalViewModel] Replay received: \(messages.count) messages, server sequence: \(currentSequence)")
        #endif

        // Feed replay messages to terminal in sequence order
        for msg in messages {
            guard let content = msg["content"] as? String else {
                continue
            }
            let sequence = msg["sequence"] as? Int ?? 0

            // Only feed messages we haven't seen
            if sequence > lastReceivedSequence {
                feedToTerminal(content)
                lastReceivedSequence = sequence
            }
        }

        // Now apply buffered messages that arrived during replay
        terminalState = .buffering
        let sortedBuffer = replayBuffer.sorted { $0.sequence < $1.sequence }

        #if DEBUG
        print("[TerminalViewModel] Applying \(sortedBuffer.count) buffered messages")
        #endif

        for buffered in sortedBuffer {
            if buffered.sequence > lastReceivedSequence {
                feedToTerminal(buffered.content)
                lastReceivedSequence = buffered.sequence
            }
        }
        replayBuffer.removeAll()

        // Check if we need more history
        let hasMore = payload["has_more"] as? Bool ?? false

        #if DEBUG
        print("[TerminalViewModel] Replay check: hasMore=\(hasMore), lastReceivedSequence=\(lastReceivedSequence), serverCurrentSequence=\(serverCurrentSequence)")
        #endif

        if hasMore && lastReceivedSequence < serverCurrentSequence {
            // More messages available, request next batch
            #if DEBUG
            print("[TerminalViewModel] Requesting more history: last=\(lastReceivedSequence), server=\(serverCurrentSequence)")
            #endif
            requestReplay(sinceSequence: lastReceivedSequence)
        } else {
            // Fully caught up - transition to live state
            isInReplayMode = false
            hasLoadedReplay = true
            terminalState = .live

            // Ensure cursor is visible after replay completes
            // Send DECTCEM (DEC Text Cursor Enable Mode) to show cursor
            if let terminalView = swiftTermView {
                let showCursorSequence = "\u{1b}[?25h"
                terminalView.feed(byteArray: Array(showCursorSequence.utf8)[...])
            }

            // After replay completes, check if server size differs from our local size
            // Only send resize if sizes don't match - this triggers SIGWINCH for TUI app redraw
            // Avoid unnecessary resize as it can disrupt terminal state (cursor mode, etc.)
            if let serverSize = serverTerminalSize,
               (serverSize.cols != terminalSize.cols || serverSize.rows != terminalSize.rows),
               terminalSize.cols > 0 && terminalSize.rows > 0 {
                #if DEBUG
                print("[TerminalViewModel] Size mismatch after replay: server=\(serverSize.cols)x\(serverSize.rows), local=\(terminalSize.cols)x\(terminalSize.rows)")
                #endif
                pendingResize = terminalSize
                sendResizeToServer()
            }

            #if DEBUG
            let replayDuration = Date().timeIntervalSince(replayStartTime)
            print("[TerminalViewModel] Replay complete: last sequence=\(lastReceivedSequence), duration=\(String(format: "%.3f", replayDuration * 1000))ms")
            #endif
        }
    }
    
    // MARK: - State Recovery
    
    /// Requests replay of terminal history from server
    /// Always requests from beginning (timestamp 0) to load fresh state
    func recoverSessionState() async {
        // Reset replay flag to allow loading replay again
        // This ensures we can reload history when returning to terminal
        hasLoadedReplay = false
        
        // Always request all history from beginning
        // This ensures we load fresh state from server each time
        let message: [String: Any] = [
            "type": "session.replay",
            "session_id": session.id,
            "payload": [
                "since_timestamp": 0,
                "limit": 100
            ]
        ]
        
        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to request replay: \(error.localizedDescription)"
        }
    }
    
    func handleReconnection() async {
        // Resubscribe if needed
        if !isSubscribed {
            await subscribeToSession()
        } else {
            // Already subscribed, just recover state
            await recoverSessionState()
        }
    }
    
    // MARK: - Terminal View Management
    
    /// Sets the SwiftTerm TerminalView instance and configures it
    /// This sets up the terminalDelegate to receive input events
    /// When a new view is set, we reset the replay flag to allow loading history again
    func setTerminalView(_ view: SwiftTerm.TerminalView) {
        let isNewView = self.swiftTermView == nil || self.swiftTermView !== view
        self.swiftTermView = view

        // Set terminalDelegate to receive input events from TerminalView
        // TerminalView's internal Terminal calls send() which is forwarded to terminalDelegate
        view.terminalDelegate = self

        // Configure terminal options with session-specific buffer size
        configureTerminalOptions(view: view)

        // If this is a new view (e.g., after navigation), reset replay flag
        // This ensures we can load history when view reappears
        if isNewView {
            hasLoadedReplay = false
        }

        // Flush any pending content that was buffered before the view was available
        // Only flush if we're subscribed and have pending content
        if isSubscribed && !pendingFeedBuffer.isEmpty {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Flushing \(pendingFeedBuffer.count) buffered items to terminal view")
            #endif

            // Feed all buffered content to the terminal
            // Use chunking for large content to prevent SwiftTerm crashes with TUI apps like htop
            for content in pendingFeedBuffer {
                let contentSize = content.utf8.count
                if contentSize > 100_000 {
                    // Split very large content into smaller chunks
                    let chunkSize = 50_000
                    var offset = 0
                    let utf8Array = Array(content.utf8)

                    while offset < utf8Array.count {
                        let endIndex = min(offset + chunkSize, utf8Array.count)
                        let chunk = utf8Array[offset..<endIndex]
                        view.feed(byteArray: chunk)
                        offset = endIndex
                    }
                } else {
                    let bytes = content.utf8BytesSlice
                    view.feed(byteArray: bytes)
                }
            }
            pendingFeedBuffer.removeAll()

            // After flushing buffered content, ensure cursor is visible
            // Send DECTCEM (DEC Text Cursor Enable Mode) to show cursor
            let showCursorSequence = "\u{1b}[?25h"
            view.feed(byteArray: Array(showCursorSequence.utf8)[...])
        } else if !pendingFeedBuffer.isEmpty {
            // Clear buffer if not subscribed to prevent stale data
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Clearing \(pendingFeedBuffer.count) buffered items (not subscribed)")
            #endif
            pendingFeedBuffer.removeAll()
        }
    }

    /// Configures terminal options with session-specific buffer size
    private func configureTerminalOptions(view: SwiftTerm.TerminalView) {
        let terminal = view.getTerminal()

        // Use server-provided buffer size, fallback to 100 for optimal mobile performance
        let scrollbackLines = session.terminalConfig?.bufferSize ?? 100

        // Configure terminal options following best practices
        terminal.options = TerminalOptions(
            cols: terminal.cols,
            rows: terminal.rows,
            cursorStyle: .blinkBlock,  // Blinking block cursor
            scrollback: scrollbackLines,  // Server-configured scrollback lines
            enableSixelReported: true  // Enable Sixel graphics support
        )

        #if DEBUG
        print("[TerminalVM:\(session.id.prefix(8))] Configured terminal with \(scrollbackLines) scrollback lines")
        #endif
    }

    // MARK: - Terminal Reset

    /// Forces a terminal resize to reset state after clear screen
    /// This sends SIGWINCH to the PTY which causes proper cursor repositioning
    /// NOTE: This should NOT be called while in alternate screen mode (TUI apps)
    private func forceTerminalResize() {
        guard let terminalView = swiftTermView else { return }

        // Don't force resize or scroll while in alternate screen mode
        // TUI apps (vim, htop, claude code) manage their own screen - interfering causes flickering
        guard !isInAlternateScreenMode else {
            #if DEBUG
            print("[TerminalVM:\(session.id.prefix(8))] Skipping forceTerminalResize - in alternate screen mode")
            #endif
            return
        }

        // Small delay to let clear sequence complete
        Task { @MainActor [weak self, weak terminalView] in
            try? await Task.sleep(for: .milliseconds(50))

            guard let self = self, let terminalView = terminalView else { return }

            // Double-check we're still not in alternate screen mode after delay
            guard !self.isInAlternateScreenMode else { return }

            // Force resize by re-sending current size
            // This triggers SIGWINCH on server and resets terminal state
            let cols = self.terminalSize.cols
            let rows = self.terminalSize.rows

            if cols > 0 && rows > 0 {
                // Temporarily change size and change back to force resize
                self.pendingResize = (cols: cols, rows: rows)
                self.sendResizeToServer()

                // Also resize SwiftTerm locally
                terminalView.resize(cols: cols, rows: rows)

                // Scroll to bottom after resize (only in normal mode)
                try? await Task.sleep(for: .milliseconds(50))

                // Final check before scrolling
                guard !self.isInAlternateScreenMode else { return }

                let maxOffsetY = max(0, terminalView.contentSize.height - terminalView.bounds.height)
                terminalView.setContentOffset(CGPoint(x: 0, y: maxOffsetY), animated: false)
            }
        }
    }

    // MARK: - First Responder Management

    /// Dismisses the keyboard by resigning first responder
    /// Called when drawer opens to hide keyboard
    func resignFirstResponder() {
        _ = swiftTermView?.resignFirstResponder()
    }

    /// Shows the keyboard by becoming first responder
    /// Called when drawer closes to restore keyboard input
    func becomeFirstResponder() {
        _ = swiftTermView?.becomeFirstResponder()
    }
}

// MARK: - TerminalViewDelegate

extension TerminalViewModel: TerminalViewDelegate {
    /// Handles terminal input from SwiftTerm TerminalView
    /// TerminalView calls this when user types in the terminal
    /// Note: This is called from nonisolated context, so we use Task to access MainActor
    nonisolated func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
        // Convert bytes to Data (nonisolated operation)
        var dataArray = Array(data)

        // Fix: Convert DEL (127) to Control-H (8) for iOS keyboard compatibility
        // iOS screen keyboard sends DEL (0x7F) instead of backspace (0x08)
        // even when backspaceSendsControlH is set to true in TerminalView
        // This ensures backspace works consistently from both physical and screen keyboards
        if dataArray.count == 1 && dataArray[0] == 127 {
            dataArray[0] = 8  // Convert DEL to Control-H
        }

        #if DEBUG
        // Log what we're sending to debug backspace issues
        print("[TerminalViewModel] Sending \(dataArray.count) bytes: \(dataArray.map { String(format: "%02X", $0) }.joined(separator: " "))")
        if dataArray.count == 1 {
            let byte = dataArray[0]
            switch byte {
            case 8:
                print("[TerminalViewModel] -> Control-H (^H, backspace)")
            case 127:
                print("[TerminalViewModel] -> DEL (^?)")
            case 13:
                print("[TerminalViewModel] -> Return/Enter")
            case 9:
                print("[TerminalViewModel] -> Tab")
            default:
                if byte >= 32 && byte < 127 {
                    print("[TerminalViewModel] -> ASCII: '\(Character(UnicodeScalar(byte)))'")
                } else if byte < 32 {
                    print("[TerminalViewModel] -> Control character: ^" + String(Character(UnicodeScalar(byte + 64))))
                }
            }
        }
        #endif

        let dataToSend = Data(dataArray)

        // Access MainActor-isolated properties via Task
        Task { @MainActor [weak self] in
            self?.sendInput(dataToSend)
        }
    }
    
    /// Called when terminal size changes (SwiftTerm delegate callback)
    /// Note: This is called from nonisolated context, so we use Task to access MainActor
    /// Uses the same debounced resize path as resizeTerminal() to prevent resize storms
    nonisolated func sizeChanged(source: SwiftTerm.TerminalView, newCols: Int, newRows: Int) {
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            // Delegate to the debounced resize method
            self.resizeTerminal(cols: newCols, rows: newRows)
        }
    }
    
    /// Called when terminal title changes
    nonisolated func setTerminalTitle(source: SwiftTerm.TerminalView, title: String) {
        // Terminal title changes - can be used for UI updates if needed
        // Currently not used, but available for future enhancements
    }
    
    /// Called when terminal is scrolled
    nonisolated func scrolled(source: SwiftTerm.TerminalView, position: Double) {
        // Terminal scroll position changed - can be used for UI updates if needed
        // Currently not used, but available for future enhancements
    }
    
    /// Called when terminal bell is triggered
    nonisolated func bell(source: SwiftTerm.TerminalView) {
        // Terminal bell - can trigger haptic feedback or sound
        // Currently not used, but available for future enhancements
    }
    
    /// Called when host current directory is updated
    nonisolated func hostCurrentDirectoryUpdate(source: SwiftTerm.TerminalView, directory: String?) {
        // Host directory changed - can be used for UI updates if needed
        // Currently not used, but available for future enhancements
    }
    
    /// Called when clipboard copy is requested
    nonisolated func clipboardCopy(source: SwiftTerm.TerminalView, content: Data) {
        // Clipboard copy requested - handled by TerminalView internally
        // No action needed
    }
    
    /// Called for iTerm content
    nonisolated func iTermContent(source: SwiftTerm.TerminalView, content: ArraySlice<UInt8>) {
        // iTerm-specific content - can be ignored for our use case
    }
    
    /// Called when terminal range changes (if notifyUpdateChanges is enabled)
    nonisolated func rangeChanged(source: SwiftTerm.TerminalView, startY: Int, endY: Int) {
        // Terminal display range changed - can be used for optimization if needed
        // Currently not used, but available for future enhancements
    }
    
    /// Called when link is requested to be opened
    /// This is called when user taps on a hyperlink in the terminal
    nonisolated func requestOpenLink(source: SwiftTerm.TerminalView, link: String, params: [String: String]) {
        // Open link in Safari or default browser
        Task { @MainActor in
            guard let url = URL(string: link) else {
                #if DEBUG
                print("[TerminalViewModel] Invalid URL: \(link)")
                #endif
                return
            }
            
            // Open URL using system URL handler
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            } else {
                #if DEBUG
                print("[TerminalViewModel] Cannot open URL: \(link)")
                #endif
            }
        }
    }
}

