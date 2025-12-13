//
//  ChatView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Unified chat interface for Supervisor and Agent sessions
struct ChatView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)?
    @StateObject private var viewModel: ChatViewModel
    @EnvironmentObject private var appState: AppState
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showConnectionPopover = false
    @State private var showTerminateConfirmation = false
    @State private var showClearContextConfirmation = false

    // Scroll state - hybrid approach:
    // - ScrollPosition for programmatic scrollTo (reliable)
    // - onScrollGeometryChange for detecting position (reliable)
    @State private var scrollPosition = ScrollPosition(edge: .bottom)
    @State private var isAtBottom = true
    @State private var lastScrollTime: Date = .distantPast

    /// Minimum interval between throttled scroll calls (100ms)
    private let scrollThrottleInterval: TimeInterval = 0.1

    /// Whether the agent is currently streaming a response
    private var isStreaming: Bool {
        viewModel.isLoading || viewModel.messages.last?.isStreaming == true
    }

    /// Total items in the list: messages + typing indicator (if streaming)
    private var totalItems: Int {
        viewModel.messages.count + (isStreaming ? 1 : 0)
    }

    init(
        session: Session,
        columnVisibility: Binding<NavigationSplitViewVisibility>,
        onMenuTap: (() -> Void)? = nil,
        connectionService: ConnectionServicing,
        appState: AppState? = nil
    ) {
        self.session = session
        self._columnVisibility = columnVisibility
        self.onMenuTap = onMenuTap
        self._viewModel = StateObject(wrappedValue: ChatViewModel(
            session: session,
            connectionService: connectionService,
            appState: appState
        ))
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Messages or Empty State
            if viewModel.messages.isEmpty && !viewModel.isLoading {
                // Empty state
                ChatEmptyState(session: session)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .onTapGesture {
                        hideKeyboard()
                    }
            } else {
                ZStack(alignment: .bottomTrailing) {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.displaySegments) { segment in
                                MessageSegmentBubble(
                                    segment: segment,
                                    originalMessage: viewModel.getMessage(for: segment.messageId),
                                    sessionType: session.type,
                                    onAction: viewModel.handleAction
                                )
                                .id(segment.id)
                            }

                            // Typing indicator - show when waiting for response or during streaming
                            if isStreaming {
                                TypingIndicator(sessionType: session.type)
                                    .id("typing-indicator")
                            }

                            // Bottom anchor - invisible view for scroll target
                            Color.clear
                                .frame(height: 1)
                                .id("bottom-anchor")
                        }
                        .padding()
                    }
                    .scrollPosition($scrollPosition)
                    .onTapGesture {
                        hideKeyboard()
                    }
                    // Track scroll position to detect when user scrolls away from bottom
                    .onScrollGeometryChange(for: Bool.self) { geometry in
                        // Consider "at bottom" if within threshold of the bottom
                        // Accounts for: overscroll bounce, content padding, and input bar overlap
                        let distanceFromBottom = geometry.contentSize.height - geometry.contentOffset.y - geometry.containerSize.height
                        return distanceFromBottom <= 200
                    } action: { _, newIsAtBottom in
                        // Always update state - geometry callback fires during scroll interactions
                        isAtBottom = newIsAtBottom
                    }
                    // Force scroll to bottom on any content update
                    .onChange(of: viewModel.scrollTrigger) { _, _ in
                        forceScrollToBottom()
                    }
                    // Initial scroll to bottom when view appears with messages
                    .onAppear {
                        if !viewModel.messages.isEmpty {
                            scrollPosition.scrollTo(id: "bottom-anchor", anchor: .bottom)
                        }
                    }

                    // Scroll to bottom FAB - floating over chat area (like Telegram)
                    // Show when user has scrolled away from bottom
                    if !isAtBottom && totalItems > 0 {
                        Button {
                            forceScrollToBottom()
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.1), radius: 2, x: 0, y: 1)
                        }
                        .padding(.trailing, 16)
                        .padding(.bottom, 16)
                        .transition(.opacity.combined(with: .scale))
                    }
                }
                .animation(.easeInOut(duration: 0.15), value: isAtBottom)
            }
            
            Divider()
            
            // Input bar
            PromptInputBar(
                text: $viewModel.inputText,
                isRecording: $viewModel.isRecording,
                isGenerating: isStreaming,
                onSend: {
                    forceScrollToBottom()
                    viewModel.sendMessage()
                },
                onStop: viewModel.stopGeneration,
                onStartRecording: viewModel.startRecording,
                onStopRecording: {
                    forceScrollToBottom()
                    viewModel.stopRecording()
                }
            )
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            // Show sidebar toggle only on compact width (iPhone, iPad portrait)
            // On regular width (iPad landscape, Mac) sidebar is always visible
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
                    Text(session.displayName)
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
                    sessionMenuContent
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog(
            "Terminate Agent Session?",
            isPresented: $showTerminateConfirmation,
            titleVisibility: .visible
        ) {
            Button("Terminate", role: .destructive) {
                handleTerminateSession()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will end the \(session.displayName) session. You can start a new one later.")
        }
        .confirmationDialog(
            "Clear Supervisor Context?",
            isPresented: $showClearContextConfirmation,
            titleVisibility: .visible
        ) {
            Button("Clear Context", role: .destructive) {
                viewModel.clearContext()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will clear all conversation history with the Supervisor. This action cannot be undone.")
        }
        .onAppear {
            // Refresh session state to sync messages from other devices
            viewModel.refreshSession()
        }
    }
    
    @ViewBuilder
    private var sessionMenuContent: some View {
        switch session.type {
        case .supervisor:
            Button(role: .destructive) {
                showClearContextConfirmation = true
            } label: {
                Label("Clear Context", systemImage: "trash")
            }
            
        case .cursor, .claude, .opencode:
            Button {
                // Session info action
            } label: {
                Label("Session Info", systemImage: "info.circle")
            }

            Button(role: .destructive) {
                showTerminateConfirmation = true
            } label: {
                Label("Terminate Session", systemImage: "xmark.circle")
            }
            
        case .terminal:
            Button(role: .destructive) {
                appState.terminateSession(session)
            } label: {
                Label("Terminate Session", systemImage: "xmark.circle")
            }
        }
    }

    private func handleTerminateSession() {
        appState.terminateSession(session)
    }

    /// Force scroll to bottom (for FAB button tap and send actions)
    private func forceScrollToBottom() {
        lastScrollTime = Date()
        scrollPosition.scrollTo(id: "bottom-anchor", anchor: .bottom)
        // Note: isAtBottom will be updated by onScrollGeometryChange when scroll completes
    }

    /// Throttled scroll to bottom - prevents excessive scroll calls during streaming
    private func throttledScrollToBottom() {
        let now = Date()
        guard now.timeIntervalSince(lastScrollTime) >= scrollThrottleInterval else {
            return
        }
        lastScrollTime = now
        scrollPosition.scrollTo(id: "bottom-anchor", anchor: .bottom)
    }
}

