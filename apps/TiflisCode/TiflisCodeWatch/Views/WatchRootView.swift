//
//  WatchRootView.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import SwiftUI

/// Root view that shows either setup or main content based on credentials
struct WatchRootView: View {
    @EnvironmentObject var appState: WatchAppState

    var body: some View {
        Group {
            if appState.hasCredentials {
                WatchMainView()
            } else {
                WatchSetupView()
            }
        }
    }
}

#Preview {
    WatchRootView()
        .environmentObject(WatchAppState())
}
