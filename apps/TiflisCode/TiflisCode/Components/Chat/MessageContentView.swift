//
//  MessageContentView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Dispatcher view that renders appropriate component for each content block type
struct MessageContentView: View {
    let blocks: [MessageContentBlock]
    let isStreaming: Bool
    var onAction: ((ActionType) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(blocks) { block in
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

        case .toolCall(_, let name, let input, let output, let status):
            ToolCallView(name: name, input: input, output: output, status: status)

        case .thinking(_, let text):
            ThinkingView(text: text)

        case .status(_, let text):
            StatusView(text: text)

        case .error(_, let text):
            ErrorView(text: text)

        case .voiceInput(_, let audioURL, let transcription, let duration):
            VoiceInputView(audioURL: audioURL, transcription: transcription, duration: duration)

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

    var body: some View {
        Text(LocalizedStringKey(text))
            .textSelection(.enabled)
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
    let audioURL: URL?
    let transcription: String?
    let duration: TimeInterval

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                    .font(.caption)
                Text("Voice message")
                    .font(.caption)
            }
            .foregroundStyle(.secondary)

            if audioURL != nil {
                AudioPlayerView(duration: duration)
            }

            if let transcription = transcription, !transcription.isEmpty {
                Text(transcription)
                    .textSelection(.enabled)
            }
        }
    }
}

// MARK: - Voice Output View (Phase 2)

struct VoiceOutputView: View {
    let audioURL: URL?
    let text: String
    let duration: TimeInterval

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !text.isEmpty {
                Text(text)
                    .textSelection(.enabled)
            }

            if audioURL != nil {
                AudioPlayerView(duration: duration)
            }
        }
    }
}

// MARK: - Preview

#Preview("All Block Types") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            MessageContentView(
                blocks: [
                    .status(id: "1", text: "Analyzing project structure..."),
                    .toolCall(id: "2", name: "read_file", input: "{\"path\": \"package.json\"}", output: nil, status: .running),
                    .thinking(id: "3", text: "I can see this is a Node.js project. Let me analyze the dependencies."),
                    .toolCall(id: "4", name: "read_file", input: "{\"path\": \"package.json\"}", output: "{\"name\": \"my-app\"}", status: .completed),
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
