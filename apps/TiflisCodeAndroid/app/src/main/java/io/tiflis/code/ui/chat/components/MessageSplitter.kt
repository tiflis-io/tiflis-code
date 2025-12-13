/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import io.tiflis.code.domain.models.Message
import io.tiflis.code.domain.models.MessageContentBlock
import io.tiflis.code.domain.models.MessageRole
import java.time.Instant
import java.util.UUID

/**
 * Configuration for message splitting.
 */
data class MessageSplitterConfig(
    /** Maximum height units per segment (~17 lines per bubble) */
    val maxHeightUnitsPerSegment: Int = 17,
    /** Minimum height units to consider splitting */
    val minHeightUnitsToSplit: Int = 20
)

/**
 * Represents a segment of a split message for display.
 */
data class SplitMessageSegment(
    val id: String,
    val messageId: String,
    val contentBlocks: List<MessageContentBlock>,
    val segmentIndex: Int,
    val totalSegments: Int,
    val isFirstSegment: Boolean,
    val isLastSegment: Boolean,
    val isStreaming: Boolean,
    val showAvatar: Boolean,
    val showTimestamp: Boolean,
    val createdAt: Instant,
    val role: MessageRole
) {
    /** Is this a continuation segment (not first)? */
    val isContinuation: Boolean get() = !isFirstSegment
}

/**
 * Utility for splitting messages into display segments.
 */
object MessageSplitter {

    /** Approximate characters per line for height estimation */
    private const val CHARS_PER_LINE = 45

    /** Characters per height unit (one line = one unit) */
    private const val CHARS_PER_HEIGHT_UNIT = 45

    /**
     * Split a message into display segments based on estimated height.
     */
    fun split(
        message: Message,
        config: MessageSplitterConfig = MessageSplitterConfig()
    ): List<SplitMessageSegment> {
        // Don't split user messages
        if (message.role != MessageRole.ASSISTANT) {
            return listOf(createSingleSegment(message))
        }

        // Calculate total estimated height
        val totalHeight = message.contentBlocks.sumOf { estimatedHeightUnits(it) }

        // Don't split if under threshold
        if (totalHeight < config.minHeightUnitsToSplit) {
            return listOf(createSingleSegment(message))
        }

        // Split the message based on height units
        val segments = mutableListOf<MutableList<MessageContentBlock>>()
        var currentBlocks = mutableListOf<MessageContentBlock>()
        var currentHeight = 0

        for (block in message.contentBlocks) {
            val blockHeight = estimatedHeightUnits(block)

            // Check if adding this block exceeds threshold
            if (currentHeight + blockHeight > config.maxHeightUnitsPerSegment && currentHeight > 0) {
                // For text blocks, try to split them if they're large
                if (block is MessageContentBlock.Text && blockHeight > config.maxHeightUnitsPerSegment / 2) {
                    // Flush current segment first
                    if (currentBlocks.isNotEmpty()) {
                        segments.add(currentBlocks)
                        currentBlocks = mutableListOf()
                        currentHeight = 0
                    }

                    // Split the large text block
                    val maxCharsPerSegment = config.maxHeightUnitsPerSegment * CHARS_PER_HEIGHT_UNIT
                    val textParts = splitText(block.text, maxCharsPerSegment)

                    textParts.forEachIndexed { index, part ->
                        val partBlock = MessageContentBlock.Text(
                            id = "${block.id}-part-$index",
                            text = part
                        )

                        if (index < textParts.size - 1) {
                            segments.add(mutableListOf(partBlock))
                        } else {
                            currentBlocks.add(partBlock)
                            currentHeight = estimatedHeightUnits(partBlock)
                        }
                    }
                    continue
                }

                // Flush current segment before adding this block
                if (currentBlocks.isNotEmpty()) {
                    segments.add(currentBlocks)
                    currentBlocks = mutableListOf()
                    currentHeight = 0
                }
            }

            currentBlocks.add(block)
            currentHeight += blockHeight
        }

        // Flush remaining blocks
        if (currentBlocks.isNotEmpty()) {
            segments.add(currentBlocks)
        }

        // Handle edge case: no segments created
        if (segments.isEmpty()) {
            return listOf(createSingleSegment(message))
        }

        // Convert to SplitMessageSegment objects
        val totalSegments = segments.size
        return segments.mapIndexed { index, blocks ->
            SplitMessageSegment(
                id = "${message.id}-seg-$index",
                messageId = message.id,
                contentBlocks = blocks,
                segmentIndex = index,
                totalSegments = totalSegments,
                isFirstSegment = index == 0,
                isLastSegment = index == totalSegments - 1,
                isStreaming = message.isStreaming && index == totalSegments - 1,
                showAvatar = index == 0,
                showTimestamp = index == totalSegments - 1,
                createdAt = message.createdAt,
                role = message.role
            )
        }
    }

