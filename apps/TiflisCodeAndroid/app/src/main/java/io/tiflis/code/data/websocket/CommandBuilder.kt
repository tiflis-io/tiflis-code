/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.websocket

import java.util.UUID

/**
 * Factory for creating command configurations with appropriate retry and queue settings.
 *
 * All commands retry on failure - no user action is silently dropped.
 * The only exception is terminal resize which uses 1 retry since only the latest size matters.
 */
object CommandBuilder {

    // MARK: - Supervisor Commands

    /**
     * Create a supervisor text command.
     * @param command The text command to send
     * @param messageId Message ID for tracking
     * @return Command configuration with 3 retries and queue enabled
     */
    fun supervisorCommand(command: String, messageId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "supervisor.command")
            put("id", UUID.randomUUID().toString())
            put("payload", mapOf(
                "command" to command,
                "message_id" to messageId
            ))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.command"
        )
    }

    /**
     * Create a supervisor voice command.
     * @param audioBase64 Base64-encoded audio data
     * @param format Audio format (e.g., "m4a")
     * @param messageId Message ID for tracking transcription
     * @return Command configuration with 3 retries and queue enabled
     */
    fun supervisorVoiceCommand(
        audioBase64: String,
        format: String,
        messageId: String
    ): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "supervisor.command")
            put("id", UUID.randomUUID().toString())
            put("payload", mapOf(
                "audio" to audioBase64,
                "audio_format" to format,
                "message_id" to messageId
            ))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.command.voice"
        )
    }

    /**
     * Cancel supervisor execution.
     * @return Command configuration with 3 retries and queue enabled
     */
    fun supervisorCancel(): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "supervisor.cancel")
            put("id", UUID.randomUUID().toString())
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.cancel"
        )
    }

    /**
     * Clear supervisor context.
     * @return Command configuration with 3 retries and queue enabled
     */
    fun supervisorClearContext(): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "supervisor.clear_context")
            put("id", UUID.randomUUID().toString())
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.clear_context"
        )
    }

    /**
     * Create a new session.
     * @param sessionType Type of session (cursor, claude, opencode, terminal)
     * @param agentName Optional agent alias name
     * @param workspace Workspace name
     * @param project Project name
     * @param worktree Optional worktree name
     * @param requestId Request ID for tracking the response
     * @return Command configuration with 3 retries and queue enabled (critical)
     */
    fun createSession(
        sessionType: String,
        agentName: String?,
        workspace: String?,
        project: String?,
        worktree: String?,
        requestId: String
    ): CommandConfig {
        val payload = buildMap<String, Any?> {
            put("session_type", sessionType)
            if (agentName != null) put("agent_name", agentName)
            if (workspace != null) put("workspace", workspace)
            if (project != null) put("project", project)
            if (worktree != null) put("worktree", worktree)
        }

        val message = buildMap<String, Any?> {
            put("type", "supervisor.create_session")
            put("id", requestId)
            put("payload", payload)
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.create_session"
        )
    }

    /**
     * Terminate a session.
     * @param sessionId ID of the session to terminate
     * @return Command configuration with 3 retries and queue enabled (critical)
     */
    fun terminateSession(sessionId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "supervisor.terminate_session")
            put("id", UUID.randomUUID().toString())
            put("payload", mapOf("session_id" to sessionId))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "supervisor.terminate_session"
        )
    }

    // MARK: - Session Commands

    /**
     * Subscribe to a session (agent or terminal).
     * @param sessionId ID of the session to subscribe to
     * @return Command configuration with 3 retries and queue enabled
     */
    fun sessionSubscribe(sessionId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.subscribe")
            put("session_id", sessionId)
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.subscribe"
        )
    }

    /**
     * Unsubscribe from a session.
     * @param sessionId ID of the session to unsubscribe from
     * @return Command configuration with 1 retry and no queue (non-critical)
     */
    fun sessionUnsubscribe(sessionId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.unsubscribe")
            put("session_id", sessionId)
        }
        return CommandConfig(
            message = message,
            maxRetries = 1,
            shouldQueue = false,
            debugName = "session.unsubscribe"
        )
    }

    /**
     * Execute a command in an agent session (text).
     * @param sessionId ID of the session
     * @param text Text content to execute
     * @param messageId Message ID for tracking
     * @return Command configuration with 3 retries and queue enabled
     */
    fun sessionExecute(sessionId: String, text: String, messageId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.execute")
            put("id", UUID.randomUUID().toString())
            put("session_id", sessionId)
            put("payload", mapOf(
                "text" to text,
                "message_id" to messageId
            ))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.execute"
        )
    }

    /**
     * Execute a voice command in an agent session.
     * @param sessionId ID of the session
     * @param audioBase64 Base64-encoded audio data
     * @param format Audio format (e.g., "m4a")
     * @param messageId Message ID for tracking transcription
     * @return Command configuration with 3 retries and queue enabled
     */
    fun sessionVoiceExecute(
        sessionId: String,
        audioBase64: String,
        format: String,
        messageId: String
    ): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.execute")
            put("id", UUID.randomUUID().toString())
            put("session_id", sessionId)
            put("payload", mapOf(
                "audio" to audioBase64,
                "audio_format" to format,
                "message_id" to messageId
            ))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.execute.voice"
        )
    }

    /**
     * Cancel an agent session execution.
     * @param sessionId ID of the session
     * @return Command configuration with 3 retries and queue enabled
     */
    fun sessionCancel(sessionId: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.cancel")
            put("id", UUID.randomUUID().toString())
            put("session_id", sessionId)
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.cancel"
        )
    }

    // MARK: - Terminal Commands

    /**
     * Send input to a terminal session.
     * @param sessionId ID of the terminal session
     * @param data Input data (text or raw bytes as string)
     * @return Command configuration with 3 retries and queue enabled
     */
    fun terminalInput(sessionId: String, data: String): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.input")
            put("session_id", sessionId)
            put("payload", mapOf("data" to data))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.input"
        )
    }

    /**
     * Resize a terminal session.
     * @param sessionId ID of the terminal session
     * @param cols Number of columns
     * @param rows Number of rows
     * @return Command configuration with 1 retry and no queue (only latest matters)
     */
    fun terminalResize(sessionId: String, cols: Int, rows: Int): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "session.resize")
            put("session_id", sessionId)
            put("payload", mapOf("cols" to cols, "rows" to rows))
        }
        return CommandConfig(
            message = message,
            maxRetries = 1,
            shouldQueue = false,
            debugName = "session.resize"
        )
    }

    /**
     * Request replay of terminal history.
     * @param sessionId ID of the terminal session
     * @param sinceSequence Sequence number to replay from (null for all)
     * @param limit Maximum number of messages to retrieve
     * @return Command configuration with 3 retries and queue enabled
     */
    fun terminalReplay(
        sessionId: String,
        sinceSequence: Long?,
        limit: Int?
    ): CommandConfig {
        val payload = buildMap<String, Any?> {
            if (sinceSequence != null) put("since_sequence", sinceSequence)
            if (limit != null) put("limit", limit)
        }
        val message = buildMap<String, Any?> {
            put("type", "session.replay")
            put("session_id", sessionId)
            if (payload.isNotEmpty()) put("payload", payload)
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "session.replay"
        )
    }

    // MARK: - System Commands

    /**
     * Request state synchronization.
     * @return Command configuration with 3 retries and queue enabled
     */
    fun sync(): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "sync")
            put("id", UUID.randomUUID().toString())
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "sync"
        )
    }

    /**
     * Request audio data for a message.
     * @param messageId The message ID to request audio for
     * @param type Type of audio ("output" or "input")
     * @return Command configuration with 3 retries and queue enabled
     */
    fun audioRequest(messageId: String, type: String = "output"): CommandConfig {
        val message = buildMap<String, Any?> {
            put("type", "audio.request")
            put("id", UUID.randomUUID().toString())
            put("payload", mapOf(
                "message_id" to messageId,
                "type" to type
            ))
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "audio.request"
        )
    }

    /**
     * Request chat history for supervisor or agent session.
     * Protocol v1.13: sync.state no longer includes history - clients must request it explicitly.
     *
     * @param sessionId Target session ID (null for supervisor)
     * @param beforeSequence Load messages BEFORE this sequence (for scroll-up pagination)
     * @param limit Maximum number of messages to return (default: 20, max: 50)
     * @return Command configuration with 3 retries and queue enabled
     */
    fun historyRequest(
        sessionId: String? = null,
        beforeSequence: Long? = null,
        limit: Int? = 20
    ): CommandConfig {
        val payload = buildMap<String, Any?> {
            if (sessionId != null) put("session_id", sessionId)
            if (beforeSequence != null) put("before_sequence", beforeSequence)
            if (limit != null) put("limit", limit)
        }
        val message = buildMap<String, Any?> {
            put("type", "history.request")
            put("id", UUID.randomUUID().toString())
            if (payload.isNotEmpty()) put("payload", payload)
        }
        return CommandConfig(
            message = message,
            maxRetries = 3,
            shouldQueue = true,
            debugName = "history.request"
        )
    }
}
