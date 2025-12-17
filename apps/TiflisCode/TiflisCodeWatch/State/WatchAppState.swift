//
//  WatchAppState.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import SwiftUI
import Combine

/// Main application state for watchOS
/// Manages connection, sessions, and messages with memory constraints in mind
@MainActor
final class WatchAppState: ObservableObject {
    // MARK: - Constants

    /// Maximum number of messages to keep per session (memory constraint)
    private let maxMessagesPerSession = 20

    // MARK: - Connection State

    /// Current WebSocket connection state
    @Published var connectionState: ConnectionState = .disconnected

    /// Whether workstation server is online
    @Published var workstationOnline: Bool = false

    /// Whether credentials are available (Published to trigger view updates)
    @Published var hasCredentials: Bool = false

    // MARK: - Sessions

    /// Active agent sessions (excludes terminal sessions)
    @Published var sessions: [Session] = []

    /// Currently selected session ID (supervisor by default)
    @Published var selectedSessionId: String = "supervisor"

    // MARK: - Messages

    /// Supervisor chat messages
    @Published var supervisorMessages: [Message] = []

    /// Agent session messages keyed by session ID
    @Published var agentMessages: [String: [Message]] = [:]

    /// Loading state for supervisor
    @Published var supervisorIsLoading: Bool = false

    /// Loading state for agent sessions
    @Published var agentIsLoading: [String: Bool] = [:]

    // MARK: - Settings

    /// Whether TTS is enabled (synced from iPhone)
    @Published var ttsEnabled: Bool = true

    /// STT language (synced from iPhone)
    @Published var sttLanguage: String = "en"

    // MARK: - Debug State (visible in UI when logs don't work)

    @Published var debugAppStartTime: Date = Date()
    @Published var debugLastSyncState: String = "No sync received"
    @Published var debugSyncSessionCount: Int = 0
    @Published var debugSyncParsedCount: Int = 0
    @Published var debugLastMessageHandled: String = "None"

    // MARK: - Dependencies

    let connectivityManager: WatchConnectivityManager
    private(set) var connectionService: WatchConnectionService?

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private var periodicSyncTask: Task<Void, Never>?

    /// Interval for periodic session list sync (30 seconds)
    private let periodicSyncInterval: TimeInterval = 30

    // MARK: - Initialization

    init(connectivityManager: WatchConnectivityManager = .shared) {
        self.connectivityManager = connectivityManager

        // IMPORTANT: Set initial hasCredentials value SYNCHRONOUSLY before any view renders
        // This prevents the setup view from flashing when credentials are already stored locally
        let initialHasCredentials = connectivityManager.hasCredentials
        self.hasCredentials = initialHasCredentials
        NSLog("⌚️ WatchAppState init: initial hasCredentials=%d (synchronous check)", initialHasCredentials ? 1 : 0)

        // Set up bindings for future updates from iPhone
        setupBindings()

        NSLog("⌚️ WatchAppState init: bindings set up")

        // Handle initial connection setup in a deferred task
        Task { @MainActor [weak self] in
            guard let self = self else { return }

            // Small delay to allow WatchConnectivity activation to complete
            try? await Task.sleep(for: .milliseconds(100))

            // Re-check credentials in case they were updated during activation
            let currentHasCredentials = self.connectivityManager.hasCredentials
            NSLog("⌚️ WatchAppState init task: currentHasCredentials=%d, self.hasCredentials=%d",
                  currentHasCredentials ? 1 : 0, self.hasCredentials ? 1 : 0)

            if currentHasCredentials != self.hasCredentials {
                self.hasCredentials = currentHasCredentials
            }

            if self.hasCredentials && self.connectionService == nil {
                NSLog("⌚️ WatchAppState init task: credentials available, initializing connection service")
                self.initializeConnection()

                // Auto-connect when credentials are available from stored data
                NSLog("⌚️ WatchAppState init task: auto-connecting with stored credentials")
                await self.connect()
            }
        }
    }

    // MARK: - Public Methods

    /// Initialize connection service when credentials become available
    func initializeConnection() {
        guard hasCredentials else {
            print("⌚️ WatchAppState: Cannot initialize - no credentials")
            return
        }

        guard connectionService == nil else {
            print("⌚️ WatchAppState: Connection service already initialized")
            return
        }

        connectionService = WatchConnectionService(
            connectivityManager: connectivityManager,
            appState: self
        )
        print("⌚️ WatchAppState: Connection service initialized")
    }

