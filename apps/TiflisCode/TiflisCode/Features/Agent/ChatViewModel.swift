//
//  ChatViewModel.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation
@preconcurrency import Combine

/// ViewModel for ChatView managing messages and interactions
@MainActor
final class ChatViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var inputText = ""
    @Published var isRecording = false
    @Published var error: String?

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

    // MARK: - Dependencies

    let session: Session
    private let connectionService: ConnectionServicing
    private let webSocketClient: WebSocketClientProtocol
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
        self.deviceId = deviceId
        self.appState = appState

        observeConnectionState()
        observeMessages()
    }

    // MARK: - Connection Observation

    private func observeConnectionState() {
        connectionService.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self = self else { return }

                switch state {
                case .connected:
                    // Subscribe to session output for agent sessions
                    if self.session.type.isAgent && !self.isSubscribed {
                        self.subscribeToSession()
                    }
                case .disconnected, .error:
                    self.isSubscribed = false
                case .connecting:
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
        } else {
            appState?.appendAgentMessage(userMessage, for: session.id)
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
        let requestId = UUID().uuidString
        let message: [String: Any] = [
            "type": "supervisor.command",
            "id": requestId,
            "payload": [
                "command": command
            ]
        ]

        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to send command: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private func sendSessionExecute(_ content: String) {
        let requestId = UUID().uuidString
        let message: [String: Any] = [
            "type": "session.execute",
            "id": requestId,
            "session_id": session.id,
            "payload": [
                "content": content
            ]
        ]

        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to send message: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private func subscribeToSession() {
        let message: [String: Any] = [
            "type": "session.subscribe",
            "session_id": session.id
        ]

        do {
            try webSocketClient.sendMessage(message)
        } catch {
            self.error = "Failed to subscribe: \(error.localizedDescription)"
        }
    }

    func startRecording() {
        isRecording = true
    }

    func stopRecording() {
        isRecording = false

        // TODO: Integrate with real STT
        // For now, add a placeholder voice input block
        let blocks: [MessageContentBlock] = [
            .voiceInput(id: UUID().uuidString, audioURL: nil, transcription: "[Voice input not yet implemented]", duration: 0)
        ]
        let transcribedMessage = Message(
            sessionId: session.id,
            role: .user,
            contentBlocks: blocks
        )

        if session.type == .supervisor {
            appState?.supervisorMessages.append(transcribedMessage)
        } else {
            appState?.appendAgentMessage(transcribedMessage, for: session.id)
        }
    }

    func clearContext() {
        if session.type == .supervisor {
            // Send clear context command to server
            // Server will broadcast supervisor.context_cleared to all clients
            let requestId = UUID().uuidString
            let message: [String: Any] = [
                "type": "supervisor.clear_context",
                "id": requestId
            ]

            do {
                try webSocketClient.sendMessage(message)
                // Don't clear locally - wait for server broadcast (handleSupervisorContextCleared)
            } catch {
                self.error = "Failed to clear context: \(error.localizedDescription)"
            }
        } else {
            // Clear agent session messages
            appState?.clearAgentMessages(for: session.id)
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
}

@MainActor
private final class MockConnectionService: ConnectionServicing {
    @Published private(set) var connectionState: ConnectionState = .connected
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

    init(webSocketClient: WebSocketClientProtocol) {
        _webSocketClient = webSocketClient
    }

    func connect() async throws {}
    func disconnect() {}
    func requestSync() async {}
}
