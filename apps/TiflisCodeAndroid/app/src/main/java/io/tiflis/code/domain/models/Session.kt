/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant

/**
 * Terminal configuration received from workstation.
 */
@Serializable
data class TerminalConfig(
    @SerialName("buffer_size")
    val bufferSize: Int
)

/**
 * Represents a session type in the system.
 */
@Serializable
enum class SessionType {
    @SerialName("supervisor")
    SUPERVISOR,

    @SerialName("cursor")
    CURSOR,

    @SerialName("claude")
    CLAUDE,

    @SerialName("opencode")
    OPENCODE,

    @SerialName("terminal")
    TERMINAL,

    @SerialName("backlog-agent")
    BACKLOG_AGENT;

    val displayName: String
        get() = when (this) {
            SUPERVISOR -> "Supervisor"
            CURSOR -> "Cursor"
            CLAUDE -> "Claude Code"
            OPENCODE -> "OpenCode"
            TERMINAL -> "Terminal"
            BACKLOG_AGENT -> "Backlog"
        }

    val isAgent: Boolean
        get() = this in listOf(CURSOR, CLAUDE, OPENCODE)

    companion object {
        fun fromString(value: String): SessionType? = when (value.lowercase()) {
            "supervisor" -> SUPERVISOR
            "cursor" -> CURSOR
            "claude" -> CLAUDE
            "opencode" -> OPENCODE
            "terminal" -> TERMINAL
            "backlog-agent" -> BACKLOG_AGENT
            else -> null
        }
    }
}

/**
 * Represents the status of a session.
 */
@Serializable
enum class SessionStatus {
    @SerialName("active")
    ACTIVE,

    @SerialName("terminated")
    TERMINATED
}

/**
 * Represents a session (Supervisor, Agent, or Terminal).
 * Mirrors the iOS Session struct.
 */
data class Session(
    val id: String,
    val type: SessionType,
    /** Agent name (alias) if different from session type (e.g., "zai" for a claude alias) */
    val agentName: String? = null,
    val workspace: String? = null,
    val project: String? = null,
    val worktree: String? = null,
    val workingDir: String? = null,
    val status: SessionStatus = SessionStatus.ACTIVE,
    val createdAt: Instant = Instant.now(),
    val terminalConfig: TerminalConfig? = null
) {
    /**
     * Returns the display subtitle for the session, showing relative path from workspaces root.
     */
    fun subtitle(workspacesRoot: String?): String? {
        // Check if we have real workspace/project (not sentinel values used for terminal defaults)
        val hasRealWorkspace = workspace != null && workspace != "home"
        val hasRealProject = project != null && project != "default"

        // If we have real workspace/project, show that format (relative by nature)
        if (hasRealWorkspace && hasRealProject) {
            return if (worktree != null) {
                "$workspace/$project--$worktree"
            } else {
                "$workspace/$project"
            }
        }

        // Otherwise compute relative path from workspaces root
        val dir = workingDir ?: return if (!hasRealWorkspace && !hasRealProject) "~" else null
        val root = workspacesRoot
        if (root.isNullOrEmpty()) {
            // No root known - fallback to absolute path
            return dir
        }

        // Remove root prefix to get relative path
        return if (dir.startsWith(root)) {
            var relative = dir.removePrefix(root)
            // Remove leading slash if present
            if (relative.startsWith("/")) {
                relative = relative.removePrefix("/")
            }
            // Return "~" for empty relative path (at root)
            relative.ifEmpty { "~" }
        } else {
            // Path doesn't start with root - return as-is
            dir
        }
    }

    /**
     * Returns the display name for the session.
     * For agent sessions with aliases, shows: "Claude Code (zai)"
     * For regular sessions, shows the type's display name
     */
    val displayName: String
        get() = agentName?.let { "${type.displayName} ($it)" } ?: type.displayName

    companion object {
        val SUPERVISOR = Session(
            id = "supervisor",
            type = SessionType.SUPERVISOR
        )
    }
}
