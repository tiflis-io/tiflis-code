//
//  WatchMessageRow.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Single content block bubble for watchOS
/// Each content block is rendered as a separate bubble (like iOS)
struct WatchMessageBlockBubble: View {
    let block: MessageContentBlock
    let role: Message.MessageRole
    @ObservedObject var audioService: WatchAudioService
    var requestAudio: ((String) async -> Void)?

    var body: some View {
        HStack {
            if role == .user {
                Spacer(minLength: 20)
            }

            blockView(for: block)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(bubbleColor)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            if role == .assistant {
                Spacer(minLength: 20)
            }
        }
    }

    private var bubbleColor: Color {
        switch role {
        case .user:
            return Color.accentColor.opacity(0.8)
        case .assistant:
            return Color.secondary.opacity(0.2)
        case .system:
            return Color.yellow.opacity(0.2)
        }
    }

    private var textColor: Color {
        switch role {
        case .user:
            return .white
        case .assistant, .system:
            return .primary
        }
    }

    @ViewBuilder
    private func blockView(for block: MessageContentBlock) -> some View {
        switch block {
        case .text(_, let text):
            Text(text)
                .font(.caption2)
                .foregroundStyle(textColor)
                .multilineTextAlignment(role == .user ? .trailing : .leading)
                .fixedSize(horizontal: false, vertical: true)

        case .toolCall(_, _, let name, _, _, let status):
            HStack(spacing: 4) {
                Image(systemName: toolIcon(for: status))
                    .font(.system(size: 10))
                    .foregroundStyle(.white)
                Text(name)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.9))
            }
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(toolBackgroundColor(for: status))
            .clipShape(RoundedRectangle(cornerRadius: 8))

        case .thinking(_, let text):
            HStack(alignment: .top, spacing: 4) {
                Image(systemName: "brain")
                    .font(.system(size: 10))
                    .foregroundStyle(.purple)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }

        case .code(_, let language, let code):
            VStack(alignment: .leading, spacing: 2) {
                if let lang = language {
                    Text(lang)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Text(code)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(6)
            .background(Color.black.opacity(0.3))
            .clipShape(RoundedRectangle(cornerRadius: 6))

        case .voiceInput(_, _, let transcription, _):
            if let text = transcription, !text.isEmpty {
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(textColor)
                    .italic()
            } else {
                HStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 10))
                    Text("Recording...")
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }

        case .status(_, let text):
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.5)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

        case .error(_, let text):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.red)
            }

        case .voiceOutput(_, _, let audioId, let duration):
            // Voice output with replay button
            VoiceOutputButton(audioService: audioService, audioId: audioId, duration: duration, requestAudio: requestAudio)

        default:
            EmptyView()
        }
    }

    private func toolIcon(for status: ToolStatus) -> String {
        switch status {
        case .running: return "arrow.triangle.2.circlepath"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        }
    }

    private func toolColor(for status: ToolStatus) -> Color {
        switch status {
        case .running: return .blue
        case .completed: return .green
        case .failed: return .red
        }
    }

    private func toolBackgroundColor(for status: ToolStatus) -> Color {
        switch status {
        case .running: return .blue.opacity(0.7)
        case .completed: return .green.opacity(0.6)
        case .failed: return .red.opacity(0.7)
        }
    }
}

