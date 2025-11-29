//
//  TiflisCodeApp.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

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
    @Published var sessions: [Session] = Session.mockSessions
    @Published var selectedSessionId: String? = "supervisor"
    
    @AppStorage("tunnelURL") private var tunnelURL = ""
    
    var selectedSession: Session? {
        guard selectedSessionId != Self.settingsId else { return nil }
        return sessions.first { $0.id == selectedSessionId }
    }
    
    var isShowingSettings: Bool {
        selectedSessionId == Self.settingsId
    }
    
    /// Check if we have saved connection credentials
    var hasConnectionConfig: Bool {
        !tunnelURL.isEmpty
    }
    
    init() {
        // Auto-connect on launch if we have saved credentials
        if hasConnectionConfig {
            connect()
        }
    }
    
    // MARK: - Actions
    
    func connect() {
        guard hasConnectionConfig else { return }
        
        connectionState = .connecting
        
        // Simulate connection delay
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            connectionState = .connected
        }
    }
    
    func disconnect() {
        connectionState = .disconnected
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

