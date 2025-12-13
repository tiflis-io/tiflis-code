//
//  CommandSender.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import Combine

/// Centralized service for safe command sending with atomic auth checking,
/// retry logic, and command queuing during disconnections.
///
/// Key guarantees:
/// - Auth state is checked immediately before send (no race condition)
/// - Failed commands are retried with exponential backoff
/// - Commands are queued during brief disconnections
/// - No user command is silently dropped
@MainActor
final class CommandSender: CommandSending {
    // MARK: - Dependencies

    private weak var connectionService: ConnectionServicing?
    private let webSocketClient: WebSocketClientProtocol

    // MARK: - Queue State

    /// Queue for commands waiting to be sent during disconnection
    private var commandQueue: [QueuedCommand] = []

    /// Maximum queue size to prevent memory issues
    private let maxQueueSize = 50

    /// Maximum time a command can stay queued (60 seconds)
    private let maxQueueTime: TimeInterval = 60.0

    // MARK: - Retry Configuration

    /// Base delay for exponential backoff (0.5 seconds)
    private let baseRetryDelay: TimeInterval = 0.5

    /// Maximum retry delay cap (4 seconds)
    private let maxRetryDelay: TimeInterval = 4.0

    // MARK: - Combine

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init(connectionService: ConnectionServicing, webSocketClient: WebSocketClientProtocol) {
        self.connectionService = connectionService
        self.webSocketClient = webSocketClient

        observeConnectionState()
    }

    // MARK: - Public API

    var pendingCommandCount: Int {
        commandQueue.count
    }

    func send(_ config: CommandConfig) async -> CommandSendResult {
        let commandName = config.debugName ?? "unknown"

        // 1. Check authentication state ATOMICALLY before send
        guard let service = connectionService else {
            print("⚠️ CommandSender: No connection service for \(commandName)")
            return .failure(.connectionLost)
        }

        let authState = service.connectionState

        switch authState {
        case .authenticated, .verified:
            // Good to send
            break

        case .degraded:
            // Connection is degraded but may still work - try to send
            print("⚠️ CommandSender: Connection degraded, attempting \(commandName) anyway")

        case .connecting, .connected, .authenticating:
            // Not yet authenticated - queue if allowed
            print("⏳ CommandSender: Not yet authenticated for \(commandName), state: \(authState)")
            if config.shouldQueue {
                return queueCommand(config)
            }
            return .failure(.notAuthenticated)

        case .disconnected, .error:
            // Disconnected - queue if allowed
            print("🔴 CommandSender: Disconnected for \(commandName), state: \(authState)")
            if config.shouldQueue {
                return queueCommand(config)
            }
            return .failure(.notAuthenticated)
        }

        // 2. Attempt to send with retry logic
        return await attemptSend(config, attempt: 0)
    }

    func sendThrowing(_ config: CommandConfig) async throws {
        let result = await send(config)
        switch result {
        case .success:
            return
        case .queued:
            // Queued is acceptable for throwing variant - command will be sent later
            return
        case .failure(let error):
            throw error
        }
    }

    func cancelPendingCommands(for sessionId: String) {
        let beforeCount = commandQueue.count
        commandQueue.removeAll { command in
            guard let msgSessionId = extractSessionId(from: command.config.message) else {
                return false
            }
            return msgSessionId == sessionId
        }
        let removedCount = beforeCount - commandQueue.count
        if removedCount > 0 {
            print("🗑️ CommandSender: Cancelled \(removedCount) pending commands for session \(sessionId)")
        }
    }

    func cancelAllPendingCommands() {
        let count = commandQueue.count
        commandQueue.removeAll()
        if count > 0 {
            print("🗑️ CommandSender: Cancelled all \(count) pending commands")
        }
    }

    // MARK: - Private Methods

