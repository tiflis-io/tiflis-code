//
//  ConfigModels.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Available agent configuration from workstation
struct AgentConfig: Identifiable, Hashable {
    let name: String
    let baseType: String
    let description: String
    let isAlias: Bool

    var id: String { name }

    /// Maps base_type to Session.SessionType
    var sessionType: Session.SessionType {
        switch baseType {
        case "cursor": return .cursor
        case "claude": return .claude
        case "opencode": return .opencode
        default: return .claude
        }
    }
}

/// Project info within a workspace
struct ProjectConfig: Identifiable, Hashable {
    let name: String
    let isGitRepo: Bool
    let defaultBranch: String?

    var id: String { name }
}

/// Workspace configuration from workstation
struct WorkspaceConfig: Identifiable, Hashable {
    let name: String
    let projects: [ProjectConfig]

    var id: String { name }
}
