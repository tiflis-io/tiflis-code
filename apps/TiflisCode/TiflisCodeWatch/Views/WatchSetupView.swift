//
//  WatchSetupView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Setup view shown when no credentials are configured
/// Instructs user to sync credentials from iPhone app
struct WatchSetupView: View {
    @EnvironmentObject var appState: WatchAppState
    @EnvironmentObject var connectivityManager: WatchConnectivityManager

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // App icon
                Image("TiflisLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 40, height: 40)

                // Title
                Text("Tiflis Code")
                    .font(.headline)

                // Instructions
                Text("Open the Tiflis Code app on your iPhone and connect to your workstation first.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                // Sync status
                syncStatusView

                // Sync button
                Button {
                    connectivityManager.startCredentialSync()
                } label: {
                    HStack {
                        if isSyncing {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                        }
                        Text(syncButtonText)
                    }
                }
                .disabled(isSyncing)
                .buttonStyle(.borderedProminent)

                // Error message
                if let error = connectivityManager.credentialError {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                // Status indicators
                statusIndicators
            }
            .padding()
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
                Text("Syncing (attempt \(attempt)/5)")
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

    private var statusIndicators: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Circle()
                    .fill(connectivityManager.isPhoneReachable ? Color.green : Color.red)
                    .frame(width: 6, height: 6)
                Text(connectivityManager.isPhoneReachable ? "iPhone reachable" : "iPhone not reachable")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 8)
    }
}

#Preview {
    WatchSetupView()
        .environmentObject(WatchAppState())
        .environmentObject(WatchConnectivityManager.shared)
}
