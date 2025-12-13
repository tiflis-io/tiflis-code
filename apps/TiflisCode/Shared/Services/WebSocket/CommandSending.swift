//
//  CommandSending.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Configuration for a command to be sent
struct CommandConfig {
    /// The message payload to send
    let message: [String: Any]

    /// Maximum number of retry attempts (0 = no retry)
    let maxRetries: Int

    /// Whether to queue the command if not authenticated
    let shouldQueue: Bool

    /// Optional identifier for logging/debugging
    let debugName: String?

    init(
        message: [String: Any],
        maxRetries: Int = 3,
        shouldQueue: Bool = true,
        debugName: String? = nil
    ) {
        self.message = message
        self.maxRetries = maxRetries
        self.shouldQueue = shouldQueue
        self.debugName = debugName ?? (message["type"] as? String)
    }
}

/// Protocol for safe command sending with retry and queue support
@MainActor
protocol CommandSending: AnyObject {
    /// Sends a command with atomic auth checking, retry logic, and optional queuing
    /// - Parameter config: Command configuration
    /// - Returns: Result indicating success, failure, or queued status
    func send(_ config: CommandConfig) async -> CommandSendResult

    /// Sends a command and throws on failure
    /// - Parameter config: Command configuration
    /// - Throws: CommandSendError if the command fails
    func sendThrowing(_ config: CommandConfig) async throws

    /// Cancels any pending queued commands for a specific session
    /// - Parameter sessionId: The session ID to cancel commands for
    func cancelPendingCommands(for sessionId: String)

    /// Cancels all pending queued commands
    func cancelAllPendingCommands()

    /// Number of commands currently in the queue
    var pendingCommandCount: Int { get }
}
