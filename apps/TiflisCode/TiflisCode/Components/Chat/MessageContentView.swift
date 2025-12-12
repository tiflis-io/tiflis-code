//
//  MessageContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Dispatcher view that renders appropriate component for each content block type
struct MessageContentView: View {
    let blocks: [MessageContentBlock]
    let isStreaming: Bool
    var onAction: ((ActionType) -> Void)?

    /// Filter out blocks with empty or whitespace-only content to prevent empty spacing
    private var nonEmptyBlocks: [MessageContentBlock] {
        blocks.filter { block in
            switch block {
            case .text(_, let text):
                return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .code(_, _, let code):
                return !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .thinking(_, let text):
                return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .status(_, let text):
                return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .error(_, let text):
                return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .cancel(_, let text):
                return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            case .toolCall, .voiceInput, .voiceOutput, .actionButtons:
                return true
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(nonEmptyBlocks) { block in
                contentView(for: block)
            }
        }
    }

    @ViewBuilder
    private func contentView(for block: MessageContentBlock) -> some View {
        switch block {
        case .text(_, let text):
            TextContentView(text: text)

        case .code(_, let language, let code):
            CodeBlockView(language: language, code: code)

        case .toolCall(_, _, let name, let input, let output, let status):
            ToolCallView(name: name, input: input, output: output, status: status)

        case .thinking(_, let text):
            ThinkingView(text: text)

        case .status(_, let text):
            StatusView(text: text)

        case .error(_, let text):
            ErrorView(text: text)

        case .cancel(_, let text):
            CancelView(text: text)

        case .voiceInput(let id, let audioURL, let transcription, let duration):
            VoiceInputView(id: id, audioURL: audioURL, transcription: transcription, duration: duration)

        case .voiceOutput(_, let audioURL, let text, let duration):
            VoiceOutputView(audioURL: audioURL, text: text, duration: duration)

        case .actionButtons(_, let buttons):
            ActionButtonsView(buttons: buttons, onAction: onAction)
        }
    }
}

// MARK: - Text Content View

struct TextContentView: View {
    let text: String

    /// Trim leading/trailing whitespace to prevent extra visual padding
    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        // Use AttributedString for markdown support while preserving newlines
        Text(attributedText)
            .textSelection(.enabled)
    }

    private var attributedText: AttributedString {
        // Try to parse as markdown, fallback to plain text
        if let attributed = try? AttributedString(markdown: trimmedText, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return attributed
        }
        return AttributedString(trimmedText)
    }
}

// MARK: - Streaming Cursor

struct StreamingCursor: View {
    @State private var isVisible = true

    var body: some View {
        Rectangle()
            .fill(Color.primary)
            .frame(width: 2, height: 16)
            .opacity(isVisible ? 1 : 0)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
                    isVisible.toggle()
                }
            }
    }
}

// MARK: - Voice Input View (Phase 2)

struct VoiceInputView: View {
    let id: String
    let audioURL: URL?
    let transcription: String?
    let duration: TimeInterval

    /// True when we're waiting for transcription from server
    private var isTranscribing: Bool {
        transcription == nil && duration > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Voice message indicator (no play button - user's own voice)
            HStack(spacing: 8) {
                Image(systemName: "waveform")
                    .font(.body)
                    .foregroundStyle(Color.accentColor)

                if duration > 0 {
                    Text(formatDuration(duration))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }

                if isTranscribing {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Transcribing...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            // Transcription text (shown below voice indicator)
            if let transcription = transcription, !transcription.isEmpty {
                Divider()
                Text(transcription)
                    .textSelection(.enabled)
            }
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Voice Output View (Phase 2)

struct VoiceOutputView: View {
    let audioURL: URL?
    let text: String  // text is the messageId for audio lookup
    let duration: TimeInterval

    @ObservedObject private var audioPlayer = AudioPlayerService.shared

    /// Check if this audio is currently playing
    private var isThisPlaying: Bool {
        audioPlayer.isPlaying && audioPlayer.currentMessageId == text
    }

    /// Check if audio is loading from server
    private var isLoading: Bool {
        audioPlayer.isLoadingAudio(forMessageId: text)
    }

    var body: some View {
        HStack(spacing: 12) {
            // Play/Pause button - always show, can request from server
            if isLoading {
                ProgressView()
                    .frame(width: 28, height: 28)
            } else {
                Button {
                    if isThisPlaying {
                        audioPlayer.pause()
                    } else {
                        audioPlayer.playAudio(forMessageId: text)
                    }
                } label: {
                    Image(systemName: isThisPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.title)
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
            }

            // Waveform icon
            Image(systemName: "waveform")
                .font(.body)
                .foregroundStyle(.secondary)

            // Duration
            if duration > 0 {
                Text(formatDuration(duration))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            Spacer()
        }
        .padding(12)
        .background(Color.secondary.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Preview

#Preview("All Block Types") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            MessageContentView(
                blocks: [
                    .status(id: "1", text: "Analyzing project structure..."),
                    .toolCall(id: "2", toolUseId: nil, name: "read_file", input: "{\"path\": \"package.json\"}", output: nil, status: .running),
                    .thinking(id: "3", text: "I can see this is a Node.js project. Let me analyze the dependencies."),
                    .toolCall(id: "4", toolUseId: nil, name: "read_file", input: "{\"path\": \"package.json\"}", output: "{\"name\": \"my-app\"}", status: .completed),
                    .text(id: "5", text: "Here's what I found in your project:"),
                    .code(id: "6", language: "typescript", code: "import express from 'express';\n\nconst app = express();\napp.listen(3000);"),
                    .error(id: "7", text: "File not found: config/missing.json"),
                    .actionButtons(id: "8", buttons: [
                        ActionButton(title: "Create File", icon: "plus.circle", style: .primary, action: .custom("create")),
                        ActionButton(title: "Skip", icon: "xmark", style: .secondary, action: .custom("skip"))
                    ])
                ],
                isStreaming: false
            )
        }
        .padding()
    }
}

#Preview("Streaming") {
    MessageContentView(
        blocks: [
            .text(id: "1", text: "I'm analyzing your code")
        ],
        isStreaming: true
    )
    .padding()
}
