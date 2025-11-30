//
//  TerminalViewModel.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation
@preconcurrency import Combine
import SwiftTerm
import UIKit

/// View model for terminal session management
@MainActor
final class TerminalViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published var isConnected = false
    @Published var error: String?
    @Published var terminalSize: (cols: Int, rows: Int) = (cols: 80, rows: 24)
    
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
    
    // Thread-safe terminal size for nonisolated delegate access
    // Updated from main actor, read from nonisolated context
    nonisolated(unsafe) private var threadSafeTerminalSize: (cols: Int, rows: Int) = (80, 24)
    
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
        
        // Observe session updates (when temp session ID gets replaced with real one)
        observeSessionUpdates()
    }
    
    deinit {
        // Clean up subscriptions when ViewModel is deallocated
        // Note: We can't access @MainActor properties from deinit
        // The session will be unsubscribed when view disappears (onDisappear)
        // Cancellables will be cleaned up automatically when ViewModel is deallocated
    }
    
    /// Observes session updates from AppState (when session ID gets updated from temp to real)
    private func observeSessionUpdates() {
        // Observe response messages that contain the updated session ID
        connectionService.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                guard let self = self,
                      let messageType = message["type"] as? String,
                      messageType == "response",
                      let payload = message["payload"] as? [String: Any],
                      let sessionId = payload["session_id"] as? String,
                      let sessionType = payload["session_type"] as? String,
                      sessionType == "terminal",
                      sessionId != self.session.id else {
                    return
                }
                
                // If we're tracking the current session ID, this response updates it to the real ID
                // Update session to use the real ID from backend
                let updatedSession = Session(
                    id: sessionId,
                    type: .terminal,
                    workspace: self.session.workspace,
                    project: self.session.project
                )
                self.session = updatedSession
                self.knownSessionIds.insert(sessionId)
            }
            .store(in: &cancellables)
        
        // Also observe session.created messages
        connectionService.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                guard let self = self,
                      let messageType = message["type"] as? String,
                      messageType == "session.created",
                      let sessionId = message["session_id"] as? String,
                      let payload = message["payload"] as? [String: Any],
                      let sessionType = payload["session_type"] as? String,
                      sessionType == "terminal",
                      sessionId != self.session.id else {
                    return
                }
                
                // If we're tracking the current session ID, this broadcast updates it to the real ID
                let updatedSession = Session(
                    id: sessionId,
                    type: .terminal,
                    workspace: payload["workspace"] as? String,
                    project: payload["project"] as? String
                )
                self.session = updatedSession
                self.knownSessionIds.insert(sessionId)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Connection Observation
    
    private func observeConnectionState() {
        connectionService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self = self else { return }
                self.isConnected = state == .connected
                
                if self.isConnected {
                    // Auto-resubscribe and recover state on reconnection
                    Task { @MainActor [weak self] in
                        await self?.handleReconnection()
                    }
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
        
        // Reset terminal before subscribing to ensure clean state
        // This prevents duplicates when returning to terminal
        resetTerminal()
        
        let message: [String: Any] = [
            "type": "session.subscribe",
            "session_id": session.id
        ]
        
        do {
            try webSocketClient.sendMessage(message)
            isSubscribed = true
            
            // Reset replay flag when subscribing (new subscription = fresh load)
            hasLoadedReplay = false
            
            // Always request replay from beginning when subscribing
            // This ensures we load fresh state from server each time we return to terminal
            await recoverSessionState()
        } catch {
            self.error = "Failed to subscribe: \(error.localizedDescription)"
        }
    }
    
    /// Resets terminal state before loading replay
    /// Note: SwiftTerm doesn't provide a clear() method, so we reset the TerminalView reference
    /// This ensures clean state when returning to terminal or reloading history
    private func resetTerminal() {
        // SwiftTerm TerminalView doesn't expose clear/reset methods
        // Resetting the TerminalView reference will cause it to be recreated
        // This ensures TerminalView's internal terminal is fresh when we load replay
        
        // Reset the TerminalView reference
        // The view will be recreated when TerminalContentView.makeUIView is called
        swiftTermView = nil
        
        // Reset state flags
        hasLoadedReplay = false
    }
    
    func unsubscribeFromSession() {
        guard isSubscribed else { return }
        
        let message: [String: Any] = [
            "type": "session.unsubscribe",
            "session_id": session.id
        ]
        
        do {
            try webSocketClient.sendMessage(message)
            isSubscribed = false
            // Reset replay flag when unsubscribing
            hasLoadedReplay = false
        } catch {
            self.error = "Failed to unsubscribe: \(error.localizedDescription)"
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
        // Only resize if size actually changed
        guard terminalSize.cols != cols || terminalSize.rows != rows else {
            return
        }
        
        #if DEBUG
        let resizeStartTime = Date()
        #endif
        
        // Update Published property (direct assignment to wrapped value)
        terminalSize = (cols: cols, rows: rows)
        // Update thread-safe copy for nonisolated delegate access
        threadSafeTerminalSize = (cols: cols, rows: rows)
        
        // Update TerminalView's internal terminal size
        // Use TerminalView's resize method which handles both terminal and view updates
        if let terminalView = swiftTermView {
            terminalView.resize(cols: cols, rows: rows)
        }
        
        // Send resize message to server
        let message: [String: Any] = [
            "type": "session.resize",
            "session_id": session.id,
            "payload": [
                "cols": cols,
                "rows": rows
            ]
        ]
        
        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to resize terminal: \(error.localizedDescription)"
        }
        
        #if DEBUG
        let resizeDuration = Date().timeIntervalSince(resizeStartTime)
        lastSizeCalculationTime = Date()
        print("[TerminalViewModel] Terminal resize: \(cols)×\(rows), \(String(format: "%.3f", resizeDuration * 1000))ms")
        #endif
    }
    
    // MARK: - Message Handling
    
    private func handleMessage(_ message: [String: Any]) {
        guard let messageType = message["type"] as? String else { return }
        
        switch messageType {
        case "session.output":
            handleOutputMessage(message)
        case "session.replay.data":
            handleReplayMessage(message)
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
    
    private func handleOutputMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else {
            return
        }
        
        // Check if the message is for this session
        // The session ID might have been updated in AppState after creation
        // So we check both the current session.id and known session IDs
        let isOurSession = sessionId == session.id || knownSessionIds.contains(sessionId)
        
        if !isOurSession {
            // If we have a temp session and receive a message with a new ID, update it
            // This handles the case where AppState updated the session but we haven't received the response yet
            if session.type == .terminal && knownSessionIds.contains(session.id) {
                // This is likely our session with the updated ID from backend
                let updatedSession = Session(
                    id: sessionId,
                    type: .terminal,
                    workspace: session.workspace,
                    project: session.project
                )
                self.session = updatedSession
                self.knownSessionIds.insert(sessionId)
            } else {
                // Not our session, ignore
                return
            }
        }
        
        guard let payload = message["payload"] as? [String: Any],
              let contentType = payload["content_type"] as? String,
              contentType == "terminal",
              let content = payload["content"] as? String else {
            return
        }
        
        // Skip output messages if we're currently loading replay
        // This prevents duplicates when replay is being loaded
        // Once replay is loaded (hasLoadedReplay = true), we accept new output
        guard hasLoadedReplay else {
            // Replay is being loaded, ignore new output to avoid duplicates
            return
        }
        
        // Feed output to TerminalView for rendering
        // TerminalView manages its own Terminal instance for display
        #if DEBUG
        let feedStartTime = Date()
        feedOperationCount += 1
        #endif
        
        guard let terminalView = swiftTermView else {
            // TerminalView not yet available - output will be lost
            // This is acceptable as we'll load replay when view appears
            #if DEBUG
            print("[TerminalViewModel] Warning: Output received but TerminalView not available")
            #endif
            return
        }
        
        // Feed directly to TerminalView (proper SwiftTerm pattern)
        // Use optimized conversion to avoid intermediate Data allocation
        let bytes = content.utf8BytesSlice
        terminalView.feed(byteArray: bytes)
        
        #if DEBUG
        let feedDuration = Date().timeIntervalSince(feedStartTime)
        if feedOperationCount % 100 == 0 {
            print("[TerminalViewModel] Feed operation #\(feedOperationCount): \(String(format: "%.3f", feedDuration * 1000))ms, content size: \(content.utf8.count) bytes")
        }
        #endif
    }
    
    private func handleReplayMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              sessionId == session.id || knownSessionIds.contains(sessionId),
              let payload = message["payload"] as? [String: Any],
              let messages = payload["messages"] as? [[String: Any]] else {
            return
        }
        
        // Skip if we've already loaded replay (avoid duplicates)
        guard !hasLoadedReplay else {
            return
        }
        
        // Mark that we've loaded replay
        hasLoadedReplay = true
        
        guard !messages.isEmpty else {
            return
        }
        
        // Batch replay messages for better performance
        // Collect all content and feed in a single operation to reduce render passes
        #if DEBUG
        let replayStartTime = Date()
        #endif
        
        var batchedBytes: [UInt8] = []
        for msg in messages {
            guard let content = msg["content"] as? String else {
                continue
            }
            // Use optimized conversion and append to batch
            batchedBytes.append(contentsOf: content.utf8Bytes)
        }
        
        #if DEBUG
        let batchSize = batchedBytes.count
        #endif
        
        // Feed batched content to terminal in single operation
        guard let terminalView = swiftTermView else {
            // TerminalView not yet available - replay will be lost
            // This is acceptable as we'll request replay again when view appears
            #if DEBUG
            print("[TerminalViewModel] Warning: Replay received but TerminalView not available")
            #endif
            return
        }
        
        // Feed directly to TerminalView for immediate display
        terminalView.feed(byteArray: batchedBytes[...])
        
        #if DEBUG
        let replayDuration = Date().timeIntervalSince(replayStartTime)
        print("[TerminalViewModel] Replay batch: \(messages.count) messages, \(batchSize) bytes, \(String(format: "%.3f", replayDuration * 1000))ms")
        #endif
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
        
        // If this is a new view (e.g., after navigation), reset replay flag
        // This ensures we can load history when view reappears
        if isNewView {
            hasLoadedReplay = false
        }
    }
}

