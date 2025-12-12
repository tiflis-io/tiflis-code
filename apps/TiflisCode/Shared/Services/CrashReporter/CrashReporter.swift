//
//  CrashReporter.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation
import UIKit

/// Crash reporter that captures uncaught exceptions and signals
/// Stores crash logs to disk for later retrieval
/// Note: Uses @unchecked Sendable because crash handlers run on arbitrary threads
/// and need synchronous access to cached device info
final class CrashReporter: @unchecked Sendable {

    static let shared = CrashReporter()

    private let fileManager = FileManager.default
    private let crashLogFileName = "crash_log.txt"
    private let previousCrashLogFileName = "previous_crash_log.txt"

    // Device info cached at install time (since crash handlers run on arbitrary threads)
    private var cachedDeviceModel: String = "Unknown"
    private var cachedSystemName: String = "Unknown"
    private var cachedSystemVersion: String = "Unknown"
    private var cachedAppVersion: String = "Unknown"
    private var cachedBuildNumber: String = "Unknown"

    /// Directory for crash logs
    private var crashLogDirectory: URL {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0].appendingPathComponent("CrashLogs", isDirectory: true)
    }

    /// Current crash log file path
    private var crashLogPath: URL {
        crashLogDirectory.appendingPathComponent(crashLogFileName)
    }

    /// Previous crash log file path (from last session)
    private var previousCrashLogPath: URL {
        crashLogDirectory.appendingPathComponent(previousCrashLogFileName)
    }

    private init() {
        // Create crash log directory if needed
        try? fileManager.createDirectory(at: crashLogDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Setup

    /// Install crash handlers. Call this early in app launch.
    /// Must be called from main thread to capture device info.
    @MainActor
    func install() {
        // Cache device info while on main thread (crash handlers run on arbitrary threads)
        cachedDeviceModel = UIDevice.current.model
        cachedSystemName = UIDevice.current.systemName
        cachedSystemVersion = UIDevice.current.systemVersion
        cachedAppVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
        cachedBuildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"

        // Move current crash log to previous (if exists) - indicates we crashed last time
        moveCrashLogToPrevious()

        // Install exception handler
        NSSetUncaughtExceptionHandler { exception in
            CrashReporter.shared.handleException(exception)
        }

        // Install signal handlers for common crash signals
        installSignalHandlers()

        print("✅ CrashReporter: Installed crash handlers")
    }

    private func installSignalHandlers() {
        // Common signals that indicate crashes
        let signals: [Int32] = [
            SIGABRT,  // Abort
            SIGBUS,   // Bus error
            SIGFPE,   // Floating point exception
            SIGILL,   // Illegal instruction
            SIGSEGV,  // Segmentation violation
            SIGTRAP,  // Trap
            SIGPIPE   // Broken pipe
        ]

        for sig in signals {
            signal(sig) { signalNumber in
                CrashReporter.shared.handleSignal(signalNumber)
            }
        }
    }

    // MARK: - Crash Handling

    private func handleException(_ exception: NSException) {
        let crashReport = buildCrashReport(
            type: "Uncaught Exception",
            name: exception.name.rawValue,
            reason: exception.reason ?? "Unknown reason",
            callStack: exception.callStackSymbols
        )

        saveCrashLog(crashReport)
    }

    private func handleSignal(_ signal: Int32) {
        let signalName = signalName(for: signal)
        let callStack = Thread.callStackSymbols

        let crashReport = buildCrashReport(
            type: "Signal",
            name: signalName,
            reason: "Received signal \(signal)",
            callStack: callStack
        )

        saveCrashLog(crashReport)

        // Re-raise the signal to allow default handling (app termination)
        Darwin.signal(signal, SIG_DFL)
        Darwin.raise(signal)
    }

    private func signalName(for signal: Int32) -> String {
        switch signal {
        case SIGABRT: return "SIGABRT"
        case SIGBUS: return "SIGBUS"
        case SIGFPE: return "SIGFPE"
        case SIGILL: return "SIGILL"
        case SIGSEGV: return "SIGSEGV"
        case SIGTRAP: return "SIGTRAP"
        case SIGPIPE: return "SIGPIPE"
        default: return "SIGNAL(\(signal))"
        }
    }

    // MARK: - Report Building

    private func buildCrashReport(type: String, name: String, reason: String, callStack: [String]) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS Z"

        var report = """
        ════════════════════════════════════════════════════════════════
        TIFLIS CODE CRASH REPORT
        ════════════════════════════════════════════════════════════════

        Date: \(dateFormatter.string(from: Date()))

        CRASH TYPE
        ────────────────────────────────────────────────────────────────
        Type: \(type)
        Name: \(name)
        Reason: \(reason)

        DEVICE INFO
        ────────────────────────────────────────────────────────────────
        Device: \(cachedDeviceModel)
        System: \(cachedSystemName) \(cachedSystemVersion)
        App Version: \(cachedAppVersion)
        Build: \(cachedBuildNumber)

        CALL STACK
        ────────────────────────────────────────────────────────────────

        """

        for (index, frame) in callStack.enumerated() {
            report += "\(index): \(frame)\n"
        }

        report += """

        ════════════════════════════════════════════════════════════════
        END OF CRASH REPORT
        ════════════════════════════════════════════════════════════════
        """

        return report
    }

    // MARK: - Storage

    private func saveCrashLog(_ report: String) {
        do {
            try report.write(to: crashLogPath, atomically: true, encoding: .utf8)
            print("💾 CrashReporter: Saved crash log to \(crashLogPath.path)")
        } catch {
            print("❌ CrashReporter: Failed to save crash log: \(error)")
        }
    }

    private func moveCrashLogToPrevious() {
        guard fileManager.fileExists(atPath: crashLogPath.path) else { return }

        // Remove old previous log
        try? fileManager.removeItem(at: previousCrashLogPath)

        // Move current to previous
        do {
            try fileManager.moveItem(at: crashLogPath, to: previousCrashLogPath)
            print("📋 CrashReporter: Found crash log from previous session")
        } catch {
            print("⚠️ CrashReporter: Failed to move crash log: \(error)")
        }
    }

    // MARK: - Public API

    /// Check if there's a crash log from the previous session
    var hasPreviousCrashLog: Bool {
        fileManager.fileExists(atPath: previousCrashLogPath.path)
    }

    /// Get the crash log from the previous session
    func getPreviousCrashLog() -> String? {
        guard hasPreviousCrashLog else { return nil }
        return try? String(contentsOf: previousCrashLogPath, encoding: .utf8)
    }

    /// Clear the previous crash log
    func clearPreviousCrashLog() {
        try? fileManager.removeItem(at: previousCrashLogPath)
    }

    /// Log a non-fatal error for debugging
    func logError(_ error: Error, context: String? = nil) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"

        var message = "[\(dateFormatter.string(from: Date()))] ERROR"
        if let context = context {
            message += " (\(context))"
        }
        message += ": \(error.localizedDescription)\n"
        message += "Call stack:\n"
        for frame in Thread.callStackSymbols {
            message += "  \(frame)\n"
        }
        message += "\n"

        appendToErrorLog(message)
    }

    /// Get the error log (non-fatal errors)
    func getErrorLog() -> String? {
        let errorLogPath = crashLogDirectory.appendingPathComponent("error_log.txt")
        return try? String(contentsOf: errorLogPath, encoding: .utf8)
    }

    private func appendToErrorLog(_ message: String) {
        let errorLogPath = crashLogDirectory.appendingPathComponent("error_log.txt")

        if let handle = try? FileHandle(forWritingTo: errorLogPath) {
            handle.seekToEndOfFile()
            if let data = message.data(using: .utf8) {
                handle.write(data)
            }
            try? handle.close()
        } else {
            try? message.write(to: errorLogPath, atomically: true, encoding: .utf8)
        }
    }

    /// Clear the error log
    func clearErrorLog() {
        let errorLogPath = crashLogDirectory.appendingPathComponent("error_log.txt")
        try? fileManager.removeItem(at: errorLogPath)
    }
}
