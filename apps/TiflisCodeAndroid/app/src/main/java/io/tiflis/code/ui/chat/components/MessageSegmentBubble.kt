/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import io.tiflis.code.domain.models.Message
import io.tiflis.code.domain.models.MessageContentBlock
import io.tiflis.code.domain.models.MessageRole
import io.tiflis.code.domain.models.MessageSendStatus
import io.tiflis.code.domain.models.SessionType
import kotlinx.coroutines.withTimeoutOrNull

/**
 * A message bubble for displaying a split segment.
 * Mirrors the iOS MessageSegmentBubble view with full feature parity.
 */
@Composable
fun MessageSegmentBubble(
    segment: SplitMessageSegment,
    originalMessage: Message?,
    sessionType: SessionType,
    onCopyCode: (String) -> Unit,
    onPlayAudioForMessage: ((String) -> Unit)? = null,
    isAudioLoading: (String) -> Boolean = { false },
    isAudioPlaying: (String) -> Boolean = { false },
    onResend: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val isUser = segment.role == MessageRole.USER
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    var showContextMenu by remember { mutableStateOf(false) }
    var isResending by remember { mutableStateOf(false) }

    // Get full text content for copy/share (from original message if available)
    val fullTextContent = remember(originalMessage, segment) {
        val message = originalMessage ?: return@remember getSegmentTextContent(segment)
        message.contentBlocks.mapNotNull { block ->
            when (block) {
                is MessageContentBlock.Text -> block.text
                is MessageContentBlock.VoiceInput -> block.transcription
                else -> null
            }
        }.filter { it.isNotBlank() }.joinToString("\n")
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            // Reduced top padding for continuation segments
            .padding(top = if (segment.isContinuation) 0.dp else 0.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
        // User messages: spacer on left
        if (isUser) {
            Spacer(modifier = Modifier.widthIn(min = 60.dp))
        } else {
            // Assistant messages: avatar on first segment only
            if (segment.showAvatar) {
                AssistantAvatar(
                    sessionType = sessionType,
                    modifier = Modifier.size(32.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
            } else {
                // Spacer to align with avatar width
                Spacer(modifier = Modifier.width(44.dp)) // 32dp avatar + 12dp spacing
            }
        }

        Box {
            val viewConfiguration = LocalViewConfiguration.current
            val longPressTimeoutMs = viewConfiguration.longPressTimeoutMillis

            Box(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (isUser) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        } else {
                            MaterialTheme.colorScheme.surfaceContainerHighest
                        }
                    )
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false)

                            val released = withTimeoutOrNull(longPressTimeoutMs) {
                                while (true) {
                                    val event = awaitPointerEvent(PointerEventPass.Final)
                                    if (event.changes.all { !it.pressed }) {
                                        break
                                    }
                                }
                            }

                            if (released == null) {
                                showContextMenu = true
                            }
                        }
                    }
                    .padding(12.dp)
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    segment.contentBlocks.forEach { block ->
                        MessageContentBlockView(
                            block = block,
                            isUser = isUser,
                            onCopyCode = onCopyCode,
                            onPlayAudioForMessage = onPlayAudioForMessage,
                            isAudioLoading = isAudioLoading,
                            isAudioPlaying = isAudioPlaying
                        )
                    }

                    // Show send status indicator for user messages (only on last segment)
                    if (isUser && !segment.isContinuation && originalMessage != null) {
                        val sendStatus = originalMessage.sendStatus
                        if (sendStatus != MessageSendStatus.NONE) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End
                            ) {
                                MessageSendStatusIndicator(sendStatus = sendStatus)
                            }
                        }
                    }
                }
            }

            // Context menu dropdown
            DropdownMenu(
                expanded = showContextMenu,
                onDismissRequest = { showContextMenu = false },
                offset = DpOffset(0.dp, 0.dp)
            ) {
                // Copy option - copies full original message
                if (fullTextContent.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text("Copy") },
                        leadingIcon = {
                            Icon(Icons.Default.ContentCopy, contentDescription = null)
                        },
                        onClick = {
                            clipboardManager.setText(AnnotatedString(fullTextContent))
                            showContextMenu = false
                        }
                    )
                }

                // Resend option (only for user messages)
                if (isUser && fullTextContent.isNotBlank() && onResend != null) {
                    DropdownMenuItem(
                        text = { Text("Resend") },
                        leadingIcon = {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                        },
                        onClick = {
                            if (isResending) return@DropdownMenuItem
                            isResending = true
                            showContextMenu = false
                            onResend(fullTextContent)
                        }
                    )
                }

                // Share option - shares full original message
                if (fullTextContent.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text("Share") },
                        leadingIcon = {
                            Icon(Icons.Default.Share, contentDescription = null)
                        },
                        onClick = {
                            val sendIntent = Intent().apply {
                                action = Intent.ACTION_SEND
                                putExtra(Intent.EXTRA_TEXT, fullTextContent)
                                type = "text/plain"
                            }
                            val shareIntent = Intent.createChooser(sendIntent, null)
                            context.startActivity(shareIntent)
                            showContextMenu = false
                        }
                    )
                }
            }
        }

        // Assistant messages: spacer on right
        if (!isUser) {
            Spacer(modifier = Modifier.widthIn(min = 60.dp))
        }
    }
}

/**
 * Get text content from a segment's blocks.
 */
private fun getSegmentTextContent(segment: SplitMessageSegment): String {
    return segment.contentBlocks.mapNotNull { block ->
        when (block) {
            is MessageContentBlock.Text -> block.text
            is MessageContentBlock.Code -> block.code
            else -> null
        }
    }.filter { it.isNotBlank() }.joinToString("\n\n")
}

/**
 * Indicator showing message send status (pending, sent, failed).
 * Mirrors iOS MessageSendStatusIndicator.
 */
@Composable
fun MessageSendStatusIndicator(
    sendStatus: MessageSendStatus,
    modifier: Modifier = Modifier
) {
    when (sendStatus) {
        MessageSendStatus.PENDING -> {
            // Clock icon for pending
            Text(
                text = "🕐",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = modifier
            )
        }
        MessageSendStatus.SENT -> {
            // Checkmark for sent
            Text(
                text = "✓",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.8f),
                modifier = modifier
            )
        }
        MessageSendStatus.FAILED -> {
            // Warning for failed
            Text(
                text = "⚠️",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = modifier
            )
        }
        MessageSendStatus.NONE -> {
            // No indicator
        }
    }
}
