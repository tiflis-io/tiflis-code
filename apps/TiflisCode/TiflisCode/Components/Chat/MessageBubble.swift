//
//  MessageBubble.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Chat message bubble with role-based styling
struct MessageBubble: View {
    let message: Message
    let sessionType: Session.SessionType
    
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
                MessageContent(message: message, isUser: isUser)
                
                // Audio player for TTS responses
                if !isUser && message.audioOutputPath != nil && message.isComplete {
                    AudioPlayerView(duration: 12.5) // Mock duration
                        .frame(maxWidth: 280)
                }
                
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

/// Message content with markdown rendering
struct MessageContent: View {
    let message: Message
    let isUser: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Voice indicator for transcribed messages with audio playback
            if message.contentType == .transcription || message.contentType == .audio {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 4) {
                        Image(systemName: "waveform")
                            .font(.caption)
                        Text("Voice message")
                            .font(.caption)
                    }
                    .foregroundStyle(.secondary)
                    
                    // Audio player for user's voice message
                    if message.audioInputPath != nil {
                        AudioPlayerView(duration: 5.2) // Mock duration
                    }
                }
            }
            
            // Main content (transcription or text)
            if !message.content.isEmpty {
                Text(LocalizedStringKey(message.content))
                    .textSelection(.enabled)
            }
            
            // Streaming indicator
            if !message.isComplete {
                HStack(spacing: 4) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Generating...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(bubbleBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
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

#Preview("Typing Indicator") {
    VStack(spacing: 20) {
        TypingIndicator(sessionType: .supervisor)
        TypingIndicator(sessionType: .claude)
        TypingIndicator(sessionType: .cursor)
    }
    .padding()
}
