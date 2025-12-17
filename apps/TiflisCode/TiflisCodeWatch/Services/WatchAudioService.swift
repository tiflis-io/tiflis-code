//
//  WatchAudioService.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import AVFoundation
import Foundation
import Combine

/// Result of a voice recording session
struct WatchVoiceRecordingResult {
    /// Audio data (not base64 encoded)
    let audioData: Data
    /// Audio format (m4a)
    let format: String
    /// Duration in seconds
    let duration: TimeInterval
}

/// Errors that can occur during audio operations on watchOS
enum WatchAudioError: Error, LocalizedError {
    case permissionDenied
    case recordingFailed(String)
    case playbackFailed(String)
    case noRecordingInProgress

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Microphone access denied"
        case .recordingFailed(let reason):
            return "Recording failed: \(reason)"
        case .playbackFailed(let reason):
            return "Playback failed: \(reason)"
        case .noRecordingInProgress:
            return "No recording in progress"
        }
    }
}

/// Audio service for watchOS - handles recording and TTS playback
/// Uses AVAudioRecorder for voice recording and AVAudioPlayer for TTS playback
@MainActor
final class WatchAudioService: NSObject, ObservableObject {
    // MARK: - Singleton

    static let shared = WatchAudioService()

    // MARK: - Published State

    @Published private(set) var isRecording = false
    @Published private(set) var recordingDuration: TimeInterval = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var error: WatchAudioError?

    /// The audio ID currently being played (nil if not playing or unknown)
    /// Used to show stop button only on the specific voice output being played
    @Published private(set) var currentlyPlayingAudioId: String?

    // MARK: - Private Properties

    private var audioRecorder: AVAudioRecorder?
    private var audioPlayer: AVAudioPlayer?
    private var recordingURL: URL?
    private var recordingStartTime: Date?
    private var durationTimer: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private override init() {
        super.init()
        setupNotifications()
    }

    // MARK: - Recording

