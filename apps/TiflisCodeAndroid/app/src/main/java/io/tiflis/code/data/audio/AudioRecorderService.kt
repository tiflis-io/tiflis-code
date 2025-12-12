/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.audio

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Service for recording audio using MediaRecorder.
 * Mirrors the iOS AudioRecorderService.
 */
@Singleton
class AudioRecorderService @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "AudioRecorderService"
        private const val SAMPLE_RATE = 16000
        private const val BIT_RATE = 32000
    }

    private var mediaRecorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startTime: Long = 0

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _recordingDuration = MutableStateFlow(0L)
    val recordingDuration: StateFlow<Long> = _recordingDuration.asStateFlow()

    /**
     * Start recording audio.
     * @return true if recording started successfully
     */
    fun startRecording(): Boolean {
        if (_isRecording.value) {
            Log.w(TAG, "Already recording")
            return false
        }

        try {
            // Create output file
            outputFile = File(context.cacheDir, "voice_recording_${System.currentTimeMillis()}.m4a")

            // Initialize MediaRecorder
            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(SAMPLE_RATE)
                setAudioEncodingBitRate(BIT_RATE)
                setAudioChannels(1) // Mono
                setOutputFile(outputFile?.absolutePath)

                prepare()
                start()
            }

            startTime = System.currentTimeMillis()
            _isRecording.value = true
            _recordingDuration.value = 0

            Log.d(TAG, "Recording started: ${outputFile?.absolutePath}")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            cleanup()
            return false
        }
    }

    /**
     * Stop recording and return the audio data.
     * @return audio data as ByteArray, or null if recording failed
     */
    fun stopRecording(): ByteArray? {
        if (!_isRecording.value) {
            Log.w(TAG, "Not recording")
            return null
        }

        _recordingDuration.value = System.currentTimeMillis() - startTime

        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            mediaRecorder = null
            _isRecording.value = false

            // Read the recorded file
            val file = outputFile
            if (file != null && file.exists()) {
                val audioData = file.readBytes()
                Log.d(TAG, "Recording stopped: ${audioData.size} bytes, ${_recordingDuration.value}ms")

                // Delete temp file
                file.delete()
                outputFile = null

                return audioData
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop recording", e)
        }

        cleanup()
        return null
    }

    /**
     * Cancel recording without saving.
     */
    fun cancelRecording() {
        if (!_isRecording.value) return

        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error canceling recording", e)
        }

        cleanup()
        Log.d(TAG, "Recording cancelled")
    }

    /**
     * Get current recording duration in milliseconds.
     */
    fun getCurrentDuration(): Long {
        return if (_isRecording.value) {
            System.currentTimeMillis() - startTime
        } else {
            _recordingDuration.value
        }
    }

    private fun cleanup() {
        mediaRecorder?.release()
        mediaRecorder = null
        outputFile?.delete()
        outputFile = null
        _isRecording.value = false
        _recordingDuration.value = 0
    }
}
