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
    @Published var tunnelVersion: String = ""
    @Published var tunnelProtocolVersion: String = ""
    @Published var sessions: [Session] = Session.mockSessions
    @Published var selectedSessionId: String? = "supervisor"
    
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
        
        // Find and update temporary session with actual session ID
        if let index = sessions.firstIndex(where: { $0.id == tempSessionId }) {
            let updatedSession = sessions[index]
            // Create new session with actual session ID from backend
            let newSession = Session(
                id: sessionId,
                type: updatedSession.type,
                workspace: updatedSession.workspace,
                project: updatedSession.project
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
            return
        }
        
        // Check if we already have this session (from response handler)
        if sessions.contains(where: { $0.id == sessionId }) {
            return // Already handled
        }
        
        // Create new session from broadcast
        let sessionType = payload["session_type"] as? String ?? "terminal"
        let workspace = payload["workspace"] as? String
        let project = payload["project"] as? String
        
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
        
        let session = Session(
            id: sessionId,
            type: type,
            workspace: workspace,
            project: project
        )
        sessions.append(session)
    }
    
    private func handleSessionTerminatedMessage(_ message: [String: Any]) {
        guard let sessionId = message["session_id"] as? String else { return }
        
        // Remove terminated session
        sessions.removeAll { $0.id == sessionId }
        
        // If it was selected, switch to supervisor
        if selectedSessionId == sessionId {
            selectedSessionId = "supervisor"
        }
    }
    
    private func handleSyncStateMessage(_ message: [String: Any]) {
        // Handle sync.state response to restore sessions after app restart
        guard let payload = message["payload"] as? [String: Any],
              let sessionsArray = payload["sessions"] as? [[String: Any]] else {
            return
        }

        // Build set of active session IDs from server
        let serverSessionIds = Set(sessionsArray.compactMap { $0["session_id"] as? String })

        // Detect stale sessions: sessions we have locally but no longer exist on server
        // This happens when:
        // 1. Server restarted and PTY processes died
        // 2. Session was terminated while app was in background
        let staleSessions = sessions.filter { session in
            // Skip supervisor (it's a singleton that always exists conceptually)
            guard session.type != .supervisor else { return false }
            return !serverSessionIds.contains(session.id)
        }

        // Remove stale sessions
        for staleSession in staleSessions {
            #if DEBUG
            print("🗑️ AppState: Removing stale session \(staleSession.id) (not in server sync)")
            #endif
            sessions.removeAll { $0.id == staleSession.id }

            // If currently viewing this session, navigate to supervisor
            if selectedSessionId == staleSession.id {
                selectedSessionId = "supervisor"
            }
        }

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

            // Create session (workspace/project not in sync.state, will be empty)
            let session = Session(
                id: sessionId,
                type: type,
                workspace: nil,
                project: nil
            )
            restoredSessions.append(session)
        }

        // Add restored sessions to existing sessions (preserving local state)
        sessions.append(contentsOf: restoredSessions)

        // Ensure supervisor always exists
        if !sessions.contains(where: { $0.type == .supervisor }) {
            sessions.insert(Session(id: "supervisor", type: .supervisor, workspace: nil, project: nil), at: 0)
        }

        // Store subscriptions for view models to re-subscribe
        // View models will handle re-subscription when they observe connection state
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
        // Don't allow terminating supervisor session
        guard session.type != .supervisor else {
            print("⚠️ AppState: Cannot terminate supervisor session")
            return
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
        guard connectionState == .connected else {
            print("⚠️ AppState: Not connected, session terminated locally only")
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

