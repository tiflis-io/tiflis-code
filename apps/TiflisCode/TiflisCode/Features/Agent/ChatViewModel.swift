//
//  ChatViewModel.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
@preconcurrency import Combine

/// ViewModel for ChatView managing messages and interactions
@MainActor
final class ChatViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var inputText = ""
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var error: String?

    // MARK: - Audio Recording

    private let audioRecorder = AudioRecorderService.shared
    private var audioRecorderCancellables = Set<AnyCancellable>()

    /// Loading state - uses AppState for both supervisor and agent sessions
    var isLoading: Bool {
        get {
            guard let appState = appState else { return false }
            if session.type == .supervisor {
                return appState.supervisorIsLoading
            }
            return appState.getAgentIsLoading(for: session.id)
        }
        set {
            guard let appState = appState else { return }
            if session.type == .supervisor {
                appState.supervisorIsLoading = newValue
            } else {
                appState.setAgentIsLoading(newValue, for: session.id)
            }
        }
    }

    /// Messages to display - uses AppState for both supervisor and agent sessions
    var messages: [Message] {
        get {
            guard let appState = appState else { return [] }
            if session.type == .supervisor {
                return appState.supervisorMessages
            }
            return appState.getAgentMessages(for: session.id)
        }
        set {
            guard let appState = appState else { return }
            if session.type == .supervisor {
                appState.supervisorMessages = newValue
            } else {
                appState.setAgentMessages(newValue, for: session.id)
            }
        }
    }

    /// Scroll trigger - increments on any content update to force scroll to bottom
    /// Published to ensure SwiftUI onChange detects changes reliably
    @Published private(set) var scrollTrigger: Int = 0

    /// Display segments computed from messages - splits long assistant responses into multiple bubbles
    var displaySegments: [SplitMessageSegment] {
        messages.flatMap { message in
            MessageSplitter.split(message: message)
        }
    }

    /// Get original message for a segment ID
    func getMessage(for messageId: String) -> Message? {
        messages.first { $0.id == messageId }
    }

    // MARK: - Dependencies

    let session: Session
    private let connectionService: ConnectionServicing
    private let webSocketClient: WebSocketClientProtocol
    private let commandSender: CommandSending
    private let deviceId: String
    private weak var appState: AppState?

    // MARK: - State

    private var cancellables = Set<AnyCancellable>()
    private var isSubscribed = false

    // MARK: - Initialization

    init(
        session: Session,
        connectionService: ConnectionServicing,
        appState: AppState? = nil,
        deviceId: String = DeviceIDManager().deviceID
    ) {
        self.session = session
        self.connectionService = connectionService
        self.webSocketClient = connectionService.webSocketClient
        self.commandSender = connectionService.commandSender
        self.deviceId = deviceId
        self.appState = appState

        observeConnectionState()
        observeMessages()
        observeAudioRecorder()
        observeScrollTrigger()
    }

    // MARK: - Audio Recorder Observation

    private func observeAudioRecorder() {
        audioRecorder.$isRecording
            .receive(on: DispatchQueue.main)
            .assign(to: &$isRecording)

        audioRecorder.$recordingDuration
            .receive(on: DispatchQueue.main)
            .assign(to: &$recordingDuration)

        audioRecorder.$error
            .receive(on: DispatchQueue.main)
            .compactMap { $0?.localizedDescription }
            .sink { [weak self] errorMessage in
                self?.error = errorMessage
            }
            .store(in: &audioRecorderCancellables)
    }

    // MARK: - Connection Observation

    private func observeConnectionState() {
        connectionService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self = self else { return }

                switch state {
                case .authenticated, .verified:
                    // Subscribe/refresh session for agent sessions when fully authenticated
                    // Always re-subscribe to get latest state after reconnect
                    if self.session.type.isAgent {
                        self.subscribeToSession()
                    }
                case .disconnected, .error:
                    self.isSubscribed = false
                case .connecting, .connected, .authenticating, .degraded:
                    // Intermediate states - waiting for full authentication or connection unstable
                    break
                }
            }
            .store(in: &cancellables)
    }

    private func observeMessages() {
        connectionService.messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleMessage(message)
            }
            .store(in: &cancellables)
    }

    /// Observe scroll trigger from AppState and republish as @Published property
    /// This ensures SwiftUI onChange detects changes reliably
    private func observeScrollTrigger() {
        guard let appState = appState else { return }

        if session.type == .supervisor {
            // Subscribe to supervisor scroll trigger
            appState.$supervisorScrollTrigger
                .receive(on: DispatchQueue.main)
                .sink { [weak self] newValue in
                    self?.scrollTrigger = newValue
                }
                .store(in: &cancellables)
        } else {
            // Subscribe to agent scroll triggers map and extract value for this session
            appState.$agentScrollTriggers
                .receive(on: DispatchQueue.main)
                .map { [weak self] triggers -> Int in
                    guard let sessionId = self?.session.id else { return 0 }
                    return triggers[sessionId] ?? 0
                }
                .sink { [weak self] newValue in
                    self?.scrollTrigger = newValue
                }
                .store(in: &cancellables)
        }
    }

    // MARK: - Message Handling

    private func handleMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }

        switch type {
        case "session.subscribed":
            handleSessionSubscribed(message)

        case "response":
            handleResponse(message)

        case "error":
            handleError(message)

        default:
            // session.output and supervisor.output are now handled by AppState
            break
        }
    }

    private func handleSessionSubscribed(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String,
              sessionId == session.id else { return }

        isSubscribed = true

        // Update loading state from server
        let isExecuting = message["is_executing"] as? Bool ?? false
        isLoading = isExecuting

        // Extract streaming_message_id from server for deduplication across devices
        let serverStreamingMessageId = message["streaming_message_id"] as? String

        // Restore history from server if we don't have local messages
        // This ensures messages are not lost on reconnection or when opening chat
        if let history = message["history"] as? [[String: Any]], !history.isEmpty {
            let localMessages = appState?.getAgentMessages(for: sessionId) ?? []

            // Determine if we should restore from server history
            // Restore if:
            // 1. Local history is empty
            // 2. Local has fewer messages than server
            // 3. Local has a streaming message (partial content that needs full replacement)
            let hasLocalStreamingMessage = localMessages.last?.isStreaming == true ||
                                           appState?.agentStreamingMessageIds[sessionId] != nil

            if localMessages.isEmpty || localMessages.count < history.count || hasLocalStreamingMessage {
                restoreHistoryFromSubscription(history, sessionId: sessionId)
            } else {
                // Even if we have local messages, check for cancel block sync
                syncCancelBlockFromHistory(history, sessionId: sessionId, localMessages: localMessages)
            }
        }

        // Handle current streaming blocks for mirror devices joining mid-stream
        // This allows a second device to see the in-progress response
        if isExecuting,
           let streamingBlocks = message["current_streaming_blocks"] as? [[String: Any]],
           !streamingBlocks.isEmpty {
            restoreStreamingBlocks(streamingBlocks, sessionId: sessionId, serverStreamingMessageId: serverStreamingMessageId)
        }
    }

    /// Restore current streaming blocks when joining mid-stream (mirror device) or reconnecting
    private func restoreStreamingBlocks(_ blocks: [[String: Any]], sessionId: String, serverStreamingMessageId: String? = nil) {
        let parsedBlocks = ContentParser.parseContentBlocks(blocks)
        guard !parsedBlocks.isEmpty else { return }

        // Get current messages for this session
        var currentMessages = appState?.getAgentMessages(for: sessionId) ?? []

        // Use server's streaming_message_id for deduplication across devices
        let messageId = serverStreamingMessageId ?? UUID().uuidString

        // Check if message with this ID already exists (deduplication)
        if let existingIndex = currentMessages.firstIndex(where: { $0.id == messageId }) {
            // Update existing message with new content
            currentMessages[existingIndex].contentBlocks = parsedBlocks
            currentMessages[existingIndex].isStreaming = true
            appState?.setAgentMessages(currentMessages, for: sessionId)
            appState?.setAgentStreamingMessageId(messageId, for: sessionId)
            print("📱 ChatViewModel: Updated existing streaming message \(messageId) with \(parsedBlocks.count) blocks")
            return
        }

        // Check if last message is a partial streaming message that needs to be replaced
        // This handles reconnection where we had partial content before disconnect
        if let lastMessage = currentMessages.last,
           lastMessage.role == .assistant,
           lastMessage.isStreaming || appState?.agentStreamingMessageIds[sessionId] == lastMessage.id {
            // Replace the last streaming message with updated content from server
            currentMessages.removeLast()
        }

        // Create a new streaming message with server's ID for deduplication
        let streamingMessage = Message(
            id: messageId,
            sessionId: sessionId,
            role: .assistant,
            contentBlocks: parsedBlocks,
            isStreaming: true
        )

        // Add to messages and track as streaming
        currentMessages.append(streamingMessage)
        appState?.setAgentMessages(currentMessages, for: sessionId)
        appState?.setAgentStreamingMessageId(messageId, for: sessionId)

        print("📱 ChatViewModel: Restored streaming blocks (\(parsedBlocks.count) blocks) for session \(sessionId) with ID \(messageId)")
    }

    /// Restore agent message history from session.subscribed response
    private func restoreHistoryFromSubscription(_ history: [[String: Any]], sessionId: String) {
        // Sort history by sequence to ensure correct order
        let sortedHistory = history.sorted { item1, item2 in
            let seq1 = item1["sequence"] as? Int ?? 0
            let seq2 = item2["sequence"] as? Int ?? 0
            return seq1 < seq2
        }

        var restoredMessages: [Message] = []

        for historyItem in sortedHistory {
            guard let role = historyItem["role"] as? String else { continue }
            let content = historyItem["content"] as? String ?? ""

            let messageRole: Message.MessageRole
            switch role {
            case "user":
                messageRole = .user
            case "assistant":
                messageRole = .assistant
            default:
                messageRole = .assistant
            }

            // Parse content_blocks if available
            var blocks: [MessageContentBlock] = []
            if let contentBlocks = historyItem["content_blocks"] as? [[String: Any]], !contentBlocks.isEmpty {
                blocks = ContentParser.parseContentBlocks(contentBlocks)
            }

            // If no blocks parsed and content is not empty, create from content
            if blocks.isEmpty && !content.isEmpty {
                if messageRole == .user {
                    blocks = [.text(id: UUID().uuidString, text: content)]
                } else {
                    blocks = ContentParser.parse(content: content, contentType: "agent")
                }
            }

            guard !blocks.isEmpty else { continue }

            let message = Message(
                sessionId: sessionId,
                role: messageRole,
                contentBlocks: blocks
            )
            restoredMessages.append(message)
        }

        if !restoredMessages.isEmpty {
            appState?.setAgentMessages(restoredMessages, for: sessionId)
            // Clear streaming state to prevent orphaned references
            appState?.agentStreamingMessageIds[sessionId] = nil
            print("📱 ChatViewModel: Restored \(restoredMessages.count) messages from session.subscribed")
        }
    }

    /// Sync cancel block from server history if missing locally
    private func syncCancelBlockFromHistory(_ history: [[String: Any]], sessionId: String, localMessages: [Message]) {
        guard let lastHistoryItem = history.last,
              let contentBlocks = lastHistoryItem["content_blocks"] as? [[String: Any]] else { return }

        let hasCancelBlock = contentBlocks.contains { block in
            (block["block_type"] as? String) == "cancel"
        }

        guard hasCancelBlock else { return }

        let localHasCancelBlock = localMessages.last?.contentBlocks.contains { block in
            if case .cancel = block { return true }
            return false
        } ?? false

        if !localHasCancelBlock {
            let cancelBlock = MessageContentBlock.cancel(id: UUID().uuidString, text: "Cancelled by user")
            let cancelMessage = Message(
                sessionId: sessionId,
                role: .assistant,
                contentBlocks: [cancelBlock]
            )
            appState?.appendAgentMessage(cancelMessage, for: sessionId)
            print("📱 ChatViewModel: Added missing cancel block from server")
        }
    }

    private func handleResponse(_ message: [String: Any]) {
        // Handle command acknowledgment
        if let payload = message["payload"] as? [String: Any],
           let acknowledged = payload["acknowledged"] as? Bool,
           acknowledged {
            // Command was acknowledged, waiting for streaming output
            return
        }
    }

    private func handleError(_ message: [String: Any]) {
        if let payload = message["payload"] as? [String: Any],
           let errorMessage = payload["message"] as? String {
            error = errorMessage
            isLoading = false
        }
    }

    // MARK: - Actions

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        // Demo mode: generate local mock response
        if appState?.isDemoMode == true {
            sendDemoMessage(text)
            return
        }

        // Generate message ID that will be used for both the Message and the command
        // This allows us to track acknowledgment from server
        let messageId = UUID().uuidString

        // Add user message to chat with pending status
        let userMessage = Message(
            id: messageId,
            sessionId: session.id,
            role: .user,
            content: text,
            sendStatus: .pending
        )

        // Send via WebSocket with the same message ID
        if session.type == .supervisor {
            sendSupervisorCommand(text, messageId: messageId)
        } else {
            sendSessionExecute(text, messageId: messageId)
        }

        // Update state on next run loop cycle to avoid publishing during view updates
        Task { @MainActor [weak self] in
            guard let self = self else { return }

            // Append message via AppState
            if self.session.type == .supervisor {
                self.appState?.supervisorMessages.append(userMessage)
                self.appState?.supervisorScrollTrigger += 1
                // Track message for acknowledgment
                self.appState?.trackMessageForAck(messageId: messageId, sessionId: nil)
            } else {
                self.appState?.appendAgentMessage(userMessage, for: self.session.id)
                self.appState?.agentScrollTriggers[self.session.id, default: 0] += 1
                // Track message for acknowledgment
                self.appState?.trackMessageForAck(messageId: messageId, sessionId: self.session.id)
            }

            self.inputText = ""
            self.isLoading = true
            self.error = nil
        }
    }

    /// Send message in demo mode with mock response
    private func sendDemoMessage(_ text: String) {
        let userMessageId = UUID().uuidString
        let assistantMessageId = UUID().uuidString

        // Create user message
        let userMessage = Message(
            id: userMessageId,
            sessionId: session.id,
            role: .user,
            content: text,
            sendStatus: .sent
        )

        // Add user message
        if session.type == .supervisor {
            appState?.supervisorMessages.append(userMessage)
            appState?.supervisorScrollTrigger += 1
        } else {
            appState?.appendAgentMessage(userMessage, for: session.id)
            appState?.agentScrollTriggers[session.id, default: 0] += 1
        }

        inputText = ""

        // Simulate typing delay then add response
        Task { @MainActor [weak self] in
            guard let self = self else { return }

            // Show loading state
            self.isLoading = true

            // Simulate AI thinking time
            try? await Task.sleep(for: .milliseconds(500 + Int.random(in: 0...1000)))

            // Generate response using DemoData
            let responseBlocks = DemoData.generateDemoResponse(for: text)

            let assistantMessage = Message(
                id: assistantMessageId,
                sessionId: self.session.id,
                role: .assistant,
                contentBlocks: responseBlocks
            )

            // Add response
            if self.session.type == .supervisor {
                self.appState?.supervisorMessages.append(assistantMessage)
                self.appState?.supervisorScrollTrigger += 1
            } else {
                self.appState?.appendAgentMessage(assistantMessage, for: self.session.id)
                self.appState?.agentScrollTriggers[self.session.id, default: 0] += 1
            }

            self.isLoading = false
        }
    }

    private func sendSupervisorCommand(_ command: String, messageId: String) {
        let config = CommandBuilder.supervisorCommand(command, messageId: messageId)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    private func sendSessionExecute(_ content: String, messageId: String) {
        let config = CommandBuilder.sessionExecute(sessionId: session.id, content: content, messageId: messageId)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    private func subscribeToSession() {
        let config = CommandBuilder.sessionSubscribe(sessionId: session.id)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
            }
        }
    }

    func refreshSession() {
        guard session.type.isAgent else { return }
        guard connectionService.connectionState == .authenticated else { return }
        subscribeToSession()
    }

    // MARK: - History Loading

    var isHistoryLoading: Bool {
        let sessionId = session.type == .supervisor ? nil : session.id
        return appState?.isHistoryLoading(for: sessionId) ?? false
    }

    var hasMoreHistory: Bool {
        let sessionId = session.type == .supervisor ? nil : session.id
        return appState?.hasMoreHistory(for: sessionId) ?? true
    }

    func loadHistory() {
        guard connectionService.connectionState == .authenticated || connectionService.connectionState == .verified else { return }
        guard !isHistoryLoading else { return }
        guard messages.isEmpty else { return }

        let sessionId = session.type == .supervisor ? nil : session.id
        setHistoryLoading(true, for: sessionId)

        let config = CommandBuilder.historyRequest(sessionId: sessionId, limit: 20)
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure = result {
                self.setHistoryLoading(false, for: sessionId)
            }
        }
    }

    func loadMoreHistory() {
        guard connectionService.connectionState == .authenticated || connectionService.connectionState == .verified else { return }
        guard !isHistoryLoading else { return }
        guard hasMoreHistory else { return }

        let sessionId = session.type == .supervisor ? nil : session.id
        let beforeSequence = appState?.oldestLoadedSequence(for: sessionId)
        setHistoryLoading(true, for: sessionId)

        let config = CommandBuilder.historyRequest(sessionId: sessionId, beforeSequence: beforeSequence, limit: 20)
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure = result {
                self.setHistoryLoading(false, for: sessionId)
            }
        }
    }

    private func setHistoryLoading(_ loading: Bool, for sessionId: String?) {
        let key = sessionId ?? "supervisor"
        if var state = appState?.historyPaginationState[key] {
            state.isLoading = loading
            appState?.historyPaginationState[key] = state
        } else {
            appState?.historyPaginationState[key] = AppState.HistoryPaginationState(
                oldestSequence: nil,
                hasMore: true,
                isLoading: loading
            )
        }
    }

    func startRecording() {
        // Stop any playing audio before recording
        AudioPlayerService.shared.stop()

        Task {
            do {
                try await audioRecorder.startRecording()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func stopRecording() {
        Task {
            do {
                let result = try await audioRecorder.stopRecording()
                await sendVoiceMessage(result)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// Send voice message to server
    private func sendVoiceMessage(_ recording: VoiceRecordingResult) async {
        // Create message ID for tracking transcription
        let messageId = UUID().uuidString

        // Add voice input bubble to chat (with pending transcription)
        let voiceBlock = MessageContentBlock.voiceInput(
            id: messageId,
            audioURL: recording.localURL,
            transcription: nil,  // Will be filled when transcription arrives
            duration: recording.duration
        )
        let voiceMessage = Message(
            id: messageId,
            sessionId: session.id,
            role: .user,
            contentBlocks: [voiceBlock]
        )

        // Append message via AppState
        if session.type == .supervisor {
            appState?.supervisorMessages.append(voiceMessage)
            appState?.supervisorScrollTrigger += 1
        } else {
            appState?.appendAgentMessage(voiceMessage, for: session.id)
            appState?.agentScrollTriggers[session.id, default: 0] += 1
        }

        isLoading = true
        error = nil

        // Send via WebSocket
        if session.type == .supervisor {
            sendSupervisorVoiceCommand(recording, messageId: messageId)
        } else {
            sendSessionVoiceExecute(recording, messageId: messageId)
        }
    }

    private func sendSupervisorVoiceCommand(_ recording: VoiceRecordingResult, messageId: String) {
        let config = CommandBuilder.supervisorVoiceCommand(
            audioBase64: recording.audioBase64,
            format: recording.format,
            messageId: messageId
        )

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    private func sendSessionVoiceExecute(_ recording: VoiceRecordingResult, messageId: String) {
        let config = CommandBuilder.sessionVoiceExecute(
            sessionId: session.id,
            audioBase64: recording.audioBase64,
            format: recording.format,
            messageId: messageId
        )

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    func clearContext() {
        if session.type == .supervisor {
            // Send clear context command to server
            // Server will broadcast supervisor.context_cleared to all clients
            let config = CommandBuilder.supervisorClearContext()

            Task { @MainActor [weak self] in
                guard let self = self else { return }
                let result = await self.commandSender.send(config)
                if case .failure(let error) = result {
                    self.error = error.localizedDescription
                }
                // Don't clear locally - wait for server broadcast (handleSupervisorContextCleared)
            }
        } else {
            // Clear agent session messages
            appState?.clearAgentMessages(for: session.id)
        }
    }

    /// Stop current generation (cancel supervisor or agent command)
    func stopGeneration() {
        let config: CommandConfig
        if session.type == .supervisor {
            config = CommandBuilder.supervisorCancel()
        } else {
            config = CommandBuilder.sessionCancel(sessionId: session.id)
        }

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            switch result {
            case .success, .queued:
                self.isLoading = false
            case .failure(let error):
                self.error = error.localizedDescription
            }
        }
    }

    /// Handle action button taps
    func handleAction(_ action: ActionType) {
        switch action {
        case .sendMessage(let message):
            inputText = message
            sendMessage()
        case .createSession(let sessionType):
            // Send to supervisor to create session
            inputText = "Create a new \(sessionType) session"
            sendMessage()
        case .openURL(let url):
            // TODO: Open URL via UIApplication
            print("Open URL: \(url)")
        case .custom(let actionId):
            print("Custom action: \(actionId)")
        }
    }
}

// MARK: - Mock for Previews

extension ChatViewModel {
    static var mock: ChatViewModel {
        // Create a mock connection service for previews
        let mockWebSocket = MockWebSocketClient()
        let mockConnectionService = MockConnectionService(webSocketClient: mockWebSocket)
        let viewModel = ChatViewModel(session: .mockClaudeSession, connectionService: mockConnectionService)
        return viewModel
    }
}

// MARK: - Mock Types for Previews

private final class MockWebSocketClient: WebSocketClientProtocol, @unchecked Sendable {
    var delegate: WebSocketClientDelegate?
    var isConnected: Bool = true

    func connect(url: String, tunnelId: String, authKey: String, deviceId: String) async throws {}
    func disconnect() {}
    func sendMessage(_ message: [String: Any]) throws {}
    @MainActor func checkConnectionHealth() {}
}

@MainActor
private final class MockConnectionService: ConnectionServicing {
    @Published private(set) var connectionState: ConnectionState = .authenticated
    @Published private(set) var workstationOnline: Bool = true
    @Published private(set) var workstationName: String = "Mock Workstation"
    @Published private(set) var workstationVersion: String = "1.0.0"
    @Published private(set) var tunnelVersion: String = "1.0.0"
    @Published private(set) var tunnelProtocolVersion: String = "1.0"
    @Published private(set) var workstationProtocolVersion: String = "1.2"
    @Published private(set) var workspacesRoot: String = "/Users/mock/work"

    var connectionStatePublisher: Published<ConnectionState>.Publisher { $connectionState }
    var workstationOnlinePublisher: Published<Bool>.Publisher { $workstationOnline }
    var workstationNamePublisher: Published<String>.Publisher { $workstationName }
    var workstationVersionPublisher: Published<String>.Publisher { $workstationVersion }
    var tunnelVersionPublisher: Published<String>.Publisher { $tunnelVersion }
    var tunnelProtocolVersionPublisher: Published<String>.Publisher { $tunnelProtocolVersion }
    var workstationProtocolVersionPublisher: Published<String>.Publisher { $workstationProtocolVersion }
    var workspacesRootPublisher: Published<String>.Publisher { $workspacesRoot }

    let messagePublisher = PassthroughSubject<[String: Any], Never>()

    private let _webSocketClient: WebSocketClientProtocol
    var webSocketClient: WebSocketClientProtocol { _webSocketClient }

    private lazy var _commandSender: MockCommandSender = MockCommandSender()
    var commandSender: CommandSending { _commandSender }

    init(webSocketClient: WebSocketClientProtocol) {
        _webSocketClient = webSocketClient
    }

    func connect() async throws {}
    func disconnect() {}
    func requestSync() async {}
    func sendMessage(_ message: String) throws {}
    func checkConnectionHealth() {}
}

@MainActor
private final class MockCommandSender: CommandSending {
    var pendingCommandCount: Int { 0 }

    func send(_ config: CommandConfig) async -> CommandSendResult {
        return .success
    }

    func sendThrowing(_ config: CommandConfig) async throws {
        // No-op for mock
    }

    func cancelPendingCommands(for sessionId: String) {
        // No-op for mock
    }

    func cancelAllPendingCommands() {
        // No-op for mock
    }
}
