//
//  WatchChatView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Unified chat view for both Supervisor and Agent sessions
struct WatchChatView: View {
    let destination: WatchChatDestination
    @Binding var navigationPath: NavigationPath

    @EnvironmentObject var appState: WatchAppState
    @StateObject private var audioService = WatchAudioService.shared

    var body: some View {
        // Messages list - each content block is a separate bubble (like iOS)
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(messages.suffix(15)) { message in
                        // Split message into separate bubbles per content block
                        ForEach(Array(messageBlocks(for: message).enumerated()), id: \.offset) { index, block in
                            WatchMessageBlockBubble(
                                block: block,
                                role: message.role,
                                audioService: audioService
                            )
                            .id("\(message.id)-\(index)")
                        }

                        // Streaming indicator for the message
                        if message.isStreaming {
                            streamingIndicator(for: message)
                                .id("\(message.id)-streaming")
                        }

                        // Voice playback button (if message has voice output)
                        if let voiceOutput = message.voiceOutput {
                            voicePlaybackRow(voiceOutput: voiceOutput, role: message.role)
                                .id("\(message.id)-voice")
                        }
                    }

                    // Loading indicator
                    if isLoading && !hasStreamingMessage {
                        WatchLoadingRow()
                            .id("loading")
                    }
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 80)
            }
            .onAppear {
                scrollToBottom(proxy: proxy, animated: false)
            }
            .onChange(of: messages.count) { _, _ in
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: isLoading) { _, _ in
                scrollToBottom(proxy: proxy)
            }
        }
        .overlay(alignment: .bottom) {
            // Voice input button (centered, like iOS push-to-talk)
            WatchVoiceButton(audioService: audioService) { audioData, format in
                Task {
                    await sendVoiceCommand(audioData: audioData, format: format)
                }
            }
            .padding(.bottom, 8)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(navTitle)
        .tint(.white)
        .task {
            // Request chat history when view appears (lazy loading)
            await loadHistory()
        }
    }

    /// Get content blocks for a message, or a placeholder if empty
    private func messageBlocks(for message: Message) -> [MessageContentBlock] {
        if message.contentBlocks.isEmpty {
            return [.text(id: "empty-\(message.id)", text: "...")]
        }
        return message.contentBlocks
    }

    /// Streaming indicator view
    @ViewBuilder
    private func streamingIndicator(for message: Message) -> some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 20)
            }

            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 3, height: 3)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color.secondary.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if message.role == .assistant {
                Spacer(minLength: 20)
            }
        }
    }

    /// Voice playback button row
    @ViewBuilder
    private func voicePlaybackRow(voiceOutput: (audioURL: URL?, text: String, duration: TimeInterval), role: Message.MessageRole) -> some View {
        HStack {
            if role == .user {
                Spacer(minLength: 20)
            }

            VoicePlaybackButton(
                audioService: audioService,
                voiceOutput: voiceOutput
            )

            if role == .assistant {
                Spacer(minLength: 20)
            }
        }
    }

    /// Load chat history for this session (on-demand)
    /// Always requests full history to ensure we have all messages
    private func loadHistory() async {
        switch destination {
        case .supervisor:
            // Only load if no messages yet (supervisor history is usually pre-loaded)
            if appState.supervisorMessages.isEmpty {
                NSLog("⌚️ WatchChatView.loadHistory: requesting supervisor history")
                await appState.requestHistory(sessionId: nil)
            }
        case .agent(let session):
            // Always request history for agent sessions - we may have partial data from streaming
            // The history.response handler will clear and replace existing messages
            NSLog("⌚️ WatchChatView.loadHistory: requesting history for agent %@", session.id)
            await appState.requestHistory(sessionId: session.id)
        }
    }

    // MARK: - Computed Properties

    /// Navigation title string
    private var navTitle: String {
        switch destination {
        case .supervisor:
            return "Supervisor"
        case .agent(let session):
            return session.displayName
        }
    }

    @ViewBuilder
    private func sessionIcon(for session: Session) -> some View {
        if let customIcon = session.type.customIcon {
            Image(customIcon)
                .resizable()
                .scaledToFit()
        } else {
            Image(systemName: session.type.sfSymbol)
                .foregroundStyle(iconColor(for: session.type))
        }
    }

    private func iconColor(for type: Session.SessionType) -> Color {
        switch type {
        case .claude:
            return .orange
        case .cursor:
            return .blue
        case .opencode:
            return .green
        default:
            return .secondary
        }
    }

    private var messages: [Message] {
        let msgs: [Message]
        switch destination {
        case .supervisor:
            msgs = appState.supervisorMessages
            NSLog("⌚️ WatchChatView.messages (supervisor): count=%d", msgs.count)
        case .agent(let session):
            msgs = appState.messages(for: session.id)
            NSLog("⌚️ WatchChatView.messages (agent %@): count=%d", session.id, msgs.count)
        }
        return msgs
    }

    private var isLoading: Bool {
        switch destination {
        case .supervisor:
            return appState.supervisorIsLoading
        case .agent(let session):
            return appState.agentIsLoading[session.id] ?? false
        }
    }

    private var hasStreamingMessage: Bool {
        messages.contains { $0.isStreaming }
    }

    // MARK: - Methods

    private func scrollToBottom(proxy: ScrollViewProxy, animated: Bool = true) {
        if let lastMessage = messages.last {
            if animated {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(lastMessage.id, anchor: .bottom)
                }
            } else {
                proxy.scrollTo(lastMessage.id, anchor: .bottom)
            }
        } else if isLoading {
            if animated {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("loading", anchor: .bottom)
                }
            } else {
                proxy.scrollTo("loading", anchor: .bottom)
            }
        }
    }

    private func sendVoiceCommand(audioData: Data, format: String) async {
        switch destination {
        case .supervisor:
            await appState.sendSupervisorVoiceCommand(audioData: audioData, format: format)
        case .agent(let session):
            await appState.sendAgentVoiceCommand(audioData: audioData, format: format, sessionId: session.id)
        }
    }
}

#Preview {
    NavigationStack {
        WatchChatView(
            destination: .supervisor,
            navigationPath: .constant(NavigationPath())
        )
        .environmentObject(WatchAppState())
    }
}