/// Compact message bubble for watchOS (legacy - renders all blocks in one bubble)
/// Shows simplified text content with voice playback capability
struct WatchMessageRow: View {
    let message: Message
    @ObservedObject var audioService: WatchAudioService

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 20)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Message content blocks
                ForEach(Array(displayBlocks.enumerated()), id: \.offset) { _, block in
                    blockView(for: block)
                }

                // Streaming indicator
                if message.isStreaming {
                    HStack(spacing: 2) {
                        ForEach(0..<3) { index in
                            Circle()
                                .fill(Color.secondary)
                                .frame(width: 3, height: 3)
                                .opacity(dotOpacity(for: index))
                        }
                    }
                    .animation(.easeInOut(duration: 0.6).repeatForever(), value: message.isStreaming)
                }

                // Voice playback button for messages with voice output
                if let voiceOutput = message.voiceOutput {
                    VoicePlaybackButton(
                        audioService: audioService,
                        voiceOutput: voiceOutput
                    )
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(bubbleColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if message.role == .assistant {
                Spacer(minLength: 20)
            }
        }
    }

    // MARK: - Computed Properties

    private var displayBlocks: [MessageContentBlock] {
        // Return message blocks, skip placeholder - streaming indicator handles empty state
        return message.contentBlocks
    }

    private var bubbleColor: Color {
        switch message.role {
        case .user:
            return Color.accentColor.opacity(0.8)
        case .assistant:
            return Color.secondary.opacity(0.2)
        case .system:
            return Color.yellow.opacity(0.2)
        }
    }

    private var textColor: Color {
        switch message.role {
        case .user:
            return .white
        case .assistant, .system:
            return .primary
        }
    }

    private func dotOpacity(for index: Int) -> Double {
        let base = 0.3
        let pulse = 0.7
        return base + pulse * (index == 1 ? 1.0 : 0.5)
    }

    // MARK: - Block Views (no truncation - full text displayed)

    @ViewBuilder
    private func blockView(for block: MessageContentBlock) -> some View {
        switch block {
        case .text(_, let text):
            Text(text)
                .font(.caption2)
                .foregroundStyle(textColor)
                .multilineTextAlignment(message.role == .user ? .trailing : .leading)
                .fixedSize(horizontal: false, vertical: true)

        case .toolCall(_, _, let name, _, _, let status):
            HStack(spacing: 4) {
                Image(systemName: toolIcon(for: status))
                    .font(.system(size: 10))
                    .foregroundStyle(.white)
                Text(name)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.9))
            }
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(toolBackgroundColor(for: status))
            .clipShape(RoundedRectangle(cornerRadius: 8))

        case .thinking(_, let text):
            HStack(alignment: .top, spacing: 4) {
                Image(systemName: "brain")
                    .font(.system(size: 10))
                    .foregroundStyle(.purple)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }

        case .code(_, let language, let code):
            VStack(alignment: .leading, spacing: 2) {
                if let lang = language {
                    Text(lang)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Text(code)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(6)
            .background(Color.black.opacity(0.3))
            .clipShape(RoundedRectangle(cornerRadius: 6))

        case .voiceInput(_, _, let transcription, _):
            if let text = transcription, !text.isEmpty {
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(textColor)
                    .italic()
            } else {
                HStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(.system(size: 10))
                    Text("Recording...")
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }

        case .status(_, let text):
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.5)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

        case .error(_, let text):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(.red)
            }

        default:
            EmptyView()
        }
    }

    private func toolIcon(for status: ToolStatus) -> String {
        switch status {
        case .running: return "arrow.triangle.2.circlepath"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        }
    }

    private func toolColor(for status: ToolStatus) -> Color {
        switch status {
        case .running: return .blue
        case .completed: return .green
        case .failed: return .red
        }
    }

    private func toolBackgroundColor(for status: ToolStatus) -> Color {
        switch status {
        case .running: return .blue.opacity(0.7)
        case .completed: return .green.opacity(0.6)
        case .failed: return .red.opacity(0.7)
        }
    }
}

/// Compact voice output button for content blocks
/// Plays audio from cache or requests from server if not cached
struct VoiceOutputButton: View {
    @ObservedObject var audioService: WatchAudioService
    let audioId: String
    let duration: TimeInterval
    var requestAudio: ((String) async -> Void)?

    @State private var isLoading = false
    @State private var audioResponseCancellable: Any?

