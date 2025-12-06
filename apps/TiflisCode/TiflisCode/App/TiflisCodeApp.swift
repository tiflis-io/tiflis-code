//
//  TiflisCodeApp.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI
import Combine

@main
struct TiflisCodeApp: App {
    @StateObject private var appState = AppState()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Install crash handlers early in app launch
        // This runs on main thread during app initialization
        Task { @MainActor in
            CrashReporter.shared.install()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onChange(of: scenePhase) { _, newPhase in
                    print("📱 ScenePhase changed to: \(newPhase)")
                    if newPhase == .active {
                        // Sync state when app becomes active
                        print("📱 App became active, requesting sync...")
                        Task {
                            await appState.requestSync()
                        }
                    }
                }
        }
    }
}

/// Global application state
@MainActor
final class AppState: ObservableObject {
    static let settingsId = "__settings__"

    @Published var connectionState: ConnectionState = .disconnected
    @Published var workstationOnline: Bool = true
    @Published var workstationName: String = ""
    @Published var workstationVersion: String = ""
    @Published var workstationProtocolVersion: String = ""
    @Published var workspacesRoot: String = ""
    @Published var tunnelVersion: String = ""
    @Published var tunnelProtocolVersion: String = ""
    @Published var sessions: [Session] = [Session(id: "supervisor", type: .supervisor)]
    @Published var selectedSessionId: String? = "supervisor"

    /// Supervisor chat messages - persisted across navigation
    @Published var supervisorMessages: [Message] = []
    /// Current streaming message ID for supervisor chat
    var supervisorStreamingMessageId: String?
    /// Loading state for supervisor chat
    @Published var supervisorIsLoading: Bool = false

    /// Agent session messages - keyed by session ID, synced across devices
    @Published var agentMessages: [String: [Message]] = [:]
    /// Current streaming message IDs for agent sessions - keyed by session ID
    var agentStreamingMessageIds: [String: String] = [:]
    /// Loading states for agent sessions - keyed by session ID
    @Published var agentIsLoading: [String: Bool] = [:]

    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""

    let connectionService: ConnectionServicing
    private var cancellables = Set<AnyCancellable>()

    // Flag to indicate if session change should not trigger UI transitions
    var isSilentSessionChange = false

    // Map request IDs to temporary session IDs for session creation
    private var pendingSessionCreations: [String: String] = [:]
    
    var selectedSession: Session? {
        guard selectedSessionId != Self.settingsId else { return nil }
        return sessions.first { $0.id == selectedSessionId }
    }
    
    var isShowingSettings: Bool {
        selectedSessionId == Self.settingsId
    }
    
    /// Check if we have saved connection credentials
    var hasConnectionConfig: Bool {
        !tunnelURL.isEmpty && !tunnelId.isEmpty
    }
    
    init(connectionService: ConnectionServicing? = nil) {
        // Create services with default implementations
        let keychainManager = KeychainManager()
        let deviceIDManager = DeviceIDManager()
        let webSocketClient = WebSocketClient()
        
        // Inject or create connection service
        self.connectionService = connectionService ?? ConnectionService(
            webSocketClient: webSocketClient,
            keychainManager: keychainManager,
            deviceIDManager: deviceIDManager
        )
        
        // Observe connection state from service
        observeConnectionState()
        
        // Observe WebSocket messages for session management
        observeWebSocketMessages()
        
        // Auto-connect on launch if we have saved credentials
        if hasConnectionConfig {
            connect()
        }
    }
    
    // MARK: - Private Methods
    
    private func observeConnectionState() {
        connectionService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$connectionState)
        
