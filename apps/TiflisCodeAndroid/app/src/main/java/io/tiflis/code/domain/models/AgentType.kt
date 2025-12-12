/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Configuration for an available agent type.
 * Can represent base agents (cursor, claude, opencode) or aliases.
 */
@Serializable
data class AgentConfig(
    val name: String,
    @SerialName("base_type")
    val baseType: String,
    val description: String = "",
    @SerialName("is_alias")
    val isAlias: Boolean = false
) {
    val sessionType: SessionType
        get() = SessionType.fromString(baseType) ?: SessionType.CLAUDE
}

/**
 * Configuration for a workspace.
 */
@Serializable
data class WorkspaceConfig(
    val name: String,
    val path: String? = null,  // Optional, not always present in sync.state
    val projects: List<ProjectConfig> = emptyList()
)

/**
 * Configuration for a project within a workspace.
 */
@Serializable
data class ProjectConfig(
    val name: String,
    val path: String? = null,  // Optional, not always present in sync.state
    @SerialName("is_git_repo")
    val isGitRepo: Boolean = false,
    @SerialName("default_branch")
    val defaultBranch: String? = null,
    val worktrees: List<String> = emptyList()
)
