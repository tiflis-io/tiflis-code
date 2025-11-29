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
    @Published var sessions: [Session] = Session.mockSessions
    @Published var selectedSessionId: String? = "supervisor"
    
    @AppStorage("tunnelURL") private var tunnelURL = ""
    @AppStorage("tunnelId") private var tunnelId = ""
    
    private let connectionService: ConnectionServicing
    private var cancellables = Set<AnyCancellable>()
    
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
        let session = Session(
            type: type,
            workspace: workspace,
            project: project
        )
        sessions.append(session)
        selectedSessionId = session.id
    }
    
    func terminateSession(_ session: Session) {
        sessions.removeAll { $0.id == session.id }
        if selectedSessionId == session.id {
            selectedSessionId = "supervisor"
        }
    }
}

