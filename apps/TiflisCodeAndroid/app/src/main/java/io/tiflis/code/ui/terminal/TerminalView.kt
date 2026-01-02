/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.terminal

import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import io.tiflis.code.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow

/**
 * Composable terminal view that renders ANSI terminal output.
 * Mirrors the iOS SwiftTerm TerminalView.
 */
@Composable
fun TerminalView(
    terminalOutput: SharedFlow<String>,
    onInput: (String) -> Unit,
    onResize: (cols: Int, rows: Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }

    // Load JetBrains Mono typeface for terminal rendering
    val terminalTypeface = remember {
        ResourcesCompat.getFont(context, R.font.jetbrains_mono_regular)
            ?: android.graphics.Typeface.MONOSPACE
    }
    val terminalTypefaceBold = remember {
        ResourcesCompat.getFont(context, R.font.jetbrains_mono_bold)
            ?: android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
    }

    // Terminal emulator state
    val emulator = remember { TerminalEmulator() }
    var fullBuffer by remember { mutableStateOf(emulator.getFullBuffer()) }
    var cursor by remember { mutableStateOf(emulator.getCursorInFullBuffer()) }
    var hasFocus by remember { mutableStateOf(false) }
    var viewSize by remember { mutableStateOf(IntSize.Zero) }

    // Scroll state for scrollback support
    val scrollState = rememberScrollState()

    // Hidden text field for keyboard input
    var hiddenInput by remember { mutableStateOf("") }

    // Character dimensions
    val fontSize = 14.sp
    val fontSizePx = with(density) { fontSize.toPx() }
    val charWidth = fontSizePx * 0.6f
    val charHeight = fontSizePx * 1.2f

    // Calculate terminal dimensions based on view size
    val cols = if (viewSize.width > 0 && charWidth > 0) {
        (viewSize.width / charWidth).toInt().coerceAtLeast(20)
    } else 80

    val rows = if (viewSize.height > 0 && charHeight > 0) {
        (viewSize.height / charHeight).toInt().coerceAtLeast(10)
    } else 24

    // Resize terminal when view size changes
    LaunchedEffect(cols, rows) {
        if (cols > 0 && rows > 0) {
            val (currentCols, currentRows) = emulator.getDimensions()
            if (cols != currentCols || rows != currentRows) {
                emulator.resize(cols, rows)
                onResize(cols, rows)
                fullBuffer = emulator.getFullBuffer()
                cursor = emulator.getCursorInFullBuffer()
            }
        }
    }

    // Batch terminal output for smooth rendering
    // Accumulates output and flushes every 8ms (120fps cadence, leaves room for 60fps display)
    var pendingOutput by remember { mutableStateOf("") }
    var flushScheduled by remember { mutableStateOf(false) }

    // Collect terminal output with batching
    LaunchedEffect(Unit) {
        terminalOutput.collect { data ->
            pendingOutput += data

            // Schedule a flush if not already scheduled
            if (!flushScheduled) {
                flushScheduled = true
                // Use a small delay to batch multiple rapid updates
                delay(8) // 8ms batch interval
                if (pendingOutput.isNotEmpty()) {
                    emulator.write(pendingOutput)
                    fullBuffer = emulator.getFullBuffer()
                    cursor = emulator.getCursorInFullBuffer()
                    pendingOutput = ""
                }
                flushScheduled = false
            }
        }
    }

    // Calculate total content height for scrolling
    val totalLines = fullBuffer.size
    val contentHeightPx = (totalLines * charHeight).toInt()

    // Auto-scroll to bottom when new content arrives
    LaunchedEffect(fullBuffer.size) {
        if (fullBuffer.isNotEmpty()) {
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }

    Box(
        modifier = modifier
            .background(Color(0xFF1E1E1E))
            .onSizeChanged { viewSize = it }
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = {
                        // Always request focus and show keyboard on tap
                        // The keyboard controller handles not re-showing if already visible
                        focusRequester.requestFocus()
                        keyboardController?.show()
                    }
                )
            }
    ) {
        // Terminal canvas with vertical scroll support
        Box(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
        ) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(with(density) { contentHeightPx.coerceAtLeast(viewSize.height).toDp() })
                    .padding(horizontal = 4.dp)
            ) {
                drawTerminalScreen(fullBuffer, cursor, hasFocus, charWidth, charHeight, fontSizePx, terminalTypeface, terminalTypefaceBold)
            }
        }

        // Hidden text field for keyboard input
        BasicTextField(
            value = hiddenInput,
            onValueChange = { newValue ->
                if (newValue.length > hiddenInput.length) {
                    val input = newValue.substring(hiddenInput.length)
                    onInput(input)
                }
                hiddenInput = ""
            },
            modifier = Modifier
                .size(1.dp)
                .focusRequester(focusRequester)
                .onFocusChanged { hasFocus = it.hasFocus }
                .onPreviewKeyEvent { keyEvent ->
                    if (keyEvent.type == KeyEventType.KeyDown) {
                        handleComposeKeyEvent(keyEvent, onInput)
                    } else {
                        false
                    }
                },
            textStyle = TextStyle(fontSize = 1.sp)
        )

        // Note: Terminal toolbar is now in TerminalScreen (outside TerminalView)
        // This ensures it stays visible above the keyboard
    }

    // Request focus on first composition
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
}

