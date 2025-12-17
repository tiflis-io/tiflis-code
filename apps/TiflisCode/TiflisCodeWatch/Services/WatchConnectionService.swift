//
//  WatchConnectionService.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import Combine
@preconcurrency import WatchConnectivity

/// Service that manages connection for watchOS via HTTP polling.
/// Since watchOS 9+ blocks direct WebSocket connections (NECP policy),
/// communication goes through HTTP polling to the tunnel server.
/// Credentials are still synced from iPhone via WatchConnectivity.
@MainActor
final class WatchConnectionService {
    // MARK: - Dependencies

    private let connectivityManager: WatchConnectivityManager
    let httpPollingService: HTTPPollingService  // Made public for debug access
    private weak var appState: WatchAppState?
    private let deviceIDManager: DeviceIDManaging

    // MARK: - Private State

    private var isConnecting = false
    private var cancellables = Set<AnyCancellable>()

    /// Sessions that are waiting for session.subscribed response with history
    /// Used to prevent race condition where session.output arrives before history
    private var pendingSubscriptions: Set<String> = []

    /// Sessions that have been successfully subscribed (received session.subscribed)
    /// Used to avoid re-subscribing and clearing messages when view re-appears
    private var subscribedSessions: Set<String> = []

    /// Timestamps when loading state was set locally (after sending command)
    /// Used to prevent history/sync responses from resetting loading state too quickly
    /// Key: sessionId ("supervisor" for supervisor), Value: timestamp when loading was set
    private var localLoadingSetTimes: [String: Date] = []

    /// Minimum time (seconds) to keep loading state after locally setting it
    /// This prevents race conditions where server response arrives before command is processed
    private let loadingProtectionInterval: TimeInterval = 2.0

    // MARK: - Initialization

    init(
        connectivityManager: WatchConnectivityManager,
        appState: WatchAppState,
        deviceIDManager: DeviceIDManaging? = nil
    ) {
        self.connectivityManager = connectivityManager
        self.appState = appState
        let deviceManager = deviceIDManager ?? DeviceIDManager()
        self.deviceIDManager = deviceManager
        self.httpPollingService = HTTPPollingService(deviceId: deviceManager.deviceID)

        // Subscribe to HTTP polling messages
        setupHTTPPollingSubscription()

        // Subscribe to credentials from WatchConnectivity
        setupCredentialSubscription()
    }

    /// Sets up subscription to receive messages from HTTP polling
    private func setupHTTPPollingSubscription() {
        httpPollingService.messageSubject
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleMessage(message)
            }
            .store(in: &cancellables)

