/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.terminal

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.tiflis.code.data.websocket.ConnectionService
import io.tiflis.code.data.websocket.WebSocketMessage
import io.tiflis.code.ui.state.AppState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import javax.inject.Inject

/**
 * ViewModel for terminal session management.
 * Handles terminal lifecycle, input/output, and resize.
 * Mirrors the iOS TerminalViewModel.
 */
@HiltViewModel
class TerminalViewModel @Inject constructor(
    private val connectionService: ConnectionService
) : ViewModel() {

    companion object {
        private const val TAG = "TerminalViewModel"
    }

    private val _state = MutableStateFlow<TerminalState>(TerminalState.Disconnected)
    val state: StateFlow<TerminalState> = _state.asStateFlow()

    private val _terminalOutput = MutableSharedFlow<String>(
        replay = 100,
        extraBufferCapacity = 1000
    )
    val terminalOutput: SharedFlow<String> = _terminalOutput.asSharedFlow()

    private var currentSessionId: String? = null
    private var lastReceivedSequence: Long = 0
    private var isMaster: Boolean = false
    private var messageCollectorJob: Job? = null

    // Buffer for messages received during replay
    private val replayBuffer = mutableListOf<Pair<Long, String>>()
    private var isReplaying = false

    /**
     * Subscribe to a terminal session.
     * Follows iOS pattern: immediately request replay after subscribe (don't wait for session.subscribed)
     */
    fun subscribe(sessionId: String, appState: AppState) {
        if (currentSessionId == sessionId && _state.value is TerminalState.Live) {
            Log.d(TAG, "Already subscribed to session: $sessionId")
            return
        }

        Log.d(TAG, "Subscribing to terminal session: $sessionId")
        currentSessionId = sessionId
        lastReceivedSequence = 0
        replayBuffer.clear()
        isReplaying = true  // Enter replay mode until we load history (like iOS)
        _state.value = TerminalState.Subscribing

        // Start listening for terminal messages
        startMessageCollection()

        // Send subscribe request
        // session_id must be at top level, not in payload (per protocol)
        val message = mapOf(
            "type" to "session.subscribe",
            "session_id" to sessionId
        )
        connectionService.sendMessage(message)

        // Immediately request replay (like iOS - don't wait for session.subscribed)
        // This ensures we load terminal history right away
        _state.value = TerminalState.Replaying
        requestReplayFromBeginning(appState)
    }

    /**
     * Request replay of all terminal history from the beginning.
     */
    private fun requestReplayFromBeginning(appState: AppState) {
        val sessionId = currentSessionId ?: return
        Log.d(TAG, "Requesting terminal replay from beginning for session: $sessionId")

        val message = mapOf(
            "type" to "session.replay",
            "session_id" to sessionId,
            "payload" to mapOf(
                "since_timestamp" to 0,
                "limit" to 100
            )
        )
        connectionService.sendMessage(message)
    }

    /**
     * Unsubscribe from current terminal session.
     */
    fun unsubscribe(appState: AppState) {
        val sessionId = currentSessionId ?: return
        Log.d(TAG, "Unsubscribing from terminal session: $sessionId")

        messageCollectorJob?.cancel()
        // session_id must be at top level, not in payload (per protocol)
        val message = mapOf(
            "type" to "session.unsubscribe",
            "session_id" to sessionId
        )
        connectionService.sendMessage(message)

        currentSessionId = null
        _state.value = TerminalState.Disconnected
    }

    /**
     * Send input to the terminal.
     */
    fun sendInput(data: String, appState: AppState) {
        val sessionId = currentSessionId ?: return
        appState.sendTerminalInput(sessionId, data)
    }

    /**
     * Request terminal resize.
     */
    fun resize(cols: Int, rows: Int, appState: AppState) {
        val sessionId = currentSessionId ?: return
        if (!isMaster) {
            Log.d(TAG, "Not master, skipping resize request")
            return
        }
        appState.resizeTerminal(sessionId, cols, rows)
    }

    /**
     * Request replay of terminal history.
     */
    fun requestReplay(appState: AppState, sinceSequence: Long? = null, limit: Int? = null) {
        val sessionId = currentSessionId ?: return
        isReplaying = true
        _state.value = TerminalState.Replaying
        appState.requestTerminalReplay(sessionId, sinceSequence, limit)
    }

    private fun startMessageCollection() {
        messageCollectorJob?.cancel()
        messageCollectorJob = viewModelScope.launch {
            connectionService.messageStream.collect { message ->
                handleMessage(message)
            }
        }
    }

    private suspend fun handleMessage(message: WebSocketMessage) {
        when (message) {
            is WebSocketMessage.SessionSubscribed -> {
                if (message.sessionId == currentSessionId) {
                    handleSubscribed(message.payload)
                }
            }
            is WebSocketMessage.SessionOutput -> {
                if (message.sessionId == currentSessionId) {
                    handleOutput(message.payload)
                }
            }
            is WebSocketMessage.SessionReplayData -> {
                if (message.sessionId == currentSessionId) {
                    handleReplayData(message.payload)
                }
            }
            is WebSocketMessage.SessionTerminated -> {
                if (message.sessionId == currentSessionId) {
                    handleTerminated()
                }
            }
            is WebSocketMessage.SessionResized -> {
                if (message.sessionId == currentSessionId) {
                    handleResized(message.payload)
                }
            }
            else -> { /* Ignore other messages */ }
        }
    }

    private fun handleSubscribed(payload: JsonObject?) {
        Log.d(TAG, "Session subscribed")
        isMaster = payload?.get("is_master")?.jsonPrimitive?.booleanOrNull ?: false

        // Extract terminal size from server (for non-master clients)
        val cols = payload?.get("cols")?.jsonPrimitive?.intOrNull
        val rows = payload?.get("rows")?.jsonPrimitive?.intOrNull
        if (cols != null && rows != null) {
            Log.d(TAG, "Server terminal size: ${cols}x${rows}, isMaster: $isMaster")
        }

        // Note: We don't request replay here anymore - it's already requested in subscribe()
        // This follows the iOS pattern where replay is requested immediately after subscribe
        // The session.subscribed message just confirms subscription and provides master status
    }

    private suspend fun handleOutput(payload: JsonObject?) {
        payload ?: return
        val contentType = payload["content_type"]?.jsonPrimitive?.contentOrNull
        if (contentType != "terminal") return

        val content = payload["content"]?.jsonPrimitive?.contentOrNull ?: return
        val sequence = payload["sequence"]?.jsonPrimitive?.longOrNull ?: return

        if (isReplaying) {
            // Buffer messages during replay
            replayBuffer.add(sequence to content)
            return
        }

        // Check for duplicates
        if (sequence <= lastReceivedSequence) {
            Log.d(TAG, "Skipping duplicate sequence: $sequence")
            return
        }

        // Check for gaps
        if (sequence > lastReceivedSequence + 1) {
            Log.w(TAG, "Gap detected: expected ${lastReceivedSequence + 1}, got $sequence")
            // Could request replay here to fill the gap
        }

        lastReceivedSequence = sequence
        _terminalOutput.emit(content)
    }

    private suspend fun handleReplayData(payload: JsonObject?) {
        payload ?: return

        val messages = payload["messages"]?.jsonArray ?: return
        val hasMore = payload["has_more"]?.jsonPrimitive?.booleanOrNull ?: false

        // Process replay messages
        messages.forEach { element ->
            val obj = element.jsonObject
            val content = obj["content"]?.jsonPrimitive?.contentOrNull ?: return@forEach
            val sequence = obj["sequence"]?.jsonPrimitive?.longOrNull ?: return@forEach

            if (sequence > lastReceivedSequence) {
                lastReceivedSequence = sequence
                _terminalOutput.emit(content)
            }
        }

        if (!hasMore) {
            // Replay complete, process buffered messages
            isReplaying = false
            _state.value = TerminalState.Live

            replayBuffer.sortedBy { it.first }.forEach { (sequence, content) ->
                if (sequence > lastReceivedSequence) {
                    lastReceivedSequence = sequence
                    _terminalOutput.emit(content)
                }
            }
            replayBuffer.clear()

            Log.d(TAG, "Replay complete, now live. Last sequence: $lastReceivedSequence")
        }
    }

    private fun handleTerminated() {
        Log.d(TAG, "Terminal session terminated")
        _state.value = TerminalState.SessionLost("Session was terminated")
        currentSessionId = null
    }

    private fun handleResized(payload: JsonObject?) {
        payload ?: return
        val success = payload["success"]?.jsonPrimitive?.booleanOrNull ?: false
        val cols = payload["cols"]?.jsonPrimitive?.intOrNull
        val rows = payload["rows"]?.jsonPrimitive?.intOrNull
        val reason = payload["reason"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "Resize result: success=$success, cols=$cols, rows=$rows, reason=$reason")

        if (!success && reason == "not_master") {
            isMaster = false
        }
    }

    override fun onCleared() {
        super.onCleared()
        messageCollectorJob?.cancel()
    }
}
