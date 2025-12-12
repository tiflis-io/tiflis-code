/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import android.content.Intent
import android.widget.TextView
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.*
import androidx.compose.material3.ripple
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInteropFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import io.tiflis.code.R
import io.tiflis.code.domain.models.Message
import io.tiflis.code.domain.models.MessageContentBlock
import io.tiflis.code.domain.models.MessageRole
import io.tiflis.code.domain.models.SessionType
import io.tiflis.code.ui.theme.*
import io.tiflis.code.ui.theme.accentColor
import io.noties.markwon.Markwon

/**
 * A message bubble for displaying chat messages.
 * Mirrors the iOS MessageBubble view with full feature parity.
 * Supports long-press context menu for copy, resend, and share actions.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun MessageBubble(
    message: Message,
    sessionType: SessionType,
    onCopyCode: (String) -> Unit,
    onPlayAudioForMessage: ((String) -> Unit)? = null,
    isAudioLoading: (String) -> Boolean = { false },
    isAudioPlaying: (String) -> Boolean = { false },
    onResend: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val isUser = message.role == MessageRole.USER
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    var showContextMenu by remember { mutableStateOf(false) }
    var isResending by remember { mutableStateOf(false) }

    // Get full text content for copy/share (includes both Text and VoiceInput transcriptions)
    val textContent = remember(message) {
        message.contentBlocks.mapNotNull { block ->
            when (block) {
                is MessageContentBlock.Text -> block.text
                is MessageContentBlock.VoiceInput -> block.transcription
                else -> null
            }
        }.filter { it.isNotBlank() }.joinToString("\n")
    }

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
        // User messages: spacer on left
        if (isUser) {
            Spacer(modifier = Modifier.widthIn(min = 60.dp))
        } else {
            // Assistant messages: avatar on left (like iOS)
            AssistantAvatar(
                sessionType = sessionType,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
        }

        Box {
            val interactionSource = remember { MutableInteractionSource() }
            val scope = rememberCoroutineScope()
            var longPressJob by remember { mutableStateOf<Job?>(null) }
            var pressOffset by remember { mutableStateOf(Offset.Zero) }
            val longPressTimeoutMs = ViewConfiguration.getLongPressTimeout().toLong()

            Box(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (isUser) {
                            // iOS uses Color.accentColor.opacity(0.15) for user bubbles
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        } else {
                            // iOS uses Color(.systemGray6) for assistant bubbles
                            MaterialTheme.colorScheme.surfaceContainerHighest
                        }
                    )
                    .indication(interactionSource, ripple())
                    .pointerInteropFilter { event ->
                        when (event.action) {
                            MotionEvent.ACTION_DOWN -> {
                                pressOffset = Offset(event.x, event.y)
                                // Start ripple
                                scope.launch {
                                    interactionSource.emit(PressInteraction.Press(pressOffset))
                                }
                                // Start long press timer
                                longPressJob?.cancel()
                                longPressJob = scope.launch {
                                    delay(longPressTimeoutMs)
                                    showContextMenu = true
                                }
                                true // Consume to ensure we get all subsequent events
                            }
                            MotionEvent.ACTION_UP -> {
                                longPressJob?.cancel()
                                longPressJob = null
                                // End ripple
                                scope.launch {
                                    interactionSource.emit(
                                        PressInteraction.Release(PressInteraction.Press(pressOffset))
                                    )
                                }
                                true
                            }
                            MotionEvent.ACTION_CANCEL -> {
                                longPressJob?.cancel()
                                longPressJob = null
                                // Cancel ripple
                                scope.launch {
                                    interactionSource.emit(
                                        PressInteraction.Cancel(PressInteraction.Press(pressOffset))
                                    )
                                }
                                true
                            }
                            MotionEvent.ACTION_MOVE -> {
                                // Cancel if moved too far (touch slop)
                                val dx = event.x - pressOffset.x
                                val dy = event.y - pressOffset.y
                                val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
                                if (dx * dx + dy * dy > touchSlop * touchSlop) {
                                    longPressJob?.cancel()
                                    longPressJob = null
                                }
                                true
                            }
                            else -> false
                        }
                    }
                    .padding(12.dp)
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    message.contentBlocks.forEach { block ->
                        MessageContentBlockView(
                            block = block,
                            isUser = isUser,
                            onCopyCode = onCopyCode,
                            onPlayAudioForMessage = onPlayAudioForMessage,
                            isAudioLoading = isAudioLoading,
                            isAudioPlaying = isAudioPlaying
                        )
                    }
                    // Note: Streaming/thinking indicator is now shown as a separate
                    // TypingIndicatorBubble at the bottom of the chat list
                }
            }

            // Context menu dropdown
            DropdownMenu(
                expanded = showContextMenu,
                onDismissRequest = { showContextMenu = false },
                offset = DpOffset(0.dp, 0.dp)
            ) {
                // Copy option
                if (textContent.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text("Copy") },
                        leadingIcon = {
                            Icon(Icons.Default.ContentCopy, contentDescription = null)
                        },
                        onClick = {
                            clipboardManager.setText(AnnotatedString(textContent))
                            showContextMenu = false
                        }
                    )
                }

                // Resend option (only for user messages)
                if (isUser && textContent.isNotBlank() && onResend != null) {
                    DropdownMenuItem(
                        text = { Text("Resend") },
                        leadingIcon = {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                        },
                        onClick = {
                            // Guard against double-clicks
                            if (isResending) return@DropdownMenuItem
                            isResending = true
                            showContextMenu = false
                            onResend(textContent)
                        }
                    )
                }

                // Share option
                if (textContent.isNotBlank()) {
                    DropdownMenuItem(
                        text = { Text("Share") },
                        leadingIcon = {
                            Icon(Icons.Default.Share, contentDescription = null)
                        },
                        onClick = {
                            val sendIntent = Intent().apply {
                                action = Intent.ACTION_SEND
                                putExtra(Intent.EXTRA_TEXT, textContent)
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
 * Avatar for assistant messages using session-specific icon.
 * Mirrors iOS AssistantAvatar view.
 */
