//
//  AudioRecorderService.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import AVFoundation
import Foundation

/// Result of a voice recording session
struct VoiceRecordingResult {
    /// Base64 encoded audio data
    let audioBase64: String
    /// Audio format (m4a)
    let format: String
    /// Duration in seconds
    let duration: TimeInterval
    /// Local file URL (for playback before upload)
    let localURL: URL
}

/// Errors that can occur during audio recording
enum AudioRecorderError: Error, LocalizedError {
    case permissionDenied
    case recordingFailed(String)
    case encodingFailed
    case noRecordingInProgress

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Microphone access denied"
        case .recordingFailed(let reason):
            return "Recording failed: \(reason)"
        case .encodingFailed:
            return "Failed to encode audio"
        case .noRecordingInProgress:
            return "No recording in progress"
        }
    }
}

/// Service for recording voice messages
/// Uses AVAudioRecorder for simple, reliable voice recording
@MainActor
final class AudioRecorderService: NSObject, ObservableObject {
    // MARK: - Singleton

    static let shared = AudioRecorderService()

    // MARK: - Published State

    @Published private(set) var isRecording = false
    @Published private(set) var recordingDuration: TimeInterval = 0
    @Published private(set) var error: AudioRecorderError?

    // MARK: - Private Properties

    private var audioRecorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var recordingStartTime: Date?
    private var durationTimer: Task<Void, Never>?

    // MARK: - Initialization

    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Request microphone permission
    /// - Returns: true if permission granted
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
            throw AudioRecorderError.permissionDenied
        }

        // Configure audio session
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            let recorderError = AudioRecorderError.recordingFailed("Failed to configure audio session: \(error.localizedDescription)")
            self.error = recorderError
            throw recorderError
        }

        // Create temporary file URL
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "voice_\(UUID().uuidString).m4a"
        let fileURL = tempDir.appendingPathComponent(fileName)
        recordingURL = fileURL

        // Configure recorder settings optimized for voice/speech recognition
        // 16kHz is standard for speech-to-text (Whisper, etc.)
        // 32kbps AAC is sufficient for clear voice while minimizing file size
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,  // 16kHz - standard for speech recognition
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,  // 32 kbps - sufficient for voice
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: fileURL, settings: settings)
            audioRecorder?.delegate = self
            audioRecorder?.isMeteringEnabled = true

            guard audioRecorder?.record() == true else {
                let recorderError = AudioRecorderError.recordingFailed("Recorder failed to start")
                self.error = recorderError
                throw recorderError
            }

            isRecording = true
            recordingStartTime = Date()
            error = nil
            startDurationTimer()
        } catch {
            let recorderError = AudioRecorderError.recordingFailed(error.localizedDescription)
            self.error = recorderError
            throw recorderError
        }
    }

    /// Stop recording and return the result
    /// - Returns: VoiceRecordingResult with audio data
    func stopRecording() async throws -> VoiceRecordingResult {
        guard isRecording, let recorder = audioRecorder, let url = recordingURL else {
            throw AudioRecorderError.noRecordingInProgress
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

        // Deactivate audio session
        try? AVAudioSession.sharedInstance().setActive(false)

        // Read and encode audio data
        do {
            let audioData = try Data(contentsOf: url)
            let base64String = audioData.base64EncodedString()

            return VoiceRecordingResult(
                audioBase64: base64String,
                format: "m4a",
                duration: duration,
                localURL: url
            )
        } catch {
            throw AudioRecorderError.encodingFailed
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

        try? AVAudioSession.sharedInstance().setActive(false)
    }

    // MARK: - Private Methods

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

extension AudioRecorderService: AVAudioRecorderDelegate {
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
