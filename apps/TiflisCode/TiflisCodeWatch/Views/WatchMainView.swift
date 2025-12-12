//
//  WatchMainView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Main content view with unified session list
/// Supervisor is always at the top, followed by agent sessions
struct WatchMainView: View {
    @EnvironmentObject var appState: WatchAppState
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            WatchSessionListView(navigationPath: $navigationPath)
                .navigationDestination(for: WatchChatDestination.self) { destination in
                    WatchChatView(
                        destination: destination,
                        navigationPath: $navigationPath
                    )
                }
        }
        .onAppear {
            connectIfNeeded()
            appState.startPeriodicSync()
        }
        .onDisappear {
            appState.stopPeriodicSync()
        }
    }

    private func connectIfNeeded() {
        let credentials = appState.connectivityManager.credentials
        NSLog("⌚️ WatchMainView connectIfNeeded: hasCredentials=%d, connectionState=%@, tunnelURL=%@, tunnelId=%@",
              appState.hasCredentials ? 1 : 0,
              "\(appState.connectionState)",
              credentials?.tunnelURL ?? "nil",
              credentials?.tunnelId ?? "nil")
        if appState.hasCredentials && !appState.connectionState.isConnected {
            NSLog("⌚️ WatchMainView: triggering connect()")
            Task {
                await appState.connect()
            }
        }
    }
}

/// Navigation destination for chat views
enum WatchChatDestination: Hashable {
    case supervisor
    case agent(Session)
}

#Preview {
    WatchMainView()
        .environmentObject(WatchAppState())
}
