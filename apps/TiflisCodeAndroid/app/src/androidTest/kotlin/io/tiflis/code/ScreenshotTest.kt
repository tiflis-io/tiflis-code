/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the FSL-1.1-NC. See LICENSE file for details.
 *
 * ScreenshotTest.kt
 * Automated screenshot tests for Play Store submissions.
 */

package io.tiflis.code

import android.graphics.Bitmap
import android.os.Environment
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/**
 * Screenshot tests for Play Store submission.
 *
 * These tests capture screenshots of various app states for use in Play Store.
 *
 * ## Running
 * ./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.tiflis.code.ScreenshotTest
 *
 * ## Pulling Screenshots
 * adb pull /sdcard/Pictures/screenshots ./screenshots
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
@LargeTest
class ScreenshotTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var screenshotDir: File

    @Before
    fun setup() {
        hiltRule.inject()

        // Use Pictures directory which is accessible via adb
        val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        screenshotDir = File(picturesDir, "screenshots")
        screenshotDir.mkdirs()

        println("Screenshot directory: ${screenshotDir.absolutePath}")
        println("Directory exists: ${screenshotDir.exists()}")
        println("Can write: ${screenshotDir.canWrite()}")
    }

    private fun takeScreenshot(name: String) {
        Thread.sleep(500) // Let UI settle

        try {
            val bitmap = composeTestRule.onRoot().captureToImage().asAndroidBitmap()
            val file = File(screenshotDir, "$name.png")
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            println("✅ Screenshot saved: ${file.absolutePath}")
        } catch (e: Exception) {
            println("❌ Failed to save screenshot: ${e.message}")
            e.printStackTrace()
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Screenshot Tests
    // ─────────────────────────────────────────────────────────────

    /**
     * Screenshot 1: Main screen - initial state
     */
    @Test
    fun screenshot01_MainScreen() {
        // Wait for app to load
        Thread.sleep(3000)

        takeScreenshot("01_main_screen")
    }

    /**
     * Screenshot 2: After some delay (different state)
     */
    @Test
    fun screenshot02_AppLoaded() {
        Thread.sleep(5000)

        takeScreenshot("02_app_loaded")
    }

    /**
     * Screenshot 3: Current view state
     */
    @Test
    fun screenshot03_CurrentView() {
        Thread.sleep(3000)

        takeScreenshot("03_current_view")
    }
}
