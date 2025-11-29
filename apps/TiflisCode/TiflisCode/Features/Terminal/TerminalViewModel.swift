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

/// View model for terminal session management
@MainActor
final class TerminalViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published var isConnected = false
    @Published var error: String?
    @Published var terminalSize: (cols: Int, rows: Int) = (cols: 80, rows: 24)
    
    // MARK: - Terminal
    
    // Use lazy property to allow using 'self' in Terminal initializer
    // This avoids the need for a temporary delegate wrapper
    // Note: Terminal is recreated when we need to clear state (before loading replay)
    private var _terminal: Terminal?
    var terminal: Terminal {
        if let existing = _terminal {
            return existing
        }
        let term = Terminal(delegate: self)
        term.resize(cols: 80, rows: 24)
        _terminal = term
        return term
    }
    private var swiftTermView: SwiftTerm.TerminalView?
    
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
        
        // Terminal will be created on first access via computed property
        // It will be reset before loading replay to ensure clean state
        
        // Initialize terminal immediately to ensure it's ready
        _ = terminal
        
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
    
    /// Resets terminal by creating a new instance
    /// This clears the terminal state before loading replay
    private func resetTerminal() {
        // Create a new terminal instance to clear state
        // This is needed because SwiftTerm doesn't have a clear method
        _terminal = nil
        
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
        // Update Published property (direct assignment to wrapped value)
        terminalSize = (cols: cols, rows: rows)
        // Update thread-safe copy for nonisolated delegate access
        threadSafeTerminalSize = (cols: cols, rows: rows)
        
        // Update terminal size
        terminal.resize(cols: cols, rows: rows)
        
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
        if let terminalView = swiftTermView {
            // Feed directly to TerminalView's terminal (proper SwiftTerm pattern)
            if let data = content.data(using: .utf8) {
                let bytes = Array(data)
                terminalView.feed(byteArray: bytes[...])
            }
        } else {
            // TerminalView not yet available, feed to our Terminal
            // This maintains state until TerminalView is connected
            // Note: Terminal.feed(byteArray:) expects [UInt8], not ArraySlice
            if let data = content.data(using: .utf8) {
                let bytes = Array(data)
                terminal.feed(byteArray: bytes)
            }
        }
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
        
        // Feed replayed messages to terminal in order
        // Send them sequentially to preserve terminal state and cursor position
        for msg in messages {
            guard let content = msg["content"] as? String else {
                continue
            }
            
            // Feed to terminal view if available (for display), otherwise to terminal (for state)
            if let terminalView = swiftTermView {
                // Feed directly to TerminalView for immediate display
                if let data = content.data(using: .utf8) {
                    let bytes = Array(data)
                    terminalView.feed(byteArray: bytes[...])
                }
            } else {
                // TerminalView not yet available, feed to our Terminal to maintain state
                if let data = content.data(using: .utf8) {
                    terminal.feed(byteArray: [UInt8](data))
                }
            }
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
    
    /// Sets the SwiftTerm TerminalView instance for direct output feeding
    /// This allows us to feed output directly to the view's terminal for rendering
    /// When a new view is set, we reset the replay flag to allow loading history again
    func setTerminalView(_ view: SwiftTerm.TerminalView) {
        let isNewView = self.swiftTermView == nil || self.swiftTermView !== view
        self.swiftTermView = view
        
        // If this is a new view (e.g., after navigation), reset replay flag
        // This ensures we can load history when view reappears
        if isNewView {
            hasLoadedReplay = false
        }
    }
}

// MARK: - TerminalDelegate

extension TerminalViewModel: TerminalDelegate {
    /// Handles terminal input from SwiftTerm
    /// Called from non-main-actor context, so we bridge to main actor
    nonisolated func send(source: Terminal, data: ArraySlice<UInt8>) {
        // Convert bytes to Data
        let dataArray = Array(data)
        let dataToSend = Data(dataArray)
        
        // Bridge to main actor to access main-actor isolated properties and methods
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            self.sendInput(dataToSend)
        }
    }
    
    /// Returns terminal size
    /// Called from non-main-actor context, reads from thread-safe property
    nonisolated func requestTerminalSize(source: Terminal) -> (cols: Int, rows: Int) {
        // Read from thread-safe property (updated from main actor)
        return threadSafeTerminalSize
    }
}

