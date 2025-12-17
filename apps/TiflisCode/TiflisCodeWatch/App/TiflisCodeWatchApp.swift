//
//  TiflisCodeWatchApp.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI
import os.log
@preconcurrency import WatchConnectivity

/// Unified logger for watchOS app - uses os_log which appears in Console.app
/// Filter in Console.app: subsystem:io.tiflis.TiflisCodeWatch
let watchLogger = Logger(subsystem: "io.tiflis.TiflisCodeWatch", category: "app")

@main
struct TiflisCodeWatchApp: App {
    @StateObject private var appState = WatchAppState()
    @StateObject private var connectivityManager = WatchConnectivityManager.shared

    init() {
        // Log at earliest possible moment using os_log with .error level (always visible)
        // Note: .info and .debug are filtered by default on device/simulator
        watchLogger.error("⌚️ TiflisCodeWatchApp init() - WCSession.isSupported=\(WCSession.isSupported())")

        // Also use print which sometimes works in Xcode
        print("⌚️ [WATCH] TiflisCodeWatchApp init() - WCSession.isSupported=\(WCSession.isSupported())")

        // Activate WatchConnectivity immediately in init for fastest startup
        WatchConnectivityManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(appState)
                .environmentObject(connectivityManager)
                .task {
                    // Use .error level so logs are always visible (not filtered)
                    watchLogger.error("⌚️ App .task started - hasCredentials=\(appState.hasCredentials)")
                    print("⌚️ [WATCH] App .task started - hasCredentials=\(appState.hasCredentials)")

                    // Start credential sync if needed (no delay - WatchAppState handles connection)
                    if !appState.hasCredentials {
                        watchLogger.error("⌚️ App: No credentials, starting sync with retries")
                        print("⌚️ [WATCH] No credentials, starting sync")
                        connectivityManager.startCredentialSync()
                    } else {
                        watchLogger.error("⌚️ App: Already have credentials, skipping sync")
                        print("⌚️ [WATCH] Already have credentials")
                    }
                }
        }
    }
}
