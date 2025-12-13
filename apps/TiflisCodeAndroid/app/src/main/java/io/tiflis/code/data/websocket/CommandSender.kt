/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.websocket

import android.util.Log
import io.tiflis.code.domain.models.ConnectionState
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min
import kotlin.math.pow

/**
 * Centralized service for safe command sending with atomic auth checking,
 * retry logic, and command queuing during disconnections.
 *
 * Key guarantees:
 * - Auth state is checked immediately before send (no race condition)
 * - Failed commands are retried with exponential backoff
 * - Commands are queued during brief disconnections
 * - No user command is silently dropped
 */
@Singleton
class CommandSender @Inject constructor(
    private val webSocketClient: WebSocketClient
) {
    companion object {
        private const val TAG = "CommandSender"

        /** Maximum queue size to prevent memory issues */
        private const val MAX_QUEUE_SIZE = 50

        /** Maximum time a command can stay queued (60 seconds) */
        private const val MAX_QUEUE_TIME_MS = 60_000L

        /** Base delay for exponential backoff (0.5 seconds) */
        private const val BASE_RETRY_DELAY_MS = 500L

        /** Maximum retry delay cap (4 seconds) */
        private const val MAX_RETRY_DELAY_MS = 4_000L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** Queue for commands waiting to be sent during disconnection */
    private val commandQueue = mutableListOf<QueuedCommand>()

    /** Lock for thread-safe queue access */
    private val queueLock = Any()

    init {
        // Observe connection state for queue processing
        scope.launch {
            webSocketClient.connectionState.collect { state ->
                // Process queue when connection is established (Connected, Verified, or Degraded)
                if (state.isConnected) {
                    processQueue()
                }
            }
        }
    }

    /** Number of commands currently in the queue */
    val pendingCommandCount: Int
        get() = synchronized(queueLock) { commandQueue.size }

    /**
     * Sends a command with atomic auth checking, retry logic, and optional queuing.
     *
     * @param config Command configuration
     * @return Result indicating success, failure, or queued status
     */
    suspend fun send(config: CommandConfig): CommandSendResult {
        val commandName = config.debugName ?: config.type

        // 1. Check connection state ATOMICALLY before send
        val currentState = webSocketClient.connectionState.value

        if (!currentState.isConnected) {
            // Not connected - queue if allowed
            Log.d(TAG, "Not connected for $commandName, state: $currentState")
            if (config.shouldQueue) {
                return queueCommand(config)
            }
            return CommandSendResult.Failure(CommandSendError.NotAuthenticated)
        }

        // 2. Attempt to send with retry logic
        return attemptSend(config, attempt = 0)
    }

    /**
     * Cancels any pending queued commands for a specific session.
     *
     * @param sessionId The session ID to cancel commands for
     */
    fun cancelPendingCommands(sessionId: String) {
        synchronized(queueLock) {
            val beforeCount = commandQueue.size
            commandQueue.removeAll { command ->
                val msgSessionId = extractSessionId(command.config.message)
                msgSessionId == sessionId
            }
            val removedCount = beforeCount - commandQueue.size
            if (removedCount > 0) {
                Log.d(TAG, "Cancelled $removedCount pending commands for session $sessionId")
            }
        }
    }

    /**
     * Cancels all pending queued commands.
     */
    fun cancelAllPendingCommands() {
        synchronized(queueLock) {
            val count = commandQueue.size
            commandQueue.clear()
            if (count > 0) {
                Log.d(TAG, "Cancelled all $count pending commands")
            }
        }
    }

    private suspend fun attemptSend(config: CommandConfig, attempt: Int): CommandSendResult {
        val commandName = config.debugName ?: config.type

        // CRITICAL: Re-check auth state immediately before send
        // This closes the race condition window
        val currentState = webSocketClient.connectionState.value
        if (!currentState.isConnected) {
            Log.w(TAG, "Auth state changed before send for $commandName")
            if (config.shouldQueue) {
                return queueCommand(config)
            }
            return CommandSendResult.Failure(CommandSendError.NotAuthenticated)
        }

        return try {
            val success = webSocketClient.sendMessage(config.message)
            if (success) {
                if (attempt > 0) {
                    Log.d(TAG, "$commandName sent successfully after $attempt retries")
                } else {
                    Log.d(TAG, "$commandName sent successfully")
                }
                CommandSendResult.Success
            } else {
                handleSendFailure(config, attempt, Exception("WebSocket send returned false"))
            }
        } catch (e: Exception) {
            handleSendFailure(config, attempt, e)
        }
    }

    private suspend fun handleSendFailure(
        config: CommandConfig,
        attempt: Int,
        error: Exception
    ): CommandSendResult {
        val commandName = config.debugName ?: config.type
        Log.w(TAG, "$commandName send failed (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}")

        // Check if we should retry
        if (attempt < config.maxRetries) {
            // Calculate backoff delay with exponential increase
            val delay = calculateBackoff(attempt)
            Log.d(TAG, "Retrying $commandName in ${delay}ms...")

            // Wait for backoff
            delay(delay)

            // Retry (recursive call will re-check auth)
            return attemptSend(config, attempt + 1)
        }

        // Max retries exceeded - queue if allowed, otherwise fail
        if (config.shouldQueue) {
            Log.d(TAG, "Max retries exceeded for $commandName, queuing")
            return queueCommand(config)
        }

        return CommandSendResult.Failure(CommandSendError.MaxRetriesExceeded)
    }

    private fun calculateBackoff(attempt: Int): Long {
        // Exponential backoff: 0.5s, 1s, 2s, 4s (capped)
        val delay = BASE_RETRY_DELAY_MS * 2.0.pow(attempt.toDouble())
        return min(delay.toLong(), MAX_RETRY_DELAY_MS)
    }

    private fun queueCommand(config: CommandConfig): CommandSendResult {
        val commandName = config.debugName ?: config.type

        synchronized(queueLock) {
            // Enforce queue size limit - remove oldest if full
            if (commandQueue.size >= MAX_QUEUE_SIZE) {
                val removed = commandQueue.removeAt(0)
                Log.w(TAG, "Queue full, dropped oldest command: ${removed.config.debugName ?: removed.config.type}")
            }

            val queuedCommand = QueuedCommand(
                config = config,
                queuedAt = System.currentTimeMillis()
            )
            commandQueue.add(queuedCommand)

            Log.d(TAG, "Queued $commandName (queue size: ${commandQueue.size})")
        }

        return CommandSendResult.Queued
    }

    private fun processQueue() {
        scope.launch {
            val commandsToProcess: List<QueuedCommand>

            synchronized(queueLock) {
                val now = System.currentTimeMillis()

                // Filter out expired commands
                val expiredCount = commandQueue.count { now - it.queuedAt > MAX_QUEUE_TIME_MS }
                if (expiredCount > 0) {
                    Log.d(TAG, "Removing $expiredCount expired commands from queue")
                }
                commandQueue.removeAll { command ->
                    now - command.queuedAt > MAX_QUEUE_TIME_MS
                }

                // Take all remaining commands
                commandsToProcess = commandQueue.toList()
                commandQueue.clear()
            }

            if (commandsToProcess.isEmpty()) return@launch

            Log.d(TAG, "Processing ${commandsToProcess.size} queued commands")

            for ((index, command) in commandsToProcess.withIndex()) {
                // Small delay between queued commands to avoid overwhelming the server
                if (index > 0) {
                    delay(100)
                }

                // Re-send (creates new CommandConfig without re-queuing on failure)
                val noQueueConfig = command.config.copy(shouldQueue = false)
                val result = attemptSend(noQueueConfig, attempt = 0)

                if (result is CommandSendResult.Failure) {
                    Log.w(TAG, "Queued command ${command.config.debugName ?: command.config.type} failed: ${result.error.message}")
                }
            }

            Log.d(TAG, "Finished processing queued commands")
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun extractSessionId(message: Map<String, Any?>): String? {
        // Try direct session_id
        val directId = message["session_id"] as? String
        if (directId != null) return directId

        // Try in payload
        val payload = message["payload"] as? Map<String, Any?>
        return payload?.get("session_id") as? String
    }
}

/**
 * A command waiting in the queue.
 */
private data class QueuedCommand(
    val config: CommandConfig,
    val queuedAt: Long
)
