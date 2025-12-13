//
//  CommandSendError.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Errors that can occur when sending commands via CommandSender
enum CommandSendError: LocalizedError {
    /// Not authenticated when attempting to send
    case notAuthenticated

    /// Connection was lost and command could not be queued
    case connectionLost

    /// WebSocket send operation failed
    case sendFailed(underlying: Error)

    /// Maximum retry attempts exceeded
    case maxRetriesExceeded

    /// Command was cancelled (e.g., session terminated)
    case commandCancelled

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated. Please wait for connection to be established."
        case .connectionLost:
            return "Connection lost. Command could not be sent."
        case .sendFailed(let error):
            return "Failed to send command: \(error.localizedDescription)"
        case .maxRetriesExceeded:
            return "Command failed after maximum retry attempts."
        case .commandCancelled:
            return "Command was cancelled."
        }
    }
}

/// Result of a command send attempt
enum CommandSendResult: Equatable {
    case success
    case failure(CommandSendError)
    case queued

    static func == (lhs: CommandSendResult, rhs: CommandSendResult) -> Bool {
        switch (lhs, rhs) {
        case (.success, .success), (.queued, .queued):
            return true
        case (.failure(let lhsError), .failure(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
        default:
            return false
        }
    }
}
