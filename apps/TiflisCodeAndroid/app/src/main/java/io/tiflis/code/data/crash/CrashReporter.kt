/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.data.crash

import android.content.Context
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Crash reporter service that captures uncaught exceptions and saves crash logs.
 * Mirrors iOS CrashReporter functionality.
 */
@Singleton
class CrashReporter @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val crashLogFile: File
        get() = File(context.filesDir, CRASH_LOG_FILENAME)

    private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

    /**
     * Install the crash handler. Call this in Application.onCreate().
     */
    fun install() {
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            saveCrashLog(thread, throwable)
            // Call the default handler to show the crash dialog
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    /**
     * Check if a crash log exists from a previous session.
     */
    fun hasCrashLog(): Boolean {
        return crashLogFile.exists() && crashLogFile.length() > 0
    }

    /**
     * Read the crash log contents.
     */
    fun readCrashLog(): String? {
        return if (hasCrashLog()) {
            try {
                crashLogFile.readText()
            } catch (e: Exception) {
                null
            }
        } else {
            null
        }
    }

    /**
     * Delete the crash log after it has been viewed.
     */
    fun deleteCrashLog() {
        try {
            crashLogFile.delete()
        } catch (e: Exception) {
            // Ignore deletion errors
        }
    }

    private fun saveCrashLog(thread: Thread, throwable: Throwable) {
        try {
            val crashReport = buildCrashReport(thread, throwable)
            crashLogFile.writeText(crashReport)
        } catch (e: Exception) {
            // Ignore save errors - we can't do much here
        }
    }

    private fun buildCrashReport(thread: Thread, throwable: Throwable): String {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.US)
        val timestamp = dateFormat.format(Date())

        val stackTrace = StringWriter().apply {
            throwable.printStackTrace(PrintWriter(this))
        }.toString()

        return buildString {
            appendLine("=== Tiflis Code Crash Report ===")
            appendLine()
            appendLine("Timestamp: $timestamp")
            appendLine("Thread: ${thread.name} (id=${thread.id})")
            appendLine()
            appendLine("--- Device Info ---")
            appendLine("Model: ${Build.MODEL}")
            appendLine("Manufacturer: ${Build.MANUFACTURER}")
            appendLine("Brand: ${Build.BRAND}")
            appendLine("Device: ${Build.DEVICE}")
            appendLine("Product: ${Build.PRODUCT}")
            appendLine()
            appendLine("--- OS Info ---")
            appendLine("Android Version: ${Build.VERSION.RELEASE}")
            appendLine("SDK Level: ${Build.VERSION.SDK_INT}")
            appendLine("Build ID: ${Build.ID}")
            appendLine()
            appendLine("--- App Info ---")
            try {
                val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                appendLine("Package: ${context.packageName}")
                appendLine("Version Name: ${packageInfo.versionName}")
                @Suppress("DEPRECATION")
                val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageInfo.longVersionCode
                } else {
                    packageInfo.versionCode.toLong()
                }
                appendLine("Version Code: $versionCode")
            } catch (e: Exception) {
                appendLine("Package info unavailable")
            }
            appendLine()
            appendLine("--- Exception ---")
            appendLine("Type: ${throwable.javaClass.name}")
            appendLine("Message: ${throwable.message}")
            appendLine()
            appendLine("--- Stack Trace ---")
            appendLine(stackTrace)
            appendLine()
            appendLine("--- Caused By ---")
            var cause = throwable.cause
            while (cause != null) {
                appendLine("${cause.javaClass.name}: ${cause.message}")
                cause = cause.cause
            }
        }
    }

    companion object {
        private const val CRASH_LOG_FILENAME = "crash_log.txt"
    }
}
