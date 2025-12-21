//
//  TerminalView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Terminal emulator view using SwiftTerm
struct TerminalView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)?
    @EnvironmentObject private var appState: AppState
    @StateObject private var viewModel: TerminalViewModel
    @State private var showConnectionPopover = false
    @State private var showTerminateConfirmation = false
    @Environment(\.isDrawerOpen) private var isDrawerOpen
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    init(
        session: Session,
        columnVisibility: Binding<NavigationSplitViewVisibility>,
        onMenuTap: (() -> Void)? = nil,
        connectionService: ConnectionServicing
    ) {
        self.session = session
        self._columnVisibility = columnVisibility
        self.onMenuTap = onMenuTap
        
        // Create view model with dependencies from AppState
        // Note: The session ID might be updated later by AppState when the backend responds
        // The view model will observe session changes via the connectionService
        self._viewModel = StateObject(
            wrappedValue: TerminalViewModel(
                session: session,
                webSocketClient: connectionService.webSocketClient,
                connectionService: connectionService
            )
        )
    }
    
    /// Check if running in screenshot testing mode
    private var isScreenshotTesting: Bool {
        ProcessInfo.processInfo.environment["SCREENSHOT_TESTING"] == "1"
    }

    var body: some View {
        ZStack {
            // Main terminal content
            VStack(spacing: 0) {
                if isScreenshotTesting {
                    // Mock terminal view for App Store screenshots
                    MockTerminalView()
                } else if viewModel.isConnected && viewModel.terminalState != .sessionLost {
                    TerminalContentView(
                        viewModel: viewModel
                    )
                    .background(Color(uiColor: .systemBackground))
                } else if viewModel.terminalState == .sessionLost {
                    // Session lost - show in main area (not as overlay)
                    SessionLostView {
                        handleCreateNewTerminal()
                    }
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "apple.terminal.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)

                        Text("Terminal Disconnected")
                            .font(.headline)
                            .foregroundStyle(.secondary)

                        if let error = viewModel.error {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(uiColor: .systemBackground))
                }
            }

            // State overlays (not shown in screenshot testing mode)
            if !isScreenshotTesting && (viewModel.terminalState == .replaying || viewModel.terminalState == .buffering) {
                TerminalLoadingOverlay(text: viewModel.terminalState == .replaying ? "Loading history..." : "Syncing...")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbarBackground(isScreenshotTesting ? Color.black : Color(uiColor: .systemBackground), for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(isScreenshotTesting ? .dark : nil, for: .navigationBar)
        .toolbar {
            // Show sidebar toggle only on compact width (iPhone, iPad portrait)
            if horizontalSizeClass == .compact {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        if let onMenuTap = onMenuTap {
                            // iPhone: open drawer
                            onMenuTap()
                        } else {
                            // iPad: toggle sidebar visibility
                            withAnimation {
                                columnVisibility = columnVisibility == .all ? .detailOnly : .all
                            }
                        }
                    } label: {
                        Image(systemName: "sidebar.leading")
                    }
                }
            }

            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text("Terminal")
                        .font(.headline)
                    if let subtitle = session.subtitle(relativeTo: appState.workspacesRoot) {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showConnectionPopover = true
                } label: {
                    ConnectionIndicator()
                }
                .popover(isPresented: $showConnectionPopover) {
                    ConnectionPopover()
                }
            }
            
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        showTerminateConfirmation = true
                    } label: {
                        Label("Terminate Session", systemImage: "xmark.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .toolbarBackground(.visible, for: .navigationBar)
        .confirmationDialog(
            "Terminate Terminal Session?",
            isPresented: $showTerminateConfirmation,
            titleVisibility: .visible
        ) {
            Button("Terminate", role: .destructive) {
                handleTerminateSession()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will end the terminal session. You can start a new one later.")
        }
        .onAppear {
            // Subscribe to session when view appears
            // This will automatically request replay from server to restore terminal history
            Task { @MainActor in
                await viewModel.subscribeToSession()
                // Make terminal first responder to show keyboard
                // Small delay to ensure view is fully laid out
                try? await Task.sleep(for: .milliseconds(100))
                viewModel.becomeFirstResponder()
            }
        }
        .onDisappear {
            // Unsubscribe when view disappears to clean up resources
            // State will be reloaded from server when view reappears
            viewModel.unsubscribeFromSession()
        }
        .onChange(of: isDrawerOpen) { _, newValue in
            if newValue {
                // Drawer opened - resign first responder to dismiss keyboard
                viewModel.resignFirstResponder()
            } else {
                // Drawer closed - restore first responder to allow keyboard input
                viewModel.becomeFirstResponder()
            }
        }
    }
    
    // MARK: - Actions

    private func handleTerminateSession() {
        // Terminate the session
        appState.terminateSession(session)

        // Select supervisor (already done in terminateSession)
        // Now handle UI navigation based on device
        if horizontalSizeClass == .compact {
            // iPhone: Open drawer to show supervisor selection
            // Delay to ensure session change and auto-close animation complete before opening drawer
            // The auto-close animation is 0.25s, so we wait 0.3s to ensure it finishes
            if let onMenuTap = onMenuTap {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    onMenuTap()
                }
            }
        }
        // iPad: Supervisor is already selected in terminateSession, sidebar is always visible
    }

    private func handleCreateNewTerminal() {
        // Remove the current (dead) session from the list
        appState.sessions.removeAll { $0.id == session.id }

        // Create a new terminal session
        appState.createSession(type: .terminal, workspace: session.workspace, project: session.project)
    }
}

// MARK: - Mock Terminal View for Screenshots

/// Mock terminal view for App Store screenshots
private struct MockTerminalView: View {
    var body: some View {
        VStack(spacing: 0) {
            // Dark header bar to match terminal theme
            HStack {
                Spacer()
            }
            .frame(height: 1)
            .background(Color(white: 0.15))

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    terminalLine("developer@macbook tiflis-code % ", command: "git status")
                    terminalOutput("On branch feature-auth")
                    terminalOutput("Your branch is up to date with 'origin/feature-auth'.")
                    terminalOutput("")
                    terminalOutput("Changes not staged for commit:")
                    terminalOutput("  (use \"git add <file>...\" to update)")
                    terminalOutput("")
                    terminalOutput("  modified:   src/auth/login.swift")
                    terminalOutput("  modified:   src/auth/session.swift")
                    terminalOutput("")
                    terminalLine("developer@macbook tiflis-code % ", command: "npm run test")
                    terminalOutput("")
                    terminalOutput("  PASS  src/auth/login.test.ts")
                    terminalOutput("  PASS  src/auth/session.test.ts")
                    terminalOutput("  PASS  src/utils/crypto.test.ts")
                    terminalOutput("")
                    terminalOutput("Test Suites: 3 passed, 3 total")
                    terminalOutput("Tests:       12 passed, 12 total")
                    terminalOutput("Time:        2.847s")
                    terminalOutput("")
                    terminalLine("developer@macbook tiflis-code % ", command: "")
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
    }

    private func terminalLine(_ prompt: String, command: String) -> some View {
        HStack(spacing: 0) {
            Text(prompt)
                .foregroundStyle(Color(red: 0.4, green: 0.8, blue: 0.4))
            Text(command)
                .foregroundStyle(.white)
            Spacer()
        }
        .font(.system(size: 13, weight: .regular, design: .monospaced))
    }

    private func terminalOutput(_ text: String) -> some View {
        Text(text.isEmpty ? " " : text)
            .foregroundStyle(.white)
            .font(.system(size: 13, weight: .regular, design: .monospaced))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        let appState = AppState()
        TerminalView(
            session: .mockTerminalSession,
            columnVisibility: .constant(.all),
            connectionService: appState.connectionService
        )
    }
    .environmentObject(AppState())
}
