/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.audio

import android.media.MediaPlayer
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Service for playing audio using MediaPlayer.
 * Mirrors the iOS AudioPlayerService.
 * Supports on-demand loading of audio from server via callback.
 */
@Singleton
class AudioPlayerService @Inject constructor() {

    companion object {
        private const val TAG = "AudioPlayerService"
    }

    private var mediaPlayer: MediaPlayer? = null
    private var tempFile: File? = null

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentMessageId = MutableStateFlow<String?>(null)
    val currentMessageId: StateFlow<String?> = _currentMessageId.asStateFlow()

    private val _progress = MutableStateFlow(0f)
    val progress: StateFlow<Float> = _progress.asStateFlow()

    // Loading state for messageIds being fetched from server
    private val _loadingMessageIds = MutableStateFlow<Set<String>>(emptySet())
    val loadingMessageIds: StateFlow<Set<String>> = _loadingMessageIds.asStateFlow()

    // In-memory cache of audio data by messageId
    private val memoryCache = mutableMapOf<String, ByteArray>()

    // Track messageIds that THIS device requested (to avoid playing on other devices)
    private val pendingRequests = mutableSetOf<String>()

    // Callback for requesting audio from server
    var onRequestAudio: ((messageId: String) -> Unit)? = null

    /**
     * Cache audio for later playback without playing.
     */
    fun cacheAudio(base64Audio: String, messageId: String) {
        try {
            val audioData = Base64.decode(base64Audio, Base64.DEFAULT)
            memoryCache[messageId] = audioData
            Log.d(TAG, "Cached audio for messageId=$messageId, size=${audioData.size}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cache audio", e)
        }
    }

