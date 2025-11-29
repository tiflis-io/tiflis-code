//
//  PromptInputBar.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Input bar for text and voice input
struct PromptInputBar: View {
    @Binding var text: String
    @Binding var isRecording: Bool
    
    let onSend: () -> Void
    let onStartRecording: () -> Void
    let onStopRecording: () -> Void
    
    @FocusState private var isFocused: Bool
    
    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Text input
            TextInputField(text: $text, isFocused: _isFocused)
            
            // Voice button
            VoiceRecordButton(
                isRecording: $isRecording,
                onStart: onStartRecording,
                onStop: onStopRecording
            )
            
            // Send button
            SendButton(isEnabled: canSend, action: onSend)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }
}

/// Expandable text input field
struct TextInputField: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    
    var body: some View {
        TextField("Message...", text: $text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(1...6)
            .padding(12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .focused($isFocused)
    }
}

/// Voice recording button with push-to-talk and toggle modes
struct VoiceRecordButton: View {
    @Binding var isRecording: Bool
    
    let onStart: () -> Void
    let onStop: () -> Void
    
    @State private var isLongPressing = false
    
    var body: some View {
        Button {
            // Toggle mode: tap to start/stop
            if isRecording {
                onStop()
            } else {
                onStart()
            }
        } label: {
            Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(isRecording ? Color.red : Color.accentColor)
                .symbolEffect(.pulse, options: .repeating, isActive: isRecording)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.3)
                .onEnded { _ in
                    // Push-to-talk mode: start on long press
                    isLongPressing = true
                    onStart()
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onEnded { _ in
                    // Stop when released after long press
                    if isLongPressing {
                        isLongPressing = false
                        onStop()
                    }
                }
        )
        .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")
    }
}

/// Send message button
struct SendButton: View {
    let isEnabled: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(isEnabled ? Color.accentColor : Color.gray)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel("Send message")
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        PromptInputBar(
            text: .constant(""),
            isRecording: .constant(false),
            onSend: {},
            onStartRecording: {},
            onStopRecording: {}
        )
    }
}

#Preview("With Text") {
    VStack {
        Spacer()
        PromptInputBar(
            text: .constant("Create a new React component"),
            isRecording: .constant(false),
            onSend: {},
            onStartRecording: {},
            onStopRecording: {}
        )
    }
}

#Preview("Recording") {
    VStack {
        Spacer()
        PromptInputBar(
            text: .constant(""),
            isRecording: .constant(true),
            onSend: {},
            onStartRecording: {},
            onStopRecording: {}
        )
    }
}

