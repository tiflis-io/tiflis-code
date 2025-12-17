//
//  WatchVoiceButton.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Voice recording button for watchOS
/// Supports tap to start/stop recording with visual feedback
struct WatchVoiceButton: View {
    @ObservedObject var audioService: WatchAudioService
    let onRecordingComplete: (Data, String) -> Void

    @State private var isPressed = false

    var body: some View {
        Button {
            handleTap()
        } label: {
            ZStack {
                // Background circle - blue when idle, orange when recording
                // (orange differentiates from red stop-agent button on watchOS)
                Circle()
                    .fill(audioService.isRecording ? Color.orange : Color.blue)
                    .frame(width: 60, height: 60)

                // Recording animation - pulsating orange circles
                if audioService.isRecording {
                    Circle()
                        .stroke(Color.orange.opacity(0.5), lineWidth: 3)
                        .frame(width: 70, height: 70)
                        .scaleEffect(isPressed ? 1.1 : 1.0)
                        .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isPressed)
                }

                // Icon
                Image(systemName: audioService.isRecording ? "stop.fill" : "mic.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
        .onChange(of: audioService.isRecording) { _, isRecording in
            isPressed = isRecording
        }
    }

    private func handleTap() {
        Task {
            if audioService.isRecording {
                // Stop recording and send
                do {
                    let result = try await audioService.stopRecording()
                    onRecordingComplete(result.audioData, result.format)
                } catch {
                    print("⌚️ WatchVoiceButton: Failed to stop recording: \(error)")
                }
            } else {
                // Start recording
                do {
                    try await audioService.startRecording()
                } catch {
                    print("⌚️ WatchVoiceButton: Failed to start recording: \(error)")
                }
            }
        }
    }
}

/// Compact voice button variant for inline use
struct WatchVoiceButtonCompact: View {
    @ObservedObject var audioService: WatchAudioService
    let onRecordingComplete: (Data, String) -> Void

    var body: some View {
        Button {
            handleTap()
        } label: {
            Image(systemName: audioService.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                .font(.system(size: 32))
                .foregroundStyle(audioService.isRecording ? .orange : .accentColor)
        }
        .buttonStyle(.plain)
    }

    private func handleTap() {
        Task {
            if audioService.isRecording {
                do {
                    let result = try await audioService.stopRecording()
                    onRecordingComplete(result.audioData, result.format)
                } catch {
                    print("⌚️ WatchVoiceButtonCompact: Failed to stop recording: \(error)")
                }
            } else {
                do {
                    try await audioService.startRecording()
                } catch {
                    print("⌚️ WatchVoiceButtonCompact: Failed to start recording: \(error)")
                }
            }
        }
    }
}

#Preview {
    WatchVoiceButton(audioService: WatchAudioService.shared) { _, _ in }
}
