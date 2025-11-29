//
//  AudioPlayerView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import SwiftUI

/// Audio player view for voice messages
struct AudioPlayerView: View {
    let duration: TimeInterval
    @State private var isPlaying = false
    @State private var progress: Double = 0
    @State private var currentTime: TimeInterval = 0
    
    private let timer = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: 12) {
            // Play/Pause button
            Button {
                isPlaying.toggle()
                if !isPlaying {
                    // Reset when stopped
                }
            } label: {
                Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
            
            VStack(spacing: 4) {
                // Waveform visualization
                WaveformView(progress: progress, isPlaying: isPlaying)
                    .frame(height: 24)
                
                // Time labels
                HStack {
                    Text(formatTime(currentTime))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                    
                    Spacer()
                    
                    Text(formatTime(duration))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        .padding(12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onReceive(timer) { _ in
            guard isPlaying else { return }
            
            if currentTime < duration {
                currentTime += 0.1
                progress = currentTime / duration
            } else {
                isPlaying = false
                currentTime = 0
                progress = 0
            }
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

/// Waveform visualization for audio
struct WaveformView: View {
    let progress: Double
    let isPlaying: Bool
    
    private let barCount = 30
    
    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 2) {
                ForEach(0..<barCount, id: \.self) { index in
                    let barProgress = Double(index) / Double(barCount)
                    let isPast = barProgress <= progress
                    
                    RoundedRectangle(cornerRadius: 1)
                        .fill(isPast ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: 3)
                        .frame(height: barHeight(for: index, in: geometry.size.height))
                        .animation(isPlaying ? .easeInOut(duration: 0.1) : nil, value: progress)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    private func barHeight(for index: Int, in maxHeight: CGFloat) -> CGFloat {
        // Generate pseudo-random heights based on index
        let seed = sin(Double(index) * 0.5) * 0.5 + 0.5
        let height = 0.3 + seed * 0.7
        return maxHeight * height
    }
}

/// Voice message bubble showing audio waveform before transcription
struct VoiceMessageBubble: View {
    let duration: TimeInterval
    let isTranscribing: Bool
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Spacer(minLength: 60)
            
            VStack(alignment: .trailing, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "waveform")
                        .foregroundStyle(.secondary)
                    
                    if isTranscribing {
                        Text("Transcribing...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        AudioPlayerView(duration: duration)
                    }
                }
                .padding(12)
                .background(Color.accentColor.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
    }
}

// MARK: - Preview

#Preview("Audio Player") {
    AudioPlayerView(duration: 15.5)
        .padding()
}

#Preview("Waveform") {
    WaveformView(progress: 0.4, isPlaying: true)
        .frame(height: 32)
        .padding()
}

#Preview("Voice Message") {
    VStack(spacing: 20) {
        VoiceMessageBubble(duration: 8.2, isTranscribing: false)
        VoiceMessageBubble(duration: 3.5, isTranscribing: true)
    }
    .padding()
}

