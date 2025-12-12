/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.tiflis.code.domain.models.ActionButton
import io.tiflis.code.domain.models.ActionButtonStyle
import io.tiflis.code.ui.theme.*

/**
 * Thinking block view (collapsible).
 * Mirrors iOS ThinkingView.
 */
@Composable
fun ThinkingView(
    text: String,
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(false) }

    // iOS uses Color(.systemGray6) background with .secondary text
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .clickable { isExpanded = !isExpanded }
            .animateContentSize()
            .padding(12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Default.Psychology,
                contentDescription = "Thinking",
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "Thinking...",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            Icon(
                if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (isExpanded) "Collapse" else "Expand",
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (isExpanded) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Status message view.
 */
@Composable
fun StatusView(
    text: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(12.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Error message view.
 */
@Composable
fun ErrorView(
    text: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(StatusError.copy(alpha = 0.1f))
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            Icons.Default.Error,
            contentDescription = "Error",
            modifier = Modifier.size(16.dp),
            tint = StatusError
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = StatusError
        )
    }
}

/**
 * Voice input block view with transcription status.
 * Mirrors iOS VoiceInputView.
 */
@Composable
fun VoiceInputView(
    transcription: String?,
    durationMs: Long,
    modifier: Modifier = Modifier
) {
    // iOS uses Color.accentColor.opacity(0.1) background
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            Icons.Default.GraphicEq,  // waveform icon
            contentDescription = "Voice input",
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Column(modifier = Modifier.weight(1f)) {
            if (transcription != null) {
                Text(
                    text = transcription,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "Transcribing...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (durationMs > 0) {
                Text(
                    text = formatDuration(durationMs),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Voice output block view with playback controls.
 * Mirrors iOS VoiceOutputView.
 * Uses messageId to request audio on-demand from server.
 */
@Composable
fun VoiceOutputView(
    text: String,
    durationMs: Long,
    messageId: String?,
    isLoading: Boolean = false,
    isPlaying: Boolean = false,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier
) {
    // iOS uses Color.secondary.opacity(0.1) background
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Play/Pause button or loading indicator
        if (isLoading) {
            Box(
                modifier = Modifier.size(32.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        } else {
            IconButton(
                onClick = onPlay,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    if (isPlaying) Icons.Default.PauseCircle else Icons.Default.PlayCircle,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        // Waveform icon
        Icon(
            Icons.Default.GraphicEq,
            contentDescription = "Voice output",
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )

        // Duration
        if (durationMs > 0) {
            Text(
                text = formatDuration(durationMs),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.weight(1f))
    }
}

/**
 * Action buttons view with full click support.
 * Mirrors iOS ActionButtonsView.
 */
@Composable
fun ActionButtonsView(
    buttons: List<ActionButton>,
    onButtonClick: ((ActionButton) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        buttons.forEach { button ->
            val containerColor = when (button.style) {
                ActionButtonStyle.PRIMARY -> MaterialTheme.colorScheme.primary
                ActionButtonStyle.SECONDARY -> MaterialTheme.colorScheme.surfaceVariant
                ActionButtonStyle.DESTRUCTIVE -> StatusError
            }

            val contentColor = when (button.style) {
                ActionButtonStyle.PRIMARY -> MaterialTheme.colorScheme.onPrimary
                ActionButtonStyle.SECONDARY -> MaterialTheme.colorScheme.onSurfaceVariant
                ActionButtonStyle.DESTRUCTIVE -> Color.White
            }

            Button(
                onClick = { onButtonClick?.invoke(button) },
                colors = ButtonDefaults.buttonColors(
                    containerColor = containerColor,
                    contentColor = contentColor
                ),
                modifier = Modifier.weight(1f)
            ) {
                Text(button.title)
            }
        }
    }
}

/**
 * Recording indicator with pulsing animation.
 * Mirrors iOS recording animation in PromptInputBar.
 */
@Composable
fun RecordingIndicator(
    isRecording: Boolean,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "recording")

    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    if (isRecording) {
        Box(
            modifier = modifier
                .size(48.dp)
                .scale(scale),
            contentAlignment = Alignment.Center
        ) {
            // Outer ring
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(StatusError.copy(alpha = alpha * 0.3f))
            )
            // Inner circle
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(StatusError)
            )
            // Mic icon
            Icon(
                Icons.Default.Mic,
                contentDescription = "Recording",
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * Typing indicator for streaming messages (inline version).
 */
@Composable
fun TypingIndicator(
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "typing")

    Row(
        modifier = modifier.padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        repeat(3) { index ->
            val delay = index * 150
            val alpha by infiniteTransition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = delay),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "dot$index"
            )

            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = alpha))
            )
        }
    }
}

/**
 * Typing indicator bubble - a separate bubble showing the assistant is thinking.
 * Mirrors iOS TypingIndicator with avatar and animated dots.
 */
@Composable
fun TypingIndicatorBubble(
    sessionType: io.tiflis.code.domain.models.SessionType,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "typing_bubble")

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
        // Avatar on left (like iOS)
        AssistantAvatar(
            sessionType = sessionType,
            modifier = Modifier.size(32.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))

        // Animated dots in a bubble (matching iOS systemGray6 background)
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(3) { index ->
                val delay = index * 150
                val scale by infiniteTransition.animateFloat(
                    initialValue = 0.6f,
                    targetValue = 1f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(500, delayMillis = delay, easing = FastOutSlowInEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "dot_scale_$index"
                )

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .scale(scale)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onSurfaceVariant)
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f).widthIn(min = 60.dp))
    }
}

private fun formatDuration(durationMs: Long): String {
    val seconds = durationMs / 1000
    val minutes = seconds / 60
    val remainingSeconds = seconds % 60

    return if (minutes > 0) {
        "${minutes}:${remainingSeconds.toString().padStart(2, '0')}"
    } else {
        "${remainingSeconds}s"
    }
}
