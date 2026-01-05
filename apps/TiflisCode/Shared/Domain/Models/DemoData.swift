//
//  DemoData.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Mock data for Demo Mode.
/// Provides pre-populated sessions, messages, and configurations
/// for users to explore the app without a real workstation connection.
enum DemoData {

    // MARK: - Demo Sessions

    static let supervisorSession = Session(id: "supervisor", type: .supervisor)

    static let claudeSession = Session(
        id: "demo-claude",
        type: .claude,
        workspace: "tiflis",
        project: "tiflis-code",
        worktree: "feature-auth"
    )

    static let cursorSession = Session(
        id: "demo-cursor",
        type: .cursor,
        workspace: "tiflis",
        project: "tiflis-web"
    )

    static let terminalSession = Session(
        id: "demo-terminal",
        type: .terminal,
        workingDir: "tiflis/tiflis-code"
    )

    static var demoSessions: [Session] {
        [supervisorSession, claudeSession, cursorSession, terminalSession]
    }

    // MARK: - Demo Workspaces

    static var demoWorkspaces: [WorkspaceConfig] {
        [
            WorkspaceConfig(
                name: "tiflis",
                projects: [
                    ProjectConfig(name: "tiflis-code", isGitRepo: true, defaultBranch: "main"),
                    ProjectConfig(name: "tiflis-web", isGitRepo: true, defaultBranch: "main")
                ]
            ),
            WorkspaceConfig(
                name: "personal",
                projects: [
                    ProjectConfig(name: "dotfiles", isGitRepo: true, defaultBranch: "main"),
                    ProjectConfig(name: "api-server", isGitRepo: true, defaultBranch: "main")
                ]
            )
        ]
    }

    // MARK: - Demo Agents

    static var demoAgents: [AgentConfig] {
        [
            AgentConfig(name: "claude", baseType: "claude", description: "Claude Code - AI coding assistant", isAlias: false),
            AgentConfig(name: "cursor", baseType: "cursor", description: "Cursor - AI-powered code editor", isAlias: false),
            AgentConfig(name: "opencode", baseType: "opencode", description: "OpenCode - Open source AI agent", isAlias: false),
            AgentConfig(name: "terminal", baseType: "terminal", description: "Terminal - PTY shell access", isAlias: false)
        ]
    }

    // MARK: - Supervisor Messages

    static func supervisorMessages() -> [Message] {
        let welcomeBlocks: [MessageContentBlock] = [
            .text(
                id: "demo-sv-1",
                text: """
                Welcome to Tiflis Code Demo! I'm your AI Supervisor.

                In this demo, you can explore:
                • **Supervisor Chat** — Manage sessions and workspaces
                • **Agent Sessions** — See AI coding assistants in action
                • **Terminal** — View PTY terminal output

                Try asking me about available workspaces or sessions!
                """
            )
        ]

        let userQueryBlocks: [MessageContentBlock] = [
            .text(id: "demo-sv-2", text: "Show me my workspaces")
        ]

        let workspacesResponseBlocks: [MessageContentBlock] = [
            .text(
                id: "demo-sv-3",
                text: """
                Here are your workspaces:

                📁 **tiflis**
                  └── tiflis-code (main, feature-auth)
                  └── tiflis-web (main)

                📁 **personal**
                  └── dotfiles (main)
                  └── api-server (main)

                Would you like me to create a session in one of these projects?
                """
            ),
            .actionButtons(
                id: "demo-sv-4",
                buttons: [
                    ActionButton(id: "btn-1", title: "Create Claude Session", style: .primary, action: .sendMessage("Create a Claude session in tiflis/tiflis-code")),
                    ActionButton(id: "btn-2", title: "Create Terminal", style: .secondary, action: .sendMessage("Create a terminal session"))
                ]
            )
        ]

        return [
            Message(
                sessionId: "supervisor",
                role: .assistant,
                contentBlocks: welcomeBlocks
            ),
            Message(
                sessionId: "supervisor",
                role: .user,
                contentBlocks: userQueryBlocks
            ),
            Message(
                sessionId: "supervisor",
                role: .assistant,
                contentBlocks: workspacesResponseBlocks
            )
        ]
    }