    /// Connect to the workstation
    func connect() async {
        NSLog("⌚️ WatchAppState.connect() called")
        guard let service = connectionService else {
            NSLog("⌚️ WatchAppState.connect: no service, initializing...")
            initializeConnection()
            guard let service = connectionService else {
                NSLog("⌚️ WatchAppState.connect: still no service after init!")
                return
            }
            NSLog("⌚️ WatchAppState.connect: service initialized, connecting...")
            try? await service.connect()
            return
        }

        NSLog("⌚️ WatchAppState.connect: service exists, connecting...")
        try? await service.connect()
    }

    /// Disconnect from the workstation
    func disconnect() {
        connectionService?.disconnect()
    }

    /// Request credentials from iPhone
    func requestCredentials() {
        connectivityManager.requestCredentials()
    }

    /// Request session list sync from workstation
    func requestSync() async {
        await connectionService?.requestSync()
    }

    /// Start periodic sync for session list updates
    func startPeriodicSync() {
        // Cancel existing task if any
        stopPeriodicSync()

        periodicSyncTask = Task { [weak self] in
            while !Task.isCancelled {
                // Wait for the interval before syncing
                try? await Task.sleep(for: .seconds(self?.periodicSyncInterval ?? 30))

                // Check if still connected and task not cancelled
                guard !Task.isCancelled else { break }

                let isConnected = await MainActor.run { self?.connectionState.isConnected ?? false }
                guard isConnected else { continue }

                // Perform sync
                await self?.requestSync()
                NSLog("⌚️ WatchAppState: Periodic sync triggered")
            }
        }
        NSLog("⌚️ WatchAppState: Periodic sync started (interval: %.0fs)", periodicSyncInterval)
    }

    /// Stop periodic sync
    func stopPeriodicSync() {
        periodicSyncTask?.cancel()
        periodicSyncTask = nil
    }

    /// Send a text command to supervisor
    func sendSupervisorCommand(_ text: String) async {
        guard let service = connectionService else { return }

        // Create and add user message
        let messageId = UUID().uuidString
        let userMessage = Message(
            id: messageId,
            sessionId: "supervisor",
            role: .user,
            content: text
        )
        addSupervisorMessage(userMessage)
        supervisorIsLoading = true

        // Send command
        await service.sendSupervisorCommand(text: text, messageId: messageId)
    }

    /// Send a voice command to supervisor
    func sendSupervisorVoiceCommand(audioData: Data, format: String) async {
        guard let service = connectionService else { return }

        // Create and add user message with voice indicator
        let messageId = UUID().uuidString
        let userMessage = Message(
            id: messageId,
            sessionId: "supervisor",
            role: .user,
            contentBlocks: [
                .voiceInput(id: UUID().uuidString, audioURL: nil, transcription: nil, duration: 0)
            ]
        )
        addSupervisorMessage(userMessage)
        supervisorIsLoading = true

        // Send voice command
        await service.sendSupervisorVoiceCommand(
            audioData: audioData,
            format: format,
            messageId: messageId
        )
    }

    /// Send a text command to an agent session
    func sendAgentCommand(_ text: String, sessionId: String) async {
        guard let service = connectionService else { return }

        // Create and add user message
        let messageId = UUID().uuidString
        let userMessage = Message(
            id: messageId,
            sessionId: sessionId,
            role: .user,
            content: text
        )
        addAgentMessage(userMessage, for: sessionId)
        agentIsLoading[sessionId] = true

        // Send command
        await service.sendAgentCommand(text: text, sessionId: sessionId, messageId: messageId)
    }

    /// Send a voice command to an agent session
    func sendAgentVoiceCommand(audioData: Data, format: String, sessionId: String) async {
        guard let service = connectionService else { return }

        // Create and add user message with voice indicator
        let messageId = UUID().uuidString
        let userMessage = Message(
            id: messageId,
            sessionId: sessionId,
            role: .user,
            contentBlocks: [
                .voiceInput(id: UUID().uuidString, audioURL: nil, transcription: nil, duration: 0)
            ]
        )
        addAgentMessage(userMessage, for: sessionId)
        agentIsLoading[sessionId] = true

        // Send voice command
        await service.sendAgentVoiceCommand(
            audioData: audioData,
            format: format,
            sessionId: sessionId,
            messageId: messageId
        )
    }

