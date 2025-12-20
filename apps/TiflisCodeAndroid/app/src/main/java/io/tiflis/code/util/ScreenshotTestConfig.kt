/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the FSL-1.1-NC. See LICENSE file for details.
 */

package io.tiflis.code.util

import android.util.Log

/**
 * Configuration for screenshot testing mode.
 *
 * When screenshot testing is enabled:
 * - Splash screen is skipped
 * - App starts directly on Supervisor screen
 * - Test credentials are used from instrumentation args
 *
 * This mirrors the iOS SCREENSHOT_TESTING environment variable approach.
 */
object ScreenshotTestConfig {
    private const val TAG = "ScreenshotTestConfig"

    /**
     * Flag that can be set by tests before launching the activity.
     * This is the most reliable way to enable screenshot test mode.
     */
    @Volatile
    var isScreenshotTesting: Boolean = false
        private set

    /**
     * Enable screenshot testing mode. Call this from test setup
     * BEFORE launching the activity.
     */
    fun enableScreenshotTesting() {
        isScreenshotTesting = true
        Log.d(TAG, "Screenshot testing mode ENABLED")
    }

    /**
     * Disable screenshot testing mode.
     */
    fun disableScreenshotTesting() {
        isScreenshotTesting = false
        Log.d(TAG, "Screenshot testing mode DISABLED")
    }
}
