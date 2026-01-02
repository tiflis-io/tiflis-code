/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.tiflis.code.R
import io.tiflis.code.data.audio.AudioPlayerService
import io.tiflis.code.domain.models.Message
import io.tiflis.code.domain.models.Session
import io.tiflis.code.domain.models.SessionType
import io.tiflis.code.ui.chat.components.MessageBubble
import io.tiflis.code.ui.chat.components.MessageSegmentBubble
import io.tiflis.code.ui.chat.components.MessageSplitter
import io.tiflis.code.ui.chat.components.PromptInputBar
import io.tiflis.code.ui.chat.components.TypingIndicatorBubble
import io.tiflis.code.ui.common.ConnectionIndicatorWithPopover
import io.tiflis.code.ui.state.AppState
import io.tiflis.code.ui.theme.accentColor
import kotlinx.coroutines.launch

/**
 * Chat screen for supervisor and agent sessions.
 * Mirrors the iOS ChatView with full feature parity.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    appState: AppState,
    sessionId: String,
    sessionType: SessionType,
    sessionName: String? = null,
    onMenuClick: () -> Unit,
    onSessionTerminated: (() -> Unit)? = null,
    chatViewModel: ChatViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val focusManager = LocalFocusManager.current

    // Collect state
    val connectionState by appState.connectionState.collectAsState()
    val workstationOnline by appState.workstationOnline.collectAsState()
    val workspacesRoot by appState.workspacesRoot.collectAsState()
    val workstationInfo by appState.workstationInfo.collectAsState()
    val tunnelInfo by appState.tunnelInfo.collectAsState()

    // Get messages based on session type
    // Use actual session ID to resolve any temp ID mapping
    val actualSessionId = appState.getActualSessionId(sessionId)
    val supervisorMessages by appState.supervisorMessages.collectAsState()
    val agentMessages by appState.agentMessages.collectAsState()
    val messages: List<Message> = if (sessionType == SessionType.SUPERVISOR) {
        supervisorMessages
    } else {
        agentMessages[actualSessionId] ?: emptyList()
    }

    // Loading states - true immediately after sending, before server responds
    val supervisorIsLoading by appState.supervisorIsLoading.collectAsState()
    val agentIsLoadingMap by appState.agentIsLoading.collectAsState()
    val isLoading = if (sessionType == SessionType.SUPERVISOR) {
        supervisorIsLoading
    } else {
        agentIsLoadingMap[actualSessionId] ?: false
    }

    // Scroll triggers - increment on any content update to force scroll to bottom
    val supervisorScrollTrigger by appState.supervisorScrollTrigger.collectAsState()
    val agentScrollTriggersMap by appState.agentScrollTriggers.collectAsState()
    val scrollTrigger = if (sessionType == SessionType.SUPERVISOR) {
        supervisorScrollTrigger
    } else {
        agentScrollTriggersMap[actualSessionId] ?: 0
    }

    // History loading state
    val historyLoadingMap by appState.historyLoading.collectAsState()
    val isHistoryLoading = if (sessionType == SessionType.SUPERVISOR) {
        historyLoadingMap[null] ?: false
    } else {
        historyLoadingMap[actualSessionId] ?: false
    }

    // Check if any message is streaming
    val messageIsStreaming = messages.any { it.isStreaming }

    // isGenerating = isLoading OR messageIsStreaming (matches iOS behavior exactly)
    // This ensures stop button appears immediately after sending
    val isStreaming = isLoading || messageIsStreaming

    // Menu state
    var showMenu by remember { mutableStateOf(false) }
    var showClearContextDialog by remember { mutableStateOf(false) }
    var showTerminateDialog by remember { mutableStateOf(false) }

    // Total items in the list: messages + typing indicator (if streaming)
    val totalItems = messages.size + if (isStreaming) 1 else 0

    // Track distance from bottom in pixels for FAB visibility
    // Show FAB when more than 100px from bottom
    val isAtBottom by remember {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val lastVisibleItem = layoutInfo.visibleItemsInfo.lastOrNull()
            if (lastVisibleItem == null || layoutInfo.totalItemsCount == 0) {
                true // Empty list = at bottom
            } else {
                val lastItemIndex = lastVisibleItem.index
                val lastItemOffset = lastVisibleItem.offset + lastVisibleItem.size
                val viewportEnd = layoutInfo.viewportEndOffset
                // At bottom if last item is visible and within 100px of viewport end
                lastItemIndex >= layoutInfo.totalItemsCount - 1 &&
                    (lastItemOffset - viewportEnd) <= 100
            }
        }
    }

    // Scroll to bottom on initial load
    LaunchedEffect(sessionId) {
        // Wait for layout to have items, then scroll to last
        val itemCount = listState.layoutInfo.totalItemsCount
        if (itemCount > 0) {
            listState.scrollToItem(itemCount - 1)
        }
    }

    // Auto-scroll to bottom on any content update (mirrors iOS scrollTrigger behavior)
    // scrollTrigger increments whenever content changes in AppState handlers
    // Force scroll without checking isAtBottom - same as iOS forceScrollToBottom()
    LaunchedEffect(scrollTrigger) {
        if (scrollTrigger > 0) {
            // Small delay to allow Compose to layout new items before scrolling
            kotlinx.coroutines.delay(50)
            // Use actual item count from layoutInfo (accounts for split segments)
            val itemCount = listState.layoutInfo.totalItemsCount
            if (itemCount > 0) {
                listState.scrollToItem(itemCount - 1)
            }
        }
    }

    // Subscribe to agent session and request history (Protocol v1.13)
    LaunchedEffect(sessionId, sessionType) {
        if (sessionType != SessionType.SUPERVISOR) {
            // Subscribe to session for real-time updates
            appState.refreshSession(sessionId)
            // Request history for this session (Protocol v1.13 lazy loading)
            appState.requestHistory(sessionId)
        }
        // Note: Supervisor history is requested automatically in handleSyncState
    }

    // Note: TTS auto-play is now handled directly in AppState voice output handlers
    // (more reliable than SharedFlow for immediate playback)

    // Copy to clipboard helper
    val copyToClipboard: (String) -> Unit = { text ->
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("code", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
    }

    // Audio player state
    val loadingMessageIds by appState.audioPlayerService.loadingMessageIds.collectAsState()
    val currentPlayingMessageId by appState.audioPlayerService.currentMessageId.collectAsState()
    val isPlaying by appState.audioPlayerService.isPlaying.collectAsState()

    // Play/stop audio by messageId - toggles playback, always restarts from beginning
    val playAudioForMessage: (String) -> Unit = { messageId ->
        if (currentPlayingMessageId == messageId && isPlaying) {
            // Same message is playing - stop it
            appState.audioPlayerService.stop()
        } else {
            // Play from beginning (different message, stopped, or nothing playing)
            appState.audioPlayerService.playAudioForMessage(messageId)
        }
    }

    // Check if audio is loading for a messageId
    val isAudioLoading: (String) -> Boolean = { messageId ->
        loadingMessageIds.contains(messageId)
    }

    // Check if audio is playing for a messageId
    val isAudioPlaying: (String) -> Boolean = { messageId ->
        isPlaying && currentPlayingMessageId == messageId
    }

    // Get current session for icon display
    val sessions by appState.sessions.collectAsState()
    val currentSession = sessions.find { it.id == sessionId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    // Title and subtitle (no icon - icons are now on message bubbles like iOS)
                    Column {
                        Text(
                            text = sessionName ?: sessionType.displayName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (sessionType != SessionType.SUPERVISOR) {
                            val subtitle = currentSession?.subtitle(workspacesRoot)
                            if (subtitle != null) {
                                Text(
                                    text = subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onMenuClick) {
                        Icon(Icons.Default.Menu, contentDescription = "Menu")
                    }
                },
                actions = {
                    ConnectionIndicatorWithPopover(
                        isConnected = connectionState.isConnected,
                        isConnecting = connectionState.isConnecting,
                        workstationOnline = workstationOnline,
                        workstationInfo = workstationInfo,
                        tunnelInfo = tunnelInfo
                    )

                    // Menu button - always show for supervisor and agent sessions
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        if (sessionType == SessionType.SUPERVISOR) {
                            // Supervisor: Clear context option
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.clear_context)) },
                                onClick = {
                                    showMenu = false
                                    showClearContextDialog = true
                                }
                            )
                        } else if (sessionType.isAgent) {
                            // Agent sessions: Terminate session option
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.session_terminate)) },
                                onClick = {
                                    showMenu = false
                                    showTerminateDialog = true
                                }
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        contentWindowInsets = WindowInsets.ime
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Message list
            if (messages.isEmpty() && isHistoryLoading) {
                // Loading history state
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (messages.isEmpty()) {
                // Empty state with session icon and info (mirrors iOS ChatEmptyState)
                ChatEmptyState(
                    session = currentSession ?: Session.SUPERVISOR,
                    sessionType = sessionType,
                    workspacesRoot = workspacesRoot,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .pointerInput(Unit) {
                            detectTapGestures(onTap = { focusManager.clearFocus() })
                        }
                )
            } else {
                // Wrap LazyColumn in Box to allow FAB to float over it
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .fillMaxSize(),
                            // Note: Removed keyboard dismissal gesture to not interfere with message bubble long press
                        contentPadding = PaddingValues(
                            start = 16.dp,
                            end = 16.dp,
                            top = 8.dp,
                            bottom = 8.dp
                        ),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Filter out empty messages - only show messages with actual content
                        val visibleMessages = messages.filter { msg ->
                            msg.contentBlocks.isNotEmpty() && msg.contentBlocks.any { block ->
                                when (block) {
                                    is io.tiflis.code.domain.models.MessageContentBlock.Text -> block.text.isNotBlank()
                                    is io.tiflis.code.domain.models.MessageContentBlock.Code -> block.code.isNotBlank()
                                    is io.tiflis.code.domain.models.MessageContentBlock.VoiceOutput -> true
                                    is io.tiflis.code.domain.models.MessageContentBlock.VoiceInput -> true
                                    is io.tiflis.code.domain.models.MessageContentBlock.Thinking -> block.text.isNotBlank()
                                    is io.tiflis.code.domain.models.MessageContentBlock.ToolCall -> true
                                    is io.tiflis.code.domain.models.MessageContentBlock.Status -> block.text.isNotBlank()
                                    is io.tiflis.code.domain.models.MessageContentBlock.Error -> block.text.isNotBlank()
                                    is io.tiflis.code.domain.models.MessageContentBlock.ActionButtons -> block.buttons.isNotEmpty()
                                }
                            }
                        }

                        // Split messages into display segments for long responses
                        val displaySegments = visibleMessages.flatMap { message ->
                            MessageSplitter.split(message)
                        }

                        items(
                            items = displaySegments,
                            key = { it.id }
                        ) { segment ->
                            // Get original message for context menu (copy full content)
                            val originalMessage = visibleMessages.find { it.id == segment.messageId }

                            // Stable callback to prevent recomposition issues
                            val onResendCallback = remember<(String) -> Unit>(sessionId, sessionType) {
                                { text ->
                                    if (sessionType == SessionType.SUPERVISOR) {
                                        appState.sendSupervisorCommand(text = text)
                                    } else {
                                        appState.sendAgentCommand(sessionId, text = text)
                                    }
                                }
                            }

                            // Use reduced spacing for continuation segments
                            if (segment.isContinuation) {
                                Spacer(modifier = Modifier.height((-4).dp))
                            }

                            MessageSegmentBubble(
                                segment = segment,
                                originalMessage = originalMessage,
                                sessionType = sessionType,
                                onCopyCode = copyToClipboard,
                                onPlayAudioForMessage = playAudioForMessage,
                                isAudioLoading = isAudioLoading,
                                isAudioPlaying = isAudioPlaying,
                                onResend = onResendCallback
                            )
                        }

                        // Typing indicator bubble - shown as separate item when streaming
                        if (isStreaming) {
                            item(key = "typing_indicator") {
                                TypingIndicatorBubble(sessionType = sessionType)
                            }
                        }
                    }

                    // Scroll to bottom FAB - floating over chat area (like Telegram)
                    // Semi-transparent, subtle but visible
                    // Show when more than 100px from bottom
                    if (!isAtBottom && listState.layoutInfo.totalItemsCount > 0) {
                        SmallFloatingActionButton(
                            onClick = {
                                scope.launch {
                                    // Use actual item count from layoutInfo (accounts for split segments)
                                    val lastIndex = listState.layoutInfo.totalItemsCount - 1
                                    if (lastIndex >= 0) {
                                        listState.scrollToItem(lastIndex)
                                    }
                                }
                            },
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(end = 16.dp, bottom = 16.dp),
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                            contentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                            elevation = FloatingActionButtonDefaults.elevation(
                                defaultElevation = 2.dp,
                                pressedElevation = 4.dp
                            )
                        ) {
                            Icon(
                                Icons.Default.KeyboardArrowDown,
                                contentDescription = "Scroll to bottom"
                            )
                        }
                    }
                }
            }

            // Input bar
            PromptInputBar(
                onSendText = { text ->
                    focusManager.clearFocus() // Dismiss keyboard before scrolling
                    // Scroll to bottom using actual item count (accounts for split segments)
                    scope.launch {
                        val lastIndex = listState.layoutInfo.totalItemsCount - 1
                        if (lastIndex >= 0) listState.scrollToItem(lastIndex)
                    }
                    if (sessionType == SessionType.SUPERVISOR) {
                        appState.sendSupervisorCommand(text = text)
                    } else {
                        appState.sendAgentCommand(sessionId, text = text)
                    }
                },
                onSendAudio = { audioData ->
                    focusManager.clearFocus() // Dismiss keyboard before scrolling
                    // Scroll to bottom using actual item count (accounts for split segments)
                    scope.launch {
                        val lastIndex = listState.layoutInfo.totalItemsCount - 1
                        if (lastIndex >= 0) listState.scrollToItem(lastIndex)
                    }
                    if (sessionType == SessionType.SUPERVISOR) {
                        appState.sendSupervisorCommand(audio = audioData)
                    } else {
                        appState.sendAgentCommand(sessionId, audio = audioData)
                    }
                },
                onStopStreaming = {
                    if (sessionType == SessionType.SUPERVISOR) {
                        appState.cancelSupervisorOperation()
                    } else {
                        appState.cancelAgentOperation(sessionId)
                    }
                },
                isStreaming = isStreaming,
                isConnected = connectionState.isConnected && workstationOnline,
                accentColor = sessionType.accentColor()
            )
        }
    }

    // Clear context confirmation dialog
    if (showClearContextDialog) {
        AlertDialog(
            onDismissRequest = { showClearContextDialog = false },
            title = { Text(stringResource(R.string.clear_context)) },
            text = { Text(stringResource(R.string.clear_context_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showClearContextDialog = false
                        appState.clearSupervisorContext()
                    }
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearContextDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }

    // Terminate session confirmation dialog
    if (showTerminateDialog) {
        AlertDialog(
            onDismissRequest = { showTerminateDialog = false },
            title = { Text(stringResource(R.string.session_terminate)) },
            text = { Text(stringResource(R.string.session_terminate_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTerminateDialog = false
                        appState.terminateSession(sessionId)
                        onSessionTerminated?.invoke()
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showTerminateDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

/**
 * ViewModel for ChatScreen to handle audio playback.
 */
