/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.websocket

import android.util.Log
import io.tiflis.code.domain.models.ConnectionState
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebSocket client for communication with the tunnel server.
 * Handles connection, authentication, heartbeat, and reconnection logic.
 *
 * Protocol flow:
 * 1. Connect to tunnel server
 * 2. Send "connect" message with tunnel_id, auth_key, device_id
 * 3. Wait for "connected" response
 * 4. Send "auth" message
 * 5. Wait for "auth.success" response
 * 6. Start heartbeat (ping/pong every 15s)
 */
@Singleton
class WebSocketClient @Inject constructor() {

    companion object {
        private const val TAG = "WebSocketClient"
        private const val PING_INTERVAL_MS = 15_000L
        private const val PONG_TIMEOUT_MS = 20_000L // Reduced from 30s for faster detection
        private const val HEALTH_CHECK_TIMEOUT_MS = 5_000L // Quick health check timeout
        private const val MAX_RECONNECT_DELAY_MS = 30_000L
        private const val INITIAL_RECONNECT_DELAY_MS = 1_000L
        private const val MAX_MESSAGE_SIZE = 50L * 1024 * 1024 // 50MB

        // Application-level heartbeat constants (end-to-end verification)
        private const val HEARTBEAT_INTERVAL_MS = 10_000L // 10 seconds
        private const val HEARTBEAT_TIMEOUT_MS = 5_000L   // 5 seconds
        private const val MAX_HEARTBEAT_FAILURES = 2       // Force reconnect after 2 failures
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val client = OkHttpClient.Builder()
        .pingInterval(PING_INTERVAL_MS, TimeUnit.MILLISECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // No read timeout for WebSocket
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var pingJob: Job? = null
    private var reconnectJob: Job? = null
    private var healthCheckJob: Job? = null

    // Application-level heartbeat state
    private var heartbeatJob: Job? = null
    private var heartbeatTimeoutJob: Job? = null
    private var pendingHeartbeatId: String? = null
    private var consecutiveHeartbeatFailures: Int = 0

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Connection state
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    // Incoming messages
    private val _messages = MutableSharedFlow<JsonObject>(
        replay = 0,
        extraBufferCapacity = 100
    )
    val messages: SharedFlow<JsonObject> = _messages.asSharedFlow()

    // Connection info
    private var currentCredentials: ConnectionCredentialsInternal? = null
    private var lastPongTime: Long = 0
    private var reconnectAttempt = 0

    private data class ConnectionCredentialsInternal(
        val url: String,
        val tunnelId: String,
        val authKey: String,
        val deviceId: String
    )

    /**
     * Connect to the WebSocket server.
     */
    suspend fun connect(
        url: String,
        tunnelId: String,
        authKey: String,
        deviceId: String
    ) {
        if (_connectionState.value.isConnecting || _connectionState.value.isConnected) {
            Log.d(TAG, "Already connected or connecting, skipping")
            return
        }

        currentCredentials = ConnectionCredentialsInternal(url, tunnelId, authKey, deviceId)
        reconnectAttempt = 0
        connectInternal()
    }

    private suspend fun connectInternal() {
        val credentials = currentCredentials ?: return
        _connectionState.value = ConnectionState.Connecting

        try {
            val wsUrl = normalizeWebSocketUrl(credentials.url)
            Log.d(TAG, "Connecting to WebSocket: $wsUrl")

            val request = Request.Builder()
                .url(wsUrl)
                .build()

            webSocket = client.newWebSocket(request, createWebSocketListener())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect", e)
            _connectionState.value = ConnectionState.Error(e.message ?: "Connection failed")
            scheduleReconnect()
        }
    }

    /**
     * Disconnect from the WebSocket server.
     */
    fun disconnect() {
        Log.d(TAG, "Disconnecting")
        cancelReconnect()
        stopPingLoop()
        stopAppHeartbeat()
        healthCheckJob?.cancel()
        healthCheckJob = null
        webSocket?.close(1000, "Client disconnected")
        webSocket = null
        currentCredentials = null
        _connectionState.value = ConnectionState.Disconnected
    }

    /**
     * Check connection health by sending an immediate ping and waiting for pong.
     * Call this after network changes or when app returns to foreground.
     * If pong is not received within HEALTH_CHECK_TIMEOUT_MS, triggers reconnection.
     */
    fun checkConnectionHealth() {
        // Skip if not connected or already checking/reconnecting
        if (!_connectionState.value.isConnected) {
            Log.d(TAG, "Health check skipped - not connected")
            // If we have credentials, schedule reconnect
            if (currentCredentials != null && reconnectJob?.isActive != true) {
                Log.d(TAG, "Has credentials - scheduling reconnect")
                scheduleReconnect()
            }
            return
        }

        if (_connectionState.value.isConnecting) {
            Log.d(TAG, "Health check skipped - connection in progress")
            return
        }

        if (healthCheckJob?.isActive == true) {
            Log.d(TAG, "Health check skipped - already in progress")
            return
        }

        val ws = webSocket
        if (ws == null) {
            Log.w(TAG, "Health check - no WebSocket, reconnecting")
            handleDeadConnection("Health check: no WebSocket")
            return
        }

        Log.d(TAG, "Starting health check ping")
        val healthCheckStartTime = System.currentTimeMillis()

        // Send immediate ping
        val pingMessage = buildJsonObject {
            put("type", "ping")
            put("timestamp", healthCheckStartTime)
        }
        ws.send(pingMessage.toString())

        // Start timeout for health check
        healthCheckJob = scope.launch {
            delay(HEALTH_CHECK_TIMEOUT_MS)

            // Check if we received pong during the timeout period
            val timeSinceLastPong = System.currentTimeMillis() - lastPongTime
            if (timeSinceLastPong > HEALTH_CHECK_TIMEOUT_MS) {
                Log.w(TAG, "Health check failed - no pong received in ${HEALTH_CHECK_TIMEOUT_MS}ms")
                handleDeadConnection("Health check timeout")
            } else {
                Log.d(TAG, "Health check passed - pong received")
            }
        }
    }

    /**
     * Handle a detected dead connection - close socket and trigger reconnect.
     */
    private fun handleDeadConnection(reason: String) {
        Log.w(TAG, "Dead connection detected: $reason")

        // Stop ping loop, heartbeat, and health check
        stopPingLoop()
        stopAppHeartbeat()
        healthCheckJob?.cancel()
        healthCheckJob = null

        // Close the socket
        webSocket?.close(1000, reason)
        webSocket = null

        // Update state and schedule reconnect
        if (currentCredentials != null) {
            _connectionState.value = ConnectionState.Reconnecting(reconnectAttempt + 1)
            scheduleReconnect()
        } else {
            _connectionState.value = ConnectionState.Disconnected
        }
    }

    /**
     * Send a message through the WebSocket.
     */
    fun sendMessage(message: JsonObject): Boolean {
        val ws = webSocket
        if (ws == null || !_connectionState.value.isConnected) {
            Log.w(TAG, "Cannot send message: not connected")
            return false
        }

        val text = message.toString()
        Log.d(TAG, "Sending message: ${text.take(200)}...")
        return ws.send(text)
    }

    /**
     * Send a message as a Map (convenience method).
     */
    fun sendMessage(message: Map<String, Any?>): Boolean {
        val jsonObject = buildJsonObject {
            message.forEach { (key, value) ->
                put(key, value.toJsonElement())
            }
        }
        return sendMessage(jsonObject)
    }

    private fun createWebSocketListener(): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket opened")
                lastPongTime = System.currentTimeMillis()

                // Send connect message
                val credentials = currentCredentials ?: return
                val connectMessage = buildJsonObject {
                    put("type", "connect")
                    putJsonObject("payload") {
                        put("tunnel_id", credentials.tunnelId)
                        put("auth_key", credentials.authKey)
                        put("device_id", credentials.deviceId)
                    }
                }
                webSocket.send(connectMessage.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: ${text.take(500)}...")
                lastPongTime = System.currentTimeMillis()

                try {
                    val jsonObject = json.parseToJsonElement(text).jsonObject
                    handleMessage(jsonObject)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse message", e)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code - $reason")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code - $reason")
                handleDisconnection()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                _connectionState.value = ConnectionState.Error(t.message ?: "Connection failed")
                handleDisconnection()
            }
        }
    }