        // Observe connection state changes
        // For HTTP polling, connect and auth happen in one request,
        // so isConnected=true means fully authenticated
        httpPollingService.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (connected: Bool) in
                guard let self = self else { return }
                if connected {
                    // HTTP polling combines connect+auth, so we go straight to .authenticated
                    self.appState?.connectionState = .authenticated
                } else if self.appState?.connectionState == .authenticated {
                    self.appState?.connectionState = .disconnected
                }
            }
            .store(in: &cancellables)

        httpPollingService.$workstationOnline
            .receive(on: DispatchQueue.main)
            .sink { [weak self] online in
                self?.appState?.workstationOnline = online
            }
            .store(in: &cancellables)
    }

    /// Sets up subscription to credentials from WatchConnectivity
    private func setupCredentialSubscription() {
        connectivityManager.$credentials
            .compactMap { $0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] credentials in
                guard let self = self, credentials.isValid else { return }
                NSLog("⌚️ WatchConnectionService: Received credentials, configuring HTTP polling")
                self.httpPollingService.configure(
                    tunnelURL: credentials.tunnelURL,
                    tunnelId: credentials.tunnelId,
                    authKey: credentials.authKey
                )
            }
            .store(in: &cancellables)
    }

    // MARK: - Public Methods

    /// Connects to the workstation via HTTP polling
    func connect() async throws {
        NSLog("⌚️ WatchConnectionService.connect() called - using HTTP polling")
        guard !isConnecting else {
            NSLog("⌚️ WatchConnectionService: Already connecting, skipping")
            return
        }

        // Check if we have credentials
        guard let credentials = connectivityManager.credentials, credentials.isValid else {
            NSLog("⌚️ WatchConnectionService: No valid credentials")
            appState?.connectionState = .error("Sync from iPhone")
            // Try to get credentials from iPhone
            connectivityManager.startCredentialSync()
            throw ConnectionError.missingCredentials
        }

        isConnecting = true
        appState?.connectionState = .connecting

        // Configure HTTP polling service with credentials
        httpPollingService.configure(
            tunnelURL: credentials.tunnelURL,
            tunnelId: credentials.tunnelId,
            authKey: credentials.authKey
        )

        do {
            try await httpPollingService.connect()
            isConnecting = false
            NSLog("⌚️ WatchConnectionService: Connected via HTTP polling")

            // Request sync after connection
            await requestSync()
        } catch {
            isConnecting = false
            let shortError = shortenErrorMessage(error.localizedDescription)
            appState?.connectionState = .error(shortError)
            NSLog("⌚️ WatchConnectionService: Connection failed: %@", error.localizedDescription)
            throw error
        }
    }

    /// Shortens error messages for Watch display
    private func shortenErrorMessage(_ message: String) -> String {
        if message.contains("could not connect") || message.contains("connection closed") {
            return "Connection failed"
        }
        if message.contains("offline") {
            return "Workstation offline"
        }
        if message.contains("timeout") {
            return "Connection timeout"
        }
        if message.contains("not configured") {
            return "Sync from iPhone"
        }
        if message.count > 30 {
            return String(message.prefix(27)) + "..."
        }
        return message
    }

    /// Disconnects from the workstation
    func disconnect() {
        httpPollingService.disconnect()
        appState?.connectionState = .disconnected
        // Clear subscription tracking on disconnect
        pendingSubscriptions.removeAll()
        subscribedSessions.removeAll()
        localLoadingSetTimes.removeAll()
    }

    // MARK: - Loading State Management

    /// Set loading state locally and record timestamp to prevent premature reset
    private func setLocalLoadingState(sessionId: String, isLoading: Bool) {
        if isLoading {
            localLoadingSetTimes[sessionId] = Date()
        } else {
            localLoadingSetTimes.removeValue(forKey: sessionId)
        }

        if sessionId == "supervisor" {
            appState?.supervisorIsLoading = isLoading
        } else {
            appState?.agentIsLoading[sessionId] = isLoading
        }
    }

    /// Check if we should allow resetting loading state from server response
    /// Returns false if loading was set locally too recently (prevents race conditions)
    private func canResetLoadingState(sessionId: String) -> Bool {
        guard let setTime = localLoadingSetTimes[sessionId] else {
            return true // No local loading set, allow reset
        }
        let elapsed = Date().timeIntervalSince(setTime)
        return elapsed >= loadingProtectionInterval
    }

    /// Update loading state from server response, respecting local loading protection
    private func updateLoadingStateFromServer(sessionId: String, isExecuting: Bool) {
        if isExecuting {
            // Server says executing - always set to true
            if sessionId == "supervisor" {
                appState?.supervisorIsLoading = true
            } else {
                appState?.agentIsLoading[sessionId] = true
            }
        } else {
            // Server says not executing - only reset if protection period has passed
            if canResetLoadingState(sessionId: sessionId) {
                if sessionId == "supervisor" {
                    appState?.supervisorIsLoading = false
                } else {
                    appState?.agentIsLoading[sessionId] = false
                }
                localLoadingSetTimes.removeValue(forKey: sessionId)
            } else {
                NSLog("⌚️ WatchConnectionService: Ignoring is_executing=false for %@ (protection period active)", sessionId)
            }
        }
    }

    // MARK: - Sending Commands

    /// Sends a message via HTTP
    private func sendHTTPMessage(_ message: [String: Any]) async throws {
        try await httpPollingService.sendCommand(message)
    }

    /// Sends a text command to the supervisor
    func sendSupervisorCommand(text: String, messageId: String) async {
        // Set loading protection to prevent race condition with sync/history responses
        setLocalLoadingState(sessionId: "supervisor", isLoading: true)

        let requestId = UUID().uuidString
        let message: [String: Any] = [
            "type": "supervisor.command",
            "id": requestId,
            "payload": [
                "command": text,
                "message_id": messageId
            ]
        ]

        do {
            try await sendHTTPMessage(message)
            print("⌚️ WatchConnectionService: Sent supervisor command via HTTP")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send supervisor command: %@", error.localizedDescription)
        }
    }

    /// Sends a voice command to the supervisor
    func sendSupervisorVoiceCommand(audioData: Data, format: String, messageId: String) async {
        // Set loading protection to prevent race condition with sync/history responses
        setLocalLoadingState(sessionId: "supervisor", isLoading: true)

        let requestId = UUID().uuidString
        let base64Audio = audioData.base64EncodedString()

        NSLog("⌚️ WatchConnectionService: Sending supervisor voice command - audioSize=%d, format=%@, messageId=%@",
              audioData.count, format, messageId)

        let message: [String: Any] = [
            "type": "supervisor.command",
            "id": requestId,
            "payload": [
                "audio": base64Audio,
                "audio_format": format,
                "message_id": messageId
            ]
        ]

        do {
            try await sendHTTPMessage(message)
            NSLog("⌚️ WatchConnectionService: Sent supervisor voice command via HTTP successfully")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send supervisor voice command: %@", error.localizedDescription)
        }
    }

    /// Sends a text command to an agent session
    func sendAgentCommand(text: String, sessionId: String, messageId: String) async {
        // Set loading protection to prevent race condition with sync/history responses
        setLocalLoadingState(sessionId: sessionId, isLoading: true)

        let requestId = UUID().uuidString
        let message: [String: Any] = [
            "type": "session.execute",
            "id": requestId,
            "session_id": sessionId,
            "payload": [
                "content": text,
                "message_id": messageId
            ]
        ]

        do {
            try await sendHTTPMessage(message)
            print("⌚️ WatchConnectionService: Sent agent command to \(sessionId) via HTTP")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send agent command: %@", error.localizedDescription)
        }
    }

    /// Sends a voice command to an agent session
    func sendAgentVoiceCommand(audioData: Data, format: String, sessionId: String, messageId: String) async {
        // Set loading protection to prevent race condition with sync/history responses
        setLocalLoadingState(sessionId: sessionId, isLoading: true)

        let requestId = UUID().uuidString
        let base64Audio = audioData.base64EncodedString()

        NSLog("⌚️ WatchConnectionService: Sending agent voice command - sessionId=%@, audioSize=%d, format=%@, messageId=%@",
              sessionId, audioData.count, format, messageId)

        let message: [String: Any] = [
            "type": "session.execute",
            "id": requestId,
            "session_id": sessionId,
            "payload": [
                "audio": base64Audio,
                "audio_format": format,
                "message_id": messageId
            ]
        ]

        do {
            try await sendHTTPMessage(message)
            NSLog("⌚️ WatchConnectionService: Sent agent voice command to %@ via HTTP successfully", sessionId)
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send agent voice command: %@", error.localizedDescription)
        }
    }

    /// Requests state sync from workstation (lightweight mode - no chat histories)
    func requestSync() async {
        let message: [String: Any] = [
            "type": "sync",
            "id": UUID().uuidString,
            "lightweight": true  // watchOS: skip message histories to reduce data transfer
        ]

        do {
            try await sendHTTPMessage(message)
            print("⌚️ WatchConnectionService: Sent lightweight sync request via HTTP")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send sync request: %@", error.localizedDescription)
        }
    }

    /// Requests chat history for a specific session (or supervisor if sessionId is nil)
    /// Called when user opens a chat detail view
    func requestHistory(sessionId: String?) async {
        var payload: [String: Any] = [:]
        if let sessionId = sessionId {
            payload["session_id"] = sessionId
        }

        let message: [String: Any] = [
            "type": "history.request",
            "id": UUID().uuidString,
            "payload": payload
        ]

        do {
            try await sendHTTPMessage(message)
            let target = sessionId ?? "supervisor"
            print("⌚️ WatchConnectionService: Sent history request for \(target) via HTTP")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send history request: %@", error.localizedDescription)
        }
    }

    /// Subscribe to an agent session to receive real-time updates
    /// This is required for agent chats - without subscription, session.output messages won't be received
    func subscribeToSession(sessionId: String) async {
        // Skip if already subscribed - avoid clearing messages when view re-appears
        if subscribedSessions.contains(sessionId) {
            NSLog("⌚️ WatchConnectionService: Session %@ already subscribed, skipping", sessionId)
            return
        }

        // Mark as pending to prevent race condition with session.output messages
        // that arrive via polling before session.subscribed response
        pendingSubscriptions.insert(sessionId)
        NSLog("⌚️ WatchConnectionService: Marking session %@ as pending subscription", sessionId)

        let message: [String: Any] = [
            "type": "session.subscribe",
            "id": UUID().uuidString,
            "session_id": sessionId
        ]

        do {
            try await sendHTTPMessage(message)
            NSLog("⌚️ WatchConnectionService: Subscribed to session %@", sessionId)
        } catch {
            // Remove from pending if subscribe failed
            pendingSubscriptions.remove(sessionId)
            NSLog("⌚️ WatchConnectionService: Failed to subscribe to session: %@", error.localizedDescription)
        }
    }

    /// Unsubscribe from an agent session
    func unsubscribeFromSession(sessionId: String) async {
        let message: [String: Any] = [
            "type": "session.unsubscribe",
            "id": UUID().uuidString,
            "session_id": sessionId
        ]

        do {
            try await sendHTTPMessage(message)
            NSLog("⌚️ WatchConnectionService: Unsubscribed from session %@", sessionId)
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to unsubscribe from session: %@", error.localizedDescription)
        }
    }

    /// Cancel supervisor generation
    func cancelSupervisor() async {
        let message: [String: Any] = [
            "type": "supervisor.cancel",
            "id": UUID().uuidString
        ]

        do {
            try await sendHTTPMessage(message)
            // Clear loading protection and set loading to false
            setLocalLoadingState(sessionId: "supervisor", isLoading: false)
            NSLog("⌚️ WatchConnectionService: Cancelled supervisor generation")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to cancel supervisor: %@", error.localizedDescription)
        }
    }

    /// Cancel agent session generation
    func cancelSession(sessionId: String) async {
        let message: [String: Any] = [
            "type": "session.cancel",
            "id": UUID().uuidString,
            "session_id": sessionId
        ]

        do {
            try await sendHTTPMessage(message)
            // Clear loading protection and set loading to false
            setLocalLoadingState(sessionId: sessionId, isLoading: false)
            NSLog("⌚️ WatchConnectionService: Cancelled session %@", sessionId)
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to cancel session: %@", error.localizedDescription)
        }
    }

    // MARK: - Message Handling

    private func handleMessage(_ message: [String: Any]) {
        guard let messageType = message["type"] as? String else {
            appState?.debugLastMessageHandled = "No type field"
            return
        }

        // Update debug state
        appState?.debugLastMessageHandled = messageType

        switch messageType {
        case "sync.state":
            handleSyncState(message)

        case "supervisor.output":
            handleSupervisorOutput(message)

        case "supervisor.transcription":
            handleSupervisorTranscription(message)

        case "supervisor.voice_output":
            handleVoiceOutput(message, sessionId: "supervisor")

        case "session.output":
            handleSessionOutput(message)

        case "session.transcription":
            handleSessionTranscription(message)

        case "session.voice_output":
            if let sessionId = message["session_id"] as? String {
                handleVoiceOutput(message, sessionId: sessionId)
            }

        case "session.created":
            handleSessionCreated(message)

        case "session.terminated":
            handleSessionTerminated(message)

        case "session.user_message":
            handleUserMessage(message)

        case "history.response":
            handleHistoryResponse(message)

        case "audio.response":
            handleAudioResponse(message)

        case "connection.workstation_offline":
            appState?.workstationOnline = false

        case "connection.workstation_online":
            appState?.workstationOnline = true

        case "error":
            // Handle error messages from the server
            let errorPayload = message["payload"] as? [String: Any]
            let errorCode = errorPayload?["code"] as? String ?? "UNKNOWN"
            let errorMessage = errorPayload?["message"] as? String ?? "Unknown error"
            let relatedId = message["id"] as? String
            NSLog("⌚️ WatchConnectionService: Server error - code=%@, message=%@, id=%@",
                  errorCode, errorMessage, relatedId ?? "none")

            // Don't change connection state for command errors - the connection may still be valid
            // The UNAUTHENTICATED error for a command doesn't mean the whole connection is broken
            // (sync and other operations may still work while device_id registration catches up)

        case "auth.success":
            // Device authenticated successfully with workstation
            NSLog("⌚️ WatchConnectionService: auth.success received - device authenticated")
            appState?.connectionState = .authenticated

        case "supervisor.user_message":
            // User message from another device - add to supervisor messages
            handleSupervisorUserMessage(message)

        case "session.subscribed":
            // Response to session.subscribe - contains session history
            handleSessionSubscribed(message)

        case "supervisor.context_cleared":
            // Supervisor context was cleared - could refresh supervisor messages
            NSLog("⌚️ WatchConnectionService: supervisor.context_cleared received")
            appState?.clearSupervisorMessages()

        default:
            print("⌚️ WatchConnectionService: Unhandled message type: \(messageType)")
        }
    }

    private func handleHistoryResponse(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any] else {
            NSLog("⌚️ WatchConnectionService: history.response has no payload")
            return
        }

        // Check for error
        if let error = payload["error"] as? String {
            NSLog("⌚️ WatchConnectionService: history.response error: %@", error)
            return
        }

        let sessionId = payload["session_id"] as? String  // nil means supervisor
        let isSupervisor = sessionId == nil

        guard let history = payload["history"] as? [[String: Any]] else {
            NSLog("⌚️ WatchConnectionService: history.response has no history array")
            return
        }

        // Limit to last 10 messages (5 request-response pairs) for watchOS performance
        let limitedHistory = history.suffix(10)
        NSLog("⌚️ WatchConnectionService: history.response for %@ loading %d of %d messages",
              sessionId ?? "supervisor", limitedHistory.count, history.count)

        // Parse and add messages
        if isSupervisor {
            // Save pending user messages (those with voiceInput blocks waiting for transcription)
            let pendingSupervisorMessages = appState?.supervisorMessages.filter { message in
                message.role == .user && message.contentBlocks.contains { block in
                    if case .voiceInput = block { return true }
                    return false
                }
            } ?? []

            // Clear existing supervisor messages before loading history
            appState?.clearSupervisorMessages()
            for msgData in limitedHistory {
                if let msg = parseHistoryMessage(msgData, sessionId: "supervisor") {
                    appState?.addSupervisorMessage(msg)
                }
            }

            // Re-add pending user messages that weren't in history
            for pendingMsg in pendingSupervisorMessages {
                let alreadyExists = appState?.supervisorMessages.contains { $0.id == pendingMsg.id } ?? false
                if !alreadyExists {
                    appState?.addSupervisorMessage(pendingMsg)
                    NSLog("⌚️ WatchConnectionService: Preserved pending supervisor user message %@", pendingMsg.id)
                }
            }

            // Update loading state (with protection against race conditions)
            if let isExecuting = payload["is_executing"] as? Bool {
                updateLoadingStateFromServer(sessionId: "supervisor", isExecuting: isExecuting)
            }
        } else if let sessionId = sessionId {
            // Save pending user messages (those with voiceInput blocks waiting for transcription)
            let pendingAgentMessages = appState?.agentMessages[sessionId]?.filter { message in
                message.role == .user && message.contentBlocks.contains { block in
                    if case .voiceInput = block { return true }
                    return false
                }
            } ?? []

            // Clear existing messages for this session before loading history
            appState?.clearAgentMessages(for: sessionId)
            for msgData in limitedHistory {
                if let msg = parseHistoryMessage(msgData, sessionId: sessionId) {
                    appState?.addAgentMessage(msg, for: sessionId)
                }
            }

            // Re-add pending user messages that weren't in history
            for pendingMsg in pendingAgentMessages {
                let alreadyExists = appState?.agentMessages[sessionId]?.contains { $0.id == pendingMsg.id } ?? false
                if !alreadyExists {
                    appState?.addAgentMessage(pendingMsg, for: sessionId)
                    NSLog("⌚️ WatchConnectionService: Preserved pending agent user message %@", pendingMsg.id)
                }
            }

            // Update loading state (with protection against race conditions)
            if let isExecuting = payload["is_executing"] as? Bool {
                updateLoadingStateFromServer(sessionId: sessionId, isExecuting: isExecuting)
            }
            // Handle current streaming blocks if joining mid-stream
            if let streamingBlocks = payload["current_streaming_blocks"] as? [[String: Any]], !streamingBlocks.isEmpty {
                let blocks = parseContentBlocks(streamingBlocks)
                let streamingMessage = Message(
                    id: UUID().uuidString,
                    sessionId: sessionId,
                    role: .assistant,
                    contentBlocks: blocks,
                    isStreaming: true
                )
                appState?.addAgentMessage(streamingMessage, for: sessionId)
            }
        }

        NSLog("⌚️ WatchConnectionService: history.response processed")
    }

    private func handleSyncState(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any] else {
            appState?.debugLastSyncState = "No payload"
            NSLog("⌚️ WatchConnectionService: sync.state has no payload")
            return
        }

        NSLog("⌚️ WatchConnectionService: sync.state payload keys: %@", payload.keys.joined(separator: ", "))

        // Update supervisor loading state from sync (with protection against race conditions)
        if let supervisorIsExecuting = payload["supervisorIsExecuting"] as? Bool {
            updateLoadingStateFromServer(sessionId: "supervisor", isExecuting: supervisorIsExecuting)
            NSLog("⌚️ WatchConnectionService: sync.state supervisorIsExecuting=%d", supervisorIsExecuting ? 1 : 0)
        }

        // Update agent loading states from sync (with protection against race conditions)
        if let executingStates = payload["executingStates"] as? [String: Bool] {
            for (sessionId, isExecuting) in executingStates {
                updateLoadingStateFromServer(sessionId: sessionId, isExecuting: isExecuting)
            }
            NSLog("⌚️ WatchConnectionService: sync.state updated %d agent executing states", executingStates.count)
        }

        // Handle sessions
        if let sessionsData = payload["sessions"] as? [[String: Any]] {
            appState?.debugSyncSessionCount = sessionsData.count
            NSLog("⌚️ WatchConnectionService: sync.state has %d sessions", sessionsData.count)
            var parsedSessions = 0
            for sessionData in sessionsData {
                if let session = parseSession(sessionData) {
                    appState?.updateSession(session)
                    parsedSessions += 1
                }
            }
            appState?.debugSyncParsedCount = parsedSessions
            appState?.debugLastSyncState = "Sessions: \(sessionsData.count), Parsed: \(parsedSessions)"
            NSLog("⌚️ WatchConnectionService: parsed and added %d agent sessions, appState.sessions.count=%d, agentSessions.count=%d",
                  parsedSessions,
                  appState?.sessions.count ?? -1,
                  appState?.agentSessions.count ?? -1)
        } else {
            appState?.debugLastSyncState = "No sessions array"
            NSLog("⌚️ WatchConnectionService: sync.state has NO sessions array!")
        }

        // Handle supervisor history (only present in non-lightweight mode)
        // In lightweight mode, history is loaded on-demand via history.request
        if let history = payload["supervisorHistory"] as? [[String: Any]] {
            // Limit to last 10 messages (5 request-response pairs) for watchOS performance
            let limitedHistory = history.suffix(10)
            NSLog("⌚️ WatchConnectionService: sync.state loading %d of %d supervisor messages",
                  limitedHistory.count, history.count)
            var parsedCount = 0
            for msgData in limitedHistory {
                if let msg = parseHistoryMessage(msgData, sessionId: "supervisor") {
                    appState?.addSupervisorMessage(msg)
                    parsedCount += 1
                }
            }
            appState?.debugLastSyncState += ", SupervisorMsgs: \(parsedCount)"
            NSLog("⌚️ WatchConnectionService: parsed %d supervisor messages", parsedCount)
        } else {
            // Lightweight mode - histories will be loaded on-demand
            appState?.debugLastSyncState += ", Lightweight (no histories)"
            NSLog("⌚️ WatchConnectionService: sync.state is lightweight (no histories)")
        }

        // Handle agent histories (only present in non-lightweight mode)
        if let agentHistories = payload["agentHistories"] as? [String: [[String: Any]]] {
            NSLog("⌚️ WatchConnectionService: sync.state has %d agent histories", agentHistories.count)
            for (sessionId, history) in agentHistories {
                // Limit to last 10 messages (5 request-response pairs) for watchOS performance
                let limitedHistory = history.suffix(10)
                NSLog("⌚️ WatchConnectionService: agent %@ loading %d of %d messages",
                      sessionId, limitedHistory.count, history.count)
                for msgData in limitedHistory {
                    if let msg = parseHistoryMessage(msgData, sessionId: sessionId) {
                        appState?.addAgentMessage(msg, for: sessionId)
                    }
                }
            }
        }

        NSLog("⌚️ WatchConnectionService: sync.state processed, supervisorMessages=%d",
              appState?.supervisorMessages.count ?? 0)
        print("⌚️ WatchConnectionService: Sync state received")
    }

    private func handleSupervisorOutput(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any] else { return }

        // Default to false (streaming) if not specified - server streams incrementally
        let isComplete = payload["is_complete"] as? Bool ?? false

        // Always set loading indicator when streaming (command might be from another device)
        // This ensures progress shows even for first message with empty/filtered blocks
        // Note: This is from server, so it overrides any local protection
        if !isComplete {
            setLocalLoadingState(sessionId: "supervisor", isLoading: true)
            NSLog("⌚️ WatchConnectionService: supervisor.output setting supervisorIsLoading=true")
        }

        // Get or create assistant message
        let messageId = message["id"] as? String ?? UUID().uuidString

        if let existingIndex = appState?.supervisorMessages.firstIndex(where: { $0.id == messageId && $0.role == .assistant }) {
            // Update existing streaming message
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                let blocks = parseContentBlocks(contentBlocks)
                appState?.supervisorMessages[existingIndex].contentBlocks = blocks
                appState?.supervisorMessages[existingIndex].isStreaming = !isComplete
            }
        } else {
            // Create new assistant message
            var blocks: [MessageContentBlock] = []
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                blocks = parseContentBlocks(contentBlocks)
            } else if let content = payload["content"] as? String {
                blocks = [.text(id: UUID().uuidString, text: content)]
            }

            // Only create message if we have actual content blocks
            // Don't create empty streaming messages - they show unwanted dots
            guard !blocks.isEmpty else {
                NSLog("⌚️ WatchConnectionService: Skipping empty supervisor message")
                return
            }

            let newMessage = Message(
                id: messageId,
                sessionId: "supervisor",
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: !isComplete
            )
            appState?.addSupervisorMessage(newMessage)
        }

        if isComplete {
            // Server confirms completion - clear loading and protection
            setLocalLoadingState(sessionId: "supervisor", isLoading: false)
        }
    }

    private func handleSessionOutput(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any] else {
            NSLog("⌚️ WatchConnectionService: session.output missing sessionId or payload")
            return
        }

        // Skip messages for sessions that are waiting for session.subscribed response
        // This prevents race condition where session.output arrives before history is loaded
        if pendingSubscriptions.contains(sessionId) {
            NSLog("⌚️ WatchConnectionService: session.output skipped for pending session %@ (waiting for history)", sessionId)
            return
        }

        // Default to false (streaming) if not specified - server streams incrementally
        let isComplete = payload["is_complete"] as? Bool ?? false
        let messageId = message["id"] as? String ?? UUID().uuidString

        // Always set loading indicator when streaming (command might be from another device)
        // This ensures progress shows even for first message with empty/filtered blocks
        // Note: This is from server, so it overrides any local protection
        if !isComplete {
            setLocalLoadingState(sessionId: sessionId, isLoading: true)
            NSLog("⌚️ WatchConnectionService: session.output setting agentIsLoading=true for %@", sessionId)
        }

        NSLog("⌚️ WatchConnectionService: session.output for %@, messageId=%@, isComplete=%d",
              sessionId, messageId, isComplete ? 1 : 0)

        if var messages = appState?.agentMessages[sessionId],
           let existingIndex = messages.firstIndex(where: { $0.id == messageId && $0.role == .assistant }) {
            // Update existing message
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                let blocks = parseContentBlocks(contentBlocks)
                messages[existingIndex].contentBlocks = blocks
                messages[existingIndex].isStreaming = !isComplete
                appState?.agentMessages[sessionId] = messages
                NSLog("⌚️ WatchConnectionService: Updated existing message, blocks=%d", blocks.count)
            }
        } else {
            // Create new assistant message
            var blocks: [MessageContentBlock] = []
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                blocks = parseContentBlocks(contentBlocks)
            } else if let content = payload["content"] as? String {
                blocks = [.text(id: UUID().uuidString, text: content)]
            }

            // Only create message if we have actual content blocks
            // Don't create empty streaming messages - they show unwanted dots
            guard !blocks.isEmpty else {
                NSLog("⌚️ WatchConnectionService: Skipping empty agent message for %@", sessionId)
                return
            }

            let newMessage = Message(
                id: messageId,
                sessionId: sessionId,
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: !isComplete
            )
            appState?.addAgentMessage(newMessage, for: sessionId)
            NSLog("⌚️ WatchConnectionService: Created new message, blocks=%d", blocks.count)
        }

        if isComplete {
            // Server confirms completion - clear loading and protection
            setLocalLoadingState(sessionId: sessionId, isLoading: false)
        }
    }

    private func handleSupervisorTranscription(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any],
              let text = payload["text"] as? String,
              let messageId = payload["message_id"] as? String else {
            NSLog("⌚️ WatchConnectionService: supervisor.transcription missing required fields")
            return
        }

        NSLog("⌚️ WatchConnectionService: Received supervisor transcription - messageId=%@, text=%@",
              messageId, String(text.prefix(50)))

        // Update the user message with transcription
        appState?.updateMessage(id: messageId, sessionId: "supervisor") { msg in
            // Replace voice input block with text
            if let voiceIndex = msg.contentBlocks.firstIndex(where: {
                if case .voiceInput = $0 { return true }
                return false
            }) {
                msg.contentBlocks[voiceIndex] = .text(id: UUID().uuidString, text: text)
                NSLog("⌚️ WatchConnectionService: Updated supervisor message with transcription")
            } else {
                NSLog("⌚️ WatchConnectionService: No voice input block found in supervisor message")
            }
        }
    }

    private func handleSessionTranscription(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let text = payload["text"] as? String,
              let messageId = payload["message_id"] as? String else {
            NSLog("⌚️ WatchConnectionService: session.transcription missing required fields")
            return
        }

        NSLog("⌚️ WatchConnectionService: Received session transcription - sessionId=%@, messageId=%@, text=%@",
              sessionId, messageId, String(text.prefix(50)))

        appState?.updateMessage(id: messageId, sessionId: sessionId) { msg in
            if let voiceIndex = msg.contentBlocks.firstIndex(where: {
                if case .voiceInput = $0 { return true }
                return false
            }) {
                msg.contentBlocks[voiceIndex] = .text(id: UUID().uuidString, text: text)
                NSLog("⌚️ WatchConnectionService: Updated agent message with transcription")
            } else {
                NSLog("⌚️ WatchConnectionService: No voice input block found in agent message %@", messageId)
            }
        }
    }

    private func handleVoiceOutput(_ message: [String: Any], sessionId: String) {
        guard let payload = message["payload"] as? [String: Any],
              let audioBase64 = payload["audio"] as? String else { return }

        // Decode audio
        guard let audioData = Data(base64Encoded: audioBase64) else { return }

        let duration = payload["duration"] as? Double ?? 0

        // Use server's message_id for audio lookup (enables replay from server if cache miss)
        // Falls back to random UUID if not provided
        let audioId = payload["message_id"] as? String ?? UUID().uuidString

        // Check if this voice output was initiated by this device
        // Auto-play only if from_device_id matches our device ID (like iOS/Android)
        let fromDeviceId = payload["from_device_id"] as? String
        let myDeviceId = deviceIDManager.deviceID
        let isFromThisDevice = fromDeviceId != nil && fromDeviceId == myDeviceId

        NSLog("⌚️ WatchConnectionService: handleVoiceOutput audioId=%@, duration=%f, from=%@, me=%@, isFromThis=%d",
              audioId, duration, fromDeviceId ?? "nil", myDeviceId, isFromThisDevice ? 1 : 0)

        // Store in cache (actor-isolated)
        Task {
            await WatchAudioCache.shared.store(audioData, forId: audioId)
        }

        // Create voice output block
        let voiceOutputBlock = MessageContentBlock.voiceOutput(
            id: audioId,
            audioURL: nil,
            text: audioId,  // Store audioId for cache lookup (same as server's message_id)
            duration: duration
        )

        // Add to last assistant message
        if sessionId == "supervisor" {
            appState?.appendBlockToLastAssistantMessage(voiceOutputBlock, sessionId: nil)
        } else {
            appState?.appendBlockToLastAssistantMessage(voiceOutputBlock, sessionId: sessionId)
        }

        // Voice output means the agent has finished working - reset loading state immediately
        // This provides faster feedback than waiting for the next sync or is_complete message
        // Clear loading protection since server confirms completion
        if sessionId == "supervisor" {
            setLocalLoadingState(sessionId: "supervisor", isLoading: false)
            NSLog("⌚️ WatchConnectionService: voice_output received, setting supervisorIsLoading=false")
        } else {
            setLocalLoadingState(sessionId: sessionId, isLoading: false)
            NSLog("⌚️ WatchConnectionService: voice_output received, setting agentIsLoading[%@]=false", sessionId)
        }

        // Post notification for auto-playback
        // Include shouldAutoPlay flag - only true if initiated from this device
        // Include audioId for tracking which specific audio is playing
        NotificationCenter.default.post(
            name: NSNotification.Name("WatchTTSAudioReceived"),
            object: nil,
            userInfo: [
                "audioData": audioData,
                "audioId": audioId,
                "sessionId": sessionId,
                "shouldAutoPlay": isFromThisDevice
            ]
        )
    }

    private func handleAudioResponse(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any],
              let messageId = payload["message_id"] as? String else {
            NSLog("⌚️ WatchConnectionService: audio.response missing required fields")
            return
        }

        if let error = payload["error"] as? String {
            NSLog("⌚️ WatchConnectionService: audio.response error for %@: %@", messageId, error)
            // Notify of error
            NotificationCenter.default.post(
                name: NSNotification.Name("WatchAudioResponseReceived"),
                object: nil,
                userInfo: ["messageId": messageId, "error": error]
            )
            return
        }

        guard let audioBase64 = payload["audio"] as? String,
              let audioData = Data(base64Encoded: audioBase64) else {
            NSLog("⌚️ WatchConnectionService: audio.response has no valid audio data")
            return
        }

        NSLog("⌚️ WatchConnectionService: audio.response received for %@, size=%d", messageId, audioData.count)

        // Cache the audio
        Task {
            await WatchAudioCache.shared.store(audioData, forId: messageId)
        }

        // Notify that audio is ready
        NotificationCenter.default.post(
            name: NSNotification.Name("WatchAudioResponseReceived"),
            object: nil,
            userInfo: ["messageId": messageId, "audioData": audioData]
        )
    }

    /// Request audio from workstation for replay
    func requestAudio(messageId: String) async {
        let message: [String: Any] = [
            "type": "audio.request",
            "id": UUID().uuidString,
            "payload": [
                "message_id": messageId,
                "type": "output"
            ]
        ]

        do {
            try await sendHTTPMessage(message)
            NSLog("⌚️ WatchConnectionService: Requested audio for messageId=%@", messageId)
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to request audio: %@", error.localizedDescription)
        }
    }

    private func handleSessionCreated(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any] else { return }

        var sessionData = payload
        sessionData["session_id"] = sessionId
        sessionData["status"] = "active"

        if let session = parseSession(sessionData) {
            appState?.updateSession(session)
        }
    }

    private func handleSessionTerminated(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else { return }
        appState?.removeSession(id: sessionId)
        // Clear subscription tracking for terminated session
        pendingSubscriptions.remove(sessionId)
        subscribedSessions.remove(sessionId)
    }

    private func handleUserMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let content = payload["content"] as? String,
              let fromDeviceId = payload["from_device_id"] as? String else { return }

        // Skip if this is from the same device
        if fromDeviceId == deviceIDManager.deviceID { return }

        let userMessage = Message(
            sessionId: sessionId,
            role: .user,
            content: content
        )

        if sessionId == "supervisor" {
            appState?.addSupervisorMessage(userMessage)
        } else {
            appState?.addAgentMessage(userMessage, for: sessionId)
        }
    }

    /// Handle user message sent from another device to supervisor
    private func handleSupervisorUserMessage(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any],
              let content = payload["content"] as? String,
              let fromDeviceId = payload["from_device_id"] as? String else {
            NSLog("⌚️ WatchConnectionService: supervisor.user_message missing required fields")
            return
        }

        // Skip if this is from the same device
        if fromDeviceId == deviceIDManager.deviceID {
            NSLog("⌚️ WatchConnectionService: Skipping own supervisor.user_message")
            return
        }

        NSLog("⌚️ WatchConnectionService: supervisor.user_message from other device: %@", String(content.prefix(50)))

        let userMessage = Message(
            sessionId: "supervisor",
            role: .user,
            content: content
        )
        appState?.addSupervisorMessage(userMessage)

        // Set loading state since we expect a response
        // Use local loading setter to enable protection
        setLocalLoadingState(sessionId: "supervisor", isLoading: true)
    }

    /// Handle session.subscribed response with session history
    private func handleSessionSubscribed(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else {
            NSLog("⌚️ WatchConnectionService: session.subscribed missing session_id")
            return
        }

        // Remove from pending subscriptions - we now have the official history
        // After this, session.output messages will be processed normally
        let wasPending = pendingSubscriptions.remove(sessionId) != nil

        // Mark as subscribed to prevent re-subscribing when view re-appears
        subscribedSessions.insert(sessionId)
        NSLog("⌚️ WatchConnectionService: session.subscribed for %@ (wasPending=%d)", sessionId, wasPending ? 1 : 0)

        // Server sends fields at root level (not in payload)
        // Check if session is currently executing (agent is working)
        // Use protection-aware update to prevent race conditions
        if let isExecuting = message["is_executing"] as? Bool {
            updateLoadingStateFromServer(sessionId: sessionId, isExecuting: isExecuting)
            NSLog("⌚️ WatchConnectionService: session.subscribed is_executing=%d", isExecuting ? 1 : 0)
        }

        // Load history if present (at root level, not in payload)
        if let history = message["history"] as? [[String: Any]] {
            // Save pending user messages (those with voiceInput blocks waiting for transcription)
            // These are locally-sent messages that haven't been confirmed by server yet
            let pendingUserMessages = appState?.agentMessages[sessionId]?.filter { message in
                message.role == .user && message.contentBlocks.contains { block in
                    if case .voiceInput = block { return true }
                    return false
                }
            } ?? []

            // Clear existing messages before loading history
            appState?.clearAgentMessages(for: sessionId)

            // Limit to last 10 messages (5 request-response pairs) for watchOS performance
            let limitedHistory = history.suffix(10)
            NSLog("⌚️ WatchConnectionService: session.subscribed loading %d of %d history messages, preserving %d pending user messages",
                  limitedHistory.count, history.count, pendingUserMessages.count)

            for msgData in limitedHistory {
                if let msg = parseHistoryMessage(msgData, sessionId: sessionId) {
                    appState?.addAgentMessage(msg, for: sessionId)
                }
            }

            // Re-add pending user messages that weren't in history
            for pendingMsg in pendingUserMessages {
                // Check if this message ID is already in the loaded history
                let alreadyExists = appState?.agentMessages[sessionId]?.contains { $0.id == pendingMsg.id } ?? false
                if !alreadyExists {
                    appState?.addAgentMessage(pendingMsg, for: sessionId)
                    NSLog("⌚️ WatchConnectionService: Preserved pending user message %@", pendingMsg.id)
                }
            }
        } else {
            NSLog("⌚️ WatchConnectionService: session.subscribed has no history array")
        }

        // Handle current streaming blocks if joining mid-stream (at root level)
        if let streamingBlocks = message["current_streaming_blocks"] as? [[String: Any]], !streamingBlocks.isEmpty {
            let blocks = parseContentBlocks(streamingBlocks)
            let streamingMessage = Message(
                id: UUID().uuidString,
                sessionId: sessionId,
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: true
            )
            appState?.addAgentMessage(streamingMessage, for: sessionId)
            NSLog("⌚️ WatchConnectionService: session.subscribed added streaming message with %d blocks", blocks.count)
        }
    }

    // MARK: - Parsing Helpers

    private func parseSession(_ data: [String: Any]) -> Session? {
        let sessionId = data["session_id"] as? String
        let sessionTypeStr = data["session_type"] as? String

        NSLog("⌚️ parseSession: session_id=%@, session_type=%@, all keys=%@",
              sessionId ?? "nil",
              sessionTypeStr ?? "nil",
              data.keys.joined(separator: ", "))

        guard let sessionId = sessionId,
              let sessionTypeStr = sessionTypeStr,
              let sessionType = Session.SessionType(rawValue: sessionTypeStr) else {
            NSLog("⌚️ parseSession: FAILED to parse - sessionId=%@, typeStr=%@",
                  sessionId ?? "nil", sessionTypeStr ?? "nil")
            return nil
        }

        // Skip terminal sessions
        guard sessionType.isAgent else {
            NSLog("⌚️ parseSession: skipping non-agent session type=%@", sessionTypeStr)
            return nil
        }

        let statusStr = data["status"] as? String ?? "active"
        let status = Session.SessionStatus(rawValue: statusStr) ?? .active

        NSLog("⌚️ parseSession: SUCCESS - creating Session id=%@, type=%@", sessionId, sessionTypeStr)

        return Session(
            id: sessionId,
            type: sessionType,
            agentName: data["agent_name"] as? String,
            workspace: data["workspace"] as? String,
            project: data["project"] as? String,
            worktree: data["worktree"] as? String,
            workingDir: data["working_dir"] as? String,
            status: status
        )
    }

    private func parseHistoryMessage(_ data: [String: Any], sessionId: String) -> Message? {
        guard let roleStr = data["role"] as? String,
              let role = Message.MessageRole(rawValue: roleStr) else {
            NSLog("⌚️ WatchConnectionService: parseHistoryMessage failed - invalid role: %@",
                  data["role"] as? String ?? "nil")
            return nil
        }

        var blocks: [MessageContentBlock] = []
        if let contentBlocks = data["content_blocks"] as? [[String: Any]] {
            blocks = parseContentBlocks(contentBlocks)
            NSLog("⌚️ WatchConnectionService: parseHistoryMessage role=%@, content_blocks=%d, parsed=%d",
                  roleStr, contentBlocks.count, blocks.count)
        } else if let content = data["content"] as? String {
            blocks = [.text(id: UUID().uuidString, text: content)]
            NSLog("⌚️ WatchConnectionService: parseHistoryMessage role=%@, content length=%d",
                  roleStr, content.count)
        } else {
            NSLog("⌚️ WatchConnectionService: parseHistoryMessage role=%@, no content or blocks", roleStr)
        }

        return Message(
            sessionId: sessionId,
            role: role,
            contentBlocks: blocks
        )
    }

    private func parseContentBlocks(_ blocks: [[String: Any]]) -> [MessageContentBlock] {
        // Parse content blocks for watchOS display
        // Server uses "block_type" and "content" fields
        return blocks.compactMap { block -> MessageContentBlock? in
            // Support both "block_type" (server format) and "type" (legacy)
            guard let blockType = (block["block_type"] as? String) ?? (block["type"] as? String) else {
                return nil
            }
            // Support both "content" (server format) and "text" (legacy)
            let content = (block["content"] as? String) ?? (block["text"] as? String)
            let id = block["id"] as? String ?? UUID().uuidString

            switch blockType {
            case "text":
                guard let text = content else { return nil }
                return .text(id: id, text: text)

            case "tool_call", "tool_use":
                // Parse tool call - show name and status (not expandable on watchOS)
                let name = block["name"] as? String ?? "tool"
                let statusStr = block["status"] as? String ?? "running"
                let status: ToolStatus
                switch statusStr {
                case "completed", "success": status = .completed
                case "failed", "error": status = .failed
                default: status = .running
                }
                let toolUseId = block["tool_use_id"] as? String
                return .toolCall(id: id, toolUseId: toolUseId, name: name, input: nil, output: nil, status: status)

            case "status":
                // Skip status blocks on watchOS - they clutter the small screen
                // (e.g., "Processing", "Complete" with progress bars)
                return nil

            case "error":
                guard let text = content else { return nil }
                return .error(id: id, text: text)

            case "voice_input":
                // Voice input - transcription is in "content" field (same as iOS/server format)
                // Also check "transcription" for backwards compatibility
                let transcription = content ?? (block["transcription"] as? String)
                if let text = transcription, !text.isEmpty {
                    // Show transcription as regular text for user messages
                    return .text(id: id, text: text)
                }
                // If no transcription, show voice input indicator
                return .voiceInput(id: id, audioURL: nil, transcription: transcription, duration: 0)

            case "voice_output":
                // Voice output - audio is stored in cache by audioId
                // Server sends: { id, block_type, content, metadata: { message_id, duration } }
                let metadata = block["metadata"] as? [String: Any]
                // Try metadata.message_id first (server format), then audio_id (legacy), then block id
                let audioId = metadata?["message_id"] as? String
                    ?? block["audio_id"] as? String
                    ?? id
                // Duration is in metadata (server format) or at top level (legacy)
                let duration = metadata?["duration"] as? Double
                    ?? block["duration"] as? Double
                    ?? 0
                NSLog("⌚️ parseContentBlocks: voice_output audioId=%@, duration=%f", audioId, duration)
                return .voiceOutput(id: id, audioURL: nil, text: audioId, duration: duration)

            default:
                // Skip code, thinking blocks, etc. on watchOS
                return nil
            }
        }
    }
}
