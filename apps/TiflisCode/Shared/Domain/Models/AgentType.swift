//
//  AgentType.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import SwiftUI

/// Supported AI agent types for headless sessions
enum AgentType: String, Codable, CaseIterable, Identifiable {
    case cursor
    case claude
    case opencode
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .cursor:
            return "Cursor"
        case .claude:
            return "Claude Code"
        case .opencode:
            return "OpenCode"
        }
    }
    
    var icon: String {
        switch self {
        case .cursor:
            return "cursorarrow.rays"
        case .claude:
            return "brain.head.profile"
        case .opencode:
            return "chevron.left.forwardslash.chevron.right"
        }
    }
    
    var accentColor: Color {
        switch self {
        case .cursor:
            return .blue
        case .claude:
            return .orange
        case .opencode:
            return .green
        }
    }
}

