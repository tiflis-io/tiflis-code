/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.terminal

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import io.tiflis.code.R

/**
 * JetBrains Mono font family for terminal rendering.
 * Provides consistent monospace appearance across all Android devices.
 */
val JetBrainsMono = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal, FontStyle.Normal),
    Font(R.font.jetbrains_mono_bold, FontWeight.Bold, FontStyle.Normal),
    Font(R.font.jetbrains_mono_italic, FontWeight.Normal, FontStyle.Italic),
    Font(R.font.jetbrains_mono_bold_italic, FontWeight.Bold, FontStyle.Italic)
)
