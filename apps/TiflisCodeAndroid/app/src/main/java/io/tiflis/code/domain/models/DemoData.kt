/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.domain.models

import java.util.UUID

/**
 * Mock data for Demo Mode.
 * Provides pre-populated sessions, messages, and configurations
 * for users to explore the app without a real workstation connection.
 */
object DemoData {

    // MARK: - Demo Sessions

    val supervisorSession = Session(
        id = "supervisor",
        type = SessionType.SUPERVISOR
    )

    val claudeSession = Session(
        id = "demo-claude",
        type = SessionType.CLAUDE,
        workspace = "tiflis",
        project = "tiflis-code",
        worktree = "feature-auth"
    )

    val cursorSession = Session(
        id = "demo-cursor",
        type = SessionType.CURSOR,
        workspace = "tiflis",
        project = "tiflis-web"
    )

    val terminalSession = Session(
        id = "demo-terminal",
        type = SessionType.TERMINAL,
        workingDir = "tiflis/tiflis-code"
    )

    val demoSessions: List<Session>
        get() = listOf(supervisorSession, claudeSession, cursorSession, terminalSession)

    // MARK: - Demo Workspaces

    val demoWorkspaces: List<WorkspaceConfig>
        get() = listOf(
            WorkspaceConfig(
                name = "tiflis",
                projects = listOf(
                    ProjectConfig(
                        name = "tiflis-code",
                        isGitRepo = true,
                        defaultBranch = "main"
                    ),
                    ProjectConfig(
                        name = "tiflis-web",
                        isGitRepo = true,
                        defaultBranch = "main"
                    )
                )
            ),
            WorkspaceConfig(
                name = "personal",
                projects = listOf(
                    ProjectConfig(
                        name = "dotfiles",
                        isGitRepo = true,
                        defaultBranch = "main"
                    ),
                    ProjectConfig(
                        name = "api-server",
                        isGitRepo = true,
                        defaultBranch = "main"
                    )
                )
            )
        )

    // MARK: - Demo Agents

    val demoAgents: List<AgentConfig>
        get() = listOf(
            AgentConfig(
                name = "claude",
                baseType = "claude",
                description = "Claude Code - AI coding assistant",
                isAlias = false
            ),
            AgentConfig(
                name = "cursor",
                baseType = "cursor",
                description = "Cursor - AI-powered code editor",
                isAlias = false
            ),
            AgentConfig(
                name = "opencode",
                baseType = "opencode",
                description = "OpenCode - Open source AI agent",
                isAlias = false
            ),
            AgentConfig(
                name = "terminal",
                baseType = "terminal",
                description = "Terminal - PTY shell access",
                isAlias = false
            )
        )

    // MARK: - Supervisor Messages

    fun supervisorMessages(): List<Message> {
        val welcomeBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Text(
                id = "demo-sv-1",
                text = """
                    Welcome to Tiflis Code Demo! I'm your AI Supervisor.

                    In this demo, you can explore:
                    • **Supervisor Chat** — Manage sessions and workspaces
                    • **Agent Sessions** — See AI coding assistants in action
                    • **Terminal** — View PTY terminal output

                    Try asking me about available workspaces or sessions!
                """.trimIndent()
            )
        )