    /// Request microphone permission
    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    /// Start recording voice
    func startRecording() async throws {
        // Request permission if needed
        let hasPermission = await requestPermission()
        guard hasPermission else {
            error = .permissionDenied
            throw WatchAudioError.permissionDenied
        }

        // Stop any ongoing playback
        stopPlayback()

        // Configure audio session for recording
        let session = AVAudioSession.sharedInstance()
        do {
            // On watchOS, use simpler audio session configuration (no .defaultToSpeaker)
            try session.setCategory(.playAndRecord, mode: .default)
            try session.setActive(true)
        } catch {
            let audioError = WatchAudioError.recordingFailed("Failed to configure audio session: \(error.localizedDescription)")
            self.error = audioError
            throw audioError
        }

        // Create temporary file URL
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "watch_voice_\(UUID().uuidString).m4a"
        let fileURL = tempDir.appendingPathComponent(fileName)
        recordingURL = fileURL

        // Configure recorder settings for voice (optimized for small size and speech recognition)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,  // 16kHz - standard for speech recognition
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,  // 32 kbps
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
            audioRecorder?.delegate = self

            guard audioRecorder?.record() == true else {
                let audioError = WatchAudioError.recordingFailed("Recorder failed to start")
                self.error = audioError
                throw audioError
            }

            isRecording = true
            recordingStartTime = Date()
            error = nil
            startDurationTimer()

            print("⌚️ WatchAudioService: Recording started")
        } catch {
            let audioError = WatchAudioError.recordingFailed(error.localizedDescription)
            self.error = audioError
            throw audioError
        }
    }

    /// Stop recording and return the result
    func stopRecording() async throws -> WatchVoiceRecordingResult {
        guard isRecording, let recorder = audioRecorder, let url = recordingURL else {
            throw WatchAudioError.noRecordingInProgress
        }

        // Stop recording
        recorder.stop()
        stopDurationTimer()

        // Calculate duration
        let duration = recordingStartTime.map { Date().timeIntervalSince($0) } ?? 0

        // Reset state
        isRecording = false
        audioRecorder = nil
        recordingStartTime = nil

        print("⌚️ WatchAudioService: Recording stopped, duration: \(duration)s")

        // Read audio data
        do {
            let audioData = try Data(contentsOf: url)

            // Clean up temp file
            try? FileManager.default.removeItem(at: url)
            recordingURL = nil

            return WatchVoiceRecordingResult(
                audioData: audioData,
                format: "m4a",
                duration: duration
            )
        } catch {
            throw WatchAudioError.recordingFailed("Failed to read audio file")
        }
    }

    /// Cancel recording without saving
    func cancelRecording() {
        guard isRecording else { return }

        audioRecorder?.stop()
        stopDurationTimer()

        // Delete temp file
        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
        }

        // Reset state
        isRecording = false
        audioRecorder = nil
        recordingURL = nil
        recordingStartTime = nil
        recordingDuration = 0

        print("⌚️ WatchAudioService: Recording cancelled")
    }

    // MARK: - Playback

    /// Play audio data (for TTS)
    /// - Parameters:
    ///   - data: Audio data to play
    ///   - audioId: Optional identifier for the audio (used to track which voice output is playing)
    func playAudio(_ data: Data, audioId: String? = nil) {
        // Stop any ongoing recording or playback
        if isRecording {
            cancelRecording()
        }
        stopPlayback()

        // Configure audio session for playback
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            self.error = .playbackFailed("Failed to configure audio session")
            return
        }

        do {
            audioPlayer = try AVAudioPlayer(data: data)
            audioPlayer?.delegate = self
            audioPlayer?.prepareToPlay()

            guard audioPlayer?.play() == true else {
                self.error = .playbackFailed("Player failed to start")
                return
            }

            isPlaying = true
            currentlyPlayingAudioId = audioId
            print("⌚️ WatchAudioService: Playback started, audioId=\(audioId ?? "nil")")
        } catch {
            self.error = .playbackFailed(error.localizedDescription)
        }
    }

    /// Stop current playback
    func stopPlayback() {
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
        currentlyPlayingAudioId = nil
    }

    /// Check if a specific audio ID is currently playing
    func isPlayingAudio(withId audioId: String) -> Bool {
        return isPlaying && currentlyPlayingAudioId == audioId
    }

    // MARK: - Private Methods

    private func setupNotifications() {
        // Listen for TTS audio notifications
        NotificationCenter.default
            .publisher(for: NSNotification.Name("WatchTTSAudioReceived"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let audioData = notification.userInfo?["audioData"] as? Data else { return }

                // Check if TTS is enabled from WatchConnectivityManager
                let ttsEnabled = WatchConnectivityManager.shared.getTTSEnabled()
                guard ttsEnabled else {
                    print("⌚️ WatchAudioService: TTS disabled, skipping playback")
                    return
                }

                // Check if auto-play should happen (only if voice command was initiated from this device)
                // This matches iOS/Android behavior where only the initiating device auto-plays TTS
                let shouldAutoPlay = notification.userInfo?["shouldAutoPlay"] as? Bool ?? false
                guard shouldAutoPlay else {
                    print("⌚️ WatchAudioService: Voice command not from this device, skipping auto-play")
                    return
                }

                // Get audioId for tracking which specific audio is playing
                let audioId = notification.userInfo?["audioId"] as? String

                Task { @MainActor in
                    guard let self = self else { return }

                    // Skip if this exact audio is already playing
                    // This prevents stopping playback when polling updates trigger
                    // the same notification to be re-posted
                    if let audioId = audioId, self.isPlayingAudio(withId: audioId) {
                        print("⌚️ WatchAudioService: Audio \(audioId) already playing, skipping")
                        return
                    }

                    self.playAudio(audioData, audioId: audioId)
                }
            }
            .store(in: &cancellables)
    }

    private func startDurationTimer() {
        recordingDuration = 0
        durationTimer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self = self, let startTime = self.recordingStartTime else { break }
                await MainActor.run {
                    self.recordingDuration = Date().timeIntervalSince(startTime)
                }
            }
        }
    }

    private func stopDurationTimer() {
        durationTimer?.cancel()
        durationTimer = nil
    }
}

// MARK: - AVAudioRecorderDelegate

extension WatchAudioService: AVAudioRecorderDelegate {
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            Task { @MainActor in
                self.error = .recordingFailed("Recording finished unsuccessfully")
            }
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor in
            self.error = .recordingFailed(error?.localizedDescription ?? "Encoding error")
        }
    }
}

// MARK: - AVAudioPlayerDelegate

extension WatchAudioService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.currentlyPlayingAudioId = nil
            print("⌚️ WatchAudioService: Playback finished")
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.isPlaying = false
            self.currentlyPlayingAudioId = nil
            self.error = .playbackFailed(error?.localizedDescription ?? "Decode error")
        }
    }
}
