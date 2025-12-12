/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.theme

import androidx.compose.ui.graphics.Color

// Primary colors - iOS system blue
val TiflisPrimary = Color(0xFF007AFF) // iOS system blue
val TiflisPrimaryDark = Color(0xFF0A84FF) // iOS system blue (dark mode variant)
val TiflisSecondary = Color(0xFF5856D6) // iOS system indigo

// Session type colors - matching iOS system colors
val SessionSupervisor = Color(0xFF007AFF) // iOS system blue
val SessionCursor = Color(0xFF007AFF) // iOS system blue
val SessionClaude = Color(0xFFFF9500) // iOS system orange
val SessionOpenCode = Color(0xFF34C759) // iOS system green
val SessionTerminal = Color(0xFF8E8E93) // iOS system gray

// Status colors - iOS system colors
val StatusVerified = Color(0xFF34C759) // iOS system green - full end-to-end verified
val StatusConnected = Color(0xFF90EE90) // Light green - authenticated, verifying workstation
val StatusDegraded = Color(0xFFFF9500) // iOS system orange - heartbeat failing
val StatusConnecting = Color(0xFFFFCC00) // iOS system yellow (not orange!)
val StatusDisconnected = Color(0xFF8E8E93) // iOS system gray
val StatusError = Color(0xFFFF3B30) // iOS system red

// Tool status colors
val ToolRunning = Color(0xFF007AFF) // iOS system blue
val ToolCompleted = Color(0xFF34C759) // iOS system green
val ToolFailed = Color(0xFFFF3B30) // iOS system red

// Light theme colors - clean neutral grays
val LightBackground = Color(0xFFFFFFFF)
val LightSurface = Color(0xFFF2F2F7) // iOS system gray 6
val LightOnBackground = Color(0xFF000000)
val LightOnSurface = Color(0xFF3C3C43) // iOS label color
val LightSurfaceVariant = Color(0xFFE5E5EA) // iOS system gray 5

// Dark theme colors - pure dark with neutral cool grays (no warm tones!)
val DarkBackground = Color(0xFF000000) // Pure black like iOS
val DarkSurface = Color(0xFF1C1C1E) // iOS system gray 6 dark
val DarkOnBackground = Color(0xFFFFFFFF)
val DarkOnSurface = Color(0xFFEBEBF5) // iOS label color dark
val DarkSurfaceVariant = Color(0xFF2C2C2E) // iOS system gray 5 dark

// Message colors
val MessageUserBackground = Color(0xFF007AFF) // iOS system blue
val MessageUserText = Color(0xFFFFFFFF)
val MessageAssistantBackgroundLight = Color(0xFFE5E5EA) // iOS system gray 5
val MessageAssistantBackgroundDark = Color(0xFF2C2C2E) // iOS system gray 5 dark

// Code block colors - neutral dark
val CodeBackgroundLight = Color(0xFFF2F2F7) // iOS system gray 6
val CodeBackgroundDark = Color(0xFF1C1C1E) // iOS system gray 6 dark
val CodeBorderLight = Color(0xFFD1D1D6) // iOS system gray 4
val CodeBorderDark = Color(0xFF3A3A3C) // iOS system gray 4 dark
