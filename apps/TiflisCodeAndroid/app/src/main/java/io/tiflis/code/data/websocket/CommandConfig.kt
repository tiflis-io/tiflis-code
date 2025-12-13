/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.websocket

/**
 * Configuration for a command to be sent via WebSocket.
 *
 * @property message The message payload to send
 * @property maxRetries Maximum number of retry attempts (0 = no retry)
 * @property shouldQueue Whether to queue the command if not authenticated
 * @property debugName Optional identifier for logging/debugging
 */
data class CommandConfig(
    val message: Map<String, Any?>,
    val maxRetries: Int = 3,
    val shouldQueue: Boolean = true,
    val debugName: String? = null
) {
    /** Convenience accessor for the message type */
    val type: String get() = message["type"] as? String ?: "unknown"
}

/**
 * Result of a command send attempt.
 */
sealed class CommandSendResult {
    /** Command was sent successfully */
    data object Success : CommandSendResult()

    /** Command was queued for later delivery */
    data object Queued : CommandSendResult()

    /** Command failed to send */
    data class Failure(val error: CommandSendError) : CommandSendResult()
}

/**
 * Errors that can occur when sending commands.
 */
sealed class CommandSendError : Exception() {
    /** Not authenticated when attempting to send */
    data object NotAuthenticated : CommandSendError() {
        private fun readResolve(): Any = NotAuthenticated
        override val message: String get() = "Not authenticated. Please wait for connection to be established."
    }

    /** Connection was lost and command could not be queued */
    data object ConnectionLost : CommandSendError() {
        private fun readResolve(): Any = ConnectionLost
        override val message: String get() = "Connection lost. Command could not be sent."
    }

    /** WebSocket send operation failed */
    data class SendFailed(val underlying: Throwable) : CommandSendError() {
        override val message: String get() = "Failed to send command: ${underlying.message}"
    }

    /** Maximum retry attempts exceeded */
    data object MaxRetriesExceeded : CommandSendError() {
        private fun readResolve(): Any = MaxRetriesExceeded
        override val message: String get() = "Command failed after maximum retry attempts."
    }

    /** Command was cancelled (e.g., session terminated) */
    data object CommandCancelled : CommandSendError() {
        private fun readResolve(): Any = CommandCancelled
        override val message: String get() = "Command was cancelled."
    }
}