private fun DrawScope.drawTerminalScreen(
    screen: List<List<TerminalCell>>,
    cursor: Pair<Int, Int>,
    hasFocus: Boolean,
    charWidth: Float,
    charHeight: Float,
    fontSize: Float,
    normalTypeface: android.graphics.Typeface,
    boldTypeface: android.graphics.Typeface
) {
    // Draw each cell
    screen.forEachIndexed { y, row ->
        row.forEachIndexed { x, cell ->
            val xPos = x * charWidth
            val yPos = y * charHeight

            // Draw background if not transparent
            if (cell.bg != Color.Transparent) {
                drawRect(
                    color = cell.bg,
                    topLeft = Offset(xPos, yPos),
                    size = Size(charWidth, charHeight)
                )
            }

            // Draw character using native canvas
            if (cell.char != ' ') {
                drawContext.canvas.nativeCanvas.drawText(
                    cell.char.toString(),
                    xPos,
                    yPos + fontSize,
                    android.graphics.Paint().apply {
                        color = cell.fg.toAndroidColor()
                        textSize = fontSize
                        typeface = if (cell.bold) boldTypeface else normalTypeface
                    }
                )
            }

            // Draw underline
            if (cell.underline) {
                drawLine(
                    color = cell.fg,
                    start = Offset(xPos, yPos + charHeight - 2),
                    end = Offset(xPos + charWidth, yPos + charHeight - 2),
                    strokeWidth = 1f
                )
            }
        }
    }

    // Draw cursor
    if (hasFocus) {
        val (cursorX, cursorY) = cursor
        val cursorXPos = cursorX * charWidth
        val cursorYPos = cursorY * charHeight

        drawRect(
            color = Color.White.copy(alpha = 0.7f),
            topLeft = Offset(cursorXPos, cursorYPos),
            size = Size(charWidth, charHeight)
        )
    }
}

private fun Color.toAndroidColor(): Int {
    return android.graphics.Color.argb(
        (alpha * 255).toInt(),
        (red * 255).toInt(),
        (green * 255).toInt(),
        (blue * 255).toInt()
    )
}

