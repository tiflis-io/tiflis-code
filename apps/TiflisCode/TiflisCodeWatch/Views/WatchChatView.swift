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
        // Messages list
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(messages.suffix(15)) { message in
                        WatchMessageRow(
                            message: message,
                            audioService: audioService
                        )
                        .id(message.id)
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

    /// Load chat history for this session (on-demand)
    private func loadHistory() async {
        switch destination {
        case .supervisor:
            // Only load if no messages yet
            if appState.supervisorMessages.isEmpty {
                await appState.requestHistory(sessionId: nil)
            }
        case .agent(let session):
            // Only load if no messages yet for this session
            if appState.messages(for: session.id).isEmpty {
                await appState.requestHistory(sessionId: session.id)
            }
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
