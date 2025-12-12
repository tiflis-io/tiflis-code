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
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages a persistent device ID for WebSocket identification.
 * Mirrors the iOS DeviceIDManager.
 */
@Singleton
class DeviceIdManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "DeviceIdManager"
        private const val PREFS_NAME = "device_id_storage"
        private const val KEY_DEVICE_ID = "device_id"
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
     * Get the device ID, generating one if it doesn't exist.
     * The ID is persisted across app reinstalls if possible.
     */
    fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)

        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString()
            prefs.edit()
                .putString(KEY_DEVICE_ID, deviceId)
                .apply()
            Log.d(TAG, "Generated new device ID: $deviceId")
        } else {
            Log.d(TAG, "Using existing device ID: $deviceId")
        }

        return deviceId
    }

    /**
     * Reset the device ID (for testing or debugging).
     */
    fun resetDeviceId() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .apply()
        Log.d(TAG, "Device ID reset")
    }
}
