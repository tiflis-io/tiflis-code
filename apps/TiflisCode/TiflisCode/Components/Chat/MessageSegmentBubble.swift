//
//  MessageSegmentBubble.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Chat message bubble for a split segment with role-based styling
struct MessageSegmentBubble: View {
    let segment: SplitMessageSegment
    let originalMessage: Message?
    let sessionType: Session.SessionType
    var onAction: ((ActionType) -> Void)?

    private var isUser: Bool {
        segment.role == .user
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if isUser {
                Spacer(minLength: 60)
            } else {
                // Assistant avatar - only show on first segment
                if segment.showAvatar {
                    AssistantAvatar(sessionType: sessionType)
                } else {
                    // Spacer to align with avatar width
                    Spacer()
                        .frame(width: 32)
                }
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                // Message content
                MessageSegmentContent(
                    segment: segment,
                    originalMessage: originalMessage,
                    isUser: isUser,
                    onAction: onAction
                )

                // Timestamp and send status - only show on last segment
                if segment.showTimestamp {
                    HStack(spacing: 4) {
                        Text(segment.createdAt, style: .time)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            if !isUser {
                Spacer(minLength: 60)
            }
        }
        // Reduced top padding for continuation segments
        .padding(.top, segment.isContinuation ? -8 : 0)
    }
}

/// Message content for a segment with structured content blocks
struct MessageSegmentContent: View {
    let segment: SplitMessageSegment
    let originalMessage: Message?
    let isUser: Bool
    var onAction: ((ActionType) -> Void)?

    /// Full text content for copying (from original message)
    private var fullTextContent: String {
        guard let message = originalMessage else {
            return segmentTextContent
        }
        return message.contentBlocks.compactMap { block -> String? in
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

    /// Text content just for this segment
    private var segmentTextContent: String {
        segment.contentBlocks.compactMap { block -> String? in
            switch block {
            case .text(_, let text):
                return text
            case .code(_, _, let code):
                return code
            default:
                return nil
            }
        }.joined(separator: "\n\n")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MessageContentView(
                blocks: segment.contentBlocks,
                isStreaming: segment.isStreaming,
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

// MARK: - Preview

#Preview("Single Segment") {
    let message = Message.mockAssistantMessage
    let segments = MessageSplitter.split(message: message)
    return ScrollView {
        VStack(spacing: 16) {
            ForEach(segments) { segment in
                MessageSegmentBubble(
                    segment: segment,
                    originalMessage: message,
                    sessionType: .claude
                )
            }
        }
        .padding()
    }
}

#Preview("Long Message Split") {
    let longText = String(repeating: "This is a test message that will be repeated many times to create a very long message. ", count: 50)
    let message = Message(
        sessionId: "test",
        role: .assistant,
        content: longText
    )
    let segments = MessageSplitter.split(message: message)
    return ScrollView {
        VStack(spacing: 16) {
            ForEach(segments) { segment in
                MessageSegmentBubble(
                    segment: segment,
                    originalMessage: message,
                    sessionType: .claude
                )
            }
        }
        .padding()
    }
}

#Preview("Continuation Segment") {
    let segment = SplitMessageSegment(
        id: "test-seg-1",
        messageId: "test",
        contentBlocks: [.text(id: "t1", text: "This is a continuation segment without avatar.")],
        segmentIndex: 1,
        totalSegments: 3,
        isFirstSegment: false,
        isLastSegment: false,
        isStreaming: false,
        showAvatar: false,
        showTimestamp: false,
        createdAt: Date(),
        role: .assistant
    )
    return MessageSegmentBubble(
        segment: segment,
        originalMessage: nil,
        sessionType: .supervisor
    )
    .padding()
}

// MARK: - Send Status Indicator

/// Shows message delivery status for user messages
/// - pending: Clock icon (sending...)
/// - sent: Checkmark icon (delivered to server)
/// - failed: Exclamation icon (delivery failed)
struct MessageSendStatusIndicator: View {
    let status: Message.SendStatus

    var body: some View {
        switch status {
        case .none:
            EmptyView()
        case .pending:
            Image(systemName: "clock")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .sent:
            Image(systemName: "checkmark")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .failed:
            Image(systemName: "exclamationmark.circle")
                .font(.caption2)
                .foregroundStyle(.red)
        }
    }
}
