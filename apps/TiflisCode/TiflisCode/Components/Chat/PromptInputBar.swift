//
//  PromptInputBar.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Input bar for text and voice input
struct PromptInputBar: View {
    @Binding var text: String
    @Binding var isRecording: Bool

    /// Whether the agent is currently generating a response
    let isGenerating: Bool

    let onSend: () -> Void
    let onStop: () -> Void
    let onStartRecording: () -> Void
    let onStopRecording: () -> Void

    @FocusState private var isFocused: Bool

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Text input
            TextInputField(text: $text, isFocused: _isFocused, onSubmit: onSend)

            // Voice button - disabled while agent is generating
            VoiceRecordButton(
                isRecording: $isRecording,
                onStart: onStartRecording,
                onStop: onStopRecording,
                disabled: isGenerating
            )

            // Send or Stop button depending on generation state
            SendStopButton(
                isGenerating: isGenerating,
                canSend: canSend,
                onSend: onSend,
                onStop: onStop
            )
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }
}

/// Expandable text input field with Return to send, Shift+Return for newline
struct TextInputField: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    let onSubmit: () -> Void

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        TextField("Message...", text: $text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(1...6)
            .padding(12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .focused($isFocused)
            .onKeyPress(.return, phases: .down) { keyPress in
                if keyPress.modifiers.contains(.shift) {
                    // Shift+Return: insert newline (let system handle it)
                    return .ignored
                } else {
                    // Return: send message if not empty
                    if canSend {
                        onSubmit()
                    }
                    return .handled
                }
            }
    }
}

/// Pulsing ring animation for recording indicator
struct PulsingRing: View {
    let delay: Double
    @Binding var isAnimating: Bool

    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.8

    var body: some View {
        Circle()
            .stroke(Color.red.opacity(opacity), lineWidth: 3)
            .scaleEffect(scale)
            .onChange(of: isAnimating) { _, newValue in
                if newValue {
                    startAnimation()
                } else {
                    resetAnimation()
                }
            }
            .onAppear {
                if isAnimating {
                    startAnimation()
                }
            }
    }

    private func startAnimation() {
        scale = 1.0
        opacity = 0.8
        withAnimation(
            .easeOut(duration: 1.2)
            .repeatForever(autoreverses: false)
            .delay(delay)
        ) {
            scale = 2.5
            opacity = 0.0
        }
    }

    private func resetAnimation() {
        withAnimation(.easeOut(duration: 0.2)) {
            scale = 1.0
            opacity = 0.0
        }
    }
}

/// Voice recording button with push-to-talk and toggle modes
struct VoiceRecordButton: View {
    @Binding var isRecording: Bool

    let onStart: () -> Void
    let onStop: () -> Void

    /// Whether the button is disabled (e.g., while agent is generating)
    var disabled: Bool = false

    @State private var isHoldMode = false
    @State private var isPressing = false
    @State private var longPressTriggered = false

    private let baseSize: CGFloat = 36
    private let expandedSize: CGFloat = 72

    private var isActiveRecording: Bool {
        isRecording || isHoldMode
    }

    private var currentSize: CGFloat {
        if isActiveRecording {
            return expandedSize
        } else if isPressing && !disabled {
            return baseSize * 1.2
        }
        return baseSize
    }

    /// Button color based on state
    private var buttonColor: Color {
        if disabled {
            return Color.gray
        } else if isActiveRecording {
            return Color.red
        } else {
            return Color.accentColor
        }
    }

    var body: some View {
        // Fixed size container to maintain layout
        Color.clear
            .frame(width: baseSize, height: baseSize)
            .overlay {
                ZStack {
                    // Pulsing rings when recording (behind button)
                    if isActiveRecording {
                        PulsingRing(delay: 0.0, isAnimating: .constant(isActiveRecording))
                            .frame(width: expandedSize, height: expandedSize)
                        PulsingRing(delay: 0.4, isAnimating: .constant(isActiveRecording))
                            .frame(width: expandedSize, height: expandedSize)
                        PulsingRing(delay: 0.8, isAnimating: .constant(isActiveRecording))
                            .frame(width: expandedSize, height: expandedSize)
                    }

                    // Glow background when recording
                    if isActiveRecording {
                        Circle()
                            .fill(Color.red.opacity(0.15))
                            .frame(width: expandedSize * 1.2, height: expandedSize * 1.2)
                            .blur(radius: 8)
                    }

                    // Main button
                    Image(systemName: isActiveRecording ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.system(size: currentSize))
                        .foregroundStyle(buttonColor)
                        .symbolEffect(.pulse, options: .repeating, isActive: isActiveRecording)
                }
                .animation(.spring(response: 0.25, dampingFraction: 0.7), value: currentSize)
                .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isActiveRecording)
            }
            .contentShape(Circle().scale(1.5))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        // Ignore gestures when disabled
                        guard !disabled else { return }

                        if !isPressing {
                            isPressing = true
                            // Start timer for long press detection
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                                if isPressing && !longPressTriggered && !isRecording && !disabled {
                                    longPressTriggered = true
                                    isHoldMode = true
                                    let generator = UIImpactFeedbackGenerator(style: .medium)
                                    generator.impactOccurred()
                                    onStart()
                                }
                            }
                        }
                    }
                    .onEnded { _ in
                        // Ignore gestures when disabled
                        guard !disabled else {
                            isPressing = false
                            longPressTriggered = false
                            return
                        }

                        let wasHoldMode = isHoldMode
                        let wasLongPressTriggered = longPressTriggered

                        isPressing = false
                        longPressTriggered = false

                        if wasHoldMode {
                            // End hold-to-record
                            isHoldMode = false
                            onStop()
                        } else if !wasLongPressTriggered {
                            // Short tap - toggle mode
                            if isRecording {
                                onStop()
                            } else {
                                onStart()
                            }
                        }
                    }
            )
            .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")
    }
}

/// Send or Stop button depending on generation state
struct SendStopButton: View {
    let isGenerating: Bool
    let canSend: Bool
    let onSend: () -> Void
    let onStop: () -> Void

    var body: some View {
        if isGenerating {
            // Stop button (red)
            Button(action: onStop) {
                Image(systemName: "stop.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.red)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Stop generation")
        } else {
            // Send button
            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(canSend ? Color.accentColor : Color.gray)
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        PromptInputBar(
            text: .constant(""),
            isRecording: .constant(false),
            isGenerating: false,
            onSend: {},
            onStop: {},
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
            isGenerating: false,
            onSend: {},
            onStop: {},
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
            isGenerating: false,
            onSend: {},
            onStop: {},
            onStartRecording: {},
            onStopRecording: {}
        )
    }
}

#Preview("Generating") {
    VStack {
        Spacer()
        PromptInputBar(
            text: .constant(""),
            isRecording: .constant(false),
            isGenerating: true,
            onSend: {},
            onStop: {},
            onStartRecording: {},
            onStopRecording: {}
        )
    }
}

