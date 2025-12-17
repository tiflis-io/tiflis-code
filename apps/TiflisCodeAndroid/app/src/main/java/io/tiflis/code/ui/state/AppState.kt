/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.state

import android.util.Base64
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.tiflis.code.data.network.NetworkChange
import io.tiflis.code.data.network.NetworkMonitor
import io.tiflis.code.data.storage.SecureStorage
import io.tiflis.code.data.websocket.CommandBuilder
import io.tiflis.code.data.websocket.CommandSendResult
import io.tiflis.code.data.websocket.ConnectionService
import io.tiflis.code.data.websocket.WebSocketMessage
import io.tiflis.code.domain.models.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

/**
 * Central state holder for the application.
 * Mirrors the iOS AppState class.
 *
 * Manages:
 * - Connection state
 * - Sessions (supervisor, agents, terminals)
 * - Messages for each session
 * - Workspaces and available agents
 */
@HiltViewModel
class AppState @Inject constructor(
    private val connectionService: ConnectionService,
    private val secureStorage: SecureStorage,
    private val deviceIdManager: io.tiflis.code.data.storage.DeviceIdManager,
    val audioPlayerService: io.tiflis.code.data.audio.AudioPlayerService,
    private val networkMonitor: NetworkMonitor
) : ViewModel() {

    companion object {
        private const val TAG = "AppState"
        private const val SUPERVISOR_SESSION_ID = "supervisor"
    }

    // Connection state (delegated from ConnectionService)
    val connectionState: StateFlow<ConnectionState> = connectionService.connectionState
    val workstationOnline: StateFlow<Boolean> = connectionService.workstationOnline
    val workstationInfo: StateFlow<WorkstationInfo?> = connectionService.workstationInfo
    val tunnelInfo: StateFlow<TunnelInfo?> = connectionService.tunnelInfo
    val workspacesRoot: StateFlow<String?> = connectionService.workspacesRoot
    val workspaces: StateFlow<List<WorkspaceConfig>> = connectionService.workspaces
    val availableAgents: StateFlow<List<AgentConfig>> = connectionService.availableAgents
    val hiddenBaseTypes: StateFlow<List<String>> = connectionService.hiddenBaseTypes

    // Sessions
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions.asStateFlow()

    // Messages
    private val _supervisorMessages = MutableStateFlow<List<Message>>(emptyList())
    val supervisorMessages: StateFlow<List<Message>> = _supervisorMessages.asStateFlow()

    private val _agentMessages = MutableStateFlow<Map<String, List<Message>>>(emptyMap())
    val agentMessages: StateFlow<Map<String, List<Message>>> = _agentMessages.asStateFlow()

    // Current streaming message IDs per session
    private val streamingMessageIds = mutableMapOf<String, String>()

    // Temporary ID mapping (temp -> real)
    private val tempIdMapping = mutableMapOf<String, String>()

    // Loading states - true immediately after sending command, before server responds
    // This mirrors iOS isLoading behavior for showing stop button immediately
    private val _supervisorIsLoading = MutableStateFlow(false)
    val supervisorIsLoading: StateFlow<Boolean> = _supervisorIsLoading.asStateFlow()

    private val _agentIsLoading = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val agentIsLoading: StateFlow<Map<String, Boolean>> = _agentIsLoading.asStateFlow()

    // Scroll triggers - increment on any content update to force scroll to bottom
    // This mirrors iOS scrollTrigger behavior for reliable auto-scroll during streaming
    private val _supervisorScrollTrigger = MutableStateFlow(0)
    val supervisorScrollTrigger: StateFlow<Int> = _supervisorScrollTrigger.asStateFlow()

    private val _agentScrollTriggers = MutableStateFlow<Map<String, Int>>(emptyMap())
    val agentScrollTriggers: StateFlow<Map<String, Int>> = _agentScrollTriggers.asStateFlow()

    /**
     * Get the actual session ID (resolves temp IDs to real server IDs).
     */
    fun getActualSessionId(sessionId: String): String = tempIdMapping[sessionId] ?: sessionId

    // Subscribed sessions
    private val subscribedSessions = mutableSetOf<String>()

    // TTS enabled
    private val _ttsEnabled = MutableStateFlow(secureStorage.getTtsEnabled())
    val ttsEnabled: StateFlow<Boolean> = _ttsEnabled.asStateFlow()

    // Speech language (for STT)
    private val _speechLanguage = MutableStateFlow(secureStorage.getSpeechLanguage())
    val speechLanguage: StateFlow<String> = _speechLanguage.asStateFlow()

    // TTS audio events for auto-play
    private val _ttsAudioEvent = MutableSharedFlow<TtsAudioEvent>(extraBufferCapacity = 1)
    val ttsAudioEvent: SharedFlow<TtsAudioEvent> = _ttsAudioEvent.asSharedFlow()

    // Device ID for multi-device sync
    private val myDeviceId: String by lazy { deviceIdManager.getDeviceId() }

    // Debounce for duplicate send prevention (sessionId+text -> timestamp)
    private val recentSends = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val sendDebounceMs = 2000L // 2 second debounce

    // Track message IDs we sent locally to skip server echoes
    private val locallySentMessageIds = java.util.Collections.newSetFromMap(
        java.util.concurrent.ConcurrentHashMap<String, Boolean>()
    )

    // Lifecycle observer for app foreground/background detection
    private val lifecycleObserver = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) {
            // App came to foreground
            Log.d(TAG, "App came to foreground - checking connection health")
            checkConnectionHealth()
        }

        override fun onStop(owner: LifecycleOwner) {
            // App went to background
            Log.d(TAG, "App went to background")
        }
    }

    init {
        // Register lifecycle observer
        ProcessLifecycleOwner.get().lifecycle.addObserver(lifecycleObserver)

        // Start collecting messages from ConnectionService
        viewModelScope.launch {
            connectionService.messageStream.collect { message ->
                handleWebSocketMessage(message)
            }
        }

        // Handle reconnection - restore subscriptions and refresh to get latest state
        viewModelScope.launch {
            connectionService.restoredSubscriptions.collect { subscriptions ->
                subscriptions.forEach { sessionId ->
                    subscribedSessions.add(sessionId)
                    // Re-subscribe to get latest state after reconnect
                    refreshSession(sessionId)
                }
            }
        }

        // Monitor network changes
        viewModelScope.launch {
            networkMonitor.networkChanges.collect { change ->
                handleNetworkChange(change)
            }
        }

        // Wire up audio request callback
        audioPlayerService.onRequestAudio = { messageId ->
            connectionService.requestAudio(messageId)
        }
    }

    /**
     * Handle network connectivity changes.
     * Triggers connection health check after network type changes or reconnection.
     */
    private fun handleNetworkChange(change: NetworkChange) {
        Log.d(TAG, "Network change: $change")
        when (change) {
            is NetworkChange.Connected -> {
                // Network connected - check health after a small delay for stabilization
                viewModelScope.launch {
                    delay(500)
                    checkConnectionHealth()
                }
            }
            is NetworkChange.TypeChanged -> {
                // Network type changed (e.g., WiFi -> Cellular)
                // This often causes silent connection drops
                Log.d(TAG, "Network type changed from ${change.oldType} to ${change.newType}")
                viewModelScope.launch {
                    delay(500)
                    checkConnectionHealth()
                }
            }
            is NetworkChange.Disconnected -> {
                Log.d(TAG, "Network disconnected")
                // Don't disconnect WebSocket - let ping/pong detect the dead connection
            }
        }
    }

    /**
     * Check WebSocket connection health.
     * Call when app returns to foreground or network changes.
     */
    fun checkConnectionHealth() {
        if (connectionState.value.isConnected) {
            Log.d(TAG, "Checking connection health")
            connectionService.checkConnectionHealth()
        } else if (connectionState.value !is ConnectionState.Connecting &&
                   connectionState.value !is ConnectionState.Reconnecting) {
            // Not connected and not trying to connect - try to reconnect if we have credentials
            if (hasCredentials()) {
                Log.d(TAG, "Not connected but have credentials - reconnecting")
                connect()
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        ProcessLifecycleOwner.get().lifecycle.removeObserver(lifecycleObserver)
    }

    // MARK: - Connection

    /**
     * Connect to the tunnel server.
     */
    fun connect() {
        viewModelScope.launch {
            connectionService.connect()
        }
    }

    /**
     * Connect with specific credentials.
     */
    fun connect(credentials: ConnectionCredentials) {
        viewModelScope.launch {
            connectionService.connect(credentials)
        }
    }

    /**
     * Disconnect from the tunnel server.
     */
    fun disconnect() {
        connectionService.disconnect()
        subscribedSessions.clear()
    }

    /**
     * Check if credentials are stored.
     */
    fun hasCredentials(): Boolean = secureStorage.hasCredentials()

    // MARK: - Session Management

    /**
     * Create a new agent session.
     */
    fun createSession(
        type: SessionType,
        agentName: String? = null,
        workspace: String? = null,
        project: String? = null,
        worktree: String? = null
    ) {
        val tempId = "temp-${UUID.randomUUID()}"

        // For terminal sessions, use default workspace/project if not provided
        // This matches iOS behavior for backend compatibility
        val finalWorkspace: String?
        val finalProject: String?

        if (type == SessionType.TERMINAL) {
            finalWorkspace = workspace ?: "home"
            finalProject = project ?: "default"
        } else {
            finalWorkspace = workspace
            finalProject = project
        }

        // Create temporary session for immediate UI feedback
        val tempSession = Session(
            id = tempId,
            type = type,
            agentName = agentName,
            workspace = finalWorkspace,
            project = finalProject,
            worktree = worktree
        )
        _sessions.value = _sessions.value + tempSession

        // Send create request to server via CommandSender
        viewModelScope.launch {
            val config = CommandBuilder.createSession(
                sessionType = type.name.lowercase(),
                agentName = agentName,
                workspace = finalWorkspace,
                project = finalProject,
                worktree = worktree,
                requestId = tempId
            )
            val result = connectionService.commandSender.send(config)
            when (result) {
                is CommandSendResult.Success -> Log.d(TAG, "Create session sent successfully")
                is CommandSendResult.Queued -> Log.d(TAG, "Create session queued")
                is CommandSendResult.Failure -> {
                    Log.w(TAG, "Failed to create session: ${result.error.message}")
                    // Remove temp session on failure
                    _sessions.value = _sessions.value.filter { it.id != tempId }
                }
            }
        }
    }

    /**
     * Terminate a session.
     */
    fun terminateSession(sessionId: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        // Remove from local state immediately for responsive UI
        _sessions.value = _sessions.value.filter { it.id != sessionId && it.id != actualId }
        subscribedSessions.remove(actualId)
        streamingMessageIds.remove(actualId)
        connectionService.commandSender.cancelPendingCommands(actualId)

        // Send terminate request to server via CommandSender
        viewModelScope.launch {
            val config = CommandBuilder.terminateSession(actualId)
            val result = connectionService.commandSender.send(config)
            when (result) {
                is CommandSendResult.Success -> Log.d(TAG, "Terminate session sent successfully")
                is CommandSendResult.Queued -> Log.d(TAG, "Terminate session queued")
                is CommandSendResult.Failure -> Log.w(TAG, "Failed to terminate session: ${result.error.message}")
            }
        }
    }

    /**
     * Subscribe to a session for updates.
     * Protocol: { type: "session.subscribe", session_id: string }
     */
    fun subscribeToSession(sessionId: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId
        if (subscribedSessions.contains(actualId)) return

        subscribedSessions.add(actualId)

        viewModelScope.launch {
            val config = CommandBuilder.sessionSubscribe(actualId)
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                subscribedSessions.remove(actualId)
                Log.w(TAG, "Failed to subscribe to session: ${result.error.message}")
            }
        }
    }

    /**
     * Unsubscribe from a session.
     * Protocol: { type: "session.unsubscribe", session_id: string }
     */
    fun unsubscribeFromSession(sessionId: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId
        subscribedSessions.remove(actualId)

        viewModelScope.launch {
            val config = CommandBuilder.sessionUnsubscribe(actualId)
            connectionService.commandSender.send(config)
            // Fire and forget - non-critical
        }
    }

    /**
     * Refresh session state by re-subscribing to get latest messages from server.
     * Call this when the view appears to sync state from other devices.
     * Unlike subscribeToSession, this always sends subscribe even if already subscribed.
     */
    fun refreshSession(sessionId: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        viewModelScope.launch {
            val config = CommandBuilder.sessionSubscribe(actualId)
            val result = connectionService.commandSender.send(config)
            if (result !is CommandSendResult.Failure) {
                subscribedSessions.add(actualId)
            }
        }
    }

    // MARK: - Messaging

    /**
     * Send a command to the supervisor.
     * Protocol uses 'command' field, not 'content'
     */
    fun sendSupervisorCommand(text: String? = null, audio: ByteArray? = null, messageId: String? = null) {
        // Debounce: prevent duplicate sends of same text within debounce window
        if (text != null) {
            val debounceKey = "supervisor:${text.hashCode()}"
            val now = System.currentTimeMillis()
            val lastSend = recentSends.putIfAbsent(debounceKey, now)
            if (lastSend != null && now - lastSend < sendDebounceMs) {
                Log.d(TAG, "Debouncing duplicate supervisor send: $debounceKey, delta=${now - lastSend}ms")
                return
            }
            if (lastSend != null) {
                recentSends[debounceKey] = now // Update timestamp
            }
        }

        val requestId = UUID.randomUUID().toString()
        val actualMessageId = messageId ?: UUID.randomUUID().toString()

        // Track this message ID to skip server echo
        locallySentMessageIds.add(actualMessageId)

        val payload = buildMap<String, Any?> {
            if (text != null) put("command", text)  // Protocol uses 'command' field
            if (audio != null) {
                put("audio", Base64.encodeToString(audio, Base64.NO_WRAP))
                put("audio_format", "m4a")
            }
            put("message_id", actualMessageId)
        }

        // Add user message to local state
        if (text != null) {
            val userMessage = Message(
                id = actualMessageId,
                sessionId = SUPERVISOR_SESSION_ID,
                role = MessageRole.USER,
                content = text
            )
            _supervisorMessages.value = _supervisorMessages.value + userMessage
            // Scroll when sending user message
            _supervisorScrollTrigger.value++
        } else if (audio != null) {
            // Voice input message with pending transcription
            val voiceMessage = Message(
                id = actualMessageId,
                sessionId = SUPERVISOR_SESSION_ID,
                role = MessageRole.USER,
                contentBlocks = mutableListOf(
                    MessageContentBlock.VoiceInput(
                        id = UUID.randomUUID().toString(),
                        audioUrl = null,
                        transcription = null,  // Will be filled when transcription arrives
                        durationMs = 0
                    )
                )
            )
            _supervisorMessages.value = _supervisorMessages.value + voiceMessage
            // Scroll when sending voice message
            _supervisorScrollTrigger.value++
            Log.d(TAG, "Added supervisor voice message with id=$actualMessageId, waiting for transcription")
        }

        // Set loading immediately - stop button should appear right away (like iOS)
        _supervisorIsLoading.value = true

        Log.d(TAG, "Sending supervisor command: messageId=$actualMessageId hasText=${text != null} hasAudio=${audio != null}")

        // Send via CommandSender for retry/queue support
        viewModelScope.launch {
            val config = if (audio != null) {
                CommandBuilder.supervisorVoiceCommand(
                    audioBase64 = Base64.encodeToString(audio, Base64.NO_WRAP),
                    format = "m4a",
                    messageId = actualMessageId
                )
            } else {
                CommandBuilder.supervisorCommand(
                    command = text ?: "",
                    messageId = actualMessageId
                )
            }
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to send supervisor command: ${result.error.message}")
                _supervisorIsLoading.value = false
            }
        }
    }

    /**
     * Send a command to an agent session.
     * Protocol: { type: "session.execute", id: string, session_id: string, payload: { text?: string, audio?: string, ... } }
     */
    fun sendAgentCommand(sessionId: String, text: String? = null, audio: ByteArray? = null, messageId: String? = null) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        // Debounce: prevent duplicate sends of same text within debounce window
        if (text != null) {
            val debounceKey = "$actualId:${text.hashCode()}"
            val now = System.currentTimeMillis()
            val lastSend = recentSends.putIfAbsent(debounceKey, now)
            if (lastSend != null && now - lastSend < sendDebounceMs) {
                Log.d(TAG, "Debouncing duplicate agent send: $debounceKey, delta=${now - lastSend}ms")
                return
            }
            if (lastSend != null) {
                recentSends[debounceKey] = now // Update timestamp
            }
        }

        val requestId = UUID.randomUUID().toString()
        val actualMessageId = messageId ?: UUID.randomUUID().toString()

        // Track this message ID to skip server echo
        locallySentMessageIds.add(actualMessageId)

        // Build payload - uses 'text' field, not 'content'
        val payload = buildMap<String, Any?> {
            if (text != null) put("text", text)  // Protocol uses 'text' field
            if (audio != null) {
                put("audio", Base64.encodeToString(audio, Base64.NO_WRAP))
                put("audio_format", "m4a")
            }
            put("message_id", actualMessageId)
        }

        // Add user message to local state - use actualId so it matches server responses
        if (text != null) {
            val userMessage = Message(
                id = actualMessageId,
                sessionId = actualId,
                role = MessageRole.USER,
                content = text
            )
            addAgentMessage(actualId, userMessage)
            // Scroll when sending user message
            _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
                put(actualId, (this[actualId] ?: 0) + 1)
            }
        } else if (audio != null) {
            // Voice input message with pending transcription
            val voiceMessage = Message(
                id = actualMessageId,
                sessionId = actualId,
                role = MessageRole.USER,
                contentBlocks = mutableListOf(
                    MessageContentBlock.VoiceInput(
                        id = UUID.randomUUID().toString(),
                        audioUrl = null,
                        transcription = null,  // Will be filled when transcription arrives
                        durationMs = 0
                    )
                )
            )
            addAgentMessage(actualId, voiceMessage)
            // Scroll when sending voice message
            _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
                put(actualId, (this[actualId] ?: 0) + 1)
            }
            Log.d(TAG, "Added agent voice message with id=$actualMessageId for session=$actualId, waiting for transcription")
        }

        // Set loading immediately - stop button should appear right away (like iOS)
        _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
            put(actualId, true)
        }

        Log.d(TAG, "Sending agent command: sessionId=$actualId messageId=$actualMessageId hasText=${text != null} hasAudio=${audio != null}")

        // Send via CommandSender for retry/queue support
        viewModelScope.launch {
            val config = if (audio != null) {
                CommandBuilder.sessionVoiceExecute(
                    sessionId = actualId,
                    audioBase64 = Base64.encodeToString(audio, Base64.NO_WRAP),
                    format = "m4a",
                    messageId = actualMessageId
                )
            } else {
                CommandBuilder.sessionExecute(
                    sessionId = actualId,
                    text = text ?: "",
                    messageId = actualMessageId
                )
            }
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to send agent command: ${result.error.message}")
                _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
                    put(actualId, false)
                }
            }
        }
    }

    /**
     * Clear supervisor context.
     * Protocol: { type: "supervisor.clear_context", id: string }
     */
    fun clearSupervisorContext() {
        // Clear local state immediately for responsive UI
        _supervisorMessages.value = emptyList()
        streamingMessageIds.remove(SUPERVISOR_SESSION_ID)

        viewModelScope.launch {
            val config = CommandBuilder.supervisorClearContext()
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to clear supervisor context: ${result.error.message}")
            }
        }
    }

    /**
     * Cancel current supervisor operation.
     * Protocol: { type: "supervisor.cancel", id: string }
     */
    fun cancelSupervisorOperation() {
        // Clear loading state immediately on cancel for responsive UI
        _supervisorIsLoading.value = false

        viewModelScope.launch {
            val config = CommandBuilder.supervisorCancel()
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to cancel supervisor operation: ${result.error.message}")
            }
        }
    }

    /**
     * Cancel current agent operation.
     * Protocol: { type: "session.cancel", id: string, session_id: string }
     */
    fun cancelAgentOperation(sessionId: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        // Clear loading state immediately on cancel for responsive UI
        _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
            put(actualId, false)
        }

        viewModelScope.launch {
            val config = CommandBuilder.sessionCancel(actualId)
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to cancel agent operation: ${result.error.message}")
            }
        }
    }

    // MARK: - Terminal

    /**
     * Send terminal input.
     * Protocol: { type: "session.input", session_id: string, payload: { data: string } }
     */
    fun sendTerminalInput(sessionId: String, input: String) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        viewModelScope.launch {
            val config = CommandBuilder.terminalInput(actualId, input)
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to send terminal input: ${result.error.message}")
            }
        }
    }

    /**
     * Request terminal resize.
     * Protocol: { type: "session.resize", session_id: string, payload: { cols: number, rows: number } }
     */
    fun resizeTerminal(sessionId: String, cols: Int, rows: Int) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        viewModelScope.launch {
            val config = CommandBuilder.terminalResize(actualId, cols, rows)
            // Fire and forget - only latest resize matters
            connectionService.commandSender.send(config)
        }
    }

    /**
     * Request terminal replay.
     * Protocol: { type: "session.replay", session_id: string, payload: { since_sequence?: number, limit?: number } }
     */
    fun requestTerminalReplay(sessionId: String, sinceSequence: Long? = null, limit: Int? = null) {
        val actualId = tempIdMapping[sessionId] ?: sessionId

        viewModelScope.launch {
            val config = CommandBuilder.terminalReplay(actualId, sinceSequence, limit)
            val result = connectionService.commandSender.send(config)
            if (result is CommandSendResult.Failure) {
                Log.w(TAG, "Failed to request terminal replay: ${result.error.message}")
            }
        }
    }

    // MARK: - Settings

    fun setTtsEnabled(enabled: Boolean) {
        secureStorage.setTtsEnabled(enabled)
        _ttsEnabled.value = enabled
    }

    fun setSpeechLanguage(language: String) {
        secureStorage.setSpeechLanguage(language)
        _speechLanguage.value = language
    }

    /**
     * Play TTS audio manually (when user clicks play button).
     */
    fun playTtsAudio(base64Audio: String, messageId: String? = null) {
        audioPlayerService.playAudio(base64Audio, messageId)
    }

    /**
     * Stop current TTS playback.
     */
    fun stopTtsAudio() {
        audioPlayerService.stop()
    }

    // MARK: - Message Handling

    private fun handleWebSocketMessage(message: WebSocketMessage) {
        when (message) {
            is WebSocketMessage.SessionCreated -> handleSessionCreated(message.sessionId, message.payload)
            is WebSocketMessage.SessionTerminated -> handleSessionTerminated(message.sessionId)
            is WebSocketMessage.SessionOutput -> handleSessionOutput(message.sessionId, message.payload)
            is WebSocketMessage.SessionSubscribed -> handleSessionSubscribed(message.sessionId, message.payload)
            is WebSocketMessage.SessionUserMessage -> handleSessionUserMessage(message.sessionId, message.payload)
            is WebSocketMessage.SessionTranscription -> handleSessionTranscription(message.sessionId, message.payload)
            is WebSocketMessage.SessionVoiceOutput -> handleSessionVoiceOutput(message.sessionId, message.payload)
            is WebSocketMessage.SupervisorOutput -> handleSupervisorOutput(message.payload)
            is WebSocketMessage.SupervisorUserMessage -> handleSupervisorUserMessage(message.payload)
            is WebSocketMessage.SupervisorTranscription -> handleSupervisorTranscription(message.payload)
            is WebSocketMessage.SupervisorVoiceOutput -> handleSupervisorVoiceOutput(message.payload)
            is WebSocketMessage.SupervisorContextCleared -> handleSupervisorContextCleared()
            is WebSocketMessage.SyncState -> handleSyncState(message.payload)
            is WebSocketMessage.AudioResponse -> handleAudioResponse(message.payload)
            else -> { /* Other messages handled elsewhere */ }
        }
    }

    private fun handleAudioResponse(payload: JsonObject?) {
        payload ?: return

        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: return
        val audio = payload["audio"]?.jsonPrimitive?.contentOrNull
        val error = payload["error"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "Audio response: messageId=$messageId, hasAudio=${audio != null}, audioLen=${audio?.length ?: 0}, error=$error")

        if (error != null) {
            Log.w(TAG, "Audio request error: $error")
        }

        audioPlayerService.handleAudioResponse(messageId, audio)
    }

    private fun handleSessionCreated(sessionId: String?, payload: JsonObject?) {
        sessionId ?: return
        payload ?: return

        val sessionType = payload["session_type"]?.jsonPrimitive?.contentOrNull
            ?.let { SessionType.fromString(it) } ?: return

        val session = Session(
            id = sessionId,
            type = sessionType,
            agentName = payload["agent_name"]?.jsonPrimitive?.contentOrNull,
            workspace = payload["workspace"]?.jsonPrimitive?.contentOrNull,
            project = payload["project"]?.jsonPrimitive?.contentOrNull,
            worktree = payload["worktree"]?.jsonPrimitive?.contentOrNull,
            workingDir = payload["working_dir"]?.jsonPrimitive?.contentOrNull,
            terminalConfig = payload["terminal_config"]?.jsonObject?.let {
                TerminalConfig(it["buffer_size"]?.jsonPrimitive?.int ?: 100)
            }
        )

        val currentSessions = _sessions.value.toMutableList()

        // Check if session with this ID already exists (avoid duplicates from broadcast)
        val existingIndex = currentSessions.indexOfFirst { it.id == sessionId }
        if (existingIndex >= 0) {
            // Session already exists, update it
            currentSessions[existingIndex] = session
            _sessions.value = currentSessions
            Log.d(TAG, "Session updated (already existed): $sessionId (${session.displayName})")
            return
        }

        // Find and replace temp session
        val tempIndex = currentSessions.indexOfFirst { it.id.startsWith("temp-") && it.type == sessionType }
        if (tempIndex >= 0) {
            val tempSession = currentSessions[tempIndex]
            tempIdMapping[tempSession.id] = sessionId
            currentSessions[tempIndex] = session
        } else {
            currentSessions.add(session)
        }
        _sessions.value = currentSessions

        // Auto-subscribe to new sessions
        subscribeToSession(sessionId)

        Log.d(TAG, "Session created: $sessionId (${session.displayName})")
    }

    private fun handleSessionTerminated(sessionId: String?) {
        sessionId ?: return
        _sessions.value = _sessions.value.filter { it.id != sessionId }
        subscribedSessions.remove(sessionId)
        streamingMessageIds.remove(sessionId)
        Log.d(TAG, "Session terminated: $sessionId")
    }

    private fun handleSessionOutput(sessionId: String?, payload: JsonObject?) {
        sessionId ?: return
        payload ?: return

        val contentType = payload["content_type"]?.jsonPrimitive?.contentOrNull
        val isComplete = payload["is_complete"]?.jsonPrimitive?.booleanOrNull ?: false

        when (contentType) {
            "agent" -> handleAgentOutput(sessionId, payload, isComplete)
            "terminal" -> { /* Terminal output handled by TerminalViewModel */ }
            else -> handleAgentOutput(sessionId, payload, isComplete)
        }
    }

    private fun handleAgentOutput(sessionId: String, payload: JsonObject, isComplete: Boolean) {
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull
            ?: streamingMessageIds[sessionId]
            ?: UUID.randomUUID().toString()

        val contentBlocks = parseContentBlocks(payload["content_blocks"]?.jsonArray, messageId = messageId)
        val textContent = payload["content"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "Agent output: sessionId=$sessionId, messageId=$messageId, blocks=${contentBlocks.size}, text=${textContent?.take(50)}, isComplete=$isComplete")

        // Handle empty blocks case - just mark as complete, don't clear content
        // Also treat blank textContent as empty (don't overwrite existing content with whitespace)
        if (contentBlocks.isEmpty() && textContent.isNullOrBlank()) {
            if (isComplete) {
                // Empty blocks with is_complete means end of streaming - just update isStreaming flag
                val streamingId = streamingMessageIds[sessionId] ?: return
                _agentMessages.value = _agentMessages.value.toMutableMap().apply {
                    val messages = this[sessionId]?.toMutableList() ?: return@apply
                    val index = messages.indexOfFirst { it.id == streamingId }
                    if (index >= 0) {
                        val existingMessage = messages[index]
                        messages[index] = Message(
                            id = existingMessage.id,
                            sessionId = existingMessage.sessionId,
                            role = existingMessage.role,
                            contentBlocks = existingMessage.contentBlocks, // Keep existing blocks!
                            isStreaming = false,
                            createdAt = existingMessage.createdAt
                        )
                        put(sessionId, messages.toList())
                    }
                }
                streamingMessageIds.remove(sessionId)
            }
            return
        }

        // CRITICAL: Use inline update pattern to avoid race conditions
        _agentMessages.value = _agentMessages.value.toMutableMap().apply {
            val messages = this[sessionId]?.toMutableList() ?: mutableListOf()
            val streamingId = streamingMessageIds[sessionId]
            val existingIndex = if (streamingId != null) {
                messages.indexOfFirst { it.id == streamingId }
            } else {
                -1
            }

            if (existingIndex >= 0) {
                // Update existing message
                // Server sends FULL accumulated state on each update - replace entire contentBlocks
                // but preserve completed tool statuses and voice output that may have arrived separately
                val existingMessage = messages[existingIndex]
                val existingBlocks = existingMessage.contentBlocks

                val mergedBlocks: MutableList<MessageContentBlock> = if (contentBlocks.isNotEmpty()) {
                    // Merge: use new blocks but preserve completed tool statuses and voice output from existing
                    mergeToolBlockStatuses(contentBlocks, existingBlocks)
                } else if (!textContent.isNullOrBlank()) {
                    // Just text update - create single text block but preserve voice output
                    // Only if textContent is not blank - don't overwrite with empty content
                    val voiceBlocks = existingBlocks.filterIsInstance<MessageContentBlock.VoiceOutput>()
                    mutableListOf<MessageContentBlock>(MessageContentBlock.Text(UUID.randomUUID().toString(), textContent)).apply {
                        addAll(voiceBlocks)
                    }
                } else {
                    // Keep existing blocks unchanged when no new content
                    existingBlocks.toMutableList()
                }

                // Create new Message instance to trigger Compose recomposition
                messages[existingIndex] = Message(
                    id = existingMessage.id,
                    sessionId = existingMessage.sessionId,
                    role = existingMessage.role,
                    contentBlocks = mergedBlocks,
                    isStreaming = !isComplete,
                    createdAt = existingMessage.createdAt
                )
            } else {
                // Create new message
                val newBlocks: MutableList<MessageContentBlock> = if (contentBlocks.isNotEmpty()) {
                    contentBlocks.toMutableList()
                } else if (!textContent.isNullOrBlank()) {
                    // Only create message with text if content is not blank
                    mutableListOf(MessageContentBlock.Text(UUID.randomUUID().toString(), textContent))
                } else {
                    mutableListOf()
                }

                if (newBlocks.isEmpty()) return@apply

                val newMessage = Message(
                    id = messageId,
                    sessionId = sessionId,
                    role = MessageRole.ASSISTANT,
                    contentBlocks = newBlocks,
                    isStreaming = !isComplete
                )
                messages.add(newMessage)
                streamingMessageIds[sessionId] = messageId
            }

            put(sessionId, messages.toList())
        }

        // Trigger scroll on content update (mirrors iOS scrollTrigger behavior)
        _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
            put(sessionId, (this[sessionId] ?: 0) + 1)
        }

        // Clear loading state when output starts arriving or completes
        _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
            put(sessionId, false)
        }

        if (isComplete) {
            streamingMessageIds.remove(sessionId)
            // Scroll when response is complete
            _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
                put(sessionId, (this[sessionId] ?: 0) + 1)
            }
        }
    }

    /**
     * Merge tool block statuses: use new blocks but preserve completed tool statuses and voice output from existing.
     * This handles the case where tool results or voice output arrive separately from the full state update.
     * Also preserves existing tool calls that are not in the new update (server may send only latest tool).
     */
    private fun mergeToolBlockStatuses(
        newBlocks: List<MessageContentBlock>,
        existingBlocks: List<MessageContentBlock>
    ): MutableList<MessageContentBlock> {
        val result = mutableListOf<MessageContentBlock>()

        // First, preserve existing tool calls that are NOT in newBlocks
        // This handles the case where server sends only the latest tool during streaming
        val newToolUseIds = newBlocks
            .filterIsInstance<MessageContentBlock.ToolCall>()
            .mapNotNull { it.toolUseId }
            .toSet()

        for (existingBlock in existingBlocks) {
            if (existingBlock is MessageContentBlock.ToolCall) {
                // Keep existing tool if it's not being updated in newBlocks
                if (existingBlock.toolUseId == null || existingBlock.toolUseId !in newToolUseIds) {
                    result.add(existingBlock)
                }
            }
        }

        // Then process new blocks
        for (newBlock in newBlocks) {
            if (newBlock is MessageContentBlock.ToolCall) {
                // Find matching existing tool by toolUseId
                val existingTool = existingBlocks.find {
                    it is MessageContentBlock.ToolCall && it.toolUseId == newBlock.toolUseId
                } as? MessageContentBlock.ToolCall

                if (existingTool != null) {
                    // Keep existing output/status if new one is running but we have completed
                    val shouldPreserveStatus = newBlock.status == ToolStatus.RUNNING && existingTool.status == ToolStatus.COMPLETED
                    val shouldPreserveOutput = newBlock.output == null && existingTool.output != null

                    if (shouldPreserveStatus || shouldPreserveOutput) {
                        result.add(newBlock.copy(
                            output = if (shouldPreserveOutput) existingTool.output else newBlock.output,
                            status = if (shouldPreserveStatus) existingTool.status else newBlock.status
                        ))
                    } else {
                        result.add(newBlock)
                    }
                } else {
                    result.add(newBlock)
                }
            } else {
                result.add(newBlock)
            }
        }

        // CRITICAL: Preserve voice output blocks that were added separately
        // They won't be in newBlocks from server, so we need to keep them
        val existingVoiceOutputs = existingBlocks.filterIsInstance<MessageContentBlock.VoiceOutput>()
        for (voiceOutput in existingVoiceOutputs) {
            if (result.none { it is MessageContentBlock.VoiceOutput && it.id == voiceOutput.id }) {
                result.add(voiceOutput)
            }
        }

        return result
    }

    private fun handleSupervisorOutput(payload: JsonObject?) {
        payload ?: return

        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull
            ?: streamingMessageIds[SUPERVISOR_SESSION_ID]
            ?: UUID.randomUUID().toString()

        val contentBlocks = parseContentBlocks(payload["content_blocks"]?.jsonArray, messageId = messageId)
        val textContent = payload["content"]?.jsonPrimitive?.contentOrNull
        val isComplete = payload["is_complete"]?.jsonPrimitive?.booleanOrNull ?: false

        // Handle empty blocks case - don't overwrite existing content with empty/blank content
        if (contentBlocks.isEmpty() && textContent.isNullOrBlank()) {
            if (isComplete) {
                // Empty blocks with is_complete means end of streaming
                val messages = _supervisorMessages.value.toMutableList()
                val streamingId = streamingMessageIds[SUPERVISOR_SESSION_ID] ?: return
                val index = messages.indexOfFirst { it.id == streamingId }
                if (index >= 0) {
                    val existingMessage = messages[index]
                    messages[index] = Message(
                        id = existingMessage.id,
                        sessionId = existingMessage.sessionId,
                        role = existingMessage.role,
                        contentBlocks = existingMessage.contentBlocks.toMutableList(),
                        isStreaming = false,
                        createdAt = existingMessage.createdAt
                    )
                    _supervisorMessages.value = messages.toList()
                }
                streamingMessageIds.remove(SUPERVISOR_SESSION_ID)
            }
            return
        }

        val messages = _supervisorMessages.value.toMutableList()
        val streamingId = streamingMessageIds[SUPERVISOR_SESSION_ID]
        val existingIndex = if (streamingId != null) {
            messages.indexOfFirst { it.id == streamingId }
        } else {
            -1
        }

        if (existingIndex >= 0) {
            // Update existing message
            // For supervisor (LangGraph), replace last text block but append non-text blocks
            val existingMessage = messages[existingIndex]
            val updatedBlocks = existingMessage.contentBlocks.toMutableList()

            for (newBlock in contentBlocks) {
                when (newBlock) {
                    is MessageContentBlock.Text -> {
                        // Replace the last text block with the new one
                        val lastTextIndex = updatedBlocks.indexOfLast { it is MessageContentBlock.Text }
                        if (lastTextIndex >= 0) {
                            updatedBlocks[lastTextIndex] = newBlock
                        } else {
                            updatedBlocks.add(newBlock)
                        }
                    }
                    is MessageContentBlock.ToolCall -> {
                        // For tool calls, update by toolUseId or add new
                        val existingToolIndex = updatedBlocks.indexOfFirst {
                            it is MessageContentBlock.ToolCall && it.toolUseId == newBlock.toolUseId
                        }
                        if (existingToolIndex >= 0) {
                            updatedBlocks[existingToolIndex] = newBlock
                        } else {
                            updatedBlocks.add(newBlock)
                        }
                    }
                    else -> {
                        // Append other block types if not already present
                        if (updatedBlocks.none { it.id == newBlock.id }) {
                            updatedBlocks.add(newBlock)
                        }
                    }
                }
            }

            // Handle text-only update - only if textContent is not blank
            // Empty content should NOT overwrite existing text (streaming may send empty updates)
            if (contentBlocks.isEmpty() && !textContent.isNullOrBlank()) {
                val lastTextIndex = updatedBlocks.indexOfLast { it is MessageContentBlock.Text }
                if (lastTextIndex >= 0) {
                    val existingBlock = updatedBlocks[lastTextIndex] as MessageContentBlock.Text
                    updatedBlocks[lastTextIndex] = existingBlock.copy(text = textContent)
                } else {
                    updatedBlocks.add(MessageContentBlock.Text(UUID.randomUUID().toString(), textContent))
                }
            }

            // Create new Message instance to trigger Compose recomposition
            messages[existingIndex] = Message(
                id = existingMessage.id,
                sessionId = existingMessage.sessionId,
                role = existingMessage.role,
                contentBlocks = updatedBlocks,
                isStreaming = !isComplete,
                createdAt = existingMessage.createdAt
            )
        } else {
            // Create new message
            val newBlocks: MutableList<MessageContentBlock> = if (contentBlocks.isNotEmpty()) {
                contentBlocks.toMutableList()
            } else if (!textContent.isNullOrBlank()) {
                // Parse text content for any embedded code blocks (like iOS does)
                // Only if textContent is not blank - empty content should not create a message
                parseTextWithCodeBlocks(textContent).toMutableList()
            } else {
                mutableListOf()
            }

            if (newBlocks.isEmpty()) return

            val newMessage = Message(
                id = messageId,
                sessionId = SUPERVISOR_SESSION_ID,
                role = MessageRole.ASSISTANT,
                contentBlocks = newBlocks,
                isStreaming = !isComplete
            )
            messages.add(newMessage)
            streamingMessageIds[SUPERVISOR_SESSION_ID] = messageId
        }

        // Create new list to trigger StateFlow emission
        _supervisorMessages.value = messages.toList()

        // Trigger scroll on content update (mirrors iOS scrollTrigger behavior)
        _supervisorScrollTrigger.value++

        // Clear loading state when output starts arriving or completes
        _supervisorIsLoading.value = false

        if (isComplete) {
            streamingMessageIds.remove(SUPERVISOR_SESSION_ID)
            // Scroll when response is complete
            _supervisorScrollTrigger.value++
        }
    }

    private fun handleSupervisorUserMessage(payload: JsonObject?) {
        // Handle user messages from other devices ONLY
        payload ?: return
        val content = payload["content"]?.jsonPrimitive?.contentOrNull ?: return
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: UUID.randomUUID().toString()
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "handleSupervisorUserMessage: messageId=$messageId fromDeviceId=$fromDeviceId myDeviceId=$myDeviceId")

        // ONLY add user messages from OTHER devices
        // If fromDeviceId is null or matches our device, skip (we already added locally)
        if (fromDeviceId == null || fromDeviceId == myDeviceId) {
            Log.d(TAG, "Skipping supervisor user message - from self or unknown device: $messageId")
            return
        }

        // Skip if we sent this message locally (server echo)
        if (locallySentMessageIds.remove(messageId)) {
            Log.d(TAG, "Skipping supervisor user message - locally sent: $messageId")
            return
        }

        // Check if message already exists
        if (_supervisorMessages.value.any { it.id == messageId }) {
            Log.d(TAG, "Skipping supervisor user message - already exists: $messageId")
            return
        }

        // Also check by content in text blocks
        val existingContents = _supervisorMessages.value
            .filter { it.role == MessageRole.USER }
            .flatMap { msg -> msg.contentBlocks.filterIsInstance<MessageContentBlock.Text>().map { it.text } }
        if (content in existingContents) {
            Log.d(TAG, "Skipping supervisor user message - same content exists: $messageId")
            return
        }

        val userMessage = Message(
            id = messageId,
            sessionId = SUPERVISOR_SESSION_ID,
            role = MessageRole.USER,
            content = content
        )
        _supervisorMessages.value = _supervisorMessages.value + userMessage

        // Scroll when receiving mirrored user message
        _supervisorScrollTrigger.value++

        // Set loading state when user message comes from another device
        _supervisorIsLoading.value = true
        Log.d(TAG, "Set supervisor loading=true from other device message")
    }

    private fun handleSupervisorTranscription(payload: JsonObject?) {
        payload ?: return
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: return
        // Protocol uses "text" field for transcription, with optional "error" field
        val text = payload["text"]?.jsonPrimitive?.contentOrNull
        val errorText = payload["error"]?.jsonPrimitive?.contentOrNull
        val transcription = errorText ?: text ?: return
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull
        val duration = payload["duration"]?.jsonPrimitive?.longOrNull ?: 0

        Log.d(TAG, "handleSupervisorTranscription: messageId=$messageId text=$text error=$errorText from=$fromDeviceId")

        val messages = _supervisorMessages.value.toMutableList()
        val index = messages.indexOfFirst { it.id == messageId }
        if (index >= 0) {
            val existingMessage = messages[index]
            // Update voice input block with transcription
            val voiceInputIndex = existingMessage.contentBlocks.indexOfFirst { it is MessageContentBlock.VoiceInput }
            if (voiceInputIndex >= 0) {
                val updatedBlocks = existingMessage.contentBlocks.toMutableList()
                val block = updatedBlocks[voiceInputIndex] as MessageContentBlock.VoiceInput
                updatedBlocks[voiceInputIndex] = block.copy(transcription = transcription)

                // Create new Message instance to trigger recomposition
                messages[index] = Message(
                    id = existingMessage.id,
                    sessionId = existingMessage.sessionId,
                    role = existingMessage.role,
                    contentBlocks = updatedBlocks,
                    isStreaming = existingMessage.isStreaming,
                    createdAt = existingMessage.createdAt
                )
                _supervisorMessages.value = messages.toList()
                // Trigger scroll after transcription update
                _supervisorScrollTrigger.value++
                Log.d(TAG, "Updated supervisor voice message with transcription: $transcription")
            }
        } else if (fromDeviceId != null && fromDeviceId != myDeviceId) {
            // Message not found locally - this is from another device
            // Create a new message with voiceInput block for the mirrored device
            val voiceMessage = Message(
                id = messageId,
                sessionId = SUPERVISOR_SESSION_ID,
                role = MessageRole.USER,
                contentBlocks = mutableListOf(MessageContentBlock.VoiceInput(
                    id = UUID.randomUUID().toString(),
                    audioUrl = null,
                    transcription = transcription,
                    durationMs = duration
                ))
            )
            _supervisorMessages.value = _supervisorMessages.value + voiceMessage
            _supervisorIsLoading.value = true
            // Scroll for mirrored voice message
            _supervisorScrollTrigger.value++
            Log.d(TAG, "Created supervisor voice message from mirrored device: $transcription")
        }
    }

    private fun handleSupervisorVoiceOutput(payload: JsonObject?) {
        // Handle TTS voice output - add to the LAST ASSISTANT message (not user message)
        payload ?: return
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: return
        val audio = payload["audio"]?.jsonPrimitive?.contentOrNull
        val ttsText = payload["text"]?.jsonPrimitive?.contentOrNull ?: "Voice message"
        val duration = payload["duration"]?.jsonPrimitive?.longOrNull ?: 0
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull

        // CRITICAL: Inline update to avoid race conditions - always work with FRESH state
        val messages = _supervisorMessages.value.toMutableList()

        // Find the LAST assistant message (not the user's voice input message!)
        val lastAssistantIndex = messages.indexOfLast { it.role == MessageRole.ASSISTANT }
        if (lastAssistantIndex >= 0) {
            val existingMessage = messages[lastAssistantIndex]

            // Check if voice output block already exists (avoid duplicates)
            val alreadyHasVoiceOutput = existingMessage.contentBlocks.any {
                it is MessageContentBlock.VoiceOutput && it.messageId == messageId
            }
            if (!alreadyHasVoiceOutput) {
                val updatedBlocks = existingMessage.contentBlocks.toMutableList()
                updatedBlocks.add(MessageContentBlock.VoiceOutput(
                    id = UUID.randomUUID().toString(),
                    audioUrl = null,
                    audioData = audio,
                    text = ttsText,  // Actual TTS text content
                    durationMs = duration,
                    messageId = messageId  // For on-demand audio loading
                ))

                // Create new Message instance to trigger recomposition
                messages[lastAssistantIndex] = Message(
                    id = existingMessage.id,
                    sessionId = existingMessage.sessionId,
                    role = existingMessage.role,
                    contentBlocks = updatedBlocks,
                    isStreaming = existingMessage.isStreaming,
                    createdAt = existingMessage.createdAt
                )
                _supervisorMessages.value = messages.toList()
                // Scroll when TTS is received
                _supervisorScrollTrigger.value++

                Log.d(TAG, "Added voice output to supervisor assistant message, total blocks: ${updatedBlocks.size}")
            } else {
                Log.d(TAG, "Supervisor voice output already exists for messageId=$messageId, skipping")
            }
        } else {
            Log.w(TAG, "No supervisor assistant message found to attach voice output")
        }

        // Auto-play TTS if enabled AND this message originated from this device
        // Like iOS: directly play via AudioPlayerService (more reliable than SharedFlow)
        val shouldAutoPlay = _ttsEnabled.value &&
            audio != null &&
            (fromDeviceId == null || fromDeviceId == myDeviceId)

        Log.d(TAG, "TTS supervisor: from=$fromDeviceId me=$myDeviceId ttsEnabled=${_ttsEnabled.value} autoPlay=$shouldAutoPlay messageId=$messageId")

        if (audio != null) {
            if (shouldAutoPlay) {
                // Play directly (also caches internally)
                audioPlayerService.playAudio(audio, messageId)
            } else {
                // Just cache for later manual playback
                audioPlayerService.cacheAudio(audio, messageId)
            }
        }
    }

    private fun handleSupervisorContextCleared() {
        _supervisorMessages.value = emptyList()
        streamingMessageIds.remove(SUPERVISOR_SESSION_ID)
        Log.d(TAG, "Supervisor context cleared")
    }

    private fun handleSessionUserMessage(sessionId: String?, payload: JsonObject?) {
        sessionId ?: return
        payload ?: return

        val content = payload["content"]?.jsonPrimitive?.contentOrNull ?: return
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: UUID.randomUUID().toString()
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "handleSessionUserMessage: sessionId=$sessionId messageId=$messageId fromDeviceId=$fromDeviceId myDeviceId=$myDeviceId")

        // ONLY add user messages from OTHER devices
        // If fromDeviceId is null or matches our device, skip (we already added locally)
        if (fromDeviceId == null || fromDeviceId == myDeviceId) {
            Log.d(TAG, "Skipping session user message - from self or unknown device: $messageId")
            return
        }

        // Also skip if we have this message ID tracked as locally sent
        if (locallySentMessageIds.remove(messageId)) {
            Log.d(TAG, "Skipping session user message - in locallySentMessageIds: $messageId")
            return
        }

        // Check if message already exists (prevents duplicates)
        val existingMessages = _agentMessages.value[sessionId] ?: emptyList()
        if (existingMessages.any { it.id == messageId }) {
            Log.d(TAG, "Skipping session user message - already exists: $messageId")
            return
        }

        // Also check by content in text blocks - skip if same content exists
        val existingContents = existingMessages
            .filter { it.role == MessageRole.USER }
            .flatMap { msg -> msg.contentBlocks.filterIsInstance<MessageContentBlock.Text>().map { it.text } }
        if (content in existingContents) {
            Log.d(TAG, "Skipping session user message - same content exists: $messageId")
            return
        }

        // Add user message from another device
        val messages = _agentMessages.value.toMutableMap()
        val sessionMessages = messages[sessionId]?.toMutableList() ?: mutableListOf()

        val userMessage = Message(
            id = messageId,
            sessionId = sessionId,
            role = MessageRole.USER,
            contentBlocks = mutableListOf(MessageContentBlock.Text(UUID.randomUUID().toString(), content))
        )
        sessionMessages.add(userMessage)
        messages[sessionId] = sessionMessages
        _agentMessages.value = messages

        // Scroll when receiving mirrored user message
        _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
            put(sessionId, (this[sessionId] ?: 0) + 1)
        }

        // Set loading state when user message comes from another device
        // This enables the Stop button on all connected devices
        _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
            put(sessionId, true)
        }

        Log.d(TAG, "Added user message from other device for session: $sessionId, set loading=true")
    }

    private fun handleSessionTranscription(sessionId: String?, payload: JsonObject?) {
        sessionId ?: return
        payload ?: return

        val text = payload["text"]?.jsonPrimitive?.contentOrNull
        val errorText = payload["error"]?.jsonPrimitive?.contentOrNull
        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull
        val duration = payload["duration"]?.jsonPrimitive?.longOrNull ?: 0
        val transcription = errorText ?: text ?: return

        Log.d(TAG, "handleSessionTranscription: sessionId=$sessionId messageId=$messageId text=$text error=$errorText from=$fromDeviceId")

        val sessionMessages = _agentMessages.value[sessionId]?.toMutableList() ?: mutableListOf()
        Log.d(TAG, "handleSessionTranscription: found ${sessionMessages.size} messages for session, looking for messageId=$messageId")

        // Try to find and update existing voice input message
        if (messageId != null) {
            val index = sessionMessages.indexOfFirst { it.id == messageId }
            Log.d(TAG, "handleSessionTranscription: search result index=$index for messageId=$messageId")
            if (index >= 0) {
                val existingMessage = sessionMessages[index]
                val voiceInputIndex = existingMessage.contentBlocks.indexOfFirst { it is MessageContentBlock.VoiceInput }
                Log.d(TAG, "handleSessionTranscription: found message, voiceInputIndex=$voiceInputIndex blocks=${existingMessage.contentBlocks.map { it::class.simpleName }}")
                if (voiceInputIndex >= 0) {
                    val updatedBlocks = existingMessage.contentBlocks.toMutableList()
                    val block = updatedBlocks[voiceInputIndex] as MessageContentBlock.VoiceInput
                    updatedBlocks[voiceInputIndex] = block.copy(transcription = transcription)

                    // Create new Message instance to trigger recomposition
                    sessionMessages[index] = Message(
                        id = existingMessage.id,
                        sessionId = existingMessage.sessionId,
                        role = existingMessage.role,
                        contentBlocks = updatedBlocks,
                        isStreaming = existingMessage.isStreaming,
                        createdAt = existingMessage.createdAt
                    )

                    // Create new map to trigger StateFlow emission
                    _agentMessages.value = _agentMessages.value.toMutableMap().apply {
                        put(sessionId, sessionMessages.toList())
                    }
                    // Trigger scroll after transcription update
                    _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
                        put(sessionId, (this[sessionId] ?: 0) + 1)
                    }
                    Log.d(TAG, "handleSessionTranscription: Updated voice message with transcription: $transcription")
                    return
                }
            }
            Log.d(TAG, "handleSessionTranscription: Message not found locally, fromDeviceId=$fromDeviceId myDeviceId=$myDeviceId")

            // Message not found - create new voice input message from other device
            if (fromDeviceId != null && fromDeviceId != myDeviceId) {
                val voiceMessage = Message(
                    id = messageId,
                    sessionId = sessionId,
                    role = MessageRole.USER,
                    contentBlocks = mutableListOf(MessageContentBlock.VoiceInput(
                        id = UUID.randomUUID().toString(),
                        audioUrl = null,
                        transcription = transcription,
                        durationMs = duration
                    ))
                )
                sessionMessages.add(voiceMessage)

                // Create new map to trigger StateFlow emission
                _agentMessages.value = _agentMessages.value.toMutableMap().apply {
                    put(sessionId, sessionMessages.toList())
                }

                // Scroll for mirrored voice message
                _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
                    put(sessionId, (this[sessionId] ?: 0) + 1)
                }

                // Set loading state when voice message comes from another device
                // This enables the Stop button on all connected devices
                _agentIsLoading.value = _agentIsLoading.value.toMutableMap().apply {
                    put(sessionId, true)
                }

                Log.d(TAG, "Created voice message from other device for session: $sessionId, set loading=true")
            }
        }
    }

    private fun handleSessionVoiceOutput(sessionId: String?, payload: JsonObject?) {
        // Handle TTS voice output - add to the LAST ASSISTANT message (not user message)
        sessionId ?: return
        payload ?: return

        val messageId = payload["message_id"]?.jsonPrimitive?.contentOrNull ?: return
        val audio = payload["audio"]?.jsonPrimitive?.contentOrNull
        val ttsText = payload["text"]?.jsonPrimitive?.contentOrNull ?: "Voice message"
        val duration = payload["duration"]?.jsonPrimitive?.longOrNull ?: 0
        val fromDeviceId = payload["from_device_id"]?.jsonPrimitive?.contentOrNull

        Log.d(TAG, "Session voice output received: sessionId=$sessionId, messageId=$messageId, hasAudio=${audio != null}")

        // CRITICAL: Use updateAndGet pattern to avoid race conditions
        // Always get FRESH state at the moment of update
        _agentMessages.value = _agentMessages.value.toMutableMap().apply {
            val sessionMessages = this[sessionId]?.toMutableList() ?: return@apply

            // Find the LAST assistant message (not the user's voice input message!)
            val lastAssistantIndex = sessionMessages.indexOfLast { it.role == MessageRole.ASSISTANT }
            if (lastAssistantIndex < 0) {
                Log.w(TAG, "No assistant message found to attach voice output for session: $sessionId")
                return@apply
            }

            val existingMessage = sessionMessages[lastAssistantIndex]

            // Check if voice output block already exists (avoid duplicates)
            val alreadyHasVoiceOutput = existingMessage.contentBlocks.any {
                it is MessageContentBlock.VoiceOutput && it.messageId == messageId
            }
            if (alreadyHasVoiceOutput) {
                Log.d(TAG, "Voice output already exists for messageId=$messageId, skipping")
                return@apply
            }

            val updatedBlocks = existingMessage.contentBlocks.toMutableList()
            updatedBlocks.add(MessageContentBlock.VoiceOutput(
                id = UUID.randomUUID().toString(),
                audioUrl = null,
                audioData = audio,
                text = ttsText,  // Actual TTS text content
                durationMs = duration,
                messageId = messageId  // For on-demand audio loading
            ))

            // Create new Message instance to trigger recomposition
            sessionMessages[lastAssistantIndex] = Message(
                id = existingMessage.id,
                sessionId = existingMessage.sessionId,
                role = existingMessage.role,
                contentBlocks = updatedBlocks,
                isStreaming = existingMessage.isStreaming,
                createdAt = existingMessage.createdAt
            )

            put(sessionId, sessionMessages.toList())
            Log.d(TAG, "Added voice output to assistant message, total blocks: ${updatedBlocks.size}")
        }

        // Scroll when TTS is received
        _agentScrollTriggers.value = _agentScrollTriggers.value.toMutableMap().apply {
            put(sessionId, (this[sessionId] ?: 0) + 1)
        }

        // Auto-play TTS if enabled AND this message originated from this device
        // Like iOS: directly play via AudioPlayerService (more reliable than SharedFlow)
        val shouldAutoPlay = _ttsEnabled.value &&
            audio != null &&
            (fromDeviceId == null || fromDeviceId == myDeviceId)

        Log.d(TAG, "TTS session: from=$fromDeviceId me=$myDeviceId ttsEnabled=${_ttsEnabled.value} autoPlay=$shouldAutoPlay messageId=$messageId")

        if (audio != null) {
            if (shouldAutoPlay) {
                // Play directly (also caches internally)
                audioPlayerService.playAudio(audio, messageId)
            } else {
                // Just cache for later manual playback
                audioPlayerService.cacheAudio(audio, messageId)
            }
        }
    }

    private fun handleSessionSubscribed(sessionId: String?, payload: JsonObject?) {
        sessionId ?: return
        subscribedSessions.add(sessionId)
        Log.d(TAG, "Subscribed to session: $sessionId")
    }

    private fun handleSyncState(payload: JsonObject?) {
        payload ?: return

        // Parse sessions
        val sessionsArray = payload["sessions"]?.jsonArray
        if (sessionsArray != null) {
            val parsedSessions = sessionsArray.mapNotNull { parseSession(it.jsonObject) }
            _sessions.value = parsedSessions
        }

        // Parse supervisor history (protocol uses camelCase: supervisorHistory)
        val supervisorHistory = payload["supervisorHistory"]?.jsonArray
        if (supervisorHistory != null) {
            val messages = supervisorHistory.mapNotNull { parseHistoryMessage(it.jsonObject, SUPERVISOR_SESSION_ID) }
            _supervisorMessages.value = messages
        }

        // Parse agent histories (protocol uses camelCase: agentHistories)
        // This is a map of sessionId -> array of history messages
        val agentHistories = payload["agentHistories"]?.jsonObject
        if (agentHistories != null) {
            val updatedAgentMessages = _agentMessages.value.toMutableMap()
            for ((sessionId, historyElement) in agentHistories) {
                val historyArray = historyElement.jsonArray
                val messages = historyArray.mapNotNull { parseHistoryMessage(it.jsonObject, sessionId) }
                if (messages.isNotEmpty()) {
                    updatedAgentMessages[sessionId] = messages
                }
            }
            _agentMessages.value = updatedAgentMessages
            Log.d(TAG, "Restored agent histories for ${agentHistories.size} sessions")
        }

        // Note: workspaces and availableAgents are parsed in ConnectionService
        // and exposed via delegated StateFlows

        Log.d(TAG, "Sync state received: ${_sessions.value.size} sessions")
    }

    private fun parseSession(obj: JsonObject): Session? {
        val id = obj["session_id"]?.jsonPrimitive?.contentOrNull ?: return null
        val type = obj["session_type"]?.jsonPrimitive?.contentOrNull
            ?.let { SessionType.fromString(it) } ?: return null

        return Session(
            id = id,
            type = type,
            agentName = obj["agent_name"]?.jsonPrimitive?.contentOrNull,
            workspace = obj["workspace"]?.jsonPrimitive?.contentOrNull,
            project = obj["project"]?.jsonPrimitive?.contentOrNull,
            worktree = obj["worktree"]?.jsonPrimitive?.contentOrNull,
            workingDir = obj["working_dir"]?.jsonPrimitive?.contentOrNull,
            createdAt = obj["created_at"]?.jsonPrimitive?.longOrNull
                ?.let { Instant.ofEpochMilli(it) } ?: Instant.now()
        )
    }

    private fun parseHistoryMessage(obj: JsonObject, sessionId: String): Message? {
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: UUID.randomUUID().toString()
        val role = obj["role"]?.jsonPrimitive?.contentOrNull?.let {
            when (it) {
                "user" -> MessageRole.USER
                "assistant" -> MessageRole.ASSISTANT
                else -> MessageRole.SYSTEM
            }
        } ?: MessageRole.ASSISTANT

        val content = obj["content"]?.jsonPrimitive?.contentOrNull
        val contentBlocks = parseContentBlocks(obj["content_blocks"]?.jsonArray, messageId = id)

        return Message(
            id = id,
            sessionId = sessionId,
            role = role,
            contentBlocks = contentBlocks.ifEmpty {
                content?.let { mutableListOf(MessageContentBlock.Text(UUID.randomUUID().toString(), it)) }
                    ?: mutableListOf()
            }.toMutableList(),
            createdAt = obj["timestamp"]?.jsonPrimitive?.longOrNull
                ?.let { Instant.ofEpochMilli(it) } ?: Instant.now()
        )
    }

    private fun parseContentBlocks(array: JsonArray?, messageId: String? = null): List<MessageContentBlock> {
        array ?: return emptyList()
        Log.d(TAG, "parseContentBlocks: array size=${array.size}")
        val parsedBlocks = mutableListOf<MessageContentBlock>()

        for (element in array) {
            try {
                val obj = element.jsonObject
                // Protocol uses 'block_type' for content blocks
                val blockType = obj["block_type"]?.jsonPrimitive?.contentOrNull
                    ?: obj["type"]?.jsonPrimitive?.contentOrNull  // Fallback for compatibility
                    ?: continue
                Log.d(TAG, "parseContentBlocks: processing blockType=$blockType")

                // Skip status blocks - they are ephemeral streaming indicators
                // (e.g., "Processing...", "Complete") that shouldn't be persisted
                // Note: Cancellation messages use dedicated "cancel" block type
                if (blockType == "status") {
                    continue
                }

                val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: UUID.randomUUID().toString()

                // Protocol uses 'content' field for block content
                val content = obj["content"]?.jsonPrimitive?.contentOrNull ?: ""

                val block: MessageContentBlock? = when (blockType) {
                    "text" -> {
                        // Parse text content and extract any embedded code blocks
                        // Protocol uses 'content' field (like iOS), fallback to 'text' for compatibility
                        val textContent = content.ifEmpty { obj["text"]?.jsonPrimitive?.contentOrNull ?: "" }
                        Log.d(TAG, "parseContentBlocks: text block content='${textContent.take(100)}'")
                        if (textContent.isEmpty()) {
                            Log.d(TAG, "parseContentBlocks: text block is EMPTY, skipping")
                            null
                        } else {
                            val extractedBlocks = parseTextWithCodeBlocks(textContent)
                            Log.d(TAG, "parseContentBlocks: extracted ${extractedBlocks.size} blocks from text")
                            parsedBlocks.addAll(extractedBlocks)
                            null // Already added to parsedBlocks
                        }
                    }
                    "code" -> MessageContentBlock.Code(
                        id = id,
                        language = obj["metadata"]?.jsonObject?.get("language")?.jsonPrimitive?.contentOrNull
                            ?: obj["language"]?.jsonPrimitive?.contentOrNull,
                        code = obj["code"]?.jsonPrimitive?.contentOrNull ?: content
                    )
                    "tool_use", "tool_call", "tool" -> {
                        val metadata = obj["metadata"]?.jsonObject
                        val toolUseId = metadata?.get("tool_use_id")?.jsonPrimitive?.contentOrNull
                            ?: obj["tool_use_id"]?.jsonPrimitive?.contentOrNull
                        val output = metadata?.get("tool_output")?.jsonPrimitive?.contentOrNull
                            ?: obj["output"]?.jsonPrimitive?.contentOrNull
                        // Default to 'completed' if status not specified - history data should be completed
                        // Only streaming blocks should have 'running' status (and they explicitly set it)
                        val statusStr = metadata?.get("tool_status")?.jsonPrimitive?.contentOrNull
                            ?: obj["status"]?.jsonPrimitive?.contentOrNull
                        val status = when (statusStr) {
                            "running" -> ToolStatus.RUNNING
                            "completed" -> ToolStatus.COMPLETED
                            "failed" -> ToolStatus.FAILED
                            else -> if (output != null) ToolStatus.COMPLETED else ToolStatus.RUNNING
                        }
                        MessageContentBlock.ToolCall(
                            id = id,
                            toolUseId = toolUseId,
                            name = metadata?.get("tool_name")?.jsonPrimitive?.contentOrNull
                                ?: obj["name"]?.jsonPrimitive?.contentOrNull
                                ?: content.ifEmpty { "unknown" },
                            input = metadata?.get("tool_input")?.jsonPrimitive?.contentOrNull
                                ?: obj["input"]?.toString(),
                            output = output,
                            status = status
                        )
                    }
                    "thinking" -> MessageContentBlock.Thinking(
                        id = id,
                        text = obj["text"]?.jsonPrimitive?.contentOrNull ?: content
                    )
                    "error" -> MessageContentBlock.Error(
                        id = id,
                        text = obj["text"]?.jsonPrimitive?.contentOrNull
                            ?: obj["error"]?.jsonPrimitive?.contentOrNull
                            ?: content
                    )
                    "cancel" -> MessageContentBlock.Error(
                        id = id,
                        text = obj["text"]?.jsonPrimitive?.contentOrNull ?: content.ifEmpty { "Operation cancelled" }
                    )
                    "voice_input" -> {
                        val metadata = obj["metadata"]?.jsonObject
                        MessageContentBlock.VoiceInput(
                            id = id,
                            audioUrl = metadata?.get("audio_url")?.jsonPrimitive?.contentOrNull,
                            transcription = obj["transcription"]?.jsonPrimitive?.contentOrNull ?: content.ifEmpty { null },
                            durationMs = metadata?.get("duration")?.jsonPrimitive?.longOrNull
                                ?: obj["duration_ms"]?.jsonPrimitive?.longOrNull ?: 0
                        )
                    }
                    "voice_output" -> {
                        val metadata = obj["metadata"]?.jsonObject
                        // Use metadata.message_id (audio file tracking ID), fallback to block id or parent messageId
                        // Priority: metadata.message_id > obj.message_id > block id > parent messageId
                        val audioMessageId = metadata?.get("message_id")?.jsonPrimitive?.contentOrNull
                            ?: obj["message_id"]?.jsonPrimitive?.contentOrNull
                            ?: id  // Use block id as fallback (more specific than parent messageId)
                        Log.d(TAG, "Parsing voice_output: audioMessageId=$audioMessageId, blockId=$id, parentMessageId=$messageId")
                        MessageContentBlock.VoiceOutput(
                            id = id,
                            audioUrl = metadata?.get("audio_url")?.jsonPrimitive?.contentOrNull,
                            audioData = metadata?.get("audio_base64")?.jsonPrimitive?.contentOrNull,
                            text = obj["text"]?.jsonPrimitive?.contentOrNull
                                ?: obj["content"]?.jsonPrimitive?.contentOrNull ?: "",
                            durationMs = metadata?.get("duration")?.jsonPrimitive?.longOrNull
                                ?: obj["duration_ms"]?.jsonPrimitive?.longOrNull ?: 0,
                            messageId = audioMessageId  // For on-demand audio loading
                        )
                    }
                    else -> null
                }

                if (block != null) {
                    parsedBlocks.add(block)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse content block", e)
            }
        }

        // Merge tool blocks that have the same tool_use_id
        return mergeToolBlocks(parsedBlocks)
    }

    /**
     * Parses text content and extracts markdown code blocks.
     */
    private fun parseTextWithCodeBlocks(content: String): List<MessageContentBlock> {
        val blocks = mutableListOf<MessageContentBlock>()

        // Pattern for fenced code blocks: ```language\ncode\n```
        val codeBlockPattern = Regex("```([a-zA-Z0-9]*)?\\n([\\s\\S]*?)```")
        val matches = codeBlockPattern.findAll(content).toList()

        if (matches.isEmpty()) {
            // No code blocks, return as plain text
            val trimmed = content.trim()
            if (trimmed.isNotEmpty()) {
                blocks.add(MessageContentBlock.Text(UUID.randomUUID().toString(), content))
            }
            return blocks
        }

        var lastEnd = 0

        for (match in matches) {
            // Text before this code block
            if (match.range.first > lastEnd) {
                val textBefore = content.substring(lastEnd, match.range.first).trim()
                if (textBefore.isNotEmpty()) {
                    blocks.add(MessageContentBlock.Text(UUID.randomUUID().toString(), textBefore))
                }
            }

            // Extract language and code
            val language = match.groupValues.getOrNull(1)?.ifEmpty { null }
            val code = match.groupValues.getOrNull(2) ?: ""

            blocks.add(MessageContentBlock.Code(UUID.randomUUID().toString(), language, code))

            lastEnd = match.range.last + 1
        }

        // Text after last code block
        if (lastEnd < content.length) {
            val textAfter = content.substring(lastEnd).trim()
            if (textAfter.isNotEmpty()) {
                blocks.add(MessageContentBlock.Text(UUID.randomUUID().toString(), textAfter))
            }
        }

        return blocks
    }

    /**
     * Merges tool blocks that have the same tool_use_id.
     * When a tool_use event comes first (with input), and tool_result comes later (with output),
     * they should be displayed as a single unified block.
     */
    private fun mergeToolBlocks(blocks: List<MessageContentBlock>): List<MessageContentBlock> {
        val result = mutableListOf<MessageContentBlock>()
        val toolBlocksByUseId = mutableMapOf<String, Int>() // Maps tool_use_id to index in result

        for (block in blocks) {
            if (block is MessageContentBlock.ToolCall) {
                val useId = block.toolUseId
                // If we have a tool_use_id, try to merge with existing block
                if (!useId.isNullOrEmpty()) {
                    val existingIndex = toolBlocksByUseId[useId]
                    if (existingIndex != null) {
                        // Found existing block with same tool_use_id - merge them
                        val existing = result[existingIndex] as MessageContentBlock.ToolCall
                        // Merge: prefer non-null values, use latest status if output is present
                        val mergedName = if (block.name != "unknown" && block.name != "tool") block.name else existing.name
                        val mergedInput = block.input ?: existing.input
                        val mergedOutput = block.output ?: existing.output
                        // If we have output now, use the current status (completed/failed)
                        // Otherwise keep existing status
                        val mergedStatus = if (block.output != null) block.status else existing.status

                        result[existingIndex] = MessageContentBlock.ToolCall(
                            id = existing.id,
                            toolUseId = useId,
                            name = mergedName,
                            input = mergedInput,
                            output = mergedOutput,
                            status = mergedStatus
                        )
                    } else {
                        // First occurrence of this tool_use_id
                        toolBlocksByUseId[useId] = result.size
                        result.add(block)
                    }
                } else {
                    // No tool_use_id, just append
                    result.add(block)
                }
            } else {
                result.add(block)
            }
        }

        return result
    }

    /**
     * Updates a mutable list of content blocks with new blocks.
     * This operates on a list instead of mutating Message directly, to support immutable updates.
     */
    private fun updateMessageBlocksList(blocks: MutableList<MessageContentBlock>, newBlocks: List<MessageContentBlock>) {
        // For text blocks: replace last text block
        val newTextBlock = newBlocks.filterIsInstance<MessageContentBlock.Text>().lastOrNull()
        if (newTextBlock != null) {
            val lastTextIndex = blocks.indexOfLast { it is MessageContentBlock.Text }
            if (lastTextIndex >= 0) {
                blocks[lastTextIndex] = newTextBlock
            } else {
                blocks.add(newTextBlock)
            }
        }

        // For tool calls: match by tool_use_id and update, or add new
        newBlocks.filterIsInstance<MessageContentBlock.ToolCall>().forEach { newTool ->
            val existingIndex = blocks.indexOfFirst {
                it is MessageContentBlock.ToolCall && it.toolUseId == newTool.toolUseId
            }
            if (existingIndex >= 0) {
                blocks[existingIndex] = newTool
            } else {
                blocks.add(newTool)
            }
        }

        // Add other block types
        newBlocks.filter {
            it !is MessageContentBlock.Text && it !is MessageContentBlock.ToolCall
        }.forEach { block ->
            if (blocks.none { it.id == block.id }) {
                blocks.add(block)
            }
        }
    }

    /**
     * Updates streaming text in a mutable list of content blocks.
     */
    private fun updateStreamingTextInList(blocks: MutableList<MessageContentBlock>, text: String) {
        val lastTextIndex = blocks.indexOfLast { it is MessageContentBlock.Text }
        if (lastTextIndex >= 0) {
            val existingBlock = blocks[lastTextIndex] as MessageContentBlock.Text
            blocks[lastTextIndex] = existingBlock.copy(text = text)
        } else {
            blocks.add(MessageContentBlock.Text(UUID.randomUUID().toString(), text))
        }
    }

    private fun addAgentMessage(sessionId: String, message: Message) {
        val existingMessages = _agentMessages.value[sessionId] ?: emptyList()

        // Prevent duplicate messages by ID
        if (existingMessages.any { it.id == message.id }) {
            Log.d(TAG, "Skipping duplicate message: ${message.id}")
            return
        }

        val messages = existingMessages + message
        // Create new map to trigger StateFlow emission
        _agentMessages.value = _agentMessages.value.toMutableMap().apply {
            put(sessionId, messages)
        }
    }
}

/**
 * Event for TTS audio playback.
 */
data class TtsAudioEvent(
    val messageId: String,
    val audio: String,
    val shouldAutoPlay: Boolean
)
