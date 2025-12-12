/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import io.tiflis.code.ui.navigation.AppNavigation
import io.tiflis.code.ui.theme.TiflisCodeTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main activity for TiflisCode Android app.
 * Single-activity architecture with Jetpack Compose navigation.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Handle splash screen
        installSplashScreen()

        super.onCreate(savedInstanceState)

        // Enable edge-to-edge display
        enableEdgeToEdge()

        // Handle deep link if present
        handleDeepLink(intent)

        setContent {
            TiflisCodeTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Handle tiflis://connect deep links for magic link connection.
     * Format: tiflis://connect?data=<base64_json>
     */
    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "tiflis" && uri.host == "connect") {
            val data = uri.getQueryParameter("data")
            if (data != null) {
                // Deep link will be handled by AppNavigation through a shared state
                // The connection credentials will be parsed and stored
                DeepLinkHandler.pendingConnectionData = data
            }
        }
    }
}

/**
 * Simple handler for passing deep link data to the app.
 * In a production app, this could use a more sophisticated approach.
 */
object DeepLinkHandler {
    var pendingConnectionData: String? = null
}
