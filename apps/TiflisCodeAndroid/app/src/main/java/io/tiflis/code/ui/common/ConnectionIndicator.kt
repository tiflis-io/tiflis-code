/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.common

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import io.tiflis.code.domain.models.TunnelInfo
import io.tiflis.code.domain.models.WorkstationInfo
import io.tiflis.code.domain.models.ConnectionState
import io.tiflis.code.ui.theme.*

/**
 * Connection status indicator dot.
 * Shows different colors based on connection state:
 * - Green (StatusVerified): End-to-end connection verified via heartbeat
 * - Light Green (StatusConnected): Authenticated, verifying workstation
 * - Orange (StatusDegraded): Connected but heartbeat failing
 * - Yellow (pulsing): Connecting/Reconnecting
 * - Gray: Disconnected
 * - Red: Error
 */
@Composable
fun ConnectionIndicator(
    connectionState: ConnectionState,
    workstationOnline: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 8.dp
) {
    val color = when (connectionState) {
        is ConnectionState.Error -> StatusError
        is ConnectionState.Verified -> if (workstationOnline) StatusVerified else StatusDegraded
        is ConnectionState.Connected -> StatusConnected // Authenticated, verifying
        is ConnectionState.Degraded -> StatusDegraded
        is ConnectionState.Connecting, is ConnectionState.Reconnecting -> StatusConnecting
        is ConnectionState.Disconnected -> StatusDisconnected
    }

    // Pulse for intermediate states
    val shouldPulse = connectionState is ConnectionState.Connecting ||
            connectionState is ConnectionState.Reconnecting ||
            connectionState is ConnectionState.Connected // Authenticating

    val alpha by if (shouldPulse) {
        // Pulsing animation for connecting/authenticating states
        rememberInfiniteTransition(label = "pulse").animateFloat(
            initialValue = 0.3f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(800, easing = EaseInOut),
                repeatMode = RepeatMode.Reverse
            ),
            label = "pulseAlpha"
        )
    } else {
        // Static alpha
        rememberUpdatedState(1f)
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(color.copy(alpha = alpha))
    )
}

/**
 * Connection status indicator dot (legacy overload for backward compatibility).
 * @deprecated Use ConnectionIndicator(connectionState, workstationOnline) instead
 */
@Composable
fun ConnectionIndicator(
    isConnected: Boolean,
    isConnecting: Boolean,
    workstationOnline: Boolean,
    hasError: Boolean = false,
    modifier: Modifier = Modifier,
    size: Dp = 8.dp
) {
    val state = when {
        hasError -> ConnectionState.Error("Connection error")
        isConnected -> ConnectionState.Verified // Assume verified if connected
        isConnecting -> ConnectionState.Connecting
        else -> ConnectionState.Disconnected
    }

    ConnectionIndicator(
        connectionState = state,
        workstationOnline = workstationOnline,
        modifier = modifier,
        size = size
    )
}

/**
 * Connection status indicator with clickable popover showing detailed info.
 * Mirrors iOS ConnectionIndicator with popover.
 */
@Composable
fun ConnectionIndicatorWithPopover(
    connectionState: ConnectionState,
    workstationOnline: Boolean,
    workstationInfo: WorkstationInfo? = null,
    tunnelInfo: TunnelInfo? = null,
    modifier: Modifier = Modifier,
    size: Dp = 12.dp
) {
    var showPopover by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .clickable { showPopover = true }
                .padding(8.dp)
        ) {
            ConnectionIndicator(
                connectionState = connectionState,
                workstationOnline = workstationOnline,
                size = size
            )
        }

        if (showPopover) {
            Popup(
                onDismissRequest = { showPopover = false },
                properties = PopupProperties(focusable = true)
            ) {
                ConnectionPopoverContent(
                    connectionState = connectionState,
                    workstationOnline = workstationOnline,
                    workstationInfo = workstationInfo,
                    tunnelInfo = tunnelInfo,
                    onDismiss = { showPopover = false }
                )
            }
        }
    }
}

/**
 * Connection status indicator with clickable popover (legacy overload).
 * @deprecated Use ConnectionIndicatorWithPopover(connectionState, ...) instead
 */