        val userQueryBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Text(
                id = "demo-sv-2",
                text = "Show me my workspaces"
            )
        )

        val workspacesResponseBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Text(
                id = "demo-sv-3",
                text = """
                    Here are your workspaces:

                    📁 **tiflis**
                      └── tiflis-code (main, feature-auth)
                      └── tiflis-web (main)

                    📁 **personal**
                      └── dotfiles (main)
                      └── api-server (main)

                    Would you like me to create a session in one of these projects?
                """.trimIndent()
            ),
            MessageContentBlock.ActionButtons(
                id = "demo-sv-4",
                buttons = listOf(
                    ActionButton(
                        id = "btn-1",
                        title = "Create Claude Session",
                        style = ActionButtonStyle.PRIMARY,
                        action = ActionType.SendMessage("Create a Claude session in tiflis/tiflis-code")
                    ),
                    ActionButton(
                        id = "btn-2",
                        title = "Create Terminal",
                        style = ActionButtonStyle.SECONDARY,
                        action = ActionType.SendMessage("Create a terminal session")
                    )
                )
            )
        )

        return listOf(
            Message(
                sessionId = "supervisor",
                role = MessageRole.ASSISTANT,
                contentBlocks = welcomeBlocks
            ),
            Message(
                sessionId = "supervisor",
                role = MessageRole.USER,
                contentBlocks = userQueryBlocks
            ),
            Message(
                sessionId = "supervisor",
                role = MessageRole.ASSISTANT,
                contentBlocks = workspacesResponseBlocks
            )
        )
    }

    // MARK: - Claude Session Messages

    fun claudeSessionMessages(): List<Message> {
        val userRequestBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Text(
                id = "demo-cl-1",
                text = "Create a Kotlin login form with email and password validation"
            )
        )

        val assistantResponseBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Thinking(
                id = "demo-cl-2",
                text = "I need to create a Jetpack Compose login form with proper validation. I'll include email format validation, password length requirements, and clear error messaging."
            ),
            MessageContentBlock.ToolCall(
                id = "demo-cl-3",
                toolUseId = "tool_demo_001",
                name = "Read",
                input = "src/ui/LoginScreen.kt",
                output = "File does not exist yet",
                status = ToolStatus.COMPLETED
            ),
            MessageContentBlock.Text(
                id = "demo-cl-4",
                text = "I'll create a login form with email and password validation:"
            ),
            MessageContentBlock.Code(
                id = "demo-cl-5",
                language = "kotlin",
                code = """
                    @Composable
                    fun LoginScreen(
                        onLoginSuccess: () -> Unit
                    ) {
                        var email by remember { mutableStateOf("") }
                        var password by remember { mutableStateOf("") }
                        var emailError by remember { mutableStateOf<String?>(null) }
                        var passwordError by remember { mutableStateOf<String?>(null) }
                        var isLoading by remember { mutableStateOf(false) }

                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Welcome Back",
                                style = MaterialTheme.typography.headlineLarge
                            )

                            Spacer(modifier = Modifier.height(32.dp))

                            OutlinedTextField(
                                value = email,
                                onValueChange = {
                                    email = it
                                    emailError = validateEmail(it)
                                },
                                label = { Text("Email") },
                                isError = emailError != null,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Email
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            emailError?.let {
                                Text(
                                    text = it,
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            OutlinedTextField(
                                value = password,
                                onValueChange = {
                                    password = it
                                    passwordError = validatePassword(it)
                                },
                                label = { Text("Password") },
                                isError = passwordError != null,
                                visualTransformation = PasswordVisualTransformation(),
                                modifier = Modifier.fillMaxWidth()
                            )
                            passwordError?.let {
                                Text(
                                    text = it,
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }

                            Spacer(modifier = Modifier.height(24.dp))

                            Button(
                                onClick = { isLoading = true },
                                enabled = emailError == null && passwordError == null &&
                                    email.isNotEmpty() && password.isNotEmpty() && !isLoading,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (isLoading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(24.dp),
                                        color = MaterialTheme.colorScheme.onPrimary
                                    )
                                } else {
                                    Text("Sign In")
                                }
                            }
                        }
                    }

                    private fun validateEmail(email: String): String? {
                        if (email.isEmpty()) return null
                        val emailRegex = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}${'$'}"
                        return if (!email.matches(emailRegex.toRegex())) {
                            "Please enter a valid email address"
                        } else null
                    }

                    private fun validatePassword(password: String): String? {
                        if (password.isEmpty()) return null
                        return if (password.length < 8) {
                            "Password must be at least 8 characters"
                        } else null
                    }
                """.trimIndent()
            ),
            MessageContentBlock.ToolCall(
                id = "demo-cl-6",
                toolUseId = "tool_demo_002",
                name = "Write",
                input = "src/ui/LoginScreen.kt",
                output = "Created file with 85 lines",
                status = ToolStatus.COMPLETED
            ),
            MessageContentBlock.Text(
                id = "demo-cl-7",
                text = """
                    I've created a Jetpack Compose login screen with:

                    ✅ Email field with format validation
                    ✅ Password field with minimum length (8 chars)
                    ✅ Real-time validation feedback
                    ✅ Loading state for the sign-in button
                    ✅ Material Design 3 styling

                    Would you like me to add additional features like "Forgot Password" or biometric authentication?
                """.trimIndent()
            )
        )

        return listOf(
            Message(
                sessionId = "demo-claude",
                role = MessageRole.USER,
                contentBlocks = userRequestBlocks
            ),
            Message(
                sessionId = "demo-claude",
                role = MessageRole.ASSISTANT,
                contentBlocks = assistantResponseBlocks
            )
        )
    }

    // MARK: - Cursor Session Messages

    fun cursorSessionMessages(): List<Message> {
        val userRequestBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.Text(
                id = "demo-cur-1",
                text = "Optimize the React Dashboard component for better performance"
            )
        )

        val assistantResponseBlocks = mutableListOf<MessageContentBlock>(
            MessageContentBlock.ToolCall(
                id = "demo-cur-2",
                toolUseId = "tool_demo_003",
                name = "Read",
                input = "src/components/Dashboard.tsx",
                output = "Read 156 lines",
                status = ToolStatus.COMPLETED
            ),
            MessageContentBlock.Text(
                id = "demo-cur-3",
                text = "I've analyzed your Dashboard component and found several optimization opportunities:"
            ),
            MessageContentBlock.Code(
                id = "demo-cur-4",
                language = "typescript",
                code = """
                    import React, { useMemo, useCallback, memo } from 'react';

                    interface DashboardProps {
                      data: DataItem[];
                      onItemClick: (id: string) => void;
                    }

                    // Memoize the component to prevent unnecessary re-renders
                    export const Dashboard = memo(function Dashboard({
                      data,
                      onItemClick
                    }: DashboardProps) {

                      // Memoize expensive calculations
                      const processedData = useMemo(() => {
                        return data.map(item => ({
                          ...item,
                          formattedDate: formatDate(item.date),
                          category: categorize(item.type)
                        }));
                      }, [data]);

                      // Memoize callbacks to prevent child re-renders
                      const handleItemClick = useCallback((id: string) => {
                        onItemClick(id);
                      }, [onItemClick]);

                      return (
                        <div className="dashboard">
                          {processedData.map(item => (
                            <DashboardCard
                              key={item.id}
                              item={item}
                              onClick={handleItemClick}
                            />
                          ))}
                        </div>
                      );
                    });
                """.trimIndent()
            ),
            MessageContentBlock.ToolCall(
                id = "demo-cur-5",
                toolUseId = "tool_demo_004",
                name = "Edit",
                input = "src/components/Dashboard.tsx",
                output = "Applied useMemo, useCallback, and memo optimizations",
                status = ToolStatus.COMPLETED
            ),
            MessageContentBlock.Text(
                id = "demo-cur-6",
                text = """
                    Applied the following optimizations:

                    🚀 **useMemo** — Caches expensive data transformations
                    🚀 **useCallback** — Prevents child component re-renders
                    🚀 **React.memo** — Skips re-renders when props are unchanged

                    Estimated performance improvement: **40-60% fewer re-renders** on large datasets.
                """.trimIndent()
            )
        )

        return listOf(
            Message(
                sessionId = "demo-cursor",
                role = MessageRole.USER,
                contentBlocks = userRequestBlocks
            ),
            Message(
                sessionId = "demo-cursor",
                role = MessageRole.ASSISTANT,
                contentBlocks = assistantResponseBlocks
            )
        )
    }

    // MARK: - Agent Messages Map

    val agentMessages: Map<String, List<Message>>
        get() = mapOf(
            "demo-claude" to claudeSessionMessages(),
            "demo-cursor" to cursorSessionMessages()
        )

    // MARK: - Terminal Mock Output

    /**
     * Demo terminal output with cyan banner and prompt.
     * Uses CRLF for proper terminal line breaks.
     */
    val terminalOutput: String
        get() = "\u001B[1;36m╭──────────────────────────────────────╮\r\n│      DEMO MODE - Terminal            │\r\n│   Type 'help' for commands           │\r\n╰──────────────────────────────────────╯\u001B[0m\r\n\r\n\$ "

    // MARK: - Demo Response Generator

    /**
     * Generates a mock response based on user input keywords.
     * Used when user sends messages in demo mode.
     */
    fun generateDemoResponse(input: String): List<MessageContentBlock> {
        val lowercased = input.lowercase()

        if (lowercased.contains("workspace") || lowercased.contains("project")) {
            return listOf(
                MessageContentBlock.Text(
                    id = UUID.randomUUID().toString(),
                    text = """
                        Here are your demo workspaces:

                        📁 **tiflis** — tiflis-code, tiflis-web
                        📁 **personal** — dotfiles, api-server

                        _This is a demo. Connect to a real workstation to see your actual workspaces._
                    """.trimIndent()
                )
            )
        }

        if (lowercased.contains("session") || lowercased.contains("create")) {
            return listOf(
                MessageContentBlock.Text(
                    id = UUID.randomUUID().toString(),
                    text = """
                        In demo mode, you can explore the pre-created sessions:

                        • **Claude Code** — tiflis/tiflis-code
                        • **Cursor** — tiflis/tiflis-web
                        • **Terminal** — PTY shell

                        _Connect to a real workstation to create new sessions._
                    """.trimIndent()
                )
            )
        }

        if (lowercased.contains("help") || lowercased.contains("what can")) {
            return listOf(
                MessageContentBlock.Text(
                    id = UUID.randomUUID().toString(),
                    text = """
                        Welcome to Tiflis Code Demo! Here's what you can explore:

                        🤖 **AI Sessions** — See Claude and Cursor in action
                        💻 **Terminal** — View mock terminal output
                        ⚙️ **Settings** — Configure voice and connection

                        To unlock full functionality, connect to a real workstation by scanning a QR code or using a magic link.
                    """.trimIndent()
                )
            )
        }

        // Default response
        return listOf(
            MessageContentBlock.Text(
                id = UUID.randomUUID().toString(),
                text = """
                    This is a demo response. In a real session, your AI assistant would help you with: "$input"

                    _Connect to a workstation for full AI-powered coding assistance._
                """.trimIndent()
            )
        )
    }
}
