/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.storage

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.tiflis.code.domain.models.ConnectionCredentials
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Secure storage for sensitive data using EncryptedSharedPreferences.
 * Mirrors the iOS KeychainManager.
 */
@Singleton
class SecureStorage @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "SecureStorage"
        private const val PREFS_NAME = "secure_storage"

        private const val KEY_TUNNEL_URL = "tunnel_url"
        private const val KEY_TUNNEL_ID = "tunnel_id"
        private const val KEY_AUTH_KEY = "auth_key"
        private const val KEY_TTS_ENABLED = "tts_enabled"
        private const val KEY_SPEECH_LANGUAGE = "speech_language"
        private const val DEFAULT_SPEECH_LANGUAGE = "en-US"
    }

    private val prefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create encrypted prefs, falling back to regular prefs", e)
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    /**
     * Save connection credentials.
     */
    fun saveCredentials(credentials: ConnectionCredentials) {
        prefs.edit()
            .putString(KEY_TUNNEL_URL, credentials.tunnelUrl)
            .putString(KEY_TUNNEL_ID, credentials.tunnelId)
            .putString(KEY_AUTH_KEY, credentials.authKey)
            .apply()

        Log.d(TAG, "Credentials saved")
    }

    /**
     * Get stored connection credentials.
     * Returns null if any credential is missing.
     */
    fun getCredentials(): ConnectionCredentials? {
        val url = prefs.getString(KEY_TUNNEL_URL, null)
        val id = prefs.getString(KEY_TUNNEL_ID, null)
        val key = prefs.getString(KEY_AUTH_KEY, null)

        if (url == null || id == null || key == null) {
            Log.d(TAG, "No complete credentials found")
            return null
        }

        return ConnectionCredentials(
            tunnelUrl = url,
            tunnelId = id,
            authKey = key
        )
    }

    /**
     * Check if credentials are stored.
     */
    fun hasCredentials(): Boolean {
        return getCredentials() != null
    }

    /**
     * Clear all stored credentials.
     */
    fun clearCredentials() {
        prefs.edit()
            .remove(KEY_TUNNEL_URL)
            .remove(KEY_TUNNEL_ID)
            .remove(KEY_AUTH_KEY)
            .apply()

        Log.d(TAG, "Credentials cleared")
    }

    /**
     * Get TTS enabled setting.
     */
    fun getTtsEnabled(): Boolean {
        return prefs.getBoolean(KEY_TTS_ENABLED, true)
    }

    /**
     * Set TTS enabled setting.
     */
    fun setTtsEnabled(enabled: Boolean) {
        prefs.edit()
            .putBoolean(KEY_TTS_ENABLED, enabled)
            .apply()
    }

    /**
     * Get speech language setting.
     */
    fun getSpeechLanguage(): String {
        return prefs.getString(KEY_SPEECH_LANGUAGE, DEFAULT_SPEECH_LANGUAGE) ?: DEFAULT_SPEECH_LANGUAGE
    }

    /**
     * Set speech language setting.
     */
    fun setSpeechLanguage(language: String) {
        prefs.edit()
            .putString(KEY_SPEECH_LANGUAGE, language)
            .apply()
    }
}