@Composable
fun AssistantAvatar(
    sessionType: SessionType,
    modifier: Modifier = Modifier
) {
    val customLogo = sessionType.customLogoRes()

    if (customLogo != null) {
        // Custom logo image (Cursor, Claude, OpenCode, Supervisor)
        Box(
            modifier = modifier.clip(RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = customLogo),
                contentDescription = sessionType.displayName,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
        }
    } else {
        // Fallback to Material Icon with colored background (Terminal)
        Box(
            modifier = modifier
                .clip(CircleShape)
                .background(sessionType.accentColor()),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Terminal,
                contentDescription = sessionType.displayName,
                modifier = Modifier.size(18.dp),
                tint = Color.White
            )
        }
    }
}

/**
 * Get custom logo drawable resource for session type.
 * Returns null for types that should use Material Icon fallback.
 */
private fun SessionType.customLogoRes(): Int? = when (this) {
    SessionType.SUPERVISOR -> R.drawable.ic_tiflis_logo
    SessionType.CURSOR -> R.drawable.ic_cursor_logo
    SessionType.CLAUDE -> R.drawable.ic_claude_logo
    SessionType.OPENCODE -> R.drawable.ic_opencode_logo
    SessionType.TERMINAL -> null // Use Material Icon
}

/**
 * Renders a single content block within a message.
 */
@Composable
fun MessageContentBlockView(
    block: MessageContentBlock,
    isUser: Boolean,
    onCopyCode: (String) -> Unit,
    onPlayAudioForMessage: ((String) -> Unit)? = null,
    isAudioLoading: (String) -> Boolean = { false },
    isAudioPlaying: (String) -> Boolean = { false }
) {
    // Both user and assistant bubbles now have light backgrounds, so use onSurface for text
    val textColor = MaterialTheme.colorScheme.onSurface

    when (block) {
        is MessageContentBlock.Text -> {
            MarkdownText(
                text = block.text,
                textColor = textColor
            )
        }

        is MessageContentBlock.Code -> {
            CodeBlockView(
                code = block.code,
                language = block.language,
                onCopy = { onCopyCode(block.code) }
            )
        }

        is MessageContentBlock.ToolCall -> {
            ToolCallView(
                name = block.name,
                input = block.input,
                output = block.output,
                status = block.status
            )
        }

        is MessageContentBlock.Thinking -> {
            ThinkingView(text = block.text)
        }

        is MessageContentBlock.Status -> {
            StatusView(text = block.text)
        }

        is MessageContentBlock.Error -> {
            ErrorView(text = block.text)
        }

        is MessageContentBlock.VoiceInput -> {
            VoiceInputView(
                transcription = block.transcription,
                durationMs = block.durationMs
            )
        }

        is MessageContentBlock.VoiceOutput -> {
            // Use messageId if present, otherwise fall back to block id
            val audioId = block.messageId ?: block.id
            VoiceOutputView(
                text = block.text,
                durationMs = block.durationMs,
                messageId = audioId,
                isLoading = isAudioLoading(audioId),
                isPlaying = isAudioPlaying(audioId),
                onPlay = {
                    onPlayAudioForMessage?.invoke(audioId)
                }
            )
        }

        is MessageContentBlock.ActionButtons -> {
            ActionButtonsView(
                buttons = block.buttons,
                onButtonClick = { button ->
                    // Handle button action
                    // In a real implementation, this would send an action to the server
                }
            )
        }
    }
}

/**
 * Markdown text renderer using Markwon library.
 * Supports basic markdown formatting: bold, italic, links, lists, etc.
 */
@Composable
fun MarkdownText(
    text: String,
    textColor: Color,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val markwon = remember { Markwon.create(context) }
    val textColorInt = textColor.toArgb()

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(textColorInt)
                textSize = 14f
                setLineSpacing(0f, 1.2f)
                // Don't consume touch events - let parent Compose handle long press for context menu
                isClickable = false
                isLongClickable = false
                isFocusable = false
                isFocusableInTouchMode = false
                // Explicitly pass through all touch events to parent
                setOnTouchListener { _, _ -> false }
            }
        },
        update = { textView ->
            textView.setTextColor(textColorInt)
            markwon.setMarkdown(textView, text)
        }
    )
}
