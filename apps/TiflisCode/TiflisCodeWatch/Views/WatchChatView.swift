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

    /// Get content blocks for a message, splitting large text blocks into smaller chunks
    /// watchOS has a tiny screen - max ~4-5 lines per bubble
    /// Returns empty array if no displayable blocks (caller should skip rendering)
    private func messageBlocks(for message: Message) -> [MessageContentBlock] {
        // Don't show "..." placeholder - just return empty if no blocks
        // The streaming indicator handles the "thinking" state
        if message.contentBlocks.isEmpty {
            return []
        }

        var result: [MessageContentBlock] = []
        for block in message.contentBlocks {
            switch block {
            case .text(let id, let text):
                // Skip empty text blocks
                guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
                // Split large text blocks into smaller chunks
                let chunks = splitTextForWatch(text, baseId: id)
                result.append(contentsOf: chunks)
            case .code(let id, let language, let code):
                // Split large code blocks too
                let chunks = splitCodeForWatch(code, language: language, baseId: id)
                result.append(contentsOf: chunks)
            case .status, .cancel:
                // Skip status and cancel blocks on watchOS - they clutter the small screen
                continue
            default:
                // Other block types pass through unchanged
                result.append(block)
            }
        }
        return result
    }

    // MARK: - Text Splitting for watchOS

    /// Characters per line on watchOS (small screen, caption2 font)
    private let charsPerLine = 25

    /// Maximum lines per bubble on watchOS
    private let maxLinesPerBubble = 5

    /// Maximum characters per bubble
    private var maxCharsPerBubble: Int { charsPerLine * maxLinesPerBubble }

    /// Split text into chunks suitable for watchOS display
    private func splitTextForWatch(_ text: String, baseId: String) -> [MessageContentBlock] {
        let estimatedLines = estimateLineCount(text)

        // If text fits in one bubble, return as-is
        if estimatedLines <= maxLinesPerBubble {
            return [.text(id: baseId, text: text)]
        }

        // Split into chunks
        var chunks: [MessageContentBlock] = []
        var remaining = text
        var chunkIndex = 0

        while !remaining.isEmpty {
            let chunk = extractChunk(from: remaining, maxChars: maxCharsPerBubble)
            chunks.append(.text(id: "\(baseId)-chunk-\(chunkIndex)", text: chunk))
            remaining = String(remaining.dropFirst(chunk.count)).trimmingCharacters(in: .whitespacesAndNewlines)
            chunkIndex += 1

            // Safety limit to prevent infinite loops
            if chunkIndex > 50 { break }
        }

        return chunks
    }

    /// Split code into chunks suitable for watchOS display
    private func splitCodeForWatch(_ code: String, language: String?, baseId: String) -> [MessageContentBlock] {
        let lines = code.components(separatedBy: "\n")

        // If code fits in one bubble, return as-is
        if lines.count <= maxLinesPerBubble {
            return [.code(id: baseId, language: language, code: code)]
        }

        // Split by lines
        var chunks: [MessageContentBlock] = []
        var chunkIndex = 0
        var currentLines: [String] = []

        for line in lines {
            currentLines.append(line)

            if currentLines.count >= maxLinesPerBubble {
                let chunkCode = currentLines.joined(separator: "\n")
                // Only show language label on first chunk
                let chunkLang = chunkIndex == 0 ? language : nil
                chunks.append(.code(id: "\(baseId)-chunk-\(chunkIndex)", language: chunkLang, code: chunkCode))
                currentLines = []
                chunkIndex += 1
            }
        }

        // Flush remaining lines
        if !currentLines.isEmpty {
            let chunkCode = currentLines.joined(separator: "\n")
            let chunkLang = chunkIndex == 0 ? language : nil
            chunks.append(.code(id: "\(baseId)-chunk-\(chunkIndex)", language: chunkLang, code: chunkCode))
        }

        return chunks
    }

    /// Estimate line count based on text length and newlines
    private func estimateLineCount(_ text: String) -> Int {
        let newlineCount = text.components(separatedBy: "\n").count
        let wrappedLineCount = max(1, text.count / charsPerLine)
        return max(newlineCount, wrappedLineCount)
    }

    /// Extract a chunk of text, trying to break at natural boundaries
    private func extractChunk(from text: String, maxChars: Int) -> String {
        if text.count <= maxChars {
            return text
        }

        let searchWindow = String(text.prefix(maxChars))
        let minSplit = maxChars / 2

        // Try paragraph boundary (\n\n)
        if let range = searchWindow.range(of: "\n\n", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
            if offset > minSplit {
                return String(text.prefix(offset))
            }
        }

        // Try sentence boundary
        for delimiter in [". ", "! ", "? ", ".\n", "!\n", "?\n"] {
            if let range = searchWindow.range(of: delimiter, options: .backwards) {
                let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
                if offset > minSplit {
                    return String(text.prefix(offset))
                }
            }
        }

        // Try line boundary
        if let range = searchWindow.range(of: "\n", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
            if offset > minSplit {
                return String(text.prefix(offset))
            }
        }

        // Try word boundary
        if let range = searchWindow.range(of: " ", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.lowerBound)
            if offset > minSplit / 2 {
                return String(text.prefix(offset))
            }
        }

        // Hard split at max chars
        return searchWindow
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