    // MARK: - Claude Session Messages

    static func claudeSessionMessages() -> [Message] {
        let userRequestBlocks: [MessageContentBlock] = [
            .text(id: "demo-cl-1", text: "Create a SwiftUI login form with email and password validation")
        ]

        let assistantResponseBlocks: [MessageContentBlock] = [
            .thinking(
                id: "demo-cl-2",
                text: "I need to create a SwiftUI login form with proper validation. I'll include email format validation, password length requirements, and clear error messaging."
            ),
            .toolCall(
                id: "demo-cl-3",
                toolUseId: "tool_demo_001",
                name: "Read",
                input: "src/Views/LoginView.swift",
                output: "File does not exist yet",
                status: .completed
            ),
            .text(
                id: "demo-cl-4",
                text: "I'll create a login form with email and password validation:"
            ),
            .code(
                id: "demo-cl-5",
                language: "swift",
                code: """
                import SwiftUI

                struct LoginView: View {
                    @State private var email = ""
                    @State private var password = ""
                    @State private var emailError: String?
                    @State private var passwordError: String?
                    @State private var isLoading = false

                    var body: some View {
                        VStack(spacing: 20) {
                            Text("Welcome Back")
                                .font(.largeTitle)
                                .fontWeight(.bold)

                            VStack(alignment: .leading, spacing: 8) {
                                TextField("Email", text: $email)
                                    .textFieldStyle(.roundedBorder)
                                    .textContentType(.emailAddress)
                                    .autocapitalization(.none)
                                    .onChange(of: email) { validateEmail() }

                                if let error = emailError {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundColor(.red)
                                }
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                SecureField("Password", text: $password)
                                    .textFieldStyle(.roundedBorder)
                                    .textContentType(.password)
                                    .onChange(of: password) { validatePassword() }

                                if let error = passwordError {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundColor(.red)
                                }
                            }

                            Button(action: login) {
                                if isLoading {
                                    ProgressView()
                                } else {
                                    Text("Sign In")
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!isValid || isLoading)
                        }
                        .padding()
                    }

                    private var isValid: Bool {
                        emailError == nil && passwordError == nil &&
                        !email.isEmpty && !password.isEmpty
                    }

                    private func validateEmail() {
                        let emailRegex = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"#
                        if email.isEmpty {
                            emailError = nil
                        } else if email.range(of: emailRegex, options: .regularExpression) == nil {
                            emailError = "Please enter a valid email address"
                        } else {
                            emailError = nil
                        }
                    }

                    private func validatePassword() {
                        if password.isEmpty {
                            passwordError = nil
                        } else if password.count < 8 {
                            passwordError = "Password must be at least 8 characters"
                        } else {
                            passwordError = nil
                        }
                    }

                    private func login() {
                        isLoading = true
                        // Authentication logic here
                    }
                }
                """
            ),
            .toolCall(
                id: "demo-cl-6",
                toolUseId: "tool_demo_002",
                name: "Write",
                input: "src/Views/LoginView.swift",
                output: "Created file with 78 lines",
                status: .completed
            ),
            .text(
                id: "demo-cl-7",
                text: """
                I've created a SwiftUI login form with:

                ✅ Email field with format validation
                ✅ Password field with minimum length (8 chars)
                ✅ Real-time validation feedback
                ✅ Loading state for the sign-in button
                ✅ Clean, modern design

                Would you like me to add additional features like "Forgot Password" or biometric authentication?
                """
            )
        ]

        return [
            Message(
                sessionId: "demo-claude",
                role: .user,
                contentBlocks: userRequestBlocks
            ),
            Message(
                sessionId: "demo-claude",
                role: .assistant,
                contentBlocks: assistantResponseBlocks
            )
        ]
    }

    // MARK: - Cursor Session Messages

