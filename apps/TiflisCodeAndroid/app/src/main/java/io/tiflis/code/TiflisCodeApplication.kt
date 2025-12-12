/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Main application class for TiflisCode Android app.
 * Initializes Hilt dependency injection.
 */
@HiltAndroidApp
class TiflisCodeApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Application-level initialization can go here
    }
}
