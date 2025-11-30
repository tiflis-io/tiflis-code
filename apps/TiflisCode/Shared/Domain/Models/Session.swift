//
//  Session.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

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
    
    /// Returns the display subtitle for the session (workspace/project--worktree)
    var subtitle: String? {
        guard let workspace = workspace, let project = project else {
            return workingDir
        }
        
        if let worktree = worktree {
            return "\(workspace)/\(project)--\(worktree)"
        }
        return "\(workspace)/\(project)"
    }
    
    init(
        id: String = UUID().uuidString,
        type: SessionType,
        workspace: String? = nil,
        project: String? = nil,
        worktree: String? = nil,
        workingDir: String? = nil,
        status: SessionStatus = .active,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.type = type
        self.workspace = workspace
        self.project = project
        self.worktree = worktree
        self.workingDir = workingDir
        self.status = status
        self.createdAt = createdAt
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