// MARK: - TerminalViewDelegate

extension TerminalViewModel: TerminalViewDelegate {
    /// Handles terminal input from SwiftTerm TerminalView
    /// TerminalView calls this when user types in the terminal
    /// Note: This is called from nonisolated context, so we use Task to access MainActor
    nonisolated func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
        // Convert bytes to Data (nonisolated operation)
        let dataArray = Array(data)
        let dataToSend = Data(dataArray)
        
        // Access MainActor-isolated properties via Task
        Task { @MainActor [weak self] in
            self?.sendInput(dataToSend)
        }
    }
    
    /// Called when terminal size changes
    /// Note: This is called from nonisolated context, so we use Task to access MainActor
    nonisolated func sizeChanged(source: SwiftTerm.TerminalView, newCols: Int, newRows: Int) {
        // Capture self weakly to avoid retain cycles
        // Access MainActor-isolated properties via Task
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            
            // Update our size tracking
            self.terminalSize = (cols: newCols, rows: newRows)
            // Update thread-safe copy (nonisolated(unsafe) property can be accessed from MainActor)
            self.threadSafeTerminalSize = (cols: newCols, rows: newRows)
            
            // Send resize message to server
            let message: [String: Any] = [
                "type": "session.resize",
                "session_id": self.session.id,
                "payload": [
                    "cols": newCols,
                    "rows": newRows
                ]
            ]
            
            do {
                try self.webSocketClient.sendMessage(message)
            } catch {
                self.error = "Failed to resize terminal: \(error.localizedDescription)"
            }
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

