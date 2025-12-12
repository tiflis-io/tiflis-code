//
//  SidebarView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
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
                        SessionRow(session: supervisor, isSelected: appState.selectedSessionId == supervisor.id, workspacesRoot: appState.workspacesRoot)
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
                            SessionRow(session: session, isSelected: appState.selectedSessionId == session.id, workspacesRoot: appState.workspacesRoot)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                appState.terminateSession(session, silent: true)
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
                            SessionRow(session: session, isSelected: appState.selectedSessionId == session.id, workspacesRoot: appState.workspacesRoot)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                appState.terminateSession(session, silent: true)
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
            ToolbarItem(placement: .navigation) {
                if let onDismiss = onDismiss {
                    Button {
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.medium))
                    }
                    .accessibilityLabel("Close Sidebar")
                }
            }
            
            ToolbarItem(placement: .principal) {
                Text("Tiflis Code")
                    .font(.system(size: 18, weight: .semibold))
                    .tracking(0.5)
            }
            
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
    let workspacesRoot: String?

    var body: some View {
        HStack(spacing: 12) {
            // Session type icon (custom image or SF Symbol)
            SessionIcon(type: session.type)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.displayName)
                    .font(.body)
                    .fontWeight(.medium)

                if let subtitle = session.subtitle(relativeTo: workspacesRoot) {
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

    @State private var selectedAgent: AgentConfig?
    @State private var selectedWorkspace: String = ""
    @State private var selectedProject: String = ""
    @State private var isTerminal: Bool = false

    /// Get available projects for the selected workspace
    private var availableProjects: [ProjectConfig] {
        appState.workspaces.first { $0.name == selectedWorkspace }?.projects ?? []
    }

    /// Computed list of agent options (agents + terminal)
    private var agentOptions: [AgentConfig] {
        appState.availableAgents.isEmpty
            ? [
                AgentConfig(name: "claude", baseType: "claude", description: "Claude Code Agent", isAlias: false),
                AgentConfig(name: "cursor", baseType: "cursor", description: "Cursor Agent", isAlias: false),
                AgentConfig(name: "opencode", baseType: "opencode", description: "OpenCode Agent", isAlias: false),
            ]
            : appState.availableAgents
    }

    /// Computed list of workspace names
    private var workspaceNames: [String] {
        appState.workspaces.map { $0.name }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Session Type") {
                    // Terminal option
                    AgentTypeRow(
                        name: "Terminal",
                        type: .terminal,
                        isAlias: false,
                        isSelected: isTerminal
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        isTerminal = true
                        selectedAgent = nil
                    }

                    // Agent options (base + aliases)
                    ForEach(agentOptions) { agent in
                        AgentTypeRow(
                            name: agent.isAlias ? "\(agent.name) (\(agent.baseType))" : agent.name.capitalized,
                            type: agent.sessionType,
                            isAlias: agent.isAlias,
                            isSelected: !isTerminal && selectedAgent?.name == agent.name
                        )
                        .contentShape(Rectangle())
                        .onTapGesture {
                            isTerminal = false
                            selectedAgent = agent
                        }
                    }
                }

                if !isTerminal {
                    Section("Project") {
                        Picker("Workspace", selection: $selectedWorkspace) {
                            Text("Select workspace").tag("")
                            ForEach(workspaceNames, id: \.self) { workspace in
                                Text(workspace).tag(workspace)
                            }
                        }

                        Picker("Project", selection: $selectedProject) {
                            Text("Select project").tag("")
                            ForEach(availableProjects) { project in
                                Text(project.name).tag(project.name)
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
                        if isTerminal {
                            appState.createSession(
                                type: .terminal,
                                agentName: nil,
                                workspace: nil,
                                project: nil
                            )
                        } else if let agent = selectedAgent {
                            appState.createSession(
                                type: agent.sessionType,
                                agentName: agent.isAlias ? agent.name : nil,
                                workspace: selectedWorkspace.isEmpty ? nil : selectedWorkspace,
                                project: selectedProject.isEmpty ? nil : selectedProject
                            )
                        }
                        dismiss()
                    }
                    .disabled(!isTerminal && (selectedAgent == nil || selectedWorkspace.isEmpty || selectedProject.isEmpty))
                }
            }
            .onChange(of: selectedWorkspace) { _, _ in
                // Reset project when workspace changes
                selectedProject = ""
            }
            .onAppear {
                // Select first agent by default if available
                if let firstAgent = agentOptions.first, selectedAgent == nil && !isTerminal {
                    selectedAgent = firstAgent
                }
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

/// Row for agent type selection with alias support
struct AgentTypeRow: View {
    let name: String
    let type: Session.SessionType
    let isAlias: Bool
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            SessionIcon(type: type)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.body)
                if isAlias {
                    Text("Custom alias")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

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