    /**
     * Play audio from base64 encoded string.
     * Also caches the audio in memory if messageId is provided.
     */
    fun playAudio(base64Audio: String, messageId: String? = null) {
        try {
            val audioData = Base64.decode(base64Audio, Base64.DEFAULT)
            // Cache audio data if messageId provided
            if (messageId != null) {
                memoryCache[messageId] = audioData
            }
            playAudio(audioData, messageId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode base64 audio", e)
        }
    }

    /**
     * Play audio for a given messageId.
     * If cached, plays immediately. Otherwise requests from server.
     */
    fun playAudioForMessage(messageId: String) {
        Log.d(TAG, "playAudioForMessage: $messageId")

        // Check memory cache first
        val cachedAudio = memoryCache[messageId]
        if (cachedAudio != null) {
            Log.d(TAG, "Playing from cache: $messageId")
            playAudio(cachedAudio, messageId)
            return
        }

        // Request from server - track that THIS device requested it
        Log.d(TAG, "Requesting audio from server: $messageId")
        pendingRequests.add(messageId)
        _loadingMessageIds.value = _loadingMessageIds.value + messageId
        onRequestAudio?.invoke(messageId)
    }

    /**
     * Handle audio response from server.
     * Only plays audio if THIS device was the one that requested it.
     */
    fun handleAudioResponse(messageId: String, base64Audio: String?) {
        Log.d(TAG, "Audio response received: messageId=$messageId, hasAudio=${base64Audio != null}")

        // Remove from loading state
        _loadingMessageIds.value = _loadingMessageIds.value - messageId

        // Check if THIS device requested this audio
        val wasRequestedByThisDevice = pendingRequests.remove(messageId)

        if (base64Audio == null) {
            Log.w(TAG, "No audio data in response for $messageId")
            return
        }

        try {
            val audioData = Base64.decode(base64Audio, Base64.DEFAULT)
            // Always cache the audio for future use
            memoryCache[messageId] = audioData

            // Only auto-play if THIS device requested it
            if (wasRequestedByThisDevice) {
                Log.d(TAG, "Playing audio (requested by this device): $messageId")
                playAudio(audioData, messageId)
            } else {
                Log.d(TAG, "Caching audio only (requested by another device): $messageId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode audio response", e)
        }
    }

    /**
     * Check if audio is loading for a messageId.
     */
    fun isLoading(messageId: String): Boolean {
        return _loadingMessageIds.value.contains(messageId)
    }

    /**
     * Check if audio is cached for a messageId.
     */
    fun hasAudio(messageId: String): Boolean {
        return memoryCache.containsKey(messageId)
    }

    /**
     * Play audio from byte array.
     * TTS audio from the server is typically in MP3 format.
     */
    fun playAudio(audioData: ByteArray, messageId: String? = null) {
        // Stop any current playback
        stop()

        try {
            // Detect audio format from magic bytes
            val extension = detectAudioFormat(audioData)
            Log.d(TAG, "Detected audio format: $extension for ${audioData.size} bytes")

            // Write audio data to temp file with correct extension
            tempFile = File.createTempFile("audio_playback_", ".$extension").apply {
                deleteOnExit()
                FileOutputStream(this).use { it.write(audioData) }
            }

            Log.d(TAG, "Written audio to temp file: ${tempFile?.absolutePath}")

            // Initialize MediaPlayer
            mediaPlayer = MediaPlayer().apply {
                setDataSource(tempFile?.absolutePath)
                setOnCompletionListener {
                    Log.d(TAG, "Playback completed")
                    cleanup()
                }
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                    cleanup()
                    true
                }
                setOnPreparedListener { mp ->
                    Log.d(TAG, "MediaPlayer prepared, duration: ${mp.duration}ms")
                    mp.start()
                    _isPlaying.value = true
                }
                prepareAsync() // Use async prepare for better performance
            }

            _currentMessageId.value = messageId
            _progress.value = 0f

            Log.d(TAG, "Playback initialization started: ${audioData.size} bytes")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play audio", e)
            cleanup()
        }
    }

    /**
     * Detect audio format from magic bytes.
     * Returns file extension (mp3, m4a, wav, ogg, or mp3 as default).
     */
    private fun detectAudioFormat(data: ByteArray): String {
        if (data.size < 12) return "mp3" // Default to mp3 for TTS

        // Check for MP3 (ID3 tag or frame sync)
        if (data[0] == 0x49.toByte() && data[1] == 0x44.toByte() && data[2] == 0x33.toByte()) {
            return "mp3" // ID3v2 tag
        }
        if ((data[0].toInt() and 0xFF) == 0xFF && (data[1].toInt() and 0xE0) == 0xE0) {
            return "mp3" // MPEG frame sync
        }

        // Check for M4A/MP4 (ftyp box)
        if (data.size >= 8) {
            val ftyp = String(data.sliceArray(4..7), Charsets.US_ASCII)
            if (ftyp == "ftyp") {
                return "m4a"
            }
        }

        // Check for WAV (RIFF header)
        if (data[0] == 0x52.toByte() && data[1] == 0x49.toByte() &&
            data[2] == 0x46.toByte() && data[3] == 0x46.toByte()) {
            return "wav"
        }

        // Check for OGG (OggS magic)
        if (data[0] == 0x4F.toByte() && data[1] == 0x67.toByte() &&
            data[2] == 0x67.toByte() && data[3] == 0x53.toByte()) {
            return "ogg"
        }

        // Default to MP3 for TTS audio
        return "mp3"
    }

    /**
     * Pause playback.
     */
    fun pause() {
        mediaPlayer?.let {
            if (it.isPlaying) {
                it.pause()
                _isPlaying.value = false
                Log.d(TAG, "Playback paused")
            }
        }
    }

    /**
     * Resume playback.
     */
    fun resume() {
        mediaPlayer?.let {
            if (!it.isPlaying) {
                it.start()
                _isPlaying.value = true
                Log.d(TAG, "Playback resumed")
            }
        }
    }

    /**
     * Toggle play/pause.
     */
    fun togglePlayPause() {
        if (_isPlaying.value) {
            pause()
        } else {
            resume()
        }
    }

    /**
     * Stop playback and release resources.
     */
    fun stop() {
        mediaPlayer?.let {
            if (it.isPlaying) {
                it.stop()
            }
        }
        cleanup()
        Log.d(TAG, "Playback stopped")
    }

    /**
     * Seek to a position (0.0 to 1.0).
     */
    fun seekTo(position: Float) {
        mediaPlayer?.let {
            val duration = it.duration
            if (duration > 0) {
                val seekPosition = (position * duration).toInt()
                it.seekTo(seekPosition)
                _progress.value = position
            }
        }
    }

    /**
     * Get current playback position in milliseconds.
     */
    fun getCurrentPosition(): Int {
        return mediaPlayer?.currentPosition ?: 0
    }

    /**
     * Get total duration in milliseconds.
     */
    fun getDuration(): Int {
        return mediaPlayer?.duration ?: 0
    }

    /**
     * Update progress (call periodically from UI).
     */
    fun updateProgress() {
        mediaPlayer?.let {
            val duration = it.duration
            if (duration > 0) {
                _progress.value = it.currentPosition.toFloat() / duration
            }
        }
    }

    /**
     * Release all resources.
     */
    fun release() {
        cleanup()
    }

    private fun cleanup() {
        mediaPlayer?.release()
        mediaPlayer = null
        tempFile?.delete()
        tempFile = null
        _isPlaying.value = false
        _currentMessageId.value = null
        _progress.value = 0f
    }
}