    // MARK: - Message Management

    /// Add a supervisor message (with limit)
    func addSupervisorMessage(_ message: Message) {
        supervisorMessages.append(message)
        trimSupervisorMessages()
    }

    /// Add an agent message (with limit)
    func addAgentMessage(_ message: Message, for sessionId: String) {
        var messages = agentMessages[sessionId] ?? []
        messages.append(message)
        if messages.count > maxMessagesPerSession {
            messages.removeFirst(messages.count - maxMessagesPerSession)
        }
        agentMessages[sessionId] = messages
    }

    /// Update an existing message (for streaming/transcription)
    func updateMessage(id: String, sessionId: String, update: (inout Message) -> Void) {
        if sessionId == "supervisor" {
            if let index = supervisorMessages.firstIndex(where: { $0.id == id }) {
                update(&supervisorMessages[index])
            }
        } else {
            if var messages = agentMessages[sessionId],
               let index = messages.firstIndex(where: { $0.id == id }) {
                update(&messages[index])
                agentMessages[sessionId] = messages
            }
        }
    }

    /// Get messages for a session
    func messages(for sessionId: String) -> [Message] {
        if sessionId == "supervisor" {
            return supervisorMessages
        }
        return agentMessages[sessionId] ?? []
    }

    /// Clear all messages (e.g., on disconnect)
    func clearAllMessages() {
        supervisorMessages.removeAll()
        agentMessages.removeAll()
    }

    /// Clear supervisor messages (before loading fresh history)
    func clearSupervisorMessages() {
        supervisorMessages.removeAll()
    }

    /// Clear messages for a specific agent session (before loading fresh history)
    func clearAgentMessages(for sessionId: String) {
        agentMessages[sessionId] = []
    }

    /// Request chat history for a session (on-demand loading)
    /// Called when user opens a chat detail view
    func requestHistory(sessionId: String?) async {
        await connectionService?.requestHistory(sessionId: sessionId)
    }

    // MARK: - Session Management

    /// Add or update a session
    func updateSession(_ session: Session) {
        // Only track agent sessions (not terminal)
        guard session.type.isAgent || session.type == .supervisor else { return }

        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
        } else {
            sessions.append(session)
        }
    }

    /// Remove a session
    func removeSession(id: String) {
        sessions.removeAll { $0.id == id }
        agentMessages.removeValue(forKey: id)
        agentIsLoading.removeValue(forKey: id)
    }

    /// Get agent sessions only (filter out supervisor and terminal)
    var agentSessions: [Session] {
        sessions.filter { $0.type.isAgent }
    }

    // MARK: - Private Methods

    private func setupBindings() {
        // Listen for credential changes
        connectivityManager.$credentials
            .receive(on: DispatchQueue.main)
            .sink { [weak self] credentials in
                guard let self = self else { return }
                let wasConnected = self.hasCredentials
                // Update hasCredentials to trigger view updates
                self.hasCredentials = credentials?.isValid ?? false

                if credentials?.isValid == true && self.connectionService == nil {
                    self.initializeConnection()
                }

                // Auto-connect when credentials become available (received from iPhone)
                if credentials?.isValid == true && !wasConnected && !self.connectionState.isConnected {
                    NSLog("⌚️ WatchAppState: credentials received, auto-connecting")
                    Task {
                        await self.connect()
                    }
                }
            }
            .store(in: &cancellables)

        // Listen for settings changes
        connectivityManager.$settings
            .receive(on: DispatchQueue.main)
            .compactMap { $0 }
            .sink { [weak self] settings in
                self?.ttsEnabled = settings.ttsEnabled
                self?.sttLanguage = settings.sttLanguage
            }
            .store(in: &cancellables)
    }

    private func trimSupervisorMessages() {
        if supervisorMessages.count > maxMessagesPerSession {
            supervisorMessages.removeFirst(supervisorMessages.count - maxMessagesPerSession)
        }
    }
}