    private fun handleMessage(message: JsonObject) {
        val type = message["type"]?.jsonPrimitive?.contentOrNull

        when (type) {
            "connected" -> {
                Log.d(TAG, "Received 'connected', sending auth")
                // Send auth message
                val credentials = currentCredentials ?: return
                val authMessage = buildJsonObject {
                    put("type", "auth")
                    putJsonObject("payload") {
                        put("auth_key", credentials.authKey)
                        put("device_id", credentials.deviceId)
                    }
                }
                webSocket?.send(authMessage.toString())
            }

            "auth.success" -> {
                Log.d(TAG, "Authentication successful")
                _connectionState.value = ConnectionState.Connected
                reconnectAttempt = 0
                consecutiveHeartbeatFailures = 0
                startPingLoop()
                startAppHeartbeat() // Start end-to-end heartbeat verification
                // Forward auth.success to listeners
                scope.launch { _messages.emit(message) }
            }

            "auth.error" -> {
                val payload = message["payload"]?.jsonObject
                val errorMessage = payload?.get("message")?.jsonPrimitive?.contentOrNull
                    ?: "Authentication failed"
                Log.e(TAG, "Authentication failed: $errorMessage")
                _connectionState.value = ConnectionState.Error(errorMessage, "AUTH_FAILED")
                disconnect()
            }

            "pong" -> {
                lastPongTime = System.currentTimeMillis()
                // Cancel health check job if it's active - we got a valid pong
                healthCheckJob?.cancel()
                healthCheckJob = null
                Log.d(TAG, "Received pong")
            }

            "heartbeat.ack" -> {
                handleHeartbeatAck(message)
            }

            else -> {
                // Forward all other messages to listeners
                scope.launch { _messages.emit(message) }
            }
        }
    }

