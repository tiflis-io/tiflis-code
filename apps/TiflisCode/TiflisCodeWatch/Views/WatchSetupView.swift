//
//  WatchSetupView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI
@preconcurrency import WatchConnectivity

/// Setup view shown when no credentials are configured
/// Instructs user to sync credentials from iPhone app
struct WatchSetupView: View {
    @EnvironmentObject var appState: WatchAppState
    @EnvironmentObject var connectivityManager: WatchConnectivityManager

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // App icon
                Image("TiflisLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 36, height: 36)

                // Title
                Text("Tiflis Code")
                    .font(.headline)

                // Instructions - simplified
                Text("Connect on iPhone first")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                // Sync status
                syncStatusView

                // Sync button
                Button {
                    connectivityManager.startCredentialSync()
                } label: {
                    Text(syncButtonText)
                }
                .disabled(isSyncing)
                .buttonStyle(.borderedProminent)

                // Status indicator - simplified
                HStack(spacing: 4) {
                    Circle()
                        .fill(connectivityManager.isPhoneReachable ? Color.green : Color.orange)
                        .frame(width: 6, height: 6)
                    Text(connectivityManager.isPhoneReachable ? "iPhone ready" : "Open iPhone app")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                // Debug section
                #if DEBUG
                Divider()
                    .padding(.vertical, 4)

                VStack(spacing: 4) {
                    Text("Debug Info")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    // Show activation state
                    Text("WC: \(activationStateText)")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)

                    // Show context key count
                    Text("Ctx: \(contextKeyCount) keys")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)

                    // Show App Group key count
                    Text("AG: \(appGroupKeyCount)/3 keys")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(appGroupKeyCount == 3 ? .green : .secondary)

                    Button {
                        connectivityManager.checkApplicationContext()
                    } label: {
                        Text("Check All")
                            .font(.caption2)
                    }
                    .buttonStyle(.bordered)
                }
                #endif
            }
            .padding(.horizontal, 8)
        }
        .onAppear {
            // Auto-start sync when setup view appears
            NSLog("⌚️ WatchSetupView appeared, starting credential sync")
            if !connectivityManager.hasCredentials {
                connectivityManager.startCredentialSync()
            }
        }
    }

    // MARK: - Computed Properties

    private var isSyncing: Bool {
        if case .syncing = connectivityManager.syncState {
            return true
        }
        return false
    }

    private var syncButtonText: String {
        switch connectivityManager.syncState {
        case .syncing:
            return "Syncing..."
        case .error:
            return "Retry Sync"
        default:
            return "Sync from iPhone"
        }
    }

    #if DEBUG
    private var activationStateText: String {
        connectivityManager.activationStateDescription
    }

    private var contextKeyCount: Int {
        connectivityManager.receivedContextKeyCount
    }

    private var appGroupKeyCount: Int {
        connectivityManager.sharedDefaultsKeyCount
    }
    #endif

    // MARK: - Subviews

    @ViewBuilder
    private var syncStatusView: some View {
        switch connectivityManager.syncState {
        case .idle:
            EmptyView()
        case .syncing(let attempt):
            HStack(spacing: 4) {
                ProgressView()
                    .scaleEffect(0.6)
                Text("Syncing (\(attempt)/8)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        case .error(let message):
            Text(message)
                .font(.caption2)
                .foregroundStyle(.orange)
                .multilineTextAlignment(.center)
        case .success:
            EmptyView()  // Will transition to main view
        }
    }

}

#Preview {
    WatchSetupView()
        .environmentObject(WatchAppState())
        .environmentObject(WatchConnectivityManager.shared)
}