@Composable
fun ConnectionIndicatorWithPopover(
    isConnected: Boolean,
    isConnecting: Boolean,
    workstationOnline: Boolean,
    hasError: Boolean = false,
    workstationInfo: WorkstationInfo? = null,
    tunnelInfo: TunnelInfo? = null,
    modifier: Modifier = Modifier,
    size: Dp = 12.dp
) {
    val state = when {
        hasError -> ConnectionState.Error("Connection error")
        isConnected -> ConnectionState.Verified
        isConnecting -> ConnectionState.Connecting
        else -> ConnectionState.Disconnected
    }

    ConnectionIndicatorWithPopover(
        connectionState = state,
        workstationOnline = workstationOnline,
        workstationInfo = workstationInfo,
        tunnelInfo = tunnelInfo,
        modifier = modifier,
        size = size
    )
}

@Composable
private fun ConnectionPopoverContent(
    connectionState: ConnectionState,
    workstationOnline: Boolean,
    workstationInfo: WorkstationInfo?,
    tunnelInfo: TunnelInfo?,
    onDismiss: () -> Unit
) {
    Surface(
        modifier = Modifier
            .padding(8.dp)
            .widthIn(min = 200.dp, max = 300.dp),
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 8.dp,
        shadowElevation = 4.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header with status
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ConnectionIndicator(
                    connectionState = connectionState,
                    workstationOnline = workstationOnline,
                    size = 12.dp
                )

                val statusText = when (connectionState) {
                    is ConnectionState.Error -> "Error: ${connectionState.message}"
                    is ConnectionState.Verified -> if (workstationOnline) "Connected" else "Workstation Offline"
                    is ConnectionState.Connected -> "Authenticating..."
                    is ConnectionState.Degraded -> "Connection Unstable"
                    is ConnectionState.Connecting -> "Connecting..."
                    is ConnectionState.Reconnecting -> "Reconnecting (${connectionState.attempt})..."
                    is ConnectionState.Disconnected -> "Disconnected"
                }

                Text(
                    text = statusText,
                    style = MaterialTheme.typography.titleSmall
                )
            }

            HorizontalDivider()

            // Workstation info
            if (workstationInfo != null) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Workstation",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )

                    workstationInfo.name?.let { name ->
                        InfoRow(label = "Name", value = name)
                    }
                    workstationInfo.version?.let { version ->
                        InfoRow(label = "Version", value = version)
                    }
                    workstationInfo.protocolVersion?.let { protocol ->
                        InfoRow(label = "Protocol", value = protocol)
                    }
                }
            }

            // Tunnel info
            if (tunnelInfo != null) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Tunnel",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )

                    tunnelInfo.url?.let { url ->
                        InfoRow(label = "URL", value = url)
                    }
                    tunnelInfo.id?.let { id ->
                        InfoRow(label = "ID", value = id.take(8) + "...")
                    }
                }
            }

            // Dismiss button
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.End)
            ) {
                Text("Close")
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 8.dp)
        )
    }
}

/**
 * Connection status indicator with label.
 */
@Composable
fun ConnectionIndicatorWithLabel(
    connectionState: ConnectionState,
    workstationOnline: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ConnectionIndicator(
            connectionState = connectionState,
            workstationOnline = workstationOnline
        )

        val statusText = when (connectionState) {
            is ConnectionState.Error -> "Error"
            is ConnectionState.Verified -> if (workstationOnline) "Connected" else "Workstation Offline"
            is ConnectionState.Connected -> "Authenticating..."
            is ConnectionState.Degraded -> "Connection Unstable"
            is ConnectionState.Connecting -> "Connecting..."
            is ConnectionState.Reconnecting -> "Reconnecting..."
            is ConnectionState.Disconnected -> "Disconnected"
        }

        Text(
            text = statusText,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Connection status indicator with label (legacy overload).
 * @deprecated Use ConnectionIndicatorWithLabel(connectionState, workstationOnline) instead
 */
@Composable
fun ConnectionIndicatorWithLabel(
    isConnected: Boolean,
    isConnecting: Boolean,
    workstationOnline: Boolean,
    hasError: Boolean = false,
    modifier: Modifier = Modifier
) {
    val state = when {
        hasError -> ConnectionState.Error("Connection error")
        isConnected -> ConnectionState.Verified
        isConnecting -> ConnectionState.Connecting
        else -> ConnectionState.Disconnected
    }

    ConnectionIndicatorWithLabel(
        connectionState = state,
        workstationOnline = workstationOnline,
        modifier = modifier
    )
}

@Composable
private fun <T> rememberUpdatedState(newValue: T): State<T> {
    return remember { mutableStateOf(newValue) }.also {
        it.value = newValue
    }
}
