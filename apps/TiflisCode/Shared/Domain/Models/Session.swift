//
//  Session.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// Terminal configuration received from workstation
struct TerminalConfig: Codable, Equatable {
    let bufferSize: Int

    enum CodingKeys: String, CodingKey {
        case bufferSize = "buffer_size"
    }
}

/// Represents a session (Supervisor, Agent, or Terminal)
struct Session: Identifiable, Equatable {
    let id: String
    let type: SessionType
    let workspace: String?
    let project: String?
    let worktree: String?
    let workingDir: String?
    let status: SessionStatus
    let createdAt: Date
    let terminalConfig: TerminalConfig?
    
    enum SessionType: String, Codable, Equatable {
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
    
    enum SessionStatus: String, Codable, Equatable {
        case active
        case terminated
    }
    
    /// Returns the display subtitle for the session, showing relative path from workspaces root
    /// - Parameter workspacesRoot: The workspaces root directory path from workstation
    /// - Returns: A relative path string or nil if no path information is available
    func subtitle(relativeTo workspacesRoot: String?) -> String? {
        // If we have workspace/project, show that format (relative by nature)
        if let workspace = workspace, let project = project {
            if let worktree = worktree {
                return "\(workspace)/\(project)--\(worktree)"
            }
            return "\(workspace)/\(project)"
        }

        // Otherwise compute relative path from workspaces root
        guard let workingDir = workingDir else { return nil }
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
    
    init(
        id: String = UUID().uuidString,
        type: SessionType,
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
