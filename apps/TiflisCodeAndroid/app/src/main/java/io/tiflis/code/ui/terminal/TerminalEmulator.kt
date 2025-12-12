/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.terminal

import androidx.compose.ui.graphics.Color

/**
 * ANSI terminal emulator that processes escape sequences and maintains screen buffer.
 * Mirrors the iOS SwiftTerm functionality.
 */
class TerminalEmulator(
    private var cols: Int = 80,
    private var rows: Int = 24
) {
    // Screen buffer: List of rows, each row is a list of cells
    private val screenBuffer = mutableListOf<MutableList<TerminalCell>>()

    // Cursor position
    private var cursorX = 0
    private var cursorY = 0

    // Current text attributes
    private var currentFg: Color = Color.White
    private var currentBg: Color = Color.Transparent
    private var bold = false
    private var italic = false
    private var underline = false

    // Alternate screen buffer (for vim, etc.)
    private var alternateBuffer: MutableList<MutableList<TerminalCell>>? = null
    private var savedCursorX = 0
    private var savedCursorY = 0

    // Scroll region
    private var scrollTop = 0
    private var scrollBottom = rows - 1

    // Escape sequence parser state
    private var escapeState = EscapeState.NORMAL
    private val escapeBuffer = StringBuilder()

    init {
        initializeBuffer()
    }

    private fun initializeBuffer() {
        screenBuffer.clear()
        for (y in 0 until rows) {
            screenBuffer.add(createEmptyRow())
        }
        scrollBottom = rows - 1
    }

    private fun createEmptyRow(): MutableList<TerminalCell> {
        return MutableList(cols) { TerminalCell() }
    }

    /**
     * Process incoming terminal data.
     */
    fun write(data: String) {
        for (char in data) {
            processChar(char)
        }
    }

    private fun processChar(char: Char) {
        when (escapeState) {
            EscapeState.NORMAL -> processNormalChar(char)
            EscapeState.ESCAPE -> processEscapeChar(char)
            EscapeState.CSI -> processCsiChar(char)
            EscapeState.OSC -> processOscChar(char)
            EscapeState.CHARSET -> processCharsetChar(char)
        }
    }

    private fun processNormalChar(char: Char) {
        when (char) {
            '\u001b' -> { // ESC
                escapeState = EscapeState.ESCAPE
                escapeBuffer.clear()
            }
            '\n' -> lineFeed()
            '\r' -> carriageReturn()
            '\t' -> tab()
            '\u0007' -> { /* Bell - ignore */ }
            '\u0008' -> backspace()
            else -> {
                if (char.code >= 32) {
                    putChar(char)
                }
            }
        }
    }

    private fun processEscapeChar(char: Char) {
        when (char) {
            '[' -> {
                escapeState = EscapeState.CSI
                escapeBuffer.clear()
            }
            ']' -> {
                escapeState = EscapeState.OSC
                escapeBuffer.clear()
            }
            '(' , ')' -> {
                escapeState = EscapeState.CHARSET
                escapeBuffer.clear()
                escapeBuffer.append(char)
            }
            '7' -> saveCursor()
            '8' -> restoreCursor()
            'D' -> lineFeed()
            'E' -> { carriageReturn(); lineFeed() }
            'M' -> reverseLineFeed()
            'c' -> reset()
            else -> escapeState = EscapeState.NORMAL
        }
    }

    private fun processCsiChar(char: Char) {
        if (char in '0'..'9' || char == ';' || char == '?' || char == '>' || char == '!') {
            escapeBuffer.append(char)
        } else {
            executeCsi(char)
            escapeState = EscapeState.NORMAL
        }
    }

    private fun processOscChar(char: Char) {
        if (char == '\u0007' || char == '\u001b') {
            // End of OSC sequence
            escapeState = EscapeState.NORMAL
        } else {
            escapeBuffer.append(char)
        }
    }

    private fun processCharsetChar(char: Char) {
        // Just consume one more character for charset designation
        escapeState = EscapeState.NORMAL
    }

    private fun executeCsi(command: Char) {
        val params = parseParams()

        when (command) {
            'A' -> cursorUp(params.getOrElse(0) { 1 })
            'B' -> cursorDown(params.getOrElse(0) { 1 })
            'C' -> cursorForward(params.getOrElse(0) { 1 })
            'D' -> cursorBack(params.getOrElse(0) { 1 })
            'E' -> { cursorY = minOf(cursorY + params.getOrElse(0) { 1 }, rows - 1); cursorX = 0 }
            'F' -> { cursorY = maxOf(cursorY - params.getOrElse(0) { 1 }, 0); cursorX = 0 }
            'G' -> cursorX = (params.getOrElse(0) { 1 } - 1).coerceIn(0, cols - 1)
            'H', 'f' -> setCursorPosition(params.getOrElse(0) { 1 }, params.getOrElse(1) { 1 })
            'J' -> eraseDisplay(params.getOrElse(0) { 0 })
            'K' -> eraseLine(params.getOrElse(0) { 0 })
            'L' -> insertLines(params.getOrElse(0) { 1 })
            'M' -> deleteLines(params.getOrElse(0) { 1 })
            'P' -> deleteChars(params.getOrElse(0) { 1 })
            'S' -> scrollUp(params.getOrElse(0) { 1 })
            'T' -> scrollDown(params.getOrElse(0) { 1 })
            'X' -> eraseChars(params.getOrElse(0) { 1 })
            '@' -> insertChars(params.getOrElse(0) { 1 })
            'd' -> cursorY = (params.getOrElse(0) { 1 } - 1).coerceIn(0, rows - 1)
            'm' -> setGraphicsMode(params)
            'n' -> handleDeviceStatus(params)
            'r' -> setScrollRegion(params.getOrElse(0) { 1 }, params.getOrElse(1) { rows })
            's' -> saveCursor()
            'u' -> restoreCursor()
            'h' -> setMode(params, true)
            'l' -> setMode(params, false)
            'c' -> { /* Device attributes - ignore */ }
            't' -> { /* Window manipulation - ignore */ }
        }
    }

    private fun parseParams(): List<Int> {
        if (escapeBuffer.isEmpty()) return emptyList()

        val paramStr = escapeBuffer.toString()
            .removePrefix("?")
            .removePrefix(">")
            .removePrefix("!")

        return paramStr.split(';')
            .mapNotNull { it.toIntOrNull() }
    }

    private fun putChar(char: Char) {
        if (cursorX >= cols) {
            cursorX = 0
            lineFeed()
        }

        ensureRow(cursorY)
        screenBuffer[cursorY][cursorX] = TerminalCell(
            char = char,
            fg = currentFg,
            bg = currentBg,
            bold = bold,
            italic = italic,
            underline = underline
        )
        cursorX++
    }

    private fun ensureRow(y: Int) {
        while (screenBuffer.size <= y) {
            screenBuffer.add(createEmptyRow())
        }
        while (screenBuffer[y].size < cols) {
            screenBuffer[y].add(TerminalCell())
        }
    }

    private fun lineFeed() {
        if (cursorY >= scrollBottom) {
            scrollUp(1)
        } else {
            cursorY++
        }
    }

    private fun reverseLineFeed() {
        if (cursorY <= scrollTop) {
            scrollDown(1)
        } else {
            cursorY--
        }
    }

    private fun carriageReturn() {
        cursorX = 0
    }

    private fun tab() {
        cursorX = ((cursorX / 8) + 1) * 8
        if (cursorX >= cols) cursorX = cols - 1
    }

    private fun backspace() {
        if (cursorX > 0) cursorX--
    }

    private fun cursorUp(n: Int) {
        cursorY = maxOf(scrollTop, cursorY - n)
    }

    private fun cursorDown(n: Int) {
        cursorY = minOf(scrollBottom, cursorY + n)
    }

    private fun cursorForward(n: Int) {
        cursorX = minOf(cols - 1, cursorX + n)
    }

    private fun cursorBack(n: Int) {
        cursorX = maxOf(0, cursorX - n)
    }

    private fun setCursorPosition(row: Int, col: Int) {
        cursorY = (row - 1).coerceIn(0, rows - 1)
        cursorX = (col - 1).coerceIn(0, cols - 1)
    }

    private fun eraseDisplay(mode: Int) {
        when (mode) {
            0 -> { // Erase from cursor to end
                eraseLine(0)
                for (y in (cursorY + 1) until rows) {
                    ensureRow(y)
                    for (x in 0 until cols) {
                        screenBuffer[y][x] = TerminalCell()
                    }
                }
            }
            1 -> { // Erase from start to cursor
                eraseLine(1)
                for (y in 0 until cursorY) {
                    ensureRow(y)
                    for (x in 0 until cols) {
                        screenBuffer[y][x] = TerminalCell()
                    }
                }
            }
            2, 3 -> { // Erase entire display
                for (y in 0 until rows) {
                    ensureRow(y)
                    for (x in 0 until cols) {
                        screenBuffer[y][x] = TerminalCell()
                    }
                }
            }
        }
    }

    private fun eraseLine(mode: Int) {
        ensureRow(cursorY)
        when (mode) {
            0 -> { // Erase from cursor to end
                for (x in cursorX until cols) {
                    screenBuffer[cursorY][x] = TerminalCell()
                }
            }
            1 -> { // Erase from start to cursor
                for (x in 0..cursorX) {
                    screenBuffer[cursorY][x] = TerminalCell()
                }
            }
            2 -> { // Erase entire line
                for (x in 0 until cols) {
                    screenBuffer[cursorY][x] = TerminalCell()
                }
            }
        }
    }

    private fun insertLines(n: Int) {
        for (i in 0 until n) {
            if (cursorY in scrollTop..scrollBottom) {
                screenBuffer.add(cursorY, createEmptyRow())
                if (scrollBottom < screenBuffer.size) {
                    screenBuffer.removeAt(scrollBottom + 1)
                }
            }
        }
    }

    private fun deleteLines(n: Int) {
        for (i in 0 until n) {
            if (cursorY in scrollTop..scrollBottom) {
                screenBuffer.removeAt(cursorY)
                screenBuffer.add(scrollBottom, createEmptyRow())
            }
        }
    }

    private fun deleteChars(n: Int) {
        ensureRow(cursorY)
        for (i in 0 until n) {
            if (cursorX < cols) {
                screenBuffer[cursorY].removeAt(cursorX)
                screenBuffer[cursorY].add(TerminalCell())
            }
        }
    }

    private fun insertChars(n: Int) {
        ensureRow(cursorY)
        for (i in 0 until n) {
            screenBuffer[cursorY].add(cursorX, TerminalCell())
            if (screenBuffer[cursorY].size > cols) {
                screenBuffer[cursorY].removeAt(cols)
            }
        }
    }

    private fun eraseChars(n: Int) {
        ensureRow(cursorY)
        for (i in 0 until n) {
            if (cursorX + i < cols) {
                screenBuffer[cursorY][cursorX + i] = TerminalCell()
            }
        }
    }

    private fun scrollUp(n: Int) {
        for (i in 0 until n) {
            if (scrollTop < screenBuffer.size) {
                screenBuffer.removeAt(scrollTop)
            }
            val insertPos = minOf(scrollBottom, screenBuffer.size)
            screenBuffer.add(insertPos, createEmptyRow())
        }
    }

    private fun scrollDown(n: Int) {
        for (i in 0 until n) {
            if (scrollBottom < screenBuffer.size) {
                screenBuffer.removeAt(scrollBottom)
            }
            screenBuffer.add(scrollTop, createEmptyRow())
        }
    }

    private fun setScrollRegion(top: Int, bottom: Int) {
        scrollTop = (top - 1).coerceIn(0, rows - 1)
        scrollBottom = (bottom - 1).coerceIn(0, rows - 1)
        if (scrollTop > scrollBottom) {
            val temp = scrollTop
            scrollTop = scrollBottom
            scrollBottom = temp
        }
        cursorX = 0
        cursorY = scrollTop
    }

    private fun saveCursor() {
        savedCursorX = cursorX
        savedCursorY = cursorY
    }

    private fun restoreCursor() {
        cursorX = savedCursorX
        cursorY = savedCursorY
    }

    private fun setGraphicsMode(params: List<Int>) {
        val p = if (params.isEmpty()) listOf(0) else params
        var i = 0
        while (i < p.size) {
            when (p[i]) {
                0 -> resetAttributes()
                1 -> bold = true
                3 -> italic = true
                4 -> underline = true
                22 -> bold = false
                23 -> italic = false
                24 -> underline = false
                in 30..37 -> currentFg = ansiColor(p[i] - 30)
                38 -> {
                    if (i + 2 < p.size && p[i + 1] == 5) {
                        currentFg = color256(p[i + 2])
                        i += 2
                    } else if (i + 4 < p.size && p[i + 1] == 2) {
                        currentFg = Color(p[i + 2], p[i + 3], p[i + 4])
                        i += 4
                    }
                }
                39 -> currentFg = Color.White
                in 40..47 -> currentBg = ansiColor(p[i] - 40)
                48 -> {
                    if (i + 2 < p.size && p[i + 1] == 5) {
                        currentBg = color256(p[i + 2])
                        i += 2
                    } else if (i + 4 < p.size && p[i + 1] == 2) {
                        currentBg = Color(p[i + 2], p[i + 3], p[i + 4])
                        i += 4
                    }
                }
                49 -> currentBg = Color.Transparent
                in 90..97 -> currentFg = ansiBrightColor(p[i] - 90)
                in 100..107 -> currentBg = ansiBrightColor(p[i] - 100)
            }
            i++
        }
    }

    private fun resetAttributes() {
        currentFg = Color.White
        currentBg = Color.Transparent
        bold = false
        italic = false
        underline = false
    }

    private fun handleDeviceStatus(params: List<Int>) {
        // Device status reports - typically need to send response
        // For now, just ignore
    }

    private fun setMode(params: List<Int>, enable: Boolean) {
        val isPrivate = escapeBuffer.startsWith("?")
        for (param in params) {
            if (isPrivate) {
                when (param) {
                    1 -> { /* Application cursor keys */ }
                    7 -> { /* Auto-wrap mode */ }
                    12 -> { /* Cursor blink */ }
                    25 -> { /* Cursor visible */ }
                    47, 1047 -> { /* Alternate screen buffer */ }
                    1049 -> {
                        if (enable) {
                            // Switch to alternate buffer
                            alternateBuffer = screenBuffer.map { it.toMutableList() }.toMutableList()
                            initializeBuffer()
                            saveCursor()
                        } else {
                            // Restore main buffer
                            alternateBuffer?.let { alt ->
                                screenBuffer.clear()
                                screenBuffer.addAll(alt)
                            }
                            alternateBuffer = null
                            restoreCursor()
                        }
                    }
                    2004 -> { /* Bracketed paste mode */ }
                }
            }
        }
    }

    private fun reset() {
        initializeBuffer()
        cursorX = 0
        cursorY = 0
        resetAttributes()
        scrollTop = 0
        scrollBottom = rows - 1
    }

    /**
     * Resize the terminal.
     * Preserves content by removing from bottom (not top) when shrinking.
     */
    fun resize(newCols: Int, newRows: Int) {
        val oldRows = rows
        cols = newCols
        rows = newRows
        scrollBottom = rows - 1

        // Adjust buffer size - preserve content from top
        while (screenBuffer.size < rows) {
            // Add empty rows at bottom when growing
            screenBuffer.add(createEmptyRow())
        }
        while (screenBuffer.size > rows) {
            // Remove from bottom when shrinking to preserve visible content
            screenBuffer.removeAt(screenBuffer.size - 1)
        }

        // Adjust row widths
        for (row in screenBuffer) {
            while (row.size < cols) {
                row.add(TerminalCell())
            }
            while (row.size > cols) {
                row.removeAt(row.size - 1)
            }
        }

        // Adjust cursor - keep it visible
        cursorX = cursorX.coerceIn(0, cols - 1)
        cursorY = cursorY.coerceIn(0, rows - 1)
    }

    /**
     * Get current screen content.
     */
    fun getScreen(): List<List<TerminalCell>> {
        return screenBuffer.toList()
    }

    /**
     * Get cursor position.
     */
    fun getCursor(): Pair<Int, Int> = Pair(cursorX, cursorY)

    /**
     * Get terminal dimensions.
     */
    fun getDimensions(): Pair<Int, Int> = Pair(cols, rows)

    companion object {
        private fun ansiColor(index: Int): Color = when (index) {
            0 -> Color(0xFF000000) // Black
            1 -> Color(0xFFCD0000) // Red
            2 -> Color(0xFF00CD00) // Green
            3 -> Color(0xFFCDCD00) // Yellow
            4 -> Color(0xFF0000EE) // Blue
            5 -> Color(0xFFCD00CD) // Magenta
            6 -> Color(0xFF00CDCD) // Cyan
            7 -> Color(0xFFE5E5E5) // White
            else -> Color.White
        }

        private fun ansiBrightColor(index: Int): Color = when (index) {
            0 -> Color(0xFF7F7F7F) // Bright black (gray)
            1 -> Color(0xFFFF0000) // Bright red
            2 -> Color(0xFF00FF00) // Bright green
            3 -> Color(0xFFFFFF00) // Bright yellow
            4 -> Color(0xFF5C5CFF) // Bright blue
            5 -> Color(0xFFFF00FF) // Bright magenta
            6 -> Color(0xFF00FFFF) // Bright cyan
            7 -> Color(0xFFFFFFFF) // Bright white
            else -> Color.White
        }

        private fun color256(index: Int): Color {
            return when {
                index < 16 -> if (index < 8) ansiColor(index) else ansiBrightColor(index - 8)
                index < 232 -> {
                    // 216 color cube
                    val i = index - 16
                    val r = (i / 36) * 51
                    val g = ((i / 6) % 6) * 51
                    val b = (i % 6) * 51
                    Color(r, g, b)
                }
                else -> {
                    // Grayscale
                    val gray = (index - 232) * 10 + 8
                    Color(gray, gray, gray)
                }
            }
        }
    }

    private enum class EscapeState {
        NORMAL, ESCAPE, CSI, OSC, CHARSET
    }
}

/**
 * Single cell in the terminal screen.
 */
data class TerminalCell(
    val char: Char = ' ',
    val fg: Color = Color.White,
    val bg: Color = Color.Transparent,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false
)
