//
//  AudioPlayerService.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import AVFoundation
import Foundation

/// Service for playing audio (TTS responses) with server-side storage
@MainActor
final class AudioPlayerService: NSObject, ObservableObject {
    // MARK: - Singleton

    static let shared = AudioPlayerService()

    // MARK: - Published State

    @Published private(set) var isPlaying = false
    @Published private(set) var currentMessageId: String?
    @Published private(set) var playbackProgress: Double = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var isLoading = false

    // MARK: - Private Properties

    private var audioPlayer: AVAudioPlayer?
    private var progressTimer: Task<Void, Never>?
    private var pendingAudioData: Data?
    private var pendingMessageId: String?

    /// In-memory cache of audio data by messageId
    private var memoryCache: [String: Data] = [:]

    /// Pending audio requests (messageId -> completion handlers)
    private var pendingRequests: [String: [(Data?) -> Void]] = [:]

    /// Connection service for requesting audio from server
    weak var connectionService: ConnectionServicing?

    // MARK: - Initialization

    private override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Play audio from base64 encoded string
    func playAudio(base64Audio: String, messageId: String, autoPlay: Bool = true) {
        guard let audioData = Data(base64Encoded: base64Audio) else {
            print("⚠️ AudioPlayerService: Failed to decode base64 audio")
            return
        }

        playAudio(data: audioData, messageId: messageId, autoPlay: autoPlay)
    }

    /// Play audio from Data
    func playAudio(data: Data, messageId: String, autoPlay: Bool = true) {
        print("🎧 AudioPlayerService.playAudio called: messageId=\(messageId), autoPlay=\(autoPlay), dataSize=\(data.count)")

        // Cache in memory
        memoryCache[messageId] = data

        pendingAudioData = data
        pendingMessageId = messageId

        if autoPlay {
            // Don't auto-play if user is currently recording voice
            // This prevents the TTS response from being captured by the microphone
            guard !AudioRecorderService.shared.isRecording else {
                print("🔇 AudioPlayerService: Skipping auto-play - user is recording")
                return
            }
            playCurrentAudio()
        }
    }

    /// Play cached audio by messageId, requesting from server if not cached
    func playAudio(forMessageId messageId: String) {
        // Try memory cache first
        if let audioData = memoryCache[messageId] {
            pendingAudioData = audioData
            pendingMessageId = messageId
            playCurrentAudio()
            return
        }

        // Request from server
        requestAudioFromServer(messageId: messageId) { [weak self] audioData in
            guard let self = self, let audioData = audioData else {
                print("⚠️ AudioPlayerService: Failed to get audio from server")
                return
            }

            self.pendingAudioData = audioData
            self.pendingMessageId = messageId
            self.playCurrentAudio()
        }
    }

    /// Check if audio exists for a messageId (in memory cache)
    func hasAudio(forMessageId messageId: String) -> Bool {
        return memoryCache[messageId] != nil
    }

    /// Check if we're waiting for audio to load
    func isLoadingAudio(forMessageId messageId: String) -> Bool {
        return pendingRequests[messageId] != nil
    }

    /// Handle audio response from server
    func handleAudioResponse(messageId: String, audio: String?, error: String?) {
        guard let handlers = pendingRequests.removeValue(forKey: messageId) else {
            return
        }

        isLoading = false

        if let audio = audio, let audioData = Data(base64Encoded: audio) {
            // Cache the audio
            memoryCache[messageId] = audioData
            // Call all waiting handlers
            handlers.forEach { $0(audioData) }
        } else {
            print("⚠️ AudioPlayerService: Audio response error: \(error ?? "unknown")")
            handlers.forEach { $0(nil) }
        }
    }

    /// Start or resume playback of current audio
    func playCurrentAudio() {
        // Debug: log where playback is triggered from
        let callStack = Thread.callStackSymbols.prefix(10).joined(separator: "\n")
        print("🎵 AudioPlayerService.playCurrentAudio() called from:\n\(callStack)")

        guard let audioData = pendingAudioData, let messageId = pendingMessageId else {
            print("⚠️ AudioPlayerService: No audio data to play")
            return
        }

        // Stop any current playback
        stop()

        do {
            // Configure audio session for playback
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)

            // Create player
            audioPlayer = try AVAudioPlayer(data: audioData)
            audioPlayer?.delegate = self
            audioPlayer?.prepareToPlay()

            duration = audioPlayer?.duration ?? 0
            currentMessageId = messageId
            playbackProgress = 0

            // Start playback
            print("▶️ AudioPlayerService: Starting playback for messageId=\(messageId), duration=\(duration)")
            audioPlayer?.play()
            isPlaying = true
            startProgressTimer()

        } catch {
            print("⚠️ AudioPlayerService: Failed to play audio: \(error.localizedDescription)")
        }
    }

    /// Pause playback
    func pause() {
        audioPlayer?.pause()
        isPlaying = false
        stopProgressTimer()
    }

    /// Resume playback
    func resume() {
        audioPlayer?.play()
        isPlaying = true
        startProgressTimer()
    }

    /// Toggle play/pause
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else if audioPlayer != nil {
            resume()
        } else {
            playCurrentAudio()
        }
    }

    /// Stop playback completely
    func stop() {
        audioPlayer?.stop()
        audioPlayer = nil
        isPlaying = false
        playbackProgress = 0
        stopProgressTimer()
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    /// Seek to position (0.0 - 1.0)
    func seek(to progress: Double) {
        guard let player = audioPlayer else { return }
        let time = progress * player.duration
        player.currentTime = time
        playbackProgress = progress
    }

    /// Clear memory cache
    func clearCache() {
        memoryCache.removeAll()
    }

    // MARK: - Private Methods

    private func requestAudioFromServer(messageId: String, completion: @escaping (Data?) -> Void) {
        // Add to pending requests
        if pendingRequests[messageId] != nil {
            pendingRequests[messageId]?.append(completion)
            return
        }

        pendingRequests[messageId] = [completion]
        isLoading = true

        // Send request via connection service
        guard let connectionService = connectionService else {
            print("⚠️ AudioPlayerService: No connection service for audio request")
            handleAudioResponse(messageId: messageId, audio: nil, error: "No connection")
            return
        }

        let message: [String: Any] = [
            "type": "audio.request",
            "id": UUID().uuidString,
            "payload": [
                "message_id": messageId,
                "type": "output"
            ]
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: message)
            if let jsonString = String(data: data, encoding: .utf8) {
                try connectionService.sendMessage(jsonString)
                print("📤 AudioPlayerService: Requested audio for \(messageId)")
            }
        } catch {
            print("⚠️ AudioPlayerService: Failed to send audio request: \(error)")
            handleAudioResponse(messageId: messageId, audio: nil, error: error.localizedDescription)
        }
    }

    private func startProgressTimer() {
        stopProgressTimer()
        progressTimer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self = self,
                      let player = self.audioPlayer,
                      player.isPlaying else { break }
                await MainActor.run {
                    self.playbackProgress = player.currentTime / player.duration
                }
            }
        }
    }

    private func stopProgressTimer() {
        progressTimer?.cancel()
        progressTimer = nil
    }
}

// MARK: - AVAudioPlayerDelegate

extension AudioPlayerService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.playbackProgress = 1.0
            self.stopProgressTimer()
            try? AVAudioSession.sharedInstance().setActive(false)
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            print("⚠️ AudioPlayerService: Decode error: \(error?.localizedDescription ?? "unknown")")
            self.stop()
        }
    }
}
