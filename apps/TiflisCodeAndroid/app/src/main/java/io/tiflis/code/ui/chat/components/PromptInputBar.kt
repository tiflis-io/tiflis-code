/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import android.Manifest
import android.content.pm.PackageManager
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.draw.blur
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import io.tiflis.code.R
import io.tiflis.code.data.audio.AudioPlayerService
import io.tiflis.code.data.audio.AudioRecorderService

/**
 * Input bar with text field, voice recording button, and send/stop button.
 * Mirrors the iOS PromptInputBar exactly.
 *
 * Key bindings:
 * - Enter: Send message
 * - Shift+Enter: New line
 *
 * Voice button:
 * - Tap: Toggle recording (tap to start, tap to stop and send)
 * - Long press: Hold to record, release to send
 *
 * Color scheme matches iOS exactly:
 * - Uses primary color (blue) for mic and send buttons
 * - Uses red for stop and recording states
 * - Uses gray for disabled state
 */
@Composable
fun PromptInputBar(
    onSendText: (String) -> Unit,
    onSendAudio: (ByteArray) -> Unit,
    onStopStreaming: () -> Unit,
    isStreaming: Boolean,
    isConnected: Boolean,
    accentColor: Color = Color.Unspecified, // Deprecated - not used
    modifier: Modifier = Modifier,
    audioRecorderService: AudioRecorderService = hiltViewModel<PromptInputBarViewModel>().audioRecorderService,
    audioPlayerService: AudioPlayerService = hiltViewModel<PromptInputBarViewModel>().audioPlayerService
) {
    var text by remember { mutableStateOf("") }
    val context = LocalContext.current

    // Audio recording state
    val isRecording by audioRecorderService.isRecording.collectAsState()

    // Permission launcher
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Stop any audio playback before starting recording
            audioPlayerService.stop()
            audioRecorderService.startRecording()
        }
    }

    fun sendMessage() {
        val trimmedText = text.trim()
        if (trimmedText.isNotEmpty() && isConnected) {
            onSendText(trimmedText)
            text = ""
        }
    }

    fun startRecording() {
        // Stop any audio playback before starting recording
        audioPlayerService.stop()

        when {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED -> {
                audioRecorderService.startRecording()
            }
            else -> {
                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    fun stopRecordingAndSend() {
        val audioData = audioRecorderService.stopRecording()
        if (audioData != null) {
            onSendAudio(audioData)
        }
    }

    val canSend = text.isNotBlank() && isConnected

    // iOS-matching colors
    val primaryColor = MaterialTheme.colorScheme.primary
    val redColor = Color(0xFFFF3B30) // iOS system red
    val grayColor = Color(0xFF8E8E93) // iOS system gray

    // Colors for text field
    val textFieldBackground = MaterialTheme.colorScheme.surfaceVariant
    val textColor = MaterialTheme.colorScheme.onSurface
    val placeholderColor = MaterialTheme.colorScheme.onSurfaceVariant

    // Check if keyboard is visible - only apply navigation bar padding when keyboard is hidden
    val imeInsets = WindowInsets.ime
    val isKeyboardVisible = imeInsets.getBottom(LocalDensity.current) > 0

    // Use Box to allow recording animation to overflow above the surface
    Box(
        modifier = modifier.fillMaxWidth()
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (!isKeyboardVisible) Modifier.navigationBarsPadding() else Modifier)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Compact text field matching button height (36dp)
                // Uses BasicTextField for precise height control like Telegram/WhatsApp
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 36.dp) // Match button height
                        .background(textFieldBackground, RoundedCornerShape(18.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    BasicTextField(
                        value = text,
                        onValueChange = { text = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .onPreviewKeyEvent { keyEvent ->
                                if (keyEvent.key == Key.Enter && keyEvent.type == KeyEventType.KeyDown) {
                                    if (keyEvent.isShiftPressed) {
                                        false
                                    } else {
                                        sendMessage()
                                        true
                                    }
                                } else {
                                    false
                                }
                            },
                        enabled = isConnected && !isRecording,
                        textStyle = LocalTextStyle.current.copy(color = textColor),
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Sentences,
                            imeAction = ImeAction.Default
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { sendMessage() }
                        ),
                        maxLines = 5,
                        cursorBrush = SolidColor(primaryColor),
                        decorationBox = { innerTextField ->
                            Box(
                                modifier = Modifier.fillMaxWidth(),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                if (text.isEmpty()) {
                                    Text(
                                        text = stringResource(R.string.chat_placeholder),
                                        style = LocalTextStyle.current.copy(color = placeholderColor)
                                    )
                                }
                                innerTextField()
                            }
                        }
                    )
                }

                // Placeholder for voice button layout space
                Spacer(modifier = Modifier.size(36.dp))

                // Send or Stop button - matches iOS exactly
                SendStopButton(
                    isStreaming = isStreaming,
                    canSend = canSend,
                    primaryColor = primaryColor,
                    redColor = redColor,
                    grayColor = grayColor,
                    onSend = { sendMessage() },
                    onStop = onStopStreaming
                )
            }
        }

        // Voice record button - positioned absolutely to allow overflow
        // Disabled when agent is streaming (processing)
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .then(if (!isKeyboardVisible) Modifier.navigationBarsPadding() else Modifier)
                .padding(end = 16.dp + 36.dp + 12.dp, bottom = 8.dp) // Align with spacer position
        ) {
            VoiceRecordButton(
                isRecording = isRecording,
                isEnabled = isConnected && !isStreaming,
                primaryColor = primaryColor,
                redColor = redColor,
                grayColor = grayColor,
                onStartRecording = { startRecording() },
                onStopRecording = { stopRecordingAndSend() }
            )
        }
    }
}

