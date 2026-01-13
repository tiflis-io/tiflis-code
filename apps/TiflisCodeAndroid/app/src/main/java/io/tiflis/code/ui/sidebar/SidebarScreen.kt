/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.sidebar

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.tiflis.code.R
import io.tiflis.code.domain.models.AgentConfig
import io.tiflis.code.domain.models.Session
import io.tiflis.code.domain.models.SessionType
import io.tiflis.code.ui.navigation.Screen
import io.tiflis.code.ui.state.AppState
import io.tiflis.code.ui.theme.accentColor

/**
 * Sidebar screen showing sessions and navigation.
 * Mirrors the iOS SidebarView.
 */
@Composable
fun SidebarScreen(
    appState: AppState,
    currentRoute: String?,
    onSessionSelected: (String, SessionType) -> Unit,
    onSettingsClick: () -> Unit
) {
    val sessions by appState.sessions.collectAsState()
    val workspacesRoot by appState.workspacesRoot.collectAsState()
    val connectionState by appState.connectionState.collectAsState()
    val isDemoMode by appState.isDemoMode.collectAsState()

    // Group sessions by type and sort by creation time (ascending - oldest first)
    val agentSessions = sessions.filter { it.type.isAgent }.sortedBy { it.createdAt }
    val backlogSessions = sessions.filter { it.type == SessionType.BACKLOG_AGENT }.sortedBy { it.createdAt }
    val terminalSessions = sessions.filter { it.type == SessionType.TERMINAL }.sortedBy { it.createdAt }

    // Dialog states
    var showCreateSessionDialog by remember { mutableStateOf(false) }
    var sessionToTerminate by remember { mutableStateOf<Session?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        // Header
        Surface(
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge
                )

                IconButton(onClick = { showCreateSessionDialog = true }) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = stringResource(R.string.session_create)
                    )
                }
            }
        }

        // Session list
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            // Supervisor (always shown)
            item(key = "supervisor") {
                SessionItem(
                    title = stringResource(R.string.session_supervisor),
                    subtitle = null,
                    sessionType = SessionType.SUPERVISOR,
                    isSelected = currentRoute == Screen.Supervisor.route,
                    onClick = { onSessionSelected("supervisor", SessionType.SUPERVISOR) }
                )
            }

            // Backlog Sessions
            if (backlogSessions.isNotEmpty()) {
                item(key = "backlogs-header") {
                    SectionHeader(title = "Backlog Directions")
                }

                items(
                    items = backlogSessions,
                    key = { it.id }
                ) { session ->
                    SwipeableSessionItem(
                        session = session,
                        workspacesRoot = workspacesRoot,
                        isSelected = currentRoute == Screen.agentRoute(session.id),
                        onClick = { onSessionSelected(session.id, session.type) },
                        onDelete = { sessionToTerminate = session }
                    )
                }
            }

            // Agent Sessions
            if (agentSessions.isNotEmpty()) {
                item(key = "agents-header") {
                    SectionHeader(title = "Agent Sessions")
                }

                items(
                    items = agentSessions,
                    key = { it.id }
                ) { session ->
                    SwipeableSessionItem(
                        session = session,
                        workspacesRoot = workspacesRoot,
                        isSelected = currentRoute == Screen.agentRoute(session.id),
                        onClick = { onSessionSelected(session.id, session.type) },
                        onDelete = { sessionToTerminate = session }
                    )
                }
            }

            // Terminal Sessions
            if (terminalSessions.isNotEmpty()) {
                item(key = "terminals-header") {
                    SectionHeader(title = "Terminals")
                }

                items(
                    items = terminalSessions,
                    key = { it.id }
                ) { session ->
                    SwipeableSessionItem(
                        session = session,
                        workspacesRoot = workspacesRoot,
                        isSelected = currentRoute == Screen.terminalRoute(session.id),
                        onClick = { onSessionSelected(session.id, session.type) },
                        onDelete = { sessionToTerminate = session }
                    )
                }
            }
        }

        // Settings button
        HorizontalDivider()
        ListItem(
            headlineContent = { Text(stringResource(R.string.settings_title)) },
            leadingContent = {
                Icon(Icons.Default.Settings, contentDescription = null)
            },
            modifier = Modifier.clickable { onSettingsClick() }
        )

        // Exit Demo Mode button (only in demo mode)
        if (isDemoMode) {
            ListItem(
                headlineContent = {
                    Text(
                        text = "Exit Demo Mode",
                        color = MaterialTheme.colorScheme.error
                    )
                },
                leadingContent = {
                    Icon(
                        Icons.AutoMirrored.Default.ExitToApp,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error
                    )
                },
                modifier = Modifier.clickable { appState.exitDemoMode() }
            )
        }
    }

    // Create session dialog
    if (showCreateSessionDialog) {
        CreateSessionDialog(
            appState = appState,
            onDismiss = { showCreateSessionDialog = false },
            onCreate = { type, agentName, workspace, project, worktree ->
                appState.createSession(type, agentName, workspace, project, worktree)
                showCreateSessionDialog = false
            }
        )
    }

    // Terminate session confirmation
    sessionToTerminate?.let { session ->
        AlertDialog(
            onDismissRequest = { sessionToTerminate = null },
            title = { Text(stringResource(R.string.session_terminate)) },
            text = { Text(stringResource(R.string.session_terminate_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        appState.terminateSession(session.id)
                        sessionToTerminate = null
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { sessionToTerminate = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

@Composable
private fun SessionItem(
    title: String,
    subtitle: String?,
    sessionType: SessionType,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = {
            Text(
                text = title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = subtitle?.let {
            {
                Text(
                    text = it,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        leadingContent = {
            SessionIcon(
                sessionType = sessionType,
                modifier = Modifier.size(36.dp)
            )
        },
        trailingContent = if (isSelected) {
            {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = sessionType.accentColor()
                )
            }
        } else null,
        modifier = Modifier
            .clickable(onClick = onClick)
            .then(
                if (isSelected) {
                    Modifier.background(
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                    )
                } else Modifier
            )
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeableSessionItem(
    session: Session,
    workspacesRoot: String?,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { dismissValue ->
            if (dismissValue == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                false // Don't dismiss, wait for confirmation
            } else {
                false
            }
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.errorContainer)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        },
        enableDismissFromStartToEnd = false
    ) {
        Surface {
            SessionItem(
                title = session.displayName,
                subtitle = session.subtitle(workspacesRoot),
                sessionType = session.type,
                isSelected = isSelected,
                onClick = onClick
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateSessionDialog(
    appState: AppState,
    onDismiss: () -> Unit,
    onCreate: (SessionType, String?, String?, String?, String?) -> Unit
) {
    val availableAgents by appState.availableAgents.collectAsState()
    val hiddenBaseTypes by appState.hiddenBaseTypes.collectAsState()
    val workspaces by appState.workspaces.collectAsState()

    var selectedType by remember { mutableStateOf<SessionType?>(null) }
    var selectedAgent by remember { mutableStateOf<String?>(null) }
    var selectedWorkspace by remember { mutableStateOf<String?>(null) }
    var selectedProject by remember { mutableStateOf<String?>(null) }
    var selectedWorktree by remember { mutableStateOf<String?>(null) }

    // Get projects for selected workspace
    val currentWorkspace = workspaces.find { it.name == selectedWorkspace }
    val projects = currentWorkspace?.projects ?: emptyList()

    // Get worktrees for selected project
    val currentProject = projects.find { it.name == selectedProject }
    val worktrees = currentProject?.worktrees ?: emptyList()

    // Build filtered list of available options (like iOS agentOptions)
    val agentOptions = if (availableAgents.isEmpty()) {
        // Fallback when no agents available from workstation
        listOf(
            AgentConfig("claude", "claude", "Claude Code Agent", false),
            AgentConfig("cursor", "cursor", "Cursor Agent", false),
            AgentConfig("opencode", "opencode", "OpenCode Agent", false)
        )
    } else {
        // Filter out base agents that are hidden via workstation settings
        availableAgents.filter { agent ->
            // If this is an alias, always show it
            if (agent.isAlias) {
                true
            } else {
                // If this is a base agent, only show it if not hidden
                !hiddenBaseTypes.contains(agent.baseType)
            }
        }
    }

    // Validation: agent sessions require workspace and project
    val canCreate = when {
        selectedType == null && selectedAgent == null -> false
        selectedType == SessionType.TERMINAL -> true
        selectedType?.isAgent == true || selectedAgent != null -> selectedWorkspace != null && selectedProject != null
        else -> true
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.session_create)) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Session type selection header
                Text(
                    text = stringResource(R.string.session_select_type),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                // Terminal option (always shown)
                AgentTypeListItem(
                    name = "Terminal",
                    sessionType = SessionType.TERMINAL,
                    isAlias = false,
                    isSelected = selectedType == SessionType.TERMINAL && selectedAgent == null,
                    onClick = {
                        selectedType = SessionType.TERMINAL
                        selectedAgent = null
                        selectedWorkspace = null
                        selectedProject = null
                        selectedWorktree = null
                    }
                )

                // Agent options (base + aliases, filtered)
                agentOptions.forEach { agent ->
                    AgentTypeListItem(
                        name = if (agent.isAlias) "${agent.name} (${agent.baseType})" else agent.name.replaceFirstChar { it.uppercase() },
                        sessionType = agent.sessionType,
                        isAlias = agent.isAlias,
                        isSelected = if (agent.isAlias) {
                            selectedAgent == agent.name
                        } else {
                            selectedType == agent.sessionType && selectedAgent == null
                        },
                        onClick = {
                            selectedType = agent.sessionType
                            selectedAgent = if (agent.isAlias) agent.name else null
                        }
                    )
                }

                // Workspace/Project selection (for agent sessions)
                if ((selectedType?.isAgent == true || selectedAgent != null) && workspaces.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider()
                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = stringResource(R.string.session_select_workspace),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Workspace dropdown
                    var workspaceExpanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = workspaceExpanded,
                        onExpandedChange = { workspaceExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = selectedWorkspace ?: "Select workspace",
                            onValueChange = {},
                            readOnly = true,
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = workspaceExpanded)
                            },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth(),
                            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                        )
                        ExposedDropdownMenu(
                            expanded = workspaceExpanded,
                            onDismissRequest = { workspaceExpanded = false }
                        ) {
                            workspaces.forEach { workspace ->
                                DropdownMenuItem(
                                    text = { Text(workspace.name) },
                                    onClick = {
                                        selectedWorkspace = workspace.name
                                        selectedProject = null
                                        selectedWorktree = null
                                        workspaceExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    // Project selection (if workspace selected and has projects)
                    if (selectedWorkspace != null && projects.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Project",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        var projectExpanded by remember { mutableStateOf(false) }
                        ExposedDropdownMenuBox(
                            expanded = projectExpanded,
                            onExpandedChange = { projectExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = selectedProject ?: "Select project",
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = projectExpanded)
                                },
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth(),
                                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                            )
                            ExposedDropdownMenu(
                                expanded = projectExpanded,
                                onDismissRequest = { projectExpanded = false }
                            ) {
                                projects.forEach { project ->
                                    DropdownMenuItem(
                                        text = { Text(project.name) },
                                        onClick = {
                                            selectedProject = project.name
                                            selectedWorktree = null
                                            projectExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Worktree selection (if project selected and has worktrees)
                    if (selectedProject != null && worktrees.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Worktree (optional)",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        var worktreeExpanded by remember { mutableStateOf(false) }
                        ExposedDropdownMenuBox(
                            expanded = worktreeExpanded,
                            onExpandedChange = { worktreeExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = selectedWorktree ?: "None (main branch)",
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = worktreeExpanded)
                                },
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth(),
                                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
                            )
                            ExposedDropdownMenu(
                                expanded = worktreeExpanded,
                                onDismissRequest = { worktreeExpanded = false }
                            ) {
                                // Option for no worktree
                                DropdownMenuItem(
                                    text = { Text("None (main branch)") },
                                    onClick = {
                                        selectedWorktree = null
                                        worktreeExpanded = false
                                    }
                                )
                                worktrees.forEach { worktree ->
                                    DropdownMenuItem(
                                        text = { Text(worktree) },
                                        onClick = {
                                            selectedWorktree = worktree
                                            worktreeExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Show validation message if workspace/project not selected
                    if (selectedWorkspace == null || selectedProject == null) {
                        Text(
                            text = "* Workspace and project are required for agent sessions",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val type = selectedType ?: agentOptions.find { it.name == selectedAgent }?.sessionType
                    type?.let {
                        onCreate(it, selectedAgent, selectedWorkspace, selectedProject, selectedWorktree)
                    }
                },
                enabled = canCreate
            ) {
                Text(stringResource(R.string.session_create))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}

/**
 * List item for agent type selection (mirrors iOS AgentTypeRow).
 */
@Composable
private fun AgentTypeListItem(
    name: String,
    sessionType: SessionType,
    isAlias: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) {
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
        } else {
            MaterialTheme.colorScheme.surface
        }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Session icon
            SessionIcon(
                sessionType = sessionType,
                modifier = Modifier.size(32.dp)
            )

            // Name and subtitle
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge
                )
                if (isAlias) {
                    Text(
                        text = "Custom alias",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Checkmark when selected
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = sessionType.accentColor()
                )
            }
        }
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
        // Use Box with fixed size to ensure consistent icon dimensions
        Box(
            modifier = modifier
                .clip(RoundedCornerShape(8.dp)),
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
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.surface
            )
        }
    }
}

/**
 * Get custom logo drawable resource for session type.
 * Returns null for types that should use SF Symbol/Material Icon fallback.
 */
private fun SessionType.customLogoRes(): Int? = when (this) {
    SessionType.SUPERVISOR -> R.drawable.ic_tiflis_logo
    SessionType.CURSOR -> R.drawable.ic_cursor_logo
    SessionType.CLAUDE -> R.drawable.ic_claude_logo
    SessionType.OPENCODE -> R.drawable.ic_opencode_logo
    SessionType.TERMINAL -> null // Use Material Icon
}
