//
//  CommandBuilder.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Factory for creating command configurations with appropriate retry and queue settings.
///
/// All commands retry on failure - no user action is silently dropped.
/// The only exception is terminal resize which uses 1 retry since only the latest size matters.
enum CommandBuilder {
    // MARK: - Supervisor Commands

    /// Create a supervisor text command
    /// - Parameters:
    ///   - command: The text command to send
    ///   - messageId: Optional message ID for tracking (defaults to new UUID)
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func supervisorCommand(_ command: String, messageId: String = UUID().uuidString) -> CommandConfig {
        let message: [String: Any] = [
            "type": "supervisor.command",
            "id": messageId,
            "payload": [
                "command": command
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.command"
        )
    }

    /// Create a supervisor voice command
    /// - Parameters:
    ///   - audioBase64: Base64-encoded audio data
    ///   - format: Audio format (e.g., "m4a")
    ///   - messageId: Message ID for tracking transcription
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func supervisorVoiceCommand(
        audioBase64: String,
        format: String,
        messageId: String
    ) -> CommandConfig {
        let message: [String: Any] = [
            "type": "supervisor.command",
            "id": UUID().uuidString,
            "payload": [
                "audio": audioBase64,
                "audio_format": format,
                "message_id": messageId
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.command.voice"
        )
    }

    /// Cancel supervisor execution
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func supervisorCancel() -> CommandConfig {
        let message: [String: Any] = [
            "type": "supervisor.cancel",
            "id": UUID().uuidString
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.cancel"
        )
    }

    /// Clear supervisor context
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func supervisorClearContext() -> CommandConfig {
        let message: [String: Any] = [
            "type": "supervisor.clear_context",
            "id": UUID().uuidString
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.clear_context"
        )
    }

    /// Create a new session
    /// - Parameters:
    ///   - sessionType: Type of session (cursor, claude, opencode, terminal)
    ///   - agentName: Optional agent alias name
    ///   - workspace: Workspace name
    ///   - project: Project name
    ///   - requestId: Request ID for tracking the response
    /// - Returns: Command configuration with 3 retries and queue enabled (critical)
    static func createSession(
        sessionType: String,
        agentName: String?,
        workspace: String,
        project: String,
        requestId: String
    ) -> CommandConfig {
        var payload: [String: Any] = [
            "session_type": sessionType,
            "workspace": workspace,
            "project": project
        ]
        if let name = agentName {
            payload["agent_name"] = name
        }

        let message: [String: Any] = [
            "type": "supervisor.create_session",
            "id": requestId,
            "payload": payload
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.create_session"
        )
    }

    /// Terminate a session
    /// - Parameter sessionId: ID of the session to terminate
    /// - Returns: Command configuration with 3 retries and queue enabled (critical)
    static func terminateSession(sessionId: String) -> CommandConfig {
        let message: [String: Any] = [
            "type": "supervisor.terminate_session",
            "id": UUID().uuidString,
            "payload": [
                "session_id": sessionId
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "supervisor.terminate_session"
        )
    }

    // MARK: - Session Commands

    /// Subscribe to a session (agent or terminal)
    /// - Parameter sessionId: ID of the session to subscribe to
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func sessionSubscribe(sessionId: String) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.subscribe",
            "session_id": sessionId
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.subscribe"
        )
    }

    /// Unsubscribe from a session
    /// - Parameter sessionId: ID of the session to unsubscribe from
    /// - Returns: Command configuration with 1 retry and no queue (non-critical)
    static func sessionUnsubscribe(sessionId: String) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.unsubscribe",
            "session_id": sessionId
        ]
        return CommandConfig(
            message: message,
            maxRetries: 1,
            shouldQueue: false,
            debugName: "session.unsubscribe"
        )
    }

    /// Execute a command in an agent session (text)
    /// - Parameters:
    ///   - sessionId: ID of the session
    ///   - content: Text content to execute
    ///   - messageId: Optional message ID for tracking (defaults to new UUID)
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func sessionExecute(sessionId: String, content: String, messageId: String = UUID().uuidString) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.execute",
            "id": messageId,
            "session_id": sessionId,
            "payload": [
                "content": content
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.execute"
        )
    }

    /// Execute a voice command in an agent session
    /// - Parameters:
    ///   - sessionId: ID of the session
    ///   - audioBase64: Base64-encoded audio data
    ///   - format: Audio format (e.g., "m4a")
    ///   - messageId: Message ID for tracking transcription
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func sessionVoiceExecute(
        sessionId: String,
        audioBase64: String,
        format: String,
        messageId: String
    ) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.execute",
            "id": UUID().uuidString,
            "session_id": sessionId,
            "payload": [
                "audio": audioBase64,
                "audio_format": format,
                "message_id": messageId
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.execute.voice"
        )
    }

    /// Cancel an agent session execution
    /// - Parameter sessionId: ID of the session
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func sessionCancel(sessionId: String) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.cancel",
            "id": UUID().uuidString,
            "session_id": sessionId
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.cancel"
        )
    }

    // MARK: - Terminal Commands

    /// Send input to a terminal session
    /// - Parameters:
    ///   - sessionId: ID of the terminal session
    ///   - data: Input data (text or raw bytes as string)
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func terminalInput(sessionId: String, data: String) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.input",
            "session_id": sessionId,
            "payload": [
                "data": data
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.input"
        )
    }

    /// Resize a terminal session
    /// - Parameters:
    ///   - sessionId: ID of the terminal session
    ///   - cols: Number of columns
    ///   - rows: Number of rows
    /// - Returns: Command configuration with 1 retry and no queue (only latest matters)
    static func terminalResize(sessionId: String, cols: Int, rows: Int) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.resize",
            "session_id": sessionId,
            "payload": [
                "cols": cols,
                "rows": rows
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 1,
            shouldQueue: false,
            debugName: "session.resize"
        )
    }

    /// Request replay of terminal history
    /// - Parameters:
    ///   - sessionId: ID of the terminal session
    ///   - sinceSequence: Sequence number to replay from (0 for all)
    ///   - limit: Maximum number of messages to retrieve
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func terminalReplay(
        sessionId: String,
        sinceSequence: Int,
        limit: Int
    ) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.replay",
            "session_id": sessionId,
            "payload": [
                "since_sequence": sinceSequence,
                "limit": limit
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.replay"
        )
    }

    /// Request replay of terminal history by timestamp
    /// - Parameters:
    ///   - sessionId: ID of the terminal session
    ///   - sinceTimestamp: Timestamp to replay from (0 for all)
    ///   - limit: Maximum number of messages to retrieve
    /// - Returns: Command configuration with 3 retries and queue enabled
    static func terminalReplayByTimestamp(
        sessionId: String,
        sinceTimestamp: Int,
        limit: Int
    ) -> CommandConfig {
        let message: [String: Any] = [
            "type": "session.replay",
            "session_id": sessionId,
            "payload": [
                "since_timestamp": sinceTimestamp,
                "limit": limit
            ]
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "session.replay"
        )
    }

    // MARK: - System Commands

    static func historyRequest(
        sessionId: String?,
        beforeSequence: Int? = nil,
        limit: Int = 20
    ) -> CommandConfig {
        var payload: [String: Any] = [:]
        if let sessionId = sessionId {
            payload["session_id"] = sessionId
        }
        if let beforeSequence = beforeSequence {
            payload["before_sequence"] = beforeSequence
        }
        payload["limit"] = limit

        let message: [String: Any] = [
            "type": "history.request",
            "id": UUID().uuidString,
            "payload": payload
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "history.request"
        )
    }

    static func sync() -> CommandConfig {
        let message: [String: Any] = [
            "type": "sync",
            "id": UUID().uuidString
        ]
        return CommandConfig(
            message: message,
            maxRetries: 3,
            shouldQueue: true,
            debugName: "sync"
        )
    }
}