/**
 * Send or Stop button matching iOS SendStopButton exactly.
 * Uses filled circular icons like iOS SF Symbols.
 */
@Composable
private fun SendStopButton(
    isStreaming: Boolean,
    canSend: Boolean,
    primaryColor: Color,
    redColor: Color,
    grayColor: Color,
    onSend: () -> Unit,
    onStop: () -> Unit
) {
    // iOS uses 36pt icons
    val iconSize = 36.dp

    if (isStreaming) {
        // Stop button (red) - like iOS stop.circle.fill
        IconButton(
            onClick = onStop,
            modifier = Modifier.size(iconSize)
        ) {
            Box(
                modifier = Modifier
                    .size(iconSize)
                    .clip(CircleShape)
                    .background(redColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Stop,
                    contentDescription = stringResource(R.string.chat_stop),
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    } else {
        // Send button - like iOS arrow.up.circle.fill
        IconButton(
            onClick = onSend,
            enabled = canSend,
            modifier = Modifier.size(iconSize)
        ) {
            Box(
                modifier = Modifier
                    .size(iconSize)
                    .clip(CircleShape)
                    .background(if (canSend) primaryColor else grayColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ArrowUpward,
                    contentDescription = stringResource(R.string.chat_send),
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * Pulsing ring animation for recording indicator - matches iOS PulsingRing exactly.
 * Creates an expanding ring that fades out, with staggered delays for multiple rings.
 */
@Composable
private fun PulsingRing(
    delayMs: Int,
    isAnimating: Boolean,
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier
) {
    // Animation values
    val infiniteTransition = rememberInfiniteTransition(label = "pulsingRing")

    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 2.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = 1200,
                delayMillis = delayMs,
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "scale"
    )

    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = 1200,
                delayMillis = delayMs,
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "alpha"
    )

    if (isAnimating) {
        Box(
            modifier = modifier
                .size(size * scale)
                .border(
                    width = 3.dp,
                    color = color.copy(alpha = alpha),
                    shape = CircleShape
                )
        )
    }
}

/**
 * Voice recording button matching iOS VoiceRecordButton exactly.
 * - Tap: Toggle recording (tap to start, tap again to stop and send)
 * - Long press (hold): Push-to-talk (hold to record, release to send)
 * - Includes pulsing rings and glow effect when recording
 *
 * iOS behavior (which we replicate exactly):
 * 1. On touch down: start a 150ms timer
 * 2. If finger lifts before timer fires (short tap):
 *    - If not recording: start recording (toggle mode - stays recording after release)
 *    - If already recording: stop recording
 * 3. If timer fires while still pressing (long press detected):
 *    - Start recording immediately with haptic feedback
 *    - When finger lifts: stop recording (push-to-talk mode)
 */
@Composable
private fun VoiceRecordButton(
    isRecording: Boolean,
    isEnabled: Boolean,
    primaryColor: Color,
    redColor: Color,
    grayColor: Color,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    modifier: Modifier = Modifier
) {
    val view = LocalView.current

    // iOS uses 36pt base size, expands to 72pt when recording
    val baseSize = 36.dp
    val expandedSize = 72.dp

    // Track hold mode (push-to-talk) separately from isRecording
    var isHoldMode by remember { mutableStateOf(false) }
    var isPressing by remember { mutableStateOf(false) }
    var longPressTriggered by remember { mutableStateOf(false) }

    // Track the long press job so we can cancel it
    var longPressJob by remember { mutableStateOf<Job?>(null) }

    // Coroutine scope for long press timer
    val coroutineScope = rememberCoroutineScope()

    // Use rememberUpdatedState to get latest values inside pointerInput
    val currentIsRecording by rememberUpdatedState(isRecording)

    // Active recording visual state (either toggle mode or hold mode)
    val isActiveRecording = isRecording || isHoldMode

    // Current size based on state (like iOS)
    val currentSize by animateDpAsState(
        targetValue = when {
            isActiveRecording -> expandedSize
            isPressing -> baseSize * 1.2f
            else -> baseSize
        },
        animationSpec = spring(
            dampingRatio = 0.7f, // iOS uses dampingFraction: 0.7
            stiffness = Spring.StiffnessMedium
        ),
        label = "size"
    )

    // Button color - matches iOS exactly
    val buttonColor by animateColorAsState(
        targetValue = when {
            isActiveRecording -> redColor
            isEnabled -> primaryColor
            else -> grayColor
        },
        animationSpec = spring(
            dampingRatio = 0.7f,
            stiffness = Spring.StiffnessMedium
        ),
        label = "color"
    )

    // Pulsing animation for button itself when recording (like iOS symbolEffect)
    val infiniteTransition = rememberInfiniteTransition(label = "buttonPulse")
    val buttonPulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "buttonScale"
    )

    val buttonScale = if (isActiveRecording) buttonPulseScale else 1f

    // Main container - fixed layout size but allows visual overflow
    // Like iOS Color.clear.frame(width: baseSize, height: baseSize).overlay { ... }
    Box(
        modifier = modifier
            .requiredSize(baseSize) // Fixed layout size
            .wrapContentSize(unbounded = true) // Allow visual overflow
            .pointerInput(isEnabled) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (!isEnabled) return@awaitEachGesture

                    isPressing = true
                    longPressTriggered = false

                    // Long press threshold (150ms like iOS)
                    val longPressThresholdMs = 150L

                    // Start long press timer job
                    longPressJob = coroutineScope.launch {
                        delay(longPressThresholdMs)
                        // Timer fired - this is a long press (push-to-talk mode)
                        if (isPressing && !longPressTriggered && !currentIsRecording) {
                            longPressTriggered = true
                            isHoldMode = true
                            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            onStartRecording()
                        }
                    }

                    // Wait for finger lift or cancellation
                    val up = waitForUpOrCancellation()

                    // Cancel the timer if still running
                    longPressJob?.cancel()
                    longPressJob = null

                    // Capture state before resetting (use currentIsRecording for latest value)
                    val wasHoldMode = isHoldMode
                    val wasLongPressTriggered = longPressTriggered
                    val wasRecording = currentIsRecording

                    // Reset pressing state
                    isPressing = false
                    longPressTriggered = false

                    if (up != null) {
                        // Finger lifted normally
                        if (wasHoldMode) {
                            // End push-to-talk mode - stop recording on release
                            isHoldMode = false
                            onStopRecording()
                            view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                        } else if (!wasLongPressTriggered) {
                            // Short tap - toggle mode
                            if (wasRecording) {
                                // Was recording in toggle mode, stop it
                                onStopRecording()
                                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                            } else {
                                // Not recording, start it (toggle mode - stays on after release)
                                onStartRecording()
                                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                            }
                        }
                        // If wasLongPressTriggered but not wasHoldMode, this shouldn't happen
                    } else {
                        // Cancelled (finger moved out of bounds)
                        if (wasHoldMode) {
                            isHoldMode = false
                            onStopRecording()
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        // ZStack layers: rings (back) -> glow -> button (front)

        // Pulsing rings when recording (behind button) - like iOS
        if (isActiveRecording) {
            PulsingRing(
                delayMs = 0,
                isAnimating = true,
                color = redColor,
                size = expandedSize
            )
            PulsingRing(
                delayMs = 400,
                isAnimating = true,
                color = redColor,
                size = expandedSize
            )
            PulsingRing(
                delayMs = 800,
                isAnimating = true,
                color = redColor,
                size = expandedSize
            )

            // Glow background when recording (like iOS)
            Box(
                modifier = Modifier
                    .size(expandedSize * 1.2f)
                    .blur(8.dp)
                    .background(
                        color = redColor.copy(alpha = 0.15f),
                        shape = CircleShape
                    )
            )
        }

        // Pressing indicator - show visual feedback immediately on touch
        if (isPressing && !isActiveRecording) {
            Box(
                modifier = Modifier
                    .size(baseSize * 1.3f)
                    .background(
                        color = primaryColor.copy(alpha = 0.1f),
                        shape = CircleShape
                    )
            )
        }

        // Main button (always on top)
        Box(
            modifier = Modifier
                .size(currentSize * buttonScale)
                .clip(CircleShape)
                .background(buttonColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = if (isActiveRecording) Icons.Default.Stop else Icons.Default.Mic,
                contentDescription = if (isActiveRecording) "Stop recording" else "Start recording",
                tint = Color.White,
                modifier = Modifier.size(if (isActiveRecording) 24.dp else 20.dp)
            )
        }
    }
}

/**
 * ViewModel for PromptInputBar to access AudioRecorderService and AudioPlayerService.
 */
@dagger.hilt.android.lifecycle.HiltViewModel
class PromptInputBarViewModel @javax.inject.Inject constructor(
    val audioRecorderService: AudioRecorderService,
    val audioPlayerService: AudioPlayerService
) : androidx.lifecycle.ViewModel()
