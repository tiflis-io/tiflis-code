/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Status of a tool call execution.
 */
@Serializable
enum class ToolStatus {
    @SerialName("running")
    RUNNING,

    @SerialName("completed")
    COMPLETED,

    @SerialName("failed")
    FAILED
}

/**
 * Visual style for action buttons.
 */
@Serializable
enum class ActionButtonStyle {
    @SerialName("primary")
    PRIMARY,

    @SerialName("secondary")
    SECONDARY,

    @SerialName("destructive")
    DESTRUCTIVE
}

/**
 * Type of action to perform when button is tapped.
 */
sealed class ActionType {
    data class SendMessage(val message: String) : ActionType()
    data class CreateSession(val sessionType: SessionType) : ActionType()
    data class OpenUrl(val url: String) : ActionType()
    data class Custom(val action: String) : ActionType()
}

/**
 * Represents an action button that can be displayed in a message.
 */
data class ActionButton(
    val id: String = java.util.UUID.randomUUID().toString(),
    val title: String,
    val icon: String? = null,
    val style: ActionButtonStyle = ActionButtonStyle.SECONDARY,
    val action: ActionType
)

/**
 * Represents a single content block within a message.
 * Messages can contain multiple blocks of different types.
 * Uses sealed class pattern (Kotlin equivalent of Swift enum with associated values).
 */
sealed class MessageContentBlock {
    abstract val id: String

    data class Text(
        override val id: String,
        val text: String
    ) : MessageContentBlock()

    data class Code(
        override val id: String,
        val language: String?,
        val code: String
    ) : MessageContentBlock()

    data class ToolCall(
        override val id: String,
        val toolUseId: String?,
        val name: String,
        val input: String?,
        val output: String?,
        val status: ToolStatus
    ) : MessageContentBlock()

    data class Thinking(
        override val id: String,
        val text: String
    ) : MessageContentBlock()

    data class Status(
        override val id: String,
        val text: String
    ) : MessageContentBlock()

    data class Error(
        override val id: String,
        val text: String
    ) : MessageContentBlock()

    data class VoiceInput(
        override val id: String,
        val audioUrl: String?,
        val transcription: String?,
        val durationMs: Long
    ) : MessageContentBlock()

    data class VoiceOutput(
        override val id: String,
        val audioUrl: String?,
        val audioData: String? = null,
        val text: String,
        val durationMs: Long,
        val messageId: String? = null  // Used to request audio from server
    ) : MessageContentBlock()

    data class ActionButtons(
        override val id: String,
        val buttons: List<ActionButton>
    ) : MessageContentBlock()

    /** Returns the tool_use_id for tool calls, used for matching results with their calls */
    fun asToolUseId(): String? = (this as? ToolCall)?.toolUseId
}
