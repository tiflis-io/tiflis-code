/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.theme

import android.app.Activity
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import io.tiflis.code.domain.models.SessionType

private val LightColorScheme = lightColorScheme(
    primary = TiflisPrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE3F2FD), // Light blue tint
    onPrimaryContainer = TiflisPrimaryDark,
    secondary = TiflisSecondary,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEDE7F6), // Light indigo tint
    onSecondaryContainer = TiflisSecondary,
    tertiary = SessionCursor,
    onTertiary = Color.White,
    background = LightBackground,
    onBackground = LightOnBackground,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurface,
    surfaceContainerHighest = Color(0xFFE5E5EA), // iOS system gray 5 - for typing indicator
    error = StatusError,
    onError = Color.White,
    errorContainer = Color(0xFFFFEBEE), // Light red tint
    onErrorContainer = StatusError,
    outline = Color(0xFFD1D1D6), // iOS system gray 4
    outlineVariant = Color(0xFFE5E5EA) // iOS system gray 5
)

private val DarkColorScheme = darkColorScheme(
    primary = TiflisPrimaryDark, // Brighter blue for dark mode
    onPrimary = Color.White,
    primaryContainer = Color(0xFF0D47A1).copy(alpha = 0.3f), // Dark blue tint
    onPrimaryContainer = TiflisPrimaryDark,
    secondary = TiflisSecondary,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF311B92).copy(alpha = 0.3f), // Dark indigo tint
    onSecondaryContainer = TiflisSecondary,
    tertiary = SessionCursor,
    onTertiary = Color.White,
    background = DarkBackground,
    onBackground = DarkOnBackground,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurface,
    surfaceContainerHighest = Color(0xFF3A3A3C), // iOS system gray 4 dark - for typing indicator
    error = StatusError,
    onError = Color.White,
    errorContainer = Color(0xFFB71C1C).copy(alpha = 0.3f), // Dark red tint
    onErrorContainer = StatusError,
    outline = Color(0xFF48484A), // iOS system gray 3 dark
    outlineVariant = Color(0xFF3A3A3C) // iOS system gray 4 dark
)

@Composable
fun TiflisCodeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false, // Disabled - use our iOS-matching color scheme
    content: @Composable () -> Unit
) {
    // Always use our custom color scheme to match iOS exactly
    // Dynamic colors pick up wallpaper colors which can introduce unwanted warm tones
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val activity = view.context as? ComponentActivity
            activity?.enableEdgeToEdge()
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content
    )
}

/**
 * Get the accent color for a session type.
 */
fun SessionType.accentColor(): Color = when (this) {
    SessionType.SUPERVISOR -> SessionSupervisor
    SessionType.CURSOR -> SessionCursor
    SessionType.CLAUDE -> SessionClaude
    SessionType.OPENCODE -> SessionOpenCode
    SessionType.TERMINAL -> SessionTerminal
}

/**
 * Get connection status color.
 */
@Composable
fun connectionStatusColor(isConnected: Boolean, isConnecting: Boolean, hasError: Boolean): Color {
    return when {
        hasError -> StatusError
        isConnected -> StatusConnected
        isConnecting -> StatusConnecting
        else -> StatusDisconnected
    }
}
