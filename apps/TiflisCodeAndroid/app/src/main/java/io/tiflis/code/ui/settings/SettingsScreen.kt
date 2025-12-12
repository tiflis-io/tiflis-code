/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.tiflis.code.BuildConfig
import io.tiflis.code.R
import io.tiflis.code.data.crash.CrashReporter
import io.tiflis.code.domain.models.ConnectionState
import io.tiflis.code.ui.common.ConnectionIndicator
import io.tiflis.code.ui.state.AppState
import io.tiflis.code.ui.theme.*
import io.tiflis.code.util.DeepLinkParser

/**
 * Settings screen showing connection info and preferences.
 * Mirrors the iOS SettingsView.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    appState: AppState,
    onMenuClick: () -> Unit,
    onNavigateBack: () -> Unit,
    onScanQR: () -> Unit = {},
    crashReporter: CrashReporter? = null
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val clipboardManager = LocalClipboardManager.current

    val connectionState by appState.connectionState.collectAsState()
    val workstationOnline by appState.workstationOnline.collectAsState()
    val workstationInfo by appState.workstationInfo.collectAsState()
    val tunnelInfo by appState.tunnelInfo.collectAsState()
    val ttsEnabled by appState.ttsEnabled.collectAsState()
    val speechLanguage by appState.speechLanguage.collectAsState()

    var showDisconnectDialog by remember { mutableStateOf(false) }
    var showMagicLinkDialog by remember { mutableStateOf(false) }
    var magicLinkText by remember { mutableStateOf("") }
    var showCrashLogDialog by remember { mutableStateOf(false) }

    // Check for crash log
    val hasCrashLog = remember { crashReporter?.hasCrashLog() ?: false }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(scrollState)
        ) {
            // Connection Section
            SettingsSection(title = stringResource(R.string.settings_connection)) {
                // Connection status
                ListItem(
                    headlineContent = {
                        Text(connectionState.displayText)
                    },
                    leadingContent = {
                        ConnectionIndicator(
                            isConnected = connectionState.isConnected,
                            isConnecting = connectionState.isConnecting,
                            workstationOnline = workstationOnline,
                            size = 12.dp
                        )
                    },
                    supportingContent = if (!workstationOnline && connectionState.isConnected) {
                        { Text(stringResource(R.string.connection_workstation_offline)) }
                    } else null
                )

                HorizontalDivider()

                // QR Scanner
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_scan_qr)) },
                    leadingContent = {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                    },
                    modifier = Modifier.clickableListItem { onScanQR() }
                )

                HorizontalDivider()

                // Magic Link paste
                ListItem(
                    headlineContent = { Text("Connect via Magic Link") },
                    supportingContent = { Text("Paste a tiflis:// link") },
                    leadingContent = {
                        Icon(Icons.Default.Link, contentDescription = null)
                    },
                    modifier = Modifier.clickableListItem { showMagicLinkDialog = true }
                )

                // Disconnect (if connected)
                if (connectionState.isConnected || connectionState.isConnecting) {
                    HorizontalDivider()
                    ListItem(
                        headlineContent = {
                            Text(
                                stringResource(R.string.settings_disconnect),
                                color = MaterialTheme.colorScheme.error
                            )
                        },
                        leadingContent = {
                            Icon(
                                Icons.Default.LinkOff,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                        },
                        modifier = Modifier.clickableListItem { showDisconnectDialog = true }
                    )
                }
            }

            // Workstation Section (if connected)
            if (workstationInfo != null) {
                SettingsSection(title = stringResource(R.string.settings_workstation)) {
                    workstationInfo?.name?.let { name ->
                        ListItem(
                            headlineContent = { Text("Name") },
                            supportingContent = { Text(name) }
                        )
                    }

                    workstationInfo?.version?.let { version ->
                        HorizontalDivider()
                        ListItem(
                            headlineContent = { Text(stringResource(R.string.settings_version)) },
                            supportingContent = { Text(version) }
                        )
                    }
                }
            }

            // Tunnel Section (if connected)
            if (tunnelInfo != null) {
                SettingsSection(title = stringResource(R.string.settings_tunnel)) {
                    tunnelInfo?.url?.let { url ->
                        ListItem(
                            headlineContent = { Text("URL") },
                            supportingContent = { Text(url) }
                        )
                    }

                    tunnelInfo?.id?.let { id ->
                        HorizontalDivider()
                        ListItem(
                            headlineContent = { Text("Tunnel ID") },
                            supportingContent = { Text(id) }
                        )
                    }

                    tunnelInfo?.protocolVersion?.let { version ->
                        HorizontalDivider()
                        ListItem(
                            headlineContent = { Text("Protocol Version") },
                            supportingContent = { Text(version) }
                        )
                    }
                }
            }

            // Voice & Speech Section
            SettingsSection(title = stringResource(R.string.settings_voice)) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_tts_enabled)) },
                    supportingContent = { Text("Auto-play voice responses") },
                    trailingContent = {
                        Switch(
                            checked = ttsEnabled,
                            onCheckedChange = { appState.setTtsEnabled(it) }
                        )
                    }
                )

                HorizontalDivider()

                // Speech language selection
                var languageExpanded by remember { mutableStateOf(false) }
                val languages = listOf(
                    "en-US" to "English (US)",
                    "en-GB" to "English (UK)",
                    "ru-RU" to "Russian"
                )
                val currentLanguageName = languages.find { it.first == speechLanguage }?.second ?: "English (US)"

                ExposedDropdownMenuBox(
                    expanded = languageExpanded,
                    onExpandedChange = { languageExpanded = it }
                ) {
                    ListItem(
                        headlineContent = { Text("Speech Language") },
                        supportingContent = { Text(currentLanguageName) },
                        trailingContent = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = languageExpanded)
                        },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .clickable { languageExpanded = true }
                    )

                    ExposedDropdownMenu(
                        expanded = languageExpanded,
                        onDismissRequest = { languageExpanded = false }
                    ) {
                        languages.forEach { (code, name) ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    appState.setSpeechLanguage(code)
                                    languageExpanded = false
                                },
                                trailingIcon = if (code == speechLanguage) {
                                    { Icon(Icons.Default.Check, contentDescription = null) }
                                } else null
                            )
                        }
                    }
                }
            }

            // About Section
            SettingsSection(title = stringResource(R.string.settings_about)) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_version)) },
                    supportingContent = { Text(BuildConfig.VERSION_NAME) }
                )

                HorizontalDivider()

                ListItem(
                    headlineContent = { Text("Author") },
                    supportingContent = { Text("Roman Barinov") }
                )

                HorizontalDivider()

                ListItem(
                    headlineContent = { Text("GitHub") },
                    leadingContent = {
                        Icon(Icons.Default.Code, contentDescription = null)
                    },
                    modifier = Modifier.clickableListItem {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/tiflis-io/tiflis-code"))
                        context.startActivity(intent)
                    }
                )

                HorizontalDivider()

                ListItem(
                    headlineContent = { Text("License") },
                    supportingContent = { Text("FSL-1.1-NC") }
                )
            }

            // Legal Section
            SettingsSection(title = "Legal") {
                ListItem(
                    headlineContent = { Text("Privacy Policy") },
                    leadingContent = {
                        Icon(Icons.Default.PrivacyTip, contentDescription = null)
                    },
                    modifier = Modifier.clickableListItem {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://tiflis.io/privacy"))
                        context.startActivity(intent)
                    }
                )

                HorizontalDivider()

                ListItem(
                    headlineContent = { Text("Terms of Service") },
                    leadingContent = {
                        Icon(Icons.Default.Description, contentDescription = null)
                    },
                    modifier = Modifier.clickableListItem {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://tiflis.io/terms"))
                        context.startActivity(intent)
                    }
                )
            }

            // Debug Section (only show if crash log exists)
            if (hasCrashLog) {
                SettingsSection(title = "Debug") {
                    ListItem(
                        headlineContent = { Text("View Crash Log") },
                        supportingContent = { Text("Previous crash detected") },
                        leadingContent = {
                            Icon(
                                Icons.Default.BugReport,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                        },
                        modifier = Modifier.clickableListItem {
                            showCrashLogDialog = true
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    // Disconnect confirmation dialog
    if (showDisconnectDialog) {
        AlertDialog(
            onDismissRequest = { showDisconnectDialog = false },
            title = { Text(stringResource(R.string.settings_disconnect)) },
            text = { Text(stringResource(R.string.settings_disconnect_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        appState.disconnect()
                        showDisconnectDialog = false
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisconnectDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }

    // Magic Link dialog
    if (showMagicLinkDialog) {
        var errorMessage by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = {
                showMagicLinkDialog = false
                magicLinkText = ""
                errorMessage = null
            },
            title = { Text("Connect via Magic Link") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Paste the magic link from your workstation:")

                    OutlinedTextField(
                        value = magicLinkText,
                        onValueChange = {
                            magicLinkText = it
                            errorMessage = null
                        },
                        placeholder = { Text("tiflis://connect?data=...") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        isError = errorMessage != null
                    )

                    if (errorMessage != null) {
                        Text(
                            text = errorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val credentials = DeepLinkParser.parseDeepLink(magicLinkText)
                        if (credentials != null) {
                            appState.connect(credentials)
                            showMagicLinkDialog = false
                            magicLinkText = ""
                            errorMessage = null
                        } else {
                            errorMessage = "Invalid magic link format"
                        }
                    },
                    enabled = magicLinkText.isNotBlank()
                ) {
                    Text("Connect")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showMagicLinkDialog = false
                    magicLinkText = ""
                    errorMessage = null
                }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }

    // Crash Log dialog
    if (showCrashLogDialog && crashReporter != null) {
        val crashLog = remember { crashReporter.readCrashLog() ?: "No crash log found" }

        AlertDialog(
            onDismissRequest = { showCrashLogDialog = false },
            title = { Text("Crash Log") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Box(
                            modifier = Modifier
                                .horizontalScroll(rememberScrollState())
                                .verticalScroll(rememberScrollState())
                                .padding(8.dp)
                        ) {
                            Text(
                                text = crashLog,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Copy button
                        OutlinedButton(
                            onClick = {
                                clipboardManager.setText(AnnotatedString(crashLog))
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Copy")
                        }

                        // Share button
                        OutlinedButton(
                            onClick = {
                                val sendIntent = Intent().apply {
                                    action = Intent.ACTION_SEND
                                    putExtra(Intent.EXTRA_TEXT, crashLog)
                                    type = "text/plain"
                                }
                                val shareIntent = Intent.createChooser(sendIntent, "Share Crash Log")
                                context.startActivity(shareIntent)
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                Icons.Default.Share,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Share")
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        crashReporter.deleteCrashLog()
                        showCrashLogDialog = false
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Delete & Close")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCrashLogDialog = false }) {
                    Text("Close")
                }
            }
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            tonalElevation = 1.dp
        ) {
            Column {
                content()
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

private fun Modifier.clickableListItem(onClick: () -> Unit): Modifier {
    return this.clickable { onClick() }
}
