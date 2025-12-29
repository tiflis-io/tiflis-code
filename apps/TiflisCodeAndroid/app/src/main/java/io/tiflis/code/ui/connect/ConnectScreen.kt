/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.connect

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.tiflis.code.R
import io.tiflis.code.domain.models.ConnectionState
import io.tiflis.code.ui.state.AppState
import io.tiflis.code.util.DeepLinkParser

/**
 * Connect screen shown when workstation is not connected.
 * Provides QR code scanning and magic link input options.
 * Mirrors the iOS ConnectView and web ConnectPage.
 */
@Composable
fun ConnectScreen(
    appState: AppState,
    onScanQR: () -> Unit
) {
    val context = LocalContext.current
    val connectionState by appState.connectionState.collectAsState()
    
    var showMagicLinkDialog by remember { mutableStateOf(false) }
    var magicLinkText by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val isConnecting = connectionState is ConnectionState.Connecting ||
                       connectionState is ConnectionState.Reconnecting

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Spacer(modifier = Modifier.weight(1f))
        
        // Logo and branding
        Image(
            painter = painterResource(id = R.drawable.splash_icon),
            contentDescription = "Tiflis Code Logo",
            modifier = Modifier
                .size(100.dp)
                .clip(RoundedCornerShape(22.dp))
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "Tiflis Code",
            style = MaterialTheme.typography.headlineLarge
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Connect to your workstation to control AI agents remotely",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 32.dp)
        )
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Error message
        if (errorMessage != null) {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = errorMessage!!,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Connection error from state
        if (connectionState is ConnectionState.Error) {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = (connectionState as ConnectionState.Error).message,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Scan QR Code button
        Button(
            onClick = { 
                errorMessage = null
                onScanQR() 
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            enabled = !isConnecting
        ) {
            Icon(
                Icons.Default.QrCodeScanner,
                contentDescription = null,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Scan QR Code")
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Divider with "or"
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f))
            Text(
                text = "or",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
            HorizontalDivider(modifier = Modifier.weight(1f))
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Paste Magic Link button
        OutlinedButton(
            onClick = { 
                errorMessage = null
                showMagicLinkDialog = true 
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            enabled = !isConnecting
        ) {
            Icon(
                Icons.Default.Link,
                contentDescription = null,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Paste Magic Link")
        }
        
        // Loading indicator
        if (isConnecting) {
            Spacer(modifier = Modifier.height(24.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Connecting...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Footer
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Run `workstation connect` on your machine",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            TextButton(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/tiflis-io/tiflis-code"))
                    context.startActivity(intent)
                }
            ) {
                Text("Learn more")
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
    }
    
    // Magic Link dialog
    if (showMagicLinkDialog) {
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
                    Text("Cancel")
                }
            }
        )
    }
}
