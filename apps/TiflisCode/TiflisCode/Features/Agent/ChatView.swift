//
//  ChatView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Unified chat interface for Supervisor and Agent sessions
struct ChatView: View {
    let session: Session
    @Binding var columnVisibility: NavigationSplitViewVisibility
    var onMenuTap: (() -> Void)?
    @StateObject private var viewModel: ChatViewModel
    @EnvironmentObject private var appState: AppState
    @State private var showConnectionPopover = false
    
    init(
        session: Session,
        columnVisibility: Binding<NavigationSplitViewVisibility>,
        onMenuTap: (() -> Void)? = nil
    ) {
        self.session = session
        self._columnVisibility = columnVisibility
        self.onMenuTap = onMenuTap
        self._viewModel = StateObject(wrappedValue: ChatViewModel(session: session))
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
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.messages) { message in
                                MessageBubble(message: message, sessionType: session.type)
                                    .id(message.id)
                            }
                            
                            // Typing indicator
                            if viewModel.isLoading {
                                TypingIndicator(sessionType: session.type)
                                    .id("typing")
                            }
                        }
                        .padding()
                    }
                    .onTapGesture {
                        hideKeyboard()
                    }
                    .onChange(of: viewModel.messages.count) { _, _ in
                        withAnimation {
                            if let lastMessage = viewModel.messages.last {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: viewModel.isLoading) { _, isLoading in
                        if isLoading {
                            withAnimation {
                                proxy.scrollTo("typing", anchor: .bottom)
                            }
                        }
                    }
                }
            }
            
            Divider()
            
            // Input bar
            PromptInputBar(
                text: $viewModel.inputText,
                isRecording: $viewModel.isRecording,
                onSend: viewModel.sendMessage,
                onStartRecording: viewModel.startRecording,
                onStopRecording: viewModel.stopRecording
            )
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
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
            
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text(session.type.displayName)
                        .font(.headline)
                    if let subtitle = session.subtitle {
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
    }
    
    @ViewBuilder
    private var sessionMenuContent: some View {
        switch session.type {
        case .supervisor:
            Button(role: .destructive) {
                viewModel.clearContext()
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
                appState.terminateSession(session)
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
}

// MARK: - Empty State

struct ChatEmptyState: View {
    let session: Session
    
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
                Text(session.type.displayName)
                    .font(.title2)
                    .fontWeight(.semibold)
                
                if let subtitle = session.subtitle {
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
    NavigationStack {
        ChatView(session: .mockSupervisor, columnVisibility: .constant(.all))
    }
    .environmentObject(AppState())
}

#Preview("Claude Session") {
    NavigationStack {
        ChatView(session: .mockClaudeSession, columnVisibility: .constant(.all))
    }
    .environmentObject(AppState())
}

#Preview("Empty State - Supervisor") {
    ChatEmptyState(session: .mockSupervisor)
}

#Preview("Empty State - Claude") {
    ChatEmptyState(session: .mockClaudeSession)
}
