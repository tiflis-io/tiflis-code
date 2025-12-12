/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

/**
 * Represents the WebSocket connection state.
 * Uses sealed class pattern for type-safe state handling.
 */
sealed class ConnectionState {
    /** Not connected to any server */
    data object Disconnected : ConnectionState()

    /** Currently attempting to connect */
    data object Connecting : ConnectionState()

    /** Connected and authenticated with workstation */
    data object Connected : ConnectionState()

    /** End-to-end connection verified via heartbeat */
    data object Verified : ConnectionState()

    /** Connection degraded - heartbeat failing */
    data class Degraded(val reason: String) : ConnectionState()

    /** Connection lost, attempting to reconnect */
    data class Reconnecting(val attempt: Int) : ConnectionState()

    /** Connection error occurred */
    data class Error(val message: String, val code: String? = null) : ConnectionState()

    /** Whether we have an active authenticated connection (Connected, Verified, or Degraded) */
    val isConnected: Boolean
        get() = this is Connected || this is Verified || this is Degraded

    /** Whether connection has been verified end-to-end */
    val isVerified: Boolean
        get() = this is Verified

    val isConnecting: Boolean
        get() = this is Connecting || this is Reconnecting

    val displayText: String
        get() = when (this) {
            is Disconnected -> "Disconnected"
            is Connecting -> "Connecting…"
            is Connected -> "Authenticating…"
            is Verified -> "Connected"
            is Degraded -> "Connection Unstable"
            is Reconnecting -> "Reconnecting (attempt $attempt)…"
            is Error -> "Error: $message"
        }
}

/**
 * Connection credentials for tunnel server.
 */
data class ConnectionCredentials(
    val tunnelUrl: String,
    val tunnelId: String,
    val authKey: String
)

/**
 * Workstation information received after authentication.
 */
data class WorkstationInfo(
    val name: String?,
    val version: String?,
    val protocolVersion: String?,
    val workspacesRoot: String?
)

/**
 * Tunnel server information.
 */
data class TunnelInfo(
    val url: String,
    val id: String,
    val version: String?,
    val protocolVersion: String?
)
