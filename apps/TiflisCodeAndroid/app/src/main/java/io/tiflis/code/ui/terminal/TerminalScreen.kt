/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import io.tiflis.code.R
import io.tiflis.code.ui.common.ConnectionIndicator
import io.tiflis.code.ui.state.AppState

/**
 * Terminal state for the session.
 */
sealed class TerminalState {
    data object Disconnected : TerminalState()
    data object Subscribing : TerminalState()
    data object Replaying : TerminalState()
    data object Live : TerminalState()
    data class SessionLost(val reason: String?) : TerminalState()
}

/**
 * Terminal screen showing PTY session.
 * Mirrors the iOS TerminalView with full ANSI terminal emulation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(
    appState: AppState,
    sessionId: String,
    onMenuClick: () -> Unit,
    onSessionTerminated: (() -> Unit)? = null,
    viewModel: TerminalViewModel = hiltViewModel()
) {
    val connectionState by appState.connectionState.collectAsState()
    val workstationOnline by appState.workstationOnline.collectAsState()
    val workspacesRoot by appState.workspacesRoot.collectAsState()

    val session = appState.sessions.collectAsState().value.find { it.id == sessionId }
    val terminalState by viewModel.state.collectAsState()

    // Menu state
    var showMenu by remember { mutableStateOf(false) }
    var showTerminateDialog by remember { mutableStateOf(false) }

    // Subscribe to terminal session on mount
    LaunchedEffect(sessionId) {
        viewModel.subscribe(sessionId, appState)
    }

    // Cleanup on unmount
    DisposableEffect(sessionId) {
        onDispose {
            viewModel.unsubscribe(appState)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.session_terminal))
                        session?.subtitle(workspacesRoot)?.let { subtitle ->
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onMenuClick) {
                        Icon(Icons.Default.Menu, contentDescription = "Menu")
                    }
                },
                actions = {
                    ConnectionIndicator(
                        isConnected = connectionState.isConnected,
                        isConnecting = connectionState.isConnecting,
                        workstationOnline = workstationOnline
                    )

                    // Menu button with terminate option
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.session_terminate)) },
                            onClick = {
                                showMenu = false
                                showTerminateDialog = true
                            }
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF1E1E1E)
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFF1E1E1E))
        ) {
            when (val state = terminalState) {
                is TerminalState.SessionLost -> {
                    // Session lost state - show error with reconnect button
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.terminal_session_lost),
                                style = MaterialTheme.typography.titleLarge,
                                color = Color.White
                            )

                            state.reason?.let { reason ->
                                Text(
                                    text = reason,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color.White.copy(alpha = 0.7f)
                                )
                            }

                            Button(
                                onClick = { viewModel.subscribe(sessionId, appState) }
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(stringResource(R.string.terminal_reconnect))
                            }
                        }
                    }
                }

                else -> {
                    // Show terminal view immediately when WebSocket is connected
                    // Loading states are shown as overlay (like iOS)
                    if (connectionState.isConnected) {
                        val keyboardController = LocalSoftwareKeyboardController.current
                        val density = LocalDensity.current

                        // Calculate keyboard height only (exclude navigation bar)
                        val imeInsets = WindowInsets.ime
                        val imeBottom = imeInsets.getBottom(density)
                        val navigationInsets = WindowInsets.navigationBars
                        val navBottom = navigationInsets.getBottom(density)
                        // Only add padding for keyboard, not navigation bar
                        val keyboardPadding = with(density) {
                            (imeBottom - navBottom).coerceAtLeast(0).toDp()
                        }
                        // Check if keyboard is visible
                        val isKeyboardVisible = imeBottom > navBottom

                        // Use Box with toolbar at bottom, content fills rest
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(bottom = keyboardPadding)
                        ) {
                            // Terminal view fills all space (with toolbar space only when keyboard visible)
                            TerminalView(
                                terminalOutput = viewModel.terminalOutput,
                                onInput = { input ->
                                    viewModel.sendInput(input, appState)
                                },
                                onResize = { cols, rows ->
                                    viewModel.resize(cols, rows, appState)
                                },
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(bottom = if (isKeyboardVisible) 48.dp else 0.dp)
                            )

                            // Loading overlay on top of terminal (doesn't hide it)
                            if (state is TerminalState.Subscribing ||
                                state is TerminalState.Replaying ||
                                state is TerminalState.Disconnected) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(bottom = if (isKeyboardVisible) 48.dp else 0.dp)
                                        .background(Color.Black.copy(alpha = 0.7f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        CircularProgressIndicator(color = Color.White)
                                        Spacer(modifier = Modifier.height(16.dp))
                                        Text(
                                            text = when (state) {
                                                is TerminalState.Subscribing -> "Connecting to terminal..."
                                                is TerminalState.Replaying -> stringResource(R.string.terminal_loading)
                                                else -> "Loading..."
                                            },
                                            color = Color.White
                                        )
                                    }
                                }
                            }

                            // Terminal toolbar - only visible when keyboard is open
                            if (isKeyboardVisible) {
                                TerminalToolbar(
                                    onInput = { input ->
                                        viewModel.sendInput(input, appState)
                                    },
                                    onDismissKeyboard = {
                                        keyboardController?.hide()
                                    },
                                    modifier = Modifier.align(Alignment.BottomCenter)
                                )
                            }
                        }
                    } else {
                        // WebSocket not connected - show disconnected state
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = Color.White)
                        }
                    }
                }
            }
        }
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