@dagger.hilt.android.lifecycle.HiltViewModel
class ChatViewModel @javax.inject.Inject constructor(
    private val audioPlayerService: AudioPlayerService
) : androidx.lifecycle.ViewModel() {

    val isPlaying = audioPlayerService.isPlaying
    val currentMessageId = audioPlayerService.currentMessageId
    val progress = audioPlayerService.progress

    fun playAudio(base64Audio: String, messageId: String? = null) {
        audioPlayerService.playAudio(base64Audio, messageId)
    }

    fun togglePlayPause() {
        audioPlayerService.togglePlayPause()
    }

    fun stopAudio() {
        audioPlayerService.stop()
    }
}

// MARK: - Empty State

/**
 * Empty state for chat screen with session icon and info.
 * Mirrors iOS ChatEmptyState.
 */
@Composable
private fun ChatEmptyState(
    session: Session,
    sessionType: SessionType,
    workspacesRoot: String?,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Spacer(modifier = Modifier.weight(1f))

        // Session icon (large)
        SessionIcon(
            sessionType = sessionType,
            modifier = Modifier.size(80.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Session name
        Text(
            text = session.displayName,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface
        )

        // Subtitle (workspace/project path)
        val subtitle = session.subtitle(workspacesRoot)
        if (subtitle != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Folder,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Invitation message
        Text(
            text = when (sessionType) {
                SessionType.SUPERVISOR -> stringResource(R.string.chat_empty_supervisor)
                SessionType.CURSOR, SessionType.CLAUDE, SessionType.OPENCODE -> stringResource(R.string.chat_empty_agent)
                SessionType.TERMINAL -> ""
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 40.dp)
        )

        Spacer(modifier = Modifier.weight(2f))
    }
}

/**
 * Session icon composable that uses custom logos for agents.
 * Mirrors iOS SessionIcon view.
 */
@Composable
private fun SessionIcon(
    sessionType: SessionType,
    modifier: Modifier = Modifier
) {
    val customLogo = sessionType.customLogoRes()

    if (customLogo != null) {
        // Custom logo image (Cursor, Claude, OpenCode, Supervisor)
        Box(
            modifier = modifier
                .clip(RoundedCornerShape(16.dp)),
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
                modifier = Modifier.size(40.dp),
                tint = MaterialTheme.colorScheme.surface
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
    SessionType.TERMINAL -> null
}
