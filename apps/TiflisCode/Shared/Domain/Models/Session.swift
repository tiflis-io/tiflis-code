//
//  Session.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Terminal configuration received from workstation
struct TerminalConfig: Codable, Equatable, Hashable {
    let bufferSize: Int

    enum CodingKeys: String, CodingKey {
        case bufferSize = "buffer_size"
    }
}

/// Represents a session (Supervisor, Agent, or Terminal)
struct Session: Identifiable, Equatable, Hashable {
    let id: String
    let type: SessionType
    /// Agent name (alias) if different from session type (e.g., "zai" for a claude alias)
    let agentName: String?
    let workspace: String?
    let project: String?
    let worktree: String?
    let workingDir: String?
    let status: SessionStatus
    let createdAt: Date
    let terminalConfig: TerminalConfig?
    
    enum SessionType: String, Codable, Equatable, Hashable {
        case supervisor
        case cursor
        case claude
        case opencode
        case terminal
        
        var displayName: String {
            switch self {
            case .supervisor:
                return "Supervisor"
            case .cursor:
                return "Cursor"
            case .claude:
                return "Claude Code"
            case .opencode:
                return "OpenCode"
            case .terminal:
                return "Terminal"
            }
        }
        
        /// SF Symbol icon name (used as fallback)
        var sfSymbol: String {
            switch self {
            case .supervisor:
                return "brain"
            case .cursor:
                return "cursorarrow.rays"
            case .claude:
                return "brain.head.profile"
            case .opencode:
                return "chevron.left.forwardslash.chevron.right"
            case .terminal:
                return "apple.terminal.fill"
            }
        }
        
        /// Custom asset image name (nil if using SF Symbol)
        var customIcon: String? {
            switch self {
            case .supervisor:
                return "TiflisLogo"
            case .cursor:
                return "CursorLogo"
            case .claude:
                return "ClaudeLogo"
            case .opencode:
                return "OpenCodeLogo"
            case .terminal:
                return nil // Use SF Symbol
            }
        }
        
        var isAgent: Bool {
            switch self {
            case .cursor, .claude, .opencode:
                return true
            default:
                return false
            }
        }
    }
    
    enum SessionStatus: String, Codable, Equatable, Hashable {
        case active
        case terminated
    }
    
    /// Returns the display subtitle for the session, showing relative path from workspaces root
    /// - Parameter workspacesRoot: The workspaces root directory path from workstation
    /// - Returns: A relative path string or nil if no path information is available
    func subtitle(relativeTo workspacesRoot: String?) -> String? {
        // Check if we have real workspace/project (not sentinel values used for terminal defaults)
        let hasRealWorkspace = workspace != nil && workspace != "home"
        let hasRealProject = project != nil && project != "default"

        // If we have real workspace/project, show that format (relative by nature)
        if hasRealWorkspace, hasRealProject, let workspace = workspace, let project = project {
            if let worktree = worktree {
                return "\(workspace)/\(project)--\(worktree)"
            }
            return "\(workspace)/\(project)"
        }

        // Otherwise compute relative path from workspaces root
        guard let workingDir = workingDir else {
            // No working dir - return "~" if using sentinel values (terminal at home)
            return (!hasRealWorkspace && !hasRealProject) ? "~" : nil
        }
        guard let root = workspacesRoot, !root.isEmpty else {
            // No root known - fallback to absolute path
            return workingDir
        }

        // Remove root prefix to get relative path
        if workingDir.hasPrefix(root) {
            var relative = String(workingDir.dropFirst(root.count))
            // Remove leading slash if present
            if relative.hasPrefix("/") {
                relative = String(relative.dropFirst())
            }
            // Return "~" for empty relative path (at root)
            return relative.isEmpty ? "~" : relative
        }

        // Path doesn't start with root - return as-is
        return workingDir
    }

    /// Returns the display name for the session
    /// For agent sessions with aliases, shows: "Claude Code (zai)"
    /// For regular sessions, shows the type's display name
    var displayName: String {
        if let alias = agentName {
            return "\(type.displayName) (\(alias))"
        }
        return type.displayName
    }

    init(
        id: String = UUID().uuidString,
        type: SessionType,
        agentName: String? = nil,
        workspace: String? = nil,
        project: String? = nil,
        worktree: String? = nil,
        workingDir: String? = nil,
        status: SessionStatus = .active,
        createdAt: Date = Date(),
        terminalConfig: TerminalConfig? = nil
    ) {
        self.id = id
        self.type = type
        self.agentName = agentName
        self.workspace = workspace
        self.project = project
        self.worktree = worktree
        self.workingDir = workingDir
        self.status = status
        self.createdAt = createdAt
        self.terminalConfig = terminalConfig
    }
}

// MARK: - Mock Data for Previews

extension Session {
    static let mockSupervisor = Session(
        id: "supervisor",
        type: .supervisor
    )
    
    static let mockClaudeSession = Session(
        id: "claude-1",
        type: .claude,
        workspace: "tiflis",
        project: "tiflis-code"
    )
    
    static let mockCursorSession = Session(
        id: "cursor-1",
        type: .cursor,
        workspace: "tiflis",
        project: "tiflis-code",
        worktree: "feature-auth"
    )
    
    static let mockTerminalSession = Session(
        id: "terminal-1",
        type: .terminal,
        workingDir: "tiflis/tiflis-code"
    )
    
    static let mockSessions: [Session] = [
        .mockSupervisor,
        .mockClaudeSession,
        .mockCursorSession,
        .mockTerminalSession
    ]
}