    private func observeConnectionState() {
        connectionService?.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self = self else { return }

                switch state {
                case .authenticated, .verified:
                    // Connection restored - process queued commands
                    if !self.commandQueue.isEmpty {
                        print("✅ CommandSender: Connection restored, processing \(self.commandQueue.count) queued commands")
                        Task { @MainActor in
                            await self.processQueue()
                        }
                    }
                default:
                    break
                }
            }
            .store(in: &cancellables)
    }

    private func attemptSend(_ config: CommandConfig, attempt: Int) async -> CommandSendResult {
        let commandName = config.debugName ?? "unknown"

        // CRITICAL: Re-check auth state immediately before send
        // This closes the race condition window
        guard let service = connectionService else {
            return .failure(.connectionLost)
        }

        let currentState = service.connectionState
        guard currentState.isConnected else {
            print("⚠️ CommandSender: Auth state changed before send for \(commandName)")
            if config.shouldQueue {
                return queueCommand(config)
            }
            return .failure(.notAuthenticated)
        }

        do {
            try webSocketClient.sendMessage(config.message)
            if attempt > 0 {
                print("✅ CommandSender: \(commandName) sent successfully after \(attempt) retries")
            } else {
                print("📤 CommandSender: \(commandName) sent successfully")
            }
            return .success
        } catch {
            print("❌ CommandSender: \(commandName) send failed (attempt \(attempt + 1)/\(config.maxRetries + 1)): \(error)")

            // Check if we should retry
            if attempt < config.maxRetries {
                // Calculate backoff delay with exponential increase
                let delay = calculateBackoff(attempt: attempt)
                print("⏱️ CommandSender: Retrying \(commandName) in \(String(format: "%.1f", delay))s...")

                // Wait for backoff
                try? await Task.sleep(for: .seconds(delay))

                // Retry (recursive call will re-check auth)
                return await attemptSend(config, attempt: attempt + 1)
            }

            // Max retries exceeded - queue if allowed, otherwise fail
            if config.shouldQueue {
                print("📦 CommandSender: Max retries exceeded for \(commandName), queuing")
                return queueCommand(config)
            }

            return .failure(.maxRetriesExceeded)
        }
    }

    private func calculateBackoff(attempt: Int) -> TimeInterval {
        // Exponential backoff: 0.5s, 1s, 2s, 4s (capped)
        let delay = baseRetryDelay * pow(2.0, Double(attempt))
        return min(delay, maxRetryDelay)
    }

    private func queueCommand(_ config: CommandConfig) -> CommandSendResult {
        let commandName = config.debugName ?? "unknown"

        // Enforce queue size limit - remove oldest if full
        if commandQueue.count >= maxQueueSize {
            let removed = commandQueue.removeFirst()
            print("⚠️ CommandSender: Queue full, dropped oldest command: \(removed.config.debugName ?? "unknown")")
        }

        let queuedCommand = QueuedCommand(
            config: config,
            queuedAt: Date()
        )
        commandQueue.append(queuedCommand)

        print("📦 CommandSender: Queued \(commandName) (queue size: \(commandQueue.count))")
        return .queued
    }

    private func processQueue() async {
        let now = Date()

        // Filter out expired commands
        let expiredCount = commandQueue.filter { now.timeIntervalSince($0.queuedAt) > maxQueueTime }.count
        if expiredCount > 0 {
            print("⏰ CommandSender: Removing \(expiredCount) expired commands from queue")
        }
        commandQueue.removeAll { command in
            now.timeIntervalSince(command.queuedAt) > maxQueueTime
        }

        // Process remaining commands
        let commandsToProcess = commandQueue
        commandQueue.removeAll()

        print("🔄 CommandSender: Processing \(commandsToProcess.count) queued commands")

        for (index, command) in commandsToProcess.enumerated() {
            // Small delay between queued commands to avoid overwhelming the server
            if index > 0 {
                try? await Task.sleep(for: .milliseconds(100))
            }

            // Re-send (creates new CommandConfig without re-queuing on failure)
            let noQueueConfig = CommandConfig(
                message: command.config.message,
                maxRetries: command.config.maxRetries,
                shouldQueue: false, // Don't re-queue on failure during queue processing
                debugName: command.config.debugName
            )

            let result = await attemptSend(noQueueConfig, attempt: 0)
            if case .failure(let error) = result {
                print("❌ CommandSender: Queued command \(command.config.debugName ?? "unknown") failed: \(error)")
            }
        }

        print("✅ CommandSender: Finished processing queued commands")
    }

    private func extractSessionId(from message: [String: Any]) -> String? {
        // Try direct session_id
        if let sessionId = message["session_id"] as? String {
            return sessionId
        }
        // Try in payload
        if let payload = message["payload"] as? [String: Any],
           let sessionId = payload["session_id"] as? String {
            return sessionId
        }
        return nil
    }
}

// MARK: - Supporting Types

private struct QueuedCommand {
    let config: CommandConfig
    let queuedAt: Date
}