    // MARK: - Private Helpers

    private fun createSingleSegment(message: Message): SplitMessageSegment {
        return SplitMessageSegment(
            id = "${message.id}-seg-0",
            messageId = message.id,
            contentBlocks = message.contentBlocks.toList(),
            segmentIndex = 0,
            totalSegments = 1,
            isFirstSegment = true,
            isLastSegment = true,
            isStreaming = message.isStreaming,
            showAvatar = message.role == MessageRole.ASSISTANT,
            showTimestamp = true,
            createdAt = message.createdAt,
            role = message.role
        )
    }

    /**
     * Estimate the height of a block in "line units".
     * 1 unit ≈ 1 line of text height.
     */
    private fun estimatedHeightUnits(block: MessageContentBlock): Int {
        return when (block) {
            is MessageContentBlock.Text -> {
                // Count actual newlines + estimate wrapped lines
                val newlines = block.text.split("\n").size
                val estimatedWrappedLines = maxOf(1, block.text.length / CHARS_PER_LINE)
                maxOf(newlines, estimatedWrappedLines)
            }

            is MessageContentBlock.Code -> {
                // Code blocks: actual line count + 2 for header/padding
                val lines = block.code.split("\n").size
                lines + 2
            }

            is MessageContentBlock.ToolCall -> {
                // Collapsed tool call: icon + name + status ≈ 3 lines
                3
            }

            is MessageContentBlock.Thinking -> {
                // Collapsed by default: header only ≈ 2 lines
                2
            }

            is MessageContentBlock.Status -> {
                // Single line with spinner
                1
            }

            is MessageContentBlock.Error -> {
                // Error box with icon + text
                val lines = maxOf(1, block.text.length / CHARS_PER_LINE)
                lines + 1
            }

            is MessageContentBlock.VoiceInput -> {
                // Waveform + transcription ≈ 3 lines
                3
            }

            is MessageContentBlock.VoiceOutput -> {
                // Play button + waveform ≈ 2 lines
                2
            }

            is MessageContentBlock.ActionButtons -> {
                // Each button row ≈ 2 lines
                maxOf(1, block.buttons.size) * 2
            }
        }
    }

    /**
     * Split text at natural boundaries (paragraphs, sentences, words).
     */
    private fun splitText(text: String, maxLength: Int): List<String> {
        val parts = mutableListOf<String>()
        var remaining = text

        while (remaining.length > maxLength) {
            val splitPoint = findBestSplitPoint(remaining, maxLength)
            val part = remaining.substring(0, splitPoint).trim()
            if (part.isNotEmpty()) {
                parts.add(part)
            }
            remaining = remaining.substring(splitPoint).trimStart()
        }

        if (remaining.isNotEmpty()) {
            parts.add(remaining)
        }

        return if (parts.isEmpty()) listOf(text) else parts
    }

    private fun findBestSplitPoint(text: String, targetLength: Int): Int {
        val searchWindow = text.substring(0, minOf(targetLength, text.length))
        val minSplit = targetLength / 2

        // Try paragraph boundary first (\n\n)
        val paragraphIndex = searchWindow.lastIndexOf("\n\n")
        if (paragraphIndex > minSplit) {
            return paragraphIndex + 2
        }

        // Try sentence boundaries
        val sentenceDelimiters = listOf(". ", "! ", "? ", ".\n", "!\n", "?\n")
        for (delimiter in sentenceDelimiters) {
            val sentenceIndex = searchWindow.lastIndexOf(delimiter)
            if (sentenceIndex > minSplit) {
                return sentenceIndex + delimiter.length
            }
        }

        // Try line boundary
        val lineIndex = searchWindow.lastIndexOf("\n")
        if (lineIndex > minSplit) {
            return lineIndex + 1
        }

        // Try word boundary (space)
        val wordMinSplit = targetLength / 3
        val spaceIndex = searchWindow.lastIndexOf(" ")
        if (spaceIndex > wordMinSplit) {
            return spaceIndex + 1
        }

        // Last resort: hard split at target length
        return targetLength
    }
}