private fun handleComposeKeyEvent(keyEvent: KeyEvent, onInput: (String) -> Unit): Boolean {
    val ctrl = keyEvent.isCtrlPressed

    val char = when (keyEvent.key) {
        Key.Enter -> "\r"
        Key.Backspace -> "\u007f"
        Key.Tab -> "\t"
        Key.Escape -> "\u001b"
        Key.DirectionUp -> "\u001b[A"
        Key.DirectionDown -> "\u001b[B"
        Key.DirectionRight -> "\u001b[C"
        Key.DirectionLeft -> "\u001b[D"
        Key.MoveHome -> "\u001b[H"
        Key.MoveEnd -> "\u001b[F"
        Key.PageUp -> "\u001b[5~"
        Key.PageDown -> "\u001b[6~"
        Key.Insert -> "\u001b[2~"
        Key.Delete -> "\u001b[3~"
        Key.F1 -> "\u001bOP"
        Key.F2 -> "\u001bOQ"
        Key.F3 -> "\u001bOR"
        Key.F4 -> "\u001bOS"
        Key.F5 -> "\u001b[15~"
        Key.F6 -> "\u001b[17~"
        Key.F7 -> "\u001b[18~"
        Key.F8 -> "\u001b[19~"
        Key.F9 -> "\u001b[20~"
        Key.F10 -> "\u001b[21~"
        Key.F11 -> "\u001b[23~"
        Key.F12 -> "\u001b[24~"
        else -> {
            if (ctrl) {
                // Ctrl key combinations using key code
                when (keyEvent.key.keyCode) {
                    android.view.KeyEvent.KEYCODE_A.toLong() -> "\u0001"
                    android.view.KeyEvent.KEYCODE_B.toLong() -> "\u0002"
                    android.view.KeyEvent.KEYCODE_C.toLong() -> "\u0003"
                    android.view.KeyEvent.KEYCODE_D.toLong() -> "\u0004"
                    android.view.KeyEvent.KEYCODE_E.toLong() -> "\u0005"
                    android.view.KeyEvent.KEYCODE_F.toLong() -> "\u0006"
                    android.view.KeyEvent.KEYCODE_G.toLong() -> "\u0007"
                    android.view.KeyEvent.KEYCODE_H.toLong() -> "\u0008"
                    android.view.KeyEvent.KEYCODE_I.toLong() -> "\u0009"
                    android.view.KeyEvent.KEYCODE_J.toLong() -> "\u000a"
                    android.view.KeyEvent.KEYCODE_K.toLong() -> "\u000b"
                    android.view.KeyEvent.KEYCODE_L.toLong() -> "\u000c"
                    android.view.KeyEvent.KEYCODE_M.toLong() -> "\u000d"
                    android.view.KeyEvent.KEYCODE_N.toLong() -> "\u000e"
                    android.view.KeyEvent.KEYCODE_O.toLong() -> "\u000f"
                    android.view.KeyEvent.KEYCODE_P.toLong() -> "\u0010"
                    android.view.KeyEvent.KEYCODE_Q.toLong() -> "\u0011"
                    android.view.KeyEvent.KEYCODE_R.toLong() -> "\u0012"
                    android.view.KeyEvent.KEYCODE_S.toLong() -> "\u0013"
                    android.view.KeyEvent.KEYCODE_T.toLong() -> "\u0014"
                    android.view.KeyEvent.KEYCODE_U.toLong() -> "\u0015"
                    android.view.KeyEvent.KEYCODE_V.toLong() -> "\u0016"
                    android.view.KeyEvent.KEYCODE_W.toLong() -> "\u0017"
                    android.view.KeyEvent.KEYCODE_X.toLong() -> "\u0018"
                    android.view.KeyEvent.KEYCODE_Y.toLong() -> "\u0019"
                    android.view.KeyEvent.KEYCODE_Z.toLong() -> "\u001a"
                    else -> null
                }
            } else {
                null
            }
        }
    }

    return if (char != null) {
        onInput(char)
        true
    } else {
        false
    }
}

/**
 * Terminal toolbar with special keys.
 * Mirrors the iOS TerminalToolbarView with two modes:
 * - Normal mode: Dismiss, Ctrl, Esc, Tab, -, /, ~, arrows, backspace
 * - Control mode (when Ctrl active): C, R, L, O, K, B, W, X for common control combinations
 */
