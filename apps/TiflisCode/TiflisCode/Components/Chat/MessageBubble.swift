//
//  MessageBubble.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Chat message bubble with role-based styling
struct MessageBubble: View {
    let message: Message
    let sessionType: Session.SessionType
    var onAction: ((ActionType) -> Void)?

    private var isUser: Bool {
        message.role == .user
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if isUser {
                Spacer(minLength: 60)
            } else {
                // Assistant avatar based on session type
                AssistantAvatar(sessionType: sessionType)
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                // Message content
                MessageBubbleContent(
                    message: message,
                    isUser: isUser,
                    onAction: onAction
                )

                // Timestamp
                Text(message.createdAt, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

/// Avatar for assistant messages using session-specific icon
struct AssistantAvatar: View {
    let sessionType: Session.SessionType

    var body: some View {
        Group {
            if let customIcon = sessionType.customIcon {
                Image(customIcon)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: sessionType.sfSymbol)
                    .font(.system(size: 18))
                    .foregroundStyle(.primary)
                    .frame(width: 32, height: 32)
                    .background(Color(.systemGray5))
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// Message content with structured content blocks
struct MessageBubbleContent: View {
    let message: Message
    let isUser: Bool
    var onAction: ((ActionType) -> Void)?

    /// Full text content for copying
    private var fullTextContent: String {
        message.contentBlocks.compactMap { block -> String? in
            switch block {
            case .text(_, let text):
                return text
            case .code(_, _, let code):
                return code
            case .thinking(_, let text):
                return text
            case .error(_, let text):
                return text
            case .cancel(_, let text):
                return text
            case .status(_, let text):
                return text
            case .toolCall(_, _, let name, let input, let output, _):
                var parts = [name]
                if let input = input { parts.append("Input: \(input)") }
                if let output = output { parts.append("Output: \(output)") }
                return parts.joined(separator: "\n")
            case .voiceInput(_, _, let transcription, _):
                return transcription
            case .voiceOutput(_, _, let text, _):
                return text
            case .actionButtons:
                return nil
            }
        }.joined(separator: "\n\n")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MessageContentView(
                blocks: message.contentBlocks,
                isStreaming: message.isStreaming,
                onAction: onAction
            )
        }
        .padding(12)
        .background(bubbleBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .contextMenu {
            Button {
                UIPasteboard.general.string = fullTextContent
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }

            if isUser {
                Button {
                    onAction?(.sendMessage(fullTextContent))
                } label: {
                    Label("Resend", systemImage: "arrow.clockwise")
                }
            }

            ShareLink(item: fullTextContent) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
        }
    }

    @ViewBuilder
    private var bubbleBackground: some View {
        if isUser {
            Color.accentColor
                .opacity(0.15)
        } else {
            Color(.systemGray6)
        }
    }
}

/// Typing indicator with animated dots
struct TypingIndicator: View {
    let sessionType: Session.SessionType
    @State private var animationPhase = 0.0

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AssistantAvatar(sessionType: sessionType)

            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .scaleEffect(animationScale(for: index))
                        .animation(
                            .easeInOut(duration: 0.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.15),
                            value: animationPhase
                        )
                }
            }
            .padding(12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer(minLength: 60)
        }
        .onAppear {
            animationPhase = 1.0
        }
    }

    private func animationScale(for index: Int) -> CGFloat {
        let phase = animationPhase + Double(index) * 0.3
        return 0.6 + 0.4 * sin(phase * .pi)
    }
}

// MARK: - Preview

#Preview("User Message") {
    MessageBubble(message: .mockUserMessage, sessionType: .supervisor)
        .padding()
}

#Preview("Assistant Message - Supervisor") {
    MessageBubble(message: .mockAssistantMessage, sessionType: .supervisor)
        .padding()
}

#Preview("Assistant Message - Claude") {
    MessageBubble(message: .mockAssistantMessage, sessionType: .claude)
        .padding()
}

#Preview("Assistant Message - Cursor") {
    MessageBubble(message: .mockAssistantMessage, sessionType: .cursor)
        .padding()
}

#Preview("Streaming Message") {
    MessageBubble(message: .mockStreamingMessage, sessionType: .opencode)
        .padding()
}

#Preview("Message with Tool Calls") {
    ScrollView {
        MessageBubble(message: .mockMessageWithToolCalls, sessionType: .claude)
            .padding()
    }
}

#Preview("Message with Error") {
    MessageBubble(message: .mockMessageWithError, sessionType: .supervisor)
        .padding()
}

#Preview("Typing Indicator") {
    VStack(spacing: 20) {
        TypingIndicator(sessionType: .supervisor)
        TypingIndicator(sessionType: .claude)
        TypingIndicator(sessionType: .cursor)
    }
    .padding()
}