    static func cursorSessionMessages() -> [Message] {
        let userRequestBlocks: [MessageContentBlock] = [
            .text(id: "demo-cur-1", text: "Optimize the React Dashboard component for better performance")
        ]

        let assistantResponseBlocks: [MessageContentBlock] = [
            .toolCall(
                id: "demo-cur-2",
                toolUseId: "tool_demo_003",
                name: "Read",
                input: "src/components/Dashboard.tsx",
                output: "Read 156 lines",
                status: .completed
            ),
            .text(
                id: "demo-cur-3",
                text: "I've analyzed your Dashboard component and found several optimization opportunities:"
            ),
            .code(
                id: "demo-cur-4",
                language: "typescript",
                code: """
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
                """
            ),
            .toolCall(
                id: "demo-cur-5",
                toolUseId: "tool_demo_004",
                name: "Edit",
                input: "src/components/Dashboard.tsx",
                output: "Applied useMemo, useCallback, and memo optimizations",
                status: .completed
            ),
            .text(
                id: "demo-cur-6",
                text: """
                Applied the following optimizations:

                🚀 **useMemo** — Caches expensive data transformations
                🚀 **useCallback** — Prevents child component re-renders
                🚀 **React.memo** — Skips re-renders when props are unchanged

                Estimated performance improvement: **40-60% fewer re-renders** on large datasets.
                """
            )
        ]

        return [
            Message(
                sessionId: "demo-cursor",
                role: .user,
                contentBlocks: userRequestBlocks
            ),
            Message(
                sessionId: "demo-cursor",
                role: .assistant,
                contentBlocks: assistantResponseBlocks
            )
        ]
    }

    // MARK: - Agent Messages Map

    static var agentMessages: [String: [Message]] {
        [
            "demo-claude": claudeSessionMessages(),
            "demo-cursor": cursorSessionMessages()
        ]
    }

    // MARK: - Terminal Mock Output

    static var terminalOutput: String {
        // Demo terminal with cyan banner and prompt
        // \u{1b}[1;36m = bold cyan, \u{1b}[0m = reset
        "\u{1b}[1;36m╭──────────────────────────────────────╮\r\n│      DEMO MODE - Terminal            │\r\n│   Type 'help' for commands           │\r\n╰──────────────────────────────────────╯\u{1b}[0m\r\n\r\n$ "
    }

    // MARK: - Demo Response Generator

    /// Generates a mock response based on user input keywords.
    /// Used when user sends messages in demo mode.
    static func generateDemoResponse(for input: String) -> [MessageContentBlock] {
        let lowercased = input.lowercased()

        if lowercased.contains("workspace") || lowercased.contains("project") {
            return [
                .text(
                    id: UUID().uuidString,
                    text: """
                    Here are your demo workspaces:

                    📁 **tiflis** — tiflis-code, tiflis-web
                    📁 **personal** — dotfiles, api-server

                    _This is a demo. Connect to a real workstation to see your actual workspaces._
                    """
                )
            ]
        }

        if lowercased.contains("session") || lowercased.contains("create") {
            return [
                .text(
                    id: UUID().uuidString,
                    text: """
                    In demo mode, you can explore the pre-created sessions:

                    • **Claude Code** — tiflis/tiflis-code
                    • **Cursor** — tiflis/tiflis-web
                    • **Terminal** — PTY shell

                    _Connect to a real workstation to create new sessions._
                    """
                )
            ]
        }

        if lowercased.contains("help") || lowercased.contains("what can") {
            return [
                .text(
                    id: UUID().uuidString,
                    text: """
                    Welcome to Tiflis Code Demo! Here's what you can explore:

                    🤖 **AI Sessions** — See Claude and Cursor in action
                    💻 **Terminal** — View mock terminal output
                    ⚙️ **Settings** — Configure voice and connection

                    To unlock full functionality, connect to a real workstation by scanning a QR code or using a magic link.
                    """
                )
            ]
        }

        // Default response
        return [
            .text(
                id: UUID().uuidString,
                text: """
                This is a demo response. In a real session, your AI assistant would help you with: "\(input)"

                _Connect to a workstation for full AI-powered coding assistance._
                """
            )
        ]
    }
}
