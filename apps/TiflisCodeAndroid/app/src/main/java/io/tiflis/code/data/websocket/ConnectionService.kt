/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.websocket

import android.util.Log
import io.tiflis.code.data.storage.DeviceIdManager
import io.tiflis.code.data.storage.SecureStorage
import io.tiflis.code.domain.models.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import javax.inject.Inject
import javax.inject.Singleton

/**
 * High-level connection service that manages WebSocket lifecycle,
 * handles message routing, and maintains connection state.
 *
 * Mirrors the iOS ConnectionService.
 */
@Singleton
class ConnectionService @Inject constructor(
    private val webSocketClient: WebSocketClient,
    private val secureStorage: SecureStorage,
    private val deviceIdManager: DeviceIdManager,
    val commandSender: CommandSender
) {
    companion object {
        private const val TAG = "ConnectionService"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var messageCollectorJob: Job? = null

    // Connection state (exposed from WebSocketClient)
    val connectionState: StateFlow<ConnectionState> = webSocketClient.connectionState

    // Workstation online status
    private val _workstationOnline = MutableStateFlow(false)
    val workstationOnline: StateFlow<Boolean> = _workstationOnline.asStateFlow()

    // Workstation info
    private val _workstationInfo = MutableStateFlow<WorkstationInfo?>(null)
    val workstationInfo: StateFlow<WorkstationInfo?> = _workstationInfo.asStateFlow()

    // Tunnel info
    private val _tunnelInfo = MutableStateFlow<TunnelInfo?>(null)
    val tunnelInfo: StateFlow<TunnelInfo?> = _tunnelInfo.asStateFlow()

    // Workspaces root directory
    val workspacesRoot: StateFlow<String?> = _workstationInfo.map { it?.workspacesRoot }.stateIn(
        scope,
        SharingStarted.Eagerly,
        null
    )

    // Available workspaces
    private val _workspaces = MutableStateFlow<List<WorkspaceConfig>>(emptyList())
    val workspaces: StateFlow<List<WorkspaceConfig>> = _workspaces.asStateFlow()

    // Available agents
    private val _availableAgents = MutableStateFlow<List<AgentConfig>>(emptyList())
    val availableAgents: StateFlow<List<AgentConfig>> = _availableAgents.asStateFlow()

    // Base agent types that should be hidden (from workstation settings)
    private val _hiddenBaseTypes = MutableStateFlow<List<String>>(emptyList())
    val hiddenBaseTypes: StateFlow<List<String>> = _hiddenBaseTypes.asStateFlow()

    // Restored subscriptions (from reconnect)
    private val _restoredSubscriptions = MutableStateFlow<List<String>>(emptyList())
    val restoredSubscriptions: StateFlow<List<String>> = _restoredSubscriptions.asStateFlow()

    // Message stream for consumers
    private val _messageStream = MutableSharedFlow<WebSocketMessage>(
        replay = 0,
        extraBufferCapacity = 100
    )
    val messageStream: SharedFlow<WebSocketMessage> = _messageStream.asSharedFlow()

    init {
        // Start collecting messages from WebSocket
        startMessageCollection()

        // Monitor connection state changes
        scope.launch {
            connectionState.collect { state ->
                when (state) {
                    is ConnectionState.Disconnected -> {
                        _workstationOnline.value = false
                    }
                    is ConnectionState.Error -> {
                        _workstationOnline.value = false
                    }
                    else -> { /* Keep current state */ }
                }
            }
        }
    }

    private fun startMessageCollection() {
        messageCollectorJob?.cancel()
        messageCollectorJob = scope.launch {
            webSocketClient.messages.collect { message ->
                handleMessage(message)
            }
        }
    }

    /**
     * Connect to the tunnel server using stored credentials.
     */
    suspend fun connect() {
        val credentials = secureStorage.getCredentials()
        if (credentials == null) {
            Log.w(TAG, "No credentials stored, cannot connect")
            return
        }

        connect(credentials)
    }

    /**
     * Connect to the tunnel server with provided credentials.
     */
    suspend fun connect(credentials: ConnectionCredentials) {
        Log.d(TAG, "Connecting with credentials: url=${credentials.tunnelUrl}")

        // Store credentials for reconnection
        secureStorage.saveCredentials(credentials)

        val deviceId = deviceIdManager.getDeviceId()
        webSocketClient.connect(
            url = credentials.tunnelUrl,
            tunnelId = credentials.tunnelId,
            authKey = credentials.authKey,
            deviceId = deviceId
        )
    }

    /**
     * Disconnect from the tunnel server.
     */
    fun disconnect() {
        webSocketClient.disconnect()
        _workstationOnline.value = false
        _workstationInfo.value = null
    }

    /**
     * Send a message through the WebSocket with type, optional payload and id.
     */
    fun sendMessage(type: String, payload: Map<String, Any?> = emptyMap(), id: String? = null): Boolean {
        val message = buildMap<String, Any?> {
            put("type", type)
            if (id != null) put("id", id)
            if (payload.isNotEmpty()) put("payload", payload)
        }
        return webSocketClient.sendMessage(message)
    }

    /**
     * Send a raw message map through the WebSocket.
     * Use this when the message format doesn't follow the standard type/payload structure.
     */
    fun sendMessage(message: Map<String, Any?>): Boolean {
        return webSocketClient.sendMessage(message)
    }

    /**
     * Request sync state after reconnection.
     * Protocol requires: { type: "sync", id: string }
     */
    fun requestSyncState() {
        scope.launch {
            val config = CommandBuilder.sync()
            val result = commandSender.send(config)
            when (result) {
                is CommandSendResult.Success -> Log.d(TAG, "Sync request sent successfully")
                is CommandSendResult.Queued -> Log.d(TAG, "Sync request queued")
                is CommandSendResult.Failure -> Log.w(TAG, "Failed to send sync request: ${result.error.message}")
            }
        }
    }

    /**
     * Request audio data for a message from the server.
     * Used when audio is not cached locally (e.g., from history).
     */
    fun requestAudio(messageId: String, type: String = "output"): String {
        val requestId = java.util.UUID.randomUUID().toString()
        val payload = mapOf(
            "message_id" to messageId,
            "type" to type
        )
        sendMessage("audio.request", payload, requestId)
        Log.d(TAG, "Requested audio for messageId=$messageId, requestId=$requestId")
        return requestId
    }

    /**
     * Check WebSocket connection health by sending an immediate ping.
     * Call when app returns to foreground or network changes.
     */
    fun checkConnectionHealth() {
        webSocketClient.checkConnectionHealth()
    }

    // MARK: - Message Handling

    private suspend fun handleMessage(message: JsonObject) {
        val type = message["type"]?.jsonPrimitive?.contentOrNull ?: return
        val payload = message["payload"]?.jsonObject
        val sessionId = message["session_id"]?.jsonPrimitive?.contentOrNull
        val requestId = message["id"]?.jsonPrimitive?.contentOrNull
        // Extract streaming_message_id from root level for deduplication across devices
        val streamingMessageId = message["streaming_message_id"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "Handling message type: $type")

        when (type) {
            "auth.success" -> handleAuthSuccess(payload)
            "sync.state" -> handleSyncState(payload)
            "workstation.status" -> handleWorkstationStatus(payload)

            // Session events
            "session.created" -> emitMessage(WebSocketMessage.SessionCreated(sessionId, payload))
            "session.terminated" -> emitMessage(WebSocketMessage.SessionTerminated(sessionId, payload))
            "session.output" -> emitMessage(WebSocketMessage.SessionOutput(sessionId, payload, streamingMessageId))
            "session.subscribed" -> emitMessage(WebSocketMessage.SessionSubscribed(sessionId, payload, streamingMessageId))
            "session.unsubscribed" -> emitMessage(WebSocketMessage.SessionUnsubscribed(sessionId))
            "session.resized" -> emitMessage(WebSocketMessage.SessionResized(sessionId, payload))
            "session.replay.data" -> emitMessage(WebSocketMessage.SessionReplayData(sessionId, payload))
            "session.user_message" -> emitMessage(WebSocketMessage.SessionUserMessage(sessionId, payload))
            "session.transcription" -> emitMessage(WebSocketMessage.SessionTranscription(sessionId, payload))
            "session.voice_output" -> emitMessage(WebSocketMessage.SessionVoiceOutput(sessionId, payload))

            // Supervisor events
            "supervisor.output" -> emitMessage(WebSocketMessage.SupervisorOutput(payload, streamingMessageId))
            "supervisor.sessions" -> emitMessage(WebSocketMessage.SupervisorSessions(payload))
            "supervisor.user_message" -> emitMessage(WebSocketMessage.SupervisorUserMessage(payload))
            "supervisor.transcription" -> emitMessage(WebSocketMessage.SupervisorTranscription(payload))
            "supervisor.voice_output" -> emitMessage(WebSocketMessage.SupervisorVoiceOutput(payload))
            "supervisor.context_cleared" -> emitMessage(WebSocketMessage.SupervisorContextCleared)

            // Audio response
            "audio.response" -> emitMessage(WebSocketMessage.AudioResponse(requestId, payload))

            // Message acknowledgment
            "message.ack" -> emitMessage(WebSocketMessage.MessageAck(payload))

            // History response (Protocol v1.13) - streaming_message_id is in payload for history
            "history.response" -> {
                val historyStreamingId = payload?.get("streaming_message_id")?.jsonPrimitive?.contentOrNull
                emitMessage(WebSocketMessage.HistoryResponse(requestId, payload, historyStreamingId))
            }

            // Response/Error
            "response" -> emitMessage(WebSocketMessage.Response(requestId, payload))
            "error" -> emitMessage(WebSocketMessage.Error(requestId, payload))

            else -> Log.d(TAG, "Unhandled message type: $type")
        }
    }

    private suspend fun emitMessage(message: WebSocketMessage) {
        _messageStream.emit(message)
    }

    private fun handleAuthSuccess(payload: JsonObject?) {
        _workstationOnline.value = true

        payload?.let { p ->
            _workstationInfo.value = WorkstationInfo(
                name = p["workstation_name"]?.jsonPrimitive?.contentOrNull,
                version = p["workstation_version"]?.jsonPrimitive?.contentOrNull,
                protocolVersion = p["protocol_version"]?.jsonPrimitive?.contentOrNull,
                workspacesRoot = p["workspaces_root"]?.jsonPrimitive?.contentOrNull
            )

            // Parse restored subscriptions
            val subscriptions = p["restored_subscriptions"]?.jsonArray
                ?.mapNotNull { it.jsonPrimitive.contentOrNull }
                ?: emptyList()
            _restoredSubscriptions.value = subscriptions
        }

        // Store tunnel info
        val credentials = secureStorage.getCredentials()
        if (credentials != null) {
            _tunnelInfo.value = TunnelInfo(
                url = credentials.tunnelUrl,
                id = credentials.tunnelId,
                version = null, // Set from tunnel response if available
                protocolVersion = _workstationInfo.value?.protocolVersion
            )
        }

        // Request full sync
        requestSyncState()
    }

    private fun handleSyncState(payload: JsonObject?) {
        payload ?: return

        // Parse sessions
        val sessionsArray = payload["sessions"]?.jsonArray
        // Sessions will be handled by AppState

        // Parse workspaces
        val workspacesArray = payload["workspaces"]?.jsonArray
        if (workspacesArray != null) {
            _workspaces.value = parseWorkspaces(workspacesArray)
        }

        // Parse available agents (protocol uses camelCase: availableAgents)
        val agentsArray = payload["availableAgents"]?.jsonArray
        if (agentsArray != null) {
            _availableAgents.value = parseAgents(agentsArray)
        }

        // Parse hidden base types (from workstation settings)
        val hiddenBaseTypesArray = payload["hiddenBaseTypes"]?.jsonArray
        if (hiddenBaseTypesArray != null) {
            val hiddenTypes = hiddenBaseTypesArray.map { 
                it.jsonPrimitive.content 
            }
            _hiddenBaseTypes.value = hiddenTypes
        }

        // Emit sync.state for AppState to handle sessions and messages
        scope.launch {
            _messageStream.emit(WebSocketMessage.SyncState(payload))
        }
    }

    private fun handleWorkstationStatus(payload: JsonObject?) {
        val online = payload?.get("online")?.jsonPrimitive?.booleanOrNull ?: false
        _workstationOnline.value = online
        Log.d(TAG, "Workstation status: online=$online")
    }

    private fun parseWorkspaces(array: JsonArray): List<WorkspaceConfig> {
        return array.mapNotNull { element ->
            try {
                val obj = element.jsonObject
                WorkspaceConfig(
                    name = obj["name"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    path = obj["path"]?.jsonPrimitive?.contentOrNull,
                    projects = obj["projects"]?.jsonArray?.mapNotNull { projElement ->
                        val projObj = projElement.jsonObject
                        ProjectConfig(
                            name = projObj["name"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                            path = projObj["path"]?.jsonPrimitive?.contentOrNull,
                            isGitRepo = projObj["is_git_repo"]?.jsonPrimitive?.booleanOrNull ?: false,
                            defaultBranch = projObj["default_branch"]?.jsonPrimitive?.contentOrNull,
                            worktrees = projObj["worktrees"]?.jsonArray
                                ?.mapNotNull { it.jsonPrimitive.contentOrNull }
                                ?: emptyList()
                        )
                    } ?: emptyList()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse workspace", e)
                null
            }
        }
    }

    private fun parseAgents(array: JsonArray): List<AgentConfig> {
        return array.mapNotNull { element ->
            try {
                val obj = element.jsonObject
                AgentConfig(
                    name = obj["name"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    baseType = obj["base_type"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    description = obj["description"]?.jsonPrimitive?.contentOrNull ?: "",
                    isAlias = obj["is_alias"]?.jsonPrimitive?.booleanOrNull ?: false
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse agent", e)
                null
            }
        }
    }
}

/**
 * Sealed class representing different WebSocket message types.
 * Provides type-safe message handling.
 */
sealed class WebSocketMessage {
    // Session messages
    data class SessionCreated(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class SessionTerminated(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    /** Session output with optional streaming_message_id for deduplication across devices */
    data class SessionOutput(val sessionId: String?, val payload: JsonObject?, val streamingMessageId: String? = null) : WebSocketMessage()
    /** Session subscribed with optional streaming_message_id for current streaming response */
    data class SessionSubscribed(val sessionId: String?, val payload: JsonObject?, val streamingMessageId: String? = null) : WebSocketMessage()
    data class SessionUnsubscribed(val sessionId: String?) : WebSocketMessage()
    data class SessionResized(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class SessionReplayData(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class SessionUserMessage(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class SessionTranscription(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class SessionVoiceOutput(val sessionId: String?, val payload: JsonObject?) : WebSocketMessage()

    // Supervisor messages
    /** Supervisor output with optional streaming_message_id for deduplication across devices */
    data class SupervisorOutput(val payload: JsonObject?, val streamingMessageId: String? = null) : WebSocketMessage()
    data class SupervisorSessions(val payload: JsonObject?) : WebSocketMessage()
    data class SupervisorUserMessage(val payload: JsonObject?) : WebSocketMessage()
    data class SupervisorTranscription(val payload: JsonObject?) : WebSocketMessage()
    data class SupervisorVoiceOutput(val payload: JsonObject?) : WebSocketMessage()
    data object SupervisorContextCleared : WebSocketMessage()

    // State sync
    data class SyncState(val payload: JsonObject?) : WebSocketMessage()

    // Audio response
    data class AudioResponse(val requestId: String?, val payload: JsonObject?) : WebSocketMessage()

    // Message acknowledgment
    data class MessageAck(val payload: JsonObject?) : WebSocketMessage()

    // Response/Error
    data class Response(val requestId: String?, val payload: JsonObject?) : WebSocketMessage()
    data class Error(val requestId: String?, val payload: JsonObject?) : WebSocketMessage()

    // History response (Protocol v1.13) with optional streaming_message_id for current streaming response
    data class HistoryResponse(val requestId: String?, val payload: JsonObject?, val streamingMessageId: String? = null) : WebSocketMessage()
}
