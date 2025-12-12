//
//  TiflisCodeWatchApp.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

@main
struct TiflisCodeWatchApp: App {
    @StateObject private var appState = WatchAppState()
    @StateObject private var connectivityManager = WatchConnectivityManager.shared

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(appState)
                .environmentObject(connectivityManager)
                .task {
                    // Activate WatchConnectivity after app launches
                    connectivityManager.activate()

                    // Wait for activation to complete (2 seconds is more reliable)
                    try? await Task.sleep(for: .seconds(2))

                    // Start credential sync with retry logic if needed
                    if !appState.hasCredentials {
                        NSLog("⌚️ App: No credentials after activation, starting sync with retries")
                        connectivityManager.startCredentialSync()
                    }
                }
        }
    }
}
