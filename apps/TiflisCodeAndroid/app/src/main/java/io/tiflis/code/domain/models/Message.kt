/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.UUID

/**
 * Represents a message role in chat.
 */
@Serializable
enum class MessageRole {
    @SerialName("user")
    USER,

    @SerialName("assistant")
    ASSISTANT,

    @SerialName("system")
    SYSTEM
}

/**
 * Send status for user messages.
 * Shows delivery status: pending (clock icon) -> sent (checkmark) -> failed (error icon)
 */
enum class MessageSendStatus {
    /** For assistant/system messages (not applicable) */
    NONE,
    /** Message is being sent (show clock icon) */
    PENDING,
    /** Message was acknowledged by server (show checkmark) */
    SENT,
    /** Message failed to send (show error icon with retry option) */
    FAILED
}

/**
 * Represents a chat message in a session.
 * Mirrors the iOS Message struct.
 */
data class Message(
    val id: String = UUID.randomUUID().toString(),
    val sessionId: String,
    val role: MessageRole,
    val contentBlocks: MutableList<MessageContentBlock> = mutableListOf(),
    var isStreaming: Boolean = false,
    val createdAt: Instant = Instant.now(),
    /** Send status for user messages (pending -> sent -> failed) */
    var sendStatus: MessageSendStatus = MessageSendStatus.NONE
) {
    /**
     * Convenience constructor for simple text messages.
     */
    constructor(
        id: String = UUID.randomUUID().toString(),
        sessionId: String,
        role: MessageRole,
        content: String,
        isStreaming: Boolean = false,
        createdAt: Instant = Instant.now(),
        sendStatus: MessageSendStatus = MessageSendStatus.NONE
    ) : this(
        id = id,
        sessionId = sessionId,
        role = role,
        contentBlocks = mutableListOf(
            MessageContentBlock.Text(
                id = UUID.randomUUID().toString(),
                text = content
            )
        ),
        isStreaming = isStreaming,
        createdAt = createdAt,
        sendStatus = sendStatus
    )

    // MARK: - Computed Properties

    /** Extracts plain text content from all text blocks */
    val textContent: String
        get() = contentBlocks
            .filterIsInstance<MessageContentBlock.Text>()
            .joinToString("\n") { it.text }

    /** Checks if message contains any code blocks */
    val hasCodeBlocks: Boolean
        get() = contentBlocks.any { it is MessageContentBlock.Code }

    /** Checks if message contains any tool calls */
    val hasToolCalls: Boolean
        get() = contentBlocks.any { it is MessageContentBlock.ToolCall }

    /** Checks if message contains thinking blocks */
    val hasThinking: Boolean
        get() = contentBlocks.any { it is MessageContentBlock.Thinking }

    /** Returns first voice input block if present */
    val voiceInput: MessageContentBlock.VoiceInput?
        get() = contentBlocks.filterIsInstance<MessageContentBlock.VoiceInput>().firstOrNull()

    /** Returns first voice output block if present */
    val voiceOutput: MessageContentBlock.VoiceOutput?
        get() = contentBlocks.filterIsInstance<MessageContentBlock.VoiceOutput>().firstOrNull()

    // MARK: - Mutating Methods

    /** Updates the last text block with new content (for streaming) */
    fun updateStreamingText(text: String) {
        val lastTextIndex = contentBlocks.indexOfLast { it is MessageContentBlock.Text }
        if (lastTextIndex >= 0) {
            val existingBlock = contentBlocks[lastTextIndex] as MessageContentBlock.Text
            contentBlocks[lastTextIndex] = existingBlock.copy(text = text)
        } else {
            contentBlocks.add(
                MessageContentBlock.Text(
                    id = UUID.randomUUID().toString(),
                    text = text
                )
            )
        }
    }

    /** Appends a new content block */
    fun appendBlock(block: MessageContentBlock) {
        contentBlocks.add(block)
    }

    /** Updates a tool call status by block ID */
    fun updateToolCallStatus(blockId: String, output: String?, status: ToolStatus) {
        val index = contentBlocks.indexOfFirst { it.id == blockId }
        if (index >= 0) {
            val block = contentBlocks[index]
            if (block is MessageContentBlock.ToolCall) {
                contentBlocks[index] = block.copy(output = output, status = status)
            }
        }
    }

    /** Updates a tool call by tool_use_id */
    fun updateToolCallByToolUseId(toolUseId: String, output: String?, status: ToolStatus) {
        val index = contentBlocks.indexOfFirst {
            it is MessageContentBlock.ToolCall && it.toolUseId == toolUseId
        }
        if (index >= 0) {
            val block = contentBlocks[index] as MessageContentBlock.ToolCall
            contentBlocks[index] = block.copy(output = output, status = status)
        }
    }

    /** Creates a copy with updated streaming status */
    fun withStreamingStatus(streaming: Boolean): Message {
        return Message(
            id = this.id,
            sessionId = this.sessionId,
            role = this.role,
            contentBlocks = this.contentBlocks.toMutableList(),
            isStreaming = streaming,
            createdAt = this.createdAt,
            sendStatus = this.sendStatus
        )
    }

    /** Creates a copy with updated send status */
    fun withSendStatus(status: MessageSendStatus): Message {
        return Message(
            id = this.id,
            sessionId = this.sessionId,
            role = this.role,
            contentBlocks = this.contentBlocks.toMutableList(),
            isStreaming = this.isStreaming,
            createdAt = this.createdAt,
            sendStatus = status
        )
    }
}
