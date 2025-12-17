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
    }

    // MARK: - Sending Commands

    /// Sends a message via HTTP
    private func sendHTTPMessage(_ message: [String: Any]) async throws {
        try await httpPollingService.sendCommand(message)
    }

    /// Sends a text command to the supervisor
    func sendSupervisorCommand(text: String, messageId: String) async {
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
        let requestId = UUID().uuidString
        let base64Audio = audioData.base64EncodedString()

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
            print("⌚️ WatchConnectionService: Sent supervisor voice command via HTTP")
        } catch {
            NSLog("⌚️ WatchConnectionService: Failed to send voice command: %@", error.localizedDescription)
        }
    }

    /// Sends a text command to an agent session
    func sendAgentCommand(text: String, sessionId: String, messageId: String) async {
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
        let requestId = UUID().uuidString
        let base64Audio = audioData.base64EncodedString()

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
            print("⌚️ WatchConnectionService: Sent agent voice command to \(sessionId) via HTTP")
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

        case "connection.workstation_offline":
            appState?.workstationOnline = false

        case "connection.workstation_online":
            appState?.workstationOnline = true

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

        NSLog("⌚️ WatchConnectionService: history.response for %@ with %d messages",
              sessionId ?? "supervisor", history.count)

        // Parse and add messages
        if isSupervisor {
            // Clear existing supervisor messages before loading history
            appState?.clearSupervisorMessages()
            for msgData in history.suffix(20) {
                if let msg = parseHistoryMessage(msgData, sessionId: "supervisor") {
                    appState?.addSupervisorMessage(msg)
                }
            }
            // Update loading state
            if let isExecuting = payload["is_executing"] as? Bool {
                appState?.supervisorIsLoading = isExecuting
            }
        } else if let sessionId = sessionId {
            // Clear existing messages for this session before loading history
            appState?.clearAgentMessages(for: sessionId)
            for msgData in history.suffix(20) {
                if let msg = parseHistoryMessage(msgData, sessionId: sessionId) {
                    appState?.addAgentMessage(msg, for: sessionId)
                }
            }
            // Update loading state
            if let isExecuting = payload["is_executing"] as? Bool {
                appState?.agentIsLoading[sessionId] = isExecuting
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
            NSLog("⌚️ WatchConnectionService: sync.state has %d supervisor messages", history.count)
            var parsedCount = 0
            for msgData in history.suffix(20) {
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
                NSLog("⌚️ WatchConnectionService: agent %@ has %d messages", sessionId, history.count)
                for msgData in history.suffix(20) {
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

        let isComplete = payload["is_complete"] as? Bool ?? true

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
            appState?.supervisorIsLoading = false
        }
    }

    private func handleSessionOutput(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any] else { return }

        let isComplete = payload["is_complete"] as? Bool ?? true
        let messageId = message["id"] as? String ?? UUID().uuidString

        if var messages = appState?.agentMessages[sessionId],
           let existingIndex = messages.firstIndex(where: { $0.id == messageId && $0.role == .assistant }) {
            // Update existing message
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                let blocks = parseContentBlocks(contentBlocks)
                messages[existingIndex].contentBlocks = blocks
                messages[existingIndex].isStreaming = !isComplete
                appState?.agentMessages[sessionId] = messages
            }
        } else {
            // Create new assistant message
            var blocks: [MessageContentBlock] = []
            if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
                blocks = parseContentBlocks(contentBlocks)
            } else if let content = payload["content"] as? String {
                blocks = [.text(id: UUID().uuidString, text: content)]
            }

            let newMessage = Message(
                id: messageId,
                sessionId: sessionId,
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: !isComplete
            )
            appState?.addAgentMessage(newMessage, for: sessionId)
        }

        if isComplete {
            appState?.agentIsLoading[sessionId] = false
        }
    }

    private func handleSupervisorTranscription(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any],
              let text = payload["text"] as? String,
              let messageId = payload["message_id"] as? String else { return }

        // Update the user message with transcription
        appState?.updateMessage(id: messageId, sessionId: "supervisor") { msg in
            // Replace voice input block with text
            if let voiceIndex = msg.contentBlocks.firstIndex(where: {
                if case .voiceInput = $0 { return true }
                return false
            }) {
                msg.contentBlocks[voiceIndex] = .text(id: UUID().uuidString, text: text)
            }
        }
    }

    private func handleSessionTranscription(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let text = payload["text"] as? String,
              let messageId = payload["message_id"] as? String else { return }

        appState?.updateMessage(id: messageId, sessionId: sessionId) { msg in
            if let voiceIndex = msg.contentBlocks.firstIndex(where: {
                if case .voiceInput = $0 { return true }
                return false
            }) {
                msg.contentBlocks[voiceIndex] = .text(id: UUID().uuidString, text: text)
            }
        }
    }

    private func handleVoiceOutput(_ message: [String: Any], sessionId: String) {
        guard let payload = message["payload"] as? [String: Any],
              let audioBase64 = payload["audio"] as? String else { return }

        // Decode audio and notify for playback
        guard let audioData = Data(base64Encoded: audioBase64) else { return }

        // Post notification for audio playback
        NotificationCenter.default.post(
            name: NSNotification.Name("WatchTTSAudioReceived"),
            object: nil,
            userInfo: ["audioData": audioData, "sessionId": sessionId]
        )
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
        // For watchOS, we only care about text blocks (simplified display)
        // Server uses "block_type" and "content" fields
        return blocks.compactMap { block -> MessageContentBlock? in
            // Support both "block_type" (server format) and "type" (legacy)
            guard let blockType = (block["block_type"] as? String) ?? (block["type"] as? String) else {
                return nil
            }
            // Support both "content" (server format) and "text" (legacy)
            let content = (block["content"] as? String) ?? (block["text"] as? String)

            switch blockType {
            case "text":
                guard let text = content else { return nil }
                let id = block["id"] as? String ?? UUID().uuidString
                return .text(id: id, text: text)

            case "status":
                guard let text = content else { return nil }
                let id = block["id"] as? String ?? UUID().uuidString
                return .status(id: id, text: text)

            case "error":
                guard let text = content else { return nil }
                let id = block["id"] as? String ?? UUID().uuidString
                return .error(id: id, text: text)

            default:
                // Skip code, tool_call, thinking, etc. on watchOS
                return nil
            }
        }
    }
}