    private fun startPingLoop() {
        stopPingLoop()
        pingJob = scope.launch {
            while (isActive) {
                delay(PING_INTERVAL_MS)

                // Check for pong timeout
                val timeSinceLastPong = System.currentTimeMillis() - lastPongTime
                if (timeSinceLastPong > PONG_TIMEOUT_MS) {
                    Log.w(TAG, "Pong timeout (${timeSinceLastPong}ms since last pong), reconnecting")
                    handleDeadConnection("Pong timeout")
                    break
                }

                // Send ping - protocol: { type: "ping", timestamp: number }
                val pingMessage = buildJsonObject {
                    put("type", "ping")
                    put("timestamp", System.currentTimeMillis())
                }
                webSocket?.send(pingMessage.toString())
                Log.d(TAG, "Sent ping")
            }
        }
    }

    private fun stopPingLoop() {
        pingJob?.cancel()
        pingJob = null
    }

    private fun handleDisconnection() {
        stopPingLoop()
        webSocket = null

        if (currentCredentials != null && _connectionState.value !is ConnectionState.Error) {
            scheduleReconnect()
        } else {
            _connectionState.value = ConnectionState.Disconnected
        }
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true) return

        reconnectAttempt++
        val delay = calculateReconnectDelay()
        Log.d(TAG, "Scheduling reconnect attempt $reconnectAttempt in ${delay}ms")

        _connectionState.value = ConnectionState.Reconnecting(reconnectAttempt)

