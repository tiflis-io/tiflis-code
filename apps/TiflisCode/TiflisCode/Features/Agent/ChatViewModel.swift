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
    var scrollTrigger: Int {
        guard let appState = appState else { return 0 }
        if session.type == .supervisor {
            return appState.supervisorScrollTrigger
        }
        return appState.agentScrollTriggers[session.id] ?? 0
    }

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
            restoreStreamingBlocks(streamingBlocks, sessionId: sessionId)
        }
    }

    /// Restore current streaming blocks when joining mid-stream (mirror device) or reconnecting
    private func restoreStreamingBlocks(_ blocks: [[String: Any]], sessionId: String) {
        let parsedBlocks = ContentParser.parseContentBlocks(blocks)
        guard !parsedBlocks.isEmpty else { return }

        // Get current messages for this session
        var currentMessages = appState?.getAgentMessages(for: sessionId) ?? []

        // Check if last message is a partial streaming message that needs to be replaced
        // This handles reconnection where we had partial content before disconnect
        if let lastMessage = currentMessages.last,
           lastMessage.role == .assistant,
           lastMessage.isStreaming || appState?.agentStreamingMessageIds[sessionId] == lastMessage.id {
            // Replace the last streaming message with updated content from server
            currentMessages.removeLast()
        }

        // Create a new streaming message with the current blocks from server
        let streamingMessage = Message(
            sessionId: sessionId,
            role: .assistant,
            contentBlocks: parsedBlocks,
            isStreaming: true
        )

        // Add to messages and track as streaming
        currentMessages.append(streamingMessage)
        appState?.setAgentMessages(currentMessages, for: sessionId)
        appState?.setAgentStreamingMessageId(streamingMessage.id, for: sessionId)

        print("📱 ChatViewModel: Restored streaming blocks (\(parsedBlocks.count) blocks) for session \(sessionId)")
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

        // Add user message to chat
        let userMessage = Message(
            sessionId: session.id,
            role: .user,
            content: text
        )

        // Append message via AppState
        if session.type == .supervisor {
            appState?.supervisorMessages.append(userMessage)
            appState?.supervisorScrollTrigger += 1
        } else {
            appState?.appendAgentMessage(userMessage, for: session.id)
            appState?.agentScrollTriggers[session.id, default: 0] += 1
        }

        inputText = ""
        isLoading = true
        error = nil

        // Send via WebSocket
        if session.type == .supervisor {
            sendSupervisorCommand(text)
        } else {
            sendSessionExecute(text)
        }
    }

    private func sendSupervisorCommand(_ command: String) {
        let config = CommandBuilder.supervisorCommand(command)

        Task { @MainActor [weak self] in
            guard let self = self else { return }
            let result = await self.commandSender.send(config)
            if case .failure(let error) = result {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    private func sendSessionExecute(_ content: String) {
        let config = CommandBuilder.sessionExecute(sessionId: session.id, content: content)

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

    /// Refresh session state by re-subscribing to get latest messages from server
    /// Call this when the view appears to sync state from other devices
    func refreshSession() {
        guard session.type.isAgent else { return }
        guard connectionService.connectionState == .authenticated else { return }

        // Always re-subscribe to get latest state from server
        // This ensures we sync messages from other devices
        subscribeToSession()
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