@Composable
fun TerminalToolbar(
    onInput: (String) -> Unit,
    onDismissKeyboard: () -> Unit,
    modifier: Modifier = Modifier
) {
    var ctrlActive by remember { mutableStateOf(false) }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color(0xFF2D2D2D),
        tonalElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 4.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (ctrlActive) {
                // Control mode - show control character shortcuts
                // Dismiss keyboard
                ToolbarIconKey(
                    icon = Icons.Default.KeyboardHide,
                    contentDescription = "Dismiss keyboard",
                    onClick = onDismissKeyboard
                )

                // Ctrl (toggle off)
                ToolbarKey(
                    label = "CTRL",
                    active = true,
                    onClick = { ctrlActive = false }
                )

                // C - Ctrl+C (0x03) - Interrupt/Cancel
                ToolbarKey(label = "C", onClick = {
                    onInput("\u0003")
                    ctrlActive = false
                })

                // R - Ctrl+R (0x12) - History search
                ToolbarKey(label = "R", onClick = {
                    onInput("\u0012")
                    ctrlActive = false
                })

                // L - Ctrl+L (0x0C) - Clear screen
                ToolbarKey(label = "L", onClick = {
                    onInput("\u000c")
                    ctrlActive = false
                })

                // O - Ctrl+O (0x0F) - Toggle output
                ToolbarKey(label = "O", onClick = {
                    onInput("\u000f")
                    ctrlActive = false
                })

                // K - Ctrl+K (0x0B) - Kill line
                ToolbarKey(label = "K", onClick = {
                    onInput("\u000b")
                    ctrlActive = false
                })

                // B - Ctrl+B (0x02) - Background
                ToolbarKey(label = "B", onClick = {
                    onInput("\u0002")
                    ctrlActive = false
                })

                // W - Ctrl+W (0x17) - Delete word
                ToolbarKey(label = "W", onClick = {
                    onInput("\u0017")
                    ctrlActive = false
                })

                // X - Ctrl+X (0x18) - Cancel/Leader
                ToolbarKey(label = "X", onClick = {
                    onInput("\u0018")
                    ctrlActive = false
                })

                // Backspace
                ToolbarIconKey(
                    icon = Icons.AutoMirrored.Filled.Backspace,
                    contentDescription = "Backspace",
                    onClick = { onInput("\u007f") },
                    onLongClick = { onInput("\u0017") } // Ctrl+W - delete word
                )
            } else {
                // Normal mode - standard terminal keys (matches iOS)
                // Dismiss keyboard
                ToolbarIconKey(
                    icon = Icons.Default.KeyboardHide,
                    contentDescription = "Dismiss keyboard",
                    onClick = onDismissKeyboard
                )

                // Ctrl
                ToolbarKey(
                    label = "CTRL",
                    active = false,
                    onClick = { ctrlActive = true }
                )

                // ESC (long press = Ctrl+C)
                ToolbarKey(
                    label = "ESC",
                    onClick = { onInput("\u001b") },
                    onLongClick = { onInput("\u0003") } // Ctrl+C
                )

                // Tab
                ToolbarKey(label = "TAB", onClick = { onInput("\t") })

                // Dash
                ToolbarKey(label = "-", onClick = { onInput("-") })

                // Slash
                ToolbarKey(label = "/", onClick = { onInput("/") })

                // Tilde
                ToolbarKey(label = "~", onClick = { onInput("~") })

                // Arrow Left
                ToolbarIconKey(
                    icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = "Left",
                    onClick = { onInput("\u001b[D") }
                )

                // Arrow Down
                ToolbarIconKey(
                    icon = Icons.Default.KeyboardArrowDown,
                    contentDescription = "Down",
                    onClick = { onInput("\u001b[B") }
                )

                // Arrow Up
                ToolbarIconKey(
                    icon = Icons.Default.KeyboardArrowUp,
                    contentDescription = "Up",
                    onClick = { onInput("\u001b[A") }
                )

                // Arrow Right
                ToolbarIconKey(
                    icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Right",
                    onClick = { onInput("\u001b[C") }
                )

                // Backspace (long press = Ctrl+W - delete word)
                ToolbarIconKey(
                    icon = Icons.AutoMirrored.Filled.Backspace,
                    contentDescription = "Backspace",
                    onClick = { onInput("\u007f") },
                    onLongClick = { onInput("\u0017") } // Ctrl+W - delete word
                )
            }
        }
    }
}

@Composable
private fun ToolbarKey(
    label: String,
    active: Boolean = false,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }

    Surface(
        modifier = Modifier
            .height(36.dp)
            .pointerInput(onLongClick) {
                detectTapGestures(
                    onTap = { onClick() },
                    onLongPress = { onLongClick?.invoke() }
                )
            },
        shape = MaterialTheme.shapes.small,
        color = if (active) Color(0xFF4A9EFF) else Color(0xFF424242),
        contentColor = Color.White
    ) {
        Box(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = label,
                fontSize = 13.sp,
                fontFamily = JetBrainsMono,
                fontWeight = if (active) FontWeight.Bold else FontWeight.Normal
            )
        }
    }
}

@Composable
private fun ToolbarIconKey(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null
) {
    Surface(
        modifier = Modifier
            .size(36.dp)
            .pointerInput(onLongClick) {
                detectTapGestures(
                    onTap = { onClick() },
                    onLongPress = { onLongClick?.invoke() }
                )
            },
        shape = MaterialTheme.shapes.small,
        color = Color(0xFF424242),
        contentColor = Color.White
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