    var body: some View {
        Button {
            playAudio()
        } label: {
            HStack(spacing: 4) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.5)
                } else {
                    Image(systemName: audioService.isPlaying ? "stop.fill" : "speaker.wave.2.fill")
                        .font(.system(size: 10))
                }
                if duration > 0 {
                    Text(formatDuration(duration))
                        .font(.system(size: 10))
                }
            }
            .foregroundStyle(.white)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(isLoading ? Color.gray.opacity(0.5) : Color.purple.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
        .onAppear {
            setupAudioResponseListener()
        }
        .onDisappear {
            // Cleanup notification observer
            if let cancellable = audioResponseCancellable as? NSObjectProtocol {
                NotificationCenter.default.removeObserver(cancellable)
            }
        }
    }

    private func setupAudioResponseListener() {
        audioResponseCancellable = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("WatchAudioResponseReceived"),
            object: nil,
            queue: .main
        ) { notification in
            guard let userInfo = notification.userInfo,
                  let messageId = userInfo["messageId"] as? String,
                  messageId == audioId else { return }

            isLoading = false

            // If audio data was received, play it
            if let audioData = userInfo["audioData"] as? Data {
                audioService.playAudio(audioData)
            }
        }
    }

    private func playAudio() {
        if audioService.isPlaying {
            audioService.stopPlayback()
        } else {
            Task {
                // Try cache first
                if let data = await WatchAudioCache.shared.retrieve(forId: audioId) {
                    await MainActor.run {
                        audioService.playAudio(data)
                    }
                } else if let requestAudio = requestAudio {
                    // Request from server
                    await MainActor.run {
                        isLoading = true
                    }
                    await requestAudio(audioId)
                }
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let seconds = Int(duration)
        if seconds < 60 {
            return "\(seconds)s"
        }
        return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}

/// Button to replay voice output (used in chat view for message.voiceOutput)
struct VoicePlaybackButton: View {
    @ObservedObject var audioService: WatchAudioService
    let voiceOutput: (audioURL: URL?, text: String, duration: TimeInterval)

    var body: some View {
        Button {
            playVoice()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: audioService.isPlaying ? "stop.fill" : "play.fill")
                    .font(.caption2)
                if voiceOutput.duration > 0 {
                    Text(formatDuration(voiceOutput.duration))
                        .font(.caption2)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.purple.opacity(0.8))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func playVoice() {
        if audioService.isPlaying {
            audioService.stopPlayback()
        } else if let url = voiceOutput.audioURL,
                  let data = try? Data(contentsOf: url) {
            // Try URL first (legacy)
            audioService.playAudio(data)
        } else {
            // Use audioId stored in text field to lookup from cache
            let audioId = voiceOutput.text
            Task {
                if let data = await WatchAudioCache.shared.retrieve(forId: audioId) {
                    await MainActor.run {
                        audioService.playAudio(data)
                    }
                }
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let seconds = Int(duration)
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        if minutes > 0 {
            return "\(minutes):\(String(format: "%02d", remainingSeconds))"
        }
        return "\(remainingSeconds)s"
    }
}

/// Row showing loading/thinking state
struct WatchLoadingRow: View {
    @State private var animationPhase = 0.0

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 6, height: 6)
                        .scaleEffect(scale(for: index))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.secondary.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onAppear {
                startAnimation()
            }

            Spacer()
        }
    }

    private func scale(for index: Int) -> Double {
        let phase = (animationPhase + Double(index) * 0.3).truncatingRemainder(dividingBy: 1.0)
        return 0.5 + 0.5 * sin(phase * .pi * 2)
    }

    private func startAnimation() {
        Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(50))
                await MainActor.run {
                    animationPhase += 0.05
                    if animationPhase >= 1.0 {
                        animationPhase = 0
                    }
                }
            }
        }
    }
}

#Preview {
    VStack(spacing: 8) {
        WatchMessageRow(
            message: Message(
                sessionId: "test",
                role: .user,
                content: "Hello, how are you?"
            ),
            audioService: WatchAudioService.shared
        )

        WatchMessageRow(
            message: Message(
                sessionId: "test",
                role: .assistant,
                content: "I'm doing well! How can I help you today?"
            ),
            audioService: WatchAudioService.shared
        )

        WatchMessageRow(
            message: Message(
                sessionId: "test",
                role: .assistant,
                content: "Processing your request...",
                isStreaming: true
            ),
            audioService: WatchAudioService.shared
        )

        WatchLoadingRow()
    }
    .padding()
}
