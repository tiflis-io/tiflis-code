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
    @EnvironmentObject var connectivityManager: WatchConnectivityManager

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            // App icon
            Image("TiflisLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)

            // Title
            Text("Tiflis Code")
                .font(.headline)

            // Call to action
            Text("Connect on iPhone first")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Spacer()

            // Sync button
            Button {
                connectivityManager.startCredentialSync()
            } label: {
                Text("Sync")
            }
            .buttonStyle(.borderedProminent)
            .tint(.accentColor)
        }
        .padding()
    }
}

#Preview {
    WatchSetupView()
        .environmentObject(WatchConnectivityManager.shared)
}