        reconnectJob = scope.launch {
            delay(delay)
            if (isActive && currentCredentials != null) {
                connectInternal()
            }
        }
    }

    private fun cancelReconnect() {
        reconnectJob?.cancel()
        reconnectJob = null
    }

    private fun calculateReconnectDelay(): Long {
        // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
        val delay = INITIAL_RECONNECT_DELAY_MS * (1 shl minOf(reconnectAttempt - 1, 4))
        return minOf(delay, MAX_RECONNECT_DELAY_MS)
    }

    private fun normalizeWebSocketUrl(url: String): String {
        var normalized = url.trim()

        // Convert http(s) to ws(s)
        normalized = when {
            normalized.startsWith("https://") -> normalized.replace("https://", "wss://")
            normalized.startsWith("http://") -> normalized.replace("http://", "ws://")
            !normalized.startsWith("ws://") && !normalized.startsWith("wss://") -> "wss://$normalized"
            else -> normalized
        }

        // Ensure /ws path if not present
        if (!normalized.contains("/ws")) {
            normalized = if (normalized.endsWith("/")) "${normalized}ws" else "$normalized/ws"
        }

        return normalized
    }

    // MARK: - Application-Level Heartbeat (End-to-End Verification)

    /**
     * Start the application-level heartbeat loop.
     * Sends heartbeat messages to workstation (via tunnel) to verify end-to-end connectivity.
     */
    private fun startAppHeartbeat() {
        stopAppHeartbeat()
        Log.d(TAG, "Starting application-level heartbeat (interval: ${HEARTBEAT_INTERVAL_MS}ms)")

        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)

                // Only send heartbeat if connected/authenticated
                if (!_connectionState.value.isConnected) {
                    Log.d(TAG, "Heartbeat skipped - not connected")
                    break
                }

                sendHeartbeat()
            }
        }
    }

    /**
     * Stop the application-level heartbeat loop.
     */
    private fun stopAppHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        heartbeatTimeoutJob?.cancel()
        heartbeatTimeoutJob = null
        pendingHeartbeatId = null
    }

    /**
     * Send a heartbeat message and start timeout timer.
     */
    private fun sendHeartbeat() {
        val ws = webSocket ?: return

        val heartbeatId = java.util.UUID.randomUUID().toString()
        pendingHeartbeatId = heartbeatId

        val heartbeatMessage = buildJsonObject {
            put("type", "heartbeat")
            put("id", heartbeatId)
            put("timestamp", System.currentTimeMillis())
        }

        Log.d(TAG, "Sending heartbeat: $heartbeatId")
        ws.send(heartbeatMessage.toString())

        // Start timeout timer
        heartbeatTimeoutJob?.cancel()
        heartbeatTimeoutJob = scope.launch {
            delay(HEARTBEAT_TIMEOUT_MS)
            handleHeartbeatTimeout()
        }
    }

    /**
     * Handle heartbeat timeout - increment failure counter and maybe force reconnect.
     */
    private fun handleHeartbeatTimeout() {
        if (pendingHeartbeatId == null) return

        consecutiveHeartbeatFailures++
        Log.w(TAG, "Heartbeat timeout (failures: $consecutiveHeartbeatFailures/$MAX_HEARTBEAT_FAILURES)")

        pendingHeartbeatId = null

        if (consecutiveHeartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
            Log.e(TAG, "Max heartbeat failures reached - forcing reconnect")
            forceReconnect("Heartbeat timeout")
        } else {
            // Mark as degraded but keep trying
            _connectionState.value = ConnectionState.Degraded("Heartbeat timeout")
        }
    }

    /**
     * Handle successful heartbeat acknowledgment from workstation.
     */
    private fun handleHeartbeatAck(message: JsonObject) {
        val messageId = message["id"]?.jsonPrimitive?.contentOrNull

        // Check if this is a response to our pending heartbeat
        if (messageId == null || messageId != pendingHeartbeatId) {
            Log.d(TAG, "Ignoring heartbeat.ack with mismatched ID: $messageId vs $pendingHeartbeatId")
            return
        }

        val uptimeMs = message["workstation_uptime_ms"]?.jsonPrimitive?.intOrNull ?: 0
        Log.d(TAG, "Heartbeat acknowledged - workstation uptime: ${uptimeMs}ms")

        // Cancel timeout and reset failure counter
        heartbeatTimeoutJob?.cancel()
        heartbeatTimeoutJob = null
        pendingHeartbeatId = null
        consecutiveHeartbeatFailures = 0

        // Update state to verified
        _connectionState.value = ConnectionState.Verified
    }

    /**
     * Force a full reconnection after detecting stale connection.
     */
    private fun forceReconnect(reason: String) {
        Log.w(TAG, "Force reconnecting: $reason")

        // Stop all tasks
        stopPingLoop()
        stopAppHeartbeat()
        healthCheckJob?.cancel()
        healthCheckJob = null

        // Reset counters
        consecutiveHeartbeatFailures = 0
        reconnectAttempt = 0

        // Close socket with abnormal closure
        webSocket?.close(1001, reason)
        webSocket = null

        // Schedule reconnect
        if (currentCredentials != null) {
            _connectionState.value = ConnectionState.Reconnecting(1)
            scheduleReconnect()
        } else {
            _connectionState.value = ConnectionState.Disconnected
        }
    }

    /**
     * Extension to convert Any to JsonElement.
     */
    private fun Any?.toJsonElement(): JsonElement = when (this) {
        null -> JsonNull
        is String -> JsonPrimitive(this)
        is Number -> JsonPrimitive(this)
        is Boolean -> JsonPrimitive(this)
        is Map<*, *> -> buildJsonObject {
            this@toJsonElement.forEach { (k, v) ->
                put(k.toString(), v.toJsonElement())
            }
        }
        is List<*> -> buildJsonArray {
            this@toJsonElement.forEach { add(it.toJsonElement()) }
        }
        is JsonElement -> this
        else -> JsonPrimitive(this.toString())
    }
}