// MARK: - Empty State

struct ChatEmptyState: View {
    let session: Session
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            // Agent icon
            Group {
                if let customIcon = session.type.customIcon {
                    Image(customIcon)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                } else {
                    Image(systemName: session.type.sfSymbol)
                        .font(.system(size: 40))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            
            // Agent name and info
            VStack(spacing: 8) {
                Text(session.displayName)
                    .font(.title2)
                    .fontWeight(.semibold)
                
                if let subtitle = session.subtitle(relativeTo: appState.workspacesRoot) {
                    HStack(spacing: 4) {
                        Image(systemName: "folder")
                            .font(.caption)
                        Text(subtitle)
                            .font(.subheadline)
                    }
                    .foregroundStyle(.secondary)
                }
            }
            
            // Invitation message
            Text(invitationMessage)
                .font(.body)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Spacer()
            Spacer()
        }
    }
    
    private var invitationMessage: String {
        switch session.type {
        case .supervisor:
            return "Ask me to create sessions, manage projects, or explore your workspaces"
        case .cursor, .claude, .opencode:
            return "Send a message to start coding with AI assistance"
        case .terminal:
            return ""
        }
    }
}

// MARK: - Preview

#Preview("Supervisor") {
    let appState = AppState()
    return NavigationStack {
        ChatView(
            session: .mockSupervisor,
            columnVisibility: .constant(.all),
            connectionService: appState.connectionService,
            appState: appState
        )
    }
    .environmentObject(appState)
}

#Preview("Claude Session") {
    let appState = AppState()
    return NavigationStack {
        ChatView(
            session: .mockClaudeSession,
            columnVisibility: .constant(.all),
            connectionService: appState.connectionService,
            appState: appState
        )
    }
    .environmentObject(appState)
}

#Preview("Empty State - Supervisor") {
    ChatEmptyState(session: .mockSupervisor)
}

#Preview("Empty State - Claude") {
    ChatEmptyState(session: .mockClaudeSession)
}