        connectionService.workstationOnlinePublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$workstationOnline)
        
        connectionService.workstationNamePublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$workstationName)
        
        connectionService.workstationVersionPublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$workstationVersion)
        
        connectionService.tunnelVersionPublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$tunnelVersion)
        
        connectionService.tunnelProtocolVersionPublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$tunnelProtocolVersion)
        
        connectionService.workstationProtocolVersionPublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$workstationProtocolVersion)

        connectionService.workspacesRootPublisher
            .receive(on: DispatchQueue.main)
            .assign(to: &$workspacesRoot)
    }
    
    private func observeWebSocketMessages() {
        connectionService.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleWebSocketMessage(message)
            }
            .store(in: &cancellables)
    }
    
    private func handleWebSocketMessage(_ message: [String: Any]) {
        guard let messageType = message["type"] as? String else { return }

        switch messageType {
        case "response":
            handleResponseMessage(message)
        case "error":
            handleErrorMessage(message)
        case "sync.state":
            handleSyncStateMessage(message)
        case "session.created":
            handleSessionCreatedMessage(message)
        case "session.terminated":
            handleSessionTerminatedMessage(message)
        case "supervisor.output":
            handleSupervisorOutput(message)
        case "supervisor.user_message":
            handleSupervisorUserMessage(message)
        case "supervisor.context_cleared":
            handleSupervisorContextCleared(message)
        case "session.output":
            handleSessionOutput(message)
        case "session.user_message":
            handleSessionUserMessage(message)
        default:
            break
        }
    }
    
    private func handleErrorMessage(_ message: [String: Any]) {
        // Handle error responses (e.g., workspace not found, project not found)
        guard let id = message["id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let code = payload["code"] as? String,
              let errorMessage = payload["message"] as? String else {
            return
        }
        
        print("❌ AppState: Received error response - ID: \(id), code: \(code), message: \(errorMessage)")
        
        // Find and remove temporary session if this was a create_session error
        if let tempSessionId = pendingSessionCreations[id] {
            print("❌ AppState: Removing temp session due to error: \(tempSessionId)")
            sessions.removeAll { $0.id == tempSessionId }
            pendingSessionCreations.removeValue(forKey: id)
            
            // If it was selected, switch to supervisor
            if selectedSessionId == tempSessionId {
                selectedSessionId = "supervisor"
            }
        }
    }
    
    private func handleResponseMessage(_ message: [String: Any]) {
        // Handle supervisor.create_session response
        guard let requestId = message["id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let sessionId = payload["session_id"] as? String else {
            return
        }

        print("📥 AppState: Received response for request ID: \(requestId), session ID: \(sessionId)")

        // Find temporary session using request ID mapping
        guard let tempSessionId = pendingSessionCreations[requestId] else {
            print("⚠️ AppState: No pending session creation found for request ID: \(requestId)")
            return
        }

        // Remove from pending
        pendingSessionCreations.removeValue(forKey: requestId)

        // Extract additional data from response
        let workingDir = payload["working_dir"] as? String

        // Check if session.created already added this session (race condition)
        // If so, just remove the temp session and update selection
        if sessions.contains(where: { $0.id == sessionId }) {
            print("ℹ️ AppState: Session already exists from broadcast, removing temp session")
            sessions.removeAll { $0.id == tempSessionId }
            if selectedSessionId == tempSessionId {
                selectedSessionId = sessionId
            }
            return
        }

        // Find and update temporary session with actual session ID
        if let index = sessions.firstIndex(where: { $0.id == tempSessionId }) {
            let tempSession = sessions[index]

            // Create new session with actual session ID from backend
            // Include workingDir from response payload
            let newSession = Session(
                id: sessionId,
                type: tempSession.type,
                workspace: tempSession.workspace,
                project: tempSession.project,
                worktree: tempSession.worktree,
                workingDir: workingDir
            )
            sessions[index] = newSession

            print("✅ AppState: Updated session from temp ID \(tempSessionId) to actual ID \(sessionId)")

            // Update selected session ID if it was the temp one
            if selectedSessionId == tempSessionId {
                selectedSessionId = sessionId
            }
        } else {
            print("⚠️ AppState: Temp session not found: \(tempSessionId)")
        }
    }
    
    private func handleSessionCreatedMessage(_ message: [String: Any]) {
        // Handle session.created broadcast
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any] else {
            print("⚠️ AppState: session.created missing session_id or payload")
            return
        }

        print("📥 AppState: Received session.created for session: \(sessionId)")
        print("📥 AppState: session.created payload: \(payload)")

        // Parse session data from broadcast
        let sessionType = payload["session_type"] as? String ?? "terminal"
        print("📥 AppState: session_type = \(sessionType)")
        let workspace = payload["workspace"] as? String
        let project = payload["project"] as? String
        let worktree = payload["worktree"] as? String
        let workingDir = payload["working_dir"] as? String

        // Parse terminal config if present
        var terminalConfig: TerminalConfig?
        if let terminalConfigDict = payload["terminal_config"] as? [String: Any] {
            if let bufferSize = terminalConfigDict["buffer_size"] as? Int {
                terminalConfig = TerminalConfig(bufferSize: bufferSize)
            }
        }

        let type: Session.SessionType
        switch sessionType {
        case "cursor":
            type = .cursor
        case "claude":
            type = .claude
        case "opencode":
            type = .opencode
        case "terminal":
            type = .terminal
        default:
            return
        }

        // Check if session already exists (from response handler arriving first)
        // If so, update it with additional data from broadcast (worktree, workingDir, terminalConfig)
        if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
            let existingSession = sessions[index]
            // Only update if new data is available
            let updatedSession = Session(
                id: sessionId,
                type: existingSession.type,
                workspace: existingSession.workspace ?? workspace,
                project: existingSession.project ?? project,
                worktree: existingSession.worktree ?? worktree,
                workingDir: existingSession.workingDir ?? workingDir,
                terminalConfig: existingSession.terminalConfig ?? terminalConfig
            )
            sessions[index] = updatedSession
            print("ℹ️ AppState: Updated existing session \(sessionId) with broadcast data")
            return
        }

        // Also check if there's a temp session pending for this real session
        // This handles the case where broadcast arrives before response
        // We need to find the temp session by checking pendingSessionCreations
        // But we don't have access to requestId here, so we skip this case
        // The response handler will handle removing the temp session

        let session = Session(
            id: sessionId,
            type: type,
            workspace: workspace,
            project: project,
            worktree: worktree,
            workingDir: workingDir,
            terminalConfig: terminalConfig
        )
        sessions.append(session)
        print("✅ AppState: Added new session from broadcast: \(sessionId), type: \(type)")
    }
    
    private func handleSessionTerminatedMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else { return }

        // Clean up agent messages for this session
        clearAgentMessages(for: sessionId)

        // Remove terminated session
        sessions.removeAll { $0.id == sessionId }

        // If it was selected, switch to supervisor
        if selectedSessionId == sessionId {
            selectedSessionId = "supervisor"
        }
    }
    
    private func handleSyncStateMessage(_ message: [String: Any]) {
        print("🔄 handleSyncStateMessage received: \(message)")
        // Handle sync.state response to restore sessions after app restart
        guard let payload = message["payload"] as? [String: Any],
              let sessionsArray = payload["sessions"] as? [[String: Any]] else {
            print("⚠️ handleSyncStateMessage: Invalid payload format")
            return
        }

        print("🔄 handleSyncStateMessage: Server has \(sessionsArray.count) sessions")

        // Build set of active session IDs from server
        let serverSessionIds = Set(sessionsArray.compactMap { $0["session_id"] as? String })
        print("🔄 handleSyncStateMessage: Server session IDs: \(serverSessionIds)")

        // Detect stale sessions: sessions we have locally but no longer exist on server
        // This happens when:
        // 1. Server restarted and PTY processes died
        // 2. Session was terminated while app was in background
        print("🔄 handleSyncStateMessage: Local sessions count: \(sessions.count)")
        print("🔄 handleSyncStateMessage: Local session IDs: \(sessions.map { $0.id })")

        let staleSessions = sessions.filter { session in
            // Skip supervisor (it's a singleton that always exists conceptually)
            guard session.type != .supervisor else { return false }
            return !serverSessionIds.contains(session.id)
        }

        print("🔄 handleSyncStateMessage: Found \(staleSessions.count) stale sessions")

        // Remove stale sessions
        for staleSession in staleSessions {
            print("🗑️ AppState: Removing stale session \(staleSession.id) (not in server sync)")
            sessions.removeAll { $0.id == staleSession.id }

            // If currently viewing this session, navigate to supervisor
            if selectedSessionId == staleSession.id {
                selectedSessionId = "supervisor"
            }
        }

        print("🔄 handleSyncStateMessage: After cleanup, sessions count: \(sessions.count)")

        // Note: subscriptions are handled by individual view models when they subscribe
        // We don't need to restore them here as view models will auto-subscribe on appear

        // Restore sessions from backend
        var restoredSessions: [Session] = []

        for sessionData in sessionsArray {
            guard let sessionId = sessionData["session_id"] as? String,
                  let sessionType = sessionData["session_type"] as? String,
                  let status = sessionData["status"] as? String,
                  status == "active" else {
                continue
            }

            // Skip if we already have this session locally (avoid duplicates)
            if sessions.contains(where: { $0.id == sessionId }) {
                continue
            }

            // Map session_type to Session.SessionType
            let type: Session.SessionType
            switch sessionType {
            case "cursor":
                type = .cursor
            case "claude":
                type = .claude
            case "opencode":
                type = .opencode
            case "terminal":
                type = .terminal
            case "supervisor":
                type = .supervisor
            default:
                continue
            }

            // Extract all session fields from sync.state
            let workspace = sessionData["workspace"] as? String
            let project = sessionData["project"] as? String
            let worktree = sessionData["worktree"] as? String
            let workingDir = sessionData["working_dir"] as? String

            let session = Session(
                id: sessionId,
                type: type,
                workspace: workspace,
                project: project,
                worktree: worktree,
                workingDir: workingDir
            )
            restoredSessions.append(session)
        }

        // Add restored sessions to existing sessions (preserving local state)
        sessions.append(contentsOf: restoredSessions)

        // Ensure supervisor always exists
        if !sessions.contains(where: { $0.type == .supervisor }) {
            sessions.insert(Session(id: "supervisor", type: .supervisor, workspace: nil, project: nil), at: 0)
        }

        // Restore supervisor history
        if let supervisorHistory = payload["supervisorHistory"] as? [[String: Any]], !supervisorHistory.isEmpty {
            restoreSupervisorHistory(supervisorHistory)
        } else if supervisorMessages.isEmpty {
            // Add welcome message if no history
            let welcomeMessage = Message(
                sessionId: "supervisor",
                role: .assistant,
                content: "Hello! I'm your Supervisor agent. I can help you manage your coding sessions, create new agent instances, and navigate your workspace. What would you like to do?"
            )
            supervisorMessages = [welcomeMessage]
        }

        // Restore agent session histories
        if let agentHistories = payload["agentHistories"] as? [String: [[String: Any]]] {
            restoreAgentHistories(agentHistories)
        }

        // Store subscriptions for view models to re-subscribe
        // View models will handle re-subscription when they observe connection state
    }

    private func restoreSupervisorHistory(_ history: [[String: Any]]) {
        // Sort history by sequence to ensure correct order
        let sortedHistory = history.sorted { item1, item2 in
            let seq1 = item1["sequence"] as? Int ?? 0
            let seq2 = item2["sequence"] as? Int ?? 0
            return seq1 < seq2
        }

        var restoredMessages: [Message] = []

        for historyItem in sortedHistory {
            guard let role = historyItem["role"] as? String,
                  let content = historyItem["content"] as? String else { continue }

            let messageRole: Message.MessageRole = role == "user" ? .user : .assistant

            // Parse content_blocks if available (for assistant messages with rich content)
            var blocks: [MessageContentBlock] = []
            if let contentBlocks = historyItem["content_blocks"] as? [[String: Any]], !contentBlocks.isEmpty {
                blocks = ContentParser.parseContentBlocks(contentBlocks)
            }

            // If no blocks parsed, create text block from content
            if blocks.isEmpty {
                blocks = ContentParser.parse(content: content, contentType: "agent")
            }

            let message = Message(
                sessionId: "supervisor",
                role: messageRole,
                contentBlocks: blocks
            )
            restoredMessages.append(message)
        }

        // Only update if we got messages
        if !restoredMessages.isEmpty {
            supervisorMessages = restoredMessages
        } else {
            // Add welcome message if no history
            let welcomeMessage = Message(
                sessionId: "supervisor",
                role: .assistant,
                content: "Hello! I'm your Supervisor agent. I can help you manage your coding sessions, create new agent instances, and navigate your workspace. What would you like to do?"
            )
            supervisorMessages = [welcomeMessage]
        }
    }

    private func restoreAgentHistories(_ histories: [String: [[String: Any]]]) {
        for (sessionId, history) in histories {
            // Sort history by sequence to ensure correct order
            let sortedHistory = history.sorted { item1, item2 in
                let seq1 = item1["sequence"] as? Int ?? 0
                let seq2 = item2["sequence"] as? Int ?? 0
                return seq1 < seq2
            }

            var restoredMessages: [Message] = []

            for historyItem in sortedHistory {
                guard let role = historyItem["role"] as? String,
                      let content = historyItem["content"] as? String else { continue }

                let messageRole: Message.MessageRole
                switch role {
                case "user":
                    messageRole = .user
                case "assistant":
                    messageRole = .assistant
                default:
                    messageRole = .assistant // system messages shown as assistant
                }

                // Parse content_blocks if available (for assistant messages with rich content)
                var blocks: [MessageContentBlock] = []
                if let contentBlocks = historyItem["content_blocks"] as? [[String: Any]], !contentBlocks.isEmpty {
                    blocks = ContentParser.parseContentBlocks(contentBlocks)
                }

                // If no blocks parsed, create text block from content
                if blocks.isEmpty {
                    blocks = ContentParser.parse(content: content, contentType: "agent")
                }

                let message = Message(
                    sessionId: sessionId,
                    role: messageRole,
                    contentBlocks: blocks
                )
                restoredMessages.append(message)
            }

            // Store restored messages for this session
            if !restoredMessages.isEmpty {
                agentMessages[sessionId] = restoredMessages
            }
        }
    }

    // MARK: - Supervisor Message Handlers

    private func handleSupervisorOutput(_ message: [String: Any]) {
        guard let payload = message["payload"] as? [String: Any] else { return }

        let isComplete = payload["is_complete"] as? Bool ?? false

        // Parse content blocks if available
        var blocks: [MessageContentBlock] = []
        if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
            blocks = ContentParser.parseContentBlocks(contentBlocks)
        } else if let content = payload["content"] as? String, !content.isEmpty {
            blocks = ContentParser.parse(content: content, contentType: "agent")
        }

        guard !blocks.isEmpty else {
            // Empty blocks but is_complete means end of streaming
            if isComplete {
                supervisorIsLoading = false
                if let streamingId = supervisorStreamingMessageId,
                   let index = supervisorMessages.firstIndex(where: { $0.id == streamingId }) {
                    var updatedMessage = supervisorMessages[index]
                    updatedMessage.isStreaming = false
                    supervisorMessages[index] = updatedMessage
                }
                supervisorStreamingMessageId = nil
            }
            return
        }

        // Update or create streaming message
        if let streamingId = supervisorStreamingMessageId,
           let index = supervisorMessages.firstIndex(where: { $0.id == streamingId }) {
            // For text blocks, replace the last one instead of appending
            // This handles LangGraph sending full state on each update
            var updatedMessage = supervisorMessages[index]

            for newBlock in blocks {
                if case .text = newBlock,
                   let lastIndex = updatedMessage.contentBlocks.lastIndex(where: {
                       if case .text = $0 { return true }
                       return false
                   }) {
                    // Replace the last text block with the new one
                    updatedMessage.contentBlocks[lastIndex] = newBlock
                } else {
                    // Append non-text blocks (tool calls, etc.)
                    updatedMessage.contentBlocks.append(newBlock)
                }
            }

            updatedMessage.isStreaming = !isComplete
            supervisorMessages[index] = updatedMessage
        } else {
            // Create new assistant message
            let newMessage = Message(
                sessionId: "supervisor",
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: !isComplete
            )
            supervisorMessages.append(newMessage)
            supervisorStreamingMessageId = newMessage.id
        }

        if isComplete {
            supervisorIsLoading = false
            supervisorStreamingMessageId = nil
        }
    }

    private func handleSupervisorUserMessage(_ message: [String: Any]) {
        print("📨 handleSupervisorUserMessage received: \(message)")
        guard let payload = message["payload"] as? [String: Any],
              let content = payload["content"] as? String,
              let fromDeviceId = payload["from_device_id"] as? String else {
            print("⚠️ handleSupervisorUserMessage: Invalid payload")
            return
        }

        // Skip if this is our own message (we already added it locally)
        let deviceId = DeviceIDManager().deviceID
        print("📨 handleSupervisorUserMessage: fromDeviceId=\(fromDeviceId), myDeviceId=\(deviceId)")
        guard fromDeviceId != deviceId else {
            print("📨 handleSupervisorUserMessage: Skipping own message")
            return
        }

        print("📨 handleSupervisorUserMessage: Adding message from other device: \(content.prefix(50))...")

        // Add user message from another device
        let userMessage = Message(
            sessionId: "supervisor",
            role: .user,
            content: content
        )
        supervisorMessages.append(userMessage)

        // Show loading indicator since we're waiting for response
        supervisorIsLoading = true
    }

    private func handleSupervisorContextCleared(_ message: [String: Any]) {
        // Clear all messages
        supervisorMessages.removeAll()
        supervisorStreamingMessageId = nil
        supervisorIsLoading = false

        // Show welcome message
        let welcomeMessage = Message(
            sessionId: "supervisor",
            role: .assistant,
            content: "Context cleared. How can I help you?"
        )
        supervisorMessages = [welcomeMessage]
    }

    // MARK: - Agent Session Message Handlers

    private func handleSessionOutput(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any] else { return }

        // Verify this is an agent session (not terminal)
        guard let session = sessions.first(where: { $0.id == sessionId }),
              session.type.isAgent else { return }

        let isComplete = payload["is_complete"] as? Bool ?? false

        // Parse content blocks if available
        var blocks: [MessageContentBlock] = []
        if let contentBlocks = payload["content_blocks"] as? [[String: Any]] {
            blocks = ContentParser.parseContentBlocks(contentBlocks)
        } else if let content = payload["content"] as? String, !content.isEmpty {
            let contentType = payload["content_type"] as? String ?? "agent"
            blocks = ContentParser.parse(content: content, contentType: contentType)
        }

        // Initialize messages array for this session if needed
        if agentMessages[sessionId] == nil {
            agentMessages[sessionId] = []
        }

        guard !blocks.isEmpty else {
            // Empty blocks but is_complete means end of streaming
            if isComplete {
                agentIsLoading[sessionId] = false
                if let streamingId = agentStreamingMessageIds[sessionId],
                   let index = agentMessages[sessionId]?.firstIndex(where: { $0.id == streamingId }) {
                    agentMessages[sessionId]?[index].isStreaming = false
                }
                agentStreamingMessageIds[sessionId] = nil
            }
            return
        }

        // Update or create streaming message
        if let streamingId = agentStreamingMessageIds[sessionId],
           let index = agentMessages[sessionId]?.firstIndex(where: { $0.id == streamingId }) {
            // Process blocks: update existing tool blocks by tool_use_id, append new ones
            for block in blocks {
                if let newToolUseId = block.toolUseId,
                   let existingIndex = agentMessages[sessionId]?[index].contentBlocks.firstIndex(where: { $0.toolUseId == newToolUseId }) {
                    // Update existing tool block with new data (result/status)
                    agentMessages[sessionId]?[index].contentBlocks[existingIndex] = block
                } else {
                    // Append new block
                    agentMessages[sessionId]?[index].contentBlocks.append(block)
                }
            }
            agentMessages[sessionId]?[index].isStreaming = !isComplete
        } else {
            // Create new assistant message
            let newMessage = Message(
                sessionId: sessionId,
                role: .assistant,
                contentBlocks: blocks,
                isStreaming: !isComplete
            )
            agentMessages[sessionId]?.append(newMessage)
            agentStreamingMessageIds[sessionId] = newMessage.id
        }

        if isComplete {
            agentIsLoading[sessionId] = false
            agentStreamingMessageIds[sessionId] = nil
        }
    }

    private func handleSessionUserMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              let payload = message["payload"] as? [String: Any],
              let content = payload["content"] as? String,
              let fromDeviceId = payload["from_device_id"] as? String else { return }

        // Verify this is an agent session
        guard let session = sessions.first(where: { $0.id == sessionId }),
              session.type.isAgent else { return }

        // Skip if this is our own message (we already added it locally)
        let deviceId = DeviceIDManager().deviceID
        guard fromDeviceId != deviceId else { return }

        // Initialize messages array for this session if needed
        if agentMessages[sessionId] == nil {
            agentMessages[sessionId] = []
        }

        // Add user message from another device
        let userMessage = Message(
            sessionId: sessionId,
            role: .user,
            content: content
        )
        agentMessages[sessionId]?.append(userMessage)

        // Show loading indicator since we're waiting for response
        agentIsLoading[sessionId] = true
    }

    /// Get messages for an agent session
    func getAgentMessages(for sessionId: String) -> [Message] {
        return agentMessages[sessionId] ?? []
    }

    /// Set messages for an agent session
    func setAgentMessages(_ messages: [Message], for sessionId: String) {
        agentMessages[sessionId] = messages
    }

    /// Append a message to an agent session
    func appendAgentMessage(_ message: Message, for sessionId: String) {
        if agentMessages[sessionId] == nil {
            agentMessages[sessionId] = []
        }
        agentMessages[sessionId]?.append(message)
    }

    /// Get loading state for an agent session
    func getAgentIsLoading(for sessionId: String) -> Bool {
        return agentIsLoading[sessionId] ?? false
    }

    /// Set loading state for an agent session
    func setAgentIsLoading(_ isLoading: Bool, for sessionId: String) {
        agentIsLoading[sessionId] = isLoading
    }

    /// Get streaming message ID for an agent session
    func getAgentStreamingMessageId(for sessionId: String) -> String? {
        return agentStreamingMessageIds[sessionId]
    }

    /// Set streaming message ID for an agent session
    func setAgentStreamingMessageId(_ messageId: String?, for sessionId: String) {
        agentStreamingMessageIds[sessionId] = messageId
    }

    /// Clear agent session messages
    func clearAgentMessages(for sessionId: String) {
        agentMessages[sessionId] = []
        agentStreamingMessageIds[sessionId] = nil
        agentIsLoading[sessionId] = false
    }

    // MARK: - Actions
    
    func connect() {
        guard hasConnectionConfig else { return }
        
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            do {
                try await self.connectionService.connect()
            } catch {
                self.connectionState = .error(error.localizedDescription)
            }
        }
    }
    
    func disconnect() {
        connectionService.disconnect()
    }

    /// Requests state synchronization from workstation server
    /// This removes stale sessions and restores active ones
    func requestSync() async {
        print("🔄 AppState.requestSync called, connectionState: \(connectionState)")
        guard connectionState == .connected else {
            print("⚠️ AppState.requestSync: Not connected, skipping")
            return
        }
        print("🔄 AppState.requestSync: Calling connectionService.requestSync()")
        await connectionService.requestSync()
    }

    func selectSession(_ session: Session) {
        selectedSessionId = session.id
    }
    
    func createSession(type: Session.SessionType, workspace: String?, project: String?) {
        print("📝 AppState: createSession called - type: \(type), workspace: \(workspace ?? "nil"), project: \(project ?? "nil")")
        
        // For terminal sessions, use default workspace/project if not provided
        let finalWorkspace: String
        let finalProject: String
        
        if type == .terminal {
            // Terminal sessions can be created without workspace/project
            // Use defaults for backend compatibility
            finalWorkspace = workspace ?? "home"
            finalProject = project ?? "default"
        } else {
            // Agent sessions require workspace and project
            guard let ws = workspace, let proj = project else {
                // This shouldn't happen due to UI validation, but handle gracefully
                print("❌ AppState: Missing workspace/project for non-terminal session")
                return
            }
            finalWorkspace = ws
            finalProject = proj
        }
        
        print("📝 AppState: Using workspace: \(finalWorkspace), project: \(finalProject)")
        
        // Create temporary session with generated ID
        // Will be updated with actual session ID from backend response
        let tempSession = Session(
            type: type,
            workspace: finalWorkspace,
            project: finalProject
        )
        sessions.append(tempSession)
        selectedSessionId = tempSession.id
        
        print("📝 AppState: Created temp session with ID: \(tempSession.id)")
        
        // Send create_session message to backend
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self.createSessionOnBackend(
                type: type,
                workspace: finalWorkspace,
                project: finalProject,
                tempSessionId: tempSession.id
            )
        }
    }
    
    private func createSessionOnBackend(
        type: Session.SessionType,
        workspace: String,
        project: String,
        tempSessionId: String
    ) async {
        print("📤 AppState: createSessionOnBackend called - type: \(type), workspace: \(workspace), project: \(project)")
        print("📤 AppState: Connection state: \(connectionState)")
        
        guard connectionState == .connected else {
            // Not connected - remove temp session
            print("❌ AppState: Not connected, removing temp session")
            sessions.removeAll { $0.id == tempSessionId }
            return
        }
        
        // Generate request ID
        let requestId = UUID().uuidString
        print("📤 AppState: Generated request ID: \(requestId)")
        
        // Map SessionType to backend session_type
        let sessionType: String
        switch type {
        case .cursor:
            sessionType = "cursor"
        case .claude:
            sessionType = "claude"
        case .opencode:
            sessionType = "opencode"
        case .terminal:
            sessionType = "terminal"
        case .supervisor:
            // Supervisor is created automatically, shouldn't call this
            print("❌ AppState: Cannot create supervisor session via createSession")
            return
        }
        
        // Build create_session message
        let message: [String: Any] = [
            "type": "supervisor.create_session",
            "id": requestId,
            "payload": [
                "session_type": sessionType,
                "workspace": workspace,
                "project": project
            ]
        ]
        
        print("📤 AppState: Sending supervisor.create_session message: \(message)")
        
        // Store request ID -> temp session ID mapping for response handling
        pendingSessionCreations[requestId] = tempSessionId
        
        do {
            // Send message
            try connectionService.webSocketClient.sendMessage(message)
            print("✅ AppState: supervisor.create_session message sent successfully")
        } catch {
            // Failed to send - remove temp session
            print("❌ AppState: Failed to send create_session message: \(error)")
            sessions.removeAll { $0.id == tempSessionId }
        }
    }
    
    func terminateSession(_ session: Session, silent: Bool = false) {
        print("🔴 AppState.terminateSession called for session: \(session.id), type: \(session.type), silent: \(silent)")

        // Don't allow terminating supervisor session
        guard session.type != .supervisor else {
            print("⚠️ AppState: Cannot terminate supervisor session")
            return
        }

        print("🔴 AppState: Removing session from local state")

        // Clean up agent messages for this session
        if session.type.isAgent {
            clearAgentMessages(for: session.id)
        }

        // Remove session from local state immediately for responsive UI
        sessions.removeAll { $0.id == session.id }
        if selectedSessionId == session.id {
            // Set flag before changing selection
            isSilentSessionChange = silent
            selectedSessionId = "supervisor"
            // Reset flag after a brief delay
            if silent {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.isSilentSessionChange = false
                }
            }
        }

        // Send terminate message to backend
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self.terminateSessionOnBackend(sessionId: session.id)
        }
    }

    private func terminateSessionOnBackend(sessionId: String) async {
        // Use connectionService.connectionState directly for most up-to-date state
        let serviceState = connectionService.connectionState
        print("🔴 AppState.terminateSessionOnBackend called for session: \(sessionId), appState.connectionState: \(connectionState), service.connectionState: \(serviceState)")
        guard serviceState == .connected else {
            print("⚠️ AppState: Not connected (service: \(serviceState)), session terminated locally only")
            return
        }

        // Generate request ID
        let requestId = UUID().uuidString

        // Build terminate_session message per protocol
        let message: [String: Any] = [
            "type": "supervisor.terminate_session",
            "id": requestId,
            "payload": [
                "session_id": sessionId
            ]
        ]

        print("📤 AppState: Sending supervisor.terminate_session for session: \(sessionId)")

        do {
            try connectionService.webSocketClient.sendMessage(message)
            print("✅ AppState: supervisor.terminate_session sent successfully")
        } catch {
            print("❌ AppState: Failed to send terminate_session message: \(error)")
            // Session is already removed from local state, backend will clean up eventually
        }
    }
}

