/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the FSL-1.1-NC. See LICENSE file for details.
 *
 * ScreenshotTest.kt
 * Automated screenshot tests for Play Store submissions.
 *
 * Prerequisites:
 * 1. Start screenshot test environment on port 3001:
 *    - Tunnel on port 3001
 *    - Workstation in MOCK_MODE=true
 *
 * Running tests:
 * ./gradlew connectedAndroidTest \
 *   -Pandroid.testInstrumentationRunnerArguments.class=io.tiflis.code.ScreenshotTest \
 *   -Pandroid.testInstrumentationRunnerArguments.screenshotTest=true
 *
 * Pulling screenshots:
 * adb pull /sdcard/Pictures/screenshots ./screenshots
 */

package io.tiflis.code

import android.content.Context
import android.content.Intent
import android.os.Environment
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import io.tiflis.code.data.storage.SecureStorage
import io.tiflis.code.domain.models.ConnectionCredentials
import io.tiflis.code.util.ScreenshotTestConfig
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import javax.inject.Inject

/**
 * Screenshot tests for Play Store submission.
 *
 * These tests capture screenshots of various app states for use in Play Store.
 * They connect to a mock server environment with pre-seeded data.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
@LargeTest
class ScreenshotTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createEmptyComposeRule()

    @Inject
    lateinit var secureStorage: SecureStorage

    private lateinit var screenshotDir: File
    private lateinit var device: UiDevice
    private var activityScenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setup() {
        hiltRule.inject()

        // CRITICAL: Enable screenshot testing mode BEFORE launching the activity
        // This causes the app to skip the splash screen
        ScreenshotTestConfig.enableScreenshotTesting()

        // Initialize UiDevice for taking device screenshots
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Use Pictures directory which is accessible via adb
        val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        screenshotDir = File(picturesDir, "screenshots")
        screenshotDir.mkdirs()

        println("📁 Screenshot directory: ${screenshotDir.absolutePath}")

        // Inject test credentials BEFORE launching the activity
        // For Android emulator, 10.0.2.2 maps to host's localhost
        val args = InstrumentationRegistry.getArguments()
        val tunnelUrl = args.getString("tunnelUrl") ?: "ws://10.0.2.2:3001/ws"
        val tunnelId = args.getString("tunnelId") ?: "android-screenshot-test"
        val authKey = args.getString("authKey") ?: "android-test-auth-key-32-chars!!!"

        println("🔑 Test credentials: url=$tunnelUrl, id=$tunnelId")

        // Save credentials before launching activity
        secureStorage.saveCredentials(
            ConnectionCredentials(
                tunnelUrl = tunnelUrl,
                tunnelId = tunnelId,
                authKey = authKey
            )
        )

        // Launch the activity after credentials are set
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent = Intent(context, MainActivity::class.java)
        activityScenario = ActivityScenario.launch(intent)

        // Wait for app to be ready (connection + sync)
        waitForAppReady()
    }

    @After
    fun tearDown() {
        activityScenario?.close()
        ScreenshotTestConfig.disableScreenshotTesting()
    }

    private fun takeScreenshot(name: String) {
        Thread.sleep(500) // Let UI settle

        try {
            val file = File(screenshotDir, "$name.png")
            device.takeScreenshot(file)
            println("📸 Screenshot saved: ${file.absolutePath}")
        } catch (e: Exception) {
            println("❌ Failed to save screenshot: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun waitForAppReady() {
        // Wait for compose to be idle
        composeTestRule.waitForIdle()

        // Wait for the Supervisor screen to appear
        // The app should skip splash (due to ScreenshotTestConfig) and show Supervisor
        try {
            composeTestRule.waitUntil(timeoutMillis = 30000) {
                composeTestRule.onAllNodesWithText("Supervisor", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isNotEmpty() ||
                composeTestRule.onAllNodesWithContentDescription("Menu")
                    .fetchSemanticsNodes().isNotEmpty()
            }
            println("✅ App ready - Supervisor screen visible")
        } catch (e: Exception) {
            println("⚠️ Timeout waiting for Supervisor screen: ${e.message}")
            takeScreenshot("debug_app_state_${System.currentTimeMillis()}")
        }

        // Wait for WebSocket connection to establish and sync to complete
        // This gives time for mock sessions to be loaded
        Thread.sleep(8000)
        composeTestRule.waitForIdle()

        println("✅ App initialization complete")
    }

    private fun waitForSessionsToLoad() {
        // Wait for agent sessions to appear in the drawer (from sync.state)
        try {
            composeTestRule.waitUntil(timeoutMillis = 15000) {
                composeTestRule.onAllNodesWithText("Agent Sessions", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isNotEmpty() ||
                composeTestRule.onAllNodesWithText("Claude", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isNotEmpty()
            }
            println("✅ Sessions loaded in drawer")
        } catch (e: Exception) {
            println("⚠️ Sessions not loaded yet: ${e.message}")
        }
        Thread.sleep(1000)
    }

    private fun waitForConnected() {
        // Wait for the connection to show "Connected" status
        try {
            composeTestRule.waitUntil(timeoutMillis = 15000) {
                composeTestRule.onAllNodesWithText("Connected", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isNotEmpty()
            }
            println("✅ Connection established")
        } catch (e: Exception) {
            println("⚠️ Connection status not showing Connected: ${e.message}")
        }
        Thread.sleep(500)
    }

    private fun openDrawer() {
        // Find and click the menu/hamburger button to open drawer
        try {
            composeTestRule.onNodeWithContentDescription("Menu")
                .performClick()
            composeTestRule.waitForIdle()
            Thread.sleep(800) // Wait for drawer animation
            println("✅ Drawer opened")
        } catch (e: Exception) {
            println("⚠️ Menu button not found: ${e.message}")
        }
    }

    private fun closeDrawer() {
        try {
            device.pressBack()
            composeTestRule.waitForIdle()
            Thread.sleep(500)
        } catch (e: Exception) {
            println("⚠️ Failed to close drawer: ${e.message}")
        }
    }

    /**
     * Click on a session item using UiAutomator for more reliable clicking.
     * This handles the case where the clickable is on a parent composable.
     */
    private fun clickSessionByText(text: String): Boolean {
        try {
            // Use UiAutomator to find and click the element
            val selector = By.textContains(text)
            val element = device.wait(Until.findObject(selector), 5000)
            if (element != null) {
                element.click()
                Thread.sleep(500)
                composeTestRule.waitForIdle()
                println("✅ Clicked on session: $text")
                return true
            } else {
                println("⚠️ Session not found: $text")
            }
        } catch (e: Exception) {
            println("⚠️ Failed to click session '$text': ${e.message}")
        }
        return false
    }

    // ─────────────────────────────────────────────────────────────
    // Screenshot Tests
    // ─────────────────────────────────────────────────────────────

    /**
     * Screenshot 1: Navigation drawer with all sessions
     */
    @Test
    fun test01_Navigation() {
        openDrawer()
        waitForSessionsToLoad()
        Thread.sleep(1000) // Extra wait for drawer to render fully

        takeScreenshot("01_Navigation")
    }

    /**
     * Screenshot 2: Supervisor chat with voice messages
     */
    @Test
    fun test02_SupervisorChat() {
        // Should already be on Supervisor screen after launch
        // Wait for chat history to load from mock
        Thread.sleep(2000)

        takeScreenshot("02_SupervisorChat")
    }

    /**
     * Screenshot 3: Agent chat (Claude Code) with code blocks
     */
    @Test
    fun test03_AgentChat() {
        openDrawer()
        waitForSessionsToLoad()

        // Click on Claude Code session using UiAutomator
        if (clickSessionByText("Claude Code")) {
            // Wait for navigation and chat to load
            Thread.sleep(2500)
            composeTestRule.waitForIdle()
        } else {
            // Fallback: try clicking "Claude"
            if (clickSessionByText("Claude")) {
                Thread.sleep(2500)
                composeTestRule.waitForIdle()
            } else {
                println("⚠️ Could not navigate to Claude session")
                closeDrawer()
            }
        }

        takeScreenshot("03_AgentChat")
    }

    /**
     * Screenshot 4: Terminal session
     */
    @Test
    fun test04_Terminal() {
        openDrawer()
        waitForSessionsToLoad()

        // Click on Terminal session using UiAutomator
        // Need to scroll down and click specifically on the Terminal item (not "Terminals" header)
        try {
            // First scroll the drawer to make sure Terminal is visible
            val drawer = device.wait(Until.findObject(By.textContains("Terminals")), 3000)
            if (drawer != null) {
                // Find the actual Terminal session item (has "~" subtitle)
                val terminalItem = device.wait(Until.findObject(By.text("Terminal")), 3000)
                if (terminalItem != null) {
                    terminalItem.click()
                    Thread.sleep(500)
                    composeTestRule.waitForIdle()

                    // Wait for terminal to fully render and loading overlay to disappear
                    try {
                        composeTestRule.waitUntil(timeoutMillis = 15000) {
                            // Wait until "Loading terminal" text is no longer visible
                            composeTestRule.onAllNodesWithText("Loading", substring = true, ignoreCase = true)
                                .fetchSemanticsNodes().isEmpty()
                        }
                        println("✅ Terminal loaded (no loading overlay)")
                    } catch (e: Exception) {
                        println("⚠️ Terminal still showing loading state, taking screenshot anyway")
                    }

                    Thread.sleep(1000)
                    composeTestRule.waitForIdle()
                    println("✅ Navigated to Terminal session")
                } else {
                    println("⚠️ Terminal item not found")
                    closeDrawer()
                }
            } else {
                println("⚠️ Terminals section not found")
                closeDrawer()
            }
        } catch (e: Exception) {
            println("⚠️ Failed to navigate to Terminal: ${e.message}")
            closeDrawer()
        }

        takeScreenshot("04_Terminal")
    }

    /**
     * Screenshot 5: Settings screen
     */
    @Test
    fun test05_Settings() {
        openDrawer()
        Thread.sleep(500)

        // Click on Settings using UiAutomator
        if (clickSessionByText("Settings")) {
            // Wait for settings to load and connection to establish
            // Give extra time for WebSocket authentication to complete
            Thread.sleep(5000)
            composeTestRule.waitForIdle()
        } else {
            println("⚠️ Could not navigate to Settings")
            closeDrawer()
        }

        takeScreenshot("05_Settings")
    }
}
