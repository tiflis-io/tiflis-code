//
//  SidebarView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Sidebar navigation for session selection
struct SidebarView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var showCreateSessionSheet: Bool
    var onDismiss: (() -> Void)?
    
    private var supervisorSession: Session? {
        appState.sessions.first { $0.type == .supervisor }
    }
    
    private var agentSessions: [Session] {
        appState.sessions.filter { $0.type.isAgent }
    }
    
    private var terminalSessions: [Session] {
        appState.sessions.filter { $0.type == .terminal }
    }
    
    var body: some View {
        List {
            // Supervisor (always visible)
            if let supervisor = supervisorSession {
                Section {
                    Button {
                        selectSession(supervisor.id)
                    } label: {
                        SessionRow(session: supervisor, isSelected: appState.selectedSessionId == supervisor.id)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            
            // Agent Sessions
            if !agentSessions.isEmpty {
                Section("Agent Sessions") {
                    ForEach(agentSessions) { session in
                        Button {
                            selectSession(session.id)
                        } label: {
                            SessionRow(session: session, isSelected: appState.selectedSessionId == session.id)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                appState.terminateSession(session)
                            } label: {
                                Label("Terminate", systemImage: "xmark.circle")
                            }
                        }
                    }
                }
            }
            
            // Terminal Sessions
            if !terminalSessions.isEmpty {
                Section("Terminals") {
                    ForEach(terminalSessions) { session in
                        Button {
                            selectSession(session.id)
                        } label: {
                            SessionRow(session: session, isSelected: appState.selectedSessionId == session.id)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                appState.terminateSession(session)
                            } label: {
                                Label("Terminate", systemImage: "xmark.circle")
                            }
                        }
                    }
                }
            }
            
            // Settings at the bottom
            Section {
                Button {
                    selectSession(AppState.settingsId)
                } label: {
                    HStack {
                        Label("Settings", systemImage: "gear")
                            .foregroundStyle(.primary)
                        Spacer()
                        if appState.isShowingSettings {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.sidebar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Tiflis Code")
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(0.5)
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSessionSheet = true
                } label: {
                    Label("New Session", systemImage: "plus")
                }
            }
        }
    }
    
    private func selectSession(_ id: String) {
        if appState.selectedSessionId == id {
            // Already selected - just dismiss
            onDismiss?()
        } else {
            // Select new session
            appState.selectedSessionId = id
        }
    }
}

/// Row representing a session in the sidebar
struct SessionRow: View {
    let session: Session
    let isSelected: Bool
    
    var body: some View {
        HStack(spacing: 12) {
            // Session type icon (custom image or SF Symbol)
            SessionIcon(type: session.type)
                .frame(width: 32, height: 32)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(session.type.displayName)
                    .font(.body)
                    .fontWeight(.medium)
                
                if let subtitle = session.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            if isSelected {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Session icon view that uses custom images or SF Symbols
struct SessionIcon: View {
    let type: Session.SessionType
    
    var body: some View {
        if let customIcon = type.customIcon {
            Image(customIcon)
                .resizable()
                .aspectRatio(contentMode: .fit)
        } else {
            Image(systemName: type.sfSymbol)
                .font(.title2)
                .foregroundStyle(.primary)
        }
    }
}

// MARK: - Create Session Sheet

struct CreateSessionSheet: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedType: Session.SessionType = .claude
    @State private var selectedWorkspace: String = ""
    @State private var selectedProject: String = ""
    
    private let sessionTypes: [Session.SessionType] = [.claude, .cursor, .opencode, .terminal]
    
    // Mock data for workspaces and their projects
    private let workspaces: [String] = ["tiflis", "personal", "work"]
    
    private let projectsByWorkspace: [String: [String]] = [
        "tiflis": ["tiflis-code", "tiflis-docs", "tiflis-web"],
        "personal": ["dotfiles", "notes", "scripts"],
        "work": ["api-service", "frontend-app", "infrastructure"]
    ]
    
    private var availableProjects: [String] {
        projectsByWorkspace[selectedWorkspace] ?? []
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Session Type") {
                    ForEach(sessionTypes, id: \.self) { type in
                        SessionTypeRow(
                            type: type,
                            isSelected: selectedType == type
                        )
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedType = type
                        }
                    }
                }
                
                if selectedType != .terminal {
                    Section("Project") {
                        Picker("Workspace", selection: $selectedWorkspace) {
                            Text("Select workspace").tag("")
                            ForEach(workspaces, id: \.self) { workspace in
                                Text(workspace).tag(workspace)
                            }
                        }
                        
                        Picker("Project", selection: $selectedProject) {
                            Text("Select project").tag("")
                            ForEach(availableProjects, id: \.self) { project in
                                Text(project).tag(project)
                            }
                        }
                        .disabled(selectedWorkspace.isEmpty)
                    }
                }
            }
            .navigationTitle("New Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        appState.createSession(
                            type: selectedType,
                            workspace: selectedWorkspace.isEmpty ? nil : selectedWorkspace,
                            project: selectedProject.isEmpty ? nil : selectedProject
                        )
                        dismiss()
                    }
                    .disabled(selectedType != .terminal && (selectedWorkspace.isEmpty || selectedProject.isEmpty))
                }
            }
            .onChange(of: selectedWorkspace) { _, _ in
                // Reset project when workspace changes
                selectedProject = ""
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Row for session type selection with custom icons
struct SessionTypeRow: View {
    let type: Session.SessionType
    let isSelected: Bool
    
    var body: some View {
        HStack(spacing: 12) {
            SessionIcon(type: type)
                .frame(width: 28, height: 28)
            
            Text(type.displayName)
                .font(.body)
            
            Spacer()
            
            if isSelected {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.accentColor)
                    .fontWeight(.semibold)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Preview

#Preview {
    NavigationSplitView {
        SidebarView(showCreateSessionSheet: .constant(false))
    } detail: {
        Text("Detail")
    }
    .environmentObject(AppState())
}
