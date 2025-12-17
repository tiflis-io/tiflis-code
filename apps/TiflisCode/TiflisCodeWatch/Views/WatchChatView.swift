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

    // MARK: - Scroll Throttling

    /// Task for throttled scroll-to-bottom
    @State private var scrollTask: Task<Void, Never>?

    /// Minimum interval between scroll operations (milliseconds)
    private let scrollThrottleInterval: UInt64 = 300

    /// Last scroll timestamp for throttling
    @State private var lastScrollTime: Date = .distantPast

    // MARK: - Confirmation Dialogs

    /// Whether to show the stop confirmation dialog
    @State private var showStopConfirmation = false

    /// Whether to show the clear context confirmation dialog
    @State private var showClearContextConfirmation = false

    /// Track if view has appeared (to prevent re-scroll on state changes)
    @State private var hasAppeared = false

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
                                audioService: audioService,
                                requestAudio: { messageId in
                                    await appState.connectionService?.requestAudio(messageId: messageId)
                                }
                            )
                            .id("\(message.id)-\(index)")
                        }

                        // Streaming indicator for message with empty blocks
                        if message.isStreaming && message.contentBlocks.isEmpty {
                            streamingIndicator(for: message)
                                .id("\(message.id)-streaming")
                        }
                    }

                    // Loading indicator - ALWAYS show when agent is working
                    // This ensures animated dots are visible during agent processing
                    if isLoading {
                        WatchLoadingRow()
                            .id("loading")
                    }
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 80)
            }
            .onAppear {
                // Only scroll on true initial appearance, not on view rebuilds
                if !hasAppeared {
                    hasAppeared = true
                    scrollToBottomThrottled(proxy: proxy)
                }
            }
            .onChange(of: messages.count) { oldCount, newCount in
                // Only scroll when messages are ADDED (not on initial load or removal)
                if newCount > oldCount {
                    scrollToBottomThrottled(proxy: proxy)
                }
            }
            .onChange(of: isLoading) { oldValue, newValue in
                // Only scroll when loading STARTS (false -> true)
                // Don't scroll when loading stops - user might be reading
                if !oldValue && newValue {
                    scrollToBottomImmediate(proxy: proxy)
                }
            }
            .onChange(of: lastMessageBlockCount) { oldCount, newCount in
                // Only scroll when blocks are ADDED (streaming new content)
                if newCount > oldCount {
                    scrollToBottomThrottled(proxy: proxy)
                }
            }
            .onDisappear {
                // Cancel pending scroll task when view disappears
                scrollTask?.cancel()
                scrollTask = nil
            }
            .overlay(alignment: .bottom) {
                // Bottom action buttons - main button centered, FAB to the right
                ZStack {
                    // Main button: Stop (when loading) or Voice Record (when idle)
                    // Centered horizontally in the ZStack
                    if isLoading {
                        // Stop button - red, to cancel agent generation (shows confirmation)
                        Button {
                            showStopConfirmation = true
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 60, height: 60)
                                Image(systemName: "stop.fill")
                                    .font(.system(size: 24))
                                    .foregroundStyle(.white)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        // Voice input button (blue when idle, orange when recording)
                        WatchVoiceButton(audioService: audioService) { audioData, format in
                            Task {
                                await sendVoiceCommand(audioData: audioData, format: format)
                            }
                        }
                    }

                    // Scroll to bottom FAB - positioned to the right of center
                    // Always visible on watchOS since scroll position tracking isn't available
                    if !messages.isEmpty {
                        HStack {
                            Spacer()
                            Button {
                                scrollToBottom(proxy: proxy, animated: false)
                            } label: {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .frame(width: 36, height: 36)
                                    .background(Color.gray.opacity(0.5))
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .padding(.trailing, 4)
                        }
                    }
                }
                .padding(.bottom, 8)
                .animation(.easeInOut(duration: 0.15), value: isLoading)
            }
            .confirmationDialog(
                "Stop Generation?",
                isPresented: $showStopConfirmation,
                titleVisibility: .visible
            ) {
                Button("Stop", role: .destructive) {
                    Task {
                        await stopGeneration()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will cancel the current agent response.")
            }
            .confirmationDialog(
                "Clear Context?",
                isPresented: $showClearContextConfirmation,
                titleVisibility: .visible
            ) {
                Button("Clear", role: .destructive) {
                    Task {
                        await clearSupervisorContext()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will clear all conversation history with the Supervisor.")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(navTitle)
        .tint(.white)
        .toolbar {
            // Only show clear context button for supervisor (agent sessions don't have clear context)
            if case .supervisor = destination {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showClearContextConfirmation = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14))
                    }
                }
            }
        }
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
    private func voicePlaybackRow(voiceOutput: (id: String, audioURL: URL?, text: String, duration: TimeInterval), role: Message.MessageRole) -> some View {
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

    /// Load chat history and subscribe to session updates (on-demand)
    /// For agent sessions, subscribes to receive real-time session.output messages
    private func loadHistory() async {
        switch destination {
        case .supervisor:
            // Only load if no messages yet (supervisor history is usually pre-loaded)
            if appState.supervisorMessages.isEmpty {
                NSLog("⌚️ WatchChatView.loadHistory: requesting supervisor history")
                await appState.requestHistory(sessionId: nil)
            }
        case .agent(let session):
            // Subscribe to agent session to receive real-time updates
            // This is critical - without subscription, session.output messages won't be received
            // because workstation broadcasts agent messages only to subscribed clients
            NSLog("⌚️ WatchChatView.loadHistory: subscribing to agent session %@", session.id)
            await appState.connectionService?.subscribeToSession(sessionId: session.id)
            // Note: session.subscribed response includes history, so no separate history request needed
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

    /// Track the block count of the last message for detecting streaming content updates
    private var lastMessageBlockCount: Int {
        guard let lastMessage = messages.last else { return 0 }
        return messageBlocks(for: lastMessage).count
    }

    // MARK: - Methods

    /// Determine the scroll target ID based on current message state
    private func getScrollTarget() -> String? {
        // Loading indicator is now always shown when isLoading (not conditional on hasStreamingMessage)
        if isLoading {
            return "loading"
        } else if let lastMessage = messages.last {
            let blocks = messageBlocks(for: lastMessage)
            if lastMessage.isStreaming && lastMessage.contentBlocks.isEmpty {
                // Streaming indicator is shown
                return "\(lastMessage.id)-streaming"
            } else if blocks.isEmpty {
                // No displayable blocks
                return nil
            } else {
                // Scroll to the last block of the last message
                return "\(lastMessage.id)-\(blocks.count - 1)"
            }
        } else {
            return nil
        }
    }

    /// Immediate scroll to bottom (no throttling)
    private func scrollToBottomImmediate(proxy: ScrollViewProxy) {
        guard let target = getScrollTarget() else { return }
        proxy.scrollTo(target, anchor: .bottom)
        lastScrollTime = Date()
    }

    /// Throttled scroll to bottom - ensures we don't scroll too frequently during streaming
    /// This prevents scroll conflicts and ensures the final scroll always reaches the bottom
    private func scrollToBottomThrottled(proxy: ScrollViewProxy) {
        let now = Date()
        let timeSinceLastScroll = now.timeIntervalSince(lastScrollTime) * 1000 // Convert to ms

        if timeSinceLastScroll >= Double(scrollThrottleInterval) {
            // Enough time has passed, scroll immediately
            scrollToBottomImmediate(proxy: proxy)
        } else {
            // Throttle: schedule a scroll after the remaining interval
            // Cancel any existing pending scroll task
            scrollTask?.cancel()

            let remainingTime = UInt64(Double(scrollThrottleInterval) - timeSinceLastScroll)
            scrollTask = Task { @MainActor in
                do {
                    try await Task.sleep(nanoseconds: remainingTime * 1_000_000)
                    guard !Task.isCancelled else { return }
                    scrollToBottomImmediate(proxy: proxy)
                } catch {
                    // Task was cancelled, ignore
                }
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy, animated: Bool = true) {
        guard let target = getScrollTarget() else { return }

        if animated {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(target, anchor: .bottom)
            }
        } else {
            proxy.scrollTo(target, anchor: .bottom)
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

    /// Stop the current generation (cancel agent/supervisor)
    private func stopGeneration() async {
        switch destination {
        case .supervisor:
            await appState.connectionService?.cancelSupervisor()
        case .agent(let session):
            await appState.connectionService?.cancelSession(sessionId: session.id)
        }
    }

    /// Clear supervisor context (conversation history)
    private func clearSupervisorContext() async {
        await appState.connectionService?.clearSupervisorContext()
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
